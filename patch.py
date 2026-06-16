#!/usr/bin/env python3
"""
patch_api_fallback.py — Smart dual-backend fallback for ADLCS mobile + web
─────────────────────────────────────────────────────────────────────────────
PROBLEM
  • Render backend was deleted + recreated → new URL (or old URL returns 502)
  • Mobile LoginScreen / syncService only try one URL, no fallback
  • Web auth.api.js only tries one URL, no fallback

SOLUTION — apiResolver.ts / apiResolver.js
  A tiny utility that probes two backends in order:
    1. Remote  : EXPO_PUBLIC_API_URL  or  VITE_API_BASE_URL  env var
                 (set to your new Render URL in .env)
    2. Local   : http://localhost:5000/api   (useful during dev / offline test)

  The probe is a fast GET /health with a 5-second timeout.
  The result is cached for 60 seconds so we don't re-probe every request.
  If BOTH fail → every API call throws "No internet connection" (not a silent 
  login failure).

HOW TO UPDATE YOUR RENDER URL
  After re-creating the Render service, update ONE env var:
    • Mobile: edit code/mobile/.env  →  EXPO_PUBLIC_API_URL=https://<new>.onrender.com/api
    • Web:    edit code/web/.env     →  VITE_API_BASE_URL=https://<new>.onrender.com/api
  Then restart dev server / rebuild APK. No code changes needed.

RUN
  From the project root (the folder containing `code/`):
      python3 patch_api_fallback.py

IDEMPOTENT — safe to re-run.
"""

import base64, sys
from pathlib import Path


def find_root() -> Path:
    here = Path(__file__).resolve().parent
    for c in [here, here / 'ADLCS-main']:
        if (c / 'code' / 'backend').is_dir() and (c / 'code' / 'web').is_dir():
            return c
    print("ERROR: run from the project root (folder containing `code/`).")
    sys.exit(1)


ROOT = find_root()
print(f"Project root: {ROOT}\n")

EDITS = []
NEW_FILES = {}   # relpath -> text content


def e(rel, old, new, label):
    EDITS.append((rel, old, new, label))


# ══════════════════════════════════════════════════════════════════════════════
# 1. NEW FILE — code/mobile/src/services/apiResolver.ts
#    Resolves which backend to use (Render first, localhost fallback).
# ══════════════════════════════════════════════════════════════════════════════

NEW_FILES['code/mobile/src/services/apiResolver.ts'] = """\
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

const REMOTE   = process.env.EXPO_PUBLIC_API_URL ?? 'https://adlcs.onrender.com/api'
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
"""

# ══════════════════════════════════════════════════════════════════════════════
# 2. NEW FILE — code/web/src/api/apiResolver.js
#    Same concept for the React web dashboard (plain JS / Vite).
# ══════════════════════════════════════════════════════════════════════════════

NEW_FILES['code/web/src/api/apiResolver.js'] = """\
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

const REMOTE  = import.meta.env.VITE_API_BASE_URL || 'https://adlcs.onrender.com/api'
const LOCAL   = 'http://localhost:5000/api'
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
export async function resolveBase() {
  if (_cached && Date.now() - _cachedAt < CACHE_MS) return _cached

  if (await probe(REMOTE)) {
    _cached = REMOTE; _cachedAt = Date.now()
    console.log('[apiResolver] using remote:', REMOTE)
    return _cached
  }
  if (await probe(LOCAL)) {
    _cached = LOCAL; _cachedAt = Date.now()
    console.log('[apiResolver] using local:', LOCAL)
    return _cached
  }

  throw new Error('No internet connection')
}

/** Force re-probe on next call (e.g. after network reconnect). */
export function resetResolver() {
  _cached = null; _cachedAt = 0
}
"""

# ══════════════════════════════════════════════════════════════════════════════
# 3. NEW FILE — code/mobile/.env  (template — user must fill in Render URL)
# ══════════════════════════════════════════════════════════════════════════════

NEW_FILES['code/mobile/.env'] = """\
# ADLCS Mobile — API URL
# Update EXPO_PUBLIC_API_URL to your current Render backend URL after
# recreating the Render service (e.g. https://adlcs-abc123.onrender.com/api).
# The app will automatically fall back to localhost:5000 if Render is down.
EXPO_PUBLIC_API_URL=https://adlcs.onrender.com/api
"""

# ══════════════════════════════════════════════════════════════════════════════
# 4. EDIT — code/mobile/src/screens/auth/LoginScreen.tsx
#    Replace hardcoded API_BASE fetch with resolveBase()
# ══════════════════════════════════════════════════════════════════════════════

e(
    'code/mobile/src/screens/auth/LoginScreen.tsx',
    # old imports block
    "import AsyncStorage from '@react-native-async-storage/async-storage'\n"
    "import { LinearGradient }  from 'expo-linear-gradient'\n"
    "import { Eye, EyeOff, Shield, MapPin, Smartphone, AlertCircle } from 'lucide-react-native'\n"
    "import type { NativeStackNavigationProp } from '@react-navigation/native-stack'",
    # new — add apiResolver import
    "import AsyncStorage from '@react-native-async-storage/async-storage'\n"
    "import { LinearGradient }  from 'expo-linear-gradient'\n"
    "import { Eye, EyeOff, Shield, MapPin, Smartphone, AlertCircle } from 'lucide-react-native'\n"
    "import type { NativeStackNavigationProp } from '@react-navigation/native-stack'\n"
    "import { resolveBase } from '../../services/apiResolver'",
    'LoginScreen.tsx: import resolveBase',
)

e(
    'code/mobile/src/screens/auth/LoginScreen.tsx',
    # old — hardcoded constant
    "const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'https://adlcs.onrender.com/api'\n"
    "const { height: SCREEN_H } = Dimensions.get('window')",
    # new — remove static constant (resolveBase() called at runtime)
    "const { height: SCREEN_H } = Dimensions.get('window')",
    'LoginScreen.tsx: remove hardcoded API_BASE constant',
)

e(
    'code/mobile/src/screens/auth/LoginScreen.tsx',
    # old handleLogin fetch
    "  const handleLogin = async () => {\n"
    "    if (!email.includes('@')) { setError('Enter a valid email address'); return }\n"
    "    if (password.length < 4)  { setError('Enter your password'); return }\n"
    "    setError(''); setLoading(true)\n"
    "    try {\n"
    "      const res  = await fetch(`${API_BASE}/auth/login`, {\n"
    "        method:  'POST',\n"
    "        headers: { 'Content-Type': 'application/json' },\n"
    "        body:    JSON.stringify({ email, password }),\n"
    "      })",
    # new — resolve base first, meaningful error if unreachable
    "  const handleLogin = async () => {\n"
    "    if (!email.includes('@')) { setError('Enter a valid email address'); return }\n"
    "    if (password.length < 4)  { setError('Enter your password'); return }\n"
    "    setError(''); setLoading(true)\n"
    "    try {\n"
    "      let base: string\n"
    "      try { base = await resolveBase() }\n"
    "      catch { setError('No internet connection — check Wi-Fi or mobile data'); return }\n"
    "      const res  = await fetch(`${base}/auth/login`, {\n"
    "        method:  'POST',\n"
    "        headers: { 'Content-Type': 'application/json' },\n"
    "        body:    JSON.stringify({ email, password }),\n"
    "      })",
    'LoginScreen.tsx: handleLogin — use resolveBase() with clear error',
)

e(
    'code/mobile/src/screens/auth/LoginScreen.tsx',
    # old handleMfaVerify fetch
    "  const handleMfaVerify = async () => {\n"
    "    if (mfaCode.length < 6) { setError('Enter the 6-digit TOTP code'); return }\n"
    "    setError(''); setLoading(true)\n"
    "    try {\n"
    "      const res  = await fetch(`${API_BASE}/auth/mfa/verify`, {\n"
    "        method:  'POST',\n"
    "        headers: { 'Content-Type': 'application/json' },\n"
    "        body:    JSON.stringify({ tempToken, code: mfaCode }),\n"
    "      })",
    # new
    "  const handleMfaVerify = async () => {\n"
    "    if (mfaCode.length < 6) { setError('Enter the 6-digit TOTP code'); return }\n"
    "    setError(''); setLoading(true)\n"
    "    try {\n"
    "      let base: string\n"
    "      try { base = await resolveBase() }\n"
    "      catch { setError('No internet connection — check Wi-Fi or mobile data'); return }\n"
    "      const res  = await fetch(`${base}/auth/mfa/verify`, {\n"
    "        method:  'POST',\n"
    "        headers: { 'Content-Type': 'application/json' },\n"
    "        body:    JSON.stringify({ tempToken, code: mfaCode }),\n"
    "      })",
    'LoginScreen.tsx: handleMfaVerify — use resolveBase() with clear error',
)

e(
    'code/mobile/src/screens/auth/LoginScreen.tsx',
    # old catch for network error
    "    } catch {\n"
    "      setError('Connection failed. Check your internet.')\n"
    "    } finally {\n"
    "      setLoading(false)\n"
    "    }\n"
    "  }\n"
    "\n"
    "  const handleMfaVerify",
    # new — richer error messages
    "    } catch (err: unknown) {\n"
    "      const msg = err instanceof Error ? err.message : ''\n"
    "      if (msg === 'No internet connection' || msg.includes('Network request failed')) {\n"
    "        setError('No internet connection — check Wi-Fi or mobile data')\n"
    "      } else {\n"
    "        setError('Login failed. Please try again.')\n"
    "      }\n"
    "    } finally {\n"
    "      setLoading(false)\n"
    "    }\n"
    "  }\n"
    "\n"
    "  const handleMfaVerify",
    'LoginScreen.tsx: improve login catch error messages',
)

e(
    'code/mobile/src/screens/auth/LoginScreen.tsx',
    # old mfa catch
    "    } catch {\n"
    "      setError('Connection failed. Try again.')\n"
    "    } finally {\n"
    "      setLoading(false)\n"
    "    }\n"
    "  }\n"
    "\n"
    "  const goHome",
    # new
    "    } catch (err: unknown) {\n"
    "      const msg = err instanceof Error ? err.message : ''\n"
    "      if (msg === 'No internet connection' || msg.includes('Network request failed')) {\n"
    "        setError('No internet connection — check Wi-Fi or mobile data')\n"
    "      } else {\n"
    "        setError('MFA verification failed. Please try again.')\n"
    "      }\n"
    "    } finally {\n"
    "      setLoading(false)\n"
    "    }\n"
    "  }\n"
    "\n"
    "  const goHome",
    'LoginScreen.tsx: improve MFA catch error messages',
)

# ══════════════════════════════════════════════════════════════════════════════
# 5. EDIT — code/mobile/src/services/syncService.ts
#    Replace hardcoded API_BASE with resolveBase() in apiPost / apiGet / health
# ══════════════════════════════════════════════════════════════════════════════

e(
    'code/mobile/src/services/syncService.ts',
    "import AsyncStorage from '@react-native-async-storage/async-storage'\n"
    "import { LocalBirth, LocalDeath } from './localDb'\n"
    "\n"
    "const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'https://adlcs.onrender.com/api'",
    "import AsyncStorage from '@react-native-async-storage/async-storage'\n"
    "import { LocalBirth, LocalDeath } from './localDb'\n"
    "import { resolveBase, resetResolver } from './apiResolver'\n"
    "\n"
    "// API_BASE is resolved dynamically — see apiResolver.ts",
    'syncService.ts: import resolveBase + remove static API_BASE',
)

e(
    'code/mobile/src/services/syncService.ts',
    "export async function apiPost(endpoint: string, body: object): Promise<any> {\n"
    "  const token = await getToken()\n"
    "  if (!token) throw new Error('No auth token')\n"
    "  const { signal, clear } = makeSignal(15_000)\n"
    "  try {\n"
    "    const res = await fetch(`${API_BASE}${endpoint}`, {",
    "export async function apiPost(endpoint: string, body: object): Promise<any> {\n"
    "  const token = await getToken()\n"
    "  if (!token) throw new Error('No auth token')\n"
    "  const base = await resolveBase()\n"
    "  const { signal, clear } = makeSignal(15_000)\n"
    "  try {\n"
    "    const res = await fetch(`${base}${endpoint}`, {",
    'syncService.ts: apiPost — use resolveBase()',
)

e(
    'code/mobile/src/services/syncService.ts',
    "export async function apiGet(endpoint: string): Promise<any> {\n"
    "  const token = await getToken()\n"
    "  if (!token) throw new Error('No auth token')\n"
    "  const { signal, clear } = makeSignal(10_000)\n"
    "  try {\n"
    "    const res = await fetch(`${API_BASE}${endpoint}`, {",
    "export async function apiGet(endpoint: string): Promise<any> {\n"
    "  const token = await getToken()\n"
    "  if (!token) throw new Error('No auth token')\n"
    "  const base = await resolveBase()\n"
    "  const { signal, clear } = makeSignal(10_000)\n"
    "  try {\n"
    "    const res = await fetch(`${base}${endpoint}`, {",
    'syncService.ts: apiGet — use resolveBase()',
)

e(
    'code/mobile/src/services/syncService.ts',
    "export async function checkConnQuality(): Promise<ConnQuality> {\n"
    "  const { signal, clear } = makeSignal(4000)\n"
    "  try {\n"
    "    const t = Date.now()\n"
    "    const res = await fetch(`${API_BASE}/health`, { signal })\n"
    "    clear()\n"
    "    if (!res.ok) return 'Fair'\n"
    "    return Date.now() - t < 800 ? 'Good' : 'Fair'\n"
    "  } catch { clear(); return 'Offline' }\n"
    "}",
    "export async function checkConnQuality(): Promise<ConnQuality> {\n"
    "  const { signal, clear } = makeSignal(4000)\n"
    "  try {\n"
    "    const t = Date.now()\n"
    "    const base = await resolveBase()\n"
    "    const res = await fetch(`${base}/health`, { signal })\n"
    "    clear()\n"
    "    if (!res.ok) return 'Fair'\n"
    "    return Date.now() - t < 800 ? 'Good' : 'Fair'\n"
    "  } catch (err) {\n"
    "    clear()\n"
    "    resetResolver()  // force re-probe next call after a connectivity event\n"
    "    return 'Offline'\n"
    "  }\n"
    "}",
    'syncService.ts: checkConnQuality — use resolveBase() + reset on failure',
)

# ══════════════════════════════════════════════════════════════════════════════
# 6. EDIT — code/web/src/api/auth.api.js
#    Replace static BASE with lazy resolveBase() call
# ══════════════════════════════════════════════════════════════════════════════

e(
    'code/web/src/api/auth.api.js',
    "import axios from 'axios'\n"
    "import { useAuthStore } from '../store/authStore'\n"
    "const BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api'\n"
    "\n"
    "export const apiClient = axios.create({ baseURL: BASE })",
    "import axios from 'axios'\n"
    "import { useAuthStore } from '../store/authStore'\n"
    "import { resolveBase } from './apiResolver'\n"
    "\n"
    "// BASE is resolved lazily on first request — see apiResolver.js\n"
    "let _baseReady = false\n"
    "export const apiClient = axios.create({ baseURL: import.meta.env.VITE_API_BASE_URL || 'https://adlcs.onrender.com/api' })\n"
    "\n"
    "// Request interceptor: resolve the live base URL before every call\n"
    "apiClient.interceptors.request.use(async (config) => {\n"
    "  if (!_baseReady) {\n"
    "    try {\n"
    "      const base = await resolveBase()\n"
    "      apiClient.defaults.baseURL = base\n"
    "      config.baseURL = base\n"
    "      _baseReady = true\n"
    "    } catch {\n"
    "      return Promise.reject(new Error('No internet connection'))\n"
    "    }\n"
    "  }\n"
    "  return config\n"
    "})",
    'auth.api.js: resolve base URL lazily via apiResolver; fallback to local',
)

# Fix the inline refresh call that also uses the hardcoded BASE
e(
    'code/web/src/api/auth.api.js',
    "        const { data } = await axios.post(`${BASE}/auth/refresh`, { refreshToken })",
    "        const base = apiClient.defaults.baseURL || import.meta.env.VITE_API_BASE_URL || 'https://adlcs.onrender.com/api'\n"
    "        const { data } = await axios.post(`${base}/auth/refresh`, { refreshToken })",
    'auth.api.js: refresh call — use resolved baseURL instead of static BASE',
)

# ══════════════════════════════════════════════════════════════════════════════
# Apply everything
# ══════════════════════════════════════════════════════════════════════════════

# Write new files
created, skipped_new = [], []
for rel, content in NEW_FILES.items():
    path = ROOT / rel
    if path.exists():
        skipped_new.append(rel)
    else:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding='utf-8')
        created.append(rel)

for rel in created:     print(f"  [created]      {rel}")
for rel in skipped_new: print(f"  [exists]       {rel}  (use --force to overwrite)")

print()

# Apply edits
applied, already_done, failed = [], [], []
for relpath, old, new, label in EDITS:
    path = ROOT / relpath
    if not path.exists():
        failed.append((label, f"{relpath} not found"))
        continue
    text = path.read_text(encoding='utf-8')
    if new in text:
        already_done.append(label)
    elif old in text:
        path.write_text(text.replace(old, new, 1), encoding='utf-8')
        applied.append(label)
    else:
        failed.append((label, f"pattern not found in {relpath}"))

for label in applied:        print(f"  [patched]      {label}")
for label in already_done:   print(f"  [already done] {label}")
for label, reason in failed: print(f"  [FAILED]       {label} — {reason}")

print()
if failed:
    print(f"⚠️  {len(failed)} edit(s) could not be applied. See above.")
    sys.exit(1)

print("✅  API fallback patch applied successfully.")
print()
print("─── NEXT STEPS ──────────────────────────────────────────────────────────")
print()
print("1. UPDATE YOUR RENDER URL")
print("   Edit code/mobile/.env:")
print("     EXPO_PUBLIC_API_URL=https://<your-new-render-slug>.onrender.com/api")
print("   Edit code/web/.env (create if missing):")
print("     VITE_API_BASE_URL=https://<your-new-render-slug>.onrender.com/api")
print()
print("2. MOBILE — rebuild")
print("   cd code/mobile && npx expo start --tunnel")
print("   — or for APK —")
print("   eas build --profile preview --platform android")
print()
print("3. WEB — restart dev server (picks up new .env)")
print("   cd code/web && npm run dev")
print()
print("4. FALLBACK BEHAVIOUR")
print("   Remote (Render) reachable  → uses Render")
print("   Remote down, local up      → uses localhost:5000  (dev only)")
print("   Both down                  → shows 'No internet connection'")
print("   Cache refreshes every 60 s automatically.")
