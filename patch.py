#!/usr/bin/env python3
"""
apply_geo_hierarchy_patch.py
==============================

Fourth-round patch for the TzCRVS / ADLCS project, layered on top of the
previous patches (camera/env/responsive, camera-compress/marriage-cert,
nin-step3-fix). Safe to re-run (idempotent).

WHAT THIS ADDS
--------------
A full Region → District → Ward → Village/Street cascading picker for the
Birth Registration flow (and the web dashboard's officer-creation form),
backed by new shared backend endpoints and a schema update.

WHY THIS MATTERS (the actual problem being solved):
A family can be temporarily away from their home area — working a harvest,
construction, or other seasonal/labour job in a different region — when a
birth happens. If the hospital only recorded its own facility's region, the
child's record would misleadingly show the hospital's region as "home",
even though the family lives somewhere else entirely. This patch captures
the family's ACTUAL home village/street directly from the parents,
independent of where the birth took place.

1. Schema (code/backend/prisma/schema.prisma)
   - Village gets `@@unique([wardId, name])`: a village/street name must be
     unique WITHIN its ward, but the same name can recur across different
     wards (e.g. many wards have a village called "Kati") — this is what
     "no two villages in a ward share a name, but different wards can"
     means in practice.
   - Birth gets a new `originVillageId` (+ relation to Village): the
     family's home village/street, captured at the hospital, kept
     completely separate from `facilityId` (the hospital's own location).

   NOTE ON UNUSED TABLES: while implementing this, `PopulationSnapshot` and
   `CitizenChild` were found to have zero references anywhere in
   src/routes/*.js — they appear to be schema-only leftovers from dropped
   functionality. This patch does NOT drop them (that needs a reviewed
   migration against your actual data, not a scripted schema change) —
   flagging it here so you can decide whether to remove them later.

2. Backend — new shared geo endpoints (code/backend/src/routes/geo.js)
   - GET  /api/geo/regions
   - GET  /api/geo/districts?regionId=
   - GET  /api/geo/wards?districtId=
   - GET  /api/geo/villages?wardId=&type=village|street
   - POST /api/geo/villages  { wardId, name, type }  — get-or-create,
     case-insensitive, race-safe (falls back to the row that won on a
     unique-constraint collision instead of erroring).
   Mounted at /api/geo for ANY authenticated role — unlike the existing
   /api/admin/geo/* endpoints, which are restricted to super_admin /
   district_admin and unreachable from the Hospital/Village Officer mobile
   app. This is why a new route file was needed instead of reusing the
   admin one.

   Once a village/street is created for a ward this way, it immediately
   shows up as a normal dropdown option for every subsequent registration
   in that same ward — "enter manually the first time, dropdown after
   that" — because it's now a real row linked to that ward.

3. Backend — Birth sync + population dashboard
   - POST /api/officer/birth/sync now accepts and stores `originVillageId`.
   - GET /api/admin/population now merges in "pre-citizen" population
     (children under 18 with a birth record but no NIN/Citizen yet) scoped
     through Birth.originVillageId, using the same region/district/ward/
     village query params as the citizen-only version did before. This is
     what makes "even citizens below 18+ must be shown, actually all pop
     data" true when filtering the dashboard by village.

4. Mobile — GeoCascadePicker component
   (code/mobile/src/components/GeoCascadePicker.tsx)
   - Reusable cascading picker: Region → District → Ward are plain
     searchable dropdowns; the final Village/Street level is the same
     dropdown UI PLUS a "+ Add new village/street" flow that calls the
     get-or-create endpoint when the officer's location isn't listed yet.
   - Wired into RegisterBirthScreen.tsx's Child Information step as
     "Family's Home Area (Origin)", required before submission, and its
     resulting villageId is sent as `originVillageId` on birth sync.

5. Web — Village Officer creation form
   (code/web/src/modals/NewRegistrationModal.jsx)
   - Added the same "village/street not listed? Add new" manual-entry
     fallback to the existing Ward/Village dropdowns, calling the new
     shared POST /api/geo/villages endpoint (apiCreateVillage in
     admin.api.js) instead of requiring the village to already exist.

USAGE
-----
    python3 apply_geo_hierarchy_patch.py [--root /path/to/project]

AFTER RUNNING — DATABASE MIGRATION REQUIRED:
This patch changes prisma/schema.prisma (new unique constraint + new
column + new relation). You must generate and run a migration before the
new fields/endpoints will work against your database:

    cd code/backend
    npx prisma migrate dev --name add_village_unique_and_birth_origin
    npx prisma generate

If any existing (ward_id, name) rows already violate the new uniqueness
constraint (duplicate village names within the same ward from earlier
manual entry / seed data), migrate will fail until those duplicates are
resolved — check for `SELECT ward_id, name, count(*) FROM villages GROUP
BY ward_id, name HAVING count(*) > 1;` first if that happens.
"""

from __future__ import annotations

import argparse
from pathlib import Path


def find_project_root(explicit):
    candidates = []
    if explicit:
        candidates.append(Path(explicit).expanduser().resolve())
    candidates += [
        Path.cwd(),
        Path.cwd() / "ADLCS-main",
        Path.home() / "ADLCS",
        Path.home() / "ADLCS-main",
    ]
    for c in candidates:
        if (c / "code" / "mobile" / "package.json").exists():
            return c
    for p in Path.cwd().rglob("package.json"):
        if p.parent.name == "mobile" and (p.parent.parent / "web").exists():
            return p.parent.parent.parent
    raise SystemExit(
        "Could not locate the project root (expected <root>/code/mobile/package.json).\n"
        "Re-run with --root /path/to/your/project."
    )


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def replace_once(path: Path, old: str, new: str, label: str) -> bool:
    """Replace `old` with `new`. Checks for `new` first so re-runs are
    idempotent even when `new` contains `old` as a substring."""
    if not path.exists():
        print(f"  [WARN] {label}: {path} not found — skipping.")
        return False
    text = read(path)
    if new in text:
        print(f"  [skip] {label} (already applied)")
        return False
    if old in text:
        text = text.replace(old, new, 1)
        write(path, text)
        print(f"  [OK] {label}")
        return True
    print(f"  [WARN] {label}: expected text not found — file may have changed; skipping.")
    return False


def create_if_missing(path: Path, content: str, label: str) -> None:
    if path.exists():
        print(f"  [skip] {label} (already exists)")
        return
    write(path, content)
    print(f"  [OK] created {label}")

GEO_JS = """/**
 * geo.js — Shared Geography Hierarchy Routes  v1.0
 *
 * Region → District → Ward → Village/Street, available to ANY authenticated
 * role (hospital officer, village officer, district admin, super admin) —
 * unlike /api/admin/geo/*, which is restricted to super_admin/district_admin
 * and can't be reached by the mobile app's Hospital/Village Officer forms.
 *
 * GET  /api/geo/regions
 * GET  /api/geo/districts          — ?regionId=
 * GET  /api/geo/wards              — ?districtId=
 * GET  /api/geo/villages           — ?wardId=  (optional &type=village|street)
 * POST /api/geo/villages           — get-or-create { wardId, name, type }
 *
 * WHY get-or-create matters:
 * A village/street is entered manually the first time a Hospital or Village
 * Officer encounters it for a given ward (it won't be seeded in the DB in
 * advance for every ward in the country). Once created, it's linked
 * directly to its ward, so every subsequent registration in that same ward
 * sees it as a normal dropdown option instead of needing to be re-typed —
 * and a Prisma `@@unique([wardId, name])` constraint on Village guarantees
 * one canonical row per (ward, name) pair, so two officers typing the same
 * village name for the same ward converge on the same row instead of
 * creating duplicates. The same name IS allowed to exist in a different
 * ward (e.g. many wards have a village called "Kati").
 */

const { Router } = require('express')
const { prisma } = require('../lib/prisma')
const { requireAuth } = require('../middleware/auth')

const router = Router()
router.use(requireAuth)

// ── GET /api/geo/regions ────────────────────────────────────────────────────
router.get('/regions', async (req, res) => {
  try {
    const regions = await prisma.region.findMany({
      select: { id: true, name: true, jurisdiction: true },
      orderBy: { name: 'asc' },
    })
    return res.json({ success: true, data: regions })
  } catch (err) {
    console.error('[geo/regions]', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
})

// ── GET /api/geo/districts?regionId= ────────────────────────────────────────
router.get('/districts', async (req, res) => {
  const regionId = Number(req.query.regionId) || undefined
  if (!regionId) {
    return res.status(400).json({ success: false, message: 'regionId query param required' })
  }
  try {
    const districts = await prisma.district.findMany({
      where: { regionId },
      select: { id: true, name: true, regionId: true },
      orderBy: { name: 'asc' },
    })
    return res.json({ success: true, data: districts })
  } catch (err) {
    console.error('[geo/districts]', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
})

// ── GET /api/geo/wards?districtId= ──────────────────────────────────────────
router.get('/wards', async (req, res) => {
  const districtId = Number(req.query.districtId) || undefined
  if (!districtId) {
    return res.status(400).json({ success: false, message: 'districtId query param required' })
  }
  try {
    const wards = await prisma.ward.findMany({
      where: { districtId },
      select: { id: true, name: true, districtId: true },
      orderBy: { name: 'asc' },
    })
    return res.json({ success: true, data: wards })
  } catch (err) {
    console.error('[geo/wards]', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
})

// ── GET /api/geo/villages?wardId=&type= ─────────────────────────────────────
router.get('/villages', async (req, res) => {
  const wardId = Number(req.query.wardId) || undefined
  const { type } = req.query // optional: 'village' | 'street'
  if (!wardId) {
    return res.status(400).json({ success: false, message: 'wardId query param required' })
  }
  try {
    const villages = await prisma.village.findMany({
      where: {
        wardId,
        ...(type === 'village' || type === 'street' ? { type } : {}),
      },
      select: { id: true, name: true, wardId: true, type: true },
      orderBy: { name: 'asc' },
    })
    return res.json({ success: true, data: villages })
  } catch (err) {
    console.error('[geo/villages]', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
})

// ── POST /api/geo/villages ──────────────────────────────────────────────────
// Get-or-create a village/street within a ward. Case-insensitive match on
// name so "Kati", "kati", and "KATI" all resolve to the same row.
router.post('/villages', async (req, res) => {
  const { wardId, name, type } = req.body
  const wardIdNum = Number(wardId)
  const cleanName = typeof name === 'string' ? name.trim() : ''
  const cleanType = type === 'street' ? 'street' : 'village'

  if (!wardIdNum || !cleanName) {
    return res.status(400).json({ success: false, message: 'wardId and name are required' })
  }
  if (cleanName.length > 80) {
    return res.status(400).json({ success: false, message: 'name must be 80 characters or fewer' })
  }

  try {
    const ward = await prisma.ward.findUnique({ where: { id: wardIdNum }, select: { id: true } })
    if (!ward) {
      return res.status(404).json({ success: false, message: 'Ward not found' })
    }

    // Case-insensitive lookup first — the @@unique([wardId, name]) constraint
    // is case-sensitive at the DB level, so we check manually to avoid
    // creating "Kati" and "kati" as two rows for the same ward.
    const existing = await prisma.village.findFirst({
      where: { wardId: wardIdNum, name: { equals: cleanName, mode: 'insensitive' } },
      select: { id: true, name: true, wardId: true, type: true },
    })
    if (existing) {
      return res.json({ success: true, data: existing, created: false })
    }

    const created = await prisma.village.create({
      data: { wardId: wardIdNum, name: cleanName, type: cleanType },
      select: { id: true, name: true, wardId: true, type: true },
    })
    return res.json({ success: true, data: created, created: true })
  } catch (err) {
    // Race condition: two officers submit the same new village at the same
    // instant — the unique constraint catches it, so fetch and return the
    // row that won instead of erroring out.
    if (err.code === 'P2002') {
      const winner = await prisma.village.findFirst({
        where: { wardId: wardIdNum, name: { equals: cleanName, mode: 'insensitive' } },
        select: { id: true, name: true, wardId: true, type: true },
      })
      if (winner) return res.json({ success: true, data: winner, created: false })
    }
    console.error('[geo/villages POST]', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
})

module.exports = router
"""

GEO_CASCADE_PICKER_TSX = """/**
 * GeoCascadePicker.tsx — Region → District → Ward → Village/Street
 *
 * Reusable cascading location picker:
 *   - Region, District, Ward are strict dropdowns (bottom-sheet list,
 *     searchable) sourced from GET /geo/{regions,districts,wards}.
 *     Choosing a parent resets/reloads the child level.
 *   - Village/Street is the same dropdown UI, but backed by
 *     GET /geo/villages?wardId=... for existing entries, PLUS a
 *     "+ Add new village/street" row at the bottom of the list that lets
 *     the officer type a name that doesn't exist yet for that ward. On
 *     confirm it calls POST /geo/villages (get-or-create, case-insensitive,
 *     unique per ward) and selects the returned village — so the very next
 *     registration in that same ward sees it as a normal dropdown option.
 *
 * WHY this exists (not just typed free text for everything):
 * A family may be temporarily away from their home area (seasonal/labour
 * migration) when a birth or registration happens, so the officer needs to
 * record the family's ACTUAL home village — which may be nowhere near the
 * facility/office they're standing in. A full region→district→ward→village
 * cascade, not just "type your village", is what makes that origin
 * unambiguous and queryable later (e.g. filtering the population dashboard
 * by village, including people/records not yet linked to a Citizen).
 *
 * Usage:
 *   const [geo, setGeo] = useState<GeoSelection>(emptyGeoSelection())
 *   <GeoCascadePicker value={geo} onChange={setGeo} villageLabel="Village / Street of Origin" />
 *   // geo.villageId is what you send to the backend once all 4 levels are set.
 */
import React, { useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  FlatList,
  ActivityIndicator,
} from 'react-native'
import { ChevronDown, X, Search, MapPin, Plus } from 'lucide-react-native'
import { useTheme, TZ } from '../context/ThemeContext'
import { apiGet, apiPost } from '../services/syncService'

export interface GeoOption {
  id: number
  name: string
  type?: 'village' | 'street'
}

export interface GeoSelection {
  regionId: number | null
  regionName: string
  districtId: number | null
  districtName: string
  wardId: number | null
  wardName: string
  villageId: number | null
  villageName: string
  villageType: 'village' | 'street'
}

export function emptyGeoSelection(): GeoSelection {
  return {
    regionId: null,
    regionName: '',
    districtId: null,
    districtName: '',
    wardId: null,
    wardName: '',
    villageId: null,
    villageName: '',
    villageType: 'village',
  }
}

export function isGeoSelectionComplete(geo: GeoSelection): boolean {
  return !!(geo.regionId && geo.districtId && geo.wardId && geo.villageId)
}

// ── Generic bottom-sheet select list (search + tap) ─────────────────────────
function SelectSheet({
  visible,
  title,
  options,
  loading,
  onSelect,
  onClose,
  allowManualEntry,
  manualLabel,
  onManualSubmit,
  manualBusy,
}: {
  visible: boolean
  title: string
  options: GeoOption[]
  loading: boolean
  onSelect: (opt: GeoOption) => void
  onClose: () => void
  allowManualEntry?: boolean
  manualLabel?: string
  onManualSubmit?: (name: string) => void
  manualBusy?: boolean
}) {
  const { theme: T } = useTheme()
  const [query, setQuery] = useState('')
  const [manualName, setManualName] = useState('')
  const [showManual, setShowManual] = useState(false)

  useEffect(() => {
    if (!visible) {
      setQuery('')
      setManualName('')
      setShowManual(false)
    }
  }, [visible])

  const filtered = options.filter((o) => o.name.toLowerCase().includes(query.trim().toLowerCase()))

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.65)' }}>
        <View
          style={{
            backgroundColor: T.card,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            padding: 20,
            paddingBottom: 36,
            maxHeight: '75%',
          }}
        >
          <View
            style={{
              width: 40,
              height: 4,
              backgroundColor: T.border,
              borderRadius: 2,
              alignSelf: 'center',
              marginBottom: 16,
            }}
          />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <MapPin size={15} color={TZ.green} />
            <Text style={{ flex: 1, fontSize: 15, fontWeight: '800', color: T.text }}>{title}</Text>
            <TouchableOpacity onPress={onClose}>
              <X size={17} color={T.textSub} />
            </TouchableOpacity>
          </View>

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              backgroundColor: T.card2,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: T.border,
              paddingHorizontal: 12,
              marginBottom: 10,
            }}
          >
            <Search size={14} color={T.textDim} />
            <TextInput
              style={{ flex: 1, paddingVertical: 10, color: T.text, fontSize: 13 }}
              value={query}
              onChangeText={setQuery}
              placeholder="Search…"
              placeholderTextColor={T.textDim}
            />
          </View>

          {loading ? (
            <View style={{ paddingVertical: 30, alignItems: 'center' }}>
              <ActivityIndicator color={TZ.green} />
            </View>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(item) => String(item.id)}
              style={{ maxHeight: 320 }}
              ListEmptyComponent={
                <Text style={{ textAlign: 'center', color: T.textDim, fontSize: 12, paddingVertical: 20 }}>
                  No matches found.
                </Text>
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => onSelect(item)}
                  style={{
                    paddingVertical: 12,
                    paddingHorizontal: 10,
                    borderBottomWidth: 1,
                    borderBottomColor: T.border,
                  }}
                >
                  <Text style={{ fontSize: 14, color: T.text, fontWeight: '600' }}>
                    {item.name}
                    {item.type ? (
                      <Text style={{ fontSize: 10, color: T.textDim }}>
                        {'  '}({item.type === 'street' ? 'Street' : 'Village'})
                      </Text>
                    ) : null}
                  </Text>
                </TouchableOpacity>
              )}
            />
          )}

          {allowManualEntry && (
            <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: T.border, paddingTop: 12 }}>
              {!showManual ? (
                <TouchableOpacity
                  onPress={() => setShowManual(true)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    paddingVertical: 11,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: `${TZ.green}60`,
                    backgroundColor: `${TZ.green}12`,
                  }}
                >
                  <Plus size={14} color={TZ.green} />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: TZ.green }}>
                    {manualLabel ?? "Can't find it? Add new"}
                  </Text>
                </TouchableOpacity>
              ) : (
                <View style={{ gap: 8 }}>
                  <Text style={{ fontSize: 11, color: T.textSub }}>
                    Ask the parents/officer for the exact name, then enter it below. It will be
                    saved and appear as a dropdown option for everyone next time.
                  </Text>
                  <TextInput
                    style={{
                      backgroundColor: T.card2,
                      borderWidth: 1,
                      borderColor: T.border,
                      borderRadius: 10,
                      paddingHorizontal: 14,
                      paddingVertical: 11,
                      color: T.text,
                      fontSize: 14,
                    }}
                    value={manualName}
                    onChangeText={setManualName}
                    placeholder="e.g. Kati"
                    placeholderTextColor={T.textDim}
                    autoCapitalize="words"
                  />
                  <TouchableOpacity
                    disabled={!manualName.trim() || manualBusy}
                    onPress={() => onManualSubmit?.(manualName.trim())}
                    style={{
                      paddingVertical: 12,
                      borderRadius: 10,
                      alignItems: 'center',
                      backgroundColor: manualName.trim() ? TZ.green : T.card2,
                    }}
                  >
                    {manualBusy ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: '800',
                          color: manualName.trim() ? '#fff' : T.textDim,
                        }}
                      >
                        Use This Name
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
        </View>
      </View>
    </Modal>
  )
}

// ── One "field row" — label + tappable box that opens a SelectSheet ────────
function FieldRow({
  label,
  value,
  placeholder,
  disabled,
  onPress,
}: {
  label: string
  value: string
  placeholder: string
  disabled?: boolean
  onPress: () => void
}) {
  const { theme: T } = useTheme()
  return (
    <View>
      <Text style={{ fontSize: 12, fontWeight: '600', color: T.textSub, marginBottom: 6 }}>
        {label}
      </Text>
      <TouchableOpacity
        onPress={onPress}
        disabled={disabled}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: disabled ? T.card2 : T.card2,
          opacity: disabled ? 0.5 : 1,
          borderWidth: 1,
          borderColor: T.border,
          borderRadius: 10,
          paddingHorizontal: 14,
          paddingVertical: 12,
        }}
      >
        <Text style={{ color: value ? T.text : T.textDim, fontSize: 14 }}>
          {value || placeholder}
        </Text>
        <ChevronDown size={16} color={T.textDim} />
      </TouchableOpacity>
    </View>
  )
}

// ── Main component ───────────────────────────────────────────────────────────
export default function GeoCascadePicker({
  value,
  onChange,
  villageLabel = 'Village / Street',
}: {
  value: GeoSelection
  onChange: (geo: GeoSelection) => void
  villageLabel?: string
}) {
  const [openSheet, setOpenSheet] = useState<'region' | 'district' | 'ward' | 'village' | null>(
    null
  )
  const [regions, setRegions] = useState<GeoOption[]>([])
  const [districts, setDistricts] = useState<GeoOption[]>([])
  const [wards, setWards] = useState<GeoOption[]>([])
  const [villages, setVillages] = useState<GeoOption[]>([])
  const [loading, setLoading] = useState(false)
  const [creatingVillage, setCreatingVillage] = useState(false)

  // Load regions once
  useEffect(() => {
    apiGet('/geo/regions')
      .then((j) => setRegions(j.success ? j.data : []))
      .catch(() => setRegions([]))
  }, [])

  const loadDistricts = useCallback((regionId: number) => {
    setLoading(true)
    apiGet(`/geo/districts?regionId=${regionId}`)
      .then((j) => setDistricts(j.success ? j.data : []))
      .catch(() => setDistricts([]))
      .finally(() => setLoading(false))
  }, [])

  const loadWards = useCallback((districtId: number) => {
    setLoading(true)
    apiGet(`/geo/wards?districtId=${districtId}`)
      .then((j) => setWards(j.success ? j.data : []))
      .catch(() => setWards([]))
      .finally(() => setLoading(false))
  }, [])

  const loadVillages = useCallback((wardId: number) => {
    setLoading(true)
    apiGet(`/geo/villages?wardId=${wardId}`)
      .then((j) => setVillages(j.success ? j.data : []))
      .catch(() => setVillages([]))
      .finally(() => setLoading(false))
  }, [])

  const handleCreateVillage = async (name: string) => {
    if (!value.wardId) return
    setCreatingVillage(true)
    try {
      const json = await apiPost('/geo/villages', {
        wardId: value.wardId,
        name,
        type: value.villageType,
      })
      if (json.success && json.data) {
        onChange({ ...value, villageId: json.data.id, villageName: json.data.name })
        setVillages((prev) =>
          prev.some((v) => v.id === json.data.id) ? prev : [...prev, json.data].sort((a, b) => a.name.localeCompare(b.name))
        )
        setOpenSheet(null)
      }
    } catch {
      // Swallow — the sheet stays open so the officer can retry.
    } finally {
      setCreatingVillage(false)
    }
  }

  return (
    <View style={{ gap: 14 }}>
      <FieldRow
        label="Region *"
        value={value.regionName}
        placeholder="Select region"
        onPress={() => setOpenSheet('region')}
      />
      <FieldRow
        label="District *"
        value={value.districtName}
        placeholder={value.regionId ? 'Select district' : 'Select a region first'}
        disabled={!value.regionId}
        onPress={() => setOpenSheet('district')}
      />
      <FieldRow
        label="Ward *"
        value={value.wardName}
        placeholder={value.districtId ? 'Select ward' : 'Select a district first'}
        disabled={!value.districtId}
        onPress={() => setOpenSheet('ward')}
      />

      {/* Village/Street type toggle — determines what a manually-entered
          new location is saved as. */}
      <View>
        <Text style={{ fontSize: 12, fontWeight: '600', color: '#64748b', marginBottom: 8 }}>
          Area Type *
        </Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {(['village', 'street'] as const).map((t) => (
            <TouchableOpacity
              key={t}
              onPress={() => onChange({ ...value, villageType: t, villageId: null, villageName: '' })}
              disabled={!value.wardId}
              style={{
                flex: 1,
                paddingVertical: 10,
                borderRadius: 10,
                alignItems: 'center',
                borderWidth: 1.5,
                opacity: !value.wardId ? 0.5 : 1,
                borderColor: value.villageType === t ? TZ.green : '#cbd5e1',
                backgroundColor: value.villageType === t ? `${TZ.green}18` : 'transparent',
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: '700',
                  color: value.villageType === t ? TZ.green : '#64748b',
                }}
              >
                {t === 'village' ? 'Village (Rural)' : 'Street (Urban)'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <FieldRow
        label={`${villageLabel} *`}
        value={value.villageName}
        placeholder={value.wardId ? `Select or add ${value.villageType}` : 'Select a ward first'}
        disabled={!value.wardId}
        onPress={() => {
          if (value.wardId) loadVillages(value.wardId)
          setOpenSheet('village')
        }}
      />

      <SelectSheet
        visible={openSheet === 'region'}
        title="Select Region"
        options={regions}
        loading={false}
        onClose={() => setOpenSheet(null)}
        onSelect={(opt) => {
          onChange({
            ...emptyGeoSelection(),
            regionId: opt.id,
            regionName: opt.name,
            villageType: value.villageType,
          })
          loadDistricts(opt.id)
          setOpenSheet(null)
        }}
      />
      <SelectSheet
        visible={openSheet === 'district'}
        title="Select District"
        options={districts}
        loading={loading}
        onClose={() => setOpenSheet(null)}
        onSelect={(opt) => {
          onChange({
            ...value,
            districtId: opt.id,
            districtName: opt.name,
            wardId: null,
            wardName: '',
            villageId: null,
            villageName: '',
          })
          loadWards(opt.id)
          setOpenSheet(null)
        }}
      />
      <SelectSheet
        visible={openSheet === 'ward'}
        title="Select Ward"
        options={wards}
        loading={loading}
        onClose={() => setOpenSheet(null)}
        onSelect={(opt) => {
          onChange({ ...value, wardId: opt.id, wardName: opt.name, villageId: null, villageName: '' })
          setOpenSheet(null)
        }}
      />
      <SelectSheet
        visible={openSheet === 'village'}
        title={`Select ${value.villageType === 'street' ? 'Street' : 'Village'}`}
        options={villages}
        loading={loading}
        onClose={() => setOpenSheet(null)}
        onSelect={(opt) => {
          onChange({ ...value, villageId: opt.id, villageName: opt.name })
          setOpenSheet(null)
        }}
        allowManualEntry
        manualLabel={`+ Add new ${value.villageType}`}
        manualBusy={creatingVillage}
        onManualSubmit={handleCreateVillage}
      />
    </View>
  )
}
"""


# ──────────────────────────────────────────────────────────────────────────
# 1. Prisma schema — unique village-per-ward constraint + Birth.originVillageId
# ──────────────────────────────────────────────────────────────────────────

OLD_VILLAGE_MODEL = """model Village {
  id        Int         @id @default(autoincrement())
  wardId    Int         @map("ward_id")
  name      String      @db.VarChar(80)
  type      VillageType @default(village)
  createdAt DateTime    @default(now()) @map("created_at")

  ward           Ward                   @relation(fields: [wardId], references: [id])
  officers       VillageOfficer[]
  citizens       Citizen[]
  buildings      Building[]
  infrastructure PublicInfrastructure[]
  migrationsFrom Migration[]            @relation("MigrationFrom")
  migrationsTo   Migration[]            @relation("MigrationTo")
  snapshots      PopulationSnapshot[]

  @@map("villages")
}"""

NEW_VILLAGE_MODEL = """model Village {
  id        Int         @id @default(autoincrement())
  wardId    Int         @map("ward_id")
  name      String      @db.VarChar(80)
  type      VillageType @default(village)
  createdAt DateTime    @default(now()) @map("created_at")

  ward           Ward                   @relation(fields: [wardId], references: [id])
  officers       VillageOfficer[]
  citizens       Citizen[]
  buildings      Building[]
  infrastructure PublicInfrastructure[]
  migrationsFrom Migration[]            @relation("MigrationFrom")
  migrationsTo   Migration[]            @relation("MigrationTo")
  snapshots      PopulationSnapshot[]
  // Birth records whose parents' home village/street (origin) is this
  // village — recorded at birth even when the birth facility is elsewhere,
  // since the family's usual residence may differ from where they gave
  // birth (e.g. seasonal/labour migration).
  birthsOfOrigin Birth[]                @relation("BirthOriginVillage")

  // A village/street name must be unique WITHIN its ward, but the same
  // name may recur across different wards (e.g. many wards have a
  // "Mtaa wa Kati"). Enforced here instead of only in application code so
  // the get-or-create endpoint in geo.js can safely rely on it.
  @@unique([wardId, name])
  @@map("villages")
}"""

OLD_BIRTH_MODEL = """model Birth {
  id              String    @id @default(uuid())
  birthCertNo     String    @unique @map("birth_cert_no") @db.VarChar(30)
  // Birth Registration ID generated by Hospital Officer at birth.
  // Village Officer uses this at age 18 to look up the record and issue NIN.
  birthId         String?   @unique @map("birth_id") @db.VarChar(30)
  // childCitizenId is NULL until the child registers at 18 with a Village Officer
  childCitizenId  String?   @unique @map("child_citizen_id")
  childFirstName  String    @map("child_first_name") @db.VarChar(60)
  childMiddleName String?   @map("child_middle_name") @db.VarChar(60)
  childSurname    String    @map("child_surname") @db.VarChar(60)
  gender          Gender
  dateOfBirth     DateTime  @map("date_of_birth") @db.Date
  fatherCitizenId String?   @map("father_citizen_id")
  motherCitizenId String?   @map("mother_citizen_id")
  facilityId      Int?      @map("facility_id")
  officerId       String    @map("officer_id")
  certPdfUrl      String?   @map("cert_pdf_url")
  qrPayload       String?   @map("qr_payload")
  ritaSynced      Boolean   @default(false) @map("rita_synced")
  ritaSyncAt      DateTime? @map("rita_sync_at")
  registeredAt    DateTime  @default(now()) @map("registered_at")

  child    Citizen?        @relation("ChildBirth", fields: [childCitizenId], references: [id])
  father   Citizen?        @relation("FatherBirth", fields: [fatherCitizenId], references: [id])
  mother   Citizen?        @relation("MotherBirth", fields: [motherCitizenId], references: [id])
  facility HealthFacility? @relation(fields: [facilityId], references: [id])
  officer  HospitalOfficer @relation(fields: [officerId], references: [id])

  @@map("births")
}"""

NEW_BIRTH_MODEL = """model Birth {
  id              String    @id @default(uuid())
  birthCertNo     String    @unique @map("birth_cert_no") @db.VarChar(30)
  // Birth Registration ID generated by Hospital Officer at birth.
  // Village Officer uses this at age 18 to look up the record and issue NIN.
  birthId         String?   @unique @map("birth_id") @db.VarChar(30)
  // childCitizenId is NULL until the child registers at 18 with a Village Officer
  childCitizenId  String?   @unique @map("child_citizen_id")
  childFirstName  String    @map("child_first_name") @db.VarChar(60)
  childMiddleName String?   @map("child_middle_name") @db.VarChar(60)
  childSurname    String    @map("child_surname") @db.VarChar(60)
  gender          Gender
  dateOfBirth     DateTime  @map("date_of_birth") @db.Date
  fatherCitizenId String?   @map("father_citizen_id")
  motherCitizenId String?   @map("mother_citizen_id")
  facilityId      Int?      @map("facility_id")
  // The family's home village/street (region → district → ward → village),
  // captured directly from the parents at the hospital regardless of which
  // region the hospital itself is in — families away on labour/seasonal
  // migration still register the birth against their actual home area, not
  // wherever they happened to give birth.
  originVillageId Int?      @map("origin_village_id")
  officerId       String    @map("officer_id")
  certPdfUrl      String?   @map("cert_pdf_url")
  qrPayload       String?   @map("qr_payload")
  ritaSynced      Boolean   @default(false) @map("rita_synced")
  ritaSyncAt      DateTime? @map("rita_sync_at")
  registeredAt    DateTime  @default(now()) @map("registered_at")

  child         Citizen?        @relation("ChildBirth", fields: [childCitizenId], references: [id])
  father        Citizen?        @relation("FatherBirth", fields: [fatherCitizenId], references: [id])
  mother        Citizen?        @relation("MotherBirth", fields: [motherCitizenId], references: [id])
  facility      HealthFacility? @relation(fields: [facilityId], references: [id])
  originVillage Village?        @relation("BirthOriginVillage", fields: [originVillageId], references: [id])
  officer       HospitalOfficer @relation(fields: [officerId], references: [id])

  @@map("births")
}"""


def patch_prisma_schema(backend_dir: Path) -> None:
    path = backend_dir / "prisma/schema.prisma"
    print(f"\n[1] Patching {path.relative_to(backend_dir.parent.parent)}")
    replace_once(path, OLD_VILLAGE_MODEL, NEW_VILLAGE_MODEL, "add @@unique([wardId, name]) to Village")
    replace_once(path, OLD_BIRTH_MODEL, NEW_BIRTH_MODEL, "add Birth.originVillageId + relation")


# ──────────────────────────────────────────────────────────────────────────
# 2. Backend — new shared geo.js route + mount in index.js
# ──────────────────────────────────────────────────────────────────────────


def create_geo_route(backend_dir: Path) -> None:
    path = backend_dir / "src/routes/geo.js"
    print(f"\n[2a] Creating {path.relative_to(backend_dir.parent.parent)}")
    create_if_missing(path, GEO_JS, "geo.js (shared region/district/ward/village endpoints)")


OLD_INDEXJS_IMPORTS = """const healthRouter    = require('./routes/health')
const authRouter      = require('./routes/auth')
const dashboardRouter = require('./routes/dashboard')
const syncRouter     = require('./routes/syncRoutes')
const villageRouter  = require('./routes/village')
const adminRouter    = require('./routes/admin')"""

NEW_INDEXJS_IMPORTS = """const healthRouter    = require('./routes/health')
const authRouter      = require('./routes/auth')
const dashboardRouter = require('./routes/dashboard')
const syncRouter     = require('./routes/syncRoutes')
const villageRouter  = require('./routes/village')
const adminRouter    = require('./routes/admin')
const geoRouter      = require('./routes/geo')"""

OLD_INDEXJS_MOUNTS = """app.use('/api/village', villageRouter)
app.use('/api/officer', villageRouter)   // profile endpoint   // ← NEW: officer dashboard, records, sync
app.use('/api/admin',   adminRouter)     // Super Admin / District Admin dashboards"""

NEW_INDEXJS_MOUNTS = """app.use('/api/village', villageRouter)
app.use('/api/officer', villageRouter)   // profile endpoint   // ← NEW: officer dashboard, records, sync
app.use('/api/admin',   adminRouter)     // Super Admin / District Admin dashboards
app.use('/api/geo',     geoRouter)       // region/district/ward/village lookups — any authenticated role"""


def patch_index_js(backend_dir: Path) -> None:
    path = backend_dir / "src/index.js"
    print(f"\n[2b] Patching {path.relative_to(backend_dir.parent.parent)} (mount /api/geo)")
    replace_once(path, OLD_INDEXJS_IMPORTS, NEW_INDEXJS_IMPORTS, "import geoRouter")
    replace_once(path, OLD_INDEXJS_MOUNTS, NEW_INDEXJS_MOUNTS, "mount geoRouter at /api/geo")


# ──────────────────────────────────────────────────────────────────────────
# 3. Backend — birth sync accepts originVillageId
# ──────────────────────────────────────────────────────────────────────────

OLD_SYNC_BODY_PARAMS = """  const {
    localId, birthCertNo, birthId,
    childFirstName, childMiddleName, childSurname,
    gender, dateOfBirth,
    fatherNid, motherNid,
    registeredAt,
  } = req.body"""

NEW_SYNC_BODY_PARAMS = """  const {
    localId, birthCertNo, birthId,
    childFirstName, childMiddleName, childSurname,
    gender, dateOfBirth,
    fatherNid, motherNid,
    originVillageId,
    registeredAt,
  } = req.body"""

OLD_SYNC_BIRTH_CREATE = """        fatherCitizenId:  fatherCitizenId || undefined,
        motherCitizenId:  motherCitizenId || undefined,
        officerId,
        facilityId:       officer?.facilityId || undefined,
        registeredAt:     registeredAt ? new Date(registeredAt) : new Date(),
        ritaSynced:       false,
      },
      select: { id: true, birthCertNo: true },
    })"""

NEW_SYNC_BIRTH_CREATE = """        fatherCitizenId:  fatherCitizenId || undefined,
        motherCitizenId:  motherCitizenId || undefined,
        officerId,
        facilityId:       officer?.facilityId || undefined,
        originVillageId:  originVillageId ? Number(originVillageId) : undefined,
        registeredAt:     registeredAt ? new Date(registeredAt) : new Date(),
        ritaSynced:       false,
      },
      select: { id: true, birthCertNo: true },
    })"""


def patch_sync_routes(backend_dir: Path) -> None:
    path = backend_dir / "src/routes/syncRoutes.js"
    print(f"\n[3] Patching {path.relative_to(backend_dir.parent.parent)} (accept originVillageId)")
    replace_once(path, OLD_SYNC_BODY_PARAMS, NEW_SYNC_BODY_PARAMS, "accept originVillageId in birth/sync body")
    replace_once(path, OLD_SYNC_BIRTH_CREATE, NEW_SYNC_BIRTH_CREATE, "store originVillageId on Birth.create")


# ──────────────────────────────────────────────────────────────────────────
# 4. Backend — population dashboard merges in pre-citizen (under-18) counts
# ──────────────────────────────────────────────────────────────────────────

OLD_BUILD_CITIZEN_WHERE = """/** Build a Prisma `where` clause for Citizen queries, scoped by geo filters / role. */
async function buildCitizenGeoWhere(req) {
  const { regionId, districtId, wardId, villageId } = req.query
  let where = {}
  if (villageId)       where = { currentVillageId: Number(villageId) }
  else if (wardId)     where = { currentVillage: { wardId: Number(wardId) } }
  else if (districtId) where = { currentVillage: { ward: { districtId: Number(districtId) } } }
  else if (regionId)   where = { currentVillage: { ward: { district: { regionId: Number(regionId) } } } }

  if (req.user.role === 'district_admin') {
    const adminDistrictId = await getAdminDistrictId(req)
    where = { currentVillage: { ward: { districtId: adminDistrictId } } }
  }
  return where
}

"""

NEW_BUILD_CITIZEN_WHERE = """/** Build a Prisma `where` clause for Citizen queries, scoped by geo filters / role. */
async function buildCitizenGeoWhere(req) {
  const { regionId, districtId, wardId, villageId } = req.query
  let where = {}
  if (villageId)       where = { currentVillageId: Number(villageId) }
  else if (wardId)     where = { currentVillage: { wardId: Number(wardId) } }
  else if (districtId) where = { currentVillage: { ward: { districtId: Number(districtId) } } }
  else if (regionId)   where = { currentVillage: { ward: { district: { regionId: Number(regionId) } } } }

  if (req.user.role === 'district_admin') {
    const adminDistrictId = await getAdminDistrictId(req)
    where = { currentVillage: { ward: { districtId: adminDistrictId } } }
  }
  return where
}

/**
 * Build a Prisma `where` clause for Birth records representing "pre-citizen"
 * population — children under 18 who have a birth record with a captured
 * origin village but no NIN/Citizen record yet (childCitizenId is null).
 * Mirrors buildCitizenGeoWhere but scoped through Birth.originVillage
 * instead of Citizen.currentVillage, so population counts/filters by
 * village include everyone, not just citizens 18+.
 */
async function buildBirthOriginGeoWhere(req) {
  const { regionId, districtId, wardId, villageId } = req.query
  let where = { childCitizenId: null, originVillageId: { not: null } }
  if (villageId)       where = { ...where, originVillageId: Number(villageId) }
  else if (wardId)     where = { ...where, originVillage: { wardId: Number(wardId) } }
  else if (districtId) where = { ...where, originVillage: { ward: { districtId: Number(districtId) } } }
  else if (regionId)   where = { ...where, originVillage: { ward: { district: { regionId: Number(regionId) } } } }

  if (req.user.role === 'district_admin') {
    const adminDistrictId = await getAdminDistrictId(req)
    where = { ...where, originVillage: { ward: { districtId: adminDistrictId } } }
  }
  return where
}

"""

OLD_POPULATION_ROUTE = """router.get('/population', async (req, res) => {
  try {
    const where = await buildCitizenGeoWhere(req)
    const rows = await prisma.citizen.groupBy({
      by:     ['gender', 'age'],
      where,
      _count: { _all: true },
    })

    const bands = {}
    for (const band of AGE_BANDS) bands[band] = { male: 0, female: 0 }
    for (const r of rows) {
      const band = ageBand(r.age)
      bands[band][r.gender] += r._count._all
    }
    const pyramid = AGE_BANDS.map((age) => ({ age, male: bands[age].male, female: bands[age].female }))

    const total  = await prisma.citizen.count({ where })
    const male   = await prisma.citizen.count({ where: { ...where, gender: 'male' } })
    const female = total - male

    return res.json({
      success: true,
      data: {
        pyramid,
        total,
        male,
        female,
        malePct:   total ? Number(((male / total) * 100).toFixed(1))   : 0,
        femalePct: total ? Number(((female / total) * 100).toFixed(1)) : 0,
      },
    })
  } catch (err) {"""

NEW_POPULATION_ROUTE = """router.get('/population', async (req, res) => {
  try {
    const where = await buildCitizenGeoWhere(req)
    const rows = await prisma.citizen.groupBy({
      by:     ['gender', 'age'],
      where,
      _count: { _all: true },
    })

    const bands = {}
    for (const band of AGE_BANDS) bands[band] = { male: 0, female: 0 }
    for (const r of rows) {
      const band = ageBand(r.age)
      bands[band][r.gender] += r._count._all
    }

    let total  = await prisma.citizen.count({ where })
    let male   = await prisma.citizen.count({ where: { ...where, gender: 'male' } })

    // ── Merge in pre-citizen (under-18) population from birth records ──────
    // Citizens only exist once a NIN is issued at 18, so filtering the
    // dashboard by village previously hid every child under 18 entirely.
    // Birth.originVillageId (captured at the hospital, from the parents'
    // actual home village — not necessarily where the birth took place)
    // lets us count them against the same geo scope.
    try {
      const birthWhere = await buildBirthOriginGeoWhere(req)
      const births = await prisma.birth.findMany({
        where: birthWhere,
        select: { gender: true, dateOfBirth: true },
      })
      const now = Date.now()
      const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000
      for (const b of births) {
        const ageYears = Math.floor((now - new Date(b.dateOfBirth).getTime()) / MS_PER_YEAR)
        if (ageYears < 0 || ageYears >= 18) continue // safety guard — should already be true by construction
        const g = b.gender === 'female' ? 'female' : 'male'
        const band = ageBand(ageYears)
        bands[band][g] += 1
        total += 1
        if (g === 'male') male += 1
      }
    } catch (birthErr) {
      // Never let the pre-citizen merge take down the whole population
      // endpoint — worst case the dashboard just falls back to citizens-only
      // counts, same as before this feature existed.
      console.error('[admin/population] pre-citizen merge failed:', birthErr)
    }

    const pyramid = AGE_BANDS.map((age) => ({ age, male: bands[age].male, female: bands[age].female }))
    const female = total - male

    return res.json({
      success: true,
      data: {
        pyramid,
        total,
        male,
        female,
        malePct:   total ? Number(((male / total) * 100).toFixed(1))   : 0,
        femalePct: total ? Number(((female / total) * 100).toFixed(1)) : 0,
      },
    })
  } catch (err) {"""


def patch_population_endpoint(backend_dir: Path) -> None:
    path = backend_dir / "src/routes/admin.js"
    print(f"\n[4] Patching {path.relative_to(backend_dir.parent.parent)} (merge pre-citizen population)")
    replace_once(path, OLD_BUILD_CITIZEN_WHERE, NEW_BUILD_CITIZEN_WHERE, "add buildBirthOriginGeoWhere helper")
    replace_once(path, OLD_POPULATION_ROUTE, NEW_POPULATION_ROUTE, "merge under-18 birth-origin population into /population")


# ──────────────────────────────────────────────────────────────────────────
# 5. Mobile — GeoCascadePicker component + wiring into RegisterBirthScreen
# ──────────────────────────────────────────────────────────────────────────


def create_geo_cascade_picker(mobile_dir: Path) -> None:
    path = mobile_dir / "src/components/GeoCascadePicker.tsx"
    print(f"\n[5a] Creating {path.relative_to(mobile_dir.parent.parent)}")
    create_if_missing(path, GEO_CASCADE_PICKER_TSX, "GeoCascadePicker.tsx")


OLD_LOCALDB_LAST_FIELD = """  nationalId?: string // NIN — undefined/empty until issued at age 18
}"""

NEW_LOCALDB_LAST_FIELD = """  nationalId?: string // NIN — undefined/empty until issued at age 18
  originVillageId?: number // family's home village/street of origin (from GeoCascadePicker)
}"""


def patch_local_db(mobile_dir: Path) -> None:
    path = mobile_dir / "src/services/localDb.ts"
    print(f"\n[5b] Patching {path.relative_to(mobile_dir.parent.parent)} (add originVillageId to LocalBirth)")
    replace_once(path, OLD_LOCALDB_LAST_FIELD, NEW_LOCALDB_LAST_FIELD, "add originVillageId to LocalBirth")


OLD_SAVE_AND_SYNC_BIRTH = """    const json = await apiPost('/officer/birth/sync', {
      localId: id,
      birthCertNo: data.certNo,
      birthId: data.birthId,
      childFirstName: data.childFirstName,
      childMiddleName: data.childMiddleName,
      childSurname: data.childSurname,
      gender: data.gender.toLowerCase(),
      dateOfBirth: data.dateOfBirth,
      fatherNid: data.fatherNid,
      motherNid: data.motherNid,
      registeredAt: now,
    })"""

NEW_SAVE_AND_SYNC_BIRTH = """    const json = await apiPost('/officer/birth/sync', {
      localId: id,
      birthCertNo: data.certNo,
      birthId: data.birthId,
      childFirstName: data.childFirstName,
      childMiddleName: data.childMiddleName,
      childSurname: data.childSurname,
      gender: data.gender.toLowerCase(),
      dateOfBirth: data.dateOfBirth,
      fatherNid: data.fatherNid,
      motherNid: data.motherNid,
      originVillageId: data.originVillageId,
      registeredAt: now,
    })"""


def patch_sync_service(mobile_dir: Path) -> None:
    path = mobile_dir / "src/services/syncService.ts"
    print(f"\n[5c] Patching {path.relative_to(mobile_dir.parent.parent)} (send originVillageId on birth sync)")
    replace_once(path, OLD_SAVE_AND_SYNC_BIRTH, NEW_SAVE_AND_SYNC_BIRTH, "pass originVillageId to /officer/birth/sync")


OLD_BIRTH_SCREEN_IMPORTS = """import { generateBirthPdf, sharePdf } from '../../services/certificateService'
import { triggerSync, saveAndSyncBirth } from '../../services/syncService'
import { resolveBase } from '../../services/apiResolver'
import { useTheme, TZ } from '../../context/ThemeContext'"""

NEW_BIRTH_SCREEN_IMPORTS = """import { generateBirthPdf, sharePdf } from '../../services/certificateService'
import { triggerSync, saveAndSyncBirth } from '../../services/syncService'
import { resolveBase } from '../../services/apiResolver'
import { useTheme, TZ } from '../../context/ThemeContext'
import GeoCascadePicker, {
  emptyGeoSelection,
  isGeoSelectionComplete,
  type GeoSelection,
} from '../../components/GeoCascadePicker'"""

OLD_BIRTH_SCREEN_STATE = """  const [childGender, setChildGender] = useState<'MALE' | 'FEMALE' | ''>('')
  const [childDOB, setChildDOB] = useState('')
  const [showCal, setShowCal] = useState(false)"""

NEW_BIRTH_SCREEN_STATE = """  const [childGender, setChildGender] = useState<'MALE' | 'FEMALE' | ''>('')
  const [childDOB, setChildDOB] = useState('')
  const [showCal, setShowCal] = useState(false)
  // Family's home village/street of origin — captured directly from the
  // parents, independent of which region the hospital/facility is in
  // (families away on labour/seasonal migration still register against
  // their actual home area).
  const [originGeo, setOriginGeo] = useState<GeoSelection>(emptyGeoSelection())"""

OLD_STEP3_VALID = """  const step3Valid =
    !!childFirst.trim() && !!childSurname.trim() && !!childGender && childDOB.length >= 8"""

NEW_STEP3_VALID = """  const step3Valid =
    !!childFirst.trim() &&
    !!childSurname.trim() &&
    !!childGender &&
    childDOB.length >= 8 &&
    isGeoSelectionComplete(originGeo)"""

OLD_BIRTH_SUBMIT_CALL = """      const { birth, syncedRemote } = await saveAndSyncBirth({
        certNo,
        birthId,
        childFirstName: childFirst.trim(),
        childMiddleName: childMiddle.trim(),
        childSurname: childSurname.trim(),
        gender: childGender,
        dateOfBirth: childDOB,
        fatherName,
        fatherNid: fatherNid,
        motherName,
        motherNid: motherNid,
        facilityName: cache?.facilityName ?? '',
        facilityDistrict: cache?.facilityDistrict ?? '',
        facilityRegion: cache?.facilityRegion ?? '',
        officerName: cache?.officerName ?? '',
        rawJson: JSON.stringify({
          fatherNid,
          motherNid,
          gender: childGender,
          dateOfBirth: childDOB,
        }),
      })"""

NEW_BIRTH_SUBMIT_CALL = """      const { birth, syncedRemote } = await saveAndSyncBirth({
        certNo,
        birthId,
        childFirstName: childFirst.trim(),
        childMiddleName: childMiddle.trim(),
        childSurname: childSurname.trim(),
        gender: childGender,
        dateOfBirth: childDOB,
        fatherName,
        fatherNid: fatherNid,
        motherName,
        motherNid: motherNid,
        facilityName: cache?.facilityName ?? '',
        facilityDistrict: cache?.facilityDistrict ?? '',
        facilityRegion: cache?.facilityRegion ?? '',
        officerName: cache?.officerName ?? '',
        originVillageId: originGeo.villageId ?? undefined,
        rawJson: JSON.stringify({
          fatherNid,
          motherNid,
          gender: childGender,
          dateOfBirth: childDOB,
          origin: {
            regionId: originGeo.regionId,
            regionName: originGeo.regionName,
            districtId: originGeo.districtId,
            districtName: originGeo.districtName,
            wardId: originGeo.wardId,
            wardName: originGeo.wardName,
            villageId: originGeo.villageId,
            villageName: originGeo.villageName,
            villageType: originGeo.villageType,
          },
        }),
      })"""

OLD_STEP3_DOB_BLOCK = """              <View>
                <Text
                  style={{ fontSize: 12, fontWeight: '600', color: T.textSub, marginBottom: 6 }}
                >
                  Date of Birth *
                </Text>
                <TouchableOpacity
                  style={{
                    backgroundColor: T.card2,
                    borderWidth: 1,
                    borderColor: T.border,
                    borderRadius: 10,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                  onPress={() => setShowCal(true)}
                >
                  <Text style={{ color: childDOB ? T.text : T.textDim, fontSize: 14 }}>
                    {childDOB || 'Select date of birth'}
                  </Text>
                  <Calendar size={16} color={T.textDim} />
                </TouchableOpacity>
              </View>
              <View
                style={{
                  flexDirection: 'row',
                  gap: 8,
                  backgroundColor: `${H.primary}10`,
                  borderRadius: 10,
                  padding: 12,
                  borderWidth: 1,
                  borderColor: `${H.primary}30`,
                }}
              >
                <AlertCircle size={13} color={H.primaryL} />
                <Text style={{ fontSize: 11, color: T.textSub, flex: 1, lineHeight: 17 }}>
                  A Birth Registration ID (BID) will be generated and recorded. No National ID is
                  issued at birth — the child will present this Birth ID to a Village Officer at age
                  18 to obtain their NIN.
                </Text>
              </View>
            </View>
          )}"""

NEW_STEP3_DOB_BLOCK = """              <View>
                <Text
                  style={{ fontSize: 12, fontWeight: '600', color: T.textSub, marginBottom: 6 }}
                >
                  Date of Birth *
                </Text>
                <TouchableOpacity
                  style={{
                    backgroundColor: T.card2,
                    borderWidth: 1,
                    borderColor: T.border,
                    borderRadius: 10,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                  onPress={() => setShowCal(true)}
                >
                  <Text style={{ color: childDOB ? T.text : T.textDim, fontSize: 14 }}>
                    {childDOB || 'Select date of birth'}
                  </Text>
                  <Calendar size={16} color={T.textDim} />
                </TouchableOpacity>
              </View>

              <View
                style={{
                  height: StyleSheet.hairlineWidth,
                  backgroundColor: T.border,
                  marginVertical: 4,
                }}
              />
              <Text style={{ fontSize: 15, fontWeight: '800', color: T.text }}>
                Family's Home Area (Origin)
              </Text>
              <Text style={{ fontSize: 11, color: T.textSub, lineHeight: 16 }}>
                Ask the parents for their usual home village/street — not necessarily where this
                facility is located. Families away for work or seasonal labour still register
                against their actual home area.
              </Text>
              <GeoCascadePicker
                value={originGeo}
                onChange={setOriginGeo}
                villageLabel="Village / Street of Origin"
              />

              <View
                style={{
                  flexDirection: 'row',
                  gap: 8,
                  backgroundColor: `${H.primary}10`,
                  borderRadius: 10,
                  padding: 12,
                  borderWidth: 1,
                  borderColor: `${H.primary}30`,
                }}
              >
                <AlertCircle size={13} color={H.primaryL} />
                <Text style={{ fontSize: 11, color: T.textSub, flex: 1, lineHeight: 17 }}>
                  A Birth Registration ID (BID) will be generated and recorded. No National ID is
                  issued at birth — the child will present this Birth ID to a Village Officer at age
                  18 to obtain their NIN.
                </Text>
              </View>
            </View>
          )}"""


def patch_register_birth_screen(mobile_dir: Path) -> None:
    path = mobile_dir / "src/screens/hospital/RegisterBirthScreen.tsx"
    print(f"\n[5d] Patching {path.relative_to(mobile_dir.parent.parent)} (add origin geo picker)")
    replace_once(path, OLD_BIRTH_SCREEN_IMPORTS, NEW_BIRTH_SCREEN_IMPORTS, "import GeoCascadePicker")
    replace_once(path, OLD_BIRTH_SCREEN_STATE, NEW_BIRTH_SCREEN_STATE, "add originGeo state")
    replace_once(path, OLD_STEP3_VALID, NEW_STEP3_VALID, "require origin geo selection to advance")
    replace_once(path, OLD_BIRTH_SUBMIT_CALL, NEW_BIRTH_SUBMIT_CALL, "send originVillageId + origin details on submit")
    replace_once(path, OLD_STEP3_DOB_BLOCK, NEW_STEP3_DOB_BLOCK, "render GeoCascadePicker in Child Information step")


# ──────────────────────────────────────────────────────────────────────────
# 6. Web — manual village entry in the officer creation modal
# ──────────────────────────────────────────────────────────────────────────

OLD_ADMIN_API_VILLAGES = """export async function apiGetVillages(wardId) {
  const { data } = await apiClient.get('/admin/geo/villages', { params: { wardId } })
  return data
}"""

NEW_ADMIN_API_VILLAGES = """export async function apiGetVillages(wardId) {
  const { data } = await apiClient.get('/admin/geo/villages', { params: { wardId } })
  return data
}
// Get-or-create a village/street for a ward — used when the officer being
// registered lives somewhere not yet in the dropdown. Hits the shared
// /api/geo endpoint (any authenticated role, not just super/district admin)
// which enforces one canonical row per (wardId, name) via a DB constraint.
export async function apiCreateVillage(wardId, name, type = 'village') {
  const { data } = await apiClient.post('/geo/villages', { wardId, name, type })
  return data
}"""


def patch_web_admin_api(web_dir: Path) -> None:
    path = web_dir / "src/api/admin.api.js"
    print(f"\n[6a] Patching {path.relative_to(web_dir.parent.parent)} (add apiCreateVillage)")
    replace_once(path, OLD_ADMIN_API_VILLAGES, NEW_ADMIN_API_VILLAGES, "add apiCreateVillage() function")


OLD_MODAL_IMPORTS = """import { useState, useEffect } from 'react'
import { X, RefreshCw, CheckCircle, AlertCircle, Copy } from 'lucide-react'
import {
  apiCreateDistrictAdmin, apiCreateVillageOfficer, apiCreateHealthOfficer,
  apiGetRegions, apiGetDistricts, apiGetWards, apiGetVillages,
} from '../api/admin.api'"""

NEW_MODAL_IMPORTS = """import { useState, useEffect } from 'react'
import { X, RefreshCw, CheckCircle, AlertCircle, Copy, Plus } from 'lucide-react'
import {
  apiCreateDistrictAdmin, apiCreateVillageOfficer, apiCreateHealthOfficer,
  apiGetRegions, apiGetDistricts, apiGetWards, apiGetVillages, apiCreateVillage,
} from '../api/admin.api'"""

OLD_MODAL_STATE = """  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [result,  setResult]  = useState(null)
  const [copied,  setCopied]  = useState(false)"""

NEW_MODAL_STATE = """  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [result,  setResult]  = useState(null)
  const [copied,  setCopied]  = useState(false)

  // Manual village/street entry — shown when the officer's home area isn't
  // in the dropdown yet for the selected ward.
  const [showNewVillage, setShowNewVillage] = useState(false)
  const [newVillageName, setNewVillageName] = useState('')
  const [newVillageType, setNewVillageType] = useState('village')
  const [creatingVillage, setCreatingVillage] = useState(false)"""

OLD_MODAL_SET_FN = """  const set = (field, val) => setForm(p => ({ ...p, [field]: val }))"""

NEW_MODAL_SET_FN = """  const set = (field, val) => setForm(p => ({ ...p, [field]: val }))

  // Get-or-create the village/street for the currently selected ward, then
  // select it immediately so the rest of the form behaves exactly as if it
  // had been picked from the dropdown.
  const handleCreateVillage = async () => {
    const name = newVillageName.trim()
    if (!name || !form.wardId) return
    setCreatingVillage(true)
    try {
      const res = await apiCreateVillage(form.wardId, name, newVillageType)
      if (res.success && res.data) {
        setVillages(prev =>
          prev.some(v => v.id === res.data.id) ? prev : [...prev, res.data].sort((a, b) => a.name.localeCompare(b.name))
        )
        set('villageId', res.data.id)
        setShowNewVillage(false)
        setNewVillageName('')
      }
    } catch {
      // leave the form open so the admin can retry
    } finally {
      setCreatingVillage(false)
    }
  }"""

OLD_MODAL_VILLAGE_BLOCK = """            {target === 'village_officer' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>Ward</label>
                  <select className={sel} value={form.wardId} onChange={e => { set('wardId', e.target.value); set('villageId', '') }}>
                    <option value="">Select ward</option>
                    {wards.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={lbl}>Village</label>
                  <select className={sel} value={form.villageId} onChange={e => set('villageId', e.target.value)} disabled={!form.wardId}>
                    <option value="">Select village</option>
                    {villages.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
              </div>
            )}"""

NEW_MODAL_VILLAGE_BLOCK = """            {target === 'village_officer' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>Ward</label>
                  <select className={sel} value={form.wardId} onChange={e => { set('wardId', e.target.value); set('villageId', '') }}>
                    <option value="">Select ward</option>
                    {wards.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={lbl}>Village</label>
                  <select className={sel} value={form.villageId} onChange={e => set('villageId', e.target.value)} disabled={!form.wardId}>
                    <option value="">Select village</option>
                    {villages.map(v => <option key={v.id} value={v.id}>{v.name} {v.type === 'street' ? '(Street)' : ''}</option>)}
                  </select>
                </div>

                {form.wardId && !showNewVillage && (
                  <button
                    type="button"
                    onClick={() => setShowNewVillage(true)}
                    className="col-span-2 flex items-center justify-center gap-1.5 text-[11px] font-semibold text-emerald-400 border border-emerald-500/40 bg-emerald-500/10 rounded-lg py-2 hover:bg-emerald-500/20"
                  >
                    <Plus size={12} /> Village/street not listed? Add new
                  </button>
                )}

                {showNewVillage && (
                  <div className="col-span-2 border border-white/10 rounded-lg p-3 space-y-2 bg-white/5">
                    <p className="text-[10px] text-white/60 leading-snug">
                      This will be saved and appear as a dropdown option for this ward going
                      forward.
                    </p>
                    <div className="flex gap-2">
                      {['village', 'street'].map(t => (
                        <button
                          type="button"
                          key={t}
                          onClick={() => setNewVillageType(t)}
                          className={`flex-1 text-[11px] font-semibold rounded-lg py-1.5 border ${
                            newVillageType === t
                              ? 'border-emerald-500 bg-emerald-500/15 text-emerald-400'
                              : 'border-white/15 text-white/60'
                          }`}
                        >
                          {t === 'village' ? 'Village (Rural)' : 'Street (Urban)'}
                        </button>
                      ))}
                    </div>
                    <input
                      className={sel}
                      value={newVillageName}
                      onChange={e => setNewVillageName(e.target.value)}
                      placeholder="e.g. Kati"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={!newVillageName.trim() || creatingVillage}
                        onClick={handleCreateVillage}
                        className="flex-1 text-[11px] font-bold rounded-lg py-2 bg-emerald-500 text-white disabled:opacity-40"
                      >
                        {creatingVillage ? 'Saving…' : 'Use This Name'}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setShowNewVillage(false); setNewVillageName('') }}
                        className="text-[11px] font-semibold rounded-lg py-2 px-3 border border-white/15 text-white/60"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}"""


def patch_web_modal(web_dir: Path) -> None:
    path = web_dir / "src/modals/NewRegistrationModal.jsx"
    print(f"\n[6b] Patching {path.relative_to(web_dir.parent.parent)} (manual village entry)")
    replace_once(path, OLD_MODAL_IMPORTS, NEW_MODAL_IMPORTS, "import Plus icon + apiCreateVillage")
    replace_once(path, OLD_MODAL_STATE, NEW_MODAL_STATE, "add manual-village-entry state")
    replace_once(path, OLD_MODAL_SET_FN, NEW_MODAL_SET_FN, "add handleCreateVillage()")
    replace_once(path, OLD_MODAL_VILLAGE_BLOCK, NEW_MODAL_VILLAGE_BLOCK, "add manual entry UI to village select")


# ──────────────────────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────────────────────


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--root", help="Path to the project root (contains code/mobile, code/web, code/backend).")
    args = ap.parse_args()

    root = find_project_root(args.root)
    mobile_dir = root / "code" / "mobile"
    backend_dir = root / "code" / "backend"
    web_dir = root / "code" / "web"
    print(f"Project root: {root}")

    patch_prisma_schema(backend_dir)
    create_geo_route(backend_dir)
    patch_index_js(backend_dir)
    patch_sync_routes(backend_dir)
    patch_population_endpoint(backend_dir)

    create_geo_cascade_picker(mobile_dir)
    patch_local_db(mobile_dir)
    patch_sync_service(mobile_dir)
    patch_register_birth_screen(mobile_dir)

    patch_web_admin_api(web_dir)
    patch_web_modal(web_dir)

    print(
        "\nDone. Next steps:\n"
        "  1. cd code/backend && npx prisma migrate dev --name add_village_unique_and_birth_origin\n"
        "     (if this fails on existing duplicate (ward_id, name) rows, resolve those first —\n"
        "     see the note at the top of this script)\n"
        "  2. npx prisma generate\n"
        "  3. Restart the backend, then cd ../mobile && npx expo start --clear\n"
        "  4. Re-test: Hospital Officer -> Register Birth -> Child Information step should now\n"
        "     show 'Family's Home Area (Origin)' with cascading Region/District/Ward/Village\n"
        "     fields, including '+ Add new village/street' if the family's location isn't listed\n"
        "  5. Re-test: District Admin -> register a new Village Officer -> Village dropdown should\n"
        "     now offer 'Village/street not listed? Add new'\n"
        "  6. Re-test: Admin dashboard population view, filtered by a village that has birth\n"
        "     records but few/no citizens yet — totals should now include those children\n"
    )


if __name__ == "__main__":
    main()
