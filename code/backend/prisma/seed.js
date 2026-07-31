// prisma/seed.js
// PATCH-SEED-FKFIX-2026: fixes a real bug from the previous seed.js rewrite
// — Step 0 was deleting old test Village/Hospital Officers and District/
// Super Admins directly, before deleting the records that still reference
// them (migrations, deaths, marriages, births, citizens from a previous
// seed run). Postgres correctly rejected that with a foreign-key violation
// (e.g. `migrations_source_officer_id_fkey`). Cleanup now deletes/unlinks
// dependents FIRST, parents last.
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

// PATCH-SEED-REGIONFIX-2026: unlike District/Ward/Village, Region.name is
// NOT a unique column in this schema (only `id` is) — upsert-by-name is
// invalid here. Use the same find-first, create-if-missing pattern as the
// other geo helpers below instead.
// PATCH-REGION-JURISDICTION-FIX-2026: Region.jurisdiction is a REQUIRED enum
// (mainland | zanzibar) with no default — creating a brand-new region
// without it fails. Every region this script seeds is mainland Tanzania.
async function getOrCreateRegion(name, jurisdiction = 'mainland') {
  const existing = await prisma.region.findFirst({ where: { name } })
  if (existing) return existing
  return prisma.region.create({ data: { name, jurisdiction } })
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

// PATCH-SEED-FKFIX-2026: dependency-safe cleanup of any test data left over
// from a previous run of this seed script (or an earlier version of it).
async function cleanupOldTestData() {
  const oldAndNewEmails = [
    'super@adlcs.tz', 'district@adlcs.tz', 'village@adlcs.tz', 'hospital@adlcs.tz',
    'sinakishosha@gmail.com', 'kuhega2025@gmail.com',
  ]
  const oldAndNewBirthIds = ['BID-FATHER0001', 'BID-MOTHER0001']

  // ── Step A: find old test accounts by email ──────────────────────────────
  const oldSuperAdmins    = await prisma.superAdmin.findMany({ where: { email: { in: oldAndNewEmails } }, select: { id: true } })
  const oldDistrictAdmins = await prisma.districtAdmin.findMany({ where: { email: { in: oldAndNewEmails } }, select: { id: true } })
  let saIds = oldSuperAdmins.map(a => a.id)
  let daIds = oldDistrictAdmins.map(a => a.id)

  // Sweep up any District Admins created BY those Super Admins in a
  // previous run (a leftover chain), so deleting the root doesn't fail.
  if (saIds.length) {
    const chained = await prisma.districtAdmin.findMany({ where: { createdById: { in: saIds } }, select: { id: true } })
    daIds = [...new Set([...daIds, ...chained.map(a => a.id)])]
  }

  const oldVillageOfficers = await prisma.villageOfficer.findMany({
    where: { OR: [{ email: { in: oldAndNewEmails } }, ...(daIds.length ? [{ createdById: { in: daIds } }] : [])] },
    select: { id: true },
  })
  const oldHospitalOfficers = await prisma.hospitalOfficer.findMany({
    where: { OR: [{ email: { in: oldAndNewEmails } }, ...(daIds.length ? [{ createdById: { in: daIds } }] : [])] },
    select: { id: true },
  })
  const voIds = oldVillageOfficers.map(o => o.id)
  const hoIds = oldHospitalOfficers.map(o => o.id)

  const oldCitizens = await prisma.citizen.findMany({ where: { birthId: { in: oldAndNewBirthIds } }, select: { id: true } })
  const citizenIds = oldCitizens.map(c => c.id)

  if (!voIds.length && !hoIds.length && !daIds.length && !saIds.length && !citizenIds.length) {
    console.log('  No previous test data found — clean slate.')
    return
  }

  // ── Step B: delete records that reference these officers/citizens ───────
  // (children before parents — this is the fix: the previous version of
  // this script deleted the officers/admins FIRST, which Postgres rejects
  // if anything still points at them.)
  await prisma.migration.deleteMany({
    where: { OR: [
      { sourceOfficerId: { in: voIds } },
      { targetOfficerId: { in: voIds } },
      { citizenId: { in: citizenIds } },
    ] },
  })
  await prisma.death.deleteMany({
    where: { OR: [
      { villageOfficerId: { in: voIds } },
      { hospitalOfficerId: { in: hoIds } },
      { citizenId: { in: citizenIds } },
      { infantFatherId: { in: citizenIds } },
      { infantMotherId: { in: citizenIds } },
    ] },
  })
  await prisma.marriage.deleteMany({
    where: { OR: [
      { registeredById: { in: voIds } },
      { husbandId: { in: citizenIds } },
      { wifeId: { in: citizenIds } },
    ] },
  })
  await prisma.birth.deleteMany({
    where: { OR: [
      { officerId: { in: hoIds } },
      { childCitizenId: { in: citizenIds } },
      { fatherCitizenId: { in: citizenIds } },
      { motherCitizenId: { in: citizenIds } },
    ] },
  })

  // ── Step C: unlink (never delete) anything else that merely points at
  // these officers/citizens, so unrelated real records are preserved ──────
  if (voIds.length) {
    await prisma.citizen.updateMany({ where: { registeredById: { in: voIds } }, data: { registeredById: null } })
  }
  if (citizenIds.length) {
    await prisma.citizen.updateMany({ where: { fatherCitizenId: { in: citizenIds } }, data: { fatherCitizenId: null } })
    await prisma.citizen.updateMany({ where: { motherCitizenId: { in: citizenIds } }, data: { motherCitizenId: null } })
  }

  // ── Step D: now safe to delete, parents last ─────────────────────────────
  await prisma.citizen.deleteMany({ where: { id: { in: citizenIds } } })
  await prisma.villageOfficer.deleteMany({ where: { id: { in: voIds } } })
  await prisma.hospitalOfficer.deleteMany({ where: { id: { in: hoIds } } })
  await prisma.districtAdmin.deleteMany({ where: { id: { in: daIds } } })
  await prisma.superAdmin.deleteMany({ where: { id: { in: saIds } } })

  console.log('  Cleared previous test admins/officers/citizens and their dependent records')
}

async function main() {
  console.log('── Seeding TzCRVS test data ──────────────────────────────────────')

  // ── Step 0: clean slate for anything from a previous seed run ─────────────
  await cleanupOldTestData()

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
      // PATCH-DISTRICTADMIN-DEPT-FIX-2026: DistrictAdmin has no `department`
      // column in this schema (unlike SuperAdmin) — removed.
      regionId:     region.id,
      districtId:   district.id,
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
