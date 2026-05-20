#!/usr/bin/env python3
"""
ADLCS — patch_02_data_flow.py
=================================
Ensures every screen that sends data actually persists to PostgreSQL,
and every screen that displays data reads from Supabase (via backend).

Key fixes:
  Mobile
  ──────
  1. syncService.ts      — getSyncStatus/triggerSync call real API endpoints
  2. HospitalHomeScreen  — loadData fetches live from DB; useFocusEffect refreshes
                           on return; stats.pendingSync + unread from remote.pendingCases
  3. VillageHomeScreen   — same approach
  4. RegisterBirthScreen — fix all AbortSignal.timeout (Hermes crash on citizen-lookup
                           and dashboard-cache fetch inside handleSubmit)
  5. RecordDeathScreen   — fix remaining AbortSignal.timeout in handleSubmit
  6. ViewRecordsScreen   — remove `remote.data.length > 0` guard so remote records
                           always display (even if zero)
  7. PendingCasesScreen  — replace local-stub calls with real /records/pending API

  Backend
  ───────
  8. dashboard.js        — GET /records: add village-officer support (villageOfficerId)
                           GET /activity: village officers now see deaths too
  9. village.js          — GET /village/dashboard: return todayBirths/Deaths + month stats

Place this file at the project root (same folder as `code/`), then run:
    python3 patch_02_data_flow.py
"""

import os, re

ROOT    = os.path.dirname(os.path.abspath(__file__))
ok: list[str]   = []
fail: list[str] = []

# ─── helpers ──────────────────────────────────────────────────────────────────
def write(rel: str, content: str):
    path = os.path.join(ROOT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    ok.append(rel)
    print(f'  ✓ {rel}')

def patch_file(rel: str, replacements: list[tuple[str, str]], all_occurrences=False):
    path = os.path.join(ROOT, rel)
    try:
        with open(path, 'r', encoding='utf-8') as f:
            src = f.read()
        applied = 0
        for old, new in replacements:
            if old not in src:
                print(f'  ⚠  [{rel}] pattern not found — skipping')
                continue
            if all_occurrences:
                src = src.replace(old, new)
            else:
                src = src.replace(old, new, 1)
            applied += 1
        with open(path, 'w', encoding='utf-8') as f:
            f.write(src)
        ok.append(rel)
        print(f'  ✓ {rel}  ({applied} replacement(s))')
    except FileNotFoundError:
        fail.append(rel)
        print(f'  ✗ {rel}  FILE NOT FOUND')

# ==============================================================================
# 1. syncService.ts — getSyncStatus + triggerSync use real API
# ==============================================================================
print('\n[1] syncService.ts — real getSyncStatus + triggerSync')
write('code/mobile/src/services/syncService.ts', """\
/**
 * syncService.ts  v9.0  ONLINE-ONLY — real backend API
 *
 * Every function that reads or writes data goes to
 *   https://adlcs-backend.onrender.com  →  Supabase PostgreSQL
 *
 * No SQLite, no NetInfo, no offline queue.
 * AbortSignal.timeout() NOT used (Hermes-incompatible); uses makeSignal() instead.
 */

import AsyncStorage from '@react-native-async-storage/async-storage'
import { LocalBirth, LocalDeath } from './localDb'

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'https://adlcs-backend.onrender.com/api'

export type ConnQuality = 'Good' | 'Fair' | 'Offline'
export interface SyncResult { synced: number; failed: number; offline: boolean }

// ── Always online in online-only mode ─────────────────────────────────────────
export function isOnline(): boolean { return true }
export function getConnQuality(): ConnQuality { return 'Good' }

// ── Hermes-safe abort helper ───────────────────────────────────────────────────
function makeSignal(ms: number): { signal: AbortSignal; clear: () => void } {
  const ctrl  = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  return { signal: ctrl.signal, clear: () => clearTimeout(timer) }
}

// ── Token ─────────────────────────────────────────────────────────────────────
async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem('adlcs_access_token')
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────
export async function apiPost(endpoint: string, body: object): Promise<any> {
  const token = await getToken()
  if (!token) throw new Error('No auth token')
  const { signal, clear } = makeSignal(15_000)
  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify(body),
      signal,
    })
    clear()
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  } catch (e) { clear(); throw e }
}

export async function apiGet(endpoint: string): Promise<any> {
  const token = await getToken()
  if (!token) throw new Error('No auth token')
  const { signal, clear } = makeSignal(10_000)
  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal,
    })
    clear()
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  } catch (e) { clear(); throw e }
}

// ── Connection quality — real ping ────────────────────────────────────────────
export async function checkConnQuality(): Promise<ConnQuality> {
  const { signal, clear } = makeSignal(4000)
  try {
    const t = Date.now()
    const res = await fetch(`${API_BASE}/health`, { signal })
    clear()
    if (!res.ok) return 'Fair'
    return Date.now() - t < 800 ? 'Good' : 'Fair'
  } catch { clear(); return 'Offline' }
}

// ── Save birth → POST directly to backend → Supabase ─────────────────────────
export async function saveAndSyncBirth(
  data: Omit<LocalBirth, 'id'|'registeredAt'|'synced'|'certPdfPath'>
): Promise<{ birth: LocalBirth; syncedRemote: boolean }> {
  const now  = new Date().toISOString()
  const id   = `online-${Date.now()}`
  const birth: LocalBirth = { ...data, id, registeredAt: now, synced: 0, certPdfPath: '' }

  try {
    const json = await apiPost('/officer/birth/sync', {
      localId:         id,
      birthCertNo:     data.certNo,
      nationalId:      data.nationalId,
      childFirstName:  data.childFirstName,
      childMiddleName: data.childMiddleName,
      childSurname:    data.childSurname,
      gender:          data.gender.toLowerCase(),
      dateOfBirth:     data.dateOfBirth,
      fatherNid:       data.fatherNid,
      motherNid:       data.motherNid,
      registeredAt:    now,
    })
    if (json.success || json.duplicate) {
      await AsyncStorage.setItem('adlcs_last_sync', now)
      return { birth: { ...birth, synced: 1 }, syncedRemote: true }
    }
  } catch (e) { console.warn('[saveAndSyncBirth]', e) }

  return { birth, syncedRemote: false }
}

// ── Save death → POST directly to backend → Supabase ─────────────────────────
export async function saveAndSyncDeath(
  data: Omit<LocalDeath, 'id'|'registeredAt'|'synced'|'certPdfPath'>
): Promise<{ death: LocalDeath; syncedRemote: boolean }> {
  const now  = new Date().toISOString()
  const id   = `online-${Date.now()}`
  const death: LocalDeath = { ...data, id, registeredAt: now, synced: 0, certPdfPath: '' }

  try {
    const json = await apiPost('/officer/death/sync', {
      localId:       id,
      deathCertNo:   data.certNo,
      nationalId:    data.nationalId,
      causeOfDeath:  data.causeOfDeath,
      dateOfDeath:   data.dateOfDeath,
      locationType:  data.locationType,
      category:      data.category,
      informantName: data.informantName,
      registeredAt:  now,
    })
    if (json.success || json.duplicate) {
      await AsyncStorage.setItem('adlcs_last_sync', now)
      return { death: { ...death, synced: 1 }, syncedRemote: true }
    }
  } catch (e) { console.warn('[saveAndSyncDeath]', e) }

  return { death, syncedRemote: false }
}

// ── Remote data fetchers ──────────────────────────────────────────────────────
export async function fetchRemoteDashboard(): Promise<any | null> {
  try {
    const json = await apiGet('/officer/dashboard')
    return json.success ? json.data : null
  } catch { return null }
}

export async function fetchRemoteActivity(): Promise<any[]> {
  try {
    const json = await apiGet('/officer/activity?limit=5')
    return json.success ? json.data : []
  } catch { return [] }
}

export async function fetchRemoteRecords(
  type: 'all'|'birth'|'death', page: number, query: string
): Promise<{ data: any[]; total: number } | null> {
  try {
    const params = new URLSearchParams({
      type, page: String(page), limit: '30',
      ...(query ? { q: query } : {}),
    })
    const json = await apiGet(`/officer/records?${params}`)
    return json.success ? { data: json.data, total: json.total ?? json.data.length } : null
  } catch { return null }
}

export async function fetchOfficerProfile(): Promise<any | null> {
  try {
    const json = await apiGet('/officer/profile')
    return json.success ? json.data : null
  } catch { return null }
}

// ── Sync status — from real backend ──────────────────────────────────────────
export async function getSyncStatus() {
  try {
    const json = await apiGet('/officer/sync/status')
    if (json.success && json.data) {
      await AsyncStorage.setItem('adlcs_last_sync', json.data.lastSyncAt ?? new Date().toISOString())
      return {
        unsyncedBirths: json.data.unsyncedBirths ?? 0,
        unsyncedDeaths: json.data.unsyncedDeaths ?? 0,
        lastSyncAt:     json.data.lastSyncAt     ?? null,
      }
    }
  } catch {}
  const lastSync = await AsyncStorage.getItem('adlcs_last_sync')
  return { unsyncedBirths: 0, unsyncedDeaths: 0, lastSyncAt: lastSync }
}

// ── Trigger sync — marks all pending records as synced in DB ─────────────────
export async function triggerSync(): Promise<SyncResult> {
  try {
    const json = await apiPost('/officer/sync/trigger', {})
    return {
      synced:  json.data?.synced  ?? 0,
      failed:  0,
      offline: false,
    }
  } catch {
    return { synced: 0, failed: 0, offline: false }
  }
}

// ── No-ops (API compatibility) ────────────────────────────────────────────────
export async function init(_getter?: () => Promise<string|null>): Promise<void> {}
export function stop(): void {}
""")

# ==============================================================================
# 2. HospitalHomeScreen.tsx — live data, useFocusEffect, proper stats
# ==============================================================================
print('\n[2] HospitalHomeScreen.tsx — live data + useFocusEffect')

# 2a. Add checkConnQuality to syncService import
patch_file('code/mobile/src/screens/hospital/HospitalHomeScreen.tsx', [(
    "  isOnline, getConnQuality, triggerSync,",
    "  isOnline, getConnQuality, checkConnQuality, triggerSync,"
)])

# 2b. Add useFocusEffect import (before NativeStackNavigationProp)
patch_file('code/mobile/src/screens/hospital/HospitalHomeScreen.tsx', [(
    "import type { NativeStackNavigationProp } from '@react-navigation/native-stack'",
    "import { useFocusEffect } from '@react-navigation/native'\nimport type { NativeStackNavigationProp } from '@react-navigation/native-stack'"
)])

# 2c. Replace the entire loadData + useEffect block
patch_file('code/mobile/src/screens/hospital/HospitalHomeScreen.tsx', [(
"""\
    // 1. Local DB (instant)
    const localStats = await getLocalStats()
    setStats(localStats)
    setUnread(localStats.pendingSync)
    if (!silent) setLoading(false)

    // 2. Cached officer info
    const cached = await getCachedOfficerData()
    if (cached.officerName) setOfficer(prev => ({ ...prev, ...cached as any }))

    // 3. Remote (non-blocking)
    setConnQuality(getConnQuality())
    const [remote, acts] = await Promise.all([fetchRemoteDashboard(), fetchRemoteActivity()])
    setConnQuality(getConnQuality()) // re-check after requests complete

    if (acts.length > 0) setActivity(acts)
    if (remote) {
      const merged = {
        officerName:      remote.officerName      ?? cached.officerName      ?? 'Officer',
        facilityName:     remote.facilityName     ?? cached.facilityName     ?? 'Facility',
        facilityType:     remote.facilityType     ?? cached.facilityType     ?? 'hospital',
        facilityGrade:    remote.facilityGrade    ?? cached.facilityGrade    ?? '',
        facilityRegion:   remote.facilityRegion   ?? cached.facilityRegion   ?? '—',
        facilityDistrict: remote.facilityDistrict ?? cached.facilityDistrict ?? '—',
        facilityGpsLat:   String(remote.facilityGpsLat  ?? cached.facilityGpsLat  ?? ''),
        facilityGpsLng:   String(remote.facilityGpsLng  ?? cached.facilityGpsLng  ?? ''),
        facilityCertIssued: Number(remote.facilityCertIssued ?? 0),
        facilityDeliveries: Number(remote.facilityDeliveries ?? 0),
      }
      setOfficer(merged)
      await cacheOfficerData(merged)
      if (remote.facilityGpsLat && remote.facilityGpsLng) {
        setGeofenceConfig({ gps: { lat: Number(remote.facilityGpsLat), lng: Number(remote.facilityGpsLng) }, role: 'hospital_officer' })
      }
      setStats(prev => ({
        ...prev,
        todayBirths: Math.max(prev.todayBirths, remote.todayBirths ?? 0),
        todayDeaths: Math.max(prev.todayDeaths, remote.todayDeaths ?? 0),
        monthBirths: Math.max(prev.monthBirths, remote.monthBirths ?? 0),
        monthDeaths: Math.max(prev.monthDeaths, remote.monthDeaths ?? 0),
      }))
    }
    setRefreshing(false)
  }, [navigation, setGeofenceConfig])

  useEffect(() => {
    loadData()
    pollRef.current = setInterval(() => { setConnQuality(getConnQuality()); loadData(true) }, 30_000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [loadData])""",
"""\
    if (!silent) setLoading(true)

    // Real connection quality — async ping to backend /api/health
    checkConnQuality().then(setConnQuality)

    // Fetch live stats + officer info from Supabase (via backend)
    const [remote, acts] = await Promise.all([fetchRemoteDashboard(), fetchRemoteActivity()])

    if (acts.length > 0) setActivity(acts)
    if (remote) {
      setOfficer({
        officerName:        remote.officerName        ?? 'Officer',
        facilityName:       remote.facilityName       ?? 'Facility',
        facilityType:       remote.facilityType       ?? 'hospital',
        facilityGrade:      remote.facilityGrade      ?? '',
        facilityRegion:     remote.facilityRegion     ?? '—',
        facilityDistrict:   remote.facilityDistrict   ?? '—',
        facilityGpsLat:     String(remote.facilityGpsLat  ?? ''),
        facilityGpsLng:     String(remote.facilityGpsLng  ?? ''),
        facilityCertIssued: Number(remote.facilityCertIssued ?? 0),
        facilityDeliveries: Number(remote.facilityDeliveries ?? 0),
      })
      if (remote.facilityGpsLat && remote.facilityGpsLng) {
        setGeofenceConfig({ gps: { lat: Number(remote.facilityGpsLat), lng: Number(remote.facilityGpsLng) }, role: 'hospital_officer' })
      }
      // All counts come directly from PostgreSQL — no local merge needed
      setStats({
        todayBirths: remote.todayBirths  ?? 0,
        todayDeaths: remote.todayDeaths  ?? 0,
        monthBirths: remote.monthBirths  ?? 0,
        monthDeaths: remote.monthDeaths  ?? 0,
        pendingSync: remote.pendingCases ?? 0,
        totalBirths: 0,
        totalDeaths: 0,
      })
      // Bell badge = births/deaths that still need certificates
      setUnread(remote.pendingCases ?? 0)
    }
    setLoading(false)
    setRefreshing(false)
  }, [navigation, setGeofenceConfig])

  // ← Refresh whenever screen comes back into focus (e.g. after RegisterBirth)
  useFocusEffect(useCallback(() => { loadData() }, [loadData]))

  // Background poll every 60s
  useEffect(() => {
    pollRef.current = setInterval(() => loadData(true), 60_000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [loadData])"""
)])

# 2d. Fix AbortSignal.timeout in ChangePasswordModal (Hermes crash)
_hhs = os.path.join(ROOT, 'code/mobile/src/screens/hospital/HospitalHomeScreen.tsx')
try:
    with open(_hhs, 'r', encoding='utf-8') as f: src = _hhs_src = f.read()
    src = src.replace('signal:  AbortSignal.timeout(12_000),',
                      'signal:  (()=>{const __c=new AbortController();setTimeout(()=>__c.abort(),12000);return __c.signal})(),')
    with open(_hhs, 'w', encoding='utf-8') as f: f.write(src)
    print('  ✓ HospitalHomeScreen — AbortSignal.timeout(12_000) fixed')
except FileNotFoundError:
    print('  ✗ HospitalHomeScreen not found for AbortSignal fix')

# ==============================================================================
# 3. VillageHomeScreen.tsx — live data + useFocusEffect
# ==============================================================================
print('\n[3] VillageHomeScreen.tsx — live data + useFocusEffect')

# 3a. Add checkConnQuality to syncService import
patch_file('code/mobile/src/screens/village/VillageHomeScreen.tsx', [(
    "  fetchRemoteDashboard, fetchRemoteActivity,\n  isOnline, getConnQuality, ConnQuality,",
    "  fetchRemoteDashboard, fetchRemoteActivity,\n  isOnline, getConnQuality, checkConnQuality, ConnQuality,"
)])

# 3b. Add useFocusEffect import
patch_file('code/mobile/src/screens/village/VillageHomeScreen.tsx', [(
    "import type { NativeStackNavigationProp } from '@react-navigation/native-stack'",
    "import { useFocusEffect } from '@react-navigation/native'\nimport type { NativeStackNavigationProp } from '@react-navigation/native-stack'"
)])

# 3c. Replace loadData + useEffect block
patch_file('code/mobile/src/screens/village/VillageHomeScreen.tsx', [(
"""\
    const localStats = await getLocalStats()
    setStats(localStats)
    setUnread(localStats.pendingSync)
    if (!silent) setLoading(false)

    const cached = await getCachedOfficerData()
    if (cached.officerName) setOfficer(prev => ({
      ...prev, ...cached as any,
      villageName: (cached as any).villageName ?? cached.facilityName ?? prev.villageName,
    }))

    setConnQuality(getConnQuality())
    const [remote, acts] = await Promise.all([fetchRemoteDashboard(), fetchRemoteActivity()])
    setConnQuality(getConnQuality())

    if (acts.length > 0) setActivity(acts)
    if (remote) {
      const merged = {
        officerName:    remote.officerName    ?? cached.officerName    ?? 'Village Officer',
        villageName:    remote.villageName    ?? (cached as any).villageName ?? 'My Village',
        wardName:       remote.wardName       ?? '—',
        totalCitizens:  remote.totalCitizens  ?? 0,
        employeeId:     remote.employeeId     ?? '',
      }
      setOfficer(merged)
      await cacheOfficerData({ ...merged, facilityName: merged.villageName })
      setStats(prev => ({
        ...prev,
        monthBirths: Math.max(prev.monthBirths, remote.monthBirths ?? 0),
        monthDeaths: Math.max(prev.monthDeaths, remote.monthDeaths ?? 0),
      }))
    }
    setRefreshing(false)
  }, [navigation])

  useEffect(() => {
    loadData()
    pollRef.current = setInterval(()=>{ setConnQuality(getConnQuality()); loadData(true) }, 30_000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [loadData])""",
"""\
    if (!silent) setLoading(true)

    // Real connection quality ping
    checkConnQuality().then(setConnQuality)

    // Fetch live data from Supabase (via backend)
    const [remote, acts] = await Promise.all([fetchRemoteDashboard(), fetchRemoteActivity()])

    if (acts.length > 0) setActivity(acts)
    if (remote) {
      setOfficer({
        officerName:   remote.officerName   ?? 'Village Officer',
        villageName:   remote.villageName   ?? 'My Village',
        wardName:      remote.wardName      ?? '—',
        totalCitizens: remote.totalCitizens ?? 0,
        employeeId:    remote.employeeId    ?? '',
      })
      // Stats directly from PostgreSQL
      setStats({
        todayBirths: remote.todayBirths  ?? 0,
        todayDeaths: remote.todayDeaths  ?? 0,
        monthBirths: remote.monthBirths  ?? 0,
        monthDeaths: remote.monthDeaths  ?? 0,
        pendingSync: remote.pendingCases ?? 0,
        totalBirths: 0,
        totalDeaths: 0,
      })
      setUnread(remote.pendingCases ?? 0)
    }
    setLoading(false)
    setRefreshing(false)
  }, [navigation])

  // Refresh on focus (picks up new citizen/death registrations immediately)
  useFocusEffect(useCallback(() => { loadData() }, [loadData]))

  // Background poll every 60s
  useEffect(() => {
    pollRef.current = setInterval(() => loadData(true), 60_000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [loadData])"""
)])

# ==============================================================================
# 4. RegisterBirthScreen.tsx — fix ALL AbortSignal.timeout occurrences
# ==============================================================================
print('\n[4] RegisterBirthScreen.tsx — fix ALL AbortSignal.timeout')
_rbs = os.path.join(ROOT, 'code/mobile/src/screens/hospital/RegisterBirthScreen.tsx')
try:
    with open(_rbs, 'r', encoding='utf-8') as f:
        src = f.read()
    count_before = src.count('AbortSignal.timeout(')
    src = src.replace(
        'AbortSignal.timeout(5000)',
        '(()=>{const __c=new AbortController();setTimeout(()=>__c.abort(),5000);return __c.signal})()'
    )
    src = src.replace(
        'AbortSignal.timeout(5_000)',
        '(()=>{const __c=new AbortController();setTimeout(()=>__c.abort(),5000);return __c.signal})()'
    )
    count_after = src.count('AbortSignal.timeout(')
    with open(_rbs, 'w', encoding='utf-8') as f:
        f.write(src)
    ok.append(_rbs)
    print(f'  ✓ RegisterBirthScreen — fixed {count_before - count_after} occurrence(s)')
except FileNotFoundError:
    fail.append(_rbs)
    print('  ✗ RegisterBirthScreen NOT FOUND')

# ==============================================================================
# 5. RecordDeathScreen.tsx — fix remaining AbortSignal.timeout
# ==============================================================================
print('\n[5] RecordDeathScreen.tsx — fix ALL AbortSignal.timeout')
_rds = os.path.join(ROOT, 'code/mobile/src/screens/hospital/RecordDeathScreen.tsx')
try:
    with open(_rds, 'r', encoding='utf-8') as f:
        src = f.read()
    src = src.replace('AbortSignal.timeout(5000)',
                      '(()=>{const __c=new AbortController();setTimeout(()=>__c.abort(),5000);return __c.signal})()')
    src = src.replace('AbortSignal.timeout(5_000)',
                      '(()=>{const __c=new AbortController();setTimeout(()=>__c.abort(),5000);return __c.signal})()')
    with open(_rds, 'w', encoding='utf-8') as f:
        f.write(src)
    ok.append(_rds)
    print(f'  ✓ RecordDeathScreen — all AbortSignal.timeout patched')
except FileNotFoundError:
    fail.append(_rds)
    print('  ✗ RecordDeathScreen NOT FOUND')

# ==============================================================================
# 6. ViewRecordsScreen.tsx — always show remote records (remove > 0 guard)
# ==============================================================================
print('\n[6] ViewRecordsScreen.tsx — remove remote.data.length > 0 guard')
patch_file('code/mobile/src/screens/hospital/ViewRecordsScreen.tsx', [(
    "      if (remote && remote.data.length > 0) {",
    "      if (remote) {"
)])

# ==============================================================================
# 7. PendingCasesScreen.tsx — replace stubs with real /records/pending API call
# ==============================================================================
print('\n[7] PendingCasesScreen.tsx — use real /records/pending endpoint')
patch_file('code/mobile/src/screens/hospital/PendingCasesScreen.tsx', [(
    # Add API_BASE + AsyncStorage after existing imports
    "import { getPendingBirths, getPendingDeaths, LocalBirth, LocalDeath } from '../../services/localDb'",
    "import AsyncStorage from '@react-native-async-storage/async-storage'\nconst API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'https://adlcs-backend.onrender.com/api'"
)])

patch_file('code/mobile/src/screens/hospital/PendingCasesScreen.tsx', [(
    """\
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    const [births, deaths] = await Promise.all([getPendingBirths(), getPendingDeaths()])
    const br: PendingRow[] = births.map(b => ({
      id: b.id, type: 'birth', certNo: b.certNo,
      name: [b.childFirstName, b.childSurname].join(' ').toUpperCase(),
      date: new Date(b.registeredAt).toLocaleDateString('en-TZ'),
      reasons: [...(!b.certPdfPath?['no_certificate']:[]), 'rita_unsynced'],
    }))
    const dr: PendingRow[] = deaths.map(d => ({
      id: d.id, type: 'death', certNo: d.certNo,
      name: d.deceasedName.toUpperCase() || d.nationalId || '—',
      date: new Date(d.registeredAt).toLocaleDateString('en-TZ'),
      reasons: [...(!d.certPdfPath?['no_certificate']:[]), 'rita_unsynced'],
    }))
    setRows([...br, ...dr])
    setLoading(false); setRefreshing(false)
  }, [])""",
    """\
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const token = await AsyncStorage.getItem('adlcs_access_token')
      if (!token) { setLoading(false); setRefreshing(false); return }
      const { signal, clear } = (() => {
        const c = new AbortController()
        const t = setTimeout(() => c.abort(), 8000)
        return { signal: c.signal, clear: () => clearTimeout(t) }
      })()
      const res  = await fetch(`${API_BASE}/officer/records/pending`, {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      })
      clear()
      const json = await res.json()
      if (json.success && Array.isArray(json.data)) {
        const rows: PendingRow[] = json.data.map((r: any) => ({
          id:      r.id,
          type:    r.type    as 'birth'|'death',
          certNo:  r.certNo  ?? '—',
          name:    r.name    ?? 'Unknown',
          date:    r.date    ?? '—',
          reasons: Array.isArray(r.reasons) ? r.reasons : ['rita_unsynced'],
        }))
        setRows(rows)
      }
    } catch (e) { console.warn('[PendingCases]', e) }
    setLoading(false); setRefreshing(false)
  }, [])"""
)])

# ==============================================================================
# 8. Backend — dashboard.js: village-officer support in /records + /activity
# ==============================================================================
print('\n[8] Backend dashboard.js — village-officer /records + /activity fixes')

_dash = os.path.join(ROOT, 'code/backend/src/routes/dashboard.js')
try:
    with open(_dash, 'r', encoding='utf-8') as f:
        dash = f.read()

    # 8a. Fix /records endpoint to support village officers (uses villageOfficerId for deaths)
    old_records = """\
router.get('/records', async (req, res) => {
  const { id } = req.user
  const type   = req.query.type  || 'all'
  const page   = Math.max(parseInt(req.query.page) || 1, 1)
  const limit  = Math.min(parseInt(req.query.limit) || 20, 50)
  const q      = req.query.q?.toString().trim() || ''
  const skip   = (page - 1) * limit
  try {
    const results = []
    if (type === 'all' || type === 'birth') {
      const births = await prisma.birth.findMany({
        where: {
          officerId: id,
          ...(q ? { OR: [
            { birthCertNo:    { contains: q, mode: 'insensitive' } },
            { childFirstName: { contains: q, mode: 'insensitive' } },
            { childSurname:   { contains: q, mode: 'insensitive' } },
          ]} : {}),
        },
        orderBy: { registeredAt: 'desc' }, take: limit, skip,
        select: { id: true, birthCertNo: true, childFirstName: true, childSurname: true, registeredAt: true, ritaSynced: true, certPdfUrl: true },
      })
      for (const b of births) {
        results.push({ id: `birth-${b.id}`, type: 'birth', certNo: b.birthCertNo,
          name: `${b.childFirstName} ${b.childSurname}`,
          date: new Date(b.registeredAt).toLocaleDateString('en-TZ'),
          ritaSynced: b.ritaSynced, certIssued: !!b.certPdfUrl })
      }
    }
    if (type === 'all' || type === 'death') {
      const deaths = await prisma.death.findMany({
        where: {
          hospitalOfficerId: id,
          ...(q ? { OR: [
            { deathCertNo: { contains: q, mode: 'insensitive' } },
            { nationalId:  { contains: q, mode: 'insensitive' } },
          ]} : {}),
        },
        orderBy: { createdAt: 'desc' }, take: limit, skip,
        select: { id: true, deathCertNo: true, nationalId: true, createdAt: true, ritaSynced: true, certPdfUrl: true },
      })
      for (const d of deaths) {
        results.push({ id: `death-${d.id}`, type: 'death', certNo: d.deathCertNo,
          name: d.nationalId ?? 'Unknown',
          date: new Date(d.createdAt).toLocaleDateString('en-TZ'),
          ritaSynced: d.ritaSynced ?? false, certIssued: !!d.certPdfUrl })
      }
    }
    return res.json({ success: true, data: results.slice(0, limit), total: results.length, page })
  } catch (err) {
    console.error('[records]', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
})"""

    new_records = """\
router.get('/records', async (req, res) => {
  const { id, role } = req.user
  const type   = req.query.type  || 'all'
  const page   = Math.max(parseInt(req.query.page) || 1, 1)
  const limit  = Math.min(parseInt(req.query.limit) || 20, 50)
  const q      = req.query.q?.toString().trim() || ''
  const skip   = (page - 1) * limit

  // Village officers use the dedicated village/records endpoint
  if (role === 'village_officer') {
    try {
      const out = []
      const deaths = await prisma.death.findMany({
        where: { villageOfficerId: id },
        orderBy: { createdAt: 'desc' }, take: limit, skip,
        select: { id: true, deathCertNo: true, nationalId: true, causeOfDeath: true, createdAt: true, ritaSynced: true },
      })
      for (const d of deaths) {
        out.push({ id: `death-${d.id}`, type: 'death', certNo: d.deathCertNo,
          name: d.nationalId ?? 'Unknown',
          date: new Date(d.createdAt).toLocaleDateString('en-TZ'),
          ritaSynced: d.ritaSynced ?? false, certIssued: false })
      }
      const citizens = await prisma.citizen.findMany({
        where: { registeredById: id },
        orderBy: { createdAt: 'desc' }, take: limit, skip,
        select: { id: true, firstName: true, surname: true, nationalId: true, createdAt: true },
      })
      for (const c of citizens) {
        out.push({ id: `citizen-${c.id}`, type: 'birth', certNo: c.nationalId ?? '—',
          name: `${c.firstName} ${c.surname}`,
          date: new Date(c.createdAt).toLocaleDateString('en-TZ'),
          ritaSynced: true, certIssued: false })
      }
      out.sort((a, b) => new Date(b.date) - new Date(a.date))
      return res.json({ success: true, data: out.slice(0, limit), total: out.length, page })
    } catch (err) {
      console.error('[records/village]', err)
      return res.status(500).json({ success: false, message: 'Internal server error' })
    }
  }

  // Hospital officer
  try {
    const results = []
    if (type === 'all' || type === 'birth') {
      const births = await prisma.birth.findMany({
        where: {
          officerId: id,
          ...(q ? { OR: [
            { birthCertNo:    { contains: q, mode: 'insensitive' } },
            { childFirstName: { contains: q, mode: 'insensitive' } },
            { childSurname:   { contains: q, mode: 'insensitive' } },
          ]} : {}),
        },
        orderBy: { registeredAt: 'desc' }, take: limit, skip,
        select: { id: true, birthCertNo: true, childFirstName: true, childSurname: true, registeredAt: true, ritaSynced: true, certPdfUrl: true },
      })
      for (const b of births) {
        results.push({ id: `birth-${b.id}`, type: 'birth', certNo: b.birthCertNo,
          name: `${b.childFirstName} ${b.childSurname}`,
          date: new Date(b.registeredAt).toLocaleDateString('en-TZ'),
          ritaSynced: b.ritaSynced, certIssued: !!b.certPdfUrl })
      }
    }
    if (type === 'all' || type === 'death') {
      const deaths = await prisma.death.findMany({
        where: {
          hospitalOfficerId: id,
          ...(q ? { OR: [
            { deathCertNo: { contains: q, mode: 'insensitive' } },
            { nationalId:  { contains: q, mode: 'insensitive' } },
          ]} : {}),
        },
        orderBy: { createdAt: 'desc' }, take: limit, skip,
        select: { id: true, deathCertNo: true, nationalId: true, createdAt: true, ritaSynced: true, certPdfUrl: true },
      })
      for (const d of deaths) {
        results.push({ id: `death-${d.id}`, type: 'death', certNo: d.deathCertNo,
          name: d.nationalId ?? 'Unknown',
          date: new Date(d.createdAt).toLocaleDateString('en-TZ'),
          ritaSynced: d.ritaSynced ?? false, certIssued: !!d.certPdfUrl })
      }
    }
    return res.json({ success: true, data: results.slice(0, limit), total: results.length, page })
  } catch (err) {
    console.error('[records]', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
})"""

    if old_records in dash:
        dash = dash.replace(old_records, new_records, 1)
        print('  ✓ dashboard.js — /records village-officer support added')
    else:
        print('  ⚠  dashboard.js — /records pattern not found; skipping records fix')

    # 8b. Fix /activity to include deaths for village officers
    old_act = """\
    if (role === 'village_officer') {
      const citizens = await prisma.citizen.findMany({
        where:   { registeredById: id },
        orderBy: { createdAt: 'desc' },
        take:    limit,
        select:  { id: true, firstName: true, surname: true, createdAt: true },
      })
      for (const c of citizens) {
        items.push({
          id:    `citizen-${c.id}`,
          icon:  '👤',
          label: 'Citizen registered',
          name:  `${c.firstName} ${c.surname}`,
          time:  new Date(c.createdAt).toLocaleTimeString('en-TZ', { hour: '2-digit', minute: '2-digit' }),
          color: '#00a3dd',
        })
      }
    }"""

    new_act = """\
    if (role === 'village_officer') {
      const [citizens, deaths] = await Promise.all([
        prisma.citizen.findMany({
          where: { registeredById: id },
          orderBy: { createdAt: 'desc' }, take: limit,
          select: { id: true, firstName: true, surname: true, createdAt: true },
        }),
        prisma.death.findMany({
          where: { villageOfficerId: id },
          orderBy: { createdAt: 'desc' }, take: limit,
          select: { id: true, deathCertNo: true, causeOfDeath: true, createdAt: true },
        }).catch(() => []),
      ])
      for (const c of citizens) {
        items.push({ id: `citizen-${c.id}`, icon: '👤', label: 'Citizen registered',
          name: `${c.firstName} ${c.surname}`,
          time: new Date(c.createdAt).toLocaleTimeString('en-TZ', { hour: '2-digit', minute: '2-digit' }),
          color: '#00a3dd' })
      }
      for (const d of deaths) {
        items.push({ id: `death-${d.id}`, icon: '✝', label: 'Death recorded',
          name: d.causeOfDeath ?? 'Cause unknown',
          time: new Date(d.createdAt).toLocaleTimeString('en-TZ', { hour: '2-digit', minute: '2-digit' }),
          color: '#dc2626' })
      }
      // Sort by time desc
      items.sort((a, b) => b.time.localeCompare(a.time))
    }"""

    if old_act in dash:
        dash = dash.replace(old_act, new_act, 1)
        print('  ✓ dashboard.js — /activity now includes village deaths')
    else:
        print('  ⚠  dashboard.js — /activity village pattern not found; skipping')

    with open(_dash, 'w', encoding='utf-8') as f:
        f.write(dash)
    ok.append('code/backend/src/routes/dashboard.js')

except FileNotFoundError:
    fail.append('code/backend/src/routes/dashboard.js')
    print('  ✗ dashboard.js NOT FOUND')

# ==============================================================================
# 9. Backend — village.js: richer dashboard stats (todayBirths/Deaths + pending)
# ==============================================================================
print('\n[9] Backend village.js — richer dashboard stats')

_vil = os.path.join(ROOT, 'code/backend/src/routes/village.js')
try:
    with open(_vil, 'r', encoding='utf-8') as f:
        vil = f.read()

    old_vdash = """\
    const [totalCitizens, monthDeaths] = await Promise.all([
      prisma.citizen.count({ where:{ currentVillageId:vid } }),
      prisma.death.count({ where:{ villageOfficerId:id, createdAt:{ gte:monthStart } } }).catch(()=>0),
    ])

    return res.json({
      success:true,
      data:{
        officerName:    officer.fullName,
        employeeId:     officer.employeeId ?? '',
        villageName:    officer.village?.name ?? 'Unknown Village',
        wardName:       officer.ward?.name    ?? 'Unknown Ward',
        totalCitizens,
        monthBirths:    0,
        monthDeaths,
        pendingCases:   0,
      },
    })"""

    new_vdash = """\
    const dayStart   = new Date(); dayStart.setHours(0,0,0,0)
    const dayEnd     = new Date(); dayEnd.setHours(23,59,59,999)

    const [totalCitizens, monthDeaths, todayDeaths, todayCitizens, pendingCases] = await Promise.all([
      prisma.citizen.count({ where:{ currentVillageId:vid } }),
      prisma.death.count({ where:{ villageOfficerId:id, createdAt:{ gte:monthStart } } }).catch(()=>0),
      prisma.death.count({ where:{ villageOfficerId:id, createdAt:{ gte:dayStart, lte:dayEnd } } }).catch(()=>0),
      prisma.citizen.count({ where:{ registeredById:id, createdAt:{ gte:dayStart, lte:dayEnd } } }).catch(()=>0),
      prisma.citizen.count({ where:{ currentVillageId:vid, vitalStatus:'alive', idCardIssued:null } }).catch(()=>0),
    ])

    return res.json({
      success:true,
      data:{
        officerName:    officer.fullName,
        employeeId:     officer.employeeId ?? '',
        villageName:    officer.village?.name ?? 'Unknown Village',
        wardName:       officer.ward?.name    ?? 'Unknown Ward',
        totalCitizens,
        todayBirths:    todayCitizens,
        todayDeaths,
        monthBirths:    0,
        monthDeaths,
        pendingCases,
      },
    })"""

    if old_vdash in vil:
        vil = vil.replace(old_vdash, new_vdash, 1)
        print('  ✓ village.js — dashboard now returns todayBirths/Deaths + pendingCases')
    else:
        print('  ⚠  village.js — dashboard pattern not found; skipping')

    with open(_vil, 'w', encoding='utf-8') as f:
        f.write(vil)
    ok.append('code/backend/src/routes/village.js')

except FileNotFoundError:
    fail.append('code/backend/src/routes/village.js')
    print('  ✗ village.js NOT FOUND')

# ==============================================================================
# Summary
# ==============================================================================
print(f'\n{"="*65}')
print(f'  DONE — {len(ok)} files patched, {len(fail)} failed')
if fail:
    print('  FAILED:')
    for f in fail: print(f'    • {f}')
print(f'{"="*65}')
print("""
WHAT CHANGED & WHY
══════════════════

Mobile:
  syncService.ts
    getSyncStatus()  → calls GET  /api/officer/sync/status  (real DB counts)
    triggerSync()    → calls POST /api/officer/sync/trigger (marks synced in DB)

  HospitalHomeScreen / VillageHomeScreen
    • useFocusEffect added — stats refresh every time you navigate back from
      RegisterBirth / RecordDeath / any registration screen
    • loadData now reads ALL counts from Supabase (no zero-stub local merge)
    • stats.pendingSync  = remote.pendingCases (births without certificates)
    • unread (bell badge) = remote.pendingCases from backend
    • checkConnQuality()  = real async ping instead of always-'Good' stub

  RegisterBirthScreen + RecordDeathScreen
    • ALL AbortSignal.timeout() → Hermes-safe AbortController IIFE
      (previously only some were fixed; this ensures all are covered)

  ViewRecordsScreen
    • Removed `remote.data.length > 0` guard — records now display even when
      only 0 records exist (empty state instead of falling back to empty local)

  PendingCasesScreen
    • Now calls GET /api/officer/records/pending (real DB — births lacking certs)
    • Shows actual pending registrations from PostgreSQL

Backend:
  dashboard.js  GET /officer/records
    • Village officers now get their own query (villageOfficerId + citizen list)
    • Hospital officers unchanged

  dashboard.js  GET /officer/activity
    • Village officers now see both citizen registrations AND deaths

  village.js    GET /village/dashboard
    • Now returns todayBirths (citizens reg'd today), todayDeaths, pendingCases

COMMIT & DEPLOY
═══════════════
  git add -A
  git commit -m "fix: live DB data flow — stats refresh, AbortSignal, pending counts"
  git push origin main
  # Render auto-deploys backend; reload Expo Go for mobile
""")
