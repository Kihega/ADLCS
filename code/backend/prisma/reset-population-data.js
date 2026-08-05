// prisma/reset-population-data.js
// PATCH-4: one-shot cleanup for a fresh start on REGISTERED POPULATION DATA.
//
// Deletes, in FK-safe order:
//   Migration -> Death -> Marriage -> CitizenChild -> Birth -> Citizen
// (this intentionally includes the seeded demo "test father/mother"
// citizens too — everything under Citizen goes, no exceptions).
//
// Also clears the precomputed population_snapshots table, since any rows
// in it reflect the population you're about to wipe.
//
// Left completely alone (NOT touched by this script):
//   - Region / District / Ward / Village  (geography reference data)
//   - HealthFacility                       (facility reference data)
//   - SuperAdmin / DistrictAdmin / VillageOfficer / HospitalOfficer
//     (your admin/officer accounts — re-seed fresh ones with
//     `node prisma/seed.js` after running this, see README below)
//   - AuditLog                             (historical record, not
//                                            "population")
//
// Usage (from inside backend/):
//   node prisma/reset-population-data.js --yes
//
// Omitting --yes prints a dry-run summary of what WOULD be deleted and
// exits without changing anything, so you can sanity-check row counts
// first.

const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const confirmed = process.argv.includes('--yes')

  const [migrations, deaths, marriages, citizenChildren, births, citizens] = await Promise.all([
    prisma.migration.count(),
    prisma.death.count(),
    prisma.marriage.count(),
    prisma.citizenChild.count(),
    prisma.birth.count(),
    prisma.citizen.count(),
  ])
  const testCitizens = await prisma.citizen.count({ where: { isTestData: true } })

  console.log('── Population data reset ─────────────────────────────────────────')
  console.log(`  Migrations:        ${migrations}`)
  console.log(`  Deaths:            ${deaths}`)
  console.log(`  Marriages:         ${marriages}`)
  console.log(`  Citizen-child links: ${citizenChildren}`)
  console.log(`  Births:            ${births}`)
  console.log(`  Citizens:          ${citizens}  (of which ${testCitizens} are seeded test citizens)`)

  if (!confirmed) {
    console.log('\nDry run only — nothing was deleted.')
    console.log('Re-run with --yes to actually delete all of the above.\n')
    await prisma.$disconnect()
    return
  }

  console.log('\n--yes given — deleting now...')

  // Children first, so no foreign key still points at a Citizen row we're
  // about to remove.
  await prisma.migration.deleteMany({})
  await prisma.death.deleteMany({})
  await prisma.marriage.deleteMany({})
  await prisma.citizenChild.deleteMany({})
  await prisma.birth.deleteMany({})

  // Officer/admin accounts each optionally link to a Citizen record (used
  // to confirm their identity via Birth ID at registration time) — release
  // that link before wiping Citizens so we don't leave a dangling FK.
  await prisma.superAdmin.updateMany({ where: { citizenId: { not: null } }, data: { citizenId: null } })
  await prisma.districtAdmin.updateMany({ where: { citizenId: { not: null } }, data: { citizenId: null } })
  await prisma.villageOfficer.updateMany({ where: { citizenId: { not: null } }, data: { citizenId: null } })
  await prisma.hospitalOfficer.updateMany({ where: { citizenId: { not: null } }, data: { citizenId: null } })

  const { count: citizensDeleted } = await prisma.citizen.deleteMany({})

  // Any previously-generated snapshot now describes population that no
  // longer exists — clear it too.
  const { count: snapshotsDeleted } = await prisma.populationSnapshot.deleteMany({}).catch(() => ({ count: 0 }))

  console.log(`\nDone. Deleted ${citizensDeleted} citizen(s) and ${snapshotsDeleted} snapshot row(s).`)
  console.log('Geography, health facilities, admin/officer accounts, and audit logs were left untouched.')
  console.log('\nNext: run `node prisma/seed.js` to re-seed the test admin/officer accounts')
  console.log('and the two demo test citizens (now flagged isTestData, so they will not')
  console.log('count toward population snapshots), then start registering real citizens.\n')

  await prisma.$disconnect()
}

main().catch((err) => {
  console.error('[reset-population-data]', err)
  prisma.$disconnect()
  process.exit(1)
})
