/**
 * apiResolver.ts — Single-backend resolver for TzCRVS Mobile
 *
 * PATCH NOTES:
 *   • Removed the hardcoded `http://10.0.2.2:5000/api` (Android emulator)
 *     and `http://localhost:5000/api` (iOS simulator) fallback URLs. They
 *     meant that any time the configured remote was briefly unreachable
 *     (slow cold start on a free-tier host, a flaky network blip, etc.)
 *     the resolver would silently fall through to a request against
 *     "localhost" on the device itself — which always fails on a real
 *     phone/tablet, and on an emulator could connect to a *different*
 *     backend than the one configured in .env. The app must use ONLY the
 *     backend declared in EXPO_PUBLIC_API_URL, full stop.
 *   • Removed any implicit import.meta usage — Hermes does not support it.
 *   • All env vars use process.env.EXPO_PUBLIC_* which Expo inlines at
 *     bundle time via babel-preset-expo (requires babel.config.js to exist).
 *   • Kept the undefined-guard, caching, and timeout behaviour.
 *
 * Usage (same as before — no callers need updating):
 *   import { resolveBase } from './apiResolver'
 *   const base = await resolveBase()
 *   const res  = await fetch(`${base}/auth/login`, { ... })
 *
 * Configuration:
 *   Set EXPO_PUBLIC_API_URL in mobile/.env to your deployed backend URL
 *   (see mobile/.env.example). There is no other source of truth.
 */

// ── Environment ───────────────────────────────────────────────────────────────
// process.env.EXPO_PUBLIC_* is inlined by babel-preset-expo at bundle time.
// babel.config.js MUST exist in the project root for this to work.
const REMOTE: string | undefined =
  process.env.EXPO_PUBLIC_API_URL || process.env.EXPO_PUBLIC_API_URL_PRIMARY || undefined

const TIMEOUT = 8_000 // ms — max wait per probe attempt
const CACHE_MS = 60_000 // ms — re-probe after 60 seconds

let _cached: string | null = null
let _cachedAt = 0

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Hermes-compatible AbortController wrapper.
 * AbortSignal.timeout() is NOT available in Hermes; use setTimeout instead.
 */
function makeSignal(ms: number): { signal: AbortSignal; clear: () => void } {
  const ctrl = new AbortController()
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
 * Returns the backend base URL declared in EXPO_PUBLIC_API_URL.
 * Result is cached for CACHE_MS to avoid probing on every API call.
 * Throws a user-friendly Error if EXPO_PUBLIC_API_URL is not set or the
 * configured backend is unreachable. Never falls back to any other URL.
 */
export async function resolveBase(): Promise<string> {
  if (!REMOTE) {
    throw new Error(
      'EXPO_PUBLIC_API_URL is not set.\n' +
        'Create mobile/.env (see mobile/.env.example) and set ' +
        'EXPO_PUBLIC_API_URL=https://your-backend-url/api, then restart Metro with --clear.'
    )
  }

  // Return cached value if still fresh
  if (_cached && Date.now() - _cachedAt < CACHE_MS) {
    return _cached
  }

  if (await probe(REMOTE)) {
    _cached = REMOTE
    _cachedAt = Date.now()
    console.log('[apiResolver] \u2713 using configured backend:', REMOTE)
    return _cached
  }

  console.error('[apiResolver] \u2717 configured backend unreachable:', REMOTE)
  throw new Error(
    'Unable to reach the TzCRVS backend at the URL configured in EXPO_PUBLIC_API_URL.\n' +
      'Check your internet connection or that the backend is running, then try again.'
  )
}

/**
 * Force a fresh probe on the next resolveBase() call.
 * Call this after app resume or network reconnect.
 */
export function resetResolver(): void {
  _cached = null
  _cachedAt = 0
}
