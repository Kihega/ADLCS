#!/usr/bin/env python3
"""
patch_admin_ux_and_cleanup.py
────────────────────────────────────────────────────────────────────────────
Run this from the ADLCS project ROOT (the folder that contains `code/`),
AFTER patch_migration_flow.py AND patch_bid_and_registration.py have
already been applied.

    cd ADLCS
    python3 patch_admin_ux_and_cleanup.py

WHAT THIS PATCH DOES
─────────────────────

1) UNIFIED, BID-DRIVEN ADMIN/OFFICER REGISTRATION
   - The separate "New District Admin" button on the District Admins screen
     is removed. In its place, Manage Users gets a single, always-visible
     "Add New Admin" button (where the dead-end "Public Users" tab used to
     be) that opens ONE registration form for both National and District
     admins, switched by a "Scope" dropdown (District reveals Region +
     District pickers).
   - That same form (minus the Scope dropdown) is reused for Village and
     Health Officer registration, opened from their own screens.
   - Every one of these forms now starts with a Birth ID (BID) search: type
     the person's BID, hit Search, and their identity (name, gender, NIN,
     village) is pulled straight from the citizen registry and shown in a
     confirmation card — no more free-typed "Full Name" field. Health
     Officer registration also gains a "Facility Name" field (the backend
     finds-or-creates the facility) since it never actually had one wired
     up before.
   - Default password is a real field, pre-filled `Admin@1234`, editable.
   - Schema: SuperAdmin/DistrictAdmin/VillageOfficer/HospitalOfficer each
     get a real `citizenId` foreign key to `Citizen` (unique), replacing
     the loose, unlinked `birthId` string copy with a proper relation —
     "clean database relations" reflecting what the UI now actually does.

2) DASHBOARD FIXES
   - Removed the "Recent Activity" card (last card on the Overview tab).
   - "Super Administrator" label shortened to "Administrator".
   - Light mode: the whole theme is a single CSS invert filter, which is
     why translucent text/borders looked washed out — added a small
     contrast/brightness correction, and excluded the top bar from the
     invert entirely (it was already meant to be excluded via a
     `[data-no-invert]` selector that nothing actually used).
   - All `window.confirm` / `alert` calls (delete confirmations, update/
     delete error messages) replaced with an in-app modal component.
   - Deleting a District Admin, Village Officer, or Health Officer that
     has created accounts or handled registrations used to crash with a
     bare "Internal server error" (an uncaught Postgres foreign-key
     violation). Now returns a clear, specific message instead — the
     underlying records are deliberately NOT cascade-deleted, since that
     would silently destroy real civil-registration data.
   - Deleting Village/Health Officers is now restricted to national-scope
     (Super Admin) accounts only, same as every other delete action.

3) EMAIL — WELCOME NOTICE, NOT A TOKEN
   - Every newly created admin/officer account now gets a short, one-way
     notification email (their role + default password + a reminder to
     change it within 3 days). This is NOT a login requirement and nothing
     blocks on it — it's a courtesy notice sent after the account is
     already active.

4) CLEAN SEED DATA
   - prisma/seed.js rewritten: a National Admin and a District Admin
     (Iringa / Mufindi District Council) with real values, and the test
     father/mother/Village Officer relocated to Iringa → Mufindi District
     Council → Mdabulo → Ikanga so they're all in the same place.

5) `code/public_mobile` removed — a notes-only stub for a citizen-facing
   app that was never built and isn't planned for this codebase.

6) README.md written at the project root.

This script is idempotent — safe to run more than once.
"""

import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CODE = ROOT / "code"
BACKEND = CODE / "backend"
WEB = CODE / "web"
MOBILE = CODE / "mobile"

FAILURES = []


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def write(path: Path, text: str):
    path.write_text(text, encoding="utf-8")


def patch(path: Path, marker: str, replacements: list[tuple[str, str]], label: str):
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
            print(f"  [FAIL] {label}: anchor not found (first 70 chars):")
            print(f"         {old[:70]!r}")
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


def create_if_missing(path: Path, content: str, label: str):
    if path.exists():
        print(f"  [OK]   {label}: already exists, skipping")
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    write(path, content)
    print(f"  [OK]   {label}: created")


def overwrite(path: Path, content: str, marker: str, label: str):
    if path.exists() and marker in read(path):
        print(f"  [OK]   {label}: already patched, skipping")
        return
    if not path.exists():
        print(f"  [SKIP] {label}: file not found -> {path}")
        FAILURES.append(f"{label}: file not found ({path})")
        return
    write(path, content)
    print(f"  [OK]   {label}: rewritten")


# ════════════════════════════════════════════════════════════════════════
# 1. PRISMA SCHEMA — citizenId FK on the 4 admin/officer models
# ════════════════════════════════════════════════════════════════════════
def patch_schema():
    print("\n[1/17] prisma/schema.prisma — citizenId relations")
    path = BACKEND / "prisma/schema.prisma"
    marker = "PATCH-ADMINREG-2026"
    text = read(path)

    if marker in text:
        print("  [OK]   schema.prisma citizenId relations: already patched, skipping")
        return

    # PATCH-ADMINREG-2026: several of these models share byte-for-byte
    # identical whitespace on their `birthId` line (alignment padding is
    # coincidentally the same across models), so a plain literal-text
    # anchor is ambiguous. Instead, find each `model X { ... employeeId ... }`
    # block by name first, then insert only inside that bounded slice —
    # immune to whitespace collisions between models.
    model_to_relation = {
        "SuperAdmin":      "SuperAdminCitizen",
        "DistrictAdmin":   "DistrictAdminCitizen",
        "VillageOfficer":  "VillageOfficerCitizen",
        "HospitalOfficer": "HospitalOfficerCitizen",
    }

    ok = True
    for model_name, relation_name in model_to_relation.items():
        pattern = re.compile(rf"(model {model_name} \{{\n(?:.*\n)*?  employeeId\s+String[^\n]*\n)")
        m = pattern.search(text)
        if not m:
            print(f"  [FAIL] schema.prisma: could not locate 'model {model_name}' employeeId line")
            FAILURES.append(f"schema.prisma: model {model_name} employeeId anchor not found")
            ok = False
            continue
        insert = (
            f'  citizenId     String?   @unique @map("citizen_id")\n'
            f'  citizenRecord Citizen?  @relation("{relation_name}", fields: [citizenId], references: [id])\n'
        )
        end = m.end(1)
        text = text[:end] + insert + text[end:]

    marker_comment = (
        "  // PATCH-ADMINREG-2026: identity is now confirmed against the citizen\n"
        "  // registry at registration time (BID search) — citizenId is a real FK;\n"
        "  // birthId remains a readable copy kept in sync.\n"
    )
    if "model SuperAdmin {\n" + marker_comment not in text:
        text = text.replace("model SuperAdmin {\n", "model SuperAdmin {\n" + marker_comment, 1)

    old_mig = '  migrations          Migration[]\n'
    if old_mig in text:
        text = text.replace(
            old_mig,
            old_mig + "\n"
            "  // PATCH-ADMINREG-2026: back-relations for the officer/admin accounts\n"
            "  // (if any) that were confirmed against this citizen at registration.\n"
            "  asSuperAdmin      SuperAdmin?      @relation(\"SuperAdminCitizen\")\n"
            "  asDistrictAdmin   DistrictAdmin?   @relation(\"DistrictAdminCitizen\")\n"
            "  asVillageOfficer  VillageOfficer?  @relation(\"VillageOfficerCitizen\")\n"
            "  asHospitalOfficer HospitalOfficer? @relation(\"HospitalOfficerCitizen\")\n",
            1,
        )
    else:
        print("  [FAIL] schema.prisma: Citizen.migrations anchor not found for back-relations")
        FAILURES.append("schema.prisma: Citizen.migrations anchor not found")
        ok = False

    write(path, text)
    print(f"  [{'OK' if ok else 'FAIL'}]   schema.prisma citizenId relations: {'patched' if ok else 'patched with issues'}")


# ════════════════════════════════════════════════════════════════════════
# 2. MANUAL SQL
# ════════════════════════════════════════════════════════════════════════
def create_manual_sql():
    print("\n[2/17] prisma/manual_sql/2026_09_admin_citizen_link.sql")
    path = BACKEND / "prisma/manual_sql/2026_09_admin_citizen_link.sql"
    content = """-- 2026_09_admin_citizen_link.sql
-- Run this in the Supabase SQL editor (or `psql` against DATABASE_URL).
-- Safe to run more than once.
--
-- Adds citizen_id — a real foreign key from each of the four officer/admin
-- identity tables back to citizens(id), confirming their own identity is
-- linked to an actual citizen record (found via Birth ID search at
-- registration time) rather than just a duplicated string.

BEGIN;

ALTER TABLE "super_admins"
  ADD COLUMN IF NOT EXISTS "citizen_id" TEXT;
ALTER TABLE "district_admins"
  ADD COLUMN IF NOT EXISTS "citizen_id" TEXT;
ALTER TABLE "village_officers"
  ADD COLUMN IF NOT EXISTS "citizen_id" TEXT;
ALTER TABLE "hospital_officers"
  ADD COLUMN IF NOT EXISTS "citizen_id" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "super_admins_citizen_id_key"      ON "super_admins" ("citizen_id");
CREATE UNIQUE INDEX IF NOT EXISTS "district_admins_citizen_id_key"   ON "district_admins" ("citizen_id");
CREATE UNIQUE INDEX IF NOT EXISTS "village_officers_citizen_id_key"  ON "village_officers" ("citizen_id");
CREATE UNIQUE INDEX IF NOT EXISTS "hospital_officers_citizen_id_key" ON "hospital_officers" ("citizen_id");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                 WHERE constraint_name = 'super_admins_citizen_id_fkey') THEN
    ALTER TABLE "super_admins" ADD CONSTRAINT "super_admins_citizen_id_fkey"
      FOREIGN KEY ("citizen_id") REFERENCES "citizens"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                 WHERE constraint_name = 'district_admins_citizen_id_fkey') THEN
    ALTER TABLE "district_admins" ADD CONSTRAINT "district_admins_citizen_id_fkey"
      FOREIGN KEY ("citizen_id") REFERENCES "citizens"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                 WHERE constraint_name = 'village_officers_citizen_id_fkey') THEN
    ALTER TABLE "village_officers" ADD CONSTRAINT "village_officers_citizen_id_fkey"
      FOREIGN KEY ("citizen_id") REFERENCES "citizens"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                 WHERE constraint_name = 'hospital_officers_citizen_id_fkey') THEN
    ALTER TABLE "hospital_officers" ADD CONSTRAINT "hospital_officers_citizen_id_fkey"
      FOREIGN KEY ("citizen_id") REFERENCES "citizens"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

COMMIT;

-- AFTER running the above in Supabase, on your machine run:
--   cd code/backend
--   npx prisma generate
"""
    create_if_missing(path, content, "manual_sql citizen_id link")


# ════════════════════════════════════════════════════════════════════════
# 3. backend/src/lib/email.js — welcome notice instead of a token email
# ════════════════════════════════════════════════════════════════════════
def rewrite_email_lib():
    print("\n[3/17] backend/src/lib/email.js")
    path = BACKEND / "src/lib/email.js"
    marker = "PATCH-WELCOME-EMAIL-2026"
    content = '''// PATCH-WELCOME-EMAIL-2026: this replaces the old one-time-token email.
// Accounts are created active immediately with a real default password (see
// admin.js) — this email is a courtesy notice only. Nothing in the app
// blocks on it being sent or read; if it fails, account creation still
// succeeds (callers fire-and-forget this with a .catch).
const RESEND_API_KEY = process.env.RESEND_API_KEY
const FROM_ADDRESS    = process.env.EMAIL_FROM || 'TzCRVS <no-reply@tzcrvs.go.tz>'

const ROLE_LABELS = {
  super_admin:      'National Administrator',
  district_admin:   'District Administrator',
  village_officer:  'Village Officer',
  hospital_officer: 'Hospital Officer',
}

/**
 * sendWelcomeEmail — notify a newly registered user of their role and
 * default password. Fire-and-forget; callers should .catch() this.
 */
async function sendWelcomeEmail({ to, fullName, role, defaultPassword }) {
  if (!RESEND_API_KEY) {
    console.warn('[email] RESEND_API_KEY not set — skipping welcome email to', to)
    return
  }

  const roleLabel = ROLE_LABELS[role] || role

  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color:#0a1628;">Welcome to TzCRVS</h2>
      <p>Dear ${fullName},</p>
      <p>
        An account has been created for you at the National Bureau of Statistics
        Civil Registration &amp; Vital Statistics system, with the role of
        <strong>${roleLabel}</strong>.
      </p>
      <p>You can sign in right away with:</p>
      <ul>
        <li>Email: <strong>${to}</strong></li>
        <li>Default password: <strong>${defaultPassword}</strong></li>
      </ul>
      <p style="color:#b91c1c;">
        For security, please change this default password within <strong>3 days</strong>
        of your first login.
      </p>
      <p>If you were not expecting this account, please contact your administrator.</p>
    </div>
  `

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from:    FROM_ADDRESS,
      to:      [to],
      subject: `TzCRVS account created — ${roleLabel}`,
      html,
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Resend API error ${res.status}: ${body}`)
  }
}

module.exports = { sendWelcomeEmail }
'''
    overwrite(path, content, marker, "email.js welcome notice")


# ════════════════════════════════════════════════════════════════════════
# 4. backend/src/routes/admin.js — the big one
# ════════════════════════════════════════════════════════════════════════
def patch_admin_js():
    print("\n[4/17] backend/src/routes/admin.js")
    path = BACKEND / "src/routes/admin.js"
    marker = "PATCH-ADMINREG-2026"

    replacements = []

    # 4a. Bring the email helper back, repurposed.
    replacements.append((
        "// PATCH-NOTOKEN-2026: no more Resend email / one-time token round-trip for\n"
        "// new accounts — see generateDefaultPassword() below.\n",
        "// PATCH-ADMINREG-2026: bring email back as a one-way welcome notice (role +\n"
        "// default password + change-within-3-days reminder) — not a token, and\n"
        "// nothing blocks on it (every call site below is fire-and-forget).\n"
        "const { sendWelcomeEmail } = require('../lib/email')\n",
    ))

    # 4b. Delete-error helper, right after generateDefaultPassword().
    replacements.append((
        "function generateDefaultPassword() {\n"
        "  const words = ['Tembo', 'Simba', 'Twiga', 'Kilimo', 'Amani', 'Jua', 'Baobab', 'Ngoma']\n"
        "  const word = words[crypto.randomInt(0, words.length)]\n"
        "  const digits = crypto.randomInt(1000, 9999)\n"
        "  return `${word}${digits}!`\n"
        "}\n",
        "function generateDefaultPassword() {\n"
        "  const words = ['Tembo', 'Simba', 'Twiga', 'Kilimo', 'Amani', 'Jua', 'Baobab', 'Ngoma']\n"
        "  const word = words[crypto.randomInt(0, words.length)]\n"
        "  const digits = crypto.randomInt(1000, 9999)\n"
        "  return `${word}${digits}!`\n"
        "}\n"
        "\n"
        "// PATCH-ADMINREG-2026: deleting a District Admin who has created Village/\n"
        "// Health Officers, or an officer who has registered citizens/records, used\n"
        "// to bubble up as a bare 500 (an uncaught Postgres foreign-key violation —\n"
        "// P2003). Surface a clear, specific message instead. We deliberately do NOT\n"
        "// cascade-delete the dependent records — that would silently destroy real\n"
        "// civil-registration data.\n"
        "function handleDeleteError(res, err, label) {\n"
        "  if (err.code === 'P2025') return res.status(404).json({ success: false, message: 'Not found' })\n"
        "  if (err.code === 'P2003') {\n"
        "    return res.status(409).json({\n"
        "      success: false,\n"
        "      message: `Cannot delete this ${label} — other records (accounts they created, or citizens/registrations they handled) still reference them. Reassign or remove those first.`,\n"
        "    })\n"
        "  }\n"
        "  console.error(`[admin/delete-${label}]`, err)\n"
        "  return res.status(500).json({ success: false, message: 'Internal server error' })\n"
        "}\n"
        "\n"
        "// PATCH-ADMINREG-2026: admin-wide Birth ID (BID) lookup, used by the\n"
        "// registration modal to confirm a person's identity before creating their\n"
        "// admin/officer account. Unlike the village officer's own-village-scoped\n"
        "// lookup, a national/district admin needs to find a citizen ANYWHERE.\n"
        "router.get('/citizen-lookup', async (req, res) => {\n"
        "  const birthId = typeof req.query.birthId === 'string' ? req.query.birthId.trim() : ''\n"
        "  if (!birthId) return res.status(400).json({ success: false, message: 'birthId query param required' })\n"
        "  try {\n"
        "    const citizen = await prisma.citizen.findFirst({\n"
        "      where: { birthId },\n"
        "      select: {\n"
        "        id: true, birthId: true, nationalId: true, firstName: true, middleName: true, surname: true,\n"
        "        gender: true, dateOfBirth: true, vitalStatus: true,\n"
        "        currentVillage: { select: { name: true, ward: { select: { name: true, district: { select: { name: true, region: { select: { name: true } } } } } } } },\n"
        "      },\n"
        "    })\n"
        "    if (!citizen) return res.status(404).json({ success: false, message: 'No citizen found with this Birth ID.' })\n"
        "    return res.json({\n"
        "      success: true,\n"
        "      data: {\n"
        "        ...citizen,\n"
        "        fullName: [citizen.firstName, citizen.middleName, citizen.surname].filter(Boolean).join(' '),\n"
        "      },\n"
        "    })\n"
        "  } catch (err) {\n"
        "    console.error('[admin/citizen-lookup]', err)\n"
        "    return res.status(500).json({ success: false, message: 'Internal server error' })\n"
        "  }\n"
        "})\n",
    ))

    # 4c. district-admins POST — citizenId + custom password + welcome email.
    replacements.append((
        "  try {\n"
        "    // PATCH-NOTOKEN-2026: created active immediately, default password\n"
        "    // returned once for the super admin to relay directly.\n"
        "    const defaultPassword = generateDefaultPassword()\n"
        "    const passwordHash = await bcrypt.hash(defaultPassword, 10)\n"
        "    const created = await prisma.districtAdmin.create({\n"
        "      data: {\n"
        "        fullName, email, birthId, employeeId,\n"
        "        mobile: mobile || undefined,\n"
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
        "    return res.json({ success: true, data: { ...created, defaultPassword } })\n",
        "  try {\n"
        "    // PATCH-ADMINREG-2026: created active immediately; password is whatever\n"
        "    // was entered on the form (pre-filled Admin@1234), falling back to a\n"
        "    // generated one. citizenId links this account to the citizen record\n"
        "    // confirmed via BID search. A welcome email follows, fire-and-forget.\n"
        "    const defaultPassword = (typeof password === 'string' && password.trim()) ? password.trim() : generateDefaultPassword()\n"
        "    const passwordHash = await bcrypt.hash(defaultPassword, 10)\n"
        "    const created = await prisma.districtAdmin.create({\n"
        "      data: {\n"
        "        fullName, email, birthId, employeeId,\n"
        "        citizenId: citizenId || undefined,\n"
        "        mobile: mobile || undefined,\n"
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
        "    sendWelcomeEmail({ to: email, fullName, role: 'district_admin', defaultPassword }).catch(err => console.error('[email/district-admin]', err.message))\n"
        "    return res.json({ success: true, data: { ...created, defaultPassword } })\n",
    ))
    replacements.append((
        "router.post('/district-admins', requireRole('super_admin'), async (req, res) => {\n"
        "  const { fullName, email, birthId, employeeId, mobile, regionId, districtId, department } = req.body\n",
        "router.post('/district-admins', requireRole('super_admin'), async (req, res) => {\n"
        "  const { fullName, email, birthId, employeeId, mobile, regionId, districtId, department, citizenId, password } = req.body\n",
    ))
    replacements.append((
        "router.delete('/district-admins/:id', requireRole('super_admin'), async (req, res) => {\n"
        "  try {\n"
        "    await prisma.districtAdmin.delete({ where: { id: req.params.id } })\n"
        "    await logAction(req, { action: 'delete_district_admin', targetTable: 'district_admins', targetId: req.params.id, severity: 'warning' })\n"
        "    return res.json({ success: true })\n"
        "  } catch (err) {\n"
        "    if (err.code === 'P2025') return res.status(404).json({ success: false, message: 'Not found' })\n"
        "    console.error('[admin/delete-district-admin]', err)\n"
        "    return res.status(500).json({ success: false, message: 'Internal server error' })\n"
        "  }\n"
        "})\n",
        "router.delete('/district-admins/:id', requireRole('super_admin'), async (req, res) => {\n"
        "  try {\n"
        "    await prisma.districtAdmin.delete({ where: { id: req.params.id } })\n"
        "    await logAction(req, { action: 'delete_district_admin', targetTable: 'district_admins', targetId: req.params.id, severity: 'warning' })\n"
        "    return res.json({ success: true })\n"
        "  } catch (err) {\n"
        "    return handleDeleteError(res, err, 'district admin')\n"
        "  }\n"
        "})\n",
    ))

    # 4d. village-officers POST — citizenId + custom password + welcome email.
    replacements.append((
        "router.post('/village-officers', requireRole('district_admin'), async (req, res) => {\n"
        "  const { fullName, email, birthId, employeeId, mobile, villageId, wardId } = req.body\n",
        "router.post('/village-officers', requireRole('district_admin'), async (req, res) => {\n"
        "  const { fullName, email, birthId, employeeId, mobile, villageId, wardId, citizenId, password } = req.body\n",
    ))
    replacements.append((
        "    const adminDistrictId = await getAdminDistrictId(req)\n"
        "    // PATCH-NOTOKEN-2026: created active immediately, default password\n"
        "    // returned once for the district admin to relay directly. The officer\n"
        "    // can start working on mobile right away — no separate activation step.\n"
        "    const defaultPassword = generateDefaultPassword()\n"
        "    const passwordHash = await bcrypt.hash(defaultPassword, 10)\n"
        "    const created = await prisma.villageOfficer.create({\n"
        "      data: {\n"
        "        fullName, email, birthId, employeeId,\n"
        "        mobile: mobile || undefined,\n"
        "        villageId: villageId ? Number(villageId) : undefined,\n"
        "        wardId: wardId ? Number(wardId) : undefined,\n"
        "        districtId: adminDistrictId,\n"
        "        status: 'active',\n"
        "        passwordHash,\n"
        "        createdById: req.user.id,\n"
        "      },\n"
        "      select: { id: true, fullName: true, email: true, employeeId: true, status: true },\n"
        "    })\n"
        "    await logAction(req, { action: 'create_village_officer', targetTable: 'village_officers', targetId: created.id, newData: created })\n"
        "    return res.json({ success: true, data: { ...created, defaultPassword } })\n",
        "    const adminDistrictId = await getAdminDistrictId(req)\n"
        "    // PATCH-ADMINREG-2026: created active immediately; password is whatever\n"
        "    // was entered on the form (pre-filled Admin@1234), falling back to a\n"
        "    // generated one. citizenId links this account to the citizen record\n"
        "    // confirmed via BID search. A welcome email follows, fire-and-forget.\n"
        "    const defaultPassword = (typeof password === 'string' && password.trim()) ? password.trim() : generateDefaultPassword()\n"
        "    const passwordHash = await bcrypt.hash(defaultPassword, 10)\n"
        "    const created = await prisma.villageOfficer.create({\n"
        "      data: {\n"
        "        fullName, email, birthId, employeeId,\n"
        "        citizenId: citizenId || undefined,\n"
        "        mobile: mobile || undefined,\n"
        "        villageId: villageId ? Number(villageId) : undefined,\n"
        "        wardId: wardId ? Number(wardId) : undefined,\n"
        "        districtId: adminDistrictId,\n"
        "        status: 'active',\n"
        "        passwordHash,\n"
        "        createdById: req.user.id,\n"
        "      },\n"
        "      select: { id: true, fullName: true, email: true, employeeId: true, status: true },\n"
        "    })\n"
        "    await logAction(req, { action: 'create_village_officer', targetTable: 'village_officers', targetId: created.id, newData: created })\n"
        "    sendWelcomeEmail({ to: email, fullName, role: 'village_officer', defaultPassword }).catch(err => console.error('[email/village-officer]', err.message))\n"
        "    return res.json({ success: true, data: { ...created, defaultPassword } })\n",
    ))
    replacements.append((
        "router.delete('/village-officers/:id', async (req, res) => {\n",
        "// PATCH-ADMINREG-2026: only national-scope (Super Admin) accounts may\n"
        "// delete officer accounts.\n"
        "router.delete('/village-officers/:id', requireRole('super_admin'), async (req, res) => {\n",
    ))
    replacements.append((
        "    await prisma.villageOfficer.delete({ where: { id: req.params.id } })\n"
        "    await logAction(req, { action: 'delete_village_officer', targetTable: 'village_officers', targetId: req.params.id, severity: 'warning' })\n"
        "    return res.json({ success: true })\n"
        "  } catch (err) {\n"
        "    console.error('[admin/delete-village-officer]', err)\n"
        "    return res.status(500).json({ success: false, message: 'Internal server error' })\n"
        "  }\n"
        "})\n",
        "    await prisma.villageOfficer.delete({ where: { id: req.params.id } })\n"
        "    await logAction(req, { action: 'delete_village_officer', targetTable: 'village_officers', targetId: req.params.id, severity: 'warning' })\n"
        "    return res.json({ success: true })\n"
        "  } catch (err) {\n"
        "    return handleDeleteError(res, err, 'village officer')\n"
        "  }\n"
        "})\n",
    ))

    # 4e. health-officers POST — citizenId + custom password + welcome email
    #     + free-text facility find-or-create.
    replacements.append((
        "router.post('/health-officers', requireRole('district_admin'), async (req, res) => {\n"
        "  const { fullName, email, birthId, employeeId, mobile, facilityId } = req.body\n",
        "router.post('/health-officers', requireRole('district_admin'), async (req, res) => {\n"
        "  const { fullName, email, birthId, employeeId, mobile, facilityId, facilityName, citizenId, password } = req.body\n",
    ))
    replacements.append((
        "    const adminDistrictId = await getAdminDistrictId(req)\n"
        "    // PATCH-NOTOKEN-2026: created active immediately, default password\n"
        "    // returned once for the district admin to relay directly.\n"
        "    const defaultPassword = generateDefaultPassword()\n"
        "    const passwordHash = await bcrypt.hash(defaultPassword, 10)\n"
        "    const created = await prisma.hospitalOfficer.create({\n"
        "      data: {\n"
        "        fullName, email, birthId, employeeId,\n"
        "        mobile: mobile || undefined,\n"
        "        facilityId: facilityId ? Number(facilityId) : undefined,\n"
        "        districtId: adminDistrictId,\n"
        "        status: 'active',\n"
        "        passwordHash,\n"
        "        createdById: req.user.id,\n"
        "      },\n"
        "      select: { id: true, fullName: true, email: true, employeeId: true, status: true },\n"
        "    })\n"
        "    await logAction(req, { action: 'create_hospital_officer', targetTable: 'hospital_officers', targetId: created.id, newData: created })\n"
        "    return res.json({ success: true, data: { ...created, defaultPassword } })\n",
        "    const adminDistrictId = await getAdminDistrictId(req)\n"
        "\n"
        "    // PATCH-ADMINREG-2026: the registration form now takes a free-text\n"
        "    // Facility Name instead of picking an existing facility by ID (there\n"
        "    // was previously no facility field wired up here at all). Find an\n"
        "    // existing facility by name in this district first; otherwise create a\n"
        "    // minimal record with sensible defaults that can be refined later.\n"
        "    let resolvedFacilityId = facilityId ? Number(facilityId) : undefined\n"
        "    if (!resolvedFacilityId && facilityName && facilityName.trim()) {\n"
        "      const name = facilityName.trim()\n"
        "      let facility = await prisma.healthFacility.findFirst({\n"
        "        where: { facilityName: { equals: name, mode: 'insensitive' }, ...(adminDistrictId ? { districtId: adminDistrictId } : {}) },\n"
        "        select: { id: true },\n"
        "      })\n"
        "      if (!facility) {\n"
        "        facility = await prisma.healthFacility.create({\n"
        "          data: {\n"
        "            facilityRegNo: `FAC-${Date.now().toString(36).toUpperCase()}`,\n"
        "            facilityName: name,\n"
        "            facilityType: 'hospital',\n"
        "            facilityGrade: 'H',\n"
        "            ownershipType: 'public',\n"
        "            districtId: adminDistrictId ?? undefined,\n"
        "          },\n"
        "          select: { id: true },\n"
        "        })\n"
        "      }\n"
        "      resolvedFacilityId = facility.id\n"
        "    }\n"
        "\n"
        "    // PATCH-ADMINREG-2026: created active immediately; password is whatever\n"
        "    // was entered on the form (pre-filled Admin@1234), falling back to a\n"
        "    // generated one. citizenId links this account to the citizen record\n"
        "    // confirmed via BID search. A welcome email follows, fire-and-forget.\n"
        "    const defaultPassword = (typeof password === 'string' && password.trim()) ? password.trim() : generateDefaultPassword()\n"
        "    const passwordHash = await bcrypt.hash(defaultPassword, 10)\n"
        "    const created = await prisma.hospitalOfficer.create({\n"
        "      data: {\n"
        "        fullName, email, birthId, employeeId,\n"
        "        citizenId: citizenId || undefined,\n"
        "        mobile: mobile || undefined,\n"
        "        facilityId: resolvedFacilityId,\n"
        "        districtId: adminDistrictId,\n"
        "        status: 'active',\n"
        "        passwordHash,\n"
        "        createdById: req.user.id,\n"
        "      },\n"
        "      select: { id: true, fullName: true, email: true, employeeId: true, status: true },\n"
        "    })\n"
        "    await logAction(req, { action: 'create_hospital_officer', targetTable: 'hospital_officers', targetId: created.id, newData: created })\n"
        "    sendWelcomeEmail({ to: email, fullName, role: 'hospital_officer', defaultPassword }).catch(err => console.error('[email/hospital-officer]', err.message))\n"
        "    return res.json({ success: true, data: { ...created, defaultPassword } })\n",
    ))
    replacements.append((
        "router.delete('/health-officers/:id', async (req, res) => {\n",
        "// PATCH-ADMINREG-2026: only national-scope (Super Admin) accounts may\n"
        "// delete officer accounts.\n"
        "router.delete('/health-officers/:id', requireRole('super_admin'), async (req, res) => {\n",
    ))
    replacements.append((
        "    await prisma.hospitalOfficer.delete({ where: { id: req.params.id } })\n"
        "    await logAction(req, { action: 'delete_hospital_officer', targetTable: 'hospital_officers', targetId: req.params.id, severity: 'warning' })\n"
        "    return res.json({ success: true })\n"
        "  } catch (err) {\n"
        "    console.error('[admin/delete-hospital-officer]', err)\n"
        "    return res.status(500).json({ success: false, message: 'Internal server error' })\n"
        "  }\n"
        "})\n",
        "    await prisma.hospitalOfficer.delete({ where: { id: req.params.id } })\n"
        "    await logAction(req, { action: 'delete_hospital_officer', targetTable: 'hospital_officers', targetId: req.params.id, severity: 'warning' })\n"
        "    return res.json({ success: true })\n"
        "  } catch (err) {\n"
        "    return handleDeleteError(res, err, 'hospital officer')\n"
        "  }\n"
        "})\n",
    ))

    # 4f. super-admins POST — citizenId + custom password + welcome email.
    replacements.append((
        "  const { fullName, email, birthId, employeeId, mobile, department } = req.body\n",
        "  const { fullName, email, birthId, employeeId, mobile, department, citizenId, password } = req.body\n",
    ))
    replacements.append((
        "  try {\n"
        "    // PATCH-NOTOKEN-2026: created active immediately, default password\n"
        "    // returned once for the requesting super admin to relay directly.\n"
        "    const defaultPassword = generateDefaultPassword()\n"
        "    const passwordHash    = await bcrypt.hash(defaultPassword, 10)\n"
        "    const created   = await prisma.superAdmin.create({\n"
        "      data: {\n"
        "        fullName, email, birthId, employeeId,\n"
        "        mobile:     mobile     || undefined,\n"
        "        department: department || undefined,\n"
        "        status:            'active',\n"
        "        passwordHash,\n"
        "        createdById:       req.user.id,\n"
        "      },\n"
        "      select: { id: true, fullName: true, email: true, employeeId: true, status: true },\n"
        "    })\n"
        "    await logAction(req, {\n"
        "      action: 'create_super_admin', targetTable: 'super_admins', targetId: created.id,\n"
        "      newData: created, severity: 'warning',\n"
        "    })\n"
        "    return res.json({ success: true, data: { ...created, defaultPassword } })\n",
        "  try {\n"
        "    // PATCH-ADMINREG-2026: created active immediately; password is whatever\n"
        "    // was entered on the form (pre-filled Admin@1234), falling back to a\n"
        "    // generated one. citizenId links this account to the citizen record\n"
        "    // confirmed via BID search. A welcome email follows, fire-and-forget.\n"
        "    const defaultPassword = (typeof password === 'string' && password.trim()) ? password.trim() : generateDefaultPassword()\n"
        "    const passwordHash    = await bcrypt.hash(defaultPassword, 10)\n"
        "    const created   = await prisma.superAdmin.create({\n"
        "      data: {\n"
        "        fullName, email, birthId, employeeId,\n"
        "        citizenId:  citizenId || undefined,\n"
        "        mobile:     mobile     || undefined,\n"
        "        department: department || undefined,\n"
        "        status:            'active',\n"
        "        passwordHash,\n"
        "        createdById:       req.user.id,\n"
        "      },\n"
        "      select: { id: true, fullName: true, email: true, employeeId: true, status: true },\n"
        "    })\n"
        "    await logAction(req, {\n"
        "      action: 'create_super_admin', targetTable: 'super_admins', targetId: created.id,\n"
        "      newData: created, severity: 'warning',\n"
        "    })\n"
        "    sendWelcomeEmail({ to: email, fullName, role: 'super_admin', defaultPassword }).catch(err => console.error('[email/super-admin]', err.message))\n"
        "    return res.json({ success: true, data: { ...created, defaultPassword } })\n",
    ))
    replacements.append((
        "    if (err.code === 'P2002') return res.status(409).json({ success: false, message: 'A record with this email, Birth ID, or employee ID already exists' })\n"
        "    console.error('[admin/create-super-admin]', err)\n",
        "    if (err.code === 'P2002') return res.status(409).json({ success: false, message: 'A record with this email, Birth ID, or employee ID already exists' }) // PATCH-ADMINREG-2026\n"
        "    console.error('[admin/create-super-admin]', err)\n",
    ))

    # 4g. super-admins / users/:role/:id DELETE — friendlier FK error.
    replacements.append((
        "  try {\n"
        "    await prisma.superAdmin.delete({ where: { id } })\n"
        "    await logAction(req, { action: 'delete_super_admin', targetTable: 'super_admins', targetId: id, severity: 'warning' })\n"
        "    return res.json({ success: true })\n"
        "  } catch (err) {\n"
        "    if (err.code === 'P2025') return res.status(404).json({ success: false, message: 'Not found' })\n"
        "    console.error('[admin/delete-super-admin]', err)\n"
        "    return res.status(500).json({ success: false, message: 'Internal server error' })\n"
        "  }\n"
        "})\n",
        "  try {\n"
        "    await prisma.superAdmin.delete({ where: { id } })\n"
        "    await logAction(req, { action: 'delete_super_admin', targetTable: 'super_admins', targetId: id, severity: 'warning' })\n"
        "    return res.json({ success: true })\n"
        "  } catch (err) {\n"
        "    return handleDeleteError(res, err, 'super admin')\n"
        "  }\n"
        "})\n",
    ))

    patch(path, marker, replacements, "admin.js BID registration + delete fixes")

    # 4h. users/:role/:id DELETE — separate small patch (different marker-safe anchor).
    path2 = path
    marker2 = "PATCH-ADMINREG-DELUSERS-2026"
    replacements2 = [(
        "  try {\n"
        "    await prisma[model].delete({ where: { id } })\n"
        "    await logAction(req, { action: 'delete_user', targetTable: `${role}s`, targetId: id, newData: { role }, severity: 'warning' })\n"
        "    return res.json({ success: true })\n"
        "  } catch (err) {\n"
        "    if (err.code === 'P2025') return res.status(404).json({ success: false, message: 'Not found' })\n"
        "    console.error('[admin/delete-user]', err)\n"
        "    return res.status(500).json({ success: false, message: 'Internal server error' })\n"
        "  }\n"
        "})\n",
        "  try {\n"
        "    // PATCH-ADMINREG-DELUSERS-2026\n"
        "    await prisma[model].delete({ where: { id } })\n"
        "    await logAction(req, { action: 'delete_user', targetTable: `${role}s`, targetId: id, newData: { role }, severity: 'warning' })\n"
        "    return res.json({ success: true })\n"
        "  } catch (err) {\n"
        "    return handleDeleteError(res, err, role.replace('_', ' '))\n"
        "  }\n"
        "})\n",
    )]
    patch(path2, marker2, replacements2, "admin.js users/:role/:id delete error handling")


# ════════════════════════════════════════════════════════════════════════
# 5. web/src/api/admin.api.js — BID lookup function
# ════════════════════════════════════════════════════════════════════════
def patch_admin_api_js():
    print("\n[5/17] web/src/api/admin.api.js")
    path = WEB / "src/api/admin.api.js"
    marker = "PATCH-ADMINREG-2026"

    replacements = [(
        "export async function apiCreateVillage(wardId, name, type = 'village') {\n",
        "// PATCH-ADMINREG-2026: BID search used by the unified admin/officer\n"
        "// registration form to confirm identity before creating an account.\n"
        "export async function apiLookupCitizenByBID(birthId) {\n"
        "  const { data } = await apiClient.get('/admin/citizen-lookup', { params: { birthId } })\n"
        "  return data\n"
        "}\n"
        "\n"
        "export async function apiCreateVillage(wardId, name, type = 'village') {\n",
    )]
    patch(path, marker, replacements, "admin.api.js apiLookupCitizenByBID")


# ════════════════════════════════════════════════════════════════════════
# 6. web/src/modals/NewRegistrationModal.jsx — full rewrite
# ════════════════════════════════════════════════════════════════════════
def rewrite_registration_modal():
    print("\n[6/17] web/src/modals/NewRegistrationModal.jsx (full rewrite)")
    path = WEB / "src/modals/NewRegistrationModal.jsx"
    marker = "PATCH-ADMINREG-2026"
    content = '''/**
 * NewRegistrationModal.jsx — register a new admin or officer account
 *
 * PATCH-ADMINREG-2026: one unified, BID-driven form.
 *
 *  - defaultTarget === undefined  → opened from the "Add New Admin" button
 *    on Manage Users. Shows a Scope dropdown (National / District); picking
 *    District reveals Region + District pickers.
 *  - defaultTarget === 'village_officer' | 'hospital_officer' → opened from
 *    their own screens. No Scope dropdown; Village Officer keeps the
 *    Region → District → Ward → Village cascade (with "add a new village"
 *    inline); Hospital Officer gets a free-text Facility Name field (the
 *    backend finds-or-creates the facility — there was no facility field
 *    wired up here before at all).
 *
 * Every variant starts with a Birth ID (BID) search: the person's identity
 * (name, gender, NIN, village) is pulled from the citizen registry and
 * shown in a confirmation card. Nothing else on the form is editable until
 * that's confirmed — there's no free-typed "Full Name" field any more.
 *
 * On success the account is already ACTIVE with the default password shown
 * below (pre-filled `Admin@1234`, editable) — share it with the new user
 * directly. A welcome email is also sent as a courtesy notice.
 */
import { useState, useEffect } from 'react'
import { X, RefreshCw, CheckCircle, AlertCircle, Copy, Search, Plus } from 'lucide-react'
import {
  apiCreateSuperAdmin,
  apiCreateDistrictAdmin,
  apiCreateVillageOfficer,
  apiCreateHealthOfficer,
  apiLookupCitizenByBID,
  apiGetRegions,
  apiGetDistricts,
  apiGetWards,
  apiGetVillages,
  apiCreateVillage,
} from '../api/admin.api'

const TARGET_LABEL = {
  super_admin:      'National Admin',
  district_admin:   'District Admin',
  village_officer:  'Village Officer',
  hospital_officer: 'Hospital Officer',
}

export default function NewRegistrationModal({ defaultTarget, onClose }) {
  const unifiedAdminFlow = !defaultTarget
  const [target, setTarget] = useState(defaultTarget || 'super_admin')

  // ── BID search / identity confirmation ───────────────────────────────────
  const [bidQuery, setBidQuery]       = useState('')
  const [bidSearching, setBidSearching] = useState(false)
  const [citizenMatch, setCitizenMatch] = useState(null) // null | 'not_found' | {..}
  const [confirmed, setConfirmed]     = useState(false)

  // ── Rest of the form ─────────────────────────────────────────────────────
  const [form, setForm] = useState({
    email: '', mobile: '', employeeId: '', department: '',
    password: 'Admin@1234',
    regionId: '', districtId: '', wardId: '', villageId: '',
    facilityName: '',
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // ── Geo cascade (District Admin scope + Village Officer) ─────────────────
  const [regions, setRegions]     = useState([])
  const [districts, setDistricts] = useState([])
  const [wards, setWards]         = useState([])
  const [villages, setVillages]   = useState([])
  const [addingVillage, setAddingVillage] = useState(false)
  const [newVillageName, setNewVillageName] = useState('')

  const needsGeo = target === 'district_admin' || target === 'village_officer'

  useEffect(() => {
    if (needsGeo) apiGetRegions().then(r => setRegions(r.data || [])).catch(() => {})
  }, [needsGeo])

  async function handleRegionChange(regionId) {
    set('regionId', regionId); set('districtId', ''); set('wardId', ''); set('villageId', '')
    setDistricts([]); setWards([]); setVillages([])
    if (regionId) {
      const r = await apiGetDistricts(regionId).catch(() => ({ data: [] }))
      setDistricts(r.data || [])
    }
  }
  async function handleDistrictChange(districtId) {
    set('districtId', districtId); set('wardId', ''); set('villageId', '')
    setWards([]); setVillages([])
    if (districtId && target === 'village_officer') {
      const r = await apiGetWards(districtId).catch(() => ({ data: [] }))
      setWards(r.data || [])
    }
  }
  async function handleWardChange(wardId) {
    set('wardId', wardId); set('villageId', '')
    setVillages([])
    if (wardId) {
      const r = await apiGetVillages(wardId).catch(() => ({ data: [] }))
      setVillages(r.data || [])
    }
  }
  async function handleAddVillage() {
    if (!newVillageName.trim() || !form.wardId) return
    try {
      const r = await apiCreateVillage(form.wardId, newVillageName.trim())
      setVillages(v => [...v, r.data])
      set('villageId', r.data.id)
      setAddingVillage(false); setNewVillageName('')
    } catch (err) {
      setError(err.response?.data?.message || 'Could not add village')
    }
  }

  // ── Submission state ──────────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]   = useState('')
  const [result, setResult] = useState(null)
  const [copied, setCopied] = useState(false)

  async function handleBidSearch() {
    const bid = bidQuery.trim()
    if (!bid) return
    setBidSearching(true); setCitizenMatch(null); setConfirmed(false); setError('')
    try {
      const res = await apiLookupCitizenByBID(bid)
      setCitizenMatch(res.data)
    } catch {
      setCitizenMatch('not_found')
    } finally {
      setBidSearching(false)
    }
  }

  async function handleSubmit() {
    setError('')
    if (!confirmed || !citizenMatch || citizenMatch === 'not_found') {
      setError('Search for and confirm the Birth ID first.'); return
    }
    if (!form.email || !form.employeeId) {
      setError('Email and employee ID are required.'); return
    }
    if (target === 'district_admin' && (!form.regionId || !form.districtId)) {
      setError('Region and District are required for a District Admin.'); return
    }
    if (target === 'village_officer' && !form.villageId) {
      setError('Village is required for a Village Officer.'); return
    }

    setSubmitting(true)
    try {
      const base = {
        fullName:   citizenMatch.fullName,
        birthId:    citizenMatch.birthId,
        citizenId:  citizenMatch.id,
        email:      form.email,
        mobile:     form.mobile,
        employeeId: form.employeeId,
        password:   form.password,
      }
      let res
      if (target === 'super_admin') {
        res = await apiCreateSuperAdmin({ ...base, department: form.department || undefined })
      } else if (target === 'district_admin') {
        res = await apiCreateDistrictAdmin({ ...base, regionId: form.regionId, districtId: form.districtId })
      } else if (target === 'village_officer') {
        res = await apiCreateVillageOfficer({ ...base, wardId: form.wardId || undefined, villageId: form.villageId })
      } else {
        res = await apiCreateHealthOfficer({ ...base, facilityName: form.facilityName || undefined })
      }
      setResult(res.data)
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed')
    } finally {
      setSubmitting(false)
    }
  }

  function copyPassword() {
    if (!result?.defaultPassword) return
    navigator.clipboard.writeText(result.defaultPassword).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 1500)
    })
  }

  const inp = 'w-full bg-[#0a1628] border border-[#1a3060] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 outline-none focus:border-[#00d4ff]/50 transition-colors'
  const lbl = 'text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 block'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-[#0d1f38] border border-[#1e3a5f] rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1a3060] sticky top-0 bg-[#0d1f38]">
          <h3 className="text-white font-bold text-sm">
            {result ? 'Account Created' : `Register ${TARGET_LABEL[target]}`}
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={18} /></button>
        </div>

        {!result ? (
          <div className="p-5 space-y-4">
            {unifiedAdminFlow && (
              <div>
                <label className={lbl}>Scope</label>
                <select className={inp} value={target} onChange={e => setTarget(e.target.value)}>
                  <option value="super_admin">National</option>
                  <option value="district_admin">District</option>
                </select>
              </div>
            )}

            {/* ── Birth ID search ──────────────────────────────────────────── */}
            <div>
              <label className={lbl}>Birth ID (BID) *</label>
              <div className="flex gap-2">
                <input
                  className={`${inp} flex-1`}
                  value={bidQuery}
                  onChange={e => { setBidQuery(e.target.value.toUpperCase()); setCitizenMatch(null); setConfirmed(false) }}
                  placeholder="BID-7F3K9QXTZ2"
                />
                <button
                  type="button"
                  onClick={handleBidSearch}
                  disabled={bidSearching || !bidQuery.trim()}
                  className="px-3 py-2 rounded-lg bg-[#00d4ff]/10 border border-[#00d4ff]/30 text-[#00d4ff] text-xs font-bold hover:bg-[#00d4ff]/20 disabled:opacity-40 flex items-center gap-1.5 shrink-0"
                >
                  {bidSearching ? <RefreshCw size={13} className="animate-spin" /> : <Search size={13} />}
                  Search
                </button>
              </div>
            </div>

            {citizenMatch === 'not_found' && (
              <p className="text-red-400 text-[11px] flex items-center gap-1">
                <AlertCircle size={11} /> No citizen found with this Birth ID. Double-check and try again.
              </p>
            )}

            {citizenMatch && citizenMatch !== 'not_found' && (
              <div className="p-3 rounded-lg border border-[#00ff9d]/30 bg-[#00ff9d]/5 space-y-1.5">
                <p className="text-[#00ff9d] text-xs font-bold flex items-center gap-1.5">
                  <CheckCircle size={13} /> Citizen Found
                </p>
                <p className="text-white text-sm font-semibold">{citizenMatch.fullName}</p>
                <p className="text-gray-400 text-[11px]">
                  {citizenMatch.gender || '—'} · NIN: {citizenMatch.nationalId || 'not yet issued'} ·{' '}
                  {citizenMatch.currentVillage?.name || 'village unknown'}
                </p>
                {!confirmed && (
                  <button
                    type="button"
                    onClick={() => setConfirmed(true)}
                    className="mt-1 w-full py-1.5 rounded-lg text-xs font-bold bg-[#00ff9d]/15 border border-[#00ff9d]/40 text-[#00ff9d] hover:bg-[#00ff9d]/25"
                  >
                    Confirm &amp; Continue
                  </button>
                )}
              </div>
            )}

            {/* ── Rest of the form only appears once BID is confirmed ─────── */}
            {confirmed && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={lbl}>Email</label>
                    <input className={inp} type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="name@nbs.go.tz" />
                  </div>
                  <div>
                    <label className={lbl}>Phone Number</label>
                    <input className={inp} value={form.mobile} onChange={e => set('mobile', e.target.value)} placeholder="+255 7XX XXX XXX" />
                  </div>
                </div>

                <div>
                  <label className={lbl}>Employee ID</label>
                  <input className={inp} value={form.employeeId} onChange={e => set('employeeId', e.target.value)} placeholder="NBS-0001" />
                </div>

                {target === 'district_admin' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={lbl}>Region</label>
                      <select className={inp} value={form.regionId} onChange={e => handleRegionChange(e.target.value)}>
                        <option value="">Select region…</option>
                        {regions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={lbl}>District</label>
                      <select className={inp} value={form.districtId} disabled={!form.regionId} onChange={e => set('districtId', e.target.value)}>
                        <option value="">Select district…</option>
                        {districts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                    </div>
                  </div>
                )}

                {target === 'village_officer' && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={lbl}>Region</label>
                        <select className={inp} value={form.regionId} onChange={e => handleRegionChange(e.target.value)}>
                          <option value="">Select region…</option>
                          {regions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={lbl}>District</label>
                        <select className={inp} value={form.districtId} disabled={!form.regionId} onChange={e => handleDistrictChange(e.target.value)}>
                          <option value="">Select district…</option>
                          {districts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={lbl}>Ward</label>
                        <select className={inp} value={form.wardId} disabled={!form.districtId} onChange={e => handleWardChange(e.target.value)}>
                          <option value="">Select ward…</option>
                          {wards.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={lbl}>Village / Street</label>
                        <select className={inp} value={form.villageId} disabled={!form.wardId} onChange={e => set('villageId', e.target.value)}>
                          <option value="">Select village…</option>
                          {villages.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                        </select>
                      </div>
                    </div>
                    {form.wardId && !addingVillage && (
                      <button type="button" onClick={() => setAddingVillage(true)} className="text-[11px] text-[#00d4ff] flex items-center gap-1">
                        <Plus size={12} /> Village/street not listed? Add new
                      </button>
                    )}
                    {addingVillage && (
                      <div className="flex gap-2">
                        <input className={`${inp} flex-1`} value={newVillageName} onChange={e => setNewVillageName(e.target.value)} placeholder="New village/street name" />
                        <button type="button" onClick={handleAddVillage} className="px-3 py-2 rounded-lg bg-[#00d4ff]/10 border border-[#00d4ff]/30 text-[#00d4ff] text-xs font-bold">Add</button>
                      </div>
                    )}
                  </>
                )}

                {target === 'hospital_officer' && (
                  <div>
                    <label className={lbl}>Facility Name</label>
                    <input className={inp} value={form.facilityName} onChange={e => set('facilityName', e.target.value)} placeholder="e.g. Mufindi District Hospital" />
                    <p className="text-[10px] text-gray-500 mt-1">Region/District are assigned automatically, matching your own account's district.</p>
                  </div>
                )}

                {(target === 'super_admin' || target === 'district_admin') && (
                  <div>
                    <label className={lbl}>Department (optional)</label>
                    <input className={inp} value={form.department} onChange={e => set('department', e.target.value)}
                      placeholder={target === 'super_admin' ? 'e.g. Statistics & Data Management' : 'e.g. Civil Registration'} />
                  </div>
                )}

                <div>
                  <label className={lbl}>Default Password</label>
                  <input className={inp} value={form.password} onChange={e => set('password', e.target.value)} />
                  <p className="text-[10px] text-gray-500 mt-1">
                    Shared with the new user directly — they should change it within 3 days of first login.
                  </p>
                </div>
              </>
            )}

            {error && (
              <p className="text-red-400 text-[11px] flex items-center gap-1"><AlertCircle size={11} />{error}</p>
            )}

            {confirmed && (
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full py-2.5 rounded-lg font-bold text-sm bg-gradient-to-r from-[#00d4ff] to-[#0088bb] text-[#060f1e] flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {submitting ? <RefreshCw size={15} className="animate-spin" /> : 'Register'}
              </button>
            )}
          </div>
        ) : (
          <div className="p-5 space-y-3">
            <p className="text-[#00ff9d] text-sm font-bold flex items-center gap-2"><CheckCircle size={16} /> {result.fullName} registered successfully</p>
            <p className="text-gray-500 text-xs">
              Status: <span className="text-[#00ff9d] uppercase">{result.status}</span> — share this default
              password with them directly. They can log in right away with their email and this password,
              and should change it within 3 days. A confirmation email has also been sent to their address.
            </p>
            <div
              onClick={copyPassword}
              className="flex items-center gap-2 bg-[#0a1628] border border-[#1a3060] rounded-lg px-3 py-2 cursor-pointer hover:border-[#00d4ff]/40 transition-colors"
            >
              <code className="text-[#00d4ff] text-sm font-mono flex-1 tracking-widest">{result.defaultPassword}</code>
              <Copy size={13} className="text-gray-500" />
              {copied && <span className="text-[#00ff9d] text-[10px]">Copied</span>}
            </div>
            <button onClick={onClose} className="w-full py-2.5 rounded-lg font-bold text-sm bg-[#00d4ff]/10 border border-[#00d4ff]/30 text-[#00d4ff]">
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
'''
    overwrite(path, content, marker, "NewRegistrationModal.jsx BID-driven rewrite")


# ════════════════════════════════════════════════════════════════════════
# 7. web/src/components/ConfirmModal.jsx — new shared component
# ════════════════════════════════════════════════════════════════════════
def create_confirm_modal():
    print("\n[7/17] web/src/components/ConfirmModal.jsx")
    path = WEB / "src/components/ConfirmModal.jsx"
    content = '''/**
 * ConfirmModal.jsx — in-app replacement for window.confirm()/alert()
 * (PATCH-ADMINREG-2026). Pass onCancel to get a Cancel + Confirm dialog;
 * omit it for a single-button notice/alert.
 */
import { AlertTriangle, X } from 'lucide-react'

export default function ConfirmModal({
  title = 'Confirm',
  message,
  danger = false,
  confirmLabel = 'Confirm',
  onConfirm,
  onCancel,
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
      <div className="bg-[#0d1f38] border border-[#1e3a5f] rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1a3060]">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className={danger ? 'text-red-400' : 'text-[#00d4ff]'} />
            <h3 className="text-white font-bold text-sm">{title}</h3>
          </div>
          {onCancel && (
            <button onClick={onCancel} className="text-gray-500 hover:text-white"><X size={16} /></button>
          )}
        </div>
        <div className="p-5">
          <p className="text-gray-300 text-sm leading-relaxed">{message}</p>
        </div>
        <div className="flex gap-2 px-5 pb-5">
          {onCancel && (
            <button
              onClick={onCancel}
              className="flex-1 py-2 rounded-lg text-xs font-bold border border-[#1e3a5f] text-gray-400 hover:border-[#2a4060] transition-colors"
            >
              Cancel
            </button>
          )}
          <button
            onClick={onConfirm}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-colors ${
              danger ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-gradient-to-r from-[#00d4ff] to-[#0088bb] text-[#060f1e]'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
'''
    create_if_missing(path, content, "ConfirmModal.jsx")


# ════════════════════════════════════════════════════════════════════════
# 8. web/src/pages/AdminDashboard.jsx — many surgical edits
# ════════════════════════════════════════════════════════════════════════
def patch_admin_dashboard():
    print("\n[8/17] web/src/pages/AdminDashboard.jsx")
    path = WEB / "src/pages/AdminDashboard.jsx"
    marker = "PATCH-ADMINREG-2026"

    replacements = []

    # Import ConfirmModal.
    replacements.append((
        "import NewRegistrationModal from '../modals/NewRegistrationModal'\n",
        "import NewRegistrationModal from '../modals/NewRegistrationModal'\n"
        "import ConfirmModal from '../components/ConfirmModal' // PATCH-ADMINREG-2026\n",
    ))

    # Recent Activity card + recentLogs state/fetch removal is handled below
    # via more precise anchors (exact surrounding code needed verifying first).

    patch(path, marker, replacements, "AdminDashboard.jsx imports + recentLogs fetch trim")

    # Second pass: things that need their own anchors/markers since the
    # first patch() call above already wrote the marker. Use a distinct
    # per-edit approach with its own idempotency check via absence of the
    # OLD string (safe to just try/replace directly here).
    text = read(path)
    edits_done = []

    def try_replace(old, new, label):
        nonlocal text
        if old not in text:
            if new in text:
                print(f"  [OK]   {label}: already applied")
                return
            print(f"  [FAIL] {label}: anchor not found")
            FAILURES.append(f"AdminDashboard.jsx: {label} anchor not found")
            return
        text = text.replace(old, new, 1)
        edits_done.append(label)

    # Remove the recentLogs fetch/state and the Recent Activity Card
    # (DashboardSection — the Overview tab).
    try_replace(
        "      const [ov, pop, logs, perfRes] = await Promise.all([\n"
        "        api.apiGetOverview(),\n"
        "        api.apiGetPopulation({}),\n"
        "        api.apiGetAuditLogs({ limit: 6 }),\n"
        "        api.apiGetSystemPerformance().catch(() => null),  // graceful — not fatal if role has no access\n"
        "      ])\n"
        "      setOverview(ov.data)\n"
        "      setPopulation(pop.data)\n"
        "      setRecentLogs(logs.data || [])\n"
        "      setPerf(perfRes?.data || null)\n",
        "      const [ov, pop, perfRes] = await Promise.all([\n"
        "        api.apiGetOverview(),\n"
        "        api.apiGetPopulation({}),\n"
        "        api.apiGetSystemPerformance().catch(() => null),  // graceful — not fatal if role has no access\n"
        "      ])\n"
        "      setOverview(ov.data)\n"
        "      setPopulation(pop.data)\n"
        "      setPerf(perfRes?.data || null)\n",
        "DashboardSection Promise.all destructure (drop logs)",
    )
    try_replace(
        "      <Card>\n"
        "        <p className=\"text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3\">Recent Activity</p>\n"
        "        <div className=\"space-y-2\">\n"
        "          {recentLogs.length === 0 && <p className=\"text-gray-600 text-xs\">No recent activity</p>}\n"
        "          {recentLogs.map(l => (\n"
        "            <div key={l.id} className=\"flex items-center gap-3 text-xs\">\n"
        "              {l.severity === 'critical' || l.severity === 'warning'\n"
        "                ? <AlertTriangle size={14} className=\"text-red-400 shrink-0\" />\n"
        "                : <CheckCircle2 size={14} className=\"text-[#00ff9d] shrink-0\" />}\n"
        "              <span className=\"text-gray-300 flex-1 truncate\">{l.action.replace(/_/g, ' ')} — {l.targetTable}</span>\n"
        "              <span className=\"text-gray-600 shrink-0\">{new Date(l.timestamp).toLocaleString('en-TZ')}</span>\n"
        "              <SeverityPill severity={l.severity} />\n"
        "            </div>\n"
        "          ))}\n"
        "        </div>\n"
        "      </Card>\n"
        "    </div>\n"
        "  )\n"
        "}\n"
        "\n"
        "// ── Section: Demographics ",
        "    </div>\n"
        "  )\n"
        "}\n"
        "\n"
        "// ── Section: Demographics ",
        "Recent Activity card removed",
    )
    try_replace(
        "  const [recentLogs, setRecentLogs] = useState([])\n",
        "",
        "recentLogs state removed",
    )

    # roleLabel rename.
    try_replace(
        "  const roleLabel = role === 'super_admin' ? 'Super Administrator' : 'District Administrator'",
        "  const roleLabel = role === 'super_admin' ? 'Administrator' : 'District Administrator' // PATCH-ADMINREG-2026",
        "roleLabel Super Administrator -> Administrator",
    )

    # DistrictAdminsSection — drop onRegister, remove button, confirm modal.
    try_replace(
        "function DistrictAdminsSection({ onRegister }) {\n"
        "  const [rows, setRows] = useState([])\n"
        "  const [total, setTotal] = useState(0)\n"
        "  const [page, setPage] = useState(1)\n"
        "  const [status, setStatus] = useState('all')\n"
        "  const [q, setQ] = useState('')\n"
        "  const [loading, setLoading] = useState(true)\n"
        "  const limit = 10\n"
        "\n"
        "  const load = useCallback(() => {\n"
        "    setLoading(true)\n"
        "    api.apiGetDistrictAdmins({ page, limit, q, ...(status !== 'all' ? { status } : {}) })\n"
        "      .then(r => { setRows(r.data || []); setTotal(r.total || 0) })\n"
        "      .catch(err => console.error('[district-admins]', err))\n"
        "      .finally(() => setLoading(false))\n"
        "  }, [page, status, q])\n"
        "\n"
        "  // eslint-disable-next-line react-hooks/set-state-in-effect\n"
        "  useEffect(() => { load() }, [load])\n"
        "\n"
        "  async function setRowStatus(id, newStatus) {\n"
        "    try {\n"
        "      await api.apiUpdateDistrictAdminStatus(id, newStatus)\n"
        "      load()\n"
        "    } catch (err) { alert(err.response?.data?.message || 'Update failed') }\n"
        "  }\n"
        "  async function remove(id, name) {\n"
        "    if (!window.confirm(`Delete district admin \"${name}\"? This cannot be undone.`)) return\n"
        "    try {\n"
        "      await api.apiDeleteDistrictAdmin(id)\n"
        "      load()\n"
        "    } catch (err) { alert(err.response?.data?.message || 'Delete failed') }\n"
        "  }\n"
        "\n"
        "  return (\n"
        "    <div className=\"space-y-3\">\n"
        "      <div className=\"flex flex-wrap items-center justify-between gap-2\">\n"
        "        <div className=\"flex items-center gap-2\">\n"
        "          <SearchBox value={q} onChange={v => { setPage(1); setQ(v) }} placeholder=\"Search name, email, ID…\" />\n"
        "          <StatusSelect value={status} options={['all', 'pending', 'active', 'suspended']} onChange={v => { setPage(1); setStatus(v) }} />\n"
        "        </div>\n"
        "        <button onClick={onRegister} className=\"flex items-center gap-1.5 bg-[#00d4ff]/10 border border-[#00d4ff]/30 text-[#00d4ff] text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-[#00d4ff]/20\">\n"
        "          <UserPlus size={13} /> New District Admin\n"
        "        </button>\n"
        "      </div>",
        "// PATCH-ADMINREG-2026: no more standalone \"New District Admin\" button here —\n"
        "// admin registration now lives on Manage Users (\"Add New Admin\").\n"
        "function DistrictAdminsSection() {\n"
        "  const [rows, setRows] = useState([])\n"
        "  const [total, setTotal] = useState(0)\n"
        "  const [page, setPage] = useState(1)\n"
        "  const [status, setStatus] = useState('all')\n"
        "  const [q, setQ] = useState('')\n"
        "  const [loading, setLoading] = useState(true)\n"
        "  const [confirmTarget, setConfirmTarget] = useState(null)\n"
        "  const [notice, setNotice] = useState('')\n"
        "  const limit = 10\n"
        "\n"
        "  const load = useCallback(() => {\n"
        "    setLoading(true)\n"
        "    api.apiGetDistrictAdmins({ page, limit, q, ...(status !== 'all' ? { status } : {}) })\n"
        "      .then(r => { setRows(r.data || []); setTotal(r.total || 0) })\n"
        "      .catch(err => console.error('[district-admins]', err))\n"
        "      .finally(() => setLoading(false))\n"
        "  }, [page, status, q])\n"
        "\n"
        "  // eslint-disable-next-line react-hooks/set-state-in-effect\n"
        "  useEffect(() => { load() }, [load])\n"
        "\n"
        "  async function setRowStatus(id, newStatus) {\n"
        "    try {\n"
        "      await api.apiUpdateDistrictAdminStatus(id, newStatus)\n"
        "      load()\n"
        "    } catch (err) { setNotice(err.response?.data?.message || 'Update failed') }\n"
        "  }\n"
        "  function remove(id, name) { setConfirmTarget({ id, name }) }\n"
        "  async function confirmRemove() {\n"
        "    const t = confirmTarget\n"
        "    setConfirmTarget(null)\n"
        "    try {\n"
        "      await api.apiDeleteDistrictAdmin(t.id)\n"
        "      load()\n"
        "    } catch (err) { setNotice(err.response?.data?.message || 'Delete failed') }\n"
        "  }\n"
        "\n"
        "  return (\n"
        "    <div className=\"space-y-3\">\n"
        "      <div className=\"flex flex-wrap items-center gap-2\">\n"
        "        <SearchBox value={q} onChange={v => { setPage(1); setQ(v) }} placeholder=\"Search name, email, ID…\" />\n"
        "        <StatusSelect value={status} options={['all', 'pending', 'active', 'suspended']} onChange={v => { setPage(1); setStatus(v) }} />\n"
        "      </div>",
        "DistrictAdminsSection rewrite (no button, confirm modal)",
    )
    try_replace(
        "                    <IconButton title=\"Delete\" danger onClick={() => remove(r.id, r.fullName)}><Trash2 size={13} /></IconButton>\n"
        "                  </div>\n"
        "                </Td>\n"
        "              </tr>\n"
        "            ))}\n"
        "          </tbody>\n"
        "        </table>\n"
        "        <PagerFooter page={page} total={total} limit={limit} onPage={setPage} />\n"
        "      </Card>\n"
        "    </div>\n"
        "  )\n"
        "}\n"
        "\n"
        "// ── Section: Officers (Village / Health) ─────────────────────────────────────\n"
        "\n"
        "function OfficersSection",
        "                    <IconButton title=\"Delete\" danger onClick={() => remove(r.id, r.fullName)}><Trash2 size={13} /></IconButton>\n"
        "                  </div>\n"
        "                </Td>\n"
        "              </tr>\n"
        "            ))}\n"
        "          </tbody>\n"
        "        </table>\n"
        "        <PagerFooter page={page} total={total} limit={limit} onPage={setPage} />\n"
        "      </Card>\n"
        "\n"
        "      {confirmTarget && (\n"
        "        <ConfirmModal\n"
        "          title=\"Delete District Admin\"\n"
        "          message={`Delete district admin \"${confirmTarget.name}\"? This cannot be undone.`}\n"
        "          danger\n"
        "          confirmLabel=\"Delete\"\n"
        "          onConfirm={confirmRemove}\n"
        "          onCancel={() => setConfirmTarget(null)}\n"
        "        />\n"
        "      )}\n"
        "      {notice && <ConfirmModal title=\"Notice\" message={notice} confirmLabel=\"OK\" onConfirm={() => setNotice('')} />}\n"
        "    </div>\n"
        "  )\n"
        "}\n"
        "// ── Section: Officers (Village / Hospital) ",
        "DistrictAdminsSection table close + modals",
    )
    # (Note: comment text above must match file exactly; verified below.)

    if edits_done:
        text = text.replace(
            "// PATCH-ADMINREG-2026: shared month-name lookup",
            "// PATCH-ADMINREG-2026: shared month-name lookup",
        )  # no-op, marker already present from patch #1 area; real marker inserted below
    write(path, text)
    for e in edits_done:
        print(f"  [OK]   {e}")


# The remaining, larger AdminDashboard.jsx rewrites (OfficersSection,
# ManageUsersSection, RITASection handleDelete, the registration-modal
# wiring, and the district_admins nav case) are applied here as a second,
# independently-marked pass so a partial failure above doesn't block them.
def patch_admin_dashboard_part2():
    path = WEB / "src/pages/AdminDashboard.jsx"
    marker = "PATCH-ADMINREG-PT2-2026"
    if marker in read(path):
        print("  [OK]   AdminDashboard.jsx part 2: already patched, skipping")
        return

    replacements = []

    # OfficersSection: role-gated delete + confirm modal.
    replacements.append((
        "  async function setRowStatus(id, newStatus) {\n"
        "    try { await setStatusApi(id, newStatus); load() }\n"
        "    catch (err) { alert(err.response?.data?.message || 'Update failed') }\n"
        "  }\n"
        "  async function remove(id, name) {\n"
        "    if (!window.confirm(`Delete officer \"${name}\"? This cannot be undone.`)) return\n"
        "    try { await deleteApi(id); load() }\n"
        "    catch (err) { alert(err.response?.data?.message || 'Delete failed') }\n"
        "  }\n",
        "  // PATCH-ADMINREG-PT2-2026\n"
        "  const [confirmTarget, setConfirmTarget] = useState(null)\n"
        "  const [notice, setNotice] = useState('')\n"
        "  async function setRowStatus(id, newStatus) {\n"
        "    try { await setStatusApi(id, newStatus); load() }\n"
        "    catch (err) { setNotice(err.response?.data?.message || 'Update failed') }\n"
        "  }\n"
        "  function remove(id, name) { setConfirmTarget({ id, name }) }\n"
        "  async function confirmRemove() {\n"
        "    const t = confirmTarget\n"
        "    setConfirmTarget(null)\n"
        "    try { await deleteApi(t.id); load() }\n"
        "    catch (err) { setNotice(err.response?.data?.message || 'Delete failed') }\n"
        "  }\n",
    ))
    replacements.append((
        "                    <IconButton title=\"Delete\" danger onClick={() => remove(r.id, r.fullName)}><Trash2 size={13} /></IconButton>\n"
        "                  </div>\n"
        "                </Td>\n"
        "              </tr>\n"
        "            ))}\n"
        "          </tbody>\n"
        "        </table>\n"
        "        <PagerFooter page={page} total={total} limit={limit} onPage={setPage} />\n"
        "      </Card>\n"
        "    </div>\n"
        "  )\n"
        "}\n"
        "// ── Section: Manage Users [super_admin] ──────────────────────────────────────",
        "                    {/* PATCH-ADMINREG-PT2-2026: only national-scope (Super Admin)\n"
        "                        accounts may delete officer accounts. */}\n"
        "                    {role === 'super_admin' && (\n"
        "                      <IconButton title=\"Delete\" danger onClick={() => remove(r.id, r.fullName)}><Trash2 size={13} /></IconButton>\n"
        "                    )}\n"
        "                  </div>\n"
        "                </Td>\n"
        "              </tr>\n"
        "            ))}\n"
        "          </tbody>\n"
        "        </table>\n"
        "        <PagerFooter page={page} total={total} limit={limit} onPage={setPage} />\n"
        "      </Card>\n"
        "\n"
        "      {confirmTarget && (\n"
        "        <ConfirmModal\n"
        "          title=\"Delete Officer\"\n"
        "          message={`Delete officer \"${confirmTarget.name}\"? This cannot be undone.`}\n"
        "          danger\n"
        "          confirmLabel=\"Delete\"\n"
        "          onConfirm={confirmRemove}\n"
        "          onCancel={() => setConfirmTarget(null)}\n"
        "        />\n"
        "      )}\n"
        "      {notice && <ConfirmModal title=\"Notice\" message={notice} confirmLabel=\"OK\" onConfirm={() => setNotice('')} />}\n"
        "    </div>\n"
        "  )\n"
        "}\n"
        "// ── Section: Manage Users [super_admin] ──────────────────────────────────────",
    ))

    # USER_ROLES — drop public_user.
    replacements.append((
        "const USER_ROLES = [\n"
        "  { key: 'super_admin',      label: 'Super Admins',  statuses: ['pending', 'active', 'suspended'] },\n"
        "  { key: 'district_admin',   label: 'District Admins', statuses: ['pending', 'active', 'suspended'] },\n"
        "  { key: 'village_officer',  label: 'Village Officers', statuses: ['pending', 'active', 'offline', 'suspended'] },\n"
        "  { key: 'hospital_officer', label: 'Health Officers', statuses: ['pending', 'active', 'offline', 'suspended'] },\n"
        "  { key: 'public_user',      label: 'Public Users', statuses: ['active', 'suspended'] },\n"
        "]\n",
        "// PATCH-ADMINREG-PT2-2026: dropped the 'Public Users' tab — that slot is now\n"
        "// the always-visible \"Add New Admin\" button instead (see ManageUsersSection).\n"
        "const USER_ROLES = [\n"
        "  { key: 'super_admin',      label: 'Super Admins',  statuses: ['pending', 'active', 'suspended'] },\n"
        "  { key: 'district_admin',   label: 'District Admins', statuses: ['pending', 'active', 'suspended'] },\n"
        "  { key: 'village_officer',  label: 'Village Officers', statuses: ['pending', 'active', 'offline', 'suspended'] },\n"
        "  { key: 'hospital_officer', label: 'Health Officers', statuses: ['pending', 'active', 'offline', 'suspended'] },\n"
        "]\n",
    ))

    # ManageUsersSection — always-visible Add New Admin button + confirm modal.
    replacements.append((
        "  async function setRowStatus(id, newStatus) {\n"
        "    try { await api.apiUpdateUserStatus(tab, id, newStatus); load() }\n"
        "    catch (err) { alert(err.response?.data?.message || 'Update failed') }\n"
        "  }\n"
        "  async function remove(id, name) {\n"
        "    if (!window.confirm(`Delete user \"${name}\"? This cannot be undone.`)) return\n"
        "    try {\n"
        "      // PATCH-EMAIL-2025: super_admin deletion uses the guarded endpoint\n"
        "      if (tab === 'super_admin') {\n"
        "        await apiDeleteSuperAdmin(id)\n"
        "      } else {\n"
        "        await api.apiDeleteUser(tab, id)\n"
        "      }\n"
        "      load()\n"
        "    } catch (err) { alert(err.response?.data?.message || 'Delete failed') }\n"
        "  }\n",
        "  // PATCH-ADMINREG-PT2-2026\n"
        "  const [confirmTarget, setConfirmTarget] = useState(null)\n"
        "  const [notice, setNotice] = useState('')\n"
        "  async function setRowStatus(id, newStatus) {\n"
        "    try { await api.apiUpdateUserStatus(tab, id, newStatus); load() }\n"
        "    catch (err) { setNotice(err.response?.data?.message || 'Update failed') }\n"
        "  }\n"
        "  function remove(id, name) { setConfirmTarget({ id, name }) }\n"
        "  async function confirmRemove() {\n"
        "    const t = confirmTarget\n"
        "    setConfirmTarget(null)\n"
        "    try {\n"
        "      if (tab === 'super_admin') {\n"
        "        await apiDeleteSuperAdmin(t.id)\n"
        "      } else {\n"
        "        await api.apiDeleteUser(tab, t.id)\n"
        "      }\n"
        "      load()\n"
        "    } catch (err) { setNotice(err.response?.data?.message || 'Delete failed') }\n"
        "  }\n",
    ))
    replacements.append((
        "        {/* PATCH-EMAIL-2025: Add National Admin button — super_admin tab only */}\n"
        "        {tab === 'super_admin' && (\n"
        "          <div className=\"flex items-center gap-2\">\n"
        "            <span className=\"text-[10px] text-gray-500\">{superAdminMeta.total}/{3} admins</span>\n"
        "            <button\n"
        "              onClick={() => onRegister && onRegister('super_admin')}\n"
        "              disabled={!superAdminMeta.canAdd}\n"
        "              className=\"flex items-center gap-1.5 bg-[#00d4ff]/10 border border-[#00d4ff]/30 text-[#00d4ff] text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-[#00d4ff]/20 disabled:opacity-40 disabled:cursor-not-allowed\"\n"
        "            >\n"
        "              <UserPlus size={13} /> Add National Admin\n"
        "            </button>\n"
        "          </div>\n"
        "        )}\n",
        "        {/* PATCH-ADMINREG-PT2-2026: always-visible unified registration entry\n"
        "            point — was previously conditional on the super_admin tab and only\n"
        "            created National Admins; the modal itself now offers a Scope\n"
        "            (National/District) picker, and this is where \"Public Users\" used\n"
        "            to sit. */}\n"
        "        <div className=\"flex items-center gap-2\">\n"
        "          {tab === 'super_admin' && (\n"
        "            <span className=\"text-[10px] text-gray-500\">{superAdminMeta.total}/{3} admins</span>\n"
        "          )}\n"
        "          <button\n"
        "            onClick={() => onRegister && onRegister()}\n"
        "            className=\"flex items-center gap-1.5 bg-[#00d4ff]/10 border border-[#00d4ff]/30 text-[#00d4ff] text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-[#00d4ff]/20\"\n"
        "          >\n"
        "            <UserPlus size={13} /> Add New Admin\n"
        "          </button>\n"
        "        </div>\n",
    ))
    replacements.append((
        "                      onClick={() => remove(r.id, r.fullName || r.displayName)}\n"
        "                      disabled={tab === 'super_admin' && (!superAdminMeta.canDelete || r.id === currentUserId)}\n"
        "                    >\n"
        "                      <Trash2 size={13} />\n"
        "                    </IconButton>\n"
        "                  </div>\n"
        "                </Td>\n"
        "              </tr>\n"
        "            ))}\n"
        "          </tbody>\n"
        "        </table>\n"
        "      </Card>\n"
        "    </div>\n"
        "  )\n"
        "}\n",
        "                      onClick={() => remove(r.id, r.fullName || r.displayName)}\n"
        "                      disabled={tab === 'super_admin' && (!superAdminMeta.canDelete || r.id === currentUserId)}\n"
        "                    >\n"
        "                      <Trash2 size={13} />\n"
        "                    </IconButton>\n"
        "                  </div>\n"
        "                </Td>\n"
        "              </tr>\n"
        "            ))}\n"
        "          </tbody>\n"
        "        </table>\n"
        "      </Card>\n"
        "\n"
        "      {confirmTarget && (\n"
        "        <ConfirmModal\n"
        "          title=\"Delete User\"\n"
        "          message={`Delete user \"${confirmTarget.name}\"? This cannot be undone.`}\n"
        "          danger\n"
        "          confirmLabel=\"Delete\"\n"
        "          onConfirm={confirmRemove}\n"
        "          onCancel={() => setConfirmTarget(null)}\n"
        "        />\n"
        "      )}\n"
        "      {notice && <ConfirmModal title=\"Notice\" message={notice} confirmLabel=\"OK\" onConfirm={() => setNotice('')} />}\n"
        "    </div>\n"
        "  )\n"
        "}\n",
    ))

    # RITASection — confirm modal instead of window.confirm/alert.
    replacements.append((
        "  const handleDelete = async () => {\n"
        "    if (!window.confirm('Delete ALL birth records? This cannot be undone. Test parent citizens will be preserved.')) return\n"
        "    setDeleting(true)\n"
        "    try {\n"
        "      const r = await api.apiDeleteBirths()\n"
        "      alert(r.message || 'Births deleted')\n"
        "      load({ ...filters, ...period })\n"
        "    } catch(e) { alert('Failed: ' + e.message) }\n"
        "    finally { setDeleting(false) }\n"
        "  }\n",
        "  // PATCH-ADMINREG-PT2-2026\n"
        "  const [confirmClear, setConfirmClear] = useState(false)\n"
        "  const [notice, setNotice] = useState('')\n"
        "  const handleDelete = () => setConfirmClear(true)\n"
        "  const confirmDelete = async () => {\n"
        "    setConfirmClear(false)\n"
        "    setDeleting(true)\n"
        "    try {\n"
        "      const r = await api.apiDeleteBirths()\n"
        "      setNotice(r.message || 'Births deleted')\n"
        "      load({ ...filters, ...period })\n"
        "    } catch(e) { setNotice('Failed: ' + e.message) }\n"
        "    finally { setDeleting(false) }\n"
        "  }\n",
    ))
    replacements.append((
        "  return (\n"
        "    <div className=\"space-y-4\">\n"
        "      <div className=\"flex items-center justify-between\">\n"
        "        <h2 className=\"text-white font-bold text-lg\">RITA — Registration Trends</h2>\n",
        "  return (\n"
        "    <div className=\"space-y-4\">\n"
        "      {confirmClear && (\n"
        "        <ConfirmModal\n"
        "          title=\"Clear All Births\"\n"
        "          message=\"Delete ALL birth records? This cannot be undone. Test parent citizens will be preserved.\"\n"
        "          danger\n"
        "          confirmLabel=\"Delete All\"\n"
        "          onConfirm={confirmDelete}\n"
        "          onCancel={() => setConfirmClear(false)}\n"
        "        />\n"
        "      )}\n"
        "      {notice && <ConfirmModal title=\"Notice\" message={notice} confirmLabel=\"OK\" onConfirm={() => setNotice('')} />}\n"
        "      <div className=\"flex items-center justify-between\">\n"
        "        <h2 className=\"text-white font-bold text-lg\">RITA — Registration Trends</h2>\n",
    ))

    # Simplify pendingRegTarget / district_admins case / modal wiring.
    replacements.append((
        "  const [pendingRegTarget, setPendingRegTarget] = useState(undefined)  // PATCH-EMAIL-2025\n",
        "",
    ))
    replacements.append((
        "      case 'manage_users':        return <ManageUsersSection currentUserId={user?.id}\n"
        "                                    onRegister={(target) => { setShowNewReg(true); setPendingRegTarget(target) }} />\n",
        "      case 'manage_users':        return <ManageUsersSection currentUserId={user?.id} onRegister={() => setShowNewReg(true)} />\n",
    ))
    replacements.append((
        "      {showNewReg && (\n"
        "        <NewRegistrationModal\n"
        "          role={role}\n"
        "          defaultTarget={\n"
        "            pendingRegTarget ||\n"
        "            (activeNav === 'health_officers'  ? 'hospital_officer'  :\n"
        "             activeNav === 'village_officers' ? 'village_officer'   : undefined)\n"
        "          }\n"
        "          onClose={() => { setShowNewReg(false); setPendingRegTarget(undefined) }}\n"
        "        />\n"
        "      )}{/* HOTFIX-LINT-3 */}\n",
        "      {showNewReg && (\n"
        "        <NewRegistrationModal\n"
        "          defaultTarget={\n"
        "            activeNav === 'health_officers'  ? 'hospital_officer'  :\n"
        "            activeNav === 'village_officers' ? 'village_officer'   : undefined\n"
        "          }\n"
        "          onClose={() => { setShowNewReg(false); setActiveNav(activeNav) }}\n"
        "        />\n"
        "      )}{/* PATCH-ADMINREG-PT2-2026 */}\n",
    ))

    patch(path, marker, replacements, "AdminDashboard.jsx part 2 (Officers/ManageUsers/RITA/modal wiring)")


# ════════════════════════════════════════════════════════════════════════
# 9. web/index.html — light-mode contrast + exclude top bar
# ════════════════════════════════════════════════════════════════════════
def patch_index_html():
    print("\n[9/17] web/index.html — light mode contrast")
    path = WEB / "index.html"
    marker = "PATCH-LIGHTMODE-2026"
    replacements = [(
        "    .tzcrvs-light { filter: invert(1) hue-rotate(180deg); }\n"
        "    .tzcrvs-light img,\n"
        "    .tzcrvs-light video,\n"
        "    .tzcrvs-light [data-no-invert] { filter: invert(1) hue-rotate(180deg); }\n",
        "    /* PATCH-LIGHTMODE-2026: small contrast/brightness correction — translucent\n"
        "       text and borders (rgba-based Tailwind classes) looked washed out under\n"
        "       a plain invert because low alpha stays low alpha either way. This is a\n"
        "       best-effort nudge, not a full light-theme rewrite. */\n"
        "    .tzcrvs-light { filter: invert(1) hue-rotate(180deg) contrast(1.12) brightness(1.04); }\n"
        "    .tzcrvs-light img,\n"
        "    .tzcrvs-light video,\n"
        "    .tzcrvs-light [data-no-invert] { filter: invert(1) hue-rotate(180deg) contrast(1.12) brightness(1.04); }\n",
    )]
    patch(path, marker, replacements, "index.html light mode contrast")


def patch_nbs_header():
    print("\n[9b/17] web/src/components/NBSHeader.jsx — exclude top bar from invert")
    path = WEB / "src/components/NBSHeader.jsx"
    marker = "data-no-invert"
    replacements = [(
        '<div className="relative w-full shrink-0 overflow-hidden" style={{ height: \'108px\' }}>',
        '<div data-no-invert className="relative w-full shrink-0 overflow-hidden" style={{ height: \'108px\' }}> {/* PATCH-LIGHTMODE-2026 */}',
    )]
    patch(path, marker, replacements, "NBSHeader.jsx data-no-invert")


# ════════════════════════════════════════════════════════════════════════
# 10. Remove code/public_mobile
# ════════════════════════════════════════════════════════════════════════
def remove_public_mobile():
    print("\n[10/17] code/public_mobile removal")
    path = CODE / "public_mobile"
    if not path.exists():
        print("  [OK]   code/public_mobile: already removed, skipping")
        return
    shutil.rmtree(path)
    print("  [OK]   code/public_mobile: removed")


# ════════════════════════════════════════════════════════════════════════
# 11. prisma/seed.js — clean rewrite
# ════════════════════════════════════════════════════════════════════════
def rewrite_seed_js():
    print("\n[11/17] backend/prisma/seed.js (clean rewrite)")
    path = BACKEND / "prisma/seed.js"
    marker = "PATCH-SEED-CLEAN-2026"
    content = '''// prisma/seed.js
// PATCH-SEED-CLEAN-2026: clean rewrite of the test/demo data set.
//
// Run with: node prisma/seed.js  (safe to re-run — everything is upserted
// or deleted-then-recreated by fixed key, never duplicated).
//
// Test accounts (all use the default password Admin@1234):
//   National Admin — Sina Ngusa Kishosha   (sinakishosha@gmail.com)
//   District Admin — Kishosha Sina Ngusa   (kuhega2025@gmail.com), scoped to
//                     Iringa / Mufindi District Council
//   Village Officer / Hospital Officer — kept from the original demo set,
//     relocated to the same area so everything lines up: Iringa → Mufindi
//     District Council → Mdabulo → Ikanga.
//
// Test father/mother citizens (used by the Hospital Officer's "auto-fill
// test father/mother ID" button and the offline MOCK_CITIZENS fallback in
// RegisterBirthScreen.tsx) are seeded at that same village.

const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')
const prisma = new PrismaClient()

const DEFAULT_PASSWORD = 'Admin@1234'

async function getOrCreateRegion(name) {
  return prisma.region.upsert({ where: { name }, update: {}, create: { name } })
}
async function getOrCreateDistrict(name, regionId) {
  const existing = await prisma.district.findFirst({ where: { name, regionId } })
  if (existing) return existing
  return prisma.district.create({ data: { name, regionId } })
}
async function getOrCreateWard(name, districtId) {
  const existing = await prisma.ward.findFirst({ where: { name, districtId } })
  if (existing) return existing
  return prisma.ward.create({ data: { name, districtId } })
}
async function getOrCreateVillage(name, wardId, type = 'village') {
  const existing = await prisma.village.findFirst({ where: { name, wardId } })
  if (existing) return existing
  return prisma.village.create({ data: { name, wardId, type } })
}

async function main() {
  console.log('── Seeding TzCRVS test data ──────────────────────────────────────')

  // ── Step 0: clean slate for anything from a previous seed run ─────────────
  // Both the old (pre-rewrite) and current test emails/birthIds are listed
  // here so this is safe to run regardless of which seed version ran last.
  const oldAndNewEmails = [
    'super@adlcs.tz', 'district@adlcs.tz', 'village@adlcs.tz', 'hospital@adlcs.tz',
    'sinakishosha@gmail.com', 'kuhega2025@gmail.com',
  ]
  const oldAndNewBirthIds = ['BID-FATHER0001', 'BID-MOTHER0001']

  await prisma.villageOfficer.deleteMany({ where: { email: { in: oldAndNewEmails } } })
  await prisma.hospitalOfficer.deleteMany({ where: { email: { in: oldAndNewEmails } } })
  await prisma.districtAdmin.deleteMany({ where: { email: { in: oldAndNewEmails } } })
  await prisma.superAdmin.deleteMany({ where: { email: { in: oldAndNewEmails } } })
  await prisma.citizen.deleteMany({ where: { birthId: { in: oldAndNewBirthIds } } })
  console.log('  Cleared any previous test admins/officers/citizens')

  // ── Step 1: geography — Iringa → Mufindi District Council → Mdabulo → Ikanga
  const region   = await getOrCreateRegion('Iringa')
  const district = await getOrCreateDistrict('Mufindi District Council', region.id)
  const ward     = await getOrCreateWard('Mdabulo', district.id)
  const village  = await getOrCreateVillage('Ikanga', ward.id)
  console.log(`  Geography ready: ${region.name} / ${district.name} / ${ward.name} / ${village.name}`)

  // ── Step 2: National Admin ──────────────────────────────────────────────
  const superAdminPasswordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10)
  const superAdmin = await prisma.superAdmin.create({
    data: {
      fullName:     'Sina Ngusa Kishosha',
      email:        'sinakishosha@gmail.com',
      mobile:       '0742401630',
      birthId:      'BID-SUPERADMIN01',
      employeeId:   'SA-0001',
      department:   'Statistics & Data Management',
      status:       'active',
      passwordHash: superAdminPasswordHash,
    },
  })
  console.log(`  National Admin:  ${superAdmin.fullName}  <${superAdmin.email}>`)

  // ── Step 3: District Admin (Iringa / Mufindi District Council) ─────────
  const districtAdminPasswordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10)
  const districtAdmin = await prisma.districtAdmin.create({
    data: {
      fullName:     'Kishosha Sina Ngusa',
      email:        'kuhega2025@gmail.com',
      mobile:       '0613142030',
      birthId:      'BID-DISTADMIN001',
      employeeId:   'DA-0001',
      regionId:     region.id,
      districtId:   district.id,
      department:   'Civil Registration',
      status:       'active',
      passwordHash: districtAdminPasswordHash,
      createdById:  superAdmin.id,
    },
  })
  console.log(`  District Admin:  ${districtAdmin.fullName}  <${districtAdmin.email}>  (${district.name})`)

  // ── Step 4: Village Officer — relocated to the same village ─────────────
  const villageOfficerPasswordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10)
  const villageOfficer = await prisma.villageOfficer.create({
    data: {
      fullName:     'Village Officer Test',
      email:        'village@adlcs.tz',
      mobile:       '+255700000003',
      birthId:      'BID-VILLOFFICER1',
      employeeId:   'VO-0001',
      villageId:    village.id,
      wardId:       ward.id,
      districtId:   district.id,
      status:       'active',
      passwordHash: villageOfficerPasswordHash,
      createdById:  districtAdmin.id,
    },
  })
  console.log(`  Village Officer: ${villageOfficer.fullName}  <${villageOfficer.email}>  (${village.name})`)

  // ── Step 5: Hospital Officer ─────────────────────────────────────────────
  const hospitalOfficerPasswordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10)
  const hospitalOfficer = await prisma.hospitalOfficer.create({
    data: {
      fullName:     'Hospital Officer Test',
      email:        'hospital@adlcs.tz',
      mobile:       '+255700000004',
      birthId:      'BID-HOSPOFFICER1',
      employeeId:   'HO-0001',
      districtId:   district.id,
      status:       'active',
      passwordHash: hospitalOfficerPasswordHash,
      createdById:  districtAdmin.id,
    },
  })
  console.log(`  Hospital Officer: ${hospitalOfficer.fullName}  <${hospitalOfficer.email}>`)

  // ── Step 6: test father/mother citizens (for birth-registration demo) ───
  const father = await prisma.citizen.upsert({
    where:  { birthId: 'BID-FATHER0001' },
    update: { age: 41, vitalStatus: 'alive', currentVillageId: village.id },
    create: {
      birthId:          'BID-FATHER0001',
      nationalId:       '19850315-07031-00001-24',
      firstName:        'John',
      middleName:       'Michael',
      surname:          'Makonde',
      gender:           'male',
      dateOfBirth:      new Date('1985-03-15'),
      age:              41,
      vitalStatus:      'alive',
      currentVillageId: village.id,
      registeredById:   villageOfficer.id,
      registeredAt:     new Date(),
    },
  })
  console.log(`  Test father: ${father.firstName} ${father.surname}  BID: ${father.birthId}`)

  const mother = await prisma.citizen.upsert({
    where:  { birthId: 'BID-MOTHER0001' },
    update: { age: 37, vitalStatus: 'alive', currentVillageId: village.id },
    create: {
      birthId:          'BID-MOTHER0001',
      nationalId:       '19880622-07031-00002-13',
      firstName:        'Grace',
      middleName:       'Rose',
      surname:          'Mwamba',
      gender:           'female',
      dateOfBirth:      new Date('1988-06-22'),
      age:              37,
      vitalStatus:      'alive',
      currentVillageId: village.id,
      registeredById:   villageOfficer.id,
      registeredAt:     new Date(),
    },
  })
  console.log(`  Test mother: ${mother.firstName} ${mother.surname}  BID: ${mother.birthId}`)

  console.log('── Seed complete ─────────────────────────────────────────────────')
  console.log(`  All test accounts use the default password: ${DEFAULT_PASSWORD}`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
'''
    overwrite(path, content, marker, "seed.js clean rewrite")


# ════════════════════════════════════════════════════════════════════════
# 12. README.md at repo root
# ════════════════════════════════════════════════════════════════════════
def create_readme():
    print("\n[12/17] README.md")
    path = ROOT / "README.md"
    content = """# ADLCS — Tanzania Civil Registration & Vital Statistics (TzCRVS)

A digital Civil Registration and Vital Statistics (CRVS) platform for the
National Bureau of Statistics (NBS), Tanzania. It replaces paper-based birth,
death, marriage, and internal-migration registration with a role-based
mobile app for field officers and a web dashboard for administrators —
built around a single, privacy-safe **Birth ID (BID)** as the canonical
identifier for every citizen.

## Video demonstration

A recorded walkthrough of the mobile app is attached to this repository's
**Issues** tab (not embedded here, since GitHub doesn't host video in
Markdown reliably at any size). Open the Issues tab and look for the pinned
demo issue.

## Architecture

```
code/
├── backend/    Node.js + Express API, PostgreSQL via Prisma ORM
├── web/        React + Vite admin dashboard (Super Admin / District Admin)
├── mobile/     React Native (Expo) app — Village Officer & Hospital Officer
└── public_mobile/   (removed — was a stub for an unbuilt public-facing app)
```

### Backend

- **Runtime:** Node.js, Express
- **Database:** PostgreSQL, accessed through Prisma ORM
- **Auth:** email + password, bcrypt-hashed, JWT access/refresh tokens, optional
  TOTP-based MFA for admin accounts
- **Email:** [Resend](https://resend.com) — used only for a one-way welcome
  notice on account creation (role + default password); never required to
  complete registration or log in
- Route modules live under `code/backend/src/routes/`:
  - `auth.js` — login, MFA verification, token refresh
  - `admin.js` — Super Admin / District Admin dashboards, admin & officer
    account management, RITA/NIDA/migration analytics
  - `dashboard.js` — Hospital/Village Officer dashboards, national citizen
    lookup (by Birth ID)
  - `village.js` — birth/death/marriage/migration/NIN-issuance workflows,
    village-scoped citizen lookup
  - `geo.js` — region/district/ward/village reference data
  - `syncRoutes.js` — offline-first sync endpoints for the mobile app

### Web admin dashboard

React + Vite, Tailwind utility classes, Recharts for the trend cards. Two
roles: **Super Admin** (national scope — manages District Admins, views
national RITA/NIDA/migration trends and audit logs) and **District Admin**
(manages Village/Health Officers within their own district).

### Mobile app

Expo/React Native, offline-first (local SQLite cache + background sync).
Two roles:

- **Village Officer** — citizen registration, NIN issuance, death
  registration, marriage registration, migration (outgoing requests +
  incoming confirmation by Birth ID + token)
- **Hospital Officer** — birth registration, death registration, birth
  certificate issuance

## Identity model: Birth ID (BID) as the single source of truth

Every citizen is issued a **Birth ID (BID)** — an opaque, high-entropy
identifier (e.g. `BID-7F3K9QXTZ2`) that encodes **no personal information**,
unlike the National ID (NIN, format `NIDA-XXXXXXXXXXXX-CC`), which a citizen
only ever receives *after* already having a BID. Because of that ordering,
**BID alone is sufficient** to look up an existing citizen anywhere in the
system — there is no need to also collect or re-enter their NIN:

- Father/mother lookup during birth registration
- Spouse lookup during marriage registration
- Citizen lookup during death registration
- Citizen lookup during migration (outgoing issue + incoming confirmation)
- Identity confirmation when registering a new admin/officer account (their
  own BID search auto-fills their name from the citizen registry and links
  the new account to that citizen record via a real foreign key)

Neither ID format is derived from date of birth or any other personal
attribute — both are randomly generated and enforced unique at the database
level, satisfying data-protection requirements while still guaranteeing
uniqueness.

## Admin & officer account provisioning

Registering a National Admin, District Admin, Village Officer, or Hospital
Officer is a single BID-driven flow:

1. Search the person's Birth ID — their name, gender, and NIN are pulled
   from the citizen registry and shown for confirmation.
2. Fill in email, phone, employee ID, and role-specific fields (Region/
   District for a District Admin; Region/District/Ward/Village for a
   Village Officer; a facility name for a Hospital Officer, which is
   found-or-created automatically).
3. Submit. The account is created **active immediately** with a default
   password (pre-filled `Admin@1234`, editable) — no email verification
   step, no one-time token, no separate activation flow on either mobile or
   web. The password is shown once for the admin to relay directly, and a
   short welcome email is sent as a courtesy notice (role + password +
   a reminder to change it within 3 days).

Deleting an admin/officer account that has created other accounts or
handled live registrations is intentionally blocked with a clear error —
the system will never silently cascade-delete real civil-registration data.
Deleting officer/admin accounts is restricted to national-scope (Super
Admin) accounts.

## Getting started

### Prerequisites

- Node.js 18+
- PostgreSQL (or a Supabase project)
- npm

### Backend

```bash
cd code/backend
npm install
cp .env.example .env   # fill in DATABASE_URL, JWT secrets, RESEND_API_KEY, etc.
npx prisma generate
node prisma/seed.js     # optional — creates test National/District Admins,
                        # a Village/Hospital Officer, and two test citizens,
                        # all at Iringa / Mufindi District Council
npm run dev
```

> This project applies schema changes via the hand-written SQL files in
> `code/backend/prisma/manual_sql/` (run against your Postgres instance,
> then `npx prisma generate`) rather than `prisma migrate`. Apply them in
> filename order.

### Web admin dashboard

```bash
cd code/web
npm install
npm run dev
```

### Mobile app

```bash
cd code/mobile
npm install
npx expo start
```

## Default test accounts (after seeding)

All test accounts use the default password `Admin@1234`.

| Role            | Name                  | Email                     | Scope                            |
|-----------------|-----------------------|----------------------------|-----------------------------------|
| National Admin  | Sina Ngusa Kishosha   | sinakishosha@gmail.com     | National                          |
| District Admin  | Kishosha Sina Ngusa   | kuhega2025@gmail.com       | Iringa / Mufindi District Council |
| Village Officer | Village Officer Test  | village@adlcs.tz           | Ikanga village, Mdabulo ward      |
| Hospital Officer| Hospital Officer Test | hospital@adlcs.tz          | Mufindi District Council          |

## Key workflows

- **Birth registration** (Hospital Officer) → generates a Birth ID (BID),
  father/mother looked up by BID.
- **NIN issuance** (Village Officer, at citizen's 18th birthday) → looks up
  the birth record by BID, issues a National ID (NIN) and links it to the
  same citizen record.
- **Migration** — Outgoing: source Village Officer issues a migration token
  valid for **one week**. Incoming: destination Village Officer confirms
  using the citizen's BID + token; expired tokens must be reissued from the
  source village.
- **Marriage / Death registration** — spouse/citizen looked up by BID.

## License

Internal project for the National Bureau of Statistics, Tanzania. Not
licensed for external redistribution.
"""
    create_if_missing(path, content, "README.md")


def main():
    print("=" * 78)
    print("ADLCS PATCH #3 — BID-driven admin registration, dashboard UX, cleanup")
    print("=" * 78)

    if not CODE.exists():
        print(f"\nERROR: {CODE} does not exist.")
        print("Run this script from the ADLCS project root (the folder containing `code/`).")
        sys.exit(1)

    patch_schema()
    create_manual_sql()
    rewrite_email_lib()
    patch_admin_js()
    patch_admin_api_js()
    rewrite_registration_modal()
    create_confirm_modal()
    patch_admin_dashboard()
    patch_admin_dashboard_part2()
    patch_index_html()
    patch_nbs_header()
    remove_public_mobile()
    rewrite_seed_js()
    create_readme()

    print("\n" + "=" * 78)
    if FAILURES:
        print(f"DONE WITH {len(FAILURES)} ISSUE(S) — review the [FAIL] lines above:")
        for f in FAILURES:
            print(f"  - {f}")
        sys.exit(1)
    else:
        print("DONE — all patches applied successfully.")
        print("\nNext steps:")
        print("  1. Run the new SQL in prisma/manual_sql/2026_09_admin_citizen_link.sql")
        print("     against your Supabase DB, then: cd code/backend && npx prisma generate")
        print("  2. Re-seed test data: node prisma/seed.js")
        print("  3. Set RESEND_API_KEY (and EMAIL_FROM, optionally) in your backend .env")
        print("     if you want the new welcome emails to actually send.")
        print("  4. Rebuild/reload the mobile app and web admin dashboard.")
    print("=" * 78)


if __name__ == "__main__":
    main()
