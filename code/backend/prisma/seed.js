/**
 * seed.js — ADLCS Test Data Seeder  v2.1
 *
 * Creates all data needed to run the Hospital Officer birth-registration
 * flow end-to-end, including real geography, a health facility, staff
 * accounts, and two adult citizen records to serve as test parents.
 *
 * FK CREATION ORDER (must respect FK constraints):
 *   1.  Region          (no parent)
 *   2.  District        (→ Region)
 *   3.  Ward            (→ District)
 *   4.  Village         (→ Ward)
 *   5.  HealthFacility  (→ Village, optional)
 *   6.  SuperAdmin      (no FK)
 *   7.  DistrictAdmin   (→ SuperAdmin, Region, District)
 *   8.  VillageOfficer  (→ DistrictAdmin, Village, Ward, District)
 *   9.  HospitalOfficer (→ DistrictAdmin, HealthFacility, District)
 *   10. Citizen – Father (→ Region, Village, VillageOfficer)
 *   11. Citizen – Mother (→ Region, Village, VillageOfficer)
 *
 * IDEMPOTENT — safe to re-run:
 *   • Geography uses findFirst-or-create (no unique name constraint).
 *   • All user + citizen records use upsert on their unique key fields.
 *
 * RUN:
 *   npm run prisma:seed
 *   — or —
 *   node prisma/seed.js
 */

require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const prisma = new PrismaClient()

// ─── Shared password ─────────────────────────────────────────────────────────
const TEST_PASSWORD  = 'Admin@1234'
const BCRYPT_ROUNDS  = 12

// ─── Helper: find-first-or-create for models without a unique name field ─────
async function getOrCreate(modelName, findWhere, createData) {
  const existing = await prisma[modelName].findFirst({ where: findWhere })
  if (existing) {
    console.log(`   ↩  ${modelName} already exists: "${createData.name || JSON.stringify(findWhere)}"`)
    return existing
  }
  const created = await prisma[modelName].create({ data: createData })
  console.log(`   ✨ ${modelName} created:        "${created.name}" (id: ${created.id})`)
  return created
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🌱  ADLCS Seed v2.1 — Starting…\n')

  // ── STEP 0: Delete existing test accounts so hashes are always fresh ──────
  // This is the fix for "wrong credentials" — stale bcrypt hashes in the DB
  // after a code/env change are wiped and replaced with a clean hash below.
  console.log('🗑️   Deleting existing test accounts…')
  const deleteResults = await Promise.allSettled([
    prisma.hospitalOfficer.deleteMany({ where: { email: 'hospital@adlcs.tz' } }),
    prisma.villageOfficer.deleteMany({ where: { email: 'village@adlcs.tz' } }),
    prisma.districtAdmin.deleteMany({ where: { email: 'district@adlcs.tz' } }),
    prisma.superAdmin.deleteMany({ where: { email: 'super@adlcs.tz' } }),
  ])
  deleteResults.forEach((r, i) => {
    const labels = ['HospitalOfficer', 'VillageOfficer', 'DistrictAdmin', 'SuperAdmin']
    if (r.status === 'fulfilled') console.log(`   🗑️  Deleted ${labels[i]} test account (count: ${r.value.count})`)
    else console.warn(`   ⚠️  Delete ${labels[i]} warning:`, r.reason?.message)
  })
  console.log()

  const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS)
  console.log('🔑  Password hashed\n')

  // ══════════════════════════════════════════════════════════════════════════
  //  STEP 1 — GEOGRAPHY
  // ══════════════════════════════════════════════════════════════════════════
  console.log('📍  Geography…')

  // ── Regions ──────────────────────────────────────────────────────────────
  const regionDSM = await getOrCreate(
    'region',
    { name: 'Dar es Salaam', jurisdiction: 'mainland' },
    { name: 'Dar es Salaam', jurisdiction: 'mainland' },
  )
  const regionDodoma = await getOrCreate(
    'region',
    { name: 'Dodoma', jurisdiction: 'mainland' },
    { name: 'Dodoma', jurisdiction: 'mainland' },
  )

  // ── Districts ─────────────────────────────────────────────────────────────
  const districtKinondoni = await getOrCreate(
    'district',
    { name: 'Kinondoni', regionId: regionDSM.id },
    { name: 'Kinondoni', regionId: regionDSM.id },
  )
  const districtDodoma = await getOrCreate(
    'district',
    { name: 'Dodoma Urban', regionId: regionDodoma.id },
    { name: 'Dodoma Urban', regionId: regionDodoma.id },
  )

  // ── Ward ─────────────────────────────────────────────────────────────────
  const wardMwananyamala = await getOrCreate(
    'ward',
    { name: 'Mwananyamala', districtId: districtKinondoni.id },
    { name: 'Mwananyamala', districtId: districtKinondoni.id },
  )

  // ── Village ───────────────────────────────────────────────────────────────
  const villageKinondoni = await getOrCreate(
    'village',
    { name: 'Kinondoni', wardId: wardMwananyamala.id },
    { name: 'Kinondoni', wardId: wardMwananyamala.id },
  )

  console.log()

  // ══════════════════════════════════════════════════════════════════════════
  //  STEP 2 — HEALTH FACILITY
  // ══════════════════════════════════════════════════════════════════════════
  console.log('🏥  Health Facility…')

  const facility = await prisma.healthFacility.upsert({
    where:  { facilityRegNo: 'HF-DODOMA-REGIONAL-001' },
    update: {},
    create: {
      facilityRegNo:  'HF-DODOMA-REGIONAL-001',
      facilityName:   'Dodoma Regional Hospital',
      facilityType:   'hospital',
      facilityGrade:  'H',
      ownershipType:  'public',
      gpsLat:         -6.1730,
      gpsLng:          35.7395,
      // villageId intentionally omitted — Dodoma geography not fully seeded
    },
  })
  console.log(`   ✅  ${facility.facilityName}  (id: ${facility.id})`)
  console.log()

  // ══════════════════════════════════════════════════════════════════════════
  //  STEP 3 — STAFF ACCOUNTS
  // ══════════════════════════════════════════════════════════════════════════
  console.log('👤  Staff accounts…')

  // ── SuperAdmin ────────────────────────────────────────────────────────────
  const superAdmin = await prisma.superAdmin.upsert({
    where:  { email: 'super@adlcs.tz' },
    update: { passwordHash, status: 'active' },
    create: {
      employeeId:  'SA-0001',
      nidaNumber:  'SA00000000000001',
      fullName:    'Super Admin Test',
      email:       'super@adlcs.tz',
      mobile:      '+255700000001',
      department:  'NBS Headquarters',
      status:      'active',
      mfaEnabled:  false,
      passwordHash,
    },
  })
  console.log(`   ✅  SuperAdmin       → ${superAdmin.email}`)

  // ── DistrictAdmin (scoped to Kinondoni, Dar es Salaam) ───────────────────
  const districtAdmin = await prisma.districtAdmin.upsert({
    where:  { email: 'district@adlcs.tz' },
    update: { passwordHash, status: 'active', regionId: regionDSM.id, districtId: districtKinondoni.id },
    create: {
      employeeId:  'DA-0001',
      nidaNumber:  'DA00000000000001',
      fullName:    'District Admin Test',
      email:       'district@adlcs.tz',
      mobile:      '+255700000002',
      status:      'active',
      mfaEnabled:  false,
      passwordHash,
      regionId:    regionDSM.id,
      districtId:  districtKinondoni.id,
      createdById: superAdmin.id,
    },
  })
  console.log(`   ✅  DistrictAdmin    → ${districtAdmin.email}  (district: Kinondoni)`)

  // ── VillageOfficer (Kinondoni village) ────────────────────────────────────
  const villageOfficer = await prisma.villageOfficer.upsert({
    where:  { email: 'village@adlcs.tz' },
    update: {
      passwordHash, status: 'active',
      villageId: villageKinondoni.id,
      wardId:    wardMwananyamala.id,
      districtId: districtKinondoni.id,
    },
    create: {
      employeeId:  'VO-0001',
      nidaNumber:  'VO00000000000001',
      fullName:    'Village Officer Test',
      email:       'village@adlcs.tz',
      mobile:      '+255700000003',
      status:      'active',
      mfaEnabled:  false,
      passwordHash,
      villageId:   villageKinondoni.id,
      wardId:      wardMwananyamala.id,
      districtId:  districtKinondoni.id,
      createdById: districtAdmin.id,
    },
  })
  console.log(`   ✅  VillageOfficer   → ${villageOfficer.email}  (village: Kinondoni)`)

  // ── HospitalOfficer (Dodoma Regional Hospital) ────────────────────────────
  const hospitalOfficer = await prisma.hospitalOfficer.upsert({
    where:  { email: 'hospital@adlcs.tz' },
    update: {
      passwordHash, status: 'active',
      facilityId: facility.id,
      districtId: districtDodoma.id,
    },
    create: {
      employeeId:  'HO-0001',
      nidaNumber:  'HO00000000000001',
      fullName:    'Hospital Officer Test',
      email:       'hospital@adlcs.tz',
      mobile:      '+255700000004',
      status:      'active',
      mfaEnabled:  false,
      passwordHash,
      facilityId:  facility.id,
      districtId:  districtDodoma.id,
      createdById: districtAdmin.id,
    },
  })
  console.log(`   ✅  HospitalOfficer  → ${hospitalOfficer.email}  (facility: Dodoma Regional Hospital)`)
  console.log()

  // ══════════════════════════════════════════════════════════════════════════
  //  STEP 4 — TEST PARENT CITIZENS
  //
  //  These two records are what the Hospital Officer's RegisterBirth screen
  //  fetches when it validates a parent NID against the internal DB.
  //
  //  NID format: YYYYMMDD-LLLLL-SSSSS-CC
  //    YYYYMMDD → date of birth
  //    LLLLL    → location code (07=DSM region, 03=Kinondoni district, 1=ward)
  //    SSSSS    → unique sequence
  //    CC       → check digits
  // ══════════════════════════════════════════════════════════════════════════
  console.log('👨‍👩‍  Test Parent Citizens…')

  // ── Father: John Michael Makonde ──────────────────────────────────────────
  const father = await prisma.citizen.upsert({
    where:  { nationalId: '19850315-07031-00001-24' },
    update: {
      // keep up-to-date if re-seeded
      age:         41,
      vitalStatus: 'alive',
    },
    create: {
      nationalId:      '19850315-07031-00001-24',
      firstName:       'John',
      middleName:      'Michael',
      surname:         'Makonde',
      gender:          'male',
      dateOfBirth:     new Date('1985-03-15'),
      age:             41,
      vitalStatus:     'alive',
      bloodGroup:      'O+',
      maritalStatus:   'married',
      educationLevel:  'bachelor',
      occupations:     JSON.stringify(['Civil Engineer']),
      streetName:      'Mwananyamala Street',
      houseRegNumber:  'KIN-2021-0047',
      currentVillageId: villageKinondoni.id,
      regionId:        regionDSM.id,
      registeredById:  villageOfficer.id,
      registeredAt:    new Date('2003-03-15'),   // registered at 18
      idCardIssued:    new Date('2003-03-20'),
      idCardExpires:   new Date('2013-03-20'),
      healthInsurance: JSON.stringify({ provider: 'NHIF', memberNo: 'NHIF-0047821' }),
    },
  })
  console.log(`   ✅  Father → ${father.firstName} ${father.middleName} ${father.surname}`)
  console.log(`            NID: ${father.nationalId}  Age: ${father.age}  Status: ${father.vitalStatus.toUpperCase()}`)

  // ── Mother: Grace Rose Mwamba ─────────────────────────────────────────────
  const mother = await prisma.citizen.upsert({
    where:  { nationalId: '19880622-07031-00002-13' },
    update: {
      age:         37,
      vitalStatus: 'alive',
    },
    create: {
      nationalId:      '19880622-07031-00002-13',
      firstName:       'Grace',
      middleName:      'Rose',
      surname:         'Mwamba',
      gender:          'female',
      dateOfBirth:     new Date('1988-06-22'),
      age:             37,
      vitalStatus:     'alive',
      bloodGroup:      'A+',
      maritalStatus:   'married',
      educationLevel:  'diploma',
      occupations:     JSON.stringify(['Registered Nurse']),
      streetName:      'Mwananyamala Street',
      houseRegNumber:  'KIN-2021-0047',   // same household as father
      currentVillageId: villageKinondoni.id,
      regionId:        regionDSM.id,
      registeredById:  villageOfficer.id,
      registeredAt:    new Date('2006-06-22'),   // registered at 18
      idCardIssued:    new Date('2006-06-28'),
      idCardExpires:   new Date('2016-06-28'),
      healthInsurance: JSON.stringify({ provider: 'NHIF', memberNo: 'NHIF-0051204' }),
      // link to father as spouse (stored via marriage record, not direct FK)
    },
  })
  console.log(`   ✅  Mother → ${mother.firstName} ${mother.middleName} ${mother.surname}`)
  console.log(`            NID: ${mother.nationalId}  Age: ${mother.age}  Status: ${mother.vitalStatus.toUpperCase()}`)
  console.log()

  // ══════════════════════════════════════════════════════════════════════════
  //  SUMMARY
  // ══════════════════════════════════════════════════════════════════════════
  console.log('═'.repeat(63))
  console.log('  ✅  Seed v2.1 complete')
  console.log('═'.repeat(63))
  console.log()
  console.log('  STAFF LOGIN (shared password: Admin@1234)')
  console.log()
  console.log('  ┌─────────────────────┬────────────────────────┐')
  console.log('  │ Role                │ Email                  │')
  console.log('  ├─────────────────────┼────────────────────────┤')
  console.log('  │ super_admin         │ super@adlcs.tz         │')
  console.log('  │ district_admin      │ district@adlcs.tz      │')
  console.log('  │ village_officer     │ village@adlcs.tz       │')
  console.log('  │ hospital_officer    │ hospital@adlcs.tz      │')
  console.log('  └─────────────────────┴────────────────────────┘')
  console.log()
  console.log('  TEST PARENTS (for RegisterBirth screen)')
  console.log()
  console.log('  Father: John Michael Makonde')
  console.log('          NID: 19850315-07031-00001-24')
  console.log()
  console.log('  Mother: Grace Rose Mwamba')
  console.log('          NID: 19880622-07031-00002-13')
  console.log()
  console.log('  ⚡ Use the "Auto-fill test ID" button in the app,')
  console.log('     or type the NIDs manually and tap Search.')
  console.log()
  console.log('  GEOGRAPHY SEEDED')
  console.log(`  Region:   Dar es Salaam (id: ${regionDSM.id})`)
  console.log(`  District: Kinondoni     (id: ${districtKinondoni.id})`)
  console.log(`  Ward:     Mwananyamala  (id: ${wardMwananyamala.id})`)
  console.log(`  Village:  Kinondoni     (id: ${villageKinondoni.id})`)
  console.log(`  Facility: Dodoma Regional Hospital (id: ${facility.id})`)
  console.log()
}

main()
  .catch((e) => {
    console.error('\n❌  Seed failed:', e.message)
    if (e.code) console.error('   Prisma error code:', e.code)
    if (e.meta) console.error('   Meta:', JSON.stringify(e.meta, null, 2))
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
