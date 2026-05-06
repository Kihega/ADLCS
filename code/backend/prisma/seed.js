/**
 * seed.js — ADLCS Test User Seeder
 *
 * Creates 4 test accounts (one per role) so the login flow can be
 * verified end-to-end without a real database migration.
 *
 * FK creation order:
 *   1. SuperAdmin         (no parent required — createdById is optional)
 *   2. DistrictAdmin      (createdById → SuperAdmin.id)
 *   3. VillageOfficer     (createdById → DistrictAdmin.id)
 *   4. HospitalOfficer    (createdById → DistrictAdmin.id)
 *
 * Run with:
 *   node prisma/seed.js
 *   — or —
 *   npm run prisma:seed
 *
 * ⚠️  Safe to re-run — uses upsert so existing records are updated,
 *     not duplicated.
 */

require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const prisma = new PrismaClient()

// ── Test credentials (change before any real deployment) ──────────────────────
const TEST_PASSWORD = 'Admin@1234'
const BCRYPT_ROUNDS = 12

const USERS = {
  superAdmin: {
    employeeId:  'SA-0001',
    nidaNumber:  'SA00000000000001',
    fullName:    'Super Admin Test',
    email:       'super@adlcs.tz',
    mobile:      '+255700000001',
    department:  'NBS Headquarters',
    status:      'active',
  },
  districtAdmin: {
    employeeId:  'DA-0001',
    nidaNumber:  'DA00000000000001',
    fullName:    'District Admin Test',
    email:       'district@adlcs.tz',
    mobile:      '+255700000002',
    status:      'active',
  },
  villageOfficer: {
    employeeId:  'VO-0001',
    nidaNumber:  'VO00000000000001',
    fullName:    'Village Officer Test',
    email:       'village@adlcs.tz',
    mobile:      '+255700000003',
    status:      'active',
  },
  hospitalOfficer: {
    employeeId:  'HO-0001',
    nidaNumber:  'HO00000000000001',
    fullName:    'Hospital Officer Test',
    email:       'hospital@adlcs.tz',
    mobile:      '+255700000004',
    status:      'active',
  },
}

async function main() {
  console.log('🌱  ADLCS Seed — Starting...\n')

  // Hash the shared test password once
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS)
  console.log('🔑  Password hashed\n')

  // ── 1. SuperAdmin ───────────────────────────────────────────────────────────
  const superAdmin = await prisma.superAdmin.upsert({
    where:  { email: USERS.superAdmin.email },
    update: { passwordHash, status: 'active' },
    create: { ...USERS.superAdmin, passwordHash, mfaEnabled: false },
  })
  console.log(`✅  SuperAdmin       → ${superAdmin.email}  (id: ${superAdmin.id})`)

  // ── 2. DistrictAdmin  (createdById → superAdmin) ────────────────────────────
  const districtAdmin = await prisma.districtAdmin.upsert({
    where:  { email: USERS.districtAdmin.email },
    update: { passwordHash, status: 'active' },
    create: {
      ...USERS.districtAdmin,
      passwordHash,
      mfaEnabled:  false,
      createdById: superAdmin.id,
    },
  })
  console.log(`✅  DistrictAdmin    → ${districtAdmin.email}  (id: ${districtAdmin.id})`)

  // ── 3. VillageOfficer (createdById → districtAdmin) ─────────────────────────
  const villageOfficer = await prisma.villageOfficer.upsert({
    where:  { email: USERS.villageOfficer.email },
    update: { passwordHash, status: 'active' },
    create: {
      ...USERS.villageOfficer,
      passwordHash,
      mfaEnabled:  false,
      createdById: districtAdmin.id,
    },
  })
  console.log(`✅  VillageOfficer   → ${villageOfficer.email}  (id: ${villageOfficer.id})`)

  // ── 4. HospitalOfficer (createdById → districtAdmin) ────────────────────────
  const hospitalOfficer = await prisma.hospitalOfficer.upsert({
    where:  { email: USERS.hospitalOfficer.email },
    update: { passwordHash, status: 'active' },
    create: {
      ...USERS.hospitalOfficer,
      passwordHash,
      mfaEnabled:  false,
      createdById: districtAdmin.id,
    },
  })
  console.log(`✅  HospitalOfficer  → ${hospitalOfficer.email}  (id: ${hospitalOfficer.id})`)

  console.log('\n═══════════════════════════════════════════════════════')
  console.log('  ✅  Seed complete — 4 test users ready')
  console.log('═══════════════════════════════════════════════════════')
  console.log('\n  Test credentials (ALL accounts):')
  console.log(`  Password : ${TEST_PASSWORD}`)
  console.log('\n  Accounts:')
  console.log('  ┌─────────────────────────────┬────────────────────────┬──────────────────┐')
  console.log('  │ Role                        │ Email                  │ Status           │')
  console.log('  ├─────────────────────────────┼────────────────────────┼──────────────────┤')
  console.log('  │ super_admin                 │ super@adlcs.tz         │ active (no MFA)  │')
  console.log('  │ district_admin              │ district@adlcs.tz      │ active (no MFA)  │')
  console.log('  │ village_officer             │ village@adlcs.tz       │ active (no MFA)  │')
  console.log('  │ hospital_officer            │ hospital@adlcs.tz      │ active (no MFA)  │')
  console.log('  └─────────────────────────────┴────────────────────────┴──────────────────┘')
  console.log()
}

main()
  .catch((e) => {
    console.error('❌  Seed failed:', e.message)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
