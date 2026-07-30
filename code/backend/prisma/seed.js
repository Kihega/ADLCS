// prisma/seed.js
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
