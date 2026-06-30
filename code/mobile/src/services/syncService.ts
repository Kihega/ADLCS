/**
 * syncService.ts  v10.0  ONLINE-ONLY — real backend API
 *
 * Every function that reads or writes data goes to
 *   https://adlcs.onrender.com  →  Supabase PostgreSQL
 *
 * DATA FLOW: Mobile → Render (Node/Express) → Supabase (PostgreSQL)
 *   • No SQLite, no local DB, no offline queue.
 *   • No NIN generated at birth — only BID (Birth Registration ID) + cert no.
 *   • NIN is issued by Village Officer at age 18 using the BID.
 * AbortSignal.timeout() NOT used (Hermes-incompatible); uses makeSignal() instead.
 */

import AsyncStorage from '@react-native-async-storage/async-storage'
import { LocalBirth, LocalDeath } from './localDb'
import { resolveBase, resetResolver } from './apiResolver'

// API_BASE is resolved dynamically — see apiResolver.ts

export type ConnQuality = 'Good' | 'Fair' | 'Offline'
export interface SyncResult {
  synced: number
  failed: number
  offline: boolean
}

// ── Always online in online-only mode ─────────────────────────────────────────
export function isOnline(): boolean {
  return true
}
export function getConnQuality(): ConnQuality {
  return 'Good'
}

// ── Hermes-safe abort helper ───────────────────────────────────────────────────
function makeSignal(ms: number): { signal: AbortSignal; clear: () => void } {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  return { signal: ctrl.signal, clear: () => clearTimeout(timer) }
}

// ── Token ─────────────────────────────────────────────────────────────────────
async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem('tzcrvs_access_token')
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────
export async function apiPost(endpoint: string, body: object): Promise<any> {
  const token = await getToken()
  if (!token) throw new Error('No auth token')
  const base = await resolveBase()
  const { signal, clear } = makeSignal(15_000)
  try {
    const res = await fetch(`${base}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal,
    })
    clear()
    if (!res.ok) {
      // Try to surface the backend's JSON `message` instead of a bare status code
      let detail = `HTTP ${res.status}`
      try {
        const j = await res.json()
        if (j?.message) detail = j.message
      } catch {}
      throw new Error(detail)
    }
    return res.json()
  } catch (e) {
    clear()
    throw e
  }
}

export async function apiGet(endpoint: string): Promise<any> {
  const token = await getToken()
  if (!token) throw new Error('No auth token')
  const base = await resolveBase()
  const { signal, clear } = makeSignal(10_000)
  try {
    const res = await fetch(`${base}${endpoint}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal,
    })
    clear()
    if (!res.ok) {
      // Try to surface the backend's JSON `message` instead of a bare status code
      let detail = `HTTP ${res.status}`
      try {
        const j = await res.json()
        if (j?.message) detail = j.message
      } catch {}
      throw new Error(detail)
    }
    return res.json()
  } catch (e) {
    clear()
    throw e
  }
}

// ── Connection quality — real ping ────────────────────────────────────────────
export async function checkConnQuality(): Promise<ConnQuality> {
  const { signal, clear } = makeSignal(4000)
  try {
    const t = Date.now()
    const base = await resolveBase()
    const res = await fetch(`${base}/health`, { signal })
    clear()
    if (!res.ok) return 'Fair'
    return Date.now() - t < 800 ? 'Good' : 'Fair'
  } catch (err) {
    clear()
    resetResolver() // force re-probe next call after a connectivity event
    return 'Offline'
  }
}

// ── Save birth → POST directly to backend → Supabase ─────────────────────────
export async function saveAndSyncBirth(
  data: Omit<LocalBirth, 'id' | 'registeredAt' | 'synced' | 'certPdfPath'>
): Promise<{ birth: LocalBirth; syncedRemote: boolean }> {
  const now = new Date().toISOString()
  const id = `online-${Date.now()}`
  const birth: LocalBirth = { ...data, id, registeredAt: now, synced: 0, certPdfPath: '' }

  try {
    const json = await apiPost('/officer/birth/sync', {
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
    })
    if (json.success || json.duplicate) {
      await AsyncStorage.setItem('tzcrvs_last_sync', now)
      return { birth: { ...birth, synced: 1 }, syncedRemote: true }
    }
  } catch (e) {
    console.warn('[saveAndSyncBirth]', e)
  }

  return { birth, syncedRemote: false }
}

// ── Save death → POST directly to backend → Supabase ─────────────────────────
export async function saveAndSyncDeath(
  data: Omit<LocalDeath, 'id' | 'registeredAt' | 'synced' | 'certPdfPath'>
): Promise<{ death: LocalDeath; syncedRemote: boolean }> {
  const now = new Date().toISOString()
  const id = `online-${Date.now()}`
  const death: LocalDeath = { ...data, id, registeredAt: now, synced: 0, certPdfPath: '' }

  try {
    const json = await apiPost('/officer/death/sync', {
      localId: id,
      deathCertNo: data.certNo,
      nationalId: data.nationalId,
      causeOfDeath: data.causeOfDeath,
      dateOfDeath: data.dateOfDeath,
      locationType: data.locationType,
      category: data.category,
      informantName: data.informantName,
      registeredAt: now,
    })
    if (json.success || json.duplicate) {
      await AsyncStorage.setItem('tzcrvs_last_sync', now)
      return { death: { ...death, synced: 1 }, syncedRemote: true }
    }
  } catch (e) {
    console.warn('[saveAndSyncDeath]', e)
  }

  return { death, syncedRemote: false }
}

// ── Remote data fetchers ──────────────────────────────────────────────────────
export async function fetchRemoteDashboard(): Promise<any | null> {
  try {
    const json = await apiGet('/officer/dashboard')
    return json.success ? json.data : null
  } catch {
    return null
  }
}

export async function fetchRemoteActivity(): Promise<any[]> {
  try {
    const json = await apiGet('/officer/activity?limit=5')
    return json.success ? json.data : []
  } catch {
    return []
  }
}

export async function fetchRemoteRecords(
  type: 'all' | 'birth' | 'death',
  page: number,
  query: string
): Promise<{ data: any[]; total: number } | null> {
  try {
    const params = new URLSearchParams({
      type,
      page: String(page),
      limit: '30',
      ...(query ? { q: query } : {}),
    })
    const json = await apiGet(`/officer/records?${params}`)
    return json.success ? { data: json.data, total: json.total ?? json.data.length } : null
  } catch {
    return null
  }
}

export async function fetchOfficerProfile(): Promise<any | null> {
  try {
    const json = await apiGet('/officer/profile')
    return json.success ? json.data : null
  } catch {
    return null
  }
}

// ── Sync status — from real backend ──────────────────────────────────────────
export async function getSyncStatus() {
  try {
    const json = await apiGet('/officer/sync/status')
    if (json.success && json.data) {
      await AsyncStorage.setItem(
        'tzcrvs_last_sync',
        json.data.lastSyncAt ?? new Date().toISOString()
      )
      return {
        unsyncedBirths: json.data.unsyncedBirths ?? 0,
        unsyncedDeaths: json.data.unsyncedDeaths ?? 0,
        lastSyncAt: json.data.lastSyncAt ?? null,
      }
    }
  } catch {}
  const lastSync = await AsyncStorage.getItem('tzcrvs_last_sync')
  return { unsyncedBirths: 0, unsyncedDeaths: 0, lastSyncAt: lastSync }
}

// ── Trigger sync — marks all pending records as synced in DB ─────────────────
export async function triggerSync(): Promise<SyncResult> {
  try {
    const json = await apiPost('/officer/sync/trigger', {})
    return {
      synced: json.data?.synced ?? 0,
      failed: 0,
      offline: false,
    }
  } catch {
    return { synced: 0, failed: 0, offline: false }
  }
}

// ── No-ops (API compatibility) ────────────────────────────────────────────────
export async function init(_getter?: () => Promise<string | null>): Promise<void> {}
export function stop(): void {}
