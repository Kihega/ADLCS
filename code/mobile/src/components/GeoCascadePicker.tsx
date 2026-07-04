/**
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
  Alert,
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
    const cleanName = name.trim()
    if (!cleanName) return

    // NOTE: this used to be `if (!value.wardId) return` — a silent no-op.
    // If wardId was ever momentarily unset (e.g. a state update still in
    // flight right after picking the ward), tapping "Use This Name" did
    // absolutely nothing with zero feedback, which is indistinguishable
    // from the button being disabled. Now we tell the officer exactly
    // what's missing instead of failing silently, so the button always
    // *does* something when tapped.
    if (!value.wardId) {
      Alert.alert(
        'Select a Ward First',
        'Please select a Region, District, and Ward before adding a new village/street.'
      )
      return
    }

    // Warn (but don't block) if this name already exists in the loaded
    // list for this ward — case-insensitive, since "Kati" and "kati" are
    // the same place. The backend's get-or-create is safe to call either
    // way, but surfacing this up front avoids confusing the officer with
    // two entries that look different but are actually the same village.
    const existing = villages.find((v) => v.name.trim().toLowerCase() === cleanName.toLowerCase())
    if (existing) {
      Alert.alert(
        'Village Already Exists',
        `"${existing.name}" is already registered in this ward. Selecting the existing entry instead of creating a duplicate.`,
        [
          {
            text: 'OK',
            onPress: () => {
              onChange({ ...value, villageId: existing.id, villageName: existing.name })
              setOpenSheet(null)
            },
          },
        ]
      )
      return
    }

    setCreatingVillage(true)
    try {
      const json = await apiPost('/geo/villages', {
        wardId: value.wardId,
        name: cleanName,
        type: value.villageType,
      })
      if (json.success && json.data) {
        onChange({ ...value, villageId: json.data.id, villageName: json.data.name })
        setVillages((prev) =>
          prev.some((v) => v.id === json.data.id) ? prev : [...prev, json.data].sort((a, b) => a.name.localeCompare(b.name))
        )
        setOpenSheet(null)
      } else {
        Alert.alert('Could Not Add Village', json.message ?? 'Please try again.')
      }
    } catch (err: any) {
      // Previously this silently swallowed the error, leaving the officer
      // staring at a button that appeared to do nothing after tapping it.
      Alert.alert(
        'Could Not Add Village',
        err?.message ?? 'Something went wrong while saving this village. Please try again.'
      )
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
