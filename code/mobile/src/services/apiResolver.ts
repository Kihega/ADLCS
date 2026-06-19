/**
 * apiResolver.ts — Dual-backend resolver for ADLCS Mobile
 *
 * Priority:
 *   1. EXPO_PUBLIC_API_URL   (your Render URL — set in .env)
 *   2. http://localhost:5000/api  (local dev backend)
 *
 * Probe result is cached for CACHE_MS (60 s) to avoid re-probing every call.
 *
 * Usage (replaces any hardcoded API_BASE):
 *   import { resolveBase } from './apiResolver'
 *   const base = await resolveBase()
 *   const res = await fetch(`${base}/auth/login`, ...)
 */

const REMOTE   = process.env.EXPO_PUBLIC_API_URL ?? process.env.EXPO_PUBLIC_API_URL_PRIMARY
const LOCAL    = 'http://10.0.2.2:5000/api'   // Android emulator localhost alias
const LOCAL_IOS = 'http://localhost:5000/api'  // iOS simulator localhost
const TIMEOUT  = 5_000   // ms per probe attempt
const CACHE_MS = 60_000  // re-probe after 60 s

let _cached: string | null = null
let _cachedAt = 0

/** Abort-controller helper (Hermes-compatible, no AbortSignal.timeout) */
function makeSignal(ms: number): { signal: AbortSignal; clear: () => void } {
  const ctrl  = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  return { signal: ctrl.signal, clear: () => clearTimeout(timer) }
}

async function probe(base: string): Promise<boolean> {
  const { signal, clear } = makeSignal(TIMEOUT)
  try {
    const res = await fetch(`${base}/health`, { signal })
    clear()
    return res.ok
  } catch {
    clear()
    return false
  }
}

/**
 * Returns the first reachable backend base URL.
 * Throws a user-friendly error if neither backend responds.
 */
export async function resolveBase(): Promise<string> {
  // Return cached value if still fresh
  if (_cached && Date.now() - _cachedAt < CACHE_MS) return _cached

  // 1. Try configured remote (Render)
  if (await probe(REMOTE)) {
    _cached = REMOTE; _cachedAt = Date.now()
    console.log('[apiResolver] using remote:', REMOTE)
    return _cached
  }

  // 2. Try local backend (dev / offline)
  const local = LOCAL  // Android emulator uses 10.0.2.2; adjust for real device
  if (await probe(local)) {
    _cached = local; _cachedAt = Date.now()
    console.log('[apiResolver] using local:', local)
    return _cached
  }

  // 3. iOS simulator fallback
  if (await probe(LOCAL_IOS)) {
    _cached = LOCAL_IOS; _cachedAt = Date.now()
    console.log('[apiResolver] using localhost (iOS):', LOCAL_IOS)
    return _cached
  }

  // 4. Nothing works
  throw new Error('No internet connection')
}

/** Force a fresh probe on next call (call after reconnect or app resume). */
export function resetResolver(): void {
  _cached = null; _cachedAt = 0
}
