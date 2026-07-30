#!/usr/bin/env python3
"""
patch_bid_and_registration.py
────────────────────────────────────────────────────────────────────────────
Run this from the ADLCS project ROOT (the folder that contains `code/`),
AFTER patch_migration_flow.py has already been applied.

    cd ADLCS
    python3 patch_bid_and_registration.py

WHAT THIS PATCH DOES
─────────────────────

1) PRIVACY-SAFE ID FORMATS (no more DOB embedded in the ID)
   - Birth ID (BID) and National ID (NIN) generation no longer encode the
     date of birth (or any other personal detail) in the identifier itself.
     Old:  BID-20260601-3847291 / 19900101-07031-00001-21
     New:  BID-7F3K9QXTZ2       / NIDA-7F3K9QXTZ2H8-43
     Uniqueness comes from random high-entropy blocks plus the database's
     UNIQUE constraint (with collision retry server-side).

2) BIRTH ID (BID) AS THE UNIVERSAL CITIZEN LOOKUP KEY
   - A citizen only ever gets a NIN because they already have a BID, so BID
     alone is enough to find them — no need to also ask for/know their NIN.
   - `Citizen` gets its own `birthId` column (denormalized from the Birth
     record at NIN-issuance time, or generated directly for the "register
     citizen" fallback path used for adults with no birth record on file).
   - Father/mother lookup (birth registration), spouse lookup (marriage),
     citizen lookup (death), citizen profile search, and the incoming-
     migration confirmation screen all now search by Birth ID first.
   - Test parent citizens in the seed data get test Birth IDs instead of
     test NINs.

3) ADMIN/OFFICER REGISTRATION — NO MORE EMAIL/TOKEN ROUND-TRIP
   - Creating a District Admin, Village Officer, Health Officer, or another
     Super Admin no longer sends a Resend email or issues a one-time
     authorization token. The account is created ACTIVE immediately, with
     a real default password hashed straight into `passwordHash`. The
     plaintext default password is returned once in the API response so the
     admin who's creating the account can hand it directly to the new user
     (whose email address the admin already has, since they typed it in).
     The new user logs in right away with email + that password.
   - The web login page's now-dead "Authorization Token" / mock first-login
     onboarding flow is removed; the backend's `/auth/validate-token` route
     is removed too.
   - The officer/admin's own "NIDA Number" identity field is renamed to
     "Birth ID (BID)", consistent with (1) and (2) above.

This script is idempotent — safe to run more than once. It uses exact
text-anchor replacements; if the code has since diverged it stops and
reports exactly which anchor it couldn't find.
"""

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
            print(f"  [FAIL] {label}: anchor not found (showing first 70 chars):")
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
    """Full-file replacement, guarded by a marker so re-runs are no-ops."""
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
# 1. PRISMA SCHEMA
# ════════════════════════════════════════════════════════════════════════
def patch_schema():
    print("\n[1/14] prisma/schema.prisma — Citizen.birthId + officer/admin birthId rename")
    path = BACKEND / "prisma/schema.prisma"
    marker = "PATCH-PRIVACY-2026"

    replacements = [
        (
            '  id                  String          @id @default(uuid())\n'
            '  nationalId          String          @unique @map("national_id") @db.VarChar(23)\n',
            '  // PATCH-PRIVACY-2026: birthId is the canonical lookup key for an existing\n'
            '  // citizen (father/mother, spouse, deceased, migrating resident, profile\n'
            '  // search) — a citizen only has a nationalId because they already had a\n'
            '  // birthId, so birthId alone is sufficient.\n'
            '  id                  String          @id @default(uuid())\n'
            '  birthId             String?         @unique @map("birth_id") @db.VarChar(20)\n'
            '  nationalId          String          @unique @map("national_id") @db.VarChar(23)\n',
        ),
    ]

    # Rename nidaNumber -> birthId on the four officer/admin identity models.
    # Each line has slightly different column alignment, so match them
    # individually rather than trying one regex across all four.
    nida_lines = [
        '  nidaNumber            String          @unique @map("nida_number") @db.VarChar(100)\n',
        '  nidaNumber        String            @unique @map("nida_number") @db.VarChar(100)\n',
        '  nidaNumber          String        @unique @map("nida_number") @db.VarChar(100)\n',
        '  nidaNumber        String          @unique @map("nida_number") @db.VarChar(100)\n',
    ]
    for line in nida_lines:
        indent_field = line[: line.index("nidaNumber")]
        # figure out the gap between "String" and "@unique" to preserve alignment
        after_string = line.split("String", 1)[1]
        gap = after_string[: len(after_string) - len(after_string.lstrip())]
        new_line = f'{indent_field}birthId{" " * (len("nidaNumber") - len("birthId"))}String{gap}@unique @map("birth_id") @db.VarChar(20)\n'
        replacements.append((line, new_line))

    patch(path, marker, replacements, "schema.prisma birthId fields")


# ════════════════════════════════════════════════════════════════════════
# 2. MANUAL SQL
# ════════════════════════════════════════════════════════════════════════
def create_manual_sql():
    print("\n[2/14] prisma/manual_sql/2026_08_birth_id_and_registration.sql")
    path = BACKEND / "prisma/manual_sql/2026_08_birth_id_and_registration.sql"
    content = """-- 2026_08_birth_id_and_registration.sql
-- Run this in the Supabase SQL editor (or `psql` against DATABASE_URL).
-- Safe to run more than once.
--
-- 1. Adds citizens.birth_id — the denormalized Birth ID used as the
--    canonical lookup key for an already-registered citizen.
-- 2. Renames nida_number -> birth_id on the four officer/admin identity
--    tables (their OWN identity field, separate from citizens.birth_id).

BEGIN;

ALTER TABLE "citizens"
  ADD COLUMN IF NOT EXISTS "birth_id" VARCHAR(20);

CREATE UNIQUE INDEX IF NOT EXISTS "citizens_birth_id_key"
  ON "citizens" ("birth_id");

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'super_admins' AND column_name = 'nida_number') THEN
    ALTER TABLE "super_admins" RENAME COLUMN "nida_number" TO "birth_id";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'district_admins' AND column_name = 'nida_number') THEN
    ALTER TABLE "district_admins" RENAME COLUMN "nida_number" TO "birth_id";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'village_officers' AND column_name = 'nida_number') THEN
    ALTER TABLE "village_officers" RENAME COLUMN "nida_number" TO "birth_id";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'hospital_officers' AND column_name = 'nida_number') THEN
    ALTER TABLE "hospital_officers" RENAME COLUMN "nida_number" TO "birth_id";
  END IF;
END $$;

COMMIT;

-- AFTER running the above in Supabase, on your machine run:
--   cd code/backend
--   npx prisma generate
"""
    create_if_missing(path, content, "manual_sql birth_id + registration rename")


# ════════════════════════════════════════════════════════════════════════
# 3. backend/src/routes/village.js
# ════════════════════════════════════════════════════════════════════════
def patch_village_js():
    print("\n[3/14] backend/src/routes/village.js")
    path = BACKEND / "src/routes/village.js"
    marker = "PATCH-PRIVACY-2026"

    replacements = []

    # 3a. ID generators: no more DOB in either format.
    replacements.append((
        "// ── national-id generator (23-char NIDA format YYYYMMDD-LLLLL-SSSSS-CC) ────────\n"
        "function genNationalId(dob) {\n"
        "  const d = dob ? parseDDMMYYYY(dob) : new Date()\n"
        "  const y  = d.getFullYear()\n"
        "  const mo = String(d.getMonth()+1).padStart(2,'0')\n"
        "  const dy = String(d.getDate()).padStart(2,'0')\n"
        "  const seq = String(Math.floor(Math.random()*89999)+10001).padStart(5,'0')\n"
        "  const cc  = String(Math.floor(Math.random()*89)+10)\n"
        "  return `${y}${mo}${dy}-07031-${seq}-${cc}`\n"
        "}\n",
        "// PATCH-PRIVACY-2026: neither ID format encodes date of birth (or any other\n"
        "// personal detail) any more — regulatory/privacy requirement. Uniqueness comes\n"
        "// from a high-entropy random block plus the DB's UNIQUE constraint (callers\n"
        "// retry on the rare P2002 collision). `dob` params are kept-but-unused on the\n"
        "// exported helpers so existing call sites don't need to change.\n"
        "const ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O/1/I — avoids confusion\n"
        "function randomIdBlock(len) {\n"
        "  let out = ''\n"
        "  for (let i = 0; i < len; i++) out += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)]\n"
        "  return out\n"
        "}\n"
        "// National ID (NIN) — format: NIDA-XXXXXXXXXXXX-CC\n"
        "function genNationalId(_dob) {\n"
        "  const cc = String(Math.floor(Math.random() * 90) + 10)\n"
        "  return `NIDA-${randomIdBlock(12)}-${cc}`\n"
        "}\n"
        "// Birth ID (BID) — format: BID-XXXXXXXXXX. Used for the \"register citizen\"\n"
        "// fallback path (adults with no birth record on file) so every citizen ends\n"
        "// up with a Birth ID one way or another.\n"
        "function genBirthId() {\n"
        "  return `BID-${randomIdBlock(10)}`\n"
        "}\n",
    ))

    # 3b. POST /citizen (fallback) — accept/generate birthId too.
    replacements.append((
        "router.post('/citizen', async (req, res) => {\n"
        "  const { id:officerId } = req.user\n"
        "  const { firstName, middleName, surname, gender, dateOfBirth, bloodGroup,\n"
        "          phone, occupation, nationalId } = req.body\n"
        "  if (!firstName || !surname || !gender)\n"
        "    return res.status(400).json({ success:false, message:'firstName, surname, gender required' })\n"
        "  try {\n"
        "    const officer = await prisma.villageOfficer.findUnique({ where:{ id:officerId }, select:{ villageId:true } })\n"
        "    const citizen = await prisma.citizen.create({\n"
        "      data:{\n"
        "        firstName:   firstName.trim(),\n"
        "        middleName:  middleName?.trim() ?? '',\n"
        "        surname:     surname.trim(),\n"
        "        gender:      gender.toLowerCase(),\n"
        "        dateOfBirth: dateOfBirth ? parseDDMMYYYY(dateOfBirth) : null,\n"
        "        nationalId:  nationalId ?? genNationalId(dateOfBirth),\n"
        "        currentVillageId: officer?.villageId ?? undefined,\n"
        "        registeredById:   officerId,\n"
        "        vitalStatus:      'alive',\n"
        "      },\n"
        "      select:{ id:true, nationalId:true },\n"
        "    })\n"
        "    return res.json({ success:true, data:{ citizenId:citizen.id, nationalId:citizen.nationalId } })\n",
        "router.post('/citizen', async (req, res) => {\n"
        "  const { id:officerId } = req.user\n"
        "  const { firstName, middleName, surname, gender, dateOfBirth, bloodGroup,\n"
        "          phone, occupation, nationalId, birthId } = req.body\n"
        "  if (!firstName || !surname || !gender)\n"
        "    return res.status(400).json({ success:false, message:'firstName, surname, gender required' })\n"
        "  try {\n"
        "    const officer = await prisma.villageOfficer.findUnique({ where:{ id:officerId }, select:{ villageId:true } })\n"
        "    const citizen = await prisma.citizen.create({\n"
        "      data:{\n"
        "        firstName:   firstName.trim(),\n"
        "        middleName:  middleName?.trim() ?? '',\n"
        "        surname:     surname.trim(),\n"
        "        gender:      gender.toLowerCase(),\n"
        "        dateOfBirth: dateOfBirth ? parseDDMMYYYY(dateOfBirth) : null,\n"
        "        nationalId:  nationalId ?? genNationalId(),\n"
        "        // PATCH-BID-LOOKUP-2026: this is the \"no prior birth record\" fallback\n"
        "        // path — give the citizen a Birth ID here too so they can still be\n"
        "        // found by BID everywhere else in the system.\n"
        "        birthId:     birthId ?? genBirthId(),\n"
        "        currentVillageId: officer?.villageId ?? undefined,\n"
        "        registeredById:   officerId,\n"
        "        vitalStatus:      'alive',\n"
        "      },\n"
        "      select:{ id:true, nationalId:true, birthId:true },\n"
        "    })\n"
        "    return res.json({ success:true, data:{ citizenId:citizen.id, nationalId:citizen.nationalId, birthId:citizen.birthId } })\n",
    ))

    # 3c. Marriage — look up husband/wife by birthId, store real NIN on record.
    replacements.append((
        "    // Look up both citizens by NID — both must be registered\n"
        "    const husband = husbandNid ? await prisma.citizen.findFirst({ where:{ nationalId:husbandNid }, select:{ id:true, dateOfBirth:true } }) : null\n"
        "    const wife    = wifeNid    ? await prisma.citizen.findFirst({ where:{ nationalId:wifeNid    }, select:{ id:true, dateOfBirth:true } }) : null\n",
        "    // PATCH-BID-LOOKUP-2026: husbandNid/wifeNid now carry each citizen's Birth\n"
        "    // ID (BID) rather than their NIN — see genNationalId() above for why BID\n"
        "    // is now the canonical lookup key. The certificate still records each\n"
        "    // spouse's real NIN below (fetched here, not the BID used to find them).\n"
        "    const husband = husbandNid ? await prisma.citizen.findFirst({ where:{ birthId:husbandNid }, select:{ id:true, dateOfBirth:true, nationalId:true } }) : null\n"
        "    const wife    = wifeNid    ? await prisma.citizen.findFirst({ where:{ birthId:wifeNid    }, select:{ id:true, dateOfBirth:true, nationalId:true } }) : null\n",
    ))
    replacements.append((
        "        husbandNid:       husbandNid,\n"
        "        wifeNid:          wifeNid,\n",
        "        husbandNid:       husband.nationalId ?? husbandNid,\n"
        "        wifeNid:          wife.nationalId ?? wifeNid,\n",
    ))

    # 3d. POST /migration — accept birthId as an additional fallback lookup.
    replacements.append((
        "  const { citizenId, nationalId, toVillageId, reason } = req.body\n",
        "  const { citizenId, nationalId, birthId, toVillageId, reason } = req.body\n",
    ))
    replacements.append((
        "    const citizen = citizenId\n"
        "      ? await prisma.citizen.findFirst({ where: { id: citizenId, currentVillageId: officer.villageId }, select: { id: true, currentVillageId: true } })\n"
        "      : nationalId\n"
        "        ? await prisma.citizen.findFirst({ where: { nationalId: String(nationalId).trim(), currentVillageId: officer.villageId }, select: { id: true, currentVillageId: true } })\n"
        "        : null\n",
        "    // PATCH-BID-LOOKUP-2026: birthId is preferred; nationalId kept only as a\n"
        "    // legacy fallback for any older client still sending it.\n"
        "    const citizen = citizenId\n"
        "      ? await prisma.citizen.findFirst({ where: { id: citizenId, currentVillageId: officer.villageId }, select: { id: true, currentVillageId: true } })\n"
        "      : birthId\n"
        "        ? await prisma.citizen.findFirst({ where: { birthId: String(birthId).trim(), currentVillageId: officer.villageId }, select: { id: true, currentVillageId: true } })\n"
        "        : nationalId\n"
        "          ? await prisma.citizen.findFirst({ where: { nationalId: String(nationalId).trim(), currentVillageId: officer.villageId }, select: { id: true, currentVillageId: true } })\n"
        "          : null\n",
    ))

    # 3e. POST /migration/confirm — switch from NIN to Birth ID.
    replacements.append((
        "// ── POST /api/village/migration/confirm — INCOMING citizen self-service ────────\n"
        "// PATCH-MIGFLOW-2026: the primary confirmation path. The citizen who has\n"
        "// physically arrived at their NEW village presents their NIN and the migration\n"
        "// token the source officer gave them; the destination officer types both in\n"
        "// here — no need to browse a pending-requests inbox at all. Only valid for\n"
        "// officers whose OWN village matches the request's destination village, and\n"
        "// only within the one-week window.\n"
        "router.post('/migration/confirm', async (req, res) => {\n"
        "  const { id: officerId } = req.user\n"
        "  const { nationalId, migrationToken } = req.body\n"
        "\n"
        "  const nin = typeof nationalId === 'string' ? nationalId.trim() : ''\n"
        "  const token = typeof migrationToken === 'string' ? migrationToken.trim().toUpperCase() : ''\n"
        "  if (!nin || !token) {\n"
        "    return res.status(400).json({ success: false, message: 'Citizen NIN and migration token are both required.' })\n"
        "  }\n",
        "// ── POST /api/village/migration/confirm — INCOMING citizen self-service ────────\n"
        "// PATCH-MIGFLOW-2026 / PATCH-BID-LOOKUP-2026: the primary confirmation path.\n"
        "// The citizen who has physically arrived at their NEW village presents their\n"
        "// Birth ID (BID) and the migration token the source officer gave them; the\n"
        "// destination officer types both in here — no need to browse a pending-\n"
        "// requests inbox at all. Only valid for officers whose OWN village matches\n"
        "// the request's destination village, and only within the one-week window.\n"
        "router.post('/migration/confirm', async (req, res) => {\n"
        "  const { id: officerId } = req.user\n"
        "  const { birthId, migrationToken } = req.body\n"
        "\n"
        "  const bid = typeof birthId === 'string' ? birthId.trim() : ''\n"
        "  const token = typeof migrationToken === 'string' ? migrationToken.trim().toUpperCase() : ''\n"
        "  if (!bid || !token) {\n"
        "    return res.status(400).json({ success: false, message: 'Citizen Birth ID and migration token are both required.' })\n"
        "  }\n",
    ))
    replacements.append((
        "    const migration = await prisma.migration.findFirst({\n"
        "      where: { migrationToken: token, citizen: { nationalId: nin } },\n"
        "      select: {\n"
        "        id: true, status: true, citizenId: true, toVillageId: true, expiryDate: true,\n"
        "        citizen: { select: { firstName: true, middleName: true, surname: true } },\n"
        "      },\n"
        "    })\n"
        "\n"
        "    if (!migration) {\n"
        "      return res.status(404).json({ success: false, message: 'No matching migration request found for that NIN and token. Please check both are correct.' })\n"
        "    }\n",
        "    const migration = await prisma.migration.findFirst({\n"
        "      where: { migrationToken: token, citizen: { birthId: bid } },\n"
        "      select: {\n"
        "        id: true, status: true, citizenId: true, toVillageId: true, expiryDate: true,\n"
        "        citizen: { select: { firstName: true, middleName: true, surname: true } },\n"
        "      },\n"
        "    })\n"
        "\n"
        "    if (!migration) {\n"
        "      return res.status(404).json({ success: false, message: 'No matching migration request found for that Birth ID and token. Please check both are correct.' })\n"
        "    }\n",
    ))

    # 3f. Citizen-lookup select + strict param + q fallback now key on birthId.
    replacements.append((
        "const CITIZEN_LOOKUP_SELECT = {\n"
        "  id: true,\n"
        "  nationalId: true,\n",
        "const CITIZEN_LOOKUP_SELECT = {\n"
        "  id: true,\n"
        "  birthId: true,\n"
        "  nationalId: true,\n",
    ))
    replacements.append((
        "router.get('/citizen-lookup', async (req, res) => {\n"
        "  const { id: officerId } = req.user\n"
        "  const nationalId = typeof req.query.nationalId === 'string' ? req.query.nationalId.trim() : ''\n"
        "  // PATCH-MIGRATION-2026: `q` is the generic lookup used by the migration\n"
        "  // flow — matches NIN, Birth Registration ID (BID) / birth cert no, or a\n"
        "  // partial full name. The original `nationalId` param keeps its strict\n"
        "  // exact-match-only contract for existing callers (CitizenProfileScreen).\n"
        "  const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''\n"
        "  const term = nationalId || q\n"
        "  if (!term) {\n"
        "    return res.status(400).json({ success: false, message: 'nationalId or q query param required' })\n"
        "  }\n"
        "  try {\n"
        "    const officer = await prisma.villageOfficer.findUnique({\n"
        "      where: { id: officerId },\n"
        "      select: { villageId: true, village: { select: { name: true } } },\n"
        "    })\n"
        "    if (!officer) return res.status(404).json({ success: false, message: 'Officer not found' })\n"
        "\n"
        "    const vid = officer.villageId ?? -1\n"
        "\n"
        "    let citizen = await prisma.citizen.findFirst({\n"
        "      where: { nationalId: term, currentVillageId: vid },\n"
        "      select: CITIZEN_LOOKUP_SELECT,\n"
        "    })\n"
        "\n"
        "    if (!citizen && q) {\n"
        "      citizen = await prisma.citizen.findFirst({\n"
        "        where: {\n"
        "          currentVillageId: vid,\n"
        "          OR: [\n"
        "            { birthRecord: { birthId: term } },\n"
        "            { birthRecord: { birthCertNo: term } },\n"
        "            { firstName: { contains: term, mode: 'insensitive' } },\n"
        "            { surname: { contains: term, mode: 'insensitive' } },\n"
        "          ],\n"
        "        },\n"
        "        select: CITIZEN_LOOKUP_SELECT,\n"
        "      })\n"
        "    }\n"
        "\n"
        "    if (!citizen) {\n"
        "      return res.status(404).json({\n"
        "        success: false,\n"
        "        message: 'No citizen matching this NIN, Birth ID, or name was found registered in your village.',\n"
        "      })\n"
        "    }\n",
        "router.get('/citizen-lookup', async (req, res) => {\n"
        "  const { id: officerId } = req.user\n"
        "  // PATCH-BID-LOOKUP-2026: birthId is now the primary strict-match key\n"
        "  // (CitizenProfileScreen). `nationalId` kept only as a legacy fallback for\n"
        "  // any older client still sending it. `q` is the generic lookup used by the\n"
        "  // migration flow — matches Birth ID, birth cert no, or a partial full name.\n"
        "  const birthId = typeof req.query.birthId === 'string' ? req.query.birthId.trim() : ''\n"
        "  const legacyNationalId = typeof req.query.nationalId === 'string' ? req.query.nationalId.trim() : ''\n"
        "  const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''\n"
        "  const term = birthId || legacyNationalId || q\n"
        "  if (!term) {\n"
        "    return res.status(400).json({ success: false, message: 'birthId or q query param required' })\n"
        "  }\n"
        "  try {\n"
        "    const officer = await prisma.villageOfficer.findUnique({\n"
        "      where: { id: officerId },\n"
        "      select: { villageId: true, village: { select: { name: true } } },\n"
        "    })\n"
        "    if (!officer) return res.status(404).json({ success: false, message: 'Officer not found' })\n"
        "\n"
        "    const vid = officer.villageId ?? -1\n"
        "\n"
        "    let citizen = await prisma.citizen.findFirst({\n"
        "      where: { birthId: term, currentVillageId: vid },\n"
        "      select: CITIZEN_LOOKUP_SELECT,\n"
        "    })\n"
        "\n"
        "    if (!citizen && legacyNationalId) {\n"
        "      citizen = await prisma.citizen.findFirst({\n"
        "        where: { nationalId: legacyNationalId, currentVillageId: vid },\n"
        "        select: CITIZEN_LOOKUP_SELECT,\n"
        "      })\n"
        "    }\n"
        "\n"
        "    if (!citizen && q) {\n"
        "      citizen = await prisma.citizen.findFirst({\n"
        "        where: {\n"
        "          currentVillageId: vid,\n"
        "          OR: [\n"
        "            { birthId: term },\n"
        "            { birthRecord: { birthCertNo: term } },\n"
        "            { firstName: { contains: term, mode: 'insensitive' } },\n"
        "            { surname: { contains: term, mode: 'insensitive' } },\n"
        "          ],\n"
        "        },\n"
        "        select: CITIZEN_LOOKUP_SELECT,\n"
        "      })\n"
        "    }\n"
        "\n"
        "    if (!citizen) {\n"
        "      return res.status(404).json({\n"
        "        success: false,\n"
        "        message: 'No citizen matching this Birth ID or name was found registered in your village.',\n"
        "      })\n"
        "    }\n",
    ))

    # 3g. NIN-issue — no DOB in NIN, denormalize birthId onto the new Citizen.
    replacements.append((
        "    // Generate NIN: YYYYMMDD-07031-SSSSS-CC\n"
        "    const yy  = dob.getFullYear()\n"
        "    const mm  = String(dob.getMonth()+1).padStart(2,'0')\n"
        "    const dd  = String(dob.getDate()).padStart(2,'0')\n"
        "    const seq = String(Math.floor(Math.random()*89999)+10001).padStart(5,'0')\n"
        "    const cc  = String(Math.floor(Math.random()*89)+10)\n"
        "    const nationalId = `${yy}${mm}${dd}-07031-${seq}-${cc}`\n",
        "    // PATCH-PRIVACY-2026: NIN no longer encodes date of birth — see genNationalId().\n"
        "    const nationalId = genNationalId()\n",
    ))
    replacements.append((
        "    const citizen = await prisma.citizen.create({\n"
        "      data: {\n"
        "        nationalId,\n"
        "        firstName:        birth.childFirstName,\n"
        "        middleName:       birth.childMiddleName ?? '',\n"
        "        surname:          birth.childSurname,\n"
        "        gender:           birth.gender,\n"
        "        dateOfBirth:      birth.dateOfBirth,\n"
        "        age,\n"
        "        vitalStatus:      'alive',\n"
        "        idCardIssued:     issuedDate,\n"
        "        idCardExpires:    expiresDate,\n"
        "        photoUrl:         photoUrl ?? undefined,\n"
        "        fatherCitizenId:  birth.fatherCitizenId ?? undefined,\n"
        "        motherCitizenId:  birth.motherCitizenId ?? undefined,\n"
        "        currentVillageId: officer?.villageId    ?? undefined,\n"
        "        registeredById:   officerId,\n"
        "        registeredAt:     new Date(),\n"
        "      },\n"
        "      select: { id:true, nationalId:true },\n"
        "    })\n",
        "    const citizen = await prisma.citizen.create({\n"
        "      data: {\n"
        "        nationalId,\n"
        "        // PATCH-BID-LOOKUP-2026: denormalize the Birth ID straight onto the new\n"
        "        // Citizen row so every future lookup for this person can go via BID\n"
        "        // alone, with no join back through the Birth record required.\n"
        "        birthId:          birth.birthId,\n"
        "        firstName:        birth.childFirstName,\n"
        "        middleName:       birth.childMiddleName ?? '',\n"
        "        surname:          birth.childSurname,\n"
        "        gender:           birth.gender,\n"
        "        dateOfBirth:      birth.dateOfBirth,\n"
        "        age,\n"
        "        vitalStatus:      'alive',\n"
        "        idCardIssued:     issuedDate,\n"
        "        idCardExpires:    expiresDate,\n"
        "        photoUrl:         photoUrl ?? undefined,\n"
        "        fatherCitizenId:  birth.fatherCitizenId ?? undefined,\n"
        "        motherCitizenId:  birth.motherCitizenId ?? undefined,\n"
        "        currentVillageId: officer?.villageId    ?? undefined,\n"
        "        registeredById:   officerId,\n"
        "        registeredAt:     new Date(),\n"
        "      },\n"
        "      select: { id:true, nationalId:true, birthId:true },\n"
        "    })\n",
    ))

    patch(path, marker, replacements, "village.js privacy + BID lookup")


# ════════════════════════════════════════════════════════════════════════
# 4. backend/src/routes/dashboard.js — officer/citizen-lookup by birthId
# ════════════════════════════════════════════════════════════════════════
def patch_dashboard_js():
    print("\n[4/14] backend/src/routes/dashboard.js")
    path = BACKEND / "src/routes/dashboard.js"
    marker = "PATCH-BID-LOOKUP-2026"

    replacements = [(
        "router.get('/citizen-lookup', async (req, res) => {\n"
        "  const q = req.query.q?.toString().trim()\n"
        "  if (!q) return res.status(400).json({ success: false, message: 'Query required' })\n"
        "  try {\n"
        "    // Try exact NID match first (most common mobile use-case: scan/type NID)\n"
        "    let citizen = await prisma.citizen.findFirst({\n"
        "      where: { nationalId: q },\n"
        "      select: { id: true, nationalId: true, firstName: true, middleName: true, surname: true, gender: true, dateOfBirth: true, vitalStatus: true },\n"
        "    })\n"
        "    // Fallback: partial name search (if not an exact NID query)\n"
        "    if (!citizen) {\n"
        "      citizen = await prisma.citizen.findFirst({\n"
        "        where: { OR: [\n"
        "          { nationalId: { contains: q, mode: 'insensitive' } },\n"
        "          { firstName:  { contains: q, mode: 'insensitive' } },\n"
        "          { surname:    { contains: q, mode: 'insensitive' } },\n"
        "        ]},\n"
        "        select: { id: true, nationalId: true, firstName: true, middleName: true, surname: true, gender: true, dateOfBirth: true, vitalStatus: true },\n"
        "      })\n"
        "    }\n"
        "    if (!citizen) return res.json({ success: false, message: 'Not found' })\n",
        "// PATCH-BID-LOOKUP-2026: Birth ID (BID) is the primary key for finding an\n"
        "// already-registered citizen (parent, spouse, deceased) — a citizen only\n"
        "// ever has a NIN because they already had a BID, so BID alone is enough;\n"
        "// no need to also ask for/know their NIN. Exact NIN match is kept as a\n"
        "// legacy fallback, then partial name/BID/NIN search.\n"
        "router.get('/citizen-lookup', async (req, res) => {\n"
        "  const q = req.query.q?.toString().trim()\n"
        "  if (!q) return res.status(400).json({ success: false, message: 'Query required' })\n"
        "  const CITIZEN_SELECT = { id: true, birthId: true, nationalId: true, firstName: true, middleName: true, surname: true, gender: true, dateOfBirth: true, vitalStatus: true }\n"
        "  try {\n"
        "    let citizen = await prisma.citizen.findFirst({ where: { birthId: q }, select: CITIZEN_SELECT })\n"
        "    if (!citizen) {\n"
        "      citizen = await prisma.citizen.findFirst({ where: { nationalId: q }, select: CITIZEN_SELECT })\n"
        "    }\n"
        "    if (!citizen) {\n"
        "      citizen = await prisma.citizen.findFirst({\n"
        "        where: { OR: [\n"
        "          { birthId:    { contains: q, mode: 'insensitive' } },\n"
        "          { nationalId: { contains: q, mode: 'insensitive' } },\n"
        "          { firstName:  { contains: q, mode: 'insensitive' } },\n"
        "          { surname:    { contains: q, mode: 'insensitive' } },\n"
        "        ]},\n"
        "        select: CITIZEN_SELECT,\n"
        "      })\n"
        "    }\n"
        "    if (!citizen) return res.json({ success: false, message: 'Not found' })\n",
    )]
    patch(path, marker, replacements, "dashboard.js officer/citizen-lookup by birthId")


# ════════════════════════════════════════════════════════════════════════
# 5. backend/prisma/seed.js — test parents get test BIDs
# ════════════════════════════════════════════════════════════════════════
def patch_seed_js():
    print("\n[5/14] backend/prisma/seed.js")
    path = BACKEND / "prisma/seed.js"
    marker = "PATCH-BID-LOOKUP-2026"

    replacements = [
        (
            "  // ── Father: John Michael Makonde ──────────────────────────────────────────\n"
            "  const father = await prisma.citizen.upsert({\n"
            "    where:  { nationalId: '19850315-07031-00001-24' },\n"
            "    update: {\n"
            "      // keep up-to-date if re-seeded\n"
            "      age:         41,\n"
            "      vitalStatus: 'alive',\n"
            "    },\n"
            "    create: {\n"
            "      nationalId:      '19850315-07031-00001-24',\n",
            "  // PATCH-BID-LOOKUP-2026: test parents are now looked up by Birth ID (BID) —\n"
            "  // this is what the Hospital Officer's RegisterBirth screen's \"Auto-fill\n"
            "  // test father/mother ID\" button and MOCK_CITIZENS fallback both use.\n"
            "  // ── Father: John Michael Makonde ──────────────────────────────────────────\n"
            "  const father = await prisma.citizen.upsert({\n"
            "    where:  { birthId: 'BID-FATHER0001' },\n"
            "    update: {\n"
            "      // keep up-to-date if re-seeded\n"
            "      age:         41,\n"
            "      vitalStatus: 'alive',\n"
            "    },\n"
            "    create: {\n"
            "      birthId:         'BID-FATHER0001',\n"
            "      nationalId:      '19850315-07031-00001-24',\n",
        ),
        (
            "  // ── Mother: Grace Rose Mwamba ─────────────────────────────────────────────\n"
            "  const mother = await prisma.citizen.upsert({\n"
            "    where:  { nationalId: '19880622-07031-00002-13' },\n"
            "    update: {\n"
            "      age:         37,\n"
            "      vitalStatus: 'alive',\n"
            "    },\n"
            "    create: {\n"
            "      nationalId:      '19880622-07031-00002-13',\n",
            "  // ── Mother: Grace Rose Mwamba ─────────────────────────────────────────────\n"
            "  const mother = await prisma.citizen.upsert({\n"
            "    where:  { birthId: 'BID-MOTHER0001' },\n"
            "    update: {\n"
            "      age:         37,\n"
            "      vitalStatus: 'alive',\n"
            "    },\n"
            "    create: {\n"
            "      birthId:         'BID-MOTHER0001',\n"
            "      nationalId:      '19880622-07031-00002-13',\n",
        ),
        (
            "      nidaNumber:  'SA00000000000001',\n",
            "      birthId:     'BID-SUPERADMIN01',\n",
        ),
        (
            "      nidaNumber:  'DA00000000000001',\n",
            "      birthId:     'BID-DISTADMIN001',\n",
        ),
        (
            "      nidaNumber:  'VO00000000000001',\n",
            "      birthId:     'BID-VILLOFFICER1',\n",
        ),
        (
            "      nidaNumber:  'HO00000000000001',\n",
            "      birthId:     'BID-HOSPOFFICER1',\n",
        ),
    ]
    patch(path, marker, replacements, "seed.js test BIDs")


# ════════════════════════════════════════════════════════════════════════
# 6. mobile/src/services/localDb.ts — privacy-safe generators
# ════════════════════════════════════════════════════════════════════════
def patch_local_db():
    print("\n[6/14] mobile/src/services/localDb.ts")
    path = MOBILE / "src/services/localDb.ts"
    marker = "PATCH-PRIVACY-2026"

    replacements = [(
        "// ─── Cert / ID generators ──────────────────────────────────────────────────────\n"
        "/**\n"
        " * generateBirthId — Birth Registration tracking ID\n"
        " *\n"
        " * Format: BID-YYYYMMDD-XXXXXXX\n"
        " * Example: BID-20260601-3847291\n"
        " *\n"
        " * This ID is stored with the birth record and presented to the family.\n"
        " * At age 18 a Village Officer enters this ID to look up the birth record\n"
        " * and issue the citizen's National ID (NIN).\n"
        " *\n"
        " * NO NIN is generated at birth — NIN issuance is a Village Officer workflow.\n"
        " */\n"
        "export function generateBirthId(dob: string): string {\n"
        "  const parts = dob.split('/')\n"
        "  const day = (parts[0] ?? '01').padStart(2, '0')\n"
        "  const month = (parts[1] ?? '01').padStart(2, '0')\n"
        "  const year = parts[2] ?? String(new Date().getFullYear())\n"
        "  const date = `${year}${month}${day}`\n"
        "  const seq = String(Math.floor(Math.random() * 9000000) + 1000000)\n"
        "  return `BID-${date}-${seq}`\n"
        "}\n",
        "// ─── Cert / ID generators ──────────────────────────────────────────────────────\n"
        "// PATCH-PRIVACY-2026: neither ID format below encodes date of birth (or any\n"
        "// other personal detail) any more — regulatory/privacy requirement. Both are\n"
        "// opaque, high-entropy random identifiers; uniqueness is enforced by the\n"
        "// database UNIQUE constraint server-side (with retry on collision). The `dob`\n"
        "// (and region/district/ward) parameters are kept-but-unused so existing call\n"
        "// sites don't need to change.\n"
        "const ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O/1/I — avoids confusion\n"
        "function randomIdBlock(len: number): string {\n"
        "  let out = ''\n"
        "  for (let i = 0; i < len; i++) out += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)]\n"
        "  return out\n"
        "}\n"
        "\n"
        "/**\n"
        " * generateBirthId — Birth Registration tracking ID\n"
        " *\n"
        " * Format: BID-XXXXXXXXXX (10 chars, opaque — no DOB or other PII derivable)\n"
        " *\n"
        " * This ID is stored with the birth record and presented to the family.\n"
        " * At age 18 a Village Officer enters this ID to look up the birth record\n"
        " * and issue the citizen's National ID (NIN).\n"
        " *\n"
        " * NO NIN is generated at birth — NIN issuance is a Village Officer workflow.\n"
        " */\n"
        "export function generateBirthId(_dob?: string): string {\n"
        "  return `BID-${randomIdBlock(10)}`\n"
        "}\n",
    )]

    replacements.append((
        "export function generateNationalId(\n"
        "  dob: string,\n"
        "  regionCode = '07',\n"
        "  districtCode = '03',\n"
        "  wardCode = '1'\n"
        "): string {\n"
        "  const parts = dob.split('/')\n"
        "  const day = (parts[0] ?? '01').padStart(2, '0')\n"
        "  const month = (parts[1] ?? '01').padStart(2, '0')\n"
        "  const year = parts[2] ?? '2026'\n"
        "  const date = `${year}${month}${day}`\n"
        "  const loc = `${regionCode.padStart(2, '0')}${districtCode.padStart(2, '0')}${wardCode.padStart(1, '0')}`\n"
        "  const seq = String(Math.floor(Math.random() * 90000) + 10000).padStart(5, '0')\n"
        "  const cc = String(Math.floor(Math.random() * 90) + 10)\n"
        "  return `${date}-${loc}-${seq}-${cc}`\n"
        "}\n",
        "// National ID (NIN) — format: NIDA-XXXXXXXXXXXX-CC\n"
        "export function generateNationalId(\n"
        "  _dob?: string,\n"
        "  _regionCode?: string,\n"
        "  _districtCode?: string,\n"
        "  _wardCode?: string\n"
        "): string {\n"
        "  const cc = String(Math.floor(Math.random() * 90) + 10)\n"
        "  return `NIDA-${randomIdBlock(12)}-${cc}`\n"
        "}\n",
    ))

    patch(path, marker, replacements, "localDb.ts privacy-safe generators")


# ════════════════════════════════════════════════════════════════════════
# 7. mobile NINRegistrationScreen.tsx — cosmetic preview generator
# ════════════════════════════════════════════════════════════════════════
def patch_nin_registration_screen():
    print("\n[7/14] mobile NINRegistrationScreen.tsx")
    path = MOBILE / "src/screens/village/NINRegistrationScreen.tsx"
    marker = "PATCH-PRIVACY-2026"

    replacements = [(
        "  const generateNationalId = (dob: string) => {\n"
        "    const d = dob.replace(/[^0-9]/g, '').slice(0, 8)\n"
        "    return `NIN-${d || Date.now().toString().slice(-8)}`\n"
        "  }\n",
        "  // PATCH-PRIVACY-2026: preview only (server issues the real NIN) — no DOB\n"
        "  // or other personal detail is encoded in it any more.\n"
        "  const generateNationalId = (_dob: string) => {\n"
        "    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'\n"
        "    let seq = ''\n"
        "    for (let i = 0; i < 12; i++) seq += alphabet[Math.floor(Math.random() * alphabet.length)]\n"
        "    return `NIDA-${seq}`\n"
        "  }\n",
    )]
    patch(path, marker, replacements, "NINRegistrationScreen.tsx preview generator")


# ════════════════════════════════════════════════════════════════════════
# 8. mobile RegisterCitizenScreen.tsx — also generate/display a Birth ID
# ════════════════════════════════════════════════════════════════════════
def patch_register_citizen_screen():
    print("\n[8/14] mobile RegisterCitizenScreen.tsx")
    path = MOBILE / "src/screens/village/RegisterCitizenScreen.tsx"
    marker = "PATCH-BID-LOOKUP-2026"

    replacements = [
        (
            "import { generateNationalId } from '../../services/localDb'",
            "import { generateNationalId, generateBirthId } from '../../services/localDb' // PATCH-BID-LOOKUP-2026",
        ),
        (
            "  const [genNid, setGenNid] = useState('')",
            "  const [genNid, setGenNid] = useState('')\n"
            "  const [genBid, setGenBid] = useState('') // PATCH-BID-LOOKUP-2026",
        ),
        (
            "      const nid = generateNationalId(dob)\n"
            "      setGenNid(nid)\n"
            "      if (isOnline()) {\n"
            "        try {\n"
            "          await apiPost('/village/citizen', {\n"
            "            firstName: firstName.trim(),\n"
            "            middleName: middleName.trim(),\n"
            "            surname: surname.trim(),\n"
            "            gender,\n"
            "            dateOfBirth: dob,\n"
            "            nationalId: nid,\n"
            "            bloodGroup,\n"
            "            phone: phone.trim(),\n"
            "            occupation: occupation.trim(),\n"
            "          })\n"
            "        } catch {}\n"
            "      }\n",
            "      const nid = generateNationalId(dob)\n"
            "      const bid = generateBirthId() // PATCH-BID-LOOKUP-2026: this citizen has no\n"
            "      // prior birth record, so give them a Birth ID here — it becomes their\n"
            "      // canonical lookup key everywhere else in the system, same as anyone\n"
            "      // who came through the Birth → NIN-issuance flow.\n"
            "      setGenNid(nid)\n"
            "      setGenBid(bid)\n"
            "      if (isOnline()) {\n"
            "        try {\n"
            "          await apiPost('/village/citizen', {\n"
            "            firstName: firstName.trim(),\n"
            "            middleName: middleName.trim(),\n"
            "            surname: surname.trim(),\n"
            "            gender,\n"
            "            dateOfBirth: dob,\n"
            "            nationalId: nid,\n"
            "            birthId: bid,\n"
            "            bloodGroup,\n"
            "            phone: phone.trim(),\n"
            "            occupation: occupation.trim(),\n"
            "          })\n"
            "        } catch {}\n"
            "      }\n",
        ),
        (
            "                Generated National ID (NIN)\n"
            "              </Text>\n"
            "              <View\n"
            "                style={{\n"
            "                  borderRadius: 10,\n"
            "                  borderWidth: 1,\n"
            "                  borderColor: `${TZ.blue}50`,\n"
            "                  backgroundColor: `${TZ.blue}10`,\n"
            "                  padding: 12,\n"
            "                  flexDirection: 'row',\n"
            "                  alignItems: 'center',\n"
            "                }}\n"
            "              >\n"
            "                <Text\n"
            "                  style={{\n"
            "                    fontSize: 13,\n"
            "                    fontWeight: '900',\n"
            "                    color: TZ.blue,\n"
            "                    flex: 1,\n"
            "                    letterSpacing: 0.5,\n"
            "                  }}\n"
            "                >\n"
            "                  {genNid}\n"
            "                </Text>\n"
            "                <TouchableOpacity\n"
            "                  onPress={() => copy(genNid, 'National ID')}\n"
            "                  style={{ padding: 4 }}\n"
            "                >\n"
            "                  <Copy size={15} color={TZ.blue} />\n"
            "                </TouchableOpacity>\n"
            "              </View>\n"
            "              <Text style={{ fontSize: 10, color: T.textDim, fontStyle: 'italic' }}>\n"
            "                Citizen collects physical ID card from Village Officer upon request\n"
            "              </Text>\n"
            "            </View>\n",
            "                Generated National ID (NIN)\n"
            "              </Text>\n"
            "              <View\n"
            "                style={{\n"
            "                  borderRadius: 10,\n"
            "                  borderWidth: 1,\n"
            "                  borderColor: `${TZ.blue}50`,\n"
            "                  backgroundColor: `${TZ.blue}10`,\n"
            "                  padding: 12,\n"
            "                  flexDirection: 'row',\n"
            "                  alignItems: 'center',\n"
            "                }}\n"
            "              >\n"
            "                <Text\n"
            "                  style={{\n"
            "                    fontSize: 13,\n"
            "                    fontWeight: '900',\n"
            "                    color: TZ.blue,\n"
            "                    flex: 1,\n"
            "                    letterSpacing: 0.5,\n"
            "                  }}\n"
            "                >\n"
            "                  {genNid}\n"
            "                </Text>\n"
            "                <TouchableOpacity\n"
            "                  onPress={() => copy(genNid, 'National ID')}\n"
            "                  style={{ padding: 4 }}\n"
            "                >\n"
            "                  <Copy size={15} color={TZ.blue} />\n"
            "                </TouchableOpacity>\n"
            "              </View>\n"
            "              {/* PATCH-BID-LOOKUP-2026: this is the citizen's lookup key everywhere\n"
            "                  else in the system (marriage, migration, death, profile search) */}\n"
            "              <Text\n"
            "                style={{\n"
            "                  fontSize: 11,\n"
            "                  fontWeight: '700',\n"
            "                  color: T.textSub,\n"
            "                  marginTop: 10,\n"
            "                  textTransform: 'uppercase',\n"
            "                  letterSpacing: 0.5,\n"
            "                }}\n"
            "              >\n"
            "                Generated Birth ID (BID)\n"
            "              </Text>\n"
            "              <View\n"
            "                style={{\n"
            "                  borderRadius: 10,\n"
            "                  borderWidth: 1,\n"
            "                  borderColor: `${TZ.green}50`,\n"
            "                  backgroundColor: `${TZ.green}10`,\n"
            "                  padding: 12,\n"
            "                  flexDirection: 'row',\n"
            "                  alignItems: 'center',\n"
            "                }}\n"
            "              >\n"
            "                <Text\n"
            "                  style={{\n"
            "                    fontSize: 13,\n"
            "                    fontWeight: '900',\n"
            "                    color: TZ.green,\n"
            "                    flex: 1,\n"
            "                    letterSpacing: 0.5,\n"
            "                  }}\n"
            "                >\n"
            "                  {genBid}\n"
            "                </Text>\n"
            "                <TouchableOpacity\n"
            "                  onPress={() => copy(genBid, 'Birth ID')}\n"
            "                  style={{ padding: 4 }}\n"
            "                >\n"
            "                  <Copy size={15} color={TZ.green} />\n"
            "                </TouchableOpacity>\n"
            "              </View>\n"
            "              <Text style={{ fontSize: 10, color: T.textDim, fontStyle: 'italic' }}>\n"
            "                Citizen collects physical ID card from Village Officer upon request\n"
            "              </Text>\n"
            "            </View>\n",
        ),
    ]
    patch(path, marker, replacements, "RegisterCitizenScreen.tsx birthId generation + display")


# ════════════════════════════════════════════════════════════════════════
# 9. mobile CitizenProfileScreen.tsx — search by Birth ID
# ════════════════════════════════════════════════════════════════════════
def patch_citizen_profile_screen():
    print("\n[9/14] mobile CitizenProfileScreen.tsx")
    path = MOBILE / "src/screens/village/CitizenProfileScreen.tsx"
    marker = "PATCH-BID-LOOKUP-2026"

    replacements = [
        (
            "    const value = nin.trim()\n"
            "    if (!value) {\n"
            "      setError('Enter a citizen NIN to search.')\n"
            "      return\n"
            "    }\n"
            "    setSearching(true)\n"
            "    setError('')\n"
            "    setProfile(null)\n"
            "    try {\n"
            "      const json = await apiGet(`/village/citizen-lookup?nationalId=${encodeURIComponent(value)}`)\n"
            "      if (json.success && json.data) {\n"
            "        setProfile(json.data)\n"
            "        setExpanded(true)\n"
            "      } else {\n"
            "        setError(json.message ?? 'Citizen not found in your village.')\n"
            "      }\n"
            "    } catch (e: any) {\n"
            "      setError(e?.message ?? 'No citizen with this NIN was found registered in your village.')\n"
            "    } finally {\n",
            "    // PATCH-BID-LOOKUP-2026: search by Birth ID (BID) — a citizen only ever has\n"
            "    // a NIN because they already had a BID, so BID alone is enough.\n"
            "    const value = nin.trim()\n"
            "    if (!value) {\n"
            "      setError('Enter a citizen Birth ID to search.')\n"
            "      return\n"
            "    }\n"
            "    setSearching(true)\n"
            "    setError('')\n"
            "    setProfile(null)\n"
            "    try {\n"
            "      const json = await apiGet(`/village/citizen-lookup?birthId=${encodeURIComponent(value)}`)\n"
            "      if (json.success && json.data) {\n"
            "        setProfile(json.data)\n"
            "        setExpanded(true)\n"
            "      } else {\n"
            "        setError(json.message ?? 'Citizen not found in your village.')\n"
            "      }\n"
            "    } catch (e: any) {\n"
            "      setError(e?.message ?? 'No citizen with this Birth ID was found registered in your village.')\n"
            "    } finally {\n",
        ),
        (
            "            Citizen National ID (NIN) *\n",
            "            Citizen Birth ID (BID) *\n",
        ),
        (
            '              placeholder="YYYYMMDD-07031-XXXXX-CC"\n'
            '              placeholderTextColor={T.textDim}\n'
            '              autoCapitalize="characters"\n',
            '              placeholder="BID-XXXXXXXXXX"\n'
            '              placeholderTextColor={T.textDim}\n'
            '              autoCapitalize="characters"\n',
        ),
    ]
    patch(path, marker, replacements, "CitizenProfileScreen.tsx search by BID")


# ════════════════════════════════════════════════════════════════════════
# 10. mobile migration screens — BID instead of NIN
# ════════════════════════════════════════════════════════════════════════
def patch_migration_mobile_screens():
    print("\n[10/14] mobile migration screens (Confirm/Track/Requests)")

    # ConfirmIncomingMigrationScreen.tsx — full field/label/wire-key swap.
    confirm_path = MOBILE / "src/screens/village/ConfirmIncomingMigrationScreen.tsx"
    confirm_marker = "PATCH-BID-LOOKUP-2026"
    confirm_replacements = [
        (
            "import { ArrowLeft, Repeat, CheckCircle2, User, Search } from 'lucide-react-native'",
            "import { ArrowLeft, Repeat, CheckCircle2, User, Search } from 'lucide-react-native' // PATCH-BID-LOOKUP-2026",
        ),
        (
            "  const [nationalId, setNationalId] = useState('')\n"
            "  const [migrationToken, setMigrationToken] = useState('')\n"
            "  const [submitting, setSubmitting] = useState(false)\n"
            "\n"
            "  const canSubmit = nationalId.trim().length > 0 && migrationToken.trim().length > 0 && !submitting\n"
            "\n"
            "  const handleConfirm = async () => {\n"
            "    if (!canSubmit) return\n"
            "    setSubmitting(true)\n"
            "    try {\n"
            "      const json = await apiPost('/village/migration/confirm', {\n"
            "        nationalId: nationalId.trim(),\n"
            "        migrationToken: migrationToken.trim(),\n"
            "      })\n",
            "  // PATCH-BID-LOOKUP-2026: confirm by Birth ID (BID), not NIN — a citizen\n"
            "  // only ever has a NIN because they already had a BID.\n"
            "  const [birthId, setBirthId] = useState('')\n"
            "  const [migrationToken, setMigrationToken] = useState('')\n"
            "  const [submitting, setSubmitting] = useState(false)\n"
            "\n"
            "  const canSubmit = birthId.trim().length > 0 && migrationToken.trim().length > 0 && !submitting\n"
            "\n"
            "  const handleConfirm = async () => {\n"
            "    if (!canSubmit) return\n"
            "    setSubmitting(true)\n"
            "    try {\n"
            "      const json = await apiPost('/village/migration/confirm', {\n"
            "        birthId: birthId.trim(),\n"
            "        migrationToken: migrationToken.trim(),\n"
            "      })\n",
        ),
        (
            "          <Text style={{ fontSize: 12, color: T.textSub }}>\n"
            "            Ask the citizen for their NIN and the migration token given to them by their previous village\n"
            "            officer, then confirm below. This is only valid within one week of the token being issued.\n"
            "          </Text>\n"
            "\n"
            "          <View>\n"
            "            <Text style={{ fontSize: 12, fontWeight: '600', color: T.textSub, marginBottom: 6 }}>\n"
            "              Citizen NIN\n"
            "            </Text>\n",
            "          <Text style={{ fontSize: 12, color: T.textSub }}>\n"
            "            Ask the citizen for their Birth ID (BID) and the migration token given to them by their\n"
            "            previous village officer, then confirm below. This is only valid within one week of the\n"
            "            token being issued.\n"
            "          </Text>\n"
            "\n"
            "          <View>\n"
            "            <Text style={{ fontSize: 12, fontWeight: '600', color: T.textSub, marginBottom: 6 }}>\n"
            "              Citizen Birth ID (BID)\n"
            "            </Text>\n",
        ),
        (
            "              <User size={15} color={T.textDim} />\n"
            "              <TextInput\n"
            "                style={{ flex: 1, paddingVertical: 12, color: T.text, fontSize: 14 }}\n"
            "                value={nationalId}\n"
            "                onChangeText={setNationalId}\n"
            "                placeholder=\"e.g. 19900101-07031-12345-67\"\n"
            "                placeholderTextColor={T.textDim}\n"
            "                autoCapitalize=\"none\"\n"
            "              />\n",
            "              <User size={15} color={T.textDim} />\n"
            "              <TextInput\n"
            "                style={{ flex: 1, paddingVertical: 12, color: T.text, fontSize: 14 }}\n"
            "                value={birthId}\n"
            "                onChangeText={(v) => setBirthId(v.toUpperCase())}\n"
            "                placeholder=\"e.g. BID-7F3K9QXTZ2\"\n"
            "                placeholderTextColor={T.textDim}\n"
            "                autoCapitalize=\"characters\"\n"
            "              />\n",
        ),
    ]
    patch(confirm_path, confirm_marker, confirm_replacements, "ConfirmIncomingMigrationScreen.tsx BID field")

    # TrackMigrationScreen.tsx — wording only.
    track_path = MOBILE / "src/screens/village/TrackMigrationScreen.tsx"
    track_marker = "PATCH-BID-LOOKUP-2026"
    track_replacements = [(
        "                  ? `\\n\\nMigration Token: ${token}\\nValid until: ${expiry ?? '7 days from today'}\\n\\nGive this token to the citizen — they must present it with their NIN to the destination village officer within one week, or it expires and a new request must be issued.`\n",
        "                  // PATCH-BID-LOOKUP-2026: citizen now presents their Birth ID (BID), not NIN\n"
        "                  ? `\\n\\nMigration Token: ${token}\\nValid until: ${expiry ?? '7 days from today'}\\n\\nGive this token to the citizen — they must present it with their Birth ID (BID) to the destination village officer within one week, or it expires and a new request must be issued.`\n",
    )]
    patch(track_path, track_marker, track_replacements, "TrackMigrationScreen.tsx BID wording")

    # MigrationRequestsScreen.tsx — tip text wording only.
    req_path = MOBILE / "src/screens/village/MigrationRequestsScreen.tsx"
    req_marker = "PATCH-BID-LOOKUP-2026"
    req_replacements = [(
        "          Tip: if the citizen already has their NIN and migration token in hand, use \"Incoming Citizen\"\n"
        "          from the Migration menu to confirm instantly instead of waiting for it to appear below.\n",
        "          {/* PATCH-BID-LOOKUP-2026 */}\n"
        "          Tip: if the citizen already has their Birth ID (BID) and migration token in hand, use\n"
        "          \"Incoming Citizen\" from the Migration menu to confirm instantly instead of waiting for it to\n"
        "          appear below.\n",
    )]
    patch(req_path, req_marker, req_replacements, "MigrationRequestsScreen.tsx BID wording")


# ════════════════════════════════════════════════════════════════════════
# 11. mobile birth/death/marriage screens — BID entry instead of NIN
# ════════════════════════════════════════════════════════════════════════
def patch_birth_death_marriage_screens():
    print("\n[11/14] mobile RegisterBirth / RecordDeath / VillageRecordDeath / RegisterMarriage")

    # RegisterBirthScreen.tsx
    rb_path = MOBILE / "src/screens/hospital/RegisterBirthScreen.tsx"
    rb_marker = "PATCH-BID-LOOKUP-2026"
    rb_replacements = [
        (
            "// ─── NIN formatter ────────────────────────────────────────────────────────────\n"
            "function formatNIN(raw: string): string {\n"
            "  const clean = raw.replace(/[^0-9]/g, '')\n"
            "  let out = clean.slice(0, 8)\n"
            "  if (clean.length > 8) out += '-' + clean.slice(8, 13)\n"
            "  if (clean.length > 13) out += '-' + clean.slice(13, 18)\n"
            "  if (clean.length > 18) out += '-' + clean.slice(18, 20)\n"
            "  return out\n"
            "}\n"
            "function isNINComplete(nin: string) {\n"
            "  return /^\\d{8}-\\d{5}-\\d{5}-\\d{2}$/.test(nin)\n"
            "}\n",
            "// PATCH-BID-LOOKUP-2026: father/mother are now looked up by their Birth ID\n"
            "// (BID) instead of NIN — a citizen only ever has a NIN because they already\n"
            "// had a BID, so BID alone is enough. Names kept as formatNIN/isNINComplete to\n"
            "// avoid touching every call site below; they now format/validate a BID.\n"
            "function formatNIN(raw: string): string {\n"
            "  return raw.toUpperCase().replace(/[^A-Z0-9-]/g, '')\n"
            "}\n"
            "function isNINComplete(nin: string) {\n"
            "  return /^BID-[A-Z0-9]{6,12}$/.test(nin.trim())\n"
            "}\n",
        ),
        (
            "const MOCK_CITIZENS: Record<string, any> = {\n"
            "  '19850315-07031-00001-24': {\n"
            "    nationalId: '19850315-07031-00001-24',\n",
            "// PATCH-BID-LOOKUP-2026: keyed by test Birth ID now (matches seed.js)\n"
            "const MOCK_CITIZENS: Record<string, any> = {\n"
            "  'BID-FATHER0001': {\n"
            "    birthId: 'BID-FATHER0001',\n"
            "    nationalId: '19850315-07031-00001-24',\n",
        ),
        (
            "  '19880622-07031-00002-13': {\n"
            "    nationalId: '19880622-07031-00002-13',\n",
            "  'BID-MOTHER0001': {\n"
            "    birthId: 'BID-MOTHER0001',\n"
            "    nationalId: '19880622-07031-00002-13',\n",
        ),
        (
            "    const testNid = isFather ? '19850315-07031-00001-24' : '19880622-07031-00002-13'\n",
            "    const testNid = isFather ? 'BID-FATHER0001' : 'BID-MOTHER0001' // PATCH-BID-LOOKUP-2026\n",
        ),
        (
            "          if (isFather && foundGender !== 'MALE') {\n"
            "            setError(\n"
            "              'This National ID belongs to a FEMALE citizen and cannot be used for the Father.'\n"
            "            )\n"
            "            setLoading(false)\n"
            "            return\n"
            "          }\n"
            "          if (!isFather && foundGender !== 'FEMALE') {\n"
            "            setError(\n"
            "              'This National ID belongs to a MALE citizen and cannot be used for the Mother.'\n"
            "            )\n",
            "          if (isFather && foundGender !== 'MALE') {\n"
            "            setError(\n"
            "              'This Birth ID belongs to a FEMALE citizen and cannot be used for the Father.'\n"
            "            )\n"
            "            setLoading(false)\n"
            "            return\n"
            "          }\n"
            "          if (!isFather && foundGender !== 'FEMALE') {\n"
            "            setError(\n"
            "              'This Birth ID belongs to a MALE citizen and cannot be used for the Mother.'\n"
            "            )\n",
        ),
        (
            "      setError('National ID not found in NBS Central Database.')\n",
            "      setError('Birth ID not found in NBS Central Database.') // PATCH-BID-LOOKUP-2026\n",
        ),
        (
            "          Enter the {label.toLowerCase()}'s National ID. The system validates the record in the NBS\n"
            "          Central Database.\n"
            "        </Text>\n"
            "        <View>\n"
            "          <Text style={{ fontSize: 12, fontWeight: '600', color: T.textSub, marginBottom: 6 }}>\n"
            "            National ID Number *\n"
            "          </Text>\n",
            "          Enter the {label.toLowerCase()}'s Birth ID (BID). The system validates the record in the NBS\n"
            "          Central Database.\n"
            "        </Text>\n"
            "        <View>\n"
            "          <Text style={{ fontSize: 12, fontWeight: '600', color: T.textSub, marginBottom: 6 }}>\n"
            "            Birth ID (BID) *\n"
            "          </Text>\n",
        ),
        (
            '              onChangeText={(raw) => handleNINInput(raw, role)}\n'
            '              placeholder="YYYYMMDD-LLLLL-SSSSS-CC"\n'
            '              placeholderTextColor={T.textDim}\n'
            '              keyboardType="numeric"\n'
            '              maxLength={23}\n',
            '              onChangeText={(raw) => handleNINInput(raw, role)}\n'
            '              placeholder="BID-XXXXXXXXXX"\n'
            '              placeholderTextColor={T.textDim}\n'
            '              keyboardType="default"\n'
            '              maxLength={14}\n',
        ),
        (
            "              handleNINInput(testNid.replace(/-/g, ''), role)\n"
            "              lookupParent(testNid, role)\n",
            "              handleNINInput(testNid, role) // PATCH-BID-LOOKUP-2026: BID keeps its dash\n"
            "              lookupParent(testNid, role)\n",
        ),
    ]
    patch(rb_path, rb_marker, rb_replacements, "RegisterBirthScreen.tsx BID entry")

    # RecordDeathScreen.tsx (hospital)
    rd_path = MOBILE / "src/screens/hospital/RecordDeathScreen.tsx"
    rd_marker = "PATCH-BID-LOOKUP-2026"
    rd_replacements = [
        (
            "  // NIN formatter (for parent lookup in INFANT case)\n"
            "  const formatNIN = (raw: string) => {\n"
            "    const clean = raw.replace(/[^0-9]/g, '')\n"
            "    let out = clean.slice(0, 8)\n"
            "    if (clean.length > 8) out += '-' + clean.slice(8, 13)\n"
            "    if (clean.length > 13) out += '-' + clean.slice(13, 18)\n"
            "    if (clean.length > 18) out += '-' + clean.slice(18, 20)\n"
            "    return out\n"
            "  }\n"
            "  const isNINComplete = (nin: string) => /^\\d{8}-\\d{5}-\\d{5}-\\d{2}$/.test(nin)\n",
            "  // PATCH-BID-LOOKUP-2026: father/mother now looked up by Birth ID (BID), not\n"
            "  // NIN. Names kept as formatNIN/isNINComplete to avoid touching every call\n"
            "  // site below; they now format/validate a BID.\n"
            "  const formatNIN = (raw: string) => raw.toUpperCase().replace(/[^A-Z0-9-]/g, '')\n"
            "  const isNINComplete = (nin: string) => /^BID-[A-Z0-9]{6,12}$/.test(nin.trim())\n",
        ),
        (
            'placeholder="National ID or full name"',
            'placeholder="Birth ID (BID) or full name"',
        ),
        (
            "                  National ID / Full Name *\n",
            "                  Birth ID (BID) / Full Name *\n",
        ),
        (
            "              <Text style={{ fontSize: 12, color: T.textSub, lineHeight: 18 }}>\n"
            "                The infant has no National ID yet. Enter Father and Mother NIDs to link this death\n"
            "                record to their lineage.\n"
            "              </Text>\n",
            "              <Text style={{ fontSize: 12, color: T.textSub, lineHeight: 18 }}>\n"
            "                The infant has no National ID yet. Enter Father and Mother Birth IDs (BID) to link this\n"
            "                death record to their lineage.\n"
            "              </Text>\n",
        ),
        (
            "                    <Text style={{ fontSize: 13, fontWeight: '800', color: accent }}>\n"
            "                      {label} National ID\n"
            "                    </Text>\n",
            "                    <Text style={{ fontSize: 13, fontWeight: '800', color: accent }}>\n"
            "                      {label} Birth ID (BID)\n"
            "                    </Text>\n",
        ),
        (
            '                        onChangeText={(raw) => setNid(formatNIN(raw))}\n'
            '                        placeholder="YYYYMMDD-LLLLL-SSSSS-CC"\n'
            '                        placeholderTextColor={T.textDim}\n'
            '                        keyboardType="numeric"\n'
            '                        maxLength={23}\n',
            '                        onChangeText={(raw) => setNid(formatNIN(raw))}\n'
            '                        placeholder="BID-XXXXXXXXXX"\n'
            '                        placeholderTextColor={T.textDim}\n'
            '                        keyboardType="default"\n'
            '                        maxLength={14}\n',
        ),
    ]
    patch(rd_path, rd_marker, rd_replacements, "RecordDeathScreen.tsx BID entry")

    # VillageRecordDeathScreen.tsx — placeholder only.
    vd_path = MOBILE / "src/screens/village/VillageRecordDeathScreen.tsx"
    vd_marker = "PATCH-BID-LOOKUP-2026"
    vd_replacements = [(
        'placeholder="National ID or full name"',
        'placeholder="Birth ID (BID) or full name"  /* PATCH-BID-LOOKUP-2026 */',
    )]
    patch(vd_path, vd_marker, vd_replacements, "VillageRecordDeathScreen.tsx BID wording")

    # RegisterMarriageScreen.tsx — label + placeholder.
    rm_path = MOBILE / "src/screens/village/RegisterMarriageScreen.tsx"
    rm_marker = "PATCH-BID-LOOKUP-2026"
    rm_replacements = [(
        "      <Text style={{ fontSize: 12, fontWeight: '600', color: T.textSub, marginBottom: 6 }}>\n"
        "        {label} National ID *\n"
        "      </Text>\n"
        "      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>\n"
        "        <TextInput\n"
        "          style={{\n"
        "            flex: 1,\n"
        "            borderWidth: 1,\n"
        "            borderRadius: 10,\n"
        "            paddingHorizontal: 14,\n"
        "            paddingVertical: 12,\n"
        "            fontSize: 14,\n"
        "            backgroundColor: T.card2,\n"
        "            borderColor: T.border,\n"
        "            color: T.text,\n"
        "          }}\n"
        "          value={nid}\n"
        "          onChangeText={setNid}\n"
        '          placeholder="YYYYMMDD-LLLLL-SSSSS-CC"\n',
        "      {/* PATCH-BID-LOOKUP-2026: husband/wife are now looked up by Birth ID (BID) */}\n"
        "      <Text style={{ fontSize: 12, fontWeight: '600', color: T.textSub, marginBottom: 6 }}>\n"
        "        {label} Birth ID (BID) *\n"
        "      </Text>\n"
        "      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>\n"
        "        <TextInput\n"
        "          style={{\n"
        "            flex: 1,\n"
        "            borderWidth: 1,\n"
        "            borderRadius: 10,\n"
        "            paddingHorizontal: 14,\n"
        "            paddingVertical: 12,\n"
        "            fontSize: 14,\n"
        "            backgroundColor: T.card2,\n"
        "            borderColor: T.border,\n"
        "            color: T.text,\n"
        "          }}\n"
        "          value={nid}\n"
        "          onChangeText={(raw) => setNid(raw.toUpperCase())}\n"
        '          placeholder="BID-XXXXXXXXXX"\n',
    )]
    patch(rm_path, rm_marker, rm_replacements, "RegisterMarriageScreen.tsx BID entry")


# ════════════════════════════════════════════════════════════════════════
# 12. backend/src/routes/admin.js — no more email/token, default password
# ════════════════════════════════════════════════════════════════════════
def patch_admin_js_registration():
    print("\n[12/14] backend/src/routes/admin.js — registration overhaul")
    path = BACKEND / "src/routes/admin.js"
    marker = "PATCH-NOTOKEN-2026"

    replacements = []

    # Drop the email import; add a default-password helper next to
    # generateAuthToken (which becomes unused and is removed).
    replacements.append((
        "const { sendAuthTokenEmail } = require('../lib/email')\n",
        "// PATCH-NOTOKEN-2026: no more Resend email / one-time token round-trip for\n"
        "// new accounts — see generateDefaultPassword() below.\n",
    ))
    replacements.append((
        "/** Generate a one-time authorization token (e.g. SADM-XXXX-XXXX / DADM-XXXX-XXXX). */\n"
        "function generateAuthToken(prefix) {\n"
        "  const part = () => crypto.randomInt(1000, 9999)\n"
        "  return `${prefix}-${part()}-${part()}`\n"
        "}\n",
        "// PATCH-NOTOKEN-2026: new accounts are created ACTIVE immediately with a real\n"
        "// default password (no email/token step). The admin creating the account\n"
        "// relays this password directly to the new user, who already gave the admin\n"
        "// their email address, so there's nothing left for an email round-trip to do.\n"
        "function generateDefaultPassword() {\n"
        "  const words = ['Tembo', 'Simba', 'Twiga', 'Kilimo', 'Amani', 'Jua', 'Baobab', 'Ngoma']\n"
        "  const word = words[crypto.randomInt(0, words.length)]\n"
        "  const digits = crypto.randomInt(1000, 9999)\n"
        "  return `${word}${digits}!`\n"
        "}\n",
    ))

    # district-admins
    replacements.append((
        "router.post('/district-admins', requireRole('super_admin'), async (req, res) => {\n"
        "  const { fullName, email, nidaNumber, employeeId, mobile, regionId, districtId, department } = req.body\n"
        "  if (!fullName || !email || !nidaNumber || !employeeId) {\n"
        "    return res.status(400).json({ success: false, message: 'fullName, email, nidaNumber and employeeId are required' })\n"
        "  }\n"
        "  {\n"
        "    const err = emailFormatError(email) // PATCH-EMAIL-VALIDATE-2026\n"
        "    if (err) return res.status(400).json({ success: false, message: err })\n"
        "  }\n"
        "  try {\n"
        "    const token = generateAuthToken('DADM')\n"
        "    const tokenHash = await bcrypt.hash(token, 10)\n"
        "    const created = await prisma.districtAdmin.create({\n"
        "      data: {\n"
        "        fullName, email, nidaNumber, employeeId,\n"
        "        mobile: mobile || undefined,\n"
        "        regionId: regionId ? Number(regionId) : undefined,\n"
        "        districtId: districtId ? Number(districtId) : undefined,\n"
        "        department: department || undefined,\n"
        "        status: 'pending',\n"
        "        loginTokenHash: tokenHash,\n"
        "        loginTokenExpires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),\n"
        "        createdById: req.user.id,\n"
        "      },\n"
        "      select: { id: true, fullName: true, email: true, employeeId: true, status: true },\n"
        "    })\n"
        "    await logAction(req, { action: 'create_district_admin', targetTable: 'district_admins', targetId: created.id, newData: created })\n"
        "    // PATCH-EMAIL-2025: send one-time token to newly registered district admin\n"
        "    sendAuthTokenEmail({\n"
        "      to:        email,\n"
        "      fullName,\n"
        "      token,\n"
        "      role:      'district_admin',\n"
        "      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),\n"
        "    }).catch(err => console.error('[email/district-admin]', err.message))\n"
        "    return res.json({ success: true, data: { ...created, authToken: token } })\n"
        "  } catch (err) {\n"
        "    if (err.code === 'P2002') return res.status(409).json({ success: false, message: 'A record with this email, NIDA number, or employee ID already exists' })\n"
        "    console.error('[admin/create-district-admin]', err)\n"
        "    return res.status(500).json({ success: false, message: 'Internal server error' })\n"
        "  }\n"
        "})\n",
        "router.post('/district-admins', requireRole('super_admin'), async (req, res) => {\n"
        "  const { fullName, email, birthId, employeeId, mobile, regionId, districtId, department } = req.body\n"
        "  if (!fullName || !email || !birthId || !employeeId) {\n"
        "    return res.status(400).json({ success: false, message: 'fullName, email, birthId and employeeId are required' })\n"
        "  }\n"
        "  {\n"
        "    const err = emailFormatError(email) // PATCH-EMAIL-VALIDATE-2026\n"
        "    if (err) return res.status(400).json({ success: false, message: err })\n"
        "  }\n"
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
        "    return res.json({ success: true, data: { ...created, defaultPassword } })\n"
        "  } catch (err) {\n"
        "    if (err.code === 'P2002') return res.status(409).json({ success: false, message: 'A record with this email, Birth ID, or employee ID already exists' })\n"
        "    console.error('[admin/create-district-admin]', err)\n"
        "    return res.status(500).json({ success: false, message: 'Internal server error' })\n"
        "  }\n"
        "})\n",
    ))

    # village-officers
    replacements.append((
        "router.post('/village-officers', requireRole('district_admin'), async (req, res) => {\n"
        "  const { fullName, email, nidaNumber, employeeId, mobile, villageId, wardId } = req.body\n"
        "  if (!fullName || !email || !nidaNumber || !employeeId) {\n"
        "    return res.status(400).json({ success: false, message: 'fullName, email, nidaNumber and employeeId are required' })\n"
        "  }\n"
        "  {\n"
        "    const err = emailFormatError(email) // PATCH-EMAIL-VALIDATE-2026\n"
        "    if (err) return res.status(400).json({ success: false, message: err })\n"
        "  }\n"
        "  try {\n"
        "    const adminDistrictId = await getAdminDistrictId(req)\n"
        "    const token = generateAuthToken('VOFF')\n"
        "    const tokenHash = await bcrypt.hash(token, 10)\n"
        "    const created = await prisma.villageOfficer.create({\n"
        "      data: {\n"
        "        fullName, email, nidaNumber, employeeId,\n"
        "        mobile: mobile || undefined,\n"
        "        villageId: villageId ? Number(villageId) : undefined,\n"
        "        wardId: wardId ? Number(wardId) : undefined,\n"
        "        districtId: adminDistrictId,\n"
        "        status: 'pending',\n"
        "        loginTokenHash: tokenHash,\n"
        "        loginTokenExpires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),\n"
        "        createdById: req.user.id,\n"
        "      },\n"
        "      select: { id: true, fullName: true, email: true, employeeId: true, status: true },\n"
        "    })\n"
        "    await logAction(req, { action: 'create_village_officer', targetTable: 'village_officers', targetId: created.id, newData: created })\n"
        "    return res.json({ success: true, data: { ...created, authToken: token } })\n"
        "  } catch (err) {\n"
        "    if (err.code === 'P2002') return res.status(409).json({ success: false, message: 'A record with this email, NIDA number, or employee ID already exists' })\n"
        "    console.error('[admin/create-village-officer]', err)\n"
        "    return res.status(500).json({ success: false, message: 'Internal server error' })\n"
        "  }\n"
        "})\n",
        "router.post('/village-officers', requireRole('district_admin'), async (req, res) => {\n"
        "  const { fullName, email, birthId, employeeId, mobile, villageId, wardId } = req.body\n"
        "  if (!fullName || !email || !birthId || !employeeId) {\n"
        "    return res.status(400).json({ success: false, message: 'fullName, email, birthId and employeeId are required' })\n"
        "  }\n"
        "  {\n"
        "    const err = emailFormatError(email) // PATCH-EMAIL-VALIDATE-2026\n"
        "    if (err) return res.status(400).json({ success: false, message: err })\n"
        "  }\n"
        "  try {\n"
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
        "    return res.json({ success: true, data: { ...created, defaultPassword } })\n"
        "  } catch (err) {\n"
        "    if (err.code === 'P2002') return res.status(409).json({ success: false, message: 'A record with this email, Birth ID, or employee ID already exists' })\n"
        "    console.error('[admin/create-village-officer]', err)\n"
        "    return res.status(500).json({ success: false, message: 'Internal server error' })\n"
        "  }\n"
        "})\n",
    ))

    # health-officers
    replacements.append((
        "router.post('/health-officers', requireRole('district_admin'), async (req, res) => {\n"
        "  const { fullName, email, nidaNumber, employeeId, mobile, facilityId } = req.body\n"
        "  if (!fullName || !email || !nidaNumber || !employeeId) {\n"
        "    return res.status(400).json({ success: false, message: 'fullName, email, nidaNumber and employeeId are required' })\n"
        "  }\n"
        "  {\n"
        "    const err = emailFormatError(email) // PATCH-EMAIL-VALIDATE-2026\n"
        "    if (err) return res.status(400).json({ success: false, message: err })\n"
        "  }\n"
        "  try {\n"
        "    const adminDistrictId = await getAdminDistrictId(req)\n"
        "    const token = generateAuthToken('HOFF')\n"
        "    const tokenHash = await bcrypt.hash(token, 10)\n"
        "    const created = await prisma.hospitalOfficer.create({\n"
        "      data: {\n"
        "        fullName, email, nidaNumber, employeeId,\n"
        "        mobile: mobile || undefined,\n"
        "        facilityId: facilityId ? Number(facilityId) : undefined,\n"
        "        districtId: adminDistrictId,\n"
        "        status: 'pending',\n"
        "        loginTokenHash: tokenHash,\n"
        "        loginTokenExpires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),\n"
        "        createdById: req.user.id,\n"
        "      },\n"
        "      select: { id: true, fullName: true, email: true, employeeId: true, status: true },\n"
        "    })\n"
        "    await logAction(req, { action: 'create_hospital_officer', targetTable: 'hospital_officers', targetId: created.id, newData: created })\n"
        "    return res.json({ success: true, data: { ...created, authToken: token } })\n"
        "  } catch (err) {\n"
        "    if (err.code === 'P2002') return res.status(409).json({ success: false, message: 'A record with this email, NIDA number, or employee ID already exists' })\n"
        "    console.error('[admin/create-hospital-officer]', err)\n"
        "    return res.status(500).json({ success: false, message: 'Internal server error' })\n"
        "  }\n"
        "})\n",
        "router.post('/health-officers', requireRole('district_admin'), async (req, res) => {\n"
        "  const { fullName, email, birthId, employeeId, mobile, facilityId } = req.body\n"
        "  if (!fullName || !email || !birthId || !employeeId) {\n"
        "    return res.status(400).json({ success: false, message: 'fullName, email, birthId and employeeId are required' })\n"
        "  }\n"
        "  {\n"
        "    const err = emailFormatError(email) // PATCH-EMAIL-VALIDATE-2026\n"
        "    if (err) return res.status(400).json({ success: false, message: err })\n"
        "  }\n"
        "  try {\n"
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
        "    return res.json({ success: true, data: { ...created, defaultPassword } })\n"
        "  } catch (err) {\n"
        "    if (err.code === 'P2002') return res.status(409).json({ success: false, message: 'A record with this email, Birth ID, or employee ID already exists' })\n"
        "    console.error('[admin/create-hospital-officer]', err)\n"
        "    return res.status(500).json({ success: false, message: 'Internal server error' })\n"
        "  }\n"
        "})\n",
    ))

    # super-admins
    replacements.append((
        "  const { fullName, email, nidaNumber, employeeId, mobile, department } = req.body\n"
        "  if (!fullName || !email || !nidaNumber || !employeeId) {\n"
        "    return res.status(400).json({ success: false, message: 'fullName, email, nidaNumber and employeeId are required' })\n"
        "  }\n"
        "  {\n"
        "    const err = emailFormatError(email) // PATCH-EMAIL-VALIDATE-2026\n"
        "    if (err) return res.status(400).json({ success: false, message: err })\n"
        "  }\n"
        "  try {\n"
        "    const token     = generateAuthToken('SADM')\n"
        "    const tokenHash = await bcrypt.hash(token, 10)\n"
        "    const created   = await prisma.superAdmin.create({\n"
        "      data: {\n"
        "        fullName, email, nidaNumber, employeeId,\n"
        "        mobile:     mobile     || undefined,\n"
        "        department: department || undefined,\n"
        "        status:            'pending',\n"
        "        loginTokenHash:    tokenHash,\n"
        "        loginTokenExpires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),\n"
        "        createdById:       req.user.id,\n"
        "      },\n"
        "      select: { id: true, fullName: true, email: true, employeeId: true, status: true },\n"
        "    })\n"
        "    await logAction(req, {\n"
        "      action: 'create_super_admin', targetTable: 'super_admins', targetId: created.id,\n"
        "      newData: created, severity: 'warning',\n"
        "    })\n"
        "    // PATCH-EMAIL-2025: send one-time token to newly registered super admin\n"
        "    sendAuthTokenEmail({\n"
        "      to:        email,\n"
        "      fullName,\n"
        "      token,\n"
        "      role:      'super_admin',\n"
        "      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),\n"
        "    }).catch(err => console.error('[email/super-admin]', err.message))\n"
        "    return res.json({ success: true, data: { ...created, authToken: token } })\n"
        "  } catch (err) {\n"
        "    if (err.code === 'P2002') return res.status(409).json({ success: false, message: 'A record with this email, NIDA number, or employee ID already exists' })\n"
        "    console.error('[admin/create-super-admin]', err)\n"
        "    return res.status(500).json({ success: false, message: 'Internal server error' })\n"
        "  }\n"
        "})\n",
        "  const { fullName, email, birthId, employeeId, mobile, department } = req.body\n"
        "  if (!fullName || !email || !birthId || !employeeId) {\n"
        "    return res.status(400).json({ success: false, message: 'fullName, email, birthId and employeeId are required' })\n"
        "  }\n"
        "  {\n"
        "    const err = emailFormatError(email) // PATCH-EMAIL-VALIDATE-2026\n"
        "    if (err) return res.status(400).json({ success: false, message: err })\n"
        "  }\n"
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
        "    return res.json({ success: true, data: { ...created, defaultPassword } })\n"
        "  } catch (err) {\n"
        "    if (err.code === 'P2002') return res.status(409).json({ success: false, message: 'A record with this email, Birth ID, or employee ID already exists' })\n"
        "    console.error('[admin/create-super-admin]', err)\n"
        "    return res.status(500).json({ success: false, message: 'Internal server error' })\n"
        "  }\n"
        "})\n",
    ))

    patch(path, marker, replacements, "admin.js registration — no email/token, default password")


# ════════════════════════════════════════════════════════════════════════
# 13. backend/src/routes/auth.js — remove /validate-token
# ════════════════════════════════════════════════════════════════════════
def patch_auth_js():
    print("\n[13/14] backend/src/routes/auth.js — remove /validate-token")
    path = BACKEND / "src/routes/auth.js"
    marker = "PATCH-NOTOKEN-2026"

    replacements = [(
        "// ── POST /api/auth/validate-token ─────────────────────────────────────────────\n"
        "// PATCH-EMAIL-2025\n"
        "// Called by the LoginPage token-authorization flow.\n"
        "// Body: { token: string }\n"
        "// Returns: { valid: true, role, userId } on success, 401 on failure.\n"
        "router.post('/validate-token', authLimiter, async (req, res) => {\n"
        "  const { token } = req.body\n"
        "  if (!token || typeof token !== 'string' || token.trim().length < 6) {\n"
        "    return res.status(400).json({ success: false, message: 'token is required' })\n"
        "  }\n"
        "  const t = token.trim().toUpperCase()\n"
        "\n"
        "  // Determine which table to search based on prefix\n"
        "  const ROLE_TABLES = [\n"
        "    { prefix: 'SADM', model: 'superAdmin',    role: 'super_admin' },\n"
        "    { prefix: 'DADM', model: 'districtAdmin', role: 'district_admin' },\n"
        "    { prefix: 'VOFF', model: 'villageOfficer', role: 'village_officer' },\n"
        "    { prefix: 'HOFF', model: 'hospitalOfficer', role: 'hospital_officer' },\n"
        "  ]\n"
        "\n"
        "  const match = ROLE_TABLES.find(r => t.startsWith(r.prefix))\n"
        "  if (!match) {\n"
        "    return res.status(401).json({ success: false, message: 'Unknown token prefix. Expected SADM-, DADM-, VOFF-, or HOFF-.' })\n"
        "  }\n"
        "\n"
        "  try {\n"
        "    const bcrypt = require('bcryptjs')\n"
        "    // Fetch all candidates with a non-expired token (avoid hashing every row)\n"
        "    const candidates = await prisma[match.model].findMany({\n"
        "      where: {\n"
        "        loginTokenExpires: { gte: new Date() },\n"
        "        loginTokenHash:    { not: null },\n"
        "      },\n"
        "      select: { id: true, loginTokenHash: true, status: true },\n"
        "    })\n"
        "\n"
        "    let found = null\n"
        "    for (const c of candidates) {\n"
        "      if (await bcrypt.compare(t, c.loginTokenHash)) { found = c; break }\n"
        "    }\n"
        "\n"
        "    if (!found) {\n"
        "      return res.status(401).json({ success: false, message: 'Invalid or expired authorization token.' })\n"
        "    }\n"
        "\n"
        "    // PATCH-TOKEN-SINGLEUSE-2026: a token is single-use. Clear it the moment it's\n"
        "    // successfully validated so it can't be replayed by anyone who\n"
        "    // intercepts it later, even though it's not yet at its 7-day\n"
        "    // expiry. The account record itself is untouched; the officer/\n"
        "    // admin will need a fresh token issued if they ever need another\n"
        "    // one-time login link.\n"
        "    await prisma[match.model].update({\n"
        "      where: { id: found.id },\n"
        "      data: { loginTokenHash: null, loginTokenExpires: null },\n"
        "    })\n"
        "\n"
        "    return res.json({ success: true, role: match.role, userId: found.id })\n"
        "  } catch (err) {\n"
        "    console.error('[auth/validate-token]', err)\n"
        "    return res.status(500).json({ success: false, message: 'Internal server error' })\n"
        "  }\n"
        "})\n"
        "\n"
        "module.exports = router\n",
        "// PATCH-NOTOKEN-2026: /validate-token removed. New accounts are created\n"
        "// active with a default password (see admin.js) — there's no token left to\n"
        "// validate, and login goes straight through the normal POST /login above.\n"
        "\n"
        "module.exports = router\n",
    )]
    patch(path, marker, replacements, "auth.js remove validate-token")


# ════════════════════════════════════════════════════════════════════════
# 14. web: admin.api.js, NewRegistrationModal.jsx, LoginPage.jsx
# ════════════════════════════════════════════════════════════════════════
def patch_web_admin_api():
    path = WEB / "src/api/admin.api.js"
    marker = "PATCH-NOTOKEN-2026"
    replacements = [(
        "// ── Token validation ────────────────────────────────────────────────────────────\n"
        "export async function apiValidateToken(token) {\n"
        "  const { data } = await apiClient.post('/auth/validate-token', { token })\n"
        "  return data\n"
        "}\n"
        "\n",
        "// PATCH-NOTOKEN-2026: apiValidateToken removed — accounts are created active\n"
        "// with a default password now, no token round-trip to validate.\n"
        "\n",
    )]
    patch(path, marker, replacements, "admin.api.js remove apiValidateToken")


def patch_new_registration_modal():
    path = WEB / "src/modals/NewRegistrationModal.jsx"
    marker = "PATCH-NOTOKEN-2026"
    replacements = [
        (
            "/**\n"
            " * NewRegistrationModal.jsx — Register a new admin / officer account\n"
            " *\n"
            " * Super Admin → registers a District Admin (POST /api/admin/district-admins)\n"
            " * District Admin → registers a Village Officer or Health Officer\n"
            " *                   (POST /api/admin/village-officers | /health-officers)\n"
            " *\n"
            " * On success the server returns a one-time authorization token\n"
            " * (e.g. DADM-1234-5678) which the new user enters on first login.\n"
            " */\n",
            "/**\n"
            " * NewRegistrationModal.jsx — Register a new admin / officer account\n"
            " *\n"
            " * Super Admin → registers a District Admin (POST /api/admin/district-admins)\n"
            " * District Admin → registers a Village Officer or Health Officer\n"
            " *                   (POST /api/admin/village-officers | /health-officers)\n"
            " *\n"
            " * PATCH-NOTOKEN-2026: the account is created ACTIVE immediately. On success\n"
            " * the server returns a real default password — share it with the new user\n"
            " * directly (their email is already known, since the admin just typed it in)\n"
            " * so they can log in right away and start working.\n"
            " */\n",
        ),
        (
            "    fullName: '', email: '', nidaNumber: '', employeeId: '', mobile: '',\n",
            "    fullName: '', email: '', birthId: '', employeeId: '', mobile: '',\n",
        ),
        (
            "    if (!form.fullName || !form.email || !form.nidaNumber || !form.employeeId) {\n"
            "      setError('Full name, email, NIDA number and employee ID are required'); return\n"
            "    }\n",
            "    if (!form.fullName || !form.email || !form.birthId || !form.employeeId) {\n"
            "      setError('Full name, email, Birth ID and employee ID are required'); return\n"
            "    }\n",
        ),
        (
            "        res = await apiCreateSuperAdmin({\n"
            "          fullName: form.fullName, email: form.email, nidaNumber: form.nidaNumber,\n"
            "          employeeId: form.employeeId, mobile: form.mobile,\n"
            "          department: form.department || undefined,\n"
            "        })\n",
            "        res = await apiCreateSuperAdmin({\n"
            "          fullName: form.fullName, email: form.email, birthId: form.birthId,\n"
            "          employeeId: form.employeeId, mobile: form.mobile,\n"
            "          department: form.department || undefined,\n"
            "        })\n",
        ),
        (
            "        res = await apiCreateDistrictAdmin({\n"
            "          fullName: form.fullName, email: form.email, nidaNumber: form.nidaNumber,\n"
            "          employeeId: form.employeeId, mobile: form.mobile,\n"
            "          regionId: form.regionId || undefined, districtId: form.districtId || undefined,\n"
            "        })\n",
            "        res = await apiCreateDistrictAdmin({\n"
            "          fullName: form.fullName, email: form.email, birthId: form.birthId,\n"
            "          employeeId: form.employeeId, mobile: form.mobile,\n"
            "          regionId: form.regionId || undefined, districtId: form.districtId || undefined,\n"
            "        })\n",
        ),
        (
            "        res = await apiCreateVillageOfficer({\n"
            "          fullName: form.fullName, email: form.email, nidaNumber: form.nidaNumber,\n"
            "          employeeId: form.employeeId, mobile: form.mobile,\n"
            "          wardId: form.wardId || undefined, villageId: form.villageId || undefined,\n"
            "        })\n",
            "        res = await apiCreateVillageOfficer({\n"
            "          fullName: form.fullName, email: form.email, birthId: form.birthId,\n"
            "          employeeId: form.employeeId, mobile: form.mobile,\n"
            "          wardId: form.wardId || undefined, villageId: form.villageId || undefined,\n"
            "        })\n",
        ),
        (
            "        res = await apiCreateHealthOfficer({\n"
            "          fullName: form.fullName, email: form.email, nidaNumber: form.nidaNumber,\n"
            "          employeeId: form.employeeId, mobile: form.mobile,\n"
            "        })\n",
            "        res = await apiCreateHealthOfficer({\n"
            "          fullName: form.fullName, email: form.email, birthId: form.birthId,\n"
            "          employeeId: form.employeeId, mobile: form.mobile,\n"
            "        })\n",
        ),
        (
            "  function copyToken() {\n"
            "    if (!result?.authToken) return\n"
            "    navigator.clipboard.writeText(result.authToken).then(() => {\n"
            "      setCopied(true); setTimeout(() => setCopied(false), 1500)\n"
            "    })\n"
            "  }\n",
            "  // PATCH-NOTOKEN-2026: copy the default password instead of a one-time token.\n"
            "  function copyToken() {\n"
            "    if (!result?.defaultPassword) return\n"
            "    navigator.clipboard.writeText(result.defaultPassword).then(() => {\n"
            "      setCopied(true); setTimeout(() => setCopied(false), 1500)\n"
            "    })\n"
            "  }\n",
        ),
        (
            "              <label className={lbl}>NIDA Number</label>\n"
            '                <input className={inp} value={form.nidaNumber} onChange={e => set(\'nidaNumber\', e.target.value)} placeholder="19900101-07001-00001-21" />\n',
            "              <label className={lbl}>Birth ID (BID)</label>\n"
            '                <input className={inp} value={form.birthId} onChange={e => set(\'birthId\', e.target.value.toUpperCase())} placeholder="BID-7F3K9QXTZ2" />\n',
        ),
        (
            "            <p className=\"text-gray-500 text-xs\">\n"
            "              Status: <span className=\"text-yellow-400 uppercase\">{result.status}</span> — share this one-time\n"
            "              authorization token so they can complete their profile on first login.\n"
            "            </p>\n"
            "            <div\n"
            "              onClick={copyToken}\n"
            "              className=\"flex items-center gap-2 bg-[#0a1628] border border-[#1a3060] rounded-lg px-3 py-2 cursor-pointer hover:border-[#00d4ff]/40 transition-colors\"\n"
            "            >\n"
            "              <code className=\"text-[#00d4ff] text-sm font-mono flex-1 tracking-widest\">{result.authToken}</code>\n"
            "              <Copy size={13} className=\"text-gray-500\" />\n"
            "              {copied && <span className=\"text-[#00ff9d] text-[10px]\">Copied</span>}\n"
            "            </div>\n",
            "            <p className=\"text-gray-500 text-xs\">\n"
            "              Status: <span className=\"text-[#00ff9d] uppercase\">{result.status}</span> — share this default\n"
            "              password with them directly. They can log in right away with their email and this password,\n"
            "              and should change it after first login.\n"
            "            </p>\n"
            "            <div\n"
            "              onClick={copyToken}\n"
            "              className=\"flex items-center gap-2 bg-[#0a1628] border border-[#1a3060] rounded-lg px-3 py-2 cursor-pointer hover:border-[#00d4ff]/40 transition-colors\"\n"
            "            >\n"
            "              <code className=\"text-[#00d4ff] text-sm font-mono flex-1 tracking-widest\">{result.defaultPassword}</code>\n"
            "              <Copy size={13} className=\"text-gray-500\" />\n"
            "              {copied && <span className=\"text-[#00ff9d] text-[10px]\">Copied</span>}\n"
            "            </div>\n",
        ),
    ]
    patch(path, marker, replacements, "NewRegistrationModal.jsx birthId + default password")


def rewrite_login_page():
    path = WEB / "src/pages/LoginPage.jsx"
    marker = "PATCH-NOTOKEN-2026"
    content = '''/**
 * LoginPage.jsx — TzCRVS Secure Login
 *
 * PATCH-NOTOKEN-2026: the "Authorization Token" / first-login onboarding
 * flow (token → MFA setup choice → QR → profile-completion form) has been
 * removed. It was never wired to a real backend action for the MFA/profile
 * steps, and it's no longer needed at all: accounts created by an admin are
 * now active immediately with a real default password (see admin.js /
 * NewRegistrationModal.jsx), so every user — brand new or returning — just
 * logs in here with email + password like normal, then real TOTP MFA
 * verification if their account has it enabled.
 *
 * Integration: real API calls via apiLogin / apiMfaVerify
 *              zustand auth store (setAuth)
 *              react-router-dom navigation by role
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Eye, EyeOff, Lock, Mail, Shield, ChevronRight, RefreshCw,
  MapPin, Smartphone, AlertCircle,
} from 'lucide-react'

import { useAuthStore }           from '../store/authStore'
import { apiLogin, apiMfaVerify } from '../api/auth.api'

// ── Role → route mapping ───────────────────────────────────────────────────────
const ROLE_ROUTE = {
  super_admin:      '/super-admin',
  district_admin:   '/district-admin',
  village_officer:  '/village-officer',
  hospital_officer: '/hospital-officer',
  public_user:      '/public',
}

export default function LoginPage({ onLogin, _adminType = null }) {
if (_adminType) {
  // Future implementation goes here
}
  const navigate     = useNavigate()
  const { setAuth }  = useAuthStore()

  // ── UI mode state ────────────────────────────────────────────────────────────
  const [mode,      setMode]      = useState('login') // 'login' | 'mfa_verify'

  // ── Form field state ─────────────────────────────────────────────────────────
  const [email,     setEmail]     = useState('')
  const [password,  setPassword]  = useState('')
  const [showPass,  setShowPass]  = useState(false)
  const [mfaCode,   setMfaCode]   = useState('')
  const [tempToken, setTempToken] = useState(null) // from server when MFA required

  // ── Shared feedback state ─────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  // ── Route helper — navigate by role returned from API ────────────────────────
  function navigateByRole(role) {
    const route = ROLE_ROUTE[role] || '/login'
    navigate(route, { replace: true })
    onLogin?.()
  }

  // ── Handlers ─────────────────────────────────────────────────────────────────

  /** Step 1: email + password → real API */
  async function handleLogin() {
    if (!email.includes('@'))  { setError('Enter a valid email'); return }
    if (password.length < 4)   { setError('Enter your password'); return }
    setError(''); setLoading(true)
    try {
      const result = await apiLogin(email, password)

      if (result.mfaRequired) {
        // MFA is enabled on this account — go to TOTP verification screen
        setTempToken(result.tempToken)
        setMode('mfa_verify')
      } else {
        setAuth({
          user:         result.profile,
          role:         result.profile.role,
          accessToken:  result.accessToken,
          refreshToken: result.refreshToken,
        })
        navigateByRole(result.profile.role)
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Invalid email or password'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  /** Step 2 (MFA path): TOTP code → real API */
  async function handleMfaVerify() {
    if (mfaCode.length < 6) { setError('Enter the 6-digit TOTP code'); return }
    setError(''); setLoading(true)
    try {
      const result = await apiMfaVerify(tempToken, mfaCode)
      setAuth({
        user:         result.profile,
        role:         result.profile.role,
        accessToken:  result.accessToken,
        refreshToken: result.refreshToken,
      })
      navigateByRole(result.profile.role)
    } catch (err) {
      const msg = err.response?.data?.message || 'Invalid or expired MFA code'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  // ── Shared field styles (exactly as designed) ─────────────────────────────────
  const inp = 'w-full bg-[#060f1e] border border-[#1e3a5f] rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-700 outline-none focus:border-[#00d4ff]/50 transition-colors'
  const lbl = 'text-[10px] text-gray-400 uppercase tracking-widest mb-1.5 block'

  const modeTitle = {
    login:      'Secure Login',
    mfa_verify: 'MFA Verification',
  }
  const modeSub = {
    login:      'Enter credentials to access your dashboard',
    mfa_verify: 'Enter the 6-digit code from your authenticator app',
  }

  return (
    <div className="min-h-screen flex" style={{ fontFamily: "'Inter',sans-serif" }}>

      {/* LEFT: Branding */}
      <div className="w-1/2 relative flex-col items-center justify-between py-10 overflow-hidden hidden md:flex">
        <div className="absolute inset-0 z-0">
          <img src="/assets/flag.jpg" alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/55" />
        </div>
        <div className="relative z-10 flex flex-col items-center justify-center flex-1 text-white text-center px-10">
          <p className="text-[10px] font-bold text-yellow-300 tracking-[0.22em] uppercase mb-5">
            The United Republic Government of Tanzania
          </p>
          <div className="w-36 h-36 rounded-full border-4 border-white/40 bg-white/10 backdrop-blur-sm flex items-center justify-center mb-5 shadow-2xl">
            <img src="/assets/court_of_arm.png" alt="CoA" className="w-28 h-28 object-contain drop-shadow-xl" />
          </div>
          <div className="w-20 h-0.5 bg-yellow-400 mx-auto mb-4" />
          <h1 className="text-2xl font-extrabold tracking-wide drop-shadow mb-8">TZCRVS</h1>
          <div className="w-20 h-20 rounded-2xl border-2 border-white/30 bg-transparent flex items-center justify-center mb-6">
            <img src="/assets/longo_nbs.png" alt="NBS" className="w-14 h-14 object-contain drop-shadow-xl" />
          </div>
          <p className="text-sm italic text-yellow-200/80">&ldquo;Statistics for Development&rdquo;</p>
        </div>
        <p className="relative z-10 text-[10px] text-white/30">
          © 2026 TzCRVS · All rights reserved
        </p>
      </div>

      {/* RIGHT: Auth panel */}
      <div className="flex-1 md:w-1/2 flex items-center justify-center bg-[#060f1e] overflow-y-auto py-8">
        <div className="w-full max-w-sm px-6">

          <div className="bg-[#0d1f38] border border-[#1e3a5f] rounded-2xl shadow-2xl overflow-hidden">

            {/* Header */}
            <div className="text-center px-8 pt-8 pb-5">
              <div className="w-12 h-12 rounded-xl bg-[#00d4ff]/10 border border-[#00d4ff]/30 flex items-center justify-center mx-auto mb-4">
                {mode === 'mfa_verify'
                  ? <Smartphone size={22} className="text-[#00d4ff]" />
                  : <Shield size={22} className="text-[#00d4ff]" />}
              </div>
              <h2 className="text-white font-bold text-base">{modeTitle[mode]}</h2>
              <p className="text-gray-500 text-xs mt-1">{modeSub[mode]}</p>
            </div>

            <div className="px-8 pb-8 space-y-4">

              {/* ── LOGIN ─────────────────────────────────────────────── */}
              {mode === 'login' && (<>
                <div>
                  <label className={lbl}>Email Address</label>
                  <div className="relative">
                    <Mail size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
                    <input
                      type="email"
                      value={email}
                      placeholder="official@nbs.go.tz"
                      onChange={e => { setEmail(e.target.value); setError('') }}
                      className={inp.replace('px-4', 'pl-9 pr-4')}
                    />
                  </div>
                </div>
                <div>
                  <label className={lbl}>Password</label>
                  <div className="relative">
                    <Lock size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
                    <input
                      type={showPass ? 'text' : 'password'}
                      value={password}
                      placeholder="••••••••"
                      onChange={e => { setPassword(e.target.value); setError('') }}
                      className={inp.replace('px-4', 'pl-9 pr-10')}
                    />
                    <button
                      onClick={() => setShowPass(!showPass)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-300"
                    >
                      {showPass ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                  </div>
                </div>
                {error && (
                  <p className="text-red-400 text-[10px] flex items-center gap-1">
                    <AlertCircle size={10} />{error}
                  </p>
                )}
                <button
                  onClick={handleLogin}
                  className="w-full py-3 rounded-xl font-bold text-sm bg-gradient-to-r from-[#00d4ff] to-[#0088bb] text-[#060f1e] flex items-center justify-center gap-2 hover:opacity-90 transition-all"
                >
                  {loading
                    ? <RefreshCw size={15} className="animate-spin" />
                    : <><span>Sign In</span><ChevronRight size={15} /></>}
                </button>
                <p className="text-center text-[10px] text-gray-600">
                  New accounts are set up by your administrator — you'll be given a default password to sign in with.
                </p>
              </>)}

              {/* ── MFA VERIFY (returning users with MFA enabled) ────── */}
              {mode === 'mfa_verify' && (<>
                <div className="p-3 rounded-lg border border-[#00d4ff]/20 bg-[#00d4ff]/5">
                  <p className="text-[#00d4ff] text-xs">
                    Open Google Authenticator and enter the 6-digit TOTP code for NBS-TzCRVS.
                  </p>
                </div>
                <div>
                  <label className={lbl}>6-Digit TOTP Code</label>
                  <input
                    type="text"
                    value={mfaCode}
                    placeholder="000 000"
                    maxLength={6}
                    onChange={e => { setMfaCode(e.target.value.replace(/\\D/g, '')); setError('') }}
                    className={`${inp} tracking-[0.6em] text-center text-lg font-mono`}
                  />
                </div>
                {error && (
                  <p className="text-red-400 text-[10px] flex items-center gap-1">
                    <AlertCircle size={10} />{error}
                  </p>
                )}
                <button
                  onClick={handleMfaVerify}
                  className="w-full py-3 rounded-xl font-bold text-sm bg-gradient-to-r from-[#00d4ff] to-[#0088bb] text-[#060f1e] flex items-center justify-center gap-2 hover:opacity-90 transition-all"
                >
                  {loading
                    ? <RefreshCw size={15} className="animate-spin" />
                    : <><span>Verify &amp; Login</span><ChevronRight size={15} /></>}
                </button>
                <button
                  onClick={() => { setMode('login'); setError('') }}
                  className="w-full text-center text-[11px] text-gray-500 hover:text-white"
                >
                  ← Back
                </button>
              </>)}

            </div>
          </div>

          <div className="text-center mt-5 space-y-1">
            <div className="flex items-center justify-center gap-1.5 text-gray-600">
              <MapPin size={11} />
              <span className="text-[10px]">NBS Head Office · Dodoma, Tanzania</span>
            </div>
            <p className="text-[9px] text-gray-700">Unauthorized access is prohibited and monitored</p>
          </div>
        </div>
      </div>
    </div>
  )
}
'''
    overwrite(path, content, marker, "LoginPage.jsx (removed token/mock onboarding flow)")


def patch_auth_test():
    path = BACKEND / "tests/auth.test.js"
    marker = "PATCH-NOTOKEN-2026"
    replacements = [(
        "  nidaNumber:      '19900101-00001-00001-01',\n",
        "  birthId:         'BID-TESTADMIN01', // PATCH-NOTOKEN-2026\n",
    )]
    patch(path, marker, replacements, "auth.test.js mock field rename")


def main():
    print("=" * 78)
    print("ADLCS PATCH #2 — Privacy-safe IDs, Birth-ID lookups, no-token registration")
    print("=" * 78)

    if not CODE.exists():
        print(f"\nERROR: {CODE} does not exist.")
        print("Run this script from the ADLCS project root (the folder containing `code/`).")
        sys.exit(1)

    patch_schema()
    create_manual_sql()
    patch_village_js()
    patch_dashboard_js()
    patch_seed_js()
    patch_local_db()
    patch_nin_registration_screen()
    patch_register_citizen_screen()
    patch_citizen_profile_screen()
    patch_migration_mobile_screens()
    patch_birth_death_marriage_screens()
    patch_admin_js_registration()
    patch_auth_js()
    patch_web_admin_api()
    patch_new_registration_modal()
    rewrite_login_page()
    patch_auth_test()

    print("\n" + "=" * 78)
    if FAILURES:
        print(f"DONE WITH {len(FAILURES)} ISSUE(S) — review the [FAIL] lines above:")
        for f in FAILURES:
            print(f"  - {f}")
        sys.exit(1)
    else:
        print("DONE — all patches applied successfully.")
        print("\nNext steps:")
        print("  1. Run the new SQL in prisma/manual_sql/2026_08_birth_id_and_registration.sql")
        print("     against your Supabase DB (this repo doesn't use `prisma migrate`).")
        print("  2. cd code/backend && npx prisma generate")
        print("  3. Re-seed test data if you want the new test BIDs: node prisma/seed.js")
        print("  4. Rebuild/reload the mobile app and web admin dashboard.")
    print("=" * 78)


if __name__ == "__main__":
    main()
