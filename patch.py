#!/usr/bin/env python3
"""
patch_districtadmin_department_fix.py
────────────────────────────────────────────────────────────────────────────
Run this from the ADLCS project ROOT (the folder that contains `code/`),
AFTER all previous patches have already been applied.

    cd ADLCS
    python3 patch_districtadmin_department_fix.py

WHAT THIS PATCH FIXES
──────────────────────
Cross-checked against the real Prisma schema (schema.txt), which surfaced
two issues:

1) `node prisma/seed.js` failed with:

    PrismaClientValidationError: Invalid `prisma.districtAdmin.create()`
    invocation ... Unknown argument `department`.

   Unlike `SuperAdmin`, the `DistrictAdmin` model has no `department`
   column at all. Three places were written as if it did — this never
   surfaced before because a genuinely blank/undefined `department` is
   silently ignored by Prisma, and nothing had ever passed a real value
   through for a District Admin until seed.js did:

   a. `code/backend/prisma/seed.js` — District Admin creation set
      `department: 'Civil Registration'`. Removed.
   b. `code/backend/src/routes/admin.js` — the `POST /district-admins`
      route passed `department: department || undefined` into
      `prisma.districtAdmin.create()`. This would have crashed in
      production the moment anyone actually typed a department for a
      District Admin on the web form. Removed (the field is still
      accepted-but-ignored from the request body).
   c. `code/web/src/modals/NewRegistrationModal.jsx` — the "Department
      (optional)" field was shown for both National and District Admin
      scopes. Now shown for National Admin only.

2) `Region.jurisdiction` is a REQUIRED enum (`mainland` | `zanzibar`) with
   no default value. `getOrCreateRegion()` in seed.js only ever provided
   `name` when creating a new region, which would fail the moment it had
   to actually create one (rather than find an existing one) — exactly
   what happens for a brand-new region like "Iringa" on a fresh database.
   Fixed by defaulting new regions to `mainland` (correct for every region
   this codebase currently seeds; Zanzibar's regions would need a manual
   override if ever added).

This script is idempotent — safe to run more than once.
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CODE = ROOT / "code"
BACKEND = CODE / "backend"
WEB = CODE / "web"

FAILURES = []


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def write(path: Path, text: str):
    path.write_text(text, encoding="utf-8")


def patch(path: Path, marker: str, replacements, label: str):
    if not path.exists():
        print(f"  [SKIP] {label}: file not found -> {path}")
        FAILURES.append(f"{label}: file not found ({path})")
        return

    text = read(path)
    if marker in text:
        print(f"  [OK]   {label}: already patched, skipping")
        return

    changed = False
    for old, new in replacements:
        if old not in text:
            print(f"  [FAIL] {label}: anchor not found (first 80 chars):")
            print(f"         {old[:80]!r}")
            FAILURES.append(f"{label}: anchor not found")
            continue
        if text.count(old) > 1:
            print(f"  [WARN] {label}: anchor matched {text.count(old)} times, replacing first occurrence only")
        text = text.replace(old, new, 1)
        changed = True

    if changed:
        write(path, text)
        print(f"  [OK]   {label}: patched")
    else:
        print(f"  [FAIL] {label}: nothing applied")


def patch_seed_js():
    print("\n[1/3] backend/prisma/seed.js — remove department from District Admin")
    path = BACKEND / "prisma/seed.js"
    marker = "PATCH-DISTRICTADMIN-DEPT-FIX-2026"

    replacements = [(
        "      regionId:     region.id,\n"
        "      districtId:   district.id,\n"
        "      department:   'Civil Registration',\n"
        "      status:       'active',\n",
        "      // PATCH-DISTRICTADMIN-DEPT-FIX-2026: DistrictAdmin has no `department`\n"
        "      // column in this schema (unlike SuperAdmin) — removed.\n"
        "      regionId:     region.id,\n"
        "      districtId:   district.id,\n"
        "      status:       'active',\n",
    )]
    patch(path, marker, replacements, "seed.js District Admin department removal")


def patch_admin_js():
    print("\n[2/3] backend/src/routes/admin.js — stop writing department for District Admin")
    path = BACKEND / "src/routes/admin.js"
    marker = "PATCH-DISTRICTADMIN-DEPT-FIX-2026"

    replacements = [(
        "        regionId: regionId ? Number(regionId) : undefined,\n"
        "        districtId: districtId ? Number(districtId) : undefined,\n"
        "        department: department || undefined,\n"
        "        status: 'active',\n"
        "        passwordHash,\n"
        "        createdById: req.user.id,\n"
        "      },\n"
        "      select: { id: true, fullName: true, email: true, employeeId: true, status: true },\n"
        "    })\n"
        "    await logAction(req, { action: 'create_district_admin', targetTable: 'district_admins', targetId: created.id, newData: created })\n"
        "    sendWelcomeEmail({ to: email, fullName, role: 'district_admin', defaultPassword }).catch(err => console.error('[email/district-admin]', err.message))\n",
        "        regionId: regionId ? Number(regionId) : undefined,\n"
        "        districtId: districtId ? Number(districtId) : undefined,\n"
        "        // PATCH-DISTRICTADMIN-DEPT-FIX-2026: DistrictAdmin has no `department`\n"
        "        // column in this schema (unlike SuperAdmin) — accepted in the request\n"
        "        // body but intentionally not written here.\n"
        "        status: 'active',\n"
        "        passwordHash,\n"
        "        createdById: req.user.id,\n"
        "      },\n"
        "      select: { id: true, fullName: true, email: true, employeeId: true, status: true },\n"
        "    })\n"
        "    await logAction(req, { action: 'create_district_admin', targetTable: 'district_admins', targetId: created.id, newData: created })\n"
        "    sendWelcomeEmail({ to: email, fullName, role: 'district_admin', defaultPassword }).catch(err => console.error('[email/district-admin]', err.message))\n",
    )]
    patch(path, marker, replacements, "admin.js District Admin department removal")


def patch_modal():
    print("\n[3/3] web/src/modals/NewRegistrationModal.jsx — Department field: National Admin only")
    path = WEB / "src/modals/NewRegistrationModal.jsx"
    marker = "PATCH-DISTRICTADMIN-DEPT-FIX-2026"

    replacements = [(
        "                {(target === 'super_admin' || target === 'district_admin') && (\n"
        "                  <div>\n"
        "                    <label className={lbl}>Department (optional)</label>\n"
        "                    <input className={inp} value={form.department} onChange={e => set('department', e.target.value)}\n"
        "                      placeholder={target === 'super_admin' ? 'e.g. Statistics & Data Management' : 'e.g. Civil Registration'} />\n"
        "                  </div>\n"
        "                )}\n",
        "                {/* PATCH-DISTRICTADMIN-DEPT-FIX-2026: District Admin has no\n"
        "                    `department` column in this schema — only National Admin does. */}\n"
        "                {target === 'super_admin' && (\n"
        "                  <div>\n"
        "                    <label className={lbl}>Department (optional)</label>\n"
        "                    <input className={inp} value={form.department} onChange={e => set('department', e.target.value)}\n"
        "                      placeholder=\"e.g. Statistics & Data Management\" />\n"
        "                  </div>\n"
        "                )}\n",
    )]
    patch(path, marker, replacements, "NewRegistrationModal.jsx Department field scope")


def patch_region_jurisdiction():
    print("\n[4/4] backend/prisma/seed.js — Region.jurisdiction has no default")
    path = BACKEND / "prisma/seed.js"
    marker = "PATCH-REGION-JURISDICTION-FIX-2026"

    replacements = [(
        "async function getOrCreateRegion(name) {\n"
        "  const existing = await prisma.region.findFirst({ where: { name } })\n"
        "  if (existing) return existing\n"
        "  return prisma.region.create({ data: { name } })\n"
        "}\n",
        "// PATCH-REGION-JURISDICTION-FIX-2026: Region.jurisdiction is a REQUIRED enum\n"
        "// (mainland | zanzibar) with no default — creating a brand-new region\n"
        "// without it fails. Every region this script seeds is mainland Tanzania.\n"
        "async function getOrCreateRegion(name, jurisdiction = 'mainland') {\n"
        "  const existing = await prisma.region.findFirst({ where: { name } })\n"
        "  if (existing) return existing\n"
        "  return prisma.region.create({ data: { name, jurisdiction } })\n"
        "}\n",
    )]
    patch(path, marker, replacements, "seed.js Region.jurisdiction fix")


def main():
    print("=" * 78)
    print("ADLCS PATCH #6 — fix DistrictAdmin has-no-`department` crash")
    print("=" * 78)

    if not CODE.exists():
        print(f"\nERROR: {CODE} does not exist.")
        print("Run this script from the ADLCS project root (the folder containing `code/`).")
        sys.exit(1)

    patch_seed_js()
    patch_admin_js()
    patch_modal()
    patch_region_jurisdiction()

    print("\n" + "=" * 78)
    if FAILURES:
        print(f"DONE WITH {len(FAILURES)} ISSUE(S) — review the lines above:")
        for f in FAILURES:
            print(f"  - {f}")
        sys.exit(1)
    else:
        print("DONE — all three spots fixed.")
        print("\nNext step:")
        print("  node code/backend/prisma/seed.js")
    print("=" * 78)


if __name__ == "__main__":
    main()
