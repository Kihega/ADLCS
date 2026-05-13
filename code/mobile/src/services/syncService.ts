/**
 * syncService.ts — Offline-First Sync Manager
 *
 * Monitors network connectivity. When the device comes online, automatically
 * pushes all locally stored births and deaths to the backend.
 *
 * Usage:
 *   SyncService.init(getToken)   // call once in App.js after login
 *   SyncService.triggerSync()    // call manually from SyncDataScreen
 *   SyncService.stop()           // call on logout
 */

import NetInfo, { NetInfoState } from '@react-native-community/netinfo'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { getPendingBirths, getPendingDeaths, markBirthSynced, markDeathSynced, LocalBirth, LocalDeath } from './localDb'

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'https://adlcs-backend.onrender.com/api'

// ─── Types ─────────────────────────────────────────────────────────────────────
export interface SyncResult { synced: number; failed: number; offline: boolean }
type TokenGetter = () => Promise<string | null>

// ─── State ────────────────────────────────────────────────────────────────────
let _unsubscribe: (() => void) | null = null
let _getToken: TokenGetter | null = null
let _isSyncing = false

// ─── API helpers ───────────────────────────────────────────────────────────────
async function apiPost(endpoint: string, body: object, token: string): Promise<any> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body:    JSON.stringify(body),
    signal:  AbortSignal.timeout(15_000),
  })
  return res.json()
}

async function apiGet(endpoint: string, token: string): Promise<any> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal:  AbortSignal.timeout(10_000),
  })
  return res.json()
}

// ─── Ping ──────────────────────────────────────────────────────────────────────
export type ConnQuality = 'Good' | 'Fair' | 'Offline'
export async function checkConnQuality(): Promise<ConnQuality> {
  const t = Date.now()
  try {
    await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(3000) })
    return Date.now() - t < 700 ? 'Good' : 'Fair'
  } catch { return 'Offline' }
}

// ─── Fetch dashboard from backend (falls back to cache) ───────────────────────
export async function fetchRemoteDashboard(token: string): Promise<any | null> {
  try {
    const json = await apiGet('/officer/dashboard', token)
    return json.success ? json.data : null
  } catch { return null }
}

export async function fetchRemoteActivity(token: string): Promise<any[]> {
  try {
    const json = await apiGet('/officer/activity?limit=5', token)
    return json.success ? json.data : []
  } catch { return [] }
}

// ─── Sync births ───────────────────────────────────────────────────────────────
async function syncBirth(b: LocalBirth, token: string): Promise<boolean> {
  try {
    const payload = {
      localId:        b.id,
      birthCertNo:    b.certNo,
      nationalId:     b.nationalId,
      childFirstName: b.childFirstName,
      childMiddleName:b.childMiddleName,
      childSurname:   b.childSurname,
      gender:         b.gender.toLowerCase(),
      dateOfBirth:    b.dateOfBirth,
      fatherNid:      b.fatherNid,
      motherNid:      b.motherNid,
      registeredAt:   b.registeredAt,
    }
    const json = await apiPost('/officer/birth/sync', payload, token)
    if (json.success || json.duplicate) {
      await markBirthSynced(b.id)
      return true
    }
    return false
  } catch { return false }
}

// ─── Sync deaths ───────────────────────────────────────────────────────────────
async function syncDeath(d: LocalDeath, token: string): Promise<boolean> {
  try {
    const payload = {
      localId:      d.id,
      deathCertNo:  d.certNo,
      nationalId:   d.nationalId,
      causeOfDeath: d.causeOfDeath,
      dateOfDeath:  d.dateOfDeath,
      locationType: d.locationType,
      category:     d.category,
      informantName:d.informantName,
      registeredAt: d.registeredAt,
    }
    const json = await apiPost('/officer/death/sync', payload, token)
    if (json.success || json.duplicate) {
      await markDeathSynced(d.id)
      return true
    }
    return false
  } catch { return false }
}

// ─── Main sync function ────────────────────────────────────────────────────────
export async function triggerSync(): Promise<SyncResult> {
  if (_isSyncing) return { synced: 0, failed: 0, offline: false }
  _isSyncing = true

  const token = _getToken ? await _getToken() : await AsyncStorage.getItem('adlcs_access_token')
  if (!token) { _isSyncing = false; return { synced: 0, failed: 0, offline: true } }

  const quality = await checkConnQuality()
  if (quality === 'Offline') { _isSyncing = false; return { synced: 0, failed: 0, offline: true } }

  let synced = 0; let failed = 0

  try {
    const [births, deaths] = await Promise.all([getPendingBirths(), getPendingDeaths()])
    for (const b of births) {
      const ok = await syncBirth(b, token)
      ok ? synced++ : failed++
    }
    for (const d of deaths) {
      const ok = await syncDeath(d, token)
      ok ? synced++ : failed++
    }
    if (synced > 0) {
      await AsyncStorage.setItem('adlcs_last_sync', new Date().toISOString())
    }
  } catch (e) { console.warn('[SyncService] Error during sync:', e) }

  _isSyncing = false
  return { synced, failed, offline: false }
}

// ─── Network monitor ───────────────────────────────────────────────────────────
function onNetworkChange(state: NetInfoState): void {
  if (state.isConnected && state.isInternetReachable) {
    // Small delay to let the connection stabilise
    setTimeout(() => triggerSync(), 3000)
  }
}

export function init(getToken: TokenGetter): void {
  _getToken = getToken
  if (_unsubscribe) _unsubscribe()
  _unsubscribe = NetInfo.addEventListener(onNetworkChange)
}

export function stop(): void {
  _unsubscribe?.()
  _unsubscribe = null
  _getToken    = null
}

// ─── Sync status query ─────────────────────────────────────────────────────────
export async function getSyncStatus(): Promise<{
  unsyncedBirths: number; unsyncedDeaths: number; lastSyncAt: string | null
}> {
  const [births, deaths, lastSync] = await Promise.all([
    getPendingBirths(),
    getPendingDeaths(),
    AsyncStorage.getItem('adlcs_last_sync'),
  ])
  return {
    unsyncedBirths: births.length,
    unsyncedDeaths: deaths.length,
    lastSyncAt:     lastSync,
  }
}
