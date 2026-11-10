#!/usr/bin/env node
/**
 * backend/scripts/patch2-db.js — one-off database clean-up for patch2
 *
 *   cd backend
 *   node scripts/patch2-db.js             # DRY RUN: shows exactly what would change
 *   node scripts/patch2-db.js --yes       # really does it
 *   node scripts/patch2-db.js --list      # dry run, but print EVERY citizen row
 *
 * What it does (each step is safe to repeat):
 *
 *  1. MARRIAGES   Drops the marriages table and its enum types (the feature
 *                 was removed from the app).
 *  2. OFFICER NAMES
 *                 Village officer (village@adlcs.tz) -> "Peter Kimani"
 *                 Hospital officer (hospital@adlcs.tz) -> "Maria Josph"
 *                 Nothing else about those accounts is touched.
 *  3. CITIZENS    Deletes every registered citizen so you can start fresh,
 *                 EXCEPT a citizen that is a National (super) admin, Regional
 *                 (district) admin, Village officer or Hospital officer.
 *                 A citizen is kept when ANY of these is true:
 *                   - an admin/officer account points at it (citizen_id), or
 *                   - the citizen's Birth ID equals an admin/officer Birth ID, or
 *                   - the citizen's NIN equals an admin/officer Birth ID / NIN-like id.
 *                 The list is printed sorted by Birth ID (BID), then NIN.
 *                 Their births / deaths / migrations / child links / parent
 *                 links are removed too, and the population snapshots are cleared.
 *
 * Geography, health facilities, admin/officer accounts and audit logs are never deleted.
 */
require('dotenv').config()

const OFFICER_RENAMES = [
  { label: 'Village officer', model: 'villageOfficer', email: 'village@adlcs.tz', oldName: 'Village Officer Test', newName: 'Peter Kimani' },
  { label: 'Hospital officer', model: 'hospitalOfficer', email: 'hospital@adlcs.tz', oldName: 'Hospital Officer Test', newName: 'Maria Josph' },
]

const STAFF_MODELS = [
  { model: 'superAdmin', role: 'National admin' },
  { model: 'districtAdmin', role: 'Regional admin' },
  { model: 'villageOfficer', role: 'Village officer' },
  { model: 'hospitalOfficer', role: 'Hospital officer' },
]

const norm = (v) => (v === null || v === undefined ? '' : String(v).trim().toUpperCase())

function cmpNullsLast(a, b) {
  const x = norm(a)
  const y = norm(b)
  if (x && !y) return -1
  if (!x && y) return 1
  return x < y ? -1 : x > y ? 1 : 0
}

/**
 * Pure planning function (unit-testable, no database access).
 *   citizens: [{ id, birthId, nationalId, firstName, middleName, surname }]
 *   staff:    [{ role, fullName, email, birthId, citizenId }]
 * Returns { keep: [{...citizen, reason}], remove: [citizen] } both sorted by BID then NIN.
 */
function planCleanup(citizens, staff) {
  const byCitizenId = new Map()
  const byBirthId = new Map()
  for (const s of staff) {
    if (s.citizenId) byCitizenId.set(s.citizenId, s)
    if (norm(s.birthId)) byBirthId.set(norm(s.birthId), s)
  }
  const keep = []
  const remove = []
  for (const c of citizens) {
    let owner = byCitizenId.get(c.id)
    let how = 'linked account'
    if (!owner && norm(c.birthId) && byBirthId.has(norm(c.birthId))) {
      owner = byBirthId.get(norm(c.birthId))
      how = 'Birth ID matches account'
    }
    if (!owner && norm(c.nationalId) && byBirthId.has(norm(c.nationalId))) {
      owner = byBirthId.get(norm(c.nationalId))
      how = 'NIN matches account'
    }
    if (owner) keep.push({ ...c, reason: `${owner.role} — ${owner.fullName} (${how})` })
    else remove.push(c)
  }
  const sorter = (a, b) => cmpNullsLast(a.birthId, b.birthId) || cmpNullsLast(a.nationalId, b.nationalId)
  keep.sort(sorter)
  remove.sort(sorter)
  return { keep, remove }
}

function chunk(arr, n = 1000) {
  const out = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

function fullName(c) {
  return [c.firstName, c.middleName, c.surname].filter(Boolean).join(' ')
}

function row(c) {
  return `  ${(c.birthId || '—').padEnd(22)} ${(c.nationalId || '—').padEnd(22)} ${fullName(c)}`
}

async function dropMarriage(prisma, yes) {
  console.log('\n[1/3] Marriage tables')
  let exists = false
  try {
    const r = await prisma.$queryRawUnsafe(`SELECT to_regclass('public.marriages') IS NOT NULL AS present`)
    exists = !!(r && r[0] && r[0].present)
  } catch (e) {
    console.log('  Could not inspect the database:', e.message)
    return
  }
  if (!exists) {
    console.log('  Nothing to do — the marriages table is already gone.')
    return
  }
  const n = await prisma.$queryRawUnsafe('SELECT COUNT(*)::int AS n FROM "marriages"')
  console.log(`  marriages table present with ${n[0].n} row(s).`)
  if (!yes) return console.log('  (dry run) would DROP TABLE "marriages" and the Marriage* enum types.')
  await prisma.$executeRawUnsafe('DROP TABLE IF EXISTS "marriages" CASCADE')
  for (const t of ['MarriageStatus', 'KindOfMarriage', 'MarriageReligion']) {
    await prisma.$executeRawUnsafe(`DROP TYPE IF EXISTS "${t}"`)
  }
  console.log('  Dropped.')
}

async function renameOfficers(prisma, yes) {
  console.log('\n[2/3] Test officer names')
  for (const r of OFFICER_RENAMES) {
    const where = { OR: [{ email: r.email }, { fullName: r.oldName }] }
    const found = await prisma[r.model].findMany({ where, select: { id: true, fullName: true, email: true } })
    if (!found.length) {
      console.log(`  ${r.label}: no account with ${r.email} found — skipped.`)
      continue
    }
    for (const f of found) {
      if (f.fullName === r.newName) {
        console.log(`  ${r.label} (${f.email}) is already "${r.newName}".`)
        continue
      }
      console.log(`  ${r.label} (${f.email}): "${f.fullName}" -> "${r.newName}"${yes ? '' : '   (dry run)'}`)
      if (yes) await prisma[r.model].update({ where: { id: f.id }, data: { fullName: r.newName } })
    }
  }
}

async function cleanCitizens(prisma, yes, listAll) {
  console.log('\n[3/3] Registered citizens')
  const staff = []
  for (const s of STAFF_MODELS) {
    const rows = await prisma[s.model].findMany({ select: { fullName: true, email: true, birthId: true, citizenId: true } })
    for (const r of rows) staff.push({ ...r, role: s.role })
  }
  const citizens = await prisma.citizen.findMany({
    select: { id: true, birthId: true, nationalId: true, firstName: true, middleName: true, surname: true },
  })
  const { keep, remove } = planCleanup(citizens, staff)

  console.log(`  ${citizens.length} citizen(s) in the database, sorted by Birth ID then NIN.`)
  console.log(`\n  KEEP (${keep.length}) — admin / officer identities:`)
  keep.forEach((c) => console.log(row(c) + `   <- ${c.reason}`))
  console.log(`\n  DELETE (${remove.length}):`)
  console.log(`  ${'BIRTH ID'.padEnd(22)} ${'NIN'.padEnd(22)} NAME`)
  const shown = listAll ? remove : remove.slice(0, 25)
  shown.forEach((c) => console.log(row(c)))
  if (remove.length > shown.length) console.log(`  … and ${remove.length - shown.length} more (use --list to print all).`)

  if (!yes) {
    console.log('\n  (dry run) nothing deleted.')
    return
  }
  if (!remove.length) {
    console.log('\n  Nothing to delete.')
  } else {
    const ids = remove.map((c) => c.id)
    await prisma.$transaction(
      async (tx) => {
        for (const part of chunk(ids)) {
          const inIds = { in: part }
          await tx.citizenChild.deleteMany({ where: { OR: [{ parentCitizenId: inIds }, { childCitizenId: inIds }] } })
          await tx.migration.deleteMany({ where: { citizenId: inIds } })
          await tx.death.deleteMany({ where: { citizenId: inIds } })
          await tx.death.updateMany({ where: { infantFatherId: inIds }, data: { infantFatherId: null } })
          await tx.death.updateMany({ where: { infantMotherId: inIds }, data: { infantMotherId: null } })
          await tx.birth.deleteMany({ where: { childCitizenId: inIds } })
          await tx.birth.updateMany({ where: { fatherCitizenId: inIds }, data: { fatherCitizenId: null } })
          await tx.birth.updateMany({ where: { motherCitizenId: inIds }, data: { motherCitizenId: null } })
          await tx.citizen.updateMany({ where: { fatherCitizenId: inIds }, data: { fatherCitizenId: null } })
          await tx.citizen.updateMany({ where: { motherCitizenId: inIds }, data: { motherCitizenId: null } })
        }
        for (const part of chunk(ids)) await tx.citizen.deleteMany({ where: { id: { in: part } } })
      },
      { timeout: 300000, maxWait: 30000 }
    )
    console.log(`\n  Deleted ${remove.length} citizen(s) and their births / deaths / migrations.`)
  }
  const snap = await prisma.populationSnapshot.deleteMany({}).catch(() => ({ count: 0 }))
  console.log(`  Cleared ${snap.count} population snapshot row(s).`)
}

async function main() {
  const yes = process.argv.includes('--yes')
  const listAll = process.argv.includes('--list')
  const { PrismaClient } = require('@prisma/client')
  const prisma = new PrismaClient()
  console.log(yes ? '== patch2-db: APPLYING CHANGES ==' : '== patch2-db: DRY RUN (add --yes to apply) ==')
  try {
    await dropMarriage(prisma, yes)
    await renameOfficers(prisma, yes)
    await cleanCitizens(prisma, yes, listAll)
    console.log(yes ? '\nDone.\n' : '\nDry run finished — nothing was changed. Re-run with --yes to apply.\n')
  } finally {
    await prisma.$disconnect()
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[patch2-db] failed:', err)
    process.exit(1)
  })
}

module.exports = { planCleanup, cleanCitizens, renameOfficers, dropMarriage }
