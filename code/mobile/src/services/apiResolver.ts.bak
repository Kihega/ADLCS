/**
 * apiResolver.js — Dual-backend resolver for ADLCS Web Dashboard
 *
 * Priority:
 *   1. VITE_API_BASE_URL env var  (your Render URL — set in .env)
 *   2. http://localhost:5000/api  (local dev backend)
 *
 * Probe result cached for 60 s so the dashboard doesn't re-probe every call.
 *
 * Usage (replaces hardcoded BASE in auth.api.js):
 *   import { resolveBase } from './apiResolver'
 *   const base = await resolveBase()
 */

// PATCH-6: Only use VITE_API_BASE_URL from .env — no hardcoded fallbacks.
// Update .env (or Vercel env vars) when the backend URL changes.
const REMOTE  = (import.meta.env.VITE_API_BASE_URL || '').trim()
const TIMEOUT = 5_000
const CACHE_MS = 60_000

let _cached  = null
let _cachedAt = 0

async function probe(base) {
  const ctrl  = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT)
  try {
    const res = await fetch(`${base}/health`, { signal: ctrl.signal })
    clearTimeout(timer)
    return res.ok
  } catch {
    clearTimeout(timer)
    return false
  }
}

/**
 * Returns the first reachable backend base URL.
 * Throws a user-friendly Error if neither backend responds.
 */
// PATCH-6: Only probe the .env-configured remote.
export async function resolveBase() {
  if (!REMOTE) throw new Error('VITE_API_BASE_URL is not set in your .env file')
  if (_cached && Date.now() - _cachedAt < CACHE_MS) return _cached

  if (await probe(REMOTE)) {
    _cached = REMOTE; _cachedAt = Date.now()
    console.log('[apiResolver] connected:', REMOTE)
    return _cached
  }

  throw new Error('No internet connection')
}

/** Force re-probe on next call (e.g. after network reconnect). */
export function resetResolver() {
  _cached = null; _cachedAt = 0
}
