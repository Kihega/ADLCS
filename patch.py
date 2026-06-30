#!/usr/bin/env python3
"""
apply_camera_env_responsive_patch.py
=====================================

Single, self-contained patch for the TzCRVS / ADLCS project. Run it once
from anywhere (it auto-detects the project root, or pass --root) and it
applies all three fixes below in one shot. Safe to re-run — every edit is
guarded so an already-patched file is simply skipped instead of being
double-patched or corrupted.

WHAT THIS FIXES
----------------
1. Village Officer "camera restarts the app" during NIN registration
   (code/mobile/src/screens/village/NINRegistrationScreen.tsx)
     - openCamera() previously called launchCameraAsync() with the
       deprecated `MediaTypeOptions.Images` enum, no try/catch, and an
       unconditional `.catch()` that raced straight into the gallery
       picker. Any native camera-activity error (denied permission,
       activity killed for memory, hardware busy) left that promise in a
       bad state, which is what was surfacing as the app "restarting".
     - app.json was also missing the iOS NSCameraUsageDescription /
       NSPhotoLibraryUsageDescription strings and the Android CAMERA
       permission + the expo-image-picker config plugin. Without these,
       the OS can refuse/kill the camera activity outright on a real
       device, which looks exactly like an app restart.
     - Fix: explicit permission request, try/catch around the whole
       capture flow (falls back to gallery only on a genuine error), a
       re-entrancy guard so rapid double-taps can't launch the camera
       twice, the modern `mediaTypes: ['images']` API, and the missing
       app.json permission strings + config plugin.

2. Hardcoded backend URLs ignoring the .env value
   (code/mobile/src/services/apiResolver.ts)
     - The resolver tried EXPO_PUBLIC_API_URL first, but on any failure
       (slow cold start, flaky network) it silently fell back to two
       hardcoded URLs: http://10.0.2.2:5000/api (Android emulator) and
       http://localhost:5000/api (iOS simulator). That's why traffic
       could still hit a hardcoded address even with the env var set.
     - Fix: removed both hardcoded fallbacks. The resolver now uses
       ONLY the URL declared in EXPO_PUBLIC_API_URL (mobile/.env) and
       throws a clear error if it's unset or unreachable — mirroring
       the web dashboard's apiResolver.js, which was already env-only.

3. Dynamic sizing across phone/tablet screen sizes
     - Added a shared `useResponsive()` hook
       (code/mobile/src/utils/responsive.ts) built on
       `useWindowDimensions` (updates live on rotation/resize, unlike
       the old one-time `Dimensions.get('window')` reads scattered
       around the app).
     - Wired it into NINRegistrationScreen.tsx: the scrollable content
       is now width-capped and centred on tablets, the ID card preview
       scales up on tablets instead of staying a fixed 320x202, and the
       photo placeholder box scales with screen width. Other screens
       can adopt the same hook with `import { useResponsive } from
       '../../utils/responsive'`.

USAGE
-----
    python3 apply_camera_env_responsive_patch.py [--root /path/to/project]

If --root is omitted the script searches the current directory and a
few common locations (e.g. ~/ADLCS) for a folder containing
`code/mobile/package.json`.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# ──────────────────────────────────────────────────────────────────────────
# Root detection
# ──────────────────────────────────────────────────────────────────────────


def find_project_root(explicit: str | None) -> Path:
    candidates = []
    if explicit:
        candidates.append(Path(explicit).expanduser().resolve())
    candidates += [
        Path.cwd(),
        Path.cwd() / "ADLCS-main",
        Path.home() / "ADLCS",
        Path.home() / "ADLCS-main",
    ]
    for c in candidates:
        if (c / "code" / "mobile" / "package.json").exists():
            return c
    # Last resort: search a couple levels down from cwd.
    for p in Path.cwd().rglob("package.json"):
        if p.parent.name == "mobile" and (p.parent.parent / "web").exists():
            return p.parent.parent.parent
    raise SystemExit(
        "Could not locate the project root (expected <root>/code/mobile/package.json).\n"
        "Re-run with --root /path/to/your/project."
    )


# ──────────────────────────────────────────────────────────────────────────
# Small helpers
# ──────────────────────────────────────────────────────────────────────────


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def replace_once(path: Path, old: str, new: str, label: str) -> bool:
    """Replace `old` with `new` in `path`. Returns True if a change was made.
    If `old` is not found but `new` already is, treats it as already-patched
    and skips silently (idempotent re-runs)."""
    text = read(path)
    if old in text:
        text = text.replace(old, new, 1)
        write(path, text)
        print(f"  [OK] {label}")
        return True
    if new in text:
        print(f"  [skip] {label} (already applied)")
        return False
    print(f"  [WARN] {label}: expected text not found — file may have changed; skipping.")
    return False


# ──────────────────────────────────────────────────────────────────────────
# Fix 1a — app.json camera/photo permissions + expo-image-picker plugin
# ──────────────────────────────────────────────────────────────────────────


def patch_app_json(mobile_dir: Path) -> None:
    path = mobile_dir / "app.json"
    print(f"\n[1a] Patching {path.relative_to(mobile_dir.parent.parent)} (camera permissions)")
    data = json.loads(read(path))
    expo = data.get("expo", {})

    android = expo.setdefault("android", {})
    perms = android.setdefault("permissions", [])
    for p in ("CAMERA", "READ_EXTERNAL_STORAGE"):
        if p not in perms:
            perms.append(p)

    ios = expo.setdefault("ios", {})
    info_plist = ios.setdefault("infoPlist", {})
    info_plist.setdefault(
        "NSCameraUsageDescription",
        "TzCRVS needs camera access so officers can capture the citizen's photo during NIN registration.",
    )
    info_plist.setdefault(
        "NSPhotoLibraryUsageDescription",
        "TzCRVS needs photo library access so officers can select a citizen photo if the camera is unavailable.",
    )

    plugins = expo.setdefault("plugins", [])
    has_image_picker_plugin = any(
        (isinstance(p, str) and p == "expo-image-picker")
        or (isinstance(p, list) and p and p[0] == "expo-image-picker")
        for p in plugins
    )
    if not has_image_picker_plugin:
        plugins.append(
            [
                "expo-image-picker",
                {
                    "cameraPermission": info_plist["NSCameraUsageDescription"],
                    "photosPermission": info_plist["NSPhotoLibraryUsageDescription"],
                },
            ]
        )
        print("  [OK] added expo-image-picker config plugin")
    else:
        print("  [skip] expo-image-picker plugin already present")

    data["expo"] = expo
    write(path, json.dumps(data, indent=2) + "\n")
    print("  [OK] wrote updated app.json")


# ──────────────────────────────────────────────────────────────────────────
# Fix 1b — NINRegistrationScreen.tsx: reliable camera capture
# ──────────────────────────────────────────────────────────────────────────

OLD_IMPORT_BLOCK = """import { useTheme, TZ } from '../../context/ThemeContext'
import { apiGet, apiPost, fetchRemoteDashboard } from '../../services/syncService'"""

NEW_IMPORT_BLOCK = """import { useTheme, TZ } from '../../context/ThemeContext'
import { useResponsive } from '../../utils/responsive'
import { apiGet, apiPost, fetchRemoteDashboard } from '../../services/syncService'"""

OLD_ID_CARD_HEADER = """// ── On-screen ID card preview (CR-80 proportions) ────────────────────────────
function IdCardPreview({ data }: { data: CardData | null }) {
  if (!data) return null
  const initials = data.fullName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n: string) => n[0])
    .join('')
  return (
    <View
      style={{
        alignSelf: 'center',
        width: 320,
        height: 202,
        borderRadius: 10,
        overflow: 'hidden',
        backgroundColor: '#fff',
        shadowColor: '#000',
        shadowOpacity: 0.25,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
        elevation: 8,
      }}
    >
      <View style={{ flexDirection: 'row', height: 6 }}>
        <View style={{ flex: 3, backgroundColor: '#1eb53a' }} />
        <View style={{ width: 7, backgroundColor: '#fcd116' }} />
        <View style={{ width: 5, backgroundColor: '#000' }} />
        <View style={{ width: 7, backgroundColor: '#fcd116' }} />
        <View style={{ flex: 3, backgroundColor: '#00a3dd' }} />
      </View>
      <LinearGradient
        colors={['#003087', '#0f766e']}
        style={{ height: 38, alignItems: 'center', justifyContent: 'center' }}
      >
        <Text style={{ color: '#fff', fontSize: 10, fontWeight: '900', letterSpacing: 1 }}>
          UNITED REPUBLIC OF TANZANIA
        </Text>
        <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 7, marginTop: 1 }}>
          NATIONAL IDENTIFICATION CARD
        </Text>
      </LinearGradient>
      <View style={{ flex: 1, flexDirection: 'row', padding: 10, gap: 10 }}>
        <View style={{ alignItems: 'center', gap: 5 }}>
          <View
            style={{
              width: 62,
              height: 76,
              borderRadius: 6,
              borderWidth: 2,
              borderColor: '#0f766e',
              overflow: 'hidden',
              backgroundColor: '#d1fae5',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {data.photoBase64 ? (
              <Image
                source={{ uri: data.photoBase64 }}
                style={{ width: 62, height: 76 }}
                resizeMode="cover"
              />
            ) : (
              <Text style={{ fontSize: 20, fontWeight: '900', color: '#0f766e' }}>{initials}</Text>
            )}
          </View>"""

NEW_ID_CARD_HEADER = """// ── On-screen ID card preview (CR-80 proportions) ────────────────────────────
// `cardScale` lets callers grow the card on larger screens (tablets) instead
// of rendering it at a fixed phone-sized 320×202 on every device.
function IdCardPreview({ data, cardScale = 1 }: { data: CardData | null; cardScale?: number }) {
  if (!data) return null
  const initials = data.fullName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n: string) => n[0])
    .join('')
  const cardWidth = Math.round(320 * cardScale)
  const cardHeight = Math.round(202 * cardScale)
  const photoWidth = Math.round(62 * cardScale)
  const photoHeight = Math.round(76 * cardScale)
  return (
    <View
      style={{
        alignSelf: 'center',
        width: cardWidth,
        height: cardHeight,
        borderRadius: 10,
        overflow: 'hidden',
        backgroundColor: '#fff',
        shadowColor: '#000',
        shadowOpacity: 0.25,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
        elevation: 8,
      }}
    >
      <View style={{ flexDirection: 'row', height: 6 }}>
        <View style={{ flex: 3, backgroundColor: '#1eb53a' }} />
        <View style={{ width: 7, backgroundColor: '#fcd116' }} />
        <View style={{ width: 5, backgroundColor: '#000' }} />
        <View style={{ width: 7, backgroundColor: '#fcd116' }} />
        <View style={{ flex: 3, backgroundColor: '#00a3dd' }} />
      </View>
      <LinearGradient
        colors={['#003087', '#0f766e']}
        style={{ height: 38, alignItems: 'center', justifyContent: 'center' }}
      >
        <Text style={{ color: '#fff', fontSize: 10, fontWeight: '900', letterSpacing: 1 }}>
          UNITED REPUBLIC OF TANZANIA
        </Text>
        <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 7, marginTop: 1 }}>
          NATIONAL IDENTIFICATION CARD
        </Text>
      </LinearGradient>
      <View style={{ flex: 1, flexDirection: 'row', padding: 10, gap: 10 }}>
        <View style={{ alignItems: 'center', gap: 5 }}>
          <View
            style={{
              width: photoWidth,
              height: photoHeight,
              borderRadius: 6,
              borderWidth: 2,
              borderColor: '#0f766e',
              overflow: 'hidden',
              backgroundColor: '#d1fae5',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {data.photoBase64 ? (
              <Image
                source={{ uri: data.photoBase64 }}
                style={{ width: photoWidth, height: photoHeight }}
                resizeMode="cover"
              />
            ) : (
              <Text style={{ fontSize: 20, fontWeight: '900', color: '#0f766e' }}>{initials}</Text>
            )}
          </View>"""

OLD_SCREEN_HEADER = """export default function NINRegistrationScreen({ navigation }: Props) {
  const { theme: T } = useTheme()"""

NEW_SCREEN_HEADER = """export default function NINRegistrationScreen({ navigation }: Props) {
  const { theme: T } = useTheme()
  const { isTablet, contentMaxWidth, scale: rscale } = useResponsive()"""

OLD_STEP2_STATE = """  // Step 2
  const [photoUri, setPhotoUri] = useState<string | null>(null)
  const [photoBase64, setPhotoBase64] = useState<string | null>(null)"""

NEW_STEP2_STATE = """  // Step 2
  const [photoUri, setPhotoUri] = useState<string | null>(null)
  const [photoBase64, setPhotoBase64] = useState<string | null>(null)
  const [capturingPhoto, setCapturingPhoto] = useState(false)"""

OLD_OPEN_CAMERA = """  // ── Step 2a: Photo (image picker) ──────────────────────────────────────
  const openCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync()
    if (!perm.granted) {
      const lib = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!lib.granted) {
        Alert.alert('Permission', 'Camera or gallery access required.')
        return
      }
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.7,
      base64: true,
    }).catch(async () =>
      ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [3, 4],
        quality: 0.7,
        base64: true,
      })
    )
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0]
      setPhotoUri(asset.uri)
      setPhotoBase64(asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : null)
      showToast('Photo selected successfully')
    }
  }"""

NEW_OPEN_CAMERA = """  // ── Step 2a: Photo (device camera capture, gallery as fallback) ─────────
  // NOTE: previously this called launchCameraAsync() with no try/catch and
  // the deprecated `MediaTypeOptions.Images` enum, then silently chained a
  // `.catch()` straight into the gallery picker. On real devices that meant
  // any camera-activity error (permission race, low-memory activity kill,
  // hardware busy) was swallowed in a way that left the picker promise in a
  // bad state and the app appeared to "restart". This version explicitly
  // requests camera permission first, guards against double-taps while the
  // native camera is opening, and only falls back to the gallery on a real
  // error instead of unconditionally racing both pickers at once.
  const openCamera = async () => {
    if (capturingPhoto) return
    setCapturingPhoto(true)
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync()
      if (!perm.granted) {
        Alert.alert(
          'Camera Permission Required',
          'Please allow camera access to capture the citizen photo.'
        )
        return
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [3, 4],
        quality: 0.7,
        base64: true,
      })
      if (!result.canceled && result.assets && result.assets[0]) {
        const asset = result.assets[0]
        setPhotoUri(asset.uri)
        setPhotoBase64(asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : null)
        showToast('Photo captured successfully')
      }
    } catch (cameraError: any) {
      // Camera failed to open/capture — fall back to the gallery instead of
      // letting the rejected promise bubble up unhandled.
      try {
        const lib = await ImagePicker.requestMediaLibraryPermissionsAsync()
        if (!lib.granted) {
          Alert.alert(
            'Permission Required',
            cameraError?.message ?? 'Camera or gallery access is required.'
          )
          return
        }
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsEditing: true,
          aspect: [3, 4],
          quality: 0.7,
          base64: true,
        })
        if (!result.canceled && result.assets && result.assets[0]) {
          const asset = result.assets[0]
          setPhotoUri(asset.uri)
          setPhotoBase64(asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : null)
          showToast('Photo selected successfully')
        }
      } catch (galleryError: any) {
        Alert.alert(
          'Photo Capture Failed',
          galleryError?.message ?? 'Could not capture or select a photo. Please try again.'
        )
      }
    } finally {
      setCapturingPhoto(false)
    }
  }"""

OLD_SCROLLVIEW = """      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 140 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >"""

NEW_SCROLLVIEW = """      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          padding: 16,
          paddingBottom: 140,
          width: '100%',
          maxWidth: contentMaxWidth,
          alignSelf: 'center',
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >"""

OLD_PHOTO_BOX = """                <View
                  style={{
                    width: 80,
                    height: 96,
                    borderRadius: 8,
                    borderWidth: 2,
                    borderColor: photoUri ? TZ.green : T.border,
                    backgroundColor: T.card2,
                    overflow: 'hidden',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {photoUri ? (
                    <Image
                      source={{ uri: photoUri }}
                      style={{ width: 80, height: 96 }}
                      resizeMode="cover"
                    />
                  ) : (
                    <User size={32} color={T.textDim} />
                  )}
                </View>"""

NEW_PHOTO_BOX = """                <View
                  style={{
                    width: rscale(80),
                    height: rscale(96),
                    borderRadius: 8,
                    borderWidth: 2,
                    borderColor: photoUri ? TZ.green : T.border,
                    backgroundColor: T.card2,
                    overflow: 'hidden',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {photoUri ? (
                    <Image
                      source={{ uri: photoUri }}
                      style={{ width: rscale(80), height: rscale(96) }}
                      resizeMode="cover"
                    />
                  ) : (
                    <User size={32} color={T.textDim} />
                  )}
                </View>"""

OLD_PHOTO_BUTTON = """                  <TouchableOpacity
                    onPress={openCamera}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                      backgroundColor: photoUri ? `${TZ.green}20` : G,
                      borderRadius: 10,
                      paddingVertical: 11,
                      paddingHorizontal: 14,
                      borderWidth: photoUri ? 1 : 0,
                      borderColor: `${TZ.green}50`,
                    }}
                  >
                    <ImageIcon size={14} color={photoUri ? TZ.green : '#fff'} />
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: '700',
                        color: photoUri ? TZ.green : '#fff',
                      }}
                    >
                      {photoUri ? 'Change Photo' : 'Select Photo'}
                    </Text>
                  </TouchableOpacity>"""

NEW_PHOTO_BUTTON = """                  <TouchableOpacity
                    onPress={openCamera}
                    disabled={capturingPhoto}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                      backgroundColor: photoUri ? `${TZ.green}20` : G,
                      borderRadius: 10,
                      paddingVertical: 11,
                      paddingHorizontal: 14,
                      borderWidth: photoUri ? 1 : 0,
                      borderColor: `${TZ.green}50`,
                      opacity: capturingPhoto ? 0.7 : 1,
                    }}
                  >
                    {capturingPhoto ? (
                      <ActivityIndicator size="small" color={photoUri ? TZ.green : '#fff'} />
                    ) : (
                      <ImageIcon size={14} color={photoUri ? TZ.green : '#fff'} />
                    )}
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: '700',
                        color: photoUri ? TZ.green : '#fff',
                      }}
                    >
                      {capturingPhoto ? 'Opening Camera…' : photoUri ? 'Retake Photo' : 'Capture Photo'}
                    </Text>
                  </TouchableOpacity>"""

OLD_CARD_PREVIEW_USAGE = """              <IdCardPreview data={cardData} />"""
NEW_CARD_PREVIEW_USAGE = """              <IdCardPreview data={cardData} cardScale={isTablet ? 1.35 : 1} />"""


def patch_nin_screen(mobile_dir: Path) -> None:
    path = mobile_dir / "src/screens/village/NINRegistrationScreen.tsx"
    print(f"\n[1b/3] Patching {path.relative_to(mobile_dir.parent.parent)}")
    if not path.exists():
        print(f"  [WARN] {path} not found — skipping.")
        return
    replace_once(path, OLD_IMPORT_BLOCK, NEW_IMPORT_BLOCK, "import useResponsive hook")
    replace_once(path, OLD_ID_CARD_HEADER, NEW_ID_CARD_HEADER, "make IdCardPreview size responsive")
    replace_once(path, OLD_SCREEN_HEADER, NEW_SCREEN_HEADER, "use useResponsive() in screen body")
    replace_once(path, OLD_STEP2_STATE, NEW_STEP2_STATE, "add capturingPhoto state")
    replace_once(path, OLD_OPEN_CAMERA, NEW_OPEN_CAMERA, "fix openCamera() — try/catch + modern API")
    replace_once(path, OLD_SCROLLVIEW, NEW_SCROLLVIEW, "cap/center content width on tablets")
    replace_once(path, OLD_PHOTO_BOX, NEW_PHOTO_BOX, "scale photo placeholder box")
    replace_once(path, OLD_PHOTO_BUTTON, NEW_PHOTO_BUTTON, "disable+spinner on capture button")
    replace_once(path, OLD_CARD_PREVIEW_USAGE, NEW_CARD_PREVIEW_USAGE, "scale ID card preview on tablets")


# ──────────────────────────────────────────────────────────────────────────
# Fix 2 — apiResolver.ts: env-only backend, no hardcoded fallbacks
# ──────────────────────────────────────────────────────────────────────────

NEW_API_RESOLVER = '''/**
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
      'EXPO_PUBLIC_API_URL is not set.\\n' +
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
    console.log('[apiResolver] \\u2713 using configured backend:', REMOTE)
    return _cached
  }

  console.error('[apiResolver] \\u2717 configured backend unreachable:', REMOTE)
  throw new Error(
    'Unable to reach the TzCRVS backend at the URL configured in EXPO_PUBLIC_API_URL.\\n' +
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
'''


def patch_api_resolver(mobile_dir: Path) -> None:
    path = mobile_dir / "src/services/apiResolver.ts"
    print(f"\n[2] Patching {path.relative_to(mobile_dir.parent.parent)} (remove hardcoded fallback URLs)")
    if not path.exists():
        print(f"  [WARN] {path} not found — skipping.")
        return
    current = read(path) if path.exists() else ""
    if "EXPO_PUBLIC_API_URL is not set" in current and "LOCAL_ANDROID" not in current:
        print("  [skip] apiResolver.ts already env-only")
        return
    write(path, NEW_API_RESOLVER)
    print("  [OK] rewrote apiResolver.ts to use EXPO_PUBLIC_API_URL only (no hardcoded fallback)")


OLD_SYNC_DOC = '''/**
 * syncService.ts  v10.0  ONLINE-ONLY — real backend API
 *
 * Every function that reads or writes data goes to
 *   https://adlcs.onrender.com  \u2192  Supabase PostgreSQL
 *
 * DATA FLOW: Mobile \u2192 Render (Node/Express) \u2192 Supabase (PostgreSQL)
 *   \u2022 No SQLite, no local DB, no offline queue.
 *   \u2022 No NIN generated at birth \u2014 only BID (Birth Registration ID) + cert no.
 *   \u2022 NIN is issued by Village Officer at age 18 using the BID.
 * AbortSignal.timeout() NOT used (Hermes-incompatible); uses makeSignal() instead.
 */'''

NEW_SYNC_DOC = '''/**
 * syncService.ts  v10.0  ONLINE-ONLY \u2014 real backend API
 *
 * Every function that reads or writes data goes to the backend URL
 * configured in EXPO_PUBLIC_API_URL (mobile/.env) \u2192 Supabase PostgreSQL.
 * No backend URL is ever hardcoded here \u2014 see apiResolver.ts.
 *   \u2022 No SQLite, no local DB, no offline queue.
 *   \u2022 No NIN generated at birth \u2014 only BID (Birth Registration ID) + cert no.
 *   \u2022 NIN is issued by Village Officer at age 18 using the BID.
 * AbortSignal.timeout() NOT used (Hermes-incompatible); uses makeSignal() instead.
 */'''


def patch_sync_service_doc(mobile_dir: Path) -> None:
    path = mobile_dir / "src/services/syncService.ts"
    if not path.exists():
        return
    print(f"\n[2b] Updating stale doc comment in {path.relative_to(mobile_dir.parent.parent)}")
    replace_once(path, OLD_SYNC_DOC, NEW_SYNC_DOC, "remove hardcoded URL from doc comment")


# ──────────────────────────────────────────────────────────────────────────
# Fix 3 — shared responsive sizing hook
# ──────────────────────────────────────────────────────────────────────────

RESPONSIVE_UTIL = '''/**
 * responsive.ts \u2014 Shared responsive sizing helpers for TzCRVS Mobile
 *
 * Many screens previously read `Dimensions.get('window')` once at module
 * load time and used the raw pixel values directly. That breaks in two
 * ways: (1) it never updates on rotation/fold/multi-window resize, and
 * (2) the same fixed numbers are used on a small phone (e.g. Pixel 3a,
 * ~393\\u00d7785dp) and a large tablet (e.g. ~1024\\u00d71366dp), so layouts either
 * look cramped or absurdly small depending on the device.
 *
 * `useResponsive()` wraps `useWindowDimensions` (which DOES update live on
 * rotation/resize) and exposes a small set of helpers screens can use to
 * scale sizes and cap content width on larger screens.
 *
 * Usage:
 *   import { useResponsive } from '../../utils/responsive'
 *   const { isTablet, scale, contentMaxWidth } = useResponsive()
 *   <View style={{ width: scale(80), height: scale(96) }} />
 */
import { useWindowDimensions } from 'react-native'

// Baseline reference width used to compute the scale ratio \\u2014 a standard
// medium-size phone (e.g. Pixel 3a / iPhone 11 logical width).
export const BASE_WIDTH = 390

// Devices at/above this logical width are treated as tablets.
export const TABLET_BREAKPOINT = 768

export type ResponsiveInfo = {
  width: number
  height: number
  isTablet: boolean
  isLandscape: boolean
  /** Linearly scales a size relative to the 390dp baseline, clamped to
   *  0.85x\\u20131.6x so it never shrinks/grows too aggressively. */
  scale: (size: number) => number
  /** Caps content width on large screens/tablets so layouts don't stretch
   *  edge-to-edge and become hard to read; equals the raw width on phones. */
  contentMaxWidth: number
}

export function useResponsive(): ResponsiveInfo {
  const { width, height } = useWindowDimensions()
  const isTablet = width >= TABLET_BREAKPOINT
  const isLandscape = width > height
  const ratio = Math.min(Math.max(width / BASE_WIDTH, 0.85), 1.6)

  const scale = (size: number): number => Math.round(size * ratio)
  const contentMaxWidth = isTablet ? 720 : width

  return { width, height, isTablet, isLandscape, scale, contentMaxWidth }
}
'''


def create_responsive_util(mobile_dir: Path) -> None:
    path = mobile_dir / "src/utils/responsive.ts"
    print(f"\n[3] Creating {path.relative_to(mobile_dir.parent.parent)}")
    if path.exists():
        print("  [skip] responsive.ts already exists")
        return
    write(path, RESPONSIVE_UTIL)
    print("  [OK] created shared useResponsive() hook")


# ──────────────────────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────────────────────


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--root", help="Path to the project root (contains code/mobile, code/web).")
    args = ap.parse_args()

    root = find_project_root(args.root)
    mobile_dir = root / "code" / "mobile"
    print(f"Project root: {root}")
    print(f"Mobile dir:   {mobile_dir}")

    create_responsive_util(mobile_dir)
    patch_app_json(mobile_dir)
    patch_nin_screen(mobile_dir)
    patch_api_resolver(mobile_dir)
    patch_sync_service_doc(mobile_dir)

    print(
        "\nDone. Next steps:\n"
        "  1. cd code/mobile\n"
        "  2. Ensure mobile/.env has EXPO_PUBLIC_API_URL=https://<your-backend>/api\n"
        "  3. npx expo start --clear   (clear Metro cache after these changes)\n"
        "  4. Re-test: Village Officer \u2192 NIN Registration \u2192 Capture Photo on a real device\n"
    )


if __name__ == "__main__":
    main()
