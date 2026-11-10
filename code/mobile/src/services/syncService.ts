/**
 * syncService.ts  v10.0  ONLINE-ONLY — real backend API
 *
 * Every function that reads or writes data goes to the backend URL
 * configured in EXPO_PUBLIC_API_URL (mobile/.env) → Supabase PostgreSQL.
 * No backend URL is ever hardcoded here — see apiResolver.ts.
 *   • No SQLite, no local DB, no offline queue.
 *   • No NIN generated at birth — only BID (Birth Registration ID) + cert no.
 *   • NIN is issued by NIDA (external); the BID is this system's primary ID.
 * AbortSignal.timeout() NOT used (Hermes-incompatible); uses makeSignal() instead.
 */

import AsyncStorage from '@react-native-async-storage/async-storage'
import NetInfo from '@react-native-community/netinfo'
import { LocalBirth, LocalDeath } from './localDb'
import { resolveBase, resetResolver } from './apiResolver'

// API_BASE is resolved dynamically — see apiResolver.ts

// ── PATCH-OFFLINE-QUEUE-2026 ───────────────────────────────────────────────────
// A registration must reach the central database directly whenever the
// device is online — no local storage involved. If (and only if) the direct
// POST cannot go through (offline, timeout, backend unreachable), the record
// is queued in AsyncStorage instead of being silently dropped, and is
// automatically retried the moment connectivity returns (or the next time
// triggerSync() runs). This does NOT reintroduce SQLite/local-first storage —
// it is a small pending-outbox for the rare case a submission can't reach
// the server immediately.
const PENDING_BIRTHS_KEY = 'tzcrvs_pending_births'
const PENDING_DEATHS_KEY = 'tzcrvs_pending_deaths'

// SESSION-2026: the offline outbox is keyed per officer, so one officer's
// unsynced records can never be pushed under another officer's account.
async function pendingKey(base: string): Promise<string> {
  try {
    const id = await AsyncStorage.getItem('tzcrvs_employee_id')
    return id ? `${base}_${id}` : base
  } catch {
    return base
  }
}

async function readQueue(key: string): Promise<any[]> {
  try {
    const raw = await AsyncStorage.getItem(key)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

async function writeQueue(key: string, items: any[]): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(items))
  } catch {
    /* best-effort */
  }
}

/** Pending birth registrations waiting to reach the central database. */
export async function getPendingBirths(): Promise<any[]> {
  return readQueue(await pendingKey(PENDING_BIRTHS_KEY))
}

/** Pending death registrations waiting to reach the central database. */
export async function getPendingDeaths(): Promise<any[]> {
  return readQueue(await pendingKey(PENDING_DEATHS_KEY))
}

/**
 * Retry every queued birth/death against the backend. Called on
 * triggerSync() and automatically when connectivity is restored.
 * Items that still fail stay queued for the next attempt.
 */
export async function flushPendingSync(): Promise<{ syncedBirths: number; syncedDeaths: number }> {
  let syncedBirths = 0
  let syncedDeaths = 0

  const births = await readQueue(await pendingKey(PENDING_BIRTHS_KEY))
  if (births.length) {
    const remaining: any[] = []
    for (const item of births) {
      try {
        const json = await apiPost('/officer/birth/sync', item.payload)
        if (json.success || json.duplicate) syncedBirths++
        else remaining.push(item)
      } catch {
        remaining.push(item)
      }
    }
    await writeQueue(await pendingKey(PENDING_BIRTHS_KEY), remaining)
  }

  const deaths = await readQueue(await pendingKey(PENDING_DEATHS_KEY))
  if (deaths.length) {
    const remaining: any[] = []
    for (const item of deaths) {
      try {
        const json = await apiPost('/officer/death/sync', item.payload)
        if (json.success || json.duplicate) syncedDeaths++
        else remaining.push(item)
      } catch {
        remaining.push(item)
      }
    }
    await writeQueue(await pendingKey(PENDING_DEATHS_KEY), remaining)
  }

  if (syncedBirths || syncedDeaths) {
    await AsyncStorage.setItem('tzcrvs_last_sync', new Date().toISOString())
  }
  return { syncedBirths, syncedDeaths }
}

// Auto-flush the moment the device comes back online.
let _wasConnected = true
NetInfo.addEventListener((state) => {
  const nowConnected = !!state.isConnected && state.isInternetReachable !== false
  if (nowConnected && !_wasConnected) {
    resetResolver()
    flushPendingSync().catch(() => {})
  }
  _wasConnected = nowConnected
})

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

// PATCH-MIGRATION-2026: PATCH verb helper — mirrors apiPost, used by the
// migration approve/reject action (PATCH /village/migration/:id/respond).
export async function apiPatch(endpoint: string, body: object): Promise<any> {
  const token = await getToken()
  if (!token) throw new Error('No auth token')
  const base = await resolveBase()
  const { signal, clear } = makeSignal(15_000)
  try {
    const res = await fetch(`${base}${endpoint}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal,
    })
    clear()
    if (!res.ok) {
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
  try {
    // PATCH-V3-2026-11: resolve first (may wait for a cold start), THEN start the
    // timer - the old code started a 4s timer before the probe, so a slow
    // wake-up was reported as "Offline". Any HTTP answer = reachable.
    const base = await resolveBase()
    const { signal, clear } = makeSignal(8000)
    const t = Date.now()
    try {
      await fetch(`${base}/health/live`, { signal })
      clear()
    } catch (e) {
      clear()
      throw e
    }
    return Date.now() - t < 1500 ? 'Good' : 'Fair'
  } catch (err) {
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
      fatherNid: data.fatherNid, // Birth ID or NIN, as entered
      motherNid: data.motherNid,
      fatherName: data.fatherName,
      motherName: data.motherName,
      originVillageId: data.originVillageId,
      registeredAt: now,
    })
    if (json.success || json.duplicate) {
      await AsyncStorage.setItem('tzcrvs_last_sync', now)
      return { birth: { ...birth, synced: 1 }, syncedRemote: true }
    }
  } catch (e) {
    console.warn('[saveAndSyncBirth]', e)
  }

  // Direct save failed (offline / backend unreachable) — queue for retry
  // instead of losing the registration.
  const queued = await readQueue(await pendingKey(PENDING_BIRTHS_KEY))
  queued.push({
    localId: id,
    queuedAt: now,
    payload: {
      localId: id,
      birthCertNo: data.certNo,
      birthId: data.birthId,
      childFirstName: data.childFirstName,
      childMiddleName: data.childMiddleName,
      childSurname: data.childSurname,
      gender: data.gender.toLowerCase(),
      dateOfBirth: data.dateOfBirth,
      fatherNid: data.fatherNid, // Birth ID or NIN, as entered
      motherNid: data.motherNid,
      fatherName: data.fatherName,
      motherName: data.motherName,
      originVillageId: data.originVillageId,
      registeredAt: now,
    },
  })
  await writeQueue(await pendingKey(PENDING_BIRTHS_KEY), queued)

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

  // Direct save failed (offline / backend unreachable) — queue for retry
  // instead of losing the registration.
  const queued = await readQueue(await pendingKey(PENDING_DEATHS_KEY))
  queued.push({
    localId: id,
    queuedAt: now,
    payload: {
      localId: id,
      deathCertNo: data.certNo,
      nationalId: data.nationalId,
      causeOfDeath: data.causeOfDeath,
      dateOfDeath: data.dateOfDeath,
      locationType: data.locationType,
      category: data.category,
      informantName: data.informantName,
      registeredAt: now,
    },
  })
  await writeQueue(await pendingKey(PENDING_DEATHS_KEY), queued)

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
  // First retry anything queued from a previous failed direct-save attempt.
  const { syncedBirths, syncedDeaths } = await flushPendingSync()
  const pendingLeft =
    (await readQueue(await pendingKey(PENDING_BIRTHS_KEY))).length + (await readQueue(await pendingKey(PENDING_DEATHS_KEY))).length

  try {
    const json = await apiPost('/officer/sync/trigger', {})
    return {
      synced: (json.data?.synced ?? 0) + syncedBirths + syncedDeaths,
      failed: pendingLeft,
      offline: false,
    }
  } catch {
    return { synced: syncedBirths + syncedDeaths, failed: pendingLeft, offline: pendingLeft > 0 }
  }
}

// ── No-ops (API compatibility) ────────────────────────────────────────────────
export async function init(_getter?: () => Promise<string | null>): Promise<void> {}
export function stop(): void {}
