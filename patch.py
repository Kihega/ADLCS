#!/usr/bin/env python3
"""
patch.py — ADLCS v6.0 Patch Script
Run from your project root (where code/ folder lives):
    python3 patch.py

What it does:
  1. Copies new/updated mobile source files into code/mobile/src/
  2. Copies new/updated backend route files into code/backend/src/routes/
  3. Updates App.js
  4. Patches backend index.js to register village routes
  5. Fixes the StyleSheet duplicate in RegisterBirthScreen (leftover v5 bug)
  6. Verifies all target files exist
"""

import os, shutil, sys

PATCH_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT   = PATCH_DIR  # run from repo root

def p(*parts):
    return os.path.join(PROJECT, *parts)

def ensure_dir(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)

def copy_file(src, dst):
    ensure_dir(dst)
    shutil.copy2(src, dst)
    print(f"  ✓  {dst.replace(PROJECT,'').lstrip(os.sep)}")

def patch_file(path, old, new, label=""):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    if old not in content:
        print(f"  ⚠  {label or path}: pattern not found (already patched?)")
        return
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content.replace(old, new, 1))
    print(f"  ✓  patched: {label or path.replace(PROJECT,'').lstrip(os.sep)}")

def write_file(path, content):
    ensure_dir(path)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"  ✓  written: {path.replace(PROJECT,'').lstrip(os.sep)}")

# ─── Source directory (files next to this script) ─────────────────────────────
SRC_MOBILE  = p('patch_files', 'code', 'mobile', 'src')
SRC_BACKEND = p('patch_files', 'code', 'backend', 'src')

# Allow running with files in same dir OR in patch_files/ subdir
if not os.path.isdir(SRC_MOBILE):
    SRC_MOBILE  = p('code', 'mobile', 'src')   # fallback: already in place
    SRC_BACKEND = p('code', 'backend', 'src')
    COPY_MODE   = False
else:
    COPY_MODE = True

print("\n══════════════════════════════════════════════")
print("  ADLCS v6.0 — Patch Script")
print("══════════════════════════════════════════════\n")

# ─── 1. Mobile service files ───────────────────────────────────────────────────
print("【1】 Updating mobile services…")

MOBILE = p('code', 'mobile')

files_mobile = {
    # services
    os.path.join('src','services','syncService.ts'):
        os.path.join(SRC_MOBILE,'services','syncService.ts'),

    # hospital screens
    os.path.join('src','screens','hospital','HospitalHomeScreen.tsx'):
        os.path.join(SRC_MOBILE,'screens','hospital','HospitalHomeScreen.tsx'),
    os.path.join('src','screens','hospital','ViewRecordsScreen.tsx'):
        os.path.join(SRC_MOBILE,'screens','hospital','ViewRecordsScreen.tsx'),

    # village screens
    os.path.join('src','screens','village','VillageHomeScreen.tsx'):
        os.path.join(SRC_MOBILE,'screens','village','VillageHomeScreen.tsx'),
    os.path.join('src','screens','village','RegisterCitizenScreen.tsx'):
        os.path.join(SRC_MOBILE,'screens','village','RegisterCitizenScreen.tsx'),
    os.path.join('src','screens','village','VillageRecordBirthScreen.tsx'):
        os.path.join(SRC_MOBILE,'screens','village','VillageRecordBirthScreen.tsx'),
    os.path.join('src','screens','village','VillageRecordDeathAndMigration.tsx'):
        os.path.join(SRC_MOBILE,'screens','village','VillageRecordDeathAndMigration.tsx'),
    os.path.join('src','screens','village','VillageReportsScreen.tsx'):
        os.path.join(SRC_MOBILE,'screens','village','VillageReportsScreen.tsx'),
}

for rel_dst, src in files_mobile.items():
    dst = os.path.join(MOBILE, rel_dst)
    if COPY_MODE and os.path.isfile(src):
        copy_file(src, dst)
    elif os.path.isfile(dst):
        print(f"  ✓  already in place: {rel_dst}")
    else:
        print(f"  ✗  MISSING source: {src}")

# ─── 2. App.js ────────────────────────────────────────────────────────────────
print("\n【2】 Updating App.js…")
app_src = p('patch_files','code','mobile','App.js') if COPY_MODE else None
app_dst = os.path.join(MOBILE, 'App.js')
if app_src and os.path.isfile(app_src):
    copy_file(app_src, app_dst)
else:
    print("  ℹ  App.js — apply manually from patch_files/code/mobile/App.js")

# ─── 3. Backend routes ────────────────────────────────────────────────────────
print("\n【3】 Updating backend routes…")
BACKEND = p('code','backend')

backend_files = {
    os.path.join('src','routes','village.js'):
        os.path.join(SRC_BACKEND,'routes','village.js'),
}
for rel_dst, src in backend_files.items():
    dst = os.path.join(BACKEND, rel_dst)
    if COPY_MODE and os.path.isfile(src):
        copy_file(src, dst)
    elif os.path.isfile(dst):
        print(f"  ✓  already in place: {rel_dst}")
    else:
        ensure_dir(dst)
        print(f"  ✗  MISSING: {src}")

# ─── 4. Patch backend index.js — register village router ──────────────────────
print("\n【4】 Patching backend index.js…")
idx = os.path.join(BACKEND, 'src', 'index.js')

if os.path.isfile(idx):
    # Add village router require
    patch_file(idx,
        "const syncRouter     = require('./routes/syncRoutes')",
        "const syncRouter     = require('./routes/syncRoutes')\n"
        "const villageRouter  = require('./routes/village')",
        "add villageRouter require"
    )
    # Register village router
    patch_file(idx,
        "app.use('/api/officer', syncRouter)",
        "app.use('/api/officer', syncRouter)\n"
        "app.use('/api/village', villageRouter)\n"
        "app.use('/api/officer', villageRouter)   // profile endpoint",
        "register villageRouter"
    )
else:
    print(f"  ✗  index.js not found at {idx}")

# ─── 5. Fix duplicate StyleSheet in RegisterBirthScreen ───────────────────────
print("\n【5】 Fixing RegisterBirthScreen duplicate StyleSheet…")
rb = os.path.join(MOBILE,'src','screens','hospital','RegisterBirthScreen.tsx')
if os.path.isfile(rb):
    patch_file(rb,
        "\nconst StyleSheet = require('react-native').StyleSheet\n",
        "\n",
        "remove duplicate StyleSheet"
    )
else:
    print("  ℹ  RegisterBirthScreen.tsx not found — skip")

# ─── 6. Create village screen dirs ────────────────────────────────────────────
print("\n【6】 Ensuring village screen directory exists…")
village_dir = os.path.join(MOBILE,'src','screens','village')
os.makedirs(village_dir, exist_ok=True)
print(f"  ✓  {village_dir}")

# ─── 7. Verification ──────────────────────────────────────────────────────────
print("\n【7】 Verification…")
REQUIRED = [
    os.path.join(MOBILE,'App.js'),
    os.path.join(MOBILE,'src','services','syncService.ts'),
    os.path.join(MOBILE,'src','screens','hospital','HospitalHomeScreen.tsx'),
    os.path.join(MOBILE,'src','screens','hospital','ViewRecordsScreen.tsx'),
    os.path.join(MOBILE,'src','screens','village','VillageHomeScreen.tsx'),
    os.path.join(MOBILE,'src','screens','village','RegisterCitizenScreen.tsx'),
    os.path.join(MOBILE,'src','screens','village','VillageRecordBirthScreen.tsx'),
    os.path.join(MOBILE,'src','screens','village','VillageRecordDeathAndMigration.tsx'),
    os.path.join(MOBILE,'src','screens','village','VillageReportsScreen.tsx'),
    os.path.join(BACKEND,'src','routes','village.js'),
]

all_ok = True
for f in REQUIRED:
    exists = os.path.isfile(f)
    status = '✓' if exists else '✗ MISSING'
    print(f"  {status}  {f.replace(PROJECT,'').lstrip(os.sep)}")
    if not exists: all_ok = False

print()
if all_ok:
    print("══════════════════════════════════════════════")
    print("  ✅  All patches applied successfully!")
    print("══════════════════════════════════════════════")
    print()
    print("Next steps:")
    print("  cd code/mobile && npm install && npx expo start --clear")
    print("  cd code/backend && npm install && npm run dev")
else:
    print("══════════════════════════════════════════════")
    print("  ⚠   Some files are missing — check above.")
    print("══════════════════════════════════════════════")
    sys.exit(1)
