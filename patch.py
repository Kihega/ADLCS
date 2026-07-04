#!/usr/bin/env python3
"""
apply_village_add_fix.py
===========================

Small, self-contained fix for one issue:

    "In NIN/birth registration I entered the first village and it
    registered fine, but the next time I try to add a village that isn't
    registered yet for a different ward, the add button doesn't work — I
    can't add the village."

ROOT CAUSE
----------
code/mobile/src/components/GeoCascadePicker.tsx — `handleCreateVillage()`
started with:

    if (!value.wardId) return

If `value.wardId` was ever momentarily falsy when "Use This Name" was
tapped (e.g. a state update from selecting the Ward still in flight, or
any other timing edge case), this silently did nothing at all — no error,
no alert, no console log. From the officer's side that's indistinguishable
from the button being disabled: you tap it, and nothing happens.

The same function also silently swallowed any network/API error in a bare
`catch {}` with no feedback — so a failed save (e.g. brief connectivity
drop) looked exactly the same way: tap the button, nothing visibly
happens.

FIX
---
- Every path through `handleCreateVillage()` now gives visible feedback
  (an Alert) instead of silently doing nothing — the button always
  *does* something when tapped, per your request.
- Adds the requested duplicate check: before creating a new village, it
  checks case-insensitively against the villages already loaded for the
  selected ward. If a match is found, it shows a warning Alert
  ("Village Already Exists") and selects the existing entry instead of
  creating a confusing near-duplicate — it does NOT block the officer,
  it just avoids two entries for the same place.
- If the ward truly isn't selected yet, it now says so explicitly
  ("Select a Ward First") instead of doing nothing.

Safe to re-run (idempotent).

USAGE
-----
    python3 apply_village_add_fix.py [--root /path/to/project]
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


OLD_IMPORTS = """import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  FlatList,
  ActivityIndicator,
} from 'react-native'"""

NEW_IMPORTS = """import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  FlatList,
  ActivityIndicator,
  Alert,
} from 'react-native'"""

OLD_HANDLE_CREATE = """  const handleCreateVillage = async (name: string) => {
    if (!value.wardId) return
    setCreatingVillage(true)
    try {
      const json = await apiPost('/geo/villages', {
        wardId: value.wardId,
        name,
        type: value.villageType,
      })
      if (json.success && json.data) {
        onChange({ ...value, villageId: json.data.id, villageName: json.data.name })
        setVillages((prev) =>
          prev.some((v) => v.id === json.data.id) ? prev : [...prev, json.data].sort((a, b) => a.name.localeCompare(b.name))
        )
        setOpenSheet(null)
      }
    } catch {
      // Swallow — the sheet stays open so the officer can retry.
    } finally {
      setCreatingVillage(false)
    }
  }"""

NEW_HANDLE_CREATE = """  const handleCreateVillage = async (name: string) => {
    const cleanName = name.trim()
    if (!cleanName) return

    // NOTE: this used to be `if (!value.wardId) return` — a silent no-op.
    // If wardId was ever momentarily unset (e.g. a state update still in
    // flight right after picking the ward), tapping "Use This Name" did
    // absolutely nothing with zero feedback, which is indistinguishable
    // from the button being disabled. Now we tell the officer exactly
    // what's missing instead of failing silently, so the button always
    // *does* something when tapped.
    if (!value.wardId) {
      Alert.alert(
        'Select a Ward First',
        'Please select a Region, District, and Ward before adding a new village/street.'
      )
      return
    }

    // Warn (but don't block) if this name already exists in the loaded
    // list for this ward — case-insensitive, since "Kati" and "kati" are
    // the same place. The backend's get-or-create is safe to call either
    // way, but surfacing this up front avoids confusing the officer with
    // two entries that look different but are actually the same village.
    const existing = villages.find((v) => v.name.trim().toLowerCase() === cleanName.toLowerCase())
    if (existing) {
      Alert.alert(
        'Village Already Exists',
        `"${existing.name}" is already registered in this ward. Selecting the existing entry instead of creating a duplicate.`,
        [
          {
            text: 'OK',
            onPress: () => {
              onChange({ ...value, villageId: existing.id, villageName: existing.name })
              setOpenSheet(null)
            },
          },
        ]
      )
      return
    }

    setCreatingVillage(true)
    try {
      const json = await apiPost('/geo/villages', {
        wardId: value.wardId,
        name: cleanName,
        type: value.villageType,
      })
      if (json.success && json.data) {
        onChange({ ...value, villageId: json.data.id, villageName: json.data.name })
        setVillages((prev) =>
          prev.some((v) => v.id === json.data.id) ? prev : [...prev, json.data].sort((a, b) => a.name.localeCompare(b.name))
        )
        setOpenSheet(null)
      } else {
        Alert.alert('Could Not Add Village', json.message ?? 'Please try again.')
      }
    } catch (err: any) {
      // Previously this silently swallowed the error, leaving the officer
      // staring at a button that appeared to do nothing after tapping it.
      Alert.alert(
        'Could Not Add Village',
        err?.message ?? 'Something went wrong while saving this village. Please try again.'
      )
    } finally {
      setCreatingVillage(false)
    }
  }"""


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--root", help="Path to the project root.")
    args = ap.parse_args()

    root = find_project_root(args.root)
    path = root / "code/mobile/src/components/GeoCascadePicker.tsx"
    print(f"Project root: {root}")
    print(f"Patching {path}")

    replace_once(path, OLD_IMPORTS, NEW_IMPORTS, "import Alert from react-native")
    replace_once(
        path, OLD_HANDLE_CREATE, NEW_HANDLE_CREATE,
        "fix silent no-op + add duplicate-name warning in handleCreateVillage()",
    )

    print(
        "\nDone. Re-test: Village/Hospital officer -> pick a Region/District/Ward that has\n"
        "no villages yet -> '+ Add new village' -> type a name -> 'Use This Name' should\n"
        "now always save it (or warn you if that name already exists in that ward)."
    )


if __name__ == "__main__":
    main()
