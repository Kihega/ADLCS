/**
 * syncService.ts  v6.0  PRODUCTION
 *
 * Online/Offline strategy:
 *   ONLINE  → save to local SQLite + immediately POST to remote API (Supabase via backend)
 *   OFFLINE → save to local SQLite only (synced=0)
 *   RECONNECT → auto-push all pending (synced=0) records to remote
 *
 * Exports:
 *   init(tokenGetter)    — call once in App.js
 *   stop()               — call on logout
 *   isOnline()           — current network state (boolean)
 *   getConnQuality()     — 'Good' | 'Fair' | 'Offline'
 *   triggerSync()        — manual sync from SyncDataScreen
 *   saveAndSyncBirth()   — save birth locally + push to remote if online
 *   saveAndSyncDeath()   — save death locally + push to remote if online
 *   fetchRemoteDashboard()
 *   fetchRemoteActivity()
 *   fetchRemoteRecords() — for ViewRecordsScreen
 *   getSyncStatus()
 */

import NetInfo, { NetInfoState } from '@react-native-community/netinfo'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  getPendingBirths, getPendingDeaths,
  markBirthSynced,  markDeathSynced,
  saveBirth, saveDeath,
  LocalBirth, LocalDeath,
} from './localDb'

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'https://adlcs-backend.onrender.com/api'

export type ConnQuality = 'Good' | 'Fair' | 'Offline'
export interface SyncResult { synced: number; failed: number; offline: boolean }
type TokenGetter = () => Promise<string | null>

// ─── Module-level state ────────────────────────────────────────────────────────
let _unsubscribe:  (() => void) | null = null
let _getToken:     TokenGetter | null = null
let _isSyncing = false
let _networkState: NetInfoState | null = null

// ─── Network state accessors ───────────────────────────────────────────────────
export function isOnline(): boolean {
  if (!_networkState) return false
  if (!_networkState.isConnected) return false
  // On Android, isInternetReachable may be null while still being determined.
  // Treat null as 'online' when the device reports isConnected=true so records
  // are not incorrectly queued as offline-only during normal operation.
  return _networkState.isInternetReachable !== false
}

export function getConnQuality(): ConnQuality {
  if (!isOnline()) return 'Offline'
  const type = _networkState?.type
  if (type === 'wifi' || type === 'ethernet') return 'Good'
  return 'Fair'
}

// ─── HTTP helpers ──────────────────────────────────────────────────────────────
async function getToken(): Promise<string | null> {
  return _getToken ? _getToken() : AsyncStorage.getItem('adlcs_access_token')
}

export async function apiPost(endpoint: string, body: object): Promise<any> {
  const token = await getToken()
  if (!token) throw new Error('No auth token')
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body:    JSON.stringify(body),
    signal:  AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function apiGet(endpoint: string): Promise<any> {
  const token = await getToken()
  if (!token) throw new Error('No auth token')
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal:  AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

// ─── Ping (for connection quality display) ────────────────────────────────────
export async function checkConnQuality(): Promise<ConnQuality> {
  const q = getConnQuality()
  if (q !== 'Offline') return q  // use NetInfo state first (faster)
  // Double-check with an actual request
  const t = Date.now()
  try {
    await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(3000) })
    return Date.now() - t < 700 ? 'Good' : 'Fair'
  } catch { return 'Offline' }
}

// ─── Save birth: local + immediate remote if online ───────────────────────────
export async function saveAndSyncBirth(
  data: Omit<LocalBirth, 'id'|'registeredAt'|'synced'|'certPdfPath'>
): Promise<{ birth: LocalBirth; syncedRemote: boolean }> {
  const birth = await saveBirth(data)

  if (!isOnline()) return { birth, syncedRemote: false }

  try {
    const json = await apiPost('/officer/birth/sync', {
      localId:          birth.id,
      birthCertNo:      birth.certNo,
      nationalId:       birth.nationalId,
      childFirstName:   birth.childFirstName,
      childMiddleName:  birth.childMiddleName,
      childSurname:     birth.childSurname,
      gender:           birth.gender.toLowerCase(),
      dateOfBirth:      birth.dateOfBirth,
      fatherNid:        birth.fatherNid,
      motherNid:        birth.motherNid,
      registeredAt:     birth.registeredAt,
    })
    if (json.success || json.duplicate) {
      await markBirthSynced(birth.id)
      await AsyncStorage.setItem('adlcs_last_sync', new Date().toISOString())
      return { birth: { ...birth, synced: 1 }, syncedRemote: true }
    }
  } catch (e) { console.warn('[saveAndSyncBirth] remote push failed:', e) }

  return { birth, syncedRemote: false }
}

// ─── Save death: local + immediate remote if online ───────────────────────────
export async function saveAndSyncDeath(
  data: Omit<LocalDeath, 'id'|'registeredAt'|'synced'|'certPdfPath'>
): Promise<{ death: LocalDeath; syncedRemote: boolean }> {
  const death = await saveDeath(data)

  if (!isOnline()) return { death, syncedRemote: false }

  try {
    const json = await apiPost('/officer/death/sync', {
      localId:      death.id,
      deathCertNo:  death.certNo,
      nationalId:   death.nationalId,
      causeOfDeath: death.causeOfDeath,
      dateOfDeath:  death.dateOfDeath,
      locationType: death.locationType,
      category:     death.category,
      informantName:death.informantName,
      registeredAt: death.registeredAt,
    })
    if (json.success || json.duplicate) {
      await markDeathSynced(death.id)
      await AsyncStorage.setItem('adlcs_last_sync', new Date().toISOString())
      return { death: { ...death, synced: 1 }, syncedRemote: true }
    }
  } catch (e) { console.warn('[saveAndSyncDeath] remote push failed:', e) }

  return { death, syncedRemote: false }
}

// ─── Bulk sync (all pending) ───────────────────────────────────────────────────
export async function triggerSync(): Promise<SyncResult> {
  if (_isSyncing) return { synced: 0, failed: 0, offline: !isOnline() }
  if (!isOnline()) return { synced: 0, failed: 0, offline: true }
  _isSyncing = true

  let synced = 0, failed = 0
  try {
    const [births, deaths] = await Promise.all([getPendingBirths(), getPendingDeaths()])

    for (const b of births) {
      try {
        const json = await apiPost('/officer/birth/sync', {
          localId: b.id, birthCertNo: b.certNo, nationalId: b.nationalId,
          childFirstName: b.childFirstName, childMiddleName: b.childMiddleName,
          childSurname: b.childSurname, gender: b.gender.toLowerCase(),
          dateOfBirth: b.dateOfBirth, fatherNid: b.fatherNid,
          motherNid: b.motherNid, registeredAt: b.registeredAt,
        })
        if (json.success || json.duplicate) { await markBirthSynced(b.id); synced++ }
        else failed++
      } catch { failed++ }
    }

    for (const d of deaths) {
      try {
        const json = await apiPost('/officer/death/sync', {
          localId: d.id, deathCertNo: d.certNo, nationalId: d.nationalId,
          causeOfDeath: d.causeOfDeath, dateOfDeath: d.dateOfDeath,
          locationType: d.locationType, category: d.category,
          informantName: d.informantName, registeredAt: d.registeredAt,
        })
        if (json.success || json.duplicate) { await markDeathSynced(d.id); synced++ }
        else failed++
      } catch { failed++ }
    }

    if (synced > 0) await AsyncStorage.setItem('adlcs_last_sync', new Date().toISOString())
  } finally { _isSyncing = false }

  return { synced, failed, offline: false }
}

// ─── Remote data fetchers ──────────────────────────────────────────────────────
export async function fetchRemoteDashboard(): Promise<any | null> {
  if (!isOnline()) return null
  try {
    const json = await apiGet('/officer/dashboard')
    return json.success ? json.data : null
  } catch { return null }
}

export async function fetchRemoteActivity(): Promise<any[]> {
  if (!isOnline()) return []
  try {
    const json = await apiGet('/officer/activity?limit=5')
    return json.success ? json.data : []
  } catch { return [] }
}

export async function fetchRemoteRecords(
  type: 'all'|'birth'|'death', page: number, query: string
): Promise<{ data: any[]; total: number } | null> {
  if (!isOnline()) return null
  try {
    const params = new URLSearchParams({ type, page: String(page), limit: '30', ...(query ? { q: query } : {}) })
    const json = await apiGet(`/officer/records?${params}`)
    return json.success ? { data: json.data, total: json.total ?? json.data.length } : null
  } catch { return null }
}

export async function fetchOfficerProfile(): Promise<any | null> {
  if (!isOnline()) return null
  try {
    const json = await apiGet('/officer/profile')
    return json.success ? json.data : null
  } catch { return null }
}

// ─── Sync status ───────────────────────────────────────────────────────────────
export async function getSyncStatus() {
  const [births, deaths, lastSync] = await Promise.all([
    getPendingBirths(), getPendingDeaths(),
    AsyncStorage.getItem('adlcs_last_sync'),
  ])
  return { unsyncedBirths: births.length, unsyncedDeaths: deaths.length, lastSyncAt: lastSync }
}

// ─── Network monitor ───────────────────────────────────────────────────────────
function onNetworkChange(state: NetInfoState): void {
  const wasOffline = !isOnline()
  _networkState = state
  const nowOnline = isOnline()
  if (wasOffline && nowOnline) {
    console.log('[SyncService] came online — triggering background sync')
    setTimeout(() => triggerSync(), 2000)
  }
}

export async function init(tokenGetter: TokenGetter): Promise<void> {
  _getToken = tokenGetter
  if (_unsubscribe) _unsubscribe()
  // Get current state immediately
  const state = await NetInfo.fetch()
  _networkState = state
  // Subscribe to changes
  _unsubscribe = NetInfo.addEventListener(onNetworkChange)
  // If already online, trigger sync for any previously queued records
  if (isOnline()) setTimeout(() => triggerSync(), 3000)
}

export function stop(): void {
  _unsubscribe?.()
  _unsubscribe  = null
  _getToken     = null
  _networkState = null
}