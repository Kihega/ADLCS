#!/usr/bin/env python3
"""
patch_migration_flow.py
────────────────────────────────────────────────────────────────────────────
Run this from the ADLCS project ROOT (the folder that contains `code/`).

    cd ADLCS
    python3 patch_migration_flow.py

WHAT THIS PATCH DOES
─────────────────────

1) MIGRATION FLOW REWORK (PATCH-MIGFLOW-2026)
   - Tapping "Migrate" on the Village Officer home screen now opens a new
     first screen (MigrationHomeScreen) that asks: Outgoing Citizen or
     Incoming Citizen — the same "pick your case first" shape already used
     elsewhere in the app.
       • Outgoing Citizen  -> existing TrackMigrationScreen (officer sends a
         resident of THEIR OWN village to a destination village/street).
       • Incoming Citizen  -> new ConfirmIncomingMigrationScreen. The
         destination officer asks the arriving citizen for their NIN (for
         demographic lookup) and the migration token issued by the source
         officer, and confirms the move on the spot.
   - When an outgoing migration is issued, the backend now generates a
     MIGRATION TOKEN (e.g. TZM-7K9P2Q) valid for exactly ONE WEEK. The
     token is shown to the officer to hand to the citizen. If the citizen
     doesn't get confirmed within a week, the request is lazily flipped to
     'expired' the next time anything touches it, and the citizen must ask
     the source officer to issue the migration again.
   - New endpoint: POST /api/village/migration/confirm — takes
     { nationalId, migrationToken }; finalises the migration if both match,
     the token hasn't expired, and the confirming officer's own village is
     the request's destination.
   - The legacy pending-requests inbox (MigrationRequestsScreen, approve /
     reject) is kept working and reachable from the new first screen too,
     now also showing the token + expiry and correctly refusing expired
     requests.

2) DASHBOARD CHARTS — WEEKLY BREAKDOWN + YEAR/MONTH FILTER
   - The RITA (births/deaths/marriages), NIDA (NIN issuance), and Migration
     Trends cards on the admin dashboard now show a Year + Month filter.
     The bars below re-chart to Week 1..Week 5 of whichever month/year is
     selected (defaulting to the current month), instead of one bar per
     calendar month across the whole dataset. The vertical axis stays a
     plain count/quantity of recorded cases, as before.

This script is idempotent — safe to run more than once. It uses exact
text-anchor replacements against the code as shipped; if the code has
since diverged it will stop and tell you exactly which anchor it could not
find rather than silently doing nothing or corrupting a file.
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
    """Apply a list of (old, new) exact-text replacements to `path`.

    Skips (no-ops) if `marker` is already present in the file (already
    patched). Records a failure if any anchor can't be found so the run
    summary makes it obvious what needs manual attention.
    """
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
            print(f"  [FAIL] {label}: anchor not found (showing first 60 chars):")
            print(f"         {old[:60]!r}")
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


# ════════════════════════════════════════════════════════════════════════
# 1. PRISMA SCHEMA — add migrationToken column
# ════════════════════════════════════════════════════════════════════════
def patch_schema():
    print("\n[1/9] prisma/schema.prisma — migrationToken field")
    path = BACKEND / "prisma/schema.prisma"
    patch(
        path,
        marker="migrationToken",
        replacements=[
            (
                '  expiryDate      DateTime        @map("expiry_date")\n'
                '  confirmedDate   DateTime?       @map("confirmed_date")\n',
                '  expiryDate      DateTime        @map("expiry_date")\n'
                '  migrationToken  String?         @unique @map("migration_token")\n'
                '  confirmedDate   DateTime?       @map("confirmed_date")\n',
            ),
        ],
        label="schema.prisma Migration model",
    )


# ════════════════════════════════════════════════════════════════════════
# 2. Manual SQL for the live Supabase DB (this repo doesn't use
#    `prisma migrate` — see prisma/manual_sql/*.sql convention already
#    in the repo).
# ════════════════════════════════════════════════════════════════════════
def create_manual_sql():
    print("\n[2/9] prisma/manual_sql/2026_08_migration_token.sql")
    path = BACKEND / "prisma/manual_sql/2026_08_migration_token.sql"
    content = """-- 2026_08_migration_token.sql
-- Run this in the Supabase SQL editor (or `psql` against DATABASE_URL).
-- Adds the migration_token column used by the new Incoming/Outgoing
-- migration confirmation flow (PATCH-MIGFLOW-2026). Safe to run more than
-- once.

BEGIN;

ALTER TABLE "migrations"
  ADD COLUMN IF NOT EXISTS "migration_token" VARCHAR(20);

CREATE UNIQUE INDEX IF NOT EXISTS "migrations_migration_token_key"
  ON "migrations" ("migration_token");

COMMIT;

-- AFTER running the above in Supabase, on your machine run:
--   cd code/backend
--   npx prisma generate
"""
    create_if_missing(path, content, "manual_sql migration_token")


# ════════════════════════════════════════════════════════════════════════
# 3. backend/src/routes/village.js
# ════════════════════════════════════════════════════════════════════════
def patch_village_js():
    print("\n[3/9] backend/src/routes/village.js")
    path = BACKEND / "src/routes/village.js"
    marker = "PATCH-MIGFLOW-2026"

    replacements = []

    # 3a. dashboard: add incomingMigrationsPending count (powers the bell
    # badge that VillageHomeScreen already reads).
    replacements.append((
        "    const [totalCitizens, monthDeaths, todayDeaths, todayCitizens, pendingCases] = await Promise.all([\n"
        "      prisma.citizen.count({ where:{ currentVillageId:vid } }),\n"
        "      prisma.death.count({ where:{ villageOfficerId:id, registeredAt:{ gte:monthStart } } }).catch(()=>0),\n"
        "      prisma.death.count({ where:{ villageOfficerId:id, registeredAt:{ gte:dayStart, lte:dayEnd } } }).catch(()=>0),\n"
        "      prisma.citizen.count({ where:{ registeredById:id, registeredAt:{ gte:dayStart, lte:dayEnd } } }).catch(()=>0),\n"
        "      prisma.citizen.count({ where:{ currentVillageId:vid, vitalStatus:'alive', idCardIssued:null } }).catch(()=>0),\n"
        "    ])\n"
        "\n"
        "    return res.json({\n"
        "      success:true,\n"
        "      data:{\n"
        "        officerName:    officer.fullName,\n"
        "        employeeId:     officer.employeeId ?? '',\n"
        "        villageName:    officer.village?.name ?? 'Unknown Village',\n"
        "        wardName:       officer.ward?.name    ?? 'Unknown Ward',\n"
        "        totalCitizens,\n"
        "        todayBirths:    todayCitizens,\n"
        "        todayDeaths,\n"
        "        monthBirths:    0,\n"
        "        monthDeaths,\n"
        "        pendingCases,\n"
        "      },\n"
        "    })",
        "    // PATCH-MIGFLOW-2026: incomingMigrationsPending powers the bell badge\n"
        "    // on VillageHomeScreen — migration requests awaiting this officer.\n"
        "    const [totalCitizens, monthDeaths, todayDeaths, todayCitizens, pendingCases, incomingMigrationsPending] = await Promise.all([\n"
        "      prisma.citizen.count({ where:{ currentVillageId:vid } }),\n"
        "      prisma.death.count({ where:{ villageOfficerId:id, registeredAt:{ gte:monthStart } } }).catch(()=>0),\n"
        "      prisma.death.count({ where:{ villageOfficerId:id, registeredAt:{ gte:dayStart, lte:dayEnd } } }).catch(()=>0),\n"
        "      prisma.citizen.count({ where:{ registeredById:id, registeredAt:{ gte:dayStart, lte:dayEnd } } }).catch(()=>0),\n"
        "      prisma.citizen.count({ where:{ currentVillageId:vid, vitalStatus:'alive', idCardIssued:null } }).catch(()=>0),\n"
        "      prisma.migration.count({ where:{ targetOfficerId:id, status:'pending' } }).catch(()=>0),\n"
        "    ])\n"
        "\n"
        "    return res.json({\n"
        "      success:true,\n"
        "      data:{\n"
        "        officerName:    officer.fullName,\n"
        "        employeeId:     officer.employeeId ?? '',\n"
        "        villageName:    officer.village?.name ?? 'Unknown Village',\n"
        "        wardName:       officer.ward?.name    ?? 'Unknown Ward',\n"
        "        totalCitizens,\n"
        "        todayBirths:    todayCitizens,\n"
        "        todayDeaths,\n"
        "        monthBirths:    0,\n"
        "        monthDeaths,\n"
        "        pendingCases,\n"
        "        incomingMigrationsPending,\n"
        "      },\n"
        "    })",
    ))

    # 3b. helpers: token generator + lazy-expiry, inserted just before the
    # existing "Migration helpers" comment block.
    replacements.append((
        "// ── Migration helpers ───────────────────────────────────────────────────────────\n"
        "// Finds an officer to notify/approve a migration into `villageId`. Prefers an",
        "// ── migration token + lazy-expiry helpers (PATCH-MIGFLOW-2026) ─────────────────\n"
        "// Short human-readable code the source officer reads out / writes down for the\n"
        "// citizen. Format: TZM-XXXXXX, ambiguous characters (0/O/1/I) excluded so it's\n"
        "// easy to relay verbally or on paper.\n"
        "function genMigrationToken() {\n"
        "  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'\n"
        "  let code = ''\n"
        "  for (let i = 0; i < 6; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)]\n"
        "  return `TZM-${code}`\n"
        "}\n"
        "\n"
        "// A migration request is only valid for ONE WEEK from issuance. If that window\n"
        "// has passed and it is still 'pending', it is lazily flipped to 'expired' the\n"
        "// next time it's touched (list, respond, or confirm) — the citizen must ask the\n"
        "// source village officer to issue a fresh one.\n"
        "async function expireIfDue(migration) {\n"
        "  if (migration.status === 'pending' && new Date(migration.expiryDate) < new Date()) {\n"
        "    await prisma.migration.update({ where: { id: migration.id }, data: { status: 'expired' } })\n"
        "    return true\n"
        "  }\n"
        "  return false\n"
        "}\n"
        "\n"
        "// ── Migration helpers ───────────────────────────────────────────────────────────\n"
        "// Finds an officer to notify/approve a migration into `villageId`. Prefers an",
    ))

    # 3c. POST /migration — 7-day expiry + token generation + response copy.
    replacements.append((
        "    const expiry = new Date()\n"
        "    expiry.setDate(expiry.getDate() + 30)\n"
        "\n"
        "    const record = await prisma.migration.create({\n"
        "      data: {\n"
        "        citizenId: citizen.id,\n"
        "        fromVillageId: officer.villageId,\n"
        "        toVillageId: toVid,\n"
        "        reason: (reason ?? '').toString().trim() || 'Not specified',\n"
        "        expiryDate: expiry,\n"
        "        sourceOfficerId: officerId,\n"
        "        targetOfficerId: targetOfficer?.id,\n"
        "      },\n"
        "      select: { id: true, status: true, requestDate: true },\n"
        "    })\n"
        "\n"
        "    return res.json({\n"
        "      success: true,\n"
        "      data: {\n"
        "        referenceNo: `MIG-${record.id.slice(0, 8).toUpperCase()}`,\n"
        "        serverId: record.id,\n"
        "        status: record.status,\n"
        "        targetOfficerAssigned: !!targetOfficer,\n"
        "      },\n"
        "      message: targetOfficer\n"
        "        ? 'Migration request sent. The citizen must report in person to the destination village officer, who will confirm before it is finalised.'\n"
        "        : 'Migration request saved, but no officer is currently assigned to the destination village — it will be actioned once one is.',\n"
        "    })",
        "    // PATCH-MIGFLOW-2026: the confirmation window is ONE WEEK, not 30 days —\n"
        "    // after this the request auto-expires and must be re-issued from scratch.\n"
        "    const expiry = new Date()\n"
        "    expiry.setDate(expiry.getDate() + 7)\n"
        "\n"
        "    // The migration token is what the citizen actually carries — together with\n"
        "    // their own NIN it's what the destination officer asks for to confirm the\n"
        "    // move (see POST /migration/confirm below). Retry on the rare unique clash.\n"
        "    let migrationToken\n"
        "    for (let attempt = 0; attempt < 5; attempt++) {\n"
        "      const candidate = genMigrationToken()\n"
        "      const clash = await prisma.migration.findUnique({ where: { migrationToken: candidate }, select: { id: true } }).catch(() => null)\n"
        "      if (!clash) { migrationToken = candidate; break }\n"
        "    }\n"
        "    if (!migrationToken) migrationToken = `TZM-${Date.now().toString(36).toUpperCase().slice(-6)}`\n"
        "\n"
        "    const record = await prisma.migration.create({\n"
        "      data: {\n"
        "        citizenId: citizen.id,\n"
        "        fromVillageId: officer.villageId,\n"
        "        toVillageId: toVid,\n"
        "        reason: (reason ?? '').toString().trim() || 'Not specified',\n"
        "        expiryDate: expiry,\n"
        "        migrationToken,\n"
        "        sourceOfficerId: officerId,\n"
        "        targetOfficerId: targetOfficer?.id,\n"
        "      },\n"
        "      select: { id: true, status: true, requestDate: true, expiryDate: true, migrationToken: true },\n"
        "    })\n"
        "\n"
        "    return res.json({\n"
        "      success: true,\n"
        "      data: {\n"
        "        referenceNo: `MIG-${record.id.slice(0, 8).toUpperCase()}`,\n"
        "        migrationToken: record.migrationToken,\n"
        "        expiryDate: record.expiryDate,\n"
        "        serverId: record.id,\n"
        "        status: record.status,\n"
        "        targetOfficerAssigned: !!targetOfficer,\n"
        "      },\n"
        "      message: targetOfficer\n"
        "        ? `Migration request sent. Give the citizen this migration token: ${record.migrationToken}. It is valid for ONE WEEK — within that time the citizen must report to the destination village officer with their NIN and this token to confirm the move. After a week it expires and must be issued again.`\n"
        "        : `Migration request saved (no officer is currently assigned to the destination village yet), but the citizen already has their token: ${record.migrationToken}, valid for one week.`,\n"
        "    })",
    ))

    # 3d. GET /migration/incoming — lazy-expire sweep + expose token/expiry.
    replacements.append((
        "router.get('/migration/incoming', async (req, res) => {\n"
        "  const { id: officerId } = req.user\n"
        "  try {\n"
        "    const rows = await prisma.migration.findMany({\n"
        "      where: { targetOfficerId: officerId, status: 'pending' },\n"
        "      orderBy: { requestDate: 'desc' },\n"
        "      select: {\n"
        "        id: true, reason: true, requestDate: true, expiryDate: true,\n"
        "        citizen: { select: { id: true, firstName: true, middleName: true, surname: true, nationalId: true, gender: true, dateOfBirth: true } },\n"
        "        fromVillage: { select: { id: true, name: true, ward: { select: { name: true, district: { select: { name: true } } } } } },\n"
        "      },\n"
        "    })\n"
        "    return res.json({\n"
        "      success: true,\n"
        "      data: rows.map(r => ({\n"
        "        id: r.id,\n"
        "        reason: r.reason,\n"
        "        requestDate: r.requestDate,\n"
        "        expiryDate: r.expiryDate,\n"
        "        citizenName: [r.citizen?.firstName, r.citizen?.middleName, r.citizen?.surname].filter(Boolean).join(' '),\n"
        "        nationalId: r.citizen?.nationalId ?? null,\n"
        "        gender: r.citizen?.gender ?? null,\n"
        "        fromVillageName: r.fromVillage?.name ?? '—',\n"
        "        fromWardName: r.fromVillage?.ward?.name ?? '—',\n"
        "        fromDistrictName: r.fromVillage?.ward?.district?.name ?? '—',\n"
        "      })),\n"
        "    })",
        "router.get('/migration/incoming', async (req, res) => {\n"
        "  const { id: officerId } = req.user\n"
        "  try {\n"
        "    const rows = await prisma.migration.findMany({\n"
        "      where: { targetOfficerId: officerId, status: 'pending' },\n"
        "      orderBy: { requestDate: 'desc' },\n"
        "      select: {\n"
        "        id: true, status: true, reason: true, requestDate: true, expiryDate: true, migrationToken: true,\n"
        "        citizen: { select: { id: true, firstName: true, middleName: true, surname: true, nationalId: true, gender: true, dateOfBirth: true } },\n"
        "        fromVillage: { select: { id: true, name: true, ward: { select: { name: true, district: { select: { name: true } } } } } },\n"
        "      },\n"
        "    })\n"
        "\n"
        "    // PATCH-MIGFLOW-2026: lazily flip anything past its one-week window to\n"
        "    // 'expired' before showing it as an actionable inbox item.\n"
        "    const stillPending = []\n"
        "    for (const r of rows) {\n"
        "      if (await expireIfDue(r)) continue\n"
        "      stillPending.push(r)\n"
        "    }\n"
        "\n"
        "    return res.json({\n"
        "      success: true,\n"
        "      data: stillPending.map(r => ({\n"
        "        id: r.id,\n"
        "        reason: r.reason,\n"
        "        requestDate: r.requestDate,\n"
        "        expiryDate: r.expiryDate,\n"
        "        migrationToken: r.migrationToken,\n"
        "        citizenName: [r.citizen?.firstName, r.citizen?.middleName, r.citizen?.surname].filter(Boolean).join(' '),\n"
        "        nationalId: r.citizen?.nationalId ?? null,\n"
        "        gender: r.citizen?.gender ?? null,\n"
        "        fromVillageName: r.fromVillage?.name ?? '—',\n"
        "        fromWardName: r.fromVillage?.ward?.name ?? '—',\n"
        "        fromDistrictName: r.fromVillage?.ward?.district?.name ?? '—',\n"
        "      })),\n"
        "    })",
    ))

    # 3e. GET /migration/outgoing — lazy-expire sweep + expose token/expiry.
    replacements.append((
        "router.get('/migration/outgoing', async (req, res) => {\n"
        "  const { id: officerId } = req.user\n"
        "  try {\n"
        "    const rows = await prisma.migration.findMany({\n"
        "      where: { sourceOfficerId: officerId },\n"
        "      orderBy: { requestDate: 'desc' },\n"
        "      take: 50,\n"
        "      select: {\n"
        "        id: true, status: true, reason: true, requestDate: true, confirmedDate: true,\n"
        "        citizen: { select: { firstName: true, surname: true, nationalId: true } },\n"
        "        toVillage: { select: { name: true } },\n"
        "      },\n"
        "    })\n"
        "    return res.json({\n"
        "      success: true,\n"
        "      data: rows.map(r => ({\n"
        "        id: r.id,\n"
        "        status: r.status,\n"
        "        reason: r.reason,\n"
        "        requestDate: r.requestDate,\n"
        "        confirmedDate: r.confirmedDate,\n"
        "        citizenName: [r.citizen?.firstName, r.citizen?.surname].filter(Boolean).join(' '),\n"
        "        nationalId: r.citizen?.nationalId ?? null,\n"
        "        toVillageName: r.toVillage?.name ?? '—',\n"
        "      })),\n"
        "    })",
        "router.get('/migration/outgoing', async (req, res) => {\n"
        "  const { id: officerId } = req.user\n"
        "  try {\n"
        "    const rows = await prisma.migration.findMany({\n"
        "      where: { sourceOfficerId: officerId },\n"
        "      orderBy: { requestDate: 'desc' },\n"
        "      take: 50,\n"
        "      select: {\n"
        "        id: true, status: true, reason: true, requestDate: true, confirmedDate: true, expiryDate: true, migrationToken: true,\n"
        "        citizen: { select: { firstName: true, surname: true, nationalId: true } },\n"
        "        toVillage: { select: { name: true } },\n"
        "      },\n"
        "    })\n"
        "\n"
        "    // PATCH-MIGFLOW-2026: sweep any pending-but-past-due rows to 'expired' so\n"
        "    // the officer's own outbox reflects reality straight away.\n"
        "    for (const r of rows) {\n"
        "      if (await expireIfDue(r)) r.status = 'expired'\n"
        "    }\n"
        "\n"
        "    return res.json({\n"
        "      success: true,\n"
        "      data: rows.map(r => ({\n"
        "        id: r.id,\n"
        "        status: r.status,\n"
        "        reason: r.reason,\n"
        "        requestDate: r.requestDate,\n"
        "        confirmedDate: r.confirmedDate,\n"
        "        expiryDate: r.expiryDate,\n"
        "        migrationToken: r.migrationToken,\n"
        "        citizenName: [r.citizen?.firstName, r.citizen?.surname].filter(Boolean).join(' '),\n"
        "        nationalId: r.citizen?.nationalId ?? null,\n"
        "        toVillageName: r.toVillage?.name ?? '—',\n"
        "      })),\n"
        "    })",
    ))

    # 3f. PATCH /migration/:id/respond — expiry check before approve/reject.
    replacements.append((
        "    const migration = await prisma.migration.findUnique({\n"
        "      where: { id: migrationId },\n"
        "      select: { id: true, status: true, citizenId: true, toVillageId: true, targetOfficerId: true },\n"
        "    })\n"
        "    if (!migration) return res.status(404).json({ success: false, message: 'Migration request not found.' })\n"
        "    if (migration.targetOfficerId !== officerId) {\n"
        "      return res.status(403).json({ success: false, message: 'This request is not addressed to you.' })\n"
        "    }\n"
        "    if (migration.status !== 'pending') {\n"
        "      return res.status(409).json({ success: false, message: `This request was already ${migration.status}.` })\n"
        "    }",
        "    const migration = await prisma.migration.findUnique({\n"
        "      where: { id: migrationId },\n"
        "      select: { id: true, status: true, citizenId: true, toVillageId: true, targetOfficerId: true, expiryDate: true },\n"
        "    })\n"
        "    if (!migration) return res.status(404).json({ success: false, message: 'Migration request not found.' })\n"
        "    if (migration.targetOfficerId !== officerId) {\n"
        "      return res.status(403).json({ success: false, message: 'This request is not addressed to you.' })\n"
        "    }\n"
        "    // PATCH-MIGFLOW-2026: one-week validity window — flip to 'expired' the\n"
        "    // moment anyone tries to act on a stale pending request.\n"
        "    if (await expireIfDue(migration)) {\n"
        "      return res.status(410).json({ success: false, message: 'This migration request has expired (its one-week validity window has passed). The citizen must ask the source village officer to issue a new migration request.' })\n"
        "    }\n"
        "    if (migration.status !== 'pending') {\n"
        "      return res.status(409).json({ success: false, message: `This request was already ${migration.status}.` })\n"
        "    }",
    ))

    # 3g. New route POST /migration/confirm — inserted right before the
    # "GET /api/village/records" section comment.
    replacements.append((
        "    await prisma.migration.update({ where: { id: migrationId }, data: { status: 'cancelled' } })\n"
        "    return res.json({ success: true, message: 'Migration request rejected.' })\n"
        "  } catch (err) {\n"
        "    console.error('[village/migration/respond]', err)\n"
        "    return res.status(500).json({ success: false, message: 'Internal server error' })\n"
        "  }\n"
        "})\n"
        "\n"
        "// ── GET /api/village/records ──────────────────────────────────────────────────",
        "    await prisma.migration.update({ where: { id: migrationId }, data: { status: 'cancelled' } })\n"
        "    return res.json({ success: true, message: 'Migration request rejected.' })\n"
        "  } catch (err) {\n"
        "    console.error('[village/migration/respond]', err)\n"
        "    return res.status(500).json({ success: false, message: 'Internal server error' })\n"
        "  }\n"
        "})\n"
        "\n"
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
        "  }\n"
        "\n"
        "  try {\n"
        "    const officer = await prisma.villageOfficer.findUnique({\n"
        "      where: { id: officerId },\n"
        "      select: { villageId: true },\n"
        "    })\n"
        "    if (!officer?.villageId) {\n"
        "      return res.status(422).json({ success: false, message: 'Your officer account is not assigned to a village yet.' })\n"
        "    }\n"
        "\n"
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
        "    }\n"
        "\n"
        "    if (migration.toVillageId !== officer.villageId) {\n"
        "      return res.status(403).json({ success: false, message: 'This migration request is not addressed to your village.' })\n"
        "    }\n"
        "\n"
        "    if (await expireIfDue(migration)) {\n"
        "      return res.status(410).json({ success: false, message: 'This migration token has expired (its one-week validity window has passed). Ask the citizen to request a fresh migration from the source village officer.' })\n"
        "    }\n"
        "\n"
        "    if (migration.status !== 'pending') {\n"
        "      return res.status(409).json({ success: false, message: `This migration request was already ${migration.status}.` })\n"
        "    }\n"
        "\n"
        "    await prisma.$transaction([\n"
        "      prisma.migration.update({\n"
        "        where: { id: migration.id },\n"
        "        data: { status: 'confirmed', confirmedDate: new Date(), targetOfficerId: officerId },\n"
        "      }),\n"
        "      prisma.citizen.update({\n"
        "        where: { id: migration.citizenId },\n"
        "        data: { currentVillageId: migration.toVillageId },\n"
        "      }),\n"
        "    ])\n"
        "\n"
        "    const citizenName = [migration.citizen?.firstName, migration.citizen?.middleName, migration.citizen?.surname]\n"
        "      .filter(Boolean).join(' ')\n"
        "\n"
        "    return res.json({\n"
        "      success: true,\n"
        "      message: `Migration confirmed. ${citizenName || 'The citizen'} is now registered in your village.`,\n"
        "    })\n"
        "  } catch (err) {\n"
        "    console.error('[village/migration/confirm]', err)\n"
        "    return res.status(500).json({ success: false, message: 'Internal server error' })\n"
        "  }\n"
        "})\n"
        "\n"
        "// ── GET /api/village/records ──────────────────────────────────────────────────",
    ))

    patch(path, marker, replacements, "village.js migration flow")


# ════════════════════════════════════════════════════════════════════════
# 4. backend/src/routes/admin.js — weekly bucketing + year/month filter
# ════════════════════════════════════════════════════════════════════════
def patch_admin_js():
    print("\n[4/9] backend/src/routes/admin.js")
    path = BACKEND / "src/routes/admin.js"
    marker = "PATCH-WEEKLYTRENDS-2026"

    replacements = []

    # 4a. helpers, inserted right after migrationGeoWhere()'s closing brace.
    replacements.append((
        "  const from = endWhere('fromVillageId', 'fromVillage', null)\n"
        "  const to   = endWhere('toVillageId',   'toVillage',   null)\n"
        "  if (!from && !to) return {}\n"
        "  return { OR: [from ?? {}, to ?? {}] }\n"
        "}\n",
        "  const from = endWhere('fromVillageId', 'fromVillage', null)\n"
        "  const to   = endWhere('toVillageId',   'toVillage',   null)\n"
        "  if (!from && !to) return {}\n"
        "  return { OR: [from ?? {}, to ?? {}] }\n"
        "}\n"
        "\n"
        "// PATCH-WEEKLYTRENDS-2026: RITA/NIDA/Migration cards now chart WEEK 1..5\n"
        "// within a single selected month/year (instead of one bar per calendar month\n"
        "// across the whole dataset). `monthRange` resolves the year/month query params\n"
        "// (defaulting to the current month) into a [start, end) date window;\n"
        "// `groupByWeek` buckets already-fetched groupBy rows by day-of-month / 7.\n"
        "function monthRange(query) {\n"
        "  const now = new Date()\n"
        "  const year  = query.year  ? Number(query.year)  : now.getFullYear()\n"
        "  const month = query.month ? Number(query.month) : now.getMonth() + 1 // 1-12\n"
        "  const start = new Date(year, month - 1, 1)\n"
        "  const end   = new Date(year, month, 1)\n"
        "  return { start, end, year, month }\n"
        "}\n"
        "\n"
        "function groupByWeek(rows, dateField) {\n"
        "  const buckets = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }\n"
        "  rows.forEach(r => {\n"
        "    const d = new Date(r[dateField])\n"
        "    const wk = Math.min(5, Math.ceil(d.getDate() / 7))\n"
        "    buckets[wk] += r._count.id\n"
        "  })\n"
        "  return [1, 2, 3, 4, 5].map(w => ({ week: `Week ${w}`, count: buckets[w] }))\n"
        "}\n",
    ))

    # 4b. /migrations/trends
    replacements.append((
        "router.get('/migrations/trends', async (req, res) => {\n"
        "  try {\n"
        "    const { startDate, endDate } = req.query\n"
        "    const dateFilter = {}\n"
        "    if (startDate) dateFilter.gte = new Date(startDate)\n"
        "    if (endDate)   dateFilter.lte = new Date(endDate)\n"
        "\n"
        "    const geoWhere = await migrationGeoWhere(req)\n"
        "    const where = {\n"
        "      ...geoWhere,\n"
        "      ...(Object.keys(dateFilter).length ? { requestDate: dateFilter } : {}),\n"
        "    }\n"
        "\n"
        "    const [rows, statusCounts] = await Promise.all([\n"
        "      prisma.migration.groupBy({\n"
        "        by: ['requestDate'],\n"
        "        _count: { id: true },\n"
        "        where,\n"
        "        orderBy: { requestDate: 'asc' },\n"
        "      }),\n"
        "      prisma.migration.groupBy({ by: ['status'], where, _count: { _all: true } }),\n"
        "    ])\n"
        "\n"
        "    const toMonth = (row) => {\n"
        "      const d = new Date(row.requestDate)\n"
        "      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`\n"
        "    }\n"
        "    const monthMap = {}\n"
        "    rows.forEach(r => { const m = toMonth(r); monthMap[m] = (monthMap[m] || 0) + r._count.id })\n"
        "    const trend = Object.entries(monthMap).sort().map(([month, count]) => ({ month, count }))\n"
        "\n"
        "    const totals = { pending: 0, confirmed: 0, cancelled: 0, expired: 0 }\n"
        "    statusCounts.forEach(s => { totals[s.status] = s._count._all })\n"
        "    totals.all = rows.reduce((s, r) => s + r._count.id, 0)\n"
        "\n"
        "    return res.json({ success: true, data: { trend, totals } })\n"
        "  } catch (err) {\n"
        "    console.error('[admin/migrations/trends]', err)\n"
        "    return res.status(500).json({ success: false, message: 'Failed to fetch migration trends' })\n"
        "  }\n"
        "})",
        "router.get('/migrations/trends', async (req, res) => {\n"
        "  try {\n"
        "    // PATCH-WEEKLYTRENDS-2026: floored to ONE month/year (picked above the\n"
        "    // cards on the dashboard) and charted as Week 1..5 within it.\n"
        "    const { start, end, year, month } = monthRange(req.query)\n"
        "    const geoWhere = await migrationGeoWhere(req)\n"
        "    const where = { ...geoWhere, requestDate: { gte: start, lt: end } }\n"
        "\n"
        "    const [rows, statusCounts] = await Promise.all([\n"
        "      prisma.migration.groupBy({\n"
        "        by: ['requestDate'],\n"
        "        _count: { id: true },\n"
        "        where,\n"
        "        orderBy: { requestDate: 'asc' },\n"
        "      }),\n"
        "      prisma.migration.groupBy({ by: ['status'], where, _count: { _all: true } }),\n"
        "    ])\n"
        "\n"
        "    const trend = groupByWeek(rows, 'requestDate')\n"
        "\n"
        "    const totals = { pending: 0, confirmed: 0, cancelled: 0, expired: 0 }\n"
        "    statusCounts.forEach(s => { totals[s.status] = s._count._all })\n"
        "    totals.all = rows.reduce((s, r) => s + r._count.id, 0)\n"
        "\n"
        "    return res.json({ success: true, data: { trend, totals, year, month } })\n"
        "  } catch (err) {\n"
        "    console.error('[admin/migrations/trends]', err)\n"
        "    return res.status(500).json({ success: false, message: 'Failed to fetch migration trends' })\n"
        "  }\n"
        "})",
    ))

    # 4c. /rita — query destructure + dateFilter
    replacements.append((
        "    const { regionId, districtId, startDate, endDate } = req.query\n"
        "    const dateFilter = {}\n"
        "    if (startDate) dateFilter.gte = new Date(startDate)\n"
        "    if (endDate)   dateFilter.lte = new Date(endDate)\n",
        "    const { regionId, districtId } = req.query\n"
        "    // PATCH-WEEKLYTRENDS-2026: floored to a single selected month/year; charts\n"
        "    // below bucket into Week 1..5 within that window.\n"
        "    const { start, end, year, month } = monthRange(req.query)\n"
        "    const dateFilter = { gte: start, lt: end }\n",
    ))

    # 4d. /rita — aggregation + response
    replacements.append((
        "    // Aggregate by month label\n"
        "    const toMonth = (row) => {\n"
        "      const d = new Date(row.registeredAt)\n"
        "      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`\n"
        "    }\n"
        "    const agg = (rows) => {\n"
        "      const map = {}\n"
        "      rows.forEach(r => { const m = toMonth(r); map[m] = (map[m] || 0) + r._count.id })\n"
        "      return Object.entries(map).sort().map(([month, count]) => ({ month, count }))\n"
        "    }\n"
        "\n"
        "    return res.json({\n"
        "      success: true,\n"
        "      data: {\n"
        "        births:    agg(birthRows),\n"
        "        deaths:    agg(deathRows),\n"
        "        marriages: agg(marriageRows),\n"
        "        totals: {\n"
        "          births:    birthRows.reduce((s, r) => s + r._count.id, 0),\n"
        "          deaths:    deathRows.reduce((s, r) => s + r._count.id, 0),\n"
        "          marriages: marriageRows.reduce((s, r) => s + r._count.id, 0),\n"
        "        },\n"
        "      },\n"
        "    })",
        "    // PATCH-WEEKLYTRENDS-2026: bucket into Week 1..5 of the selected month\n"
        "    // instead of one point per calendar month.\n"
        "    return res.json({\n"
        "      success: true,\n"
        "      data: {\n"
        "        births:    groupByWeek(birthRows,    'registeredAt'),\n"
        "        deaths:    groupByWeek(deathRows,    'registeredAt'),\n"
        "        marriages: groupByWeek(marriageRows, 'registeredAt'),\n"
        "        totals: {\n"
        "          births:    birthRows.reduce((s, r) => s + r._count.id, 0),\n"
        "          deaths:    deathRows.reduce((s, r) => s + r._count.id, 0),\n"
        "          marriages: marriageRows.reduce((s, r) => s + r._count.id, 0),\n"
        "        },\n"
        "        year, month,\n"
        "      },\n"
        "    })",
    ))

    # 4e. /nida — dateFilter
    replacements.append((
        "    const { startDate, endDate } = req.query\n"
        "    const dateFilter = {}\n"
        "    if (startDate) dateFilter.gte = new Date(startDate)\n"
        "    if (endDate)   dateFilter.lte = new Date(endDate)\n"
        "\n"
        "    // BUGFIX-NIDA-2026:",
        "    // PATCH-WEEKLYTRENDS-2026: floored to a single selected month/year.\n"
        "    const { start, end, year, month } = monthRange(req.query)\n"
        "    const dateFilter = { gte: start, lt: end }\n"
        "\n"
        "    // BUGFIX-NIDA-2026:",
    ))

    # 4f. /nida — aggregation + response
    replacements.append((
        "    const toMonth = (row) => {\n"
        "      const d = new Date(row.idCardIssued)\n"
        "      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`\n"
        "    }\n"
        "    const monthMap = {}\n"
        "    ninRows.forEach(r => { const m = toMonth(r); monthMap[m] = (monthMap[m] || 0) + r._count.id })\n"
        "    const trend = Object.entries(monthMap).sort().map(([month, count]) => ({ month, count }))\n"
        "\n"
        "    return res.json({\n"
        "      success: true,\n"
        "      data: {\n"
        "        ninIssuances: trend,\n"
        "        total: ninRows.reduce((s, r) => s + r._count.id, 0),\n"
        "      },\n"
        "    })",
        "    const trend = groupByWeek(ninRows, 'idCardIssued')\n"
        "\n"
        "    return res.json({\n"
        "      success: true,\n"
        "      data: {\n"
        "        ninIssuances: trend,\n"
        "        total: ninRows.reduce((s, r) => s + r._count.id, 0),\n"
        "        year, month,\n"
        "      },\n"
        "    })",
    ))

    patch(path, marker, replacements, "admin.js weekly trend endpoints")


# ════════════════════════════════════════════════════════════════════════
# 5. web/src/components/YearMonthFilter.jsx (new)
# ════════════════════════════════════════════════════════════════════════
def create_year_month_filter():
    print("\n[5/9] web/src/components/YearMonthFilter.jsx")
    path = WEB / "src/components/YearMonthFilter.jsx"
    content = """/**
 * YearMonthFilter.jsx — Year + Month picker for the RITA / NIDA / Migration
 * Trends cards (PATCH-WEEKLYTRENDS-2026).
 *
 * The charts below each of these cards show Week 1..Week 5 of whichever
 * month/year is selected here (defaulting to the current month).
 */
import { useEffect, useState } from 'react'
import { Calendar } from 'lucide-react'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export default function YearMonthFilter({ onChange }) {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)

  useEffect(() => {
    onChange?.({ year, month })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month])

  const years = []
  for (let y = now.getFullYear(); y >= now.getFullYear() - 5; y--) years.push(y)

  const sel = 'bg-[#0a1628] border border-[#1a3060] rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-[#00d4ff]/50 transition-colors'

  return (
    <div className="flex flex-wrap items-center gap-2 mb-3">
      <Calendar size={14} className="text-[#00d4ff] shrink-0" />
      <span className="text-xs text-gray-500 shrink-0">Period</span>
      <select className={sel} value={year} onChange={e => setYear(Number(e.target.value))}>
        {years.map(y => <option key={y} value={y}>{y}</option>)}
      </select>
      <select className={sel} value={month} onChange={e => setMonth(Number(e.target.value))}>
        {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
      </select>
    </div>
  )
}
"""
    create_if_missing(path, content, "YearMonthFilter.jsx")


# ════════════════════════════════════════════════════════════════════════
# 6. web/src/pages/AdminDashboard.jsx — wire up the filter + weekly charts
# ════════════════════════════════════════════════════════════════════════
def patch_admin_dashboard():
    print("\n[6/9] web/src/pages/AdminDashboard.jsx")
    path = WEB / "src/pages/AdminDashboard.jsx"
    marker = "PATCH-WEEKLYTRENDS-2026"

    replacements = []

    # 6a. import
    replacements.append((
        "import GeoFilterBar from '../components/GeoFilterBar'\n",
        "import GeoFilterBar from '../components/GeoFilterBar'\n"
        "import YearMonthFilter from '../components/YearMonthFilter'\n",
    ))

    # 6b. shared MONTH_NAMES constant
    replacements.append((
        "// ── Shared UI primitives ─────────────────────────────────────────────────────\n"
        "\n"
        "function Card({ children, className = '' }) {",
        "// ── Shared UI primitives ─────────────────────────────────────────────────────\n"
        "\n"
        "// PATCH-WEEKLYTRENDS-2026: shared month-name lookup for the RITA/NIDA/\n"
        "// Migration Trends card headers (e.g. \"Weekly Trend (July 2026)\").\n"
        "const MONTH_NAMES = [\n"
        "  'January', 'February', 'March', 'April', 'May', 'June',\n"
        "  'July', 'August', 'September', 'October', 'November', 'December',\n"
        "]\n"
        "\n"
        "function Card({ children, className = '' }) {",
    ))

    # 6c. RITASection — state
    replacements.append((
        "  const [filters, setFilters] = useState({})\n"
        "  const [deleting, setDeleting] = useState(false)",
        "  const [filters, setFilters] = useState({})\n"
        "  const [period, setPeriod] = useState(() => {\n"
        "    const now = new Date()\n"
        "    return { year: now.getFullYear(), month: now.getMonth() + 1 }\n"
        "  })\n"
        "  const [deleting, setDeleting] = useState(false)",
    ))

    # 6d. RITASection — effect + handleDelete call + filter bar render
    replacements.append((
        "  // eslint-disable-next-line react-hooks/set-state-in-effect\n"
        "  useEffect(() => { load(filters) }, [filters, load])\n"
        "\n"
        "  const handleDelete = async () => {\n"
        "    if (!window.confirm('Delete ALL birth records? This cannot be undone. Test parent citizens will be preserved.')) return\n"
        "    setDeleting(true)\n"
        "    try {\n"
        "      const r = await api.apiDeleteBirths()\n"
        "      alert(r.message || 'Births deleted')\n"
        "      load(filters)\n"
        "    } catch(e) { alert('Failed: ' + e.message) }\n"
        "    finally { setDeleting(false) }\n"
        "  }",
        "  // eslint-disable-next-line react-hooks/set-state-in-effect\n"
        "  useEffect(() => { load({ ...filters, ...period }) }, [filters, period, load])\n"
        "\n"
        "  const handleDelete = async () => {\n"
        "    if (!window.confirm('Delete ALL birth records? This cannot be undone. Test parent citizens will be preserved.')) return\n"
        "    setDeleting(true)\n"
        "    try {\n"
        "      const r = await api.apiDeleteBirths()\n"
        "      alert(r.message || 'Births deleted')\n"
        "      load({ ...filters, ...period })\n"
        "    } catch(e) { alert('Failed: ' + e.message) }\n"
        "    finally { setDeleting(false) }\n"
        "  }",
    ))

    replacements.append((
        "      <GeoFilterBar onChange={f => setFilters(f)} scoped={role === 'district_admin'} />\n"
        "\n"
        "      {loading ? (\n"
        "        <Card><p className=\"text-gray-500 text-xs py-8 text-center\"><RefreshCw size={14} className=\"inline animate-spin mr-2\" />Loading RITA data…</p></Card>",
        "      <YearMonthFilter onChange={p => setPeriod(p)} />\n"
        "      <GeoFilterBar onChange={f => setFilters(f)} scoped={role === 'district_admin'} />\n"
        "\n"
        "      {loading ? (\n"
        "        <Card><p className=\"text-gray-500 text-xs py-8 text-center\"><RefreshCw size={14} className=\"inline animate-spin mr-2\" />Loading RITA data…</p></Card>",
    ))

    # 6e. RITASection — three chart headers + dataKey
    replacements.append((
        "            <p className=\"text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3\">Birth Registrations — Monthly Trend</p>\n"
        "            <ResponsiveContainer width=\"100%\" height={200}>\n"
        "              <BarChart data={data?.births || []}>\n"
        "                <CartesianGrid strokeDasharray=\"3 3\" stroke=\"#1a3060\" />\n"
        "                <XAxis dataKey=\"month\" tick={{ fill: '#94a3b8', fontSize: 10 }} />",
        "            <p className=\"text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3\">Birth Registrations — Weekly Trend ({MONTH_NAMES[period.month - 1]} {period.year})</p>\n"
        "            <ResponsiveContainer width=\"100%\" height={200}>\n"
        "              <BarChart data={data?.births || []}>\n"
        "                <CartesianGrid strokeDasharray=\"3 3\" stroke=\"#1a3060\" />\n"
        "                <XAxis dataKey=\"week\" tick={{ fill: '#94a3b8', fontSize: 10 }} />",
    ))
    replacements.append((
        "            <p className=\"text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3\">Death Registrations — Monthly Trend</p>\n"
        "            <ResponsiveContainer width=\"100%\" height={200}>\n"
        "              <BarChart data={data?.deaths || []}>\n"
        "                <CartesianGrid strokeDasharray=\"3 3\" stroke=\"#1a3060\" />\n"
        "                <XAxis dataKey=\"month\" tick={{ fill: '#94a3b8', fontSize: 10 }} />",
        "            <p className=\"text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3\">Death Registrations — Weekly Trend ({MONTH_NAMES[period.month - 1]} {period.year})</p>\n"
        "            <ResponsiveContainer width=\"100%\" height={200}>\n"
        "              <BarChart data={data?.deaths || []}>\n"
        "                <CartesianGrid strokeDasharray=\"3 3\" stroke=\"#1a3060\" />\n"
        "                <XAxis dataKey=\"week\" tick={{ fill: '#94a3b8', fontSize: 10 }} />",
    ))
    replacements.append((
        "            <p className=\"text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3\">Marriage Registrations — Monthly Trend</p>\n"
        "            <ResponsiveContainer width=\"100%\" height={200}>\n"
        "              <BarChart data={data?.marriages || []}>\n"
        "                <CartesianGrid strokeDasharray=\"3 3\" stroke=\"#1a3060\" />\n"
        "                <XAxis dataKey=\"month\" tick={{ fill: '#94a3b8', fontSize: 10 }} />",
        "            <p className=\"text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3\">Marriage Registrations — Weekly Trend ({MONTH_NAMES[period.month - 1]} {period.year})</p>\n"
        "            <ResponsiveContainer width=\"100%\" height={200}>\n"
        "              <BarChart data={data?.marriages || []}>\n"
        "                <CartesianGrid strokeDasharray=\"3 3\" stroke=\"#1a3060\" />\n"
        "                <XAxis dataKey=\"week\" tick={{ fill: '#94a3b8', fontSize: 10 }} />",
    ))

    # 6f. NIDASection — state
    replacements.append((
        "function NIDASection({ role }) {\n"
        "  const [data, setData]       = useState(null)\n"
        "  const [loading, setLoading] = useState(true)\n"
        "  const [filters, setFilters] = useState({})\n",
        "function NIDASection({ role }) {\n"
        "  const [data, setData]       = useState(null)\n"
        "  const [loading, setLoading] = useState(true)\n"
        "  const [filters, setFilters] = useState({})\n"
        "  const [period, setPeriod] = useState(() => {\n"
        "    const now = new Date()\n"
        "    return { year: now.getFullYear(), month: now.getMonth() + 1 }\n"
        "  })\n",
    ))

    # 6g. NIDASection — effect + render
    replacements.append((
        "  // eslint-disable-next-line react-hooks/set-state-in-effect\n"
        "  useEffect(() => { load(filters) }, [filters, load])\n"
        "\n"
        "  return (\n"
        "    <div className=\"space-y-4\">\n"
        "      <h2 className=\"text-white font-bold text-lg\">NIDA — NIN Issuance Trends</h2>\n"
        "      <GeoFilterBar onChange={f => setFilters(f)} scoped={role === 'district_admin'} />",
        "  // eslint-disable-next-line react-hooks/set-state-in-effect\n"
        "  useEffect(() => { load({ ...filters, ...period }) }, [filters, period, load])\n"
        "\n"
        "  return (\n"
        "    <div className=\"space-y-4\">\n"
        "      <h2 className=\"text-white font-bold text-lg\">NIDA — NIN Issuance Trends</h2>\n"
        "      <YearMonthFilter onChange={p => setPeriod(p)} />\n"
        "      <GeoFilterBar onChange={f => setFilters(f)} scoped={role === 'district_admin'} />",
    ))

    # 6h. NIDASection — chart header + dataKey
    replacements.append((
        "            <p className=\"text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3\">NIN Issuances — Monthly Trend</p>\n"
        "            {data?.ninIssuances?.length ? (\n"
        "              <ResponsiveContainer width=\"100%\" height={240}>\n"
        "                <BarChart data={data.ninIssuances}>\n"
        "                  <CartesianGrid strokeDasharray=\"3 3\" stroke=\"#1a3060\" />\n"
        "                  <XAxis dataKey=\"month\" tick={{ fill: '#94a3b8', fontSize: 10 }} />",
        "            <p className=\"text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3\">NIN Issuances — Weekly Trend ({MONTH_NAMES[period.month - 1]} {period.year})</p>\n"
        "            {data?.ninIssuances?.length ? (\n"
        "              <ResponsiveContainer width=\"100%\" height={240}>\n"
        "                <BarChart data={data.ninIssuances}>\n"
        "                  <CartesianGrid strokeDasharray=\"3 3\" stroke=\"#1a3060\" />\n"
        "                  <XAxis dataKey=\"week\" tick={{ fill: '#94a3b8', fontSize: 10 }} />",
    ))

    # 6i. MigrationsSection — state
    replacements.append((
        "function MigrationsSection({ role }) {\n"
        "  const [data, setData]       = useState(null)\n"
        "  const [loading, setLoading] = useState(true)\n"
        "  const [filters, setFilters] = useState({})\n",
        "function MigrationsSection({ role }) {\n"
        "  const [data, setData]       = useState(null)\n"
        "  const [loading, setLoading] = useState(true)\n"
        "  const [filters, setFilters] = useState({})\n"
        "  const [period, setPeriod] = useState(() => {\n"
        "    const now = new Date()\n"
        "    return { year: now.getFullYear(), month: now.getMonth() + 1 }\n"
        "  })\n",
    ))

    # 6j. MigrationsSection — effect + render
    replacements.append((
        "  // eslint-disable-next-line react-hooks/set-state-in-effect\n"
        "  useEffect(() => { load(filters) }, [filters, load])\n"
        "\n"
        "  const totals = data?.totals || { pending: 0, confirmed: 0, cancelled: 0, expired: 0, all: 0 }\n"
        "\n"
        "  return (\n"
        "    <div className=\"space-y-4\">\n"
        "      <h2 className=\"text-white font-bold text-lg\">Migration Trends</h2>\n"
        "      <GeoFilterBar onChange={f => setFilters(f)} scoped={role === 'district_admin'} />",
        "  // eslint-disable-next-line react-hooks/set-state-in-effect\n"
        "  useEffect(() => { load({ ...filters, ...period }) }, [filters, period, load])\n"
        "\n"
        "  const totals = data?.totals || { pending: 0, confirmed: 0, cancelled: 0, expired: 0, all: 0 }\n"
        "\n"
        "  return (\n"
        "    <div className=\"space-y-4\">\n"
        "      <h2 className=\"text-white font-bold text-lg\">Migration Trends</h2>\n"
        "      <YearMonthFilter onChange={p => setPeriod(p)} />\n"
        "      <GeoFilterBar onChange={f => setFilters(f)} scoped={role === 'district_admin'} />",
    ))

    # 6k. MigrationsSection — chart header + dataKey
    replacements.append((
        "            <p className=\"text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3\">Migration Requests — Monthly Trend</p>\n"
        "            {data?.trend?.length ? (\n"
        "              <ResponsiveContainer width=\"100%\" height={240}>\n"
        "                <BarChart data={data.trend}>\n"
        "                  <CartesianGrid strokeDasharray=\"3 3\" stroke=\"#1a3060\" />\n"
        "                  <XAxis dataKey=\"month\" tick={{ fill: '#94a3b8', fontSize: 10 }} />",
        "            <p className=\"text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3\">Migration Requests — Weekly Trend ({MONTH_NAMES[period.month - 1]} {period.year})</p>\n"
        "            {data?.trend?.length ? (\n"
        "              <ResponsiveContainer width=\"100%\" height={240}>\n"
        "                <BarChart data={data.trend}>\n"
        "                  <CartesianGrid strokeDasharray=\"3 3\" stroke=\"#1a3060\" />\n"
        "                  <XAxis dataKey=\"week\" tick={{ fill: '#94a3b8', fontSize: 10 }} />",
    ))

    patch(path, marker, replacements, "AdminDashboard.jsx weekly charts + year/month filter")


# ════════════════════════════════════════════════════════════════════════
# 7. mobile/src/screens/village/MigrationHomeScreen.tsx (new)
# ════════════════════════════════════════════════════════════════════════
def create_migration_home_screen():
    print("\n[7/9] mobile MigrationHomeScreen.tsx + ConfirmIncomingMigrationScreen.tsx")
    path = MOBILE / "src/screens/village/MigrationHomeScreen.tsx"
    content = '''/**
 * MigrationHomeScreen.tsx — Village Officer: choose migration direction
 *
 * PATCH-MIGFLOW-2026: first screen after tapping "Migrate" on the Village
 * Officer home screen. Migration has two shapes that need two different
 * screens/flows, so we ask up front instead of cramming both into one form:
 *
 *  Outgoing Citizen -> TrackMigrationScreen (existing "Migrate Citizen"
 *    flow): officer looks up a resident of THEIR OWN village and sends a
 *    migration request to the destination village. On success the system
 *    generates a migration token valid for ONE WEEK, which the officer
 *    gives to the citizen.
 *
 *  Incoming Citizen -> ConfirmIncomingMigrationScreen: officer asks the
 *    arriving citizen for their NIN (for demographic lookup) and the
 *    migration token issued by the source village, and confirms the move —
 *    finalising it immediately. If the one-week window has passed, the
 *    token is rejected and the citizen must be sent back to the source
 *    village officer to request a fresh one.
 */
import React from 'react'
import { View, Text, TouchableOpacity, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ArrowLeft, Repeat, User, Bell, ChevronRight } from 'lucide-react-native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useTheme } from '../../context/ThemeContext'

type VStack = {
  VillageHome: undefined
  MigrationHome: undefined
  TrackMigration: undefined
  ConfirmIncomingMigration: undefined
  MigrationRequests: undefined
}
type Props = { navigation: NativeStackNavigationProp<VStack, 'MigrationHome'> }

const G = '#1eb53a'

function OptionCard({
  icon,
  title,
  sub,
  onPress,
}: {
  icon: React.ReactNode
  title: string
  sub: string
  onPress: () => void
}) {
  const { theme: T } = useTheme()
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        backgroundColor: T.card,
        borderWidth: 1,
        borderColor: T.border,
        borderRadius: 14,
        padding: 16,
      }}
    >
      <View
        style={{
          width: 46,
          height: 46,
          borderRadius: 12,
          backgroundColor: `${G}22`,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {icon}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: '800', color: T.text }}>{title}</Text>
        <Text style={{ fontSize: 11, color: T.textSub, marginTop: 3 }}>{sub}</Text>
      </View>
      <ChevronRight size={18} color={T.textDim} />
    </TouchableOpacity>
  )
}

export default function MigrationHomeScreen({ navigation }: Props) {
  const { theme: T } = useTheme()

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }} edges={['top']}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingHorizontal: 14,
          paddingVertical: 12,
          borderBottomWidth: 1,
          borderBottomColor: T.border,
        }}
      >
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <ArrowLeft size={20} color={T.text} />
        </TouchableOpacity>
        <Repeat size={18} color={G} />
        <Text style={{ fontSize: 16, fontWeight: '800', color: T.text }}>Migration</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
        <Text style={{ fontSize: 12, color: T.textSub }}>
          Is this citizen leaving your village, or arriving into it?
        </Text>

        <OptionCard
          icon={<Repeat size={20} color={G} />}
          title="Outgoing Citizen"
          sub="A resident of your village is moving to another village/street. Sends a migration request and issues a one-week token."
          onPress={() => navigation.navigate('TrackMigration')}
        />

        <OptionCard
          icon={<User size={20} color={G} />}
          title="Incoming Citizen"
          sub="A citizen has arrived from another village. Confirm using their NIN and migration token (valid one week)."
          onPress={() => navigation.navigate('ConfirmIncomingMigration')}
        />

        <View style={{ height: 1, backgroundColor: T.border, marginVertical: 4 }} />

        <OptionCard
          icon={<Bell size={20} color={G} />}
          title="Pending Requests Inbox"
          sub="Browse incoming migration requests addressed to your village and approve/reject them the traditional way."
          onPress={() => navigation.navigate('MigrationRequests')}
        />
      </ScrollView>
    </SafeAreaView>
  )
}
'''
    create_if_missing(path, content, "MigrationHomeScreen.tsx")


def create_confirm_incoming_migration_screen():
    path = MOBILE / "src/screens/village/ConfirmIncomingMigrationScreen.tsx"
    content = '''/**
 * ConfirmIncomingMigrationScreen.tsx — Village Officer: confirm an INCOMING
 * citizen migration using their NIN + migration token
 *
 * PATCH-MIGFLOW-2026: the primary way a destination village officer
 * finalises a migration — no need to browse a pending list. The citizen who
 * has physically arrived presents:
 *   1. Their NIN (National ID) — used for demographic lookup/verification.
 *   2. The migration token the SOURCE village officer gave them when they
 *      issued the migration — valid for exactly ONE WEEK from issuance.
 *
 * POST /village/migration/confirm { nationalId, migrationToken }
 *   - success -> citizen's currentVillageId now points at this village.
 *   - expired -> token's one-week window has passed; citizen must go back
 *     to the source village officer and have the migration re-issued.
 *   - otherwise -> wrong village, no match, or already actioned.
 */
import React, { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ArrowLeft, Repeat, CheckCircle2, User, Search } from 'lucide-react-native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useTheme } from '../../context/ThemeContext'
import { apiPost } from '../../services/syncService'

type VStack = { VillageHome: undefined; ConfirmIncomingMigration: undefined }
type Props = { navigation: NativeStackNavigationProp<VStack, 'ConfirmIncomingMigration'> }

const G = '#1eb53a'

export default function ConfirmIncomingMigrationScreen({ navigation }: Props) {
  const { theme: T } = useTheme()
  const [nationalId, setNationalId] = useState('')
  const [migrationToken, setMigrationToken] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const canSubmit = nationalId.trim().length > 0 && migrationToken.trim().length > 0 && !submitting

  const handleConfirm = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      const json = await apiPost('/village/migration/confirm', {
        nationalId: nationalId.trim(),
        migrationToken: migrationToken.trim(),
      })
      if (json.success) {
        Alert.alert('Migration Confirmed', json.message || 'The citizen is now registered in your village.', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ])
      } else {
        Alert.alert('Could Not Confirm', json.message || 'Please check the NIN and token and try again.')
      }
    } catch (err: any) {
      Alert.alert('Could Not Confirm', err?.message || 'Please check the NIN and token and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }} edges={['top']}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingHorizontal: 14,
          paddingVertical: 12,
          borderBottomWidth: 1,
          borderBottomColor: T.border,
        }}
      >
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <ArrowLeft size={20} color={T.text} />
        </TouchableOpacity>
        <Repeat size={18} color={G} />
        <Text style={{ fontSize: 16, fontWeight: '800', color: T.text }}>Incoming Migration</Text>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 16 }}>
          <Text style={{ fontSize: 12, color: T.textSub }}>
            Ask the citizen for their NIN and the migration token given to them by their previous village
            officer, then confirm below. This is only valid within one week of the token being issued.
          </Text>

          <View>
            <Text style={{ fontSize: 12, fontWeight: '600', color: T.textSub, marginBottom: 6 }}>
              Citizen NIN
            </Text>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                backgroundColor: T.card2,
                borderWidth: 1,
                borderColor: T.border,
                borderRadius: 10,
                paddingHorizontal: 12,
              }}
            >
              <User size={15} color={T.textDim} />
              <TextInput
                style={{ flex: 1, paddingVertical: 12, color: T.text, fontSize: 14 }}
                value={nationalId}
                onChangeText={setNationalId}
                placeholder="e.g. 19900101-07031-12345-67"
                placeholderTextColor={T.textDim}
                autoCapitalize="none"
              />
            </View>
          </View>

          <View>
            <Text style={{ fontSize: 12, fontWeight: '600', color: T.textSub, marginBottom: 6 }}>
              Migration Token
            </Text>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                backgroundColor: T.card2,
                borderWidth: 1,
                borderColor: T.border,
                borderRadius: 10,
                paddingHorizontal: 12,
              }}
            >
              <Search size={15} color={T.textDim} />
              <TextInput
                style={{ flex: 1, paddingVertical: 12, color: T.text, fontSize: 14, letterSpacing: 1 }}
                value={migrationToken}
                onChangeText={(v) => setMigrationToken(v.toUpperCase())}
                placeholder="e.g. TZM-7K9P2Q"
                placeholderTextColor={T.textDim}
                autoCapitalize="characters"
              />
            </View>
          </View>

          <TouchableOpacity
            disabled={!canSubmit}
            onPress={handleConfirm}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              paddingVertical: 14,
              borderRadius: 12,
              backgroundColor: canSubmit ? G : T.border,
            }}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <CheckCircle2 size={16} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>Confirm Migration</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
'''
    create_if_missing(path, content, "ConfirmIncomingMigrationScreen.tsx")


# ════════════════════════════════════════════════════════════════════════
# 8. mobile/App.js — register the two new screens
# ════════════════════════════════════════════════════════════════════════
def patch_app_js():
    print("\n[8/9] mobile/App.js")
    path = MOBILE / "App.js"
    marker = "MigrationHomeScreen"

    replacements = [
        (
            "import TrackMigrationScreen from './src/screens/village/TrackMigrationScreen'\n"
            "import MigrationRequestsScreen from './src/screens/village/MigrationRequestsScreen'\n",
            "import MigrationHomeScreen from './src/screens/village/MigrationHomeScreen'\n"
            "import TrackMigrationScreen from './src/screens/village/TrackMigrationScreen'\n"
            "import ConfirmIncomingMigrationScreen from './src/screens/village/ConfirmIncomingMigrationScreen'\n"
            "import MigrationRequestsScreen from './src/screens/village/MigrationRequestsScreen'\n",
        ),
        (
            '              <Stack.Screen name="TrackMigration" component={TrackMigrationScreen} />\n'
            '              <Stack.Screen name="MigrationRequests" component={MigrationRequestsScreen} />\n',
            '              <Stack.Screen name="MigrationHome" component={MigrationHomeScreen} />\n'
            '              <Stack.Screen name="TrackMigration" component={TrackMigrationScreen} />\n'
            '              <Stack.Screen name="ConfirmIncomingMigration" component={ConfirmIncomingMigrationScreen} />\n'
            '              <Stack.Screen name="MigrationRequests" component={MigrationRequestsScreen} />\n',
        ),
    ]
    patch(path, marker, replacements, "App.js screen registration")


# ════════════════════════════════════════════════════════════════════════
# 9. Remaining mobile screen edits: VillageHomeScreen, TrackMigrationScreen,
#    MigrationRequestsScreen
# ════════════════════════════════════════════════════════════════════════
def patch_village_home_screen():
    print("\n[9/9] mobile village screens (VillageHomeScreen, TrackMigrationScreen, MigrationRequestsScreen)")
    path = MOBILE / "src/screens/village/VillageHomeScreen.tsx"
    marker = "MigrationHome: undefined"
    replacements = [
        (
            "type VStack = {\n"
            "  Splash: undefined\n"
            "  Login: undefined\n"
            "  VillageHome: undefined\n"
            "  HospitalHome: undefined\n"
            "  RegisterCitizen: undefined\n"
            "  RegisterMarriage: undefined\n"
            "  VillageRecordDeath: undefined\n"
            "  NINRegistration: undefined\n"
            "  SyncData: undefined\n"
            "  TrackMigration: undefined\n"
            "  MigrationRequests: undefined\n"
            "}",
            "type VStack = {\n"
            "  Splash: undefined\n"
            "  Login: undefined\n"
            "  VillageHome: undefined\n"
            "  HospitalHome: undefined\n"
            "  RegisterCitizen: undefined\n"
            "  RegisterMarriage: undefined\n"
            "  VillageRecordDeath: undefined\n"
            "  NINRegistration: undefined\n"
            "  SyncData: undefined\n"
            "  MigrationHome: undefined\n"
            "  TrackMigration: undefined\n"
            "  ConfirmIncomingMigration: undefined\n"
            "  MigrationRequests: undefined\n"
            "}",
        ),
        (
            "    const m: Record<string, string> = {\n"
            "      nin: 'NINRegistration',\n"
            "      citizen: 'CitizenProfile',\n"
            "      death: 'VillageRecordDeath',\n"
            "      marriage: 'RegisterMarriage',\n"
            "      migration: 'TrackMigration',\n"
            "      records: 'VillageViewRecords',\n"
            "    }",
            "    const m: Record<string, string> = {\n"
            "      nin: 'NINRegistration',\n"
            "      citizen: 'CitizenProfile',\n"
            "      death: 'VillageRecordDeath',\n"
            "      marriage: 'RegisterMarriage',\n"
            "      migration: 'MigrationHome',\n"
            "      records: 'VillageViewRecords',\n"
            "    }",
        ),
    ]
    patch(path, marker, replacements, "VillageHomeScreen.tsx navigation")


def patch_track_migration_screen():
    path = MOBILE / "src/screens/village/TrackMigrationScreen.tsx"
    marker = "PATCH-MIGFLOW-2026"
    replacements = [
        (
            "        <Repeat size={18} color={G} />\n"
            "        <Text style={{ fontSize: 16, fontWeight: '800', color: T.text }}>Migrate Citizen</Text>",
            "        {/* PATCH-MIGFLOW-2026 */}\n"
            "        <Repeat size={18} color={G} />\n"
            "        <Text style={{ fontSize: 16, fontWeight: '800', color: T.text }}>Outgoing Migration</Text>",
        ),
        (
            "              if (json.success) {\n"
            "                Alert.alert('Request Sent', json.message || 'Migration request sent successfully.', [\n"
            "                  { text: 'OK', onPress: () => navigation.goBack() },\n"
            "                ])\n"
            "              } else {",
            "              if (json.success) {\n"
            "                const token = json.data?.migrationToken\n"
            "                const expiry = json.data?.expiryDate ? new Date(json.data.expiryDate).toLocaleDateString('en-TZ') : null\n"
            "                const tokenNote = token\n"
            "                  ? `\\n\\nMigration Token: ${token}\\nValid until: ${expiry ?? '7 days from today'}\\n\\nGive this token to the citizen — they must present it with their NIN to the destination village officer within one week, or it expires and a new request must be issued.`\n"
            "                  : ''\n"
            "                Alert.alert('Request Sent', (json.message || 'Migration request sent successfully.') + tokenNote, [\n"
            "                  { text: 'OK', onPress: () => navigation.goBack() },\n"
            "                ])\n"
            "              } else {",
        ),
    ]
    patch(path, marker, replacements, "TrackMigrationScreen.tsx token display")


def patch_migration_requests_screen():
    path = MOBILE / "src/screens/village/MigrationRequestsScreen.tsx"
    marker = "PATCH-MIGFLOW-2026"
    replacements = [
        (
            "interface IncomingMigration {\n"
            "  id: string\n"
            "  reason: string\n"
            "  requestDate: string\n"
            "  citizenName: string\n"
            "  nationalId: string | null\n"
            "  gender: string | null\n"
            "  fromVillageName: string\n"
            "  fromWardName: string\n"
            "  fromDistrictName: string\n"
            "}",
            "// PATCH-MIGFLOW-2026: expiryDate/migrationToken surfaced from the backend\n"
            "// so this legacy list view stays consistent with the new NIN+token flow.\n"
            "interface IncomingMigration {\n"
            "  id: string\n"
            "  reason: string\n"
            "  requestDate: string\n"
            "  expiryDate?: string\n"
            "  migrationToken?: string\n"
            "  citizenName: string\n"
            "  nationalId: string | null\n"
            "  gender: string | null\n"
            "  fromVillageName: string\n"
            "  fromWardName: string\n"
            "  fromDistrictName: string\n"
            "}",
        ),
        (
            "        <Bell size={18} color={G} />\n"
            "        <Text style={{ fontSize: 16, fontWeight: '800', color: T.text }}>Migration Requests</Text>\n"
            "      </View>\n"
            "\n"
            "      {loading ? (",
            "        <Bell size={18} color={G} />\n"
            "        <Text style={{ fontSize: 16, fontWeight: '800', color: T.text }}>Migration Requests</Text>\n"
            "      </View>\n"
            "\n"
            "      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>\n"
            "        <Text style={{ fontSize: 11, color: T.textDim }}>\n"
            "          Tip: if the citizen already has their NIN and migration token in hand, use \"Incoming Citizen\"\n"
            "          from the Migration menu to confirm instantly instead of waiting for it to appear below.\n"
            "        </Text>\n"
            "      </View>\n"
            "\n"
            "      {loading ? (",
        ),
        (
            "              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>\n"
            "                <MapPin size={12} color={T.textSub} />\n"
            "                <Text style={{ fontSize: 11, color: T.textSub, flex: 1 }}>\n"
            "                  From {row.fromVillageName}, {row.fromWardName}, {row.fromDistrictName}\n"
            "                </Text>\n"
            "              </View>\n"
            "\n"
            "              {row.reason ? (",
            "              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>\n"
            "                <MapPin size={12} color={T.textSub} />\n"
            "                <Text style={{ fontSize: 11, color: T.textSub, flex: 1 }}>\n"
            "                  From {row.fromVillageName}, {row.fromWardName}, {row.fromDistrictName}\n"
            "                </Text>\n"
            "              </View>\n"
            "\n"
            "              {row.migrationToken ? (\n"
            "                <Text style={{ fontSize: 10, color: T.textDim }}>\n"
            "                  Token: {row.migrationToken}\n"
            "                  {row.expiryDate ? ` · Valid until ${new Date(row.expiryDate).toLocaleDateString('en-TZ')}` : ''}\n"
            "                </Text>\n"
            "              ) : null}\n"
            "\n"
            "              {row.reason ? (",
        ),
    ]
    patch(path, marker, replacements, "MigrationRequestsScreen.tsx token/expiry display")


def main():
    print("=" * 78)
    print("ADLCS PATCH — Migration Incoming/Outgoing flow + Weekly trend charts")
    print("=" * 78)

    if not CODE.exists():
        print(f"\nERROR: {CODE} does not exist.")
        print("Run this script from the ADLCS project root (the folder containing `code/`).")
        sys.exit(1)

    patch_schema()
    create_manual_sql()
    patch_village_js()
    patch_admin_js()
    create_year_month_filter()
    patch_admin_dashboard()
    create_migration_home_screen()
    create_confirm_incoming_migration_screen()
    patch_app_js()
    patch_village_home_screen()
    patch_track_migration_screen()
    patch_migration_requests_screen()

    print("\n" + "=" * 78)
    if FAILURES:
        print(f"DONE WITH {len(FAILURES)} ISSUE(S) — review the [FAIL] lines above:")
        for f in FAILURES:
            print(f"  - {f}")
        sys.exit(1)
    else:
        print("DONE — all patches applied successfully.")
        print("\nNext steps:")
        print("  1. Run the new SQL in prisma/manual_sql/2026_08_migration_token.sql")
        print("     against your Supabase DB (this repo doesn't use `prisma migrate`).")
        print("  2. cd code/backend && npx prisma generate")
        print("  3. Rebuild/reload the mobile app and web admin dashboard.")
    print("=" * 78)


if __name__ == "__main__":
    main()
