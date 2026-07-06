#!/usr/bin/env python3
"""
apply_upload_from_device_backup.py
======================================

Adds a second, deliberately simple photo path to NIN Registration's
Biometric Registration step, as a backup for when the camera capture flow
keeps crashing on a given device.

WHAT THIS ADDS
--------------
A new "Upload from Device (max 3MB)" button right below the existing
"Capture Photo" button. Tapping it:
  - Opens the plain system photo picker (NO native crop screen, NO camera,
    NO compression pipeline at all) — deliberately skipping every step
    that has been implicated in the camera-capture crash so far.
  - Checks the picked file's size directly. If it's already 3MB or
    smaller, it's used exactly as-is (read once as base64, no re-encoding).
  - If it's larger than 3MB, shows an alert asking the officer to pick a
    smaller photo instead — it does NOT try to process/compress it, since
    the whole point of this path is to avoid every processing step that
    might be involved in the ongoing crash.

Once a photo is picked this way, it's stored in the exact same
`photoUri`/`photoBase64` state as the camera path, so every screen after
this point (the ID card preview, NIN issuance, Cloudinary upload on
submit) works completely unchanged — this is purely an alternate way to
GET the photo into that state, not a parallel data path.

Safe to re-run (idempotent).

USAGE
-----
    python3 apply_upload_from_device_backup.py [--root /path/to/project]

This is independent of (and can be applied before or after) the previous
compression-loop-fix and native-crop-removal patches — it doesn't touch
either of those code paths, it just adds a new, separate one alongside
them.

AFTER RUNNING — rebuild the APK:
    cd code/mobile
    EAS_NO_VCS=1 EAS_SKIP_AUTO_FINGERPRINT=1 npx eas build --platform android --profile preview
"""

from __future__ import annotations

import argparse
from pathlib import Path


def find_project_root(explicit):
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
    for p in Path.cwd().rglob("package.json"):
        if p.parent.name == "mobile" and (p.parent.parent / "web").exists():
            return p.parent.parent.parent
    raise SystemExit(
        "Could not locate the project root (expected <root>/code/mobile/package.json).\n"
        "Re-run with --root /path/to/your/project."
    )


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def write(path: Path, text: str) -> None:
    path.write_text(text, encoding="utf-8")


def replace_once(path: Path, old: str, new: str, label: str) -> bool:
    if not path.exists():
        print(f"  [WARN] {label}: {path} not found — skipping.")
        return False
    text = read(path)
    if new in text:
        print(f"  [skip] {label} (already applied)")
        return False
    if old in text:
        text = text.replace(old, new, 1)
        write(path, text)
        print(f"  [OK] {label}")
        return True
    print(f"  [WARN] {label}: expected text not found — file may have changed; skipping.")
    return False


OLD_ICON_IMPORTS = """import {
  ArrowLeft,
  Search,
  Check,
  Shield,
  Image as ImageIcon,
  Fingerprint,
  IdCard,
  CheckCircle2,
  Copy,
  Download,
  AlertCircle,
  ChevronRight,
  User,
  Printer,
} from 'lucide-react-native'"""

NEW_ICON_IMPORTS = """import {
  ArrowLeft,
  Search,
  Check,
  Shield,
  Image as ImageIcon,
  Fingerprint,
  IdCard,
  CheckCircle2,
  Copy,
  Download,
  AlertCircle,
  ChevronRight,
  User,
  Printer,
  Upload,
} from 'lucide-react-native'"""

OLD_CAPTURING_STATE = """  const [capturingPhoto, setCapturingPhoto] = useState(false)"""

NEW_CAPTURING_STATE = """  const [capturingPhoto, setCapturingPhoto] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)"""

OLD_HANDLER_BOUNDARY = """    } finally {
      setCapturingPhoto(false)
    }
  }

  // ── Step 2b: Fingerprints (manual confirmation) ────────────────────────"""

NEW_HANDLER_BOUNDARY = """    } finally {
      setCapturingPhoto(false)
    }
  }

  // ── Step 2a-backup: Upload an existing photo from the device ────────────
  // A separate, deliberately simple backup path for when the camera+crop
  // flow keeps failing on a given device. No native crop screen, no
  // compression pipeline at all — the officer picks an existing photo and
  // we just check its size directly. If it's already small enough
  // (<= 3MB), it's used as-is; if not, we ask them to pick a smaller one
  // instead of trying to process it, since the whole point of this path
  // is to avoid every step that has been implicated in the camera crash.
  const MAX_UPLOAD_BYTES = 3 * 1024 * 1024 // 3MB

  const pickImageFromDevice = async () => {
    if (uploadingPhoto) return
    setUploadingPhoto(true)
    try {
      const lib = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!lib.granted) {
        Alert.alert(
          'Permission Required',
          'Please allow photo library access to upload a citizen photo.'
        )
        return
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 1,
      })
      if (result.canceled || !result.assets || !result.assets[0]) return

      const asset = result.assets[0]
      const info = await FileSystem.getInfoAsync(asset.uri, { size: true } as any)
      const size = info.exists && typeof (info as any).size === 'number' ? (info as any).size : 0

      if (size > MAX_UPLOAD_BYTES) {
        Alert.alert(
          'Photo Too Large',
          `This photo is ${(size / (1024 * 1024)).toFixed(1)}MB. Please choose a photo that is 3MB or smaller — most phones let you pick a lower-resolution or previously-shared copy from the gallery.`
        )
        return
      }

      const base64 = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      })
      setPhotoUri(asset.uri)
      setPhotoBase64(`data:image/jpeg;base64,${base64}`)
      showToast('Photo uploaded successfully')
    } catch (err: any) {
      Alert.alert(
        'Upload Failed',
        err?.message ?? 'Could not upload this photo. Please try again or use a different photo.'
      )
    } finally {
      setUploadingPhoto(false)
    }
  }

  // ── Step 2b: Fingerprints (manual confirmation) ────────────────────────"""

OLD_CAPTURE_BUTTON = """                  <TouchableOpacity
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

NEW_CAPTURE_BUTTON = """                  <TouchableOpacity
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
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={pickImageFromDevice}
                    disabled={uploadingPhoto}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      backgroundColor: 'transparent',
                      borderRadius: 10,
                      paddingVertical: 11,
                      paddingHorizontal: 14,
                      borderWidth: 1,
                      borderColor: T.border,
                      opacity: uploadingPhoto ? 0.7 : 1,
                    }}
                  >
                    {uploadingPhoto ? (
                      <ActivityIndicator size="small" color={T.textSub} />
                    ) : (
                      <Upload size={14} color={T.textSub} />
                    )}
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: '700',
                        color: T.textSub,
                      }}
                    >
                      {uploadingPhoto ? 'Uploading…' : 'Upload from Device (max 3MB)'}
                    </Text>
                  </TouchableOpacity>"""


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--root", help="Path to the project root.")
    args = ap.parse_args()

    root = find_project_root(args.root)
    path = root / "code/mobile/src/screens/village/NINRegistrationScreen.tsx"
    print(f"Project root: {root}")
    print(f"Patching {path}")

    replace_once(path, OLD_ICON_IMPORTS, NEW_ICON_IMPORTS, "import Upload icon")
    replace_once(path, OLD_CAPTURING_STATE, NEW_CAPTURING_STATE, "add uploadingPhoto state")
    replace_once(path, OLD_HANDLER_BOUNDARY, NEW_HANDLER_BOUNDARY, "add pickImageFromDevice() handler")
    replace_once(path, OLD_CAPTURE_BUTTON, NEW_CAPTURE_BUTTON, "add 'Upload from Device' button below Capture Photo")

    print(
        "\nDone. Next steps:\n"
        "  1. cd code/mobile\n"
        "  2. EAS_NO_VCS=1 EAS_SKIP_AUTO_FINGERPRINT=1 npx eas build --platform android --profile preview\n"
        "  3. Re-test: NIN Registration -> Biometric step -> 'Upload from Device (max 3MB)'\n"
        "     -> pick an existing small photo -> should appear in the preview box\n"
        "     immediately with no crash, and the rest of the flow continues exactly as\n"
        "     it does after a successful camera capture.\n"
    )


if __name__ == "__main__":
    main()
