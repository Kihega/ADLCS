/**
 * syncService.ts  v8.0  ONLINE-ONLY
 *
 * All data goes directly to backend (https://adlcs-backend.onrender.com).
 * No offline SQLite queue — every call is a live API request.
 *
 * AbortSignal.timeout() is NOT used (Hermes incompatible).
 * Timeouts use AbortController + setTimeout instead.
 *
 * Exports:
 *   apiGet / apiPost          — authenticated HTTP helpers
 *   isOnline / getConnQuality — always-online stubs
 *   saveAndSyncBirth/Death    — POST directly to backend
 *   fetchRemoteDashboard/Activity/Records/OfficerProfile
 *   checkConnQuality          — real ping to /api/health
 *   getSyncStatus             — stub (no local queue)
 *   triggerSync / init / stop — no-ops
 */

import AsyncStorage from '@react-native-async-storage/async-storage'
import { LocalBirth, LocalDeath } from './localDb'

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'https://adlcs-backend.onrender.com/api'

export type ConnQuality = 'Good' | 'Fair' | 'Offline'
export interface SyncResult { synced: number; failed: number; offline: boolean }

// ─── Online status — always true in online-only mode ──────────────────────────
export function isOnline(): boolean { return true }
export function getConnQuality(): ConnQuality { return 'Good' }

// ─── Abort-controller timeout helper (Hermes-safe) ────────────────────────────
function makeSignal(ms: number): { signal: AbortSignal; clear: () => void } {
  const ctrl  = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  return { signal: ctrl.signal, clear: () => clearTimeout(timer) }
}

// ─── Auth token ───────────────────────────────────────────────────────────────
async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem('adlcs_access_token')
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────
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

// ─── Connection quality check ──────────────────────────────────────────────────
export async function checkConnQuality(): Promise<ConnQuality> {
  const { signal, clear } = makeSignal(3000)
  try {
    const t = Date.now()
    await fetch(`${API_BASE}/health`, { signal })
    clear()
    return Date.now() - t < 700 ? 'Good' : 'Fair'
  } catch { clear(); return 'Offline' }
}

// ─── Save birth → POST directly to backend ────────────────────────────────────
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

// ─── Save death → POST directly to backend ────────────────────────────────────
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

// ─── Remote data fetchers ──────────────────────────────────────────────────────
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
      type, page: String(page), limit: '30', ...(query ? { q: query } : {})
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

// ─── Sync status — no local queue in online-only mode ─────────────────────────
export async function getSyncStatus() {
  const lastSync = await AsyncStorage.getItem('adlcs_last_sync')
  return { unsyncedBirths: 0, unsyncedDeaths: 0, lastSyncAt: lastSync }
}

// ─── No-ops (API compatibility with existing screen imports) ──────────────────
export async function triggerSync(): Promise<SyncResult> {
  return { synced: 0, failed: 0, offline: false }
}
export async function init(_getter?: () => Promise<string|null>): Promise<void> {}
export function stop(): void {}
