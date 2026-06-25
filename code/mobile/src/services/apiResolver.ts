/**
 * apiResolver.ts — Hermes-safe dual-backend resolver for NBS-CRVS Mobile
 *
 * FIX NOTES (patch applied by fix_mobile_crash.py):
 *   • Removed any implicit import.meta usage — Hermes does not support it.
 *   • All env vars use process.env.EXPO_PUBLIC_* which Expo inlines at
 *     bundle time via babel-preset-expo (requires babel.config.js to exist).
 *   • Added undefined-guard on REMOTE before calling probe() — calling
 *     fetch("undefined/health") caused a cryptic runtime crash.
 *   • Kept caching, timeout, Android/iOS localhost aliases unchanged.
 *
 * Usage (same as before — no callers need updating):
 *   import { resolveBase } from './apiResolver'
 *   const base = await resolveBase()
 *   const res  = await fetch(`${base}/auth/login`, { ... })
 *
 * Priority order:
 *   1. EXPO_PUBLIC_API_URL   — your deployed Render URL (.env)
 *   2. http://10.0.2.2:5000/api  — Android emulator localhost alias
 *   3. http://localhost:5000/api  — iOS simulator localhost
 */

// ── Environment ───────────────────────────────────────────────────────────────
// process.env.EXPO_PUBLIC_* is inlined by babel-preset-expo at bundle time.
// babel.config.js MUST exist in the project root for this to work.
const REMOTE: string | undefined =
  process.env.EXPO_PUBLIC_API_URL ||
  process.env.EXPO_PUBLIC_API_URL_PRIMARY ||
  undefined

// Android emulator maps 10.0.2.2 → host machine's localhost
const LOCAL_ANDROID = 'http://10.0.2.2:5000/api'
// iOS simulator uses localhost directly
const LOCAL_IOS     = 'http://localhost:5000/api'

const TIMEOUT  = 5_000   // ms — max wait per probe attempt
const CACHE_MS = 60_000  // ms — re-probe after 60 seconds

let _cached: string | null = null
let _cachedAt = 0

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Hermes-compatible AbortController wrapper.
 * AbortSignal.timeout() is NOT available in Hermes; use setTimeout instead.
 */
function makeSignal(ms: number): { signal: AbortSignal; clear: () => void } {
  const ctrl  = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  return { signal: ctrl.signal, clear: () => clearTimeout(timer) }
}

/**
 * Returns true if the backend at `base` responds with 2xx on /health.
 * Never throws — network failures return false.
 */
async function probe(base: string): Promise<boolean> {
  const { signal, clear } = makeSignal(TIMEOUT)
  try {
    const res = await fetch(`${base}/health`, { method: 'GET', signal })
    clear()
    return res.ok
  } catch {
    clear()
    return false
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the first reachable backend base URL.
 * Result is cached for CACHE_MS to avoid probing on every API call.
 * Throws a user-friendly Error if no backend is reachable.
 */
export async function resolveBase(): Promise<string> {
  // Return cached value if still fresh
  if (_cached && Date.now() - _cachedAt < CACHE_MS) {
    return _cached
  }

  // 1. Try the configured remote (Render deployment)
  //    Guard: skip if REMOTE is undefined — fetch("undefined/health") crashes.
  if (REMOTE && await probe(REMOTE)) {
    _cached = REMOTE
    _cachedAt = Date.now()
    console.log('[apiResolver] ✓ using remote:', REMOTE)
    return _cached
  }

  // 2. Android emulator (10.0.2.2 → host machine localhost)
  if (await probe(LOCAL_ANDROID)) {
    _cached = LOCAL_ANDROID
    _cachedAt = Date.now()
    console.log('[apiResolver] ✓ using local (Android):', LOCAL_ANDROID)
    return _cached
  }

  // 3. iOS simulator (localhost)
  if (await probe(LOCAL_IOS)) {
    _cached = LOCAL_IOS
    _cachedAt = Date.now()
    console.log('[apiResolver] ✓ using local (iOS):', LOCAL_IOS)
    return _cached
  }

  // 4. Nothing reachable
  const tried = [REMOTE ?? '(no EXPO_PUBLIC_API_URL set)', LOCAL_ANDROID, LOCAL_IOS]
  console.error('[apiResolver] ✗ no backend reachable. Tried:', tried)
  throw new Error(
    'Unable to reach the NBS-CRVS backend.\n' +
    'Check your internet connection or start the local backend server.'
  )
}

/**
 * Force a fresh probe on the next resolveBase() call.
 * Call this after app resume or network reconnect.
 */
export function resetResolver(): void {
  _cached   = null
  _cachedAt = 0
}
