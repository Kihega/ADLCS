#!/usr/bin/env python3
"""
fix_new_registration_modal_import_corruption.py

Run from the ADLCS project root:
    python3 fix_new_registration_modal_import_corruption.py

Repairs code/web/src/modals/NewRegistrationModal.jsx after a previous patch
script inserted a stray single-line import in the middle of the existing
multi-line import block, causing:

    Parsing error: Unexpected keyword 'import'

Before (broken):
    import {
    import { apiCreateVillage } from '../api/admin.api';
      apiCreateDistrictAdmin, apiCreateVillageOfficer, apiCreateHealthOfficer,
      ...
    } from '../api/admin.api'  // PATCH-EMAIL-2025

After (fixed):
    import {
      apiCreateDistrictAdmin, apiCreateVillageOfficer, apiCreateHealthOfficer,
      ...
      apiCreateVillage,
    } from '../api/admin.api'  // PATCH-EMAIL-2025

Behavior:
  - Scans ONLY code/web/src (UI source) — never touches node_modules,
    package*.json, vite config, or any dependency/build files.
  - Removes the stray single-line `import { apiCreateVillage } from
    '../api/admin.api';` line if present anywhere in the file.
  - Ensures apiCreateVillage is folded into the existing multi-line
    `import { ... } from '../api/admin.api'` block (added once, no dupes).
  - Fully idempotent: safe to re-run; no-ops if the file is already correct.
  - Refuses to touch the file (exits non-zero with a clear message) if the
    expected multi-line import block for '../api/admin.api' can't be found,
    rather than guessing.
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
TARGET = ROOT / "code" / "web" / "src" / "modals" / "NewRegistrationModal.jsx"

MODULE = "../api/admin.api"

STRAY_LINE_RE = re.compile(
    r"^[ \t]*import\s*\{\s*apiCreateVillage\s*\}\s*from\s*'\.\./api/admin\.api'\s*;?\s*\n",
    re.MULTILINE,
)

# Matches the whole multi-line `import { ...names... } from '../api/admin.api'`
# block, including any trailing same-line comment. DOTALL so `.` in the names
# group can span multiple physical lines.
BLOCK_RE = re.compile(
    r"(import\s*\{)(?P<names>.*?)(\}\s*from\s*'\.\./api/admin\.api'[^\n]*)",
    re.DOTALL,
)


def fail(msg):
    print(f"[FAIL] {msg}")
    sys.exit(1)


def main():
    if not (ROOT / "code" / "web").is_dir():
        fail("code/web not found. Run this script from the ADLCS project root.")

    if not TARGET.is_file():
        fail(f"Target file not found: {TARGET.relative_to(ROOT)}")

    original = TARGET.read_text(encoding="utf-8")
    text = original

    # Step 1: remove the stray single-line import, if present.
    stray_matches = STRAY_LINE_RE.findall(text)
    text = STRAY_LINE_RE.sub("", text)
    if stray_matches:
        print(f"[INFO] Removed {len(stray_matches)} stray import line(s).")

    # Step 2: find the real multi-line import block from admin.api.
    match = BLOCK_RE.search(text)
    if not match:
        fail(
            f"Could not find the expected multi-line import block "
            f"`import {{ ... }} from '{MODULE}'` in "
            f"{TARGET.relative_to(ROOT)}. File may have changed structure — "
            f"refusing to guess. Please inspect manually."
        )

    names_block = match.group("names")

    if re.search(r"\bapiCreateVillage\b", names_block):
        if text == original:
            print(f"[OK] {TARGET.relative_to(ROOT)} is already correct. No changes needed.")
        else:
            TARGET.write_text(text, encoding="utf-8")
            print(f"[PATCHED] {TARGET.relative_to(ROOT)}")
            print("Summary: removed stray duplicate import line; "
                  "apiCreateVillage was already present in the main import block.")
        return

    # Step 3: fold apiCreateVillage into the existing block, once.
    new_names_block = names_block.rstrip("\n") + "\n  apiCreateVillage,\n"
    start, end = match.span("names")
    text = text[:start] + new_names_block + text[end:]

    TARGET.write_text(text, encoding="utf-8")
    print(f"[PATCHED] {TARGET.relative_to(ROOT)}")
    print(f"Summary: folded apiCreateVillage into the existing "
          f"`import {{ ... }} from '{MODULE}'` block.")


if __name__ == "__main__":
    main()
