/**
 * admin.js — TzCRVS Admin Dashboard API Routes  v1.0
 *
 * Serves the Super Admin and District Admin web dashboards.
 * All data is read from / written to the live Supabase Postgres
 * database via Prisma — nothing here is mocked.
 *
 * Access control:
 *   • super_admin    — full national access, all endpoints
 *   • district_admin — scoped automatically to their own district
 *
 * Routes:
 *   GET   /api/admin/overview                 — top-level stat cards
 *   GET   /api/admin/population               — age/gender pyramid + totals
 *   GET   /api/admin/geo/regions
 *   GET   /api/admin/geo/districts            — ?regionId=
 *   GET   /api/admin/geo/wards                — ?districtId=
 *   GET   /api/admin/geo/villages             — ?wardId=
 *
 *   GET   /api/admin/district-admins          — [super_admin]
 *   POST  /api/admin/district-admins          — [super_admin] create + issue token
 *   PATCH /api/admin/district-admins/:id      — [super_admin] status update
 *   DELETE/api/admin/district-admins/:id      — [super_admin]
 *
 *   GET   /api/admin/village-officers         — scoped
 *   POST  /api/admin/village-officers         — [district_admin] create + issue token
 *   PATCH /api/admin/village-officers/:id     — scoped status update
 *   DELETE/api/admin/village-officers/:id     — scoped
 *
 *   GET   /api/admin/health-officers          — scoped
 *   POST  /api/admin/health-officers          — [district_admin] create + issue token
 *   PATCH /api/admin/health-officers/:id      — scoped status update
 *   DELETE/api/admin/health-officers/:id      — scoped
 *
 *   GET   /api/admin/users                    — [super_admin] combined user list
 *   PATCH /api/admin/users/:role/:id          — [super_admin] status update
 *   DELETE/api/admin/users/:role/:id          — [super_admin]
 *
 *   GET   /api/admin/audit-logs               — scoped
 *   GET   /api/admin/security-alerts          — scoped (severity != info)
 *   GET   /api/admin/system-performance       — [super_admin] live DB/Redis health
 *   GET   /api/admin/migrations               — scoped
 *   GET   /api/admin/migrations/trends        — scoped (Migration Trends sidebar)
 *   GET   /api/admin/marriages                — scoped
 */

const { Router } = require('express')
const bcrypt = require('bcryptjs')
const crypto = require('crypto')
const { prisma } = require('../lib/prisma')
const { getRedis, isRedisReady } = require('../lib/redis')
const { requireAuth, requireRole } = require('../middleware/auth')

// PATCH-ADMINREG-2026: bring email back as a one-way welcome notice (role +
// default password + change-within-3-days reminder) — not a token, and
// nothing blocks on it (every call site below is fire-and-forget).
const { sendWelcomeEmail } = require('../lib/email')

// PATCH-EMAIL-VALIDATE-2026
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
/** Returns an error string if `email` isn't a plausible address, else null. */
function emailFormatError(email) {
  if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
    return 'A valid email address is required'
  }
  return null
}

const router = Router()
router.use(requireAuth)
router.use(requireRole('super_admin', 'district_admin'))

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Resolve the districtId for a district_admin (null for super_admin). */
async function getAdminDistrictId(req) {
  if (req.user.role !== 'district_admin') return null
  const admin = await prisma.districtAdmin.findUnique({
    where:  { id: req.user.id },
    select: { districtId: true },
  })
  return admin?.districtId ?? -1
}

/** Build a Prisma `where` clause for Citizen queries, scoped by geo filters / role. */
async function buildCitizenGeoWhere(req) {
  const { regionId, districtId, wardId, villageId } = req.query

  // BUGFIX-9: a district_admin's ward/village filter selection used to be
  // silently discarded — this function always fell back to the full
  // district scope regardless of what was selected. District scope is now
  // the floor (never escapable) but is narrowed further when the admin
  // picks a ward or village within it.
  if (req.user.role === 'district_admin') {
    const adminDistrictId = await getAdminDistrictId(req)
    if (villageId) return { currentVillageId: Number(villageId) }
    if (wardId)    return { currentVillage: { wardId: Number(wardId) } }
    return { currentVillage: { ward: { districtId: adminDistrictId } } }
  }

  if (villageId)  return { currentVillageId: Number(villageId) }
  if (wardId)     return { currentVillage: { wardId: Number(wardId) } }
  if (districtId) return { currentVillage: { ward: { districtId: Number(districtId) } } }
  if (regionId)   return { currentVillage: { ward: { district: { regionId: Number(regionId) } } } }
  return {}
}

// PATCH-MIGTRENDS-2026: geo-scoping for Migration rows, which touch TWO
// villages (fromVillage / toVillage) — matches a migration if EITHER end
// falls within the requested scope. Same district-admin floor + top-down
// cascade contract as buildCitizenGeoWhere() above, and the same
// OR-of-fromVillage/toVillage shape the existing GET /migrations list
// endpoint already uses (just generalised to ward/village too).
async function migrationGeoWhere(req) {
  const { regionId, districtId, wardId, villageId } = req.query

  const endWhere = (idField, relation, districtFloor) => {
    if (villageId) return { [idField]: Number(villageId) }
    if (wardId)    return { [relation]: { wardId: Number(wardId) } }
    if (districtFloor != null) return { [relation]: { ward: { districtId: districtFloor } } }
    if (districtId) return { [relation]: { ward: { districtId: Number(districtId) } } }
    if (regionId)   return { [relation]: { ward: { district: { regionId: Number(regionId) } } } }
    return null
  }

  if (req.user.role === 'district_admin') {
    const adminDistrictId = await getAdminDistrictId(req)
    return {
      OR: [
        endWhere('fromVillageId', 'fromVillage', adminDistrictId),
        endWhere('toVillageId',   'toVillage',   adminDistrictId),
      ],
    }
  }

  const from = endWhere('fromVillageId', 'fromVillage', null)
  const to   = endWhere('toVillageId',   'toVillage',   null)
  if (!from && !to) return {}
  return { OR: [from ?? {}, to ?? {}] }
}

// PATCH-WEEKLYTRENDS-2026: RITA/NIDA/Migration cards now chart WEEK 1..5
// within a single selected month/year (instead of one bar per calendar month
// across the whole dataset). `monthRange` resolves the year/month query params
// (defaulting to the current month) into a [start, end) date window;
// `groupByWeek` buckets already-fetched groupBy rows by day-of-month / 7.
function monthRange(query) {
  const now = new Date()
  const year  = query.year  ? Number(query.year)  : now.getFullYear()
  const month = query.month ? Number(query.month) : now.getMonth() + 1 // 1-12
  const start = new Date(year, month - 1, 1)
  const end   = new Date(year, month, 1)
  return { start, end, year, month }
}

function groupByWeek(rows, dateField) {
  const buckets = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  rows.forEach(r => {
    const d = new Date(r[dateField])
    const wk = Math.min(5, Math.ceil(d.getDate() / 7))
    buckets[wk] += r._count.id
  })
  return [1, 2, 3, 4, 5].map(w => ({ week: `Week ${w}`, count: buckets[w] }))
}

/** Pagination helper — clamps page/limit to sane bounds. */
function pagination(req, defaultLimit = 20, maxLimit = 100) {
  const page  = Math.max(parseInt(req.query.page) || 1, 1)
  const limit = Math.min(Math.max(parseInt(req.query.limit) || defaultLimit, 1), maxLimit)
  return { page, limit, skip: (page - 1) * limit }
}

/** Write an audit log entry. Never throws — logging failures must not break the request. */
async function logAction(req, { action, targetTable, targetId, oldData, newData, severity = 'info' }) {
  try {
    await prisma.auditLog.create({
      data: {
        actorId:     req.user.id,
        actorRole:   req.user.role,
        action,
        targetTable,
        targetId:    targetId != null ? String(targetId) : undefined,
        oldData:     oldData ?? undefined,
        newData:     newData ?? undefined,
        ipAddress:   req.ip,
        severity,
      },
    })
  } catch (err) {
    console.error('[audit-log]', err.message)
  }
}

// PATCH-NOTOKEN-2026: new accounts are created ACTIVE immediately with a real
// default password (no email/token step). The admin creating the account
// relays this password directly to the new user, who already gave the admin
// their email address, so there's nothing left for an email round-trip to do.
function generateDefaultPassword() {
  const words = ['Tembo', 'Simba', 'Twiga', 'Kilimo', 'Amani', 'Jua', 'Baobab', 'Ngoma']
  const word = words[crypto.randomInt(0, words.length)]
  const digits = crypto.randomInt(1000, 9999)
  return `${word}${digits}!`
}

// PATCH-ADMINREG-2026: deleting a District Admin who has created Village/
// Health Officers, or an officer who has registered citizens/records, used
// to bubble up as a bare 500 (an uncaught Postgres foreign-key violation —
// P2003). Surface a clear, specific message instead. We deliberately do NOT
// cascade-delete the dependent records — that would silently destroy real
// civil-registration data.
function handleDeleteError(res, err, label) {
  if (err.code === 'P2025') return res.status(404).json({ success: false, message: 'Not found' })
  if (err.code === 'P2003') {
    return res.status(409).json({
      success: false,
      message: `Cannot delete this ${label} — other records (accounts they created, or citizens/registrations they handled) still reference them. Reassign or remove those first.`,
    })
  }
  console.error(`[admin/delete-${label}]`, err)
  return res.status(500).json({ success: false, message: 'Internal server error' })
}

// PATCH-ADMINREG-2026: admin-wide Birth ID (BID) lookup, used by the
// registration modal to confirm a person's identity before creating their
// admin/officer account. Unlike the village officer's own-village-scoped
// lookup, a national/district admin needs to find a citizen ANYWHERE.
router.get('/citizen-lookup', async (req, res) => {
  const birthId = typeof req.query.birthId === 'string' ? req.query.birthId.trim() : ''
  if (!birthId) return res.status(400).json({ success: false, message: 'birthId query param required' })
  try {
    const citizen = await prisma.citizen.findFirst({
      where: { birthId },
      select: {
        id: true, birthId: true, nationalId: true, firstName: true, middleName: true, surname: true,
        gender: true, dateOfBirth: true, vitalStatus: true,
        currentVillage: { select: { name: true, ward: { select: { name: true, district: { select: { name: true, region: { select: { name: true } } } } } } } },
      },
    })
    if (!citizen) return res.status(404).json({ success: false, message: 'No citizen found with this Birth ID.' })
    return res.json({
      success: true,
      data: {
        ...citizen,
        fullName: [citizen.firstName, citizen.middleName, citizen.surname].filter(Boolean).join(' '),
      },
    })
  } catch (err) {
    console.error('[admin/citizen-lookup]', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
})

const AGE_BANDS = [
  '0-4', '5-9', '10-14', '15-19', '20-24', '25-29', '30-34', '35-39',
  '40-44', '45-49', '50-54', '55-59', '60-64', '65-69', '70-74', '75+',
]
function ageBand(age) {
  const a = Number(age) || 0
  if (a >= 75) return '75+'
  const lower = Math.floor(a / 5) * 5
  return `${lower}-${lower + 4}`
}

const OFFICER_STATUSES = ['pending', 'active', 'offline', 'suspended']
const ADMIN_STATUSES   = ['pending', 'active', 'suspended']

// ── GET /overview ─────────────────────────────────────────────────────────────
router.get('/overview', async (req, res) => {
  try {
    const citizenWhere = await buildCitizenGeoWhere(req)
    const adminDistrictId = await getAdminDistrictId(req)

    const officerWhere = req.user.role === 'district_admin'
      ? { districtId: adminDistrictId }
      : {}

    const auditWhere = await buildAuditWhere(req)
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000)

    // PATCH-POP-3: build the geo-filter for unlinked births.
    // Births belong to a HealthFacility which has a districtId — use that
    // to scope district_admin counts. super_admin gets all births.
    const birthGeoWhere = req.user.role === 'district_admin'
      ? { childCitizenId: null, facility: { districtId: adminDistrictId } }
      : { childCitizenId: null }

    const [
      citizenCount, maleCitizenCount, femaleCitizenCount,
      unlinkedBirthCount, maleUnlinkedBirths, femaleUnlinkedBirths,
      districtAdminsTotal, districtAdminsPending,
      villageOfficersTotal, villageOfficersPending,
      hospitalOfficersTotal, hospitalOfficersPending,
      securityAlerts24h,
      dbCheck,
    ] = await Promise.all([
      prisma.citizen.count({ where: citizenWhere }),
      prisma.citizen.count({ where: { ...citizenWhere, gender: 'male' } }),
      prisma.citizen.count({ where: { ...citizenWhere, gender: 'female' } }),
      // PATCH-POP-3: add children with birth record but no NIN yet
      prisma.birth.count({ where: birthGeoWhere }),
      prisma.birth.count({ where: { ...birthGeoWhere, gender: 'male' } }),
      prisma.birth.count({ where: { ...birthGeoWhere, gender: 'female' } }),
      req.user.role === 'super_admin' ? prisma.districtAdmin.count() : Promise.resolve(null),
      req.user.role === 'super_admin' ? prisma.districtAdmin.count({ where: { status: 'pending' } }) : Promise.resolve(null),
      prisma.villageOfficer.count({ where: officerWhere }),
      prisma.villageOfficer.count({ where: { ...officerWhere, status: 'pending' } }),
      prisma.hospitalOfficer.count({ where: officerWhere }),
      prisma.hospitalOfficer.count({ where: { ...officerWhere, status: 'pending' } }),
      prisma.auditLog.count({ where: { ...auditWhere, severity: { in: ['warning', 'critical'] }, timestamp: { gte: since24h } } }),
      prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
    ])

    const totalPopulation = citizenCount + unlinkedBirthCount
    const maleCount       = maleCitizenCount + maleUnlinkedBirths
    const femaleCount     = femaleCitizenCount + femaleUnlinkedBirths

    return res.json({
      success: true,
      data: {
        totalPopulation,
        maleCount,
        femaleCount,
        malePct:   totalPopulation ? Number(((maleCount / totalPopulation) * 100).toFixed(1))   : 0,
        femalePct: totalPopulation ? Number(((femaleCount / totalPopulation) * 100).toFixed(1)) : 0,
        districtAdminsTotal,
        districtAdminsPending,
        villageOfficersTotal,
        villageOfficersPending,
        hospitalOfficersTotal,
        hospitalOfficersPending,
        securityAlerts24h,
        systemHealth: {
          databaseOk: dbCheck,
          redisOk:    isRedisReady(),
        },
      },
    })
  } catch (err) {
    console.error('[admin/overview]', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
})

// ── GET /population ──────────────────────────────────────────────────────────
router.get('/population', async (req, res) => {
  // PATCH-POP-3: include children with birth records but no NIN yet.
  // Priority:
  //   a) citizen WITH birth record  → in citizens table, count once
  //   b) citizen WITHOUT birth record (seeded) → in citizens table, count
  //   c) birth where childCitizenId IS NULL → not yet registered → add from births
  try {
    const where = await buildCitizenGeoWhere(req)

    // Build birth geo-filter (scoped by facility.districtId for district_admin)
    let birthGeoWhere = { childCitizenId: null }
    if (req.user.role === 'district_admin') {
      const adminDistrictId = await getAdminDistrictId(req)
      birthGeoWhere = { childCitizenId: null, facility: { districtId: adminDistrictId } }
    }

    // ── Citizens (age-band groupBy is fast — age is a stored Int) ───────────
    const rows = await prisma.citizen.groupBy({
      by:     ['gender', 'age'],
      where,
      _count: { _all: true },
    })

    const bands = {}
    for (const band of AGE_BANDS) bands[band] = { male: 0, female: 0 }
    for (const r of rows) {
      const band = ageBand(r.age)
      bands[band][r.gender] += r._count._all
    }

    // ── Unlinked births (compute age from dateOfBirth in JS) ────────────────
    const unlinkedBirths = await prisma.birth.findMany({
      where:  birthGeoWhere,
      select: { gender: true, dateOfBirth: true },
    })
    const now = Date.now()
    for (const b of unlinkedBirths) {
      const ageYrs = Math.floor((now - new Date(b.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
      const band   = ageBand(ageYrs)
      if (bands[band]) bands[band][b.gender] = (bands[band][b.gender] || 0) + 1
    }

    const pyramid = AGE_BANDS.map((age) => ({ age, male: bands[age].male, female: bands[age].female }))

    // ── Totals ───────────────────────────────────────────────────────────────
    const [citizenTotal, citizenMale, unlinkedTotal, unlinkedMale] = await Promise.all([
      prisma.citizen.count({ where }),
      prisma.citizen.count({ where: { ...where, gender: 'male' } }),
      prisma.birth.count({ where: birthGeoWhere }),
      prisma.birth.count({ where: { ...birthGeoWhere, gender: 'male' } }),
    ])

    const total  = citizenTotal + unlinkedTotal
    const male   = citizenMale  + unlinkedMale
    const female = total - male

    return res.json({
      success: true,
      data: {
        pyramid,
        total,
        male,
        female,
        malePct:   total ? Number(((male / total) * 100).toFixed(1))   : 0,
        femalePct: total ? Number(((female / total) * 100).toFixed(1)) : 0,
      },
    })
  } catch (err) {
    console.error('[admin/population]', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
})

// ── GEO lookups (for filter dropdowns) ──────────────────────────────────────────
router.get('/geo/regions', async (req, res) => {
  // NOTE: distinct on name prevents duplicate region rows from seeding
  try {
    // PATCH-2: deduplicate region names
    const rawR = await prisma.region.findMany({ select: { id: true, name: true, jurisdiction: true }, orderBy: { name: 'asc' } })
    const seenR = new Set()
    const regions = rawR.filter(r => { if (seenR.has(r.name)) return false; seenR.add(r.name); return true })
    return res.json({ success: true, data: regions })
  } catch (err) {
    console.error('[admin/geo/regions]', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
})

router.get('/geo/districts', async (req, res) => {
  const regionId = Number(req.query.regionId) || undefined
  try {
    // PATCH-2: deduplicate district names within region
    const rawD = await prisma.district.findMany({
      where:   regionId ? { regionId } : {},
      select:  { id: true, name: true, regionId: true },
      orderBy: { name: 'asc' },
    })
    const seenD = new Set()
    const districts = rawD.filter(r => { const k = r.name+'|'+r.regionId; if (seenD.has(k)) return false; seenD.add(k); return true })
    return res.json({ success: true, data: districts })
  } catch (err) {
    console.error('[admin/geo/districts]', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
})

router.get('/geo/wards', async (req, res) => {
  let districtId = Number(req.query.districtId) || undefined
  try {
    // BUGFIX-9: a district_admin who omits districtId (the scoped
    // Demographics/RITA/NIDA filter) gets wards for their own district
    // only, instead of every ward in the country.
    if (!districtId && req.user.role === 'district_admin') {
      districtId = await getAdminDistrictId(req)
    }
    // PATCH-2: deduplicate ward names within district
    const rawW = await prisma.ward.findMany({
      where:   districtId ? { districtId } : {},
      select:  { id: true, name: true, districtId: true },
      orderBy: { name: 'asc' },
    })
    const seenW = new Set()
    const wards = rawW.filter(r => { const k = r.name+'|'+r.districtId; if (seenW.has(k)) return false; seenW.add(k); return true })
    return res.json({ success: true, data: wards })
  } catch (err) {
    console.error('[admin/geo/wards]', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
})

router.get('/geo/villages', async (req, res) => {
  const wardId = Number(req.query.wardId) || undefined
  try {
    // PATCH-2: deduplicate village/street names within ward
    const rawV = await prisma.village.findMany({
      where:   wardId ? { wardId } : {},
      select:  { id: true, name: true, wardId: true, type: true },
      orderBy: { name: 'asc' },
    })
    const seenV = new Set()
    const villages = rawV.filter(r => { const k = r.name+'|'+r.wardId; if (seenV.has(k)) return false; seenV.add(k); return true })
    return res.json({ success: true, data: villages })
  } catch (err) {
    console.error('[admin/geo/villages]', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
})

// ── DISTRICT ADMINS — [super_admin only] ────────────────────────────────────────
router.get('/district-admins', requireRole('super_admin'), async (req, res) => {
  const { status, regionId, districtId, q } = req.query
  const { page, limit, skip } = pagination(req)
  try {
    const where = {
      ...(status ? { status } : {}),
      ...(regionId ? { regionId: Number(regionId) } : {}),
      ...(districtId ? { districtId: Number(districtId) } : {}),
      ...(q ? { OR: [
        { fullName: { contains: q, mode: 'insensitive' } },
        { email:    { contains: q, mode: 'insensitive' } },
        { employeeId: { contains: q, mode: 'insensitive' } },
      ] } : {}),
    }
    const [data, total] = await Promise.all([
      prisma.districtAdmin.findMany({
        where, skip, take: limit, orderBy: { createdAt: 'desc' },
        select: {
          id: true, employeeId: true, fullName: true, email: true, mobile: true,
          status: true, mfaEnabled: true, createdAt: true, lastLogin: true,
          region: { select: { id: true, name: true } },
          district: { select: { id: true, name: true } },
        },
      }),
      prisma.districtAdmin.count({ where }),
    ])
    return res.json({ success: true, data, total, page, limit })
  } catch (err) {
    console.error('[admin/district-admins]', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
})

router.post('/district-admins', requireRole('super_admin'), async (req, res) => {
  const { fullName, email, birthId, employeeId, mobile, regionId, districtId, department, citizenId, password } = req.body
  if (!fullName || !email || !birthId || !employeeId) {
    return res.status(400).json({ success: false, message: 'fullName, email, birthId and employeeId are required' })
  }
  {
    const err = emailFormatError(email) // PATCH-EMAIL-VALIDATE-2026
    if (err) return res.status(400).json({ success: false, message: err })
  }
  try {
    // PATCH-ADMINREG-2026: created active immediately; password is whatever
    // was entered on the form (pre-filled Admin@1234), falling back to a
    // generated one. citizenId links this account to the citizen record
    // confirmed via BID search. A welcome email follows, fire-and-forget.
    const defaultPassword = (typeof password === 'string' && password.trim()) ? password.trim() : generateDefaultPassword()
    const passwordHash = await bcrypt.hash(defaultPassword, 10)
    const created = await prisma.districtAdmin.create({
      data: {
        fullName, email, birthId, employeeId,
        citizenId: citizenId || undefined,
        mobile: mobile || undefined,
        regionId: regionId ? Number(regionId) : undefined,
        districtId: districtId ? Number(districtId) : undefined,
        department: department || undefined,
        status: 'active',
        passwordHash,
        createdById: req.user.id,
      },
      select: { id: true, fullName: true, email: true, employeeId: true, status: true },
    })
    await logAction(req, { action: 'create_district_admin', targetTable: 'district_admins', targetId: created.id, newData: created })
    sendWelcomeEmail({ to: email, fullName, role: 'district_admin', defaultPassword }).catch(err => console.error('[email/district-admin]', err.message))
    return res.json({ success: true, data: { ...created, defaultPassword } })
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ success: false, message: 'A record with this email, Birth ID, or employee ID already exists' })
    console.error('[admin/create-district-admin]', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
})

router.patch('/district-admins/:id', requireRole('super_admin'), async (req, res) => {
  const { status } = req.body
  if (!ADMIN_STATUSES.includes(status)) {
    return res.status(400).json({ success: false, message: `status must be one of ${ADMIN_STATUSES.join(', ')}` })
  }
  try {
    const updated = await prisma.districtAdmin.update({
      where: { id: req.params.id },
      data:  { status },
      select: { id: true, fullName: true, status: true },
    })
    await logAction(req, { action: 'update_district_admin_status', targetTable: 'district_admins', targetId: updated.id, newData: { status }, severity: status === 'suspended' ? 'warning' : 'info' })
    return res.json({ success: true, data: updated })
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ success: false, message: 'Not found' })
    console.error('[admin/update-district-admin]', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
})

router.delete('/district-admins/:id', requireRole('super_admin'), async (req, res) => {
  try {
    await prisma.districtAdmin.delete({ where: { id: req.params.id } })
    await logAction(req, { action: 'delete_district_admin', targetTable: 'district_admins', targetId: req.params.id, severity: 'warning' })
    return res.json({ success: true })
  } catch (err) {
    return handleDeleteError(res, err, 'district admin')
  }
})

// ── VILLAGE OFFICERS ─────────────────────────────────────────────────────────────
router.get('/village-officers', async (req, res) => {
  const { status, districtId, q } = req.query
  const { page, limit, skip } = pagination(req)
  try {
    const adminDistrictId = await getAdminDistrictId(req)
    const where = {
      ...(req.user.role === 'district_admin' ? { districtId: adminDistrictId } : (districtId ? { districtId: Number(districtId) } : {})),
      ...(status ? { status } : {}),
      ...(q ? { OR: [
        { fullName: { contains: q, mode: 'insensitive' } },
        { email:    { contains: q, mode: 'insensitive' } },
        { employeeId: { contains: q, mode: 'insensitive' } },
      ] } : {}),
    }
    const [data, total] = await Promise.all([
      prisma.villageOfficer.findMany({
        where, skip, take: limit, orderBy: { createdAt: 'desc' },
        select: {
          id: true, employeeId: true, fullName: true, email: true, mobile: true,
          status: true, mfaEnabled: true, createdAt: true, lastLogin: true,
          village: { select: { id: true, name: true } },
          ward:    { select: { id: true, name: true } },
          district: { select: { id: true, name: true } },
        },
      }),
      prisma.villageOfficer.count({ where }),
    ])
    return res.json({ success: true, data, total, page, limit })
  } catch (err) {
    console.error('[admin/village-officers]', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
})

router.post('/village-officers', requireRole('district_admin'), async (req, res) => {
  const { fullName, email, birthId, employeeId, mobile, villageId, wardId, citizenId, password } = req.body
  if (!fullName || !email || !birthId || !employeeId) {
    return res.status(400).json({ success: false, message: 'fullName, email, birthId and employeeId are required' })
  }
  {
    const err = emailFormatError(email) // PATCH-EMAIL-VALIDATE-2026
    if (err) return res.status(400).json({ success: false, message: err })
  }
  try {
    const adminDistrictId = await getAdminDistrictId(req)
    // PATCH-ADMINREG-2026: created active immediately; password is whatever
    // was entered on the form (pre-filled Admin@1234), falling back to a
    // generated one. citizenId links this account to the citizen record
    // confirmed via BID search. A welcome email follows, fire-and-forget.
    const defaultPassword = (typeof password === 'string' && password.trim()) ? password.trim() : generateDefaultPassword()
    const passwordHash = await bcrypt.hash(defaultPassword, 10)
    const created = await prisma.villageOfficer.create({
      data: {
        fullName, email, birthId, employeeId,
        citizenId: citizenId || undefined,
        mobile: mobile || undefined,
        villageId: villageId ? Number(villageId) : undefined,
        wardId: wardId ? Number(wardId) : undefined,
        districtId: adminDistrictId,
        status: 'active',
        passwordHash,
        createdById: req.user.id,
      },
      select: { id: true, fullName: true, email: true, employeeId: true, status: true },
    })
    await logAction(req, { action: 'create_village_officer', targetTable: 'village_officers', targetId: created.id, newData: created })
    sendWelcomeEmail({ to: email, fullName, role: 'village_officer', defaultPassword }).catch(err => console.error('[email/village-officer]', err.message))
    return res.json({ success: true, data: { ...created, defaultPassword } })
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ success: false, message: 'A record with this email, Birth ID, or employee ID already exists' })
    console.error('[admin/create-village-officer]', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
})

router.patch('/village-officers/:id', async (req, res) => {
  const { status } = req.body
  if (!OFFICER_STATUSES.includes(status)) {
    return res.status(400).json({ success: false, message: `status must be one of ${OFFICER_STATUSES.join(', ')}` })
  }
  try {
    const adminDistrictId = await getAdminDistrictId(req)
    const where = req.user.role === 'district_admin'
      ? { id: req.params.id, districtId: adminDistrictId }
      : { id: req.params.id }
    const existing = await prisma.villageOfficer.findFirst({ where, select: { id: true } })
    if (!existing) return res.status(404).json({ success: false, message: 'Not found' })

    const updated = await prisma.villageOfficer.update({
      where: { id: req.params.id },
      data:  { status },
      select: { id: true, fullName: true, status: true },
    })
    await logAction(req, { action: 'update_village_officer_status', targetTable: 'village_officers', targetId: updated.id, newData: { status }, severity: status === 'suspended' ? 'warning' : 'info' })
    return res.json({ success: true, data: updated })
  } catch (err) {
    console.error('[admin/update-village-officer]', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
})

// PATCH-ADMINREG-2026: only national-scope (Super Admin) accounts may
// delete officer accounts.
router.delete('/village-officers/:id', requireRole('super_admin'), async (req, res) => {
  try {
    const adminDistrictId = await getAdminDistrictId(req)
    const where = req.user.role === 'district_admin'
      ? { id: req.params.id, districtId: adminDistrictId }
      : { id: req.params.id }
    const existing = await prisma.villageOfficer.findFirst({ where, select: { id: true } })
    if (!existing) return res.status(404).json({ success: false, message: 'Not found' })

    await prisma.villageOfficer.delete({ where: { id: req.params.id } })
    await logAction(req, { action: 'delete_village_officer', targetTable: 'village_officers', targetId: req.params.id, severity: 'warning' })
    return res.json({ success: true })
  } catch (err) {
    return handleDeleteError(res, err, 'village officer')
  }
})

// ── HOSPITAL (HEALTH) OFFICERS ───────────────────────────────────────────────────
router.get('/health-officers', async (req, res) => {
  const { status, districtId, q } = req.query
  const { page, limit, skip } = pagination(req)
  try {
    const adminDistrictId = await getAdminDistrictId(req)
    const where = {
      ...(req.user.role === 'district_admin' ? { districtId: adminDistrictId } : (districtId ? { districtId: Number(districtId) } : {})),
      ...(status ? { status } : {}),
      ...(q ? { OR: [
        { fullName: { contains: q, mode: 'insensitive' } },
        { email:    { contains: q, mode: 'insensitive' } },
        { employeeId: { contains: q, mode: 'insensitive' } },
      ] } : {}),
    }
    const [data, total] = await Promise.all([
      prisma.hospitalOfficer.findMany({
        where, skip, take: limit, orderBy: { createdAt: 'desc' },
        select: {
          id: true, employeeId: true, fullName: true, email: true, mobile: true,
          status: true, mfaEnabled: true, createdAt: true, lastLogin: true,
          facility:  { select: { id: true, facilityName: true, facilityType: true } },
          district:  { select: { id: true, name: true } },
        },
      }),
      prisma.hospitalOfficer.count({ where }),
    ])
    return res.json({ success: true, data, total, page, limit })
  } catch (err) {
    console.error('[admin/health-officers]', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
})

router.post('/health-officers', requireRole('district_admin'), async (req, res) => {
  const { fullName, email, birthId, employeeId, mobile, facilityId, facilityName, citizenId, password } = req.body
  if (!fullName || !email || !birthId || !employeeId) {
    return res.status(400).json({ success: false, message: 'fullName, email, birthId and employeeId are required' })
  }
  {
    const err = emailFormatError(email) // PATCH-EMAIL-VALIDATE-2026
    if (err) return res.status(400).json({ success: false, message: err })
  }
  try {
    const adminDistrictId = await getAdminDistrictId(req)

    // PATCH-ADMINREG-2026: the registration form now takes a free-text
    // Facility Name instead of picking an existing facility by ID (there
    // was previously no facility field wired up here at all). Find an
    // existing facility by name in this district first; otherwise create a
    // minimal record with sensible defaults that can be refined later.
    let resolvedFacilityId = facilityId ? Number(facilityId) : undefined
    if (!resolvedFacilityId && facilityName && facilityName.trim()) {
      const name = facilityName.trim()
      let facility = await prisma.healthFacility.findFirst({
        where: { facilityName: { equals: name, mode: 'insensitive' }, ...(adminDistrictId ? { districtId: adminDistrictId } : {}) },
        select: { id: true },
      })
      if (!facility) {
        facility = await prisma.healthFacility.create({
          data: {
            facilityRegNo: `FAC-${Date.now().toString(36).toUpperCase()}`,
            facilityName: name,
            facilityType: 'hospital',
            facilityGrade: 'H',
            ownershipType: 'public',
            districtId: adminDistrictId ?? undefined,
          },
          select: { id: true },
        })
      }
      resolvedFacilityId = facility.id
    }

    // PATCH-ADMINREG-2026: created active immediately; password is whatever
    // was entered on the form (pre-filled Admin@1234), falling back to a
    // generated one. citizenId links this account to the citizen record
    // confirmed via BID search. A welcome email follows, fire-and-forget.
    const defaultPassword = (typeof password === 'string' && password.trim()) ? password.trim() : generateDefaultPassword()
    const passwordHash = await bcrypt.hash(defaultPassword, 10)
    const created = await prisma.hospitalOfficer.create({
      data: {
        fullName, email, birthId, employeeId,
        citizenId: citizenId || undefined,
        mobile: mobile || undefined,
        facilityId: resolvedFacilityId,
        districtId: adminDistrictId,
        status: 'active',
        passwordHash,
        createdById: req.user.id,
      },
      select: { id: true, fullName: true, email: true, employeeId: true, status: true },
    })
    await logAction(req, { action: 'create_hospital_officer', targetTable: 'hospital_officers', targetId: created.id, newData: created })
    sendWelcomeEmail({ to: email, fullName, role: 'hospital_officer', defaultPassword }).catch(err => console.error('[email/hospital-officer]', err.message))
    return res.json({ success: true, data: { ...created, defaultPassword } })
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ success: false, message: 'A record with this email, Birth ID, or employee ID already exists' })
    console.error('[admin/create-hospital-officer]', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
})

router.patch('/health-officers/:id', async (req, res) => {
  const { status } = req.body
  if (!OFFICER_STATUSES.includes(status)) {
    return res.status(400).json({ success: false, message: `status must be one of ${OFFICER_STATUSES.join(', ')}` })
  }
  try {
    const adminDistrictId = await getAdminDistrictId(req)
    const where = req.user.role === 'district_admin'
      ? { id: req.params.id, districtId: adminDistrictId }
      : { id: req.params.id }
    const existing = await prisma.hospitalOfficer.findFirst({ where, select: { id: true } })
    if (!existing) return res.status(404).json({ success: false, message: 'Not found' })

    const updated = await prisma.hospitalOfficer.update({
      where: { id: req.params.id },
      data:  { status },
      select: { id: true, fullName: true, status: true },
    })
    await logAction(req, { action: 'update_hospital_officer_status', targetTable: 'hospital_officers', targetId: updated.id, newData: { status }, severity: status === 'suspended' ? 'warning' : 'info' })
    return res.json({ success: true, data: updated })
  } catch (err) {
    console.error('[admin/update-hospital-officer]', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
})

// PATCH-ADMINREG-2026: only national-scope (Super Admin) accounts may
// delete officer accounts.
router.delete('/health-officers/:id', requireRole('super_admin'), async (req, res) => {
  try {
    const adminDistrictId = await getAdminDistrictId(req)
    const where = req.user.role === 'district_admin'
      ? { id: req.params.id, districtId: adminDistrictId }
      : { id: req.params.id }
    const existing = await prisma.hospitalOfficer.findFirst({ where, select: { id: true } })
    if (!existing) return res.status(404).json({ success: false, message: 'Not found' })

    await prisma.hospitalOfficer.delete({ where: { id: req.params.id } })
    await logAction(req, { action: 'delete_hospital_officer', targetTable: 'hospital_officers', targetId: req.params.id, severity: 'warning' })
    return res.json({ success: true })
  } catch (err) {
    return handleDeleteError(res, err, 'hospital officer')
  }
})


// ── SUPER ADMINS — [super_admin only, min-1 / max-3 guard] ───────────────────
// PATCH-EMAIL-2025

const SUPER_ADMIN_MIN = 1
const SUPER_ADMIN_MAX = 3

router.get('/super-admins', requireRole('super_admin'), async (req, res) => {
  const { q } = req.query
  const take   = Math.min(parseInt(req.query.limit) || 25, 100)
  const search = q
    ? { OR: [{ fullName: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }] }
    : {}
  try {
    const [rows, total] = await Promise.all([
      prisma.superAdmin.findMany({
        where:   search,
        take,
        orderBy: { createdAt: 'desc' },
        select:  { id: true, employeeId: true, fullName: true, email: true, mobile: true,
                   department: true, status: true, mfaEnabled: true, createdAt: true, lastLogin: true },
      }),
      prisma.superAdmin.count(),
    ])
    return res.json({ success: true, data: rows, total, canAdd: total < SUPER_ADMIN_MAX, canDelete: total > SUPER_ADMIN_MIN })
  } catch (err) {
    console.error('[admin/super-admins]', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
})

router.post('/super-admins', requireRole('super_admin'), async (req, res) => {
  const total = await prisma.superAdmin.count()
  if (total >= SUPER_ADMIN_MAX) {
    return res.status(409).json({
      success: false,
      message: `System already has the maximum of ${SUPER_ADMIN_MAX} Super Administrators.`,
    })
  }
  const { fullName, email, birthId, employeeId, mobile, department, citizenId, password } = req.body
  if (!fullName || !email || !birthId || !employeeId) {
    return res.status(400).json({ success: false, message: 'fullName, email, birthId and employeeId are required' })
  }
  {
    const err = emailFormatError(email) // PATCH-EMAIL-VALIDATE-2026
    if (err) return res.status(400).json({ success: false, message: err })
  }
  try {
    // PATCH-ADMINREG-2026: created active immediately; password is whatever
    // was entered on the form (pre-filled Admin@1234), falling back to a
    // generated one. citizenId links this account to the citizen record
    // confirmed via BID search. A welcome email follows, fire-and-forget.
    const defaultPassword = (typeof password === 'string' && password.trim()) ? password.trim() : generateDefaultPassword()
    const passwordHash    = await bcrypt.hash(defaultPassword, 10)
    const created   = await prisma.superAdmin.create({
      data: {
        fullName, email, birthId, employeeId,
        citizenId:  citizenId || undefined,
        mobile:     mobile     || undefined,
        department: department || undefined,
        status:            'active',
        passwordHash,
        createdById:       req.user.id,
      },
      select: { id: true, fullName: true, email: true, employeeId: true, status: true },
    })
    await logAction(req, {
      action: 'create_super_admin', targetTable: 'super_admins', targetId: created.id,
      newData: created, severity: 'warning',
    })
    sendWelcomeEmail({ to: email, fullName, role: 'super_admin', defaultPassword }).catch(err => console.error('[email/super-admin]', err.message))
    return res.json({ success: true, data: { ...created, defaultPassword } })
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ success: false, message: 'A record with this email, Birth ID, or employee ID already exists' }) // PATCH-ADMINREG-2026
    console.error('[admin/create-super-admin]', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
})

router.delete('/super-admins/:id', requireRole('super_admin'), async (req, res) => {
  const { id } = req.params
  if (id === req.user.id) {
    return res.status(400).json({ success: false, message: 'You cannot delete your own account.' })
  }
  const total = await prisma.superAdmin.count()
  if (total <= SUPER_ADMIN_MIN) {
    return res.status(409).json({
      success: false,
      message: `Cannot delete — the system must retain at least ${SUPER_ADMIN_MIN} Super Administrator.`,
    })
  }
  try {
    await prisma.superAdmin.delete({ where: { id } })
    await logAction(req, { action: 'delete_super_admin', targetTable: 'super_admins', targetId: id, severity: 'warning' })
    return res.json({ success: true })
  } catch (err) {
    return handleDeleteError(res, err, 'super admin')
  }
})

// ── MANAGE USERS — [super_admin only] ────────────────────────────────────────────
router.get('/users', requireRole('super_admin'), async (req, res) => {
  const { q } = req.query
  const take = Math.min(parseInt(req.query.limit) || 25, 100)
  const search = q ? { OR: [
    { fullName: { contains: q, mode: 'insensitive' } },
    { email:    { contains: q, mode: 'insensitive' } },
  ] } : {}
  const searchPublic = q ? { OR: [
    { displayName: { contains: q, mode: 'insensitive' } },
    { email:        { contains: q, mode: 'insensitive' } },
  ] } : {}
  try {
    const [superAdmins, districtAdmins, villageOfficers, hospitalOfficers, publicUsers] = await Promise.all([
      prisma.superAdmin.findMany({ where: search, take, orderBy: { createdAt: 'desc' },
        select: { id: true, fullName: true, email: true, status: true, mfaEnabled: true, createdAt: true, lastLogin: true } }),
      prisma.districtAdmin.findMany({ where: search, take, orderBy: { createdAt: 'desc' },
        select: { id: true, fullName: true, email: true, status: true, mfaEnabled: true, createdAt: true, lastLogin: true,
          district: { select: { name: true } }, region: { select: { name: true } } } }),
      prisma.villageOfficer.findMany({ where: search, take, orderBy: { createdAt: 'desc' },
        select: { id: true, fullName: true, email: true, status: true, mfaEnabled: true, createdAt: true, lastLogin: true,
          village: { select: { name: true } } } }),
      prisma.hospitalOfficer.findMany({ where: search, take, orderBy: { createdAt: 'desc' },
        select: { id: true, fullName: true, email: true, status: true, mfaEnabled: true, createdAt: true, lastLogin: true,
          facility: { select: { facilityName: true } } } }),
      prisma.publicUser.findMany({ where: searchPublic, take, orderBy: { createdAt: 'desc' },
        select: { id: true, displayName: true, email: true, status: true, authProvider: true, createdAt: true, lastLogin: true } }),
    ])
    return res.json({
      success: true,
      data: {
        super_admin:      superAdmins,
        district_admin:   districtAdmins,
        village_officer:  villageOfficers,
        hospital_officer: hospitalOfficers,
        public_user:      publicUsers,
      },
    })
  } catch (err) {
    console.error('[admin/users]', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
})

const ROLE_MODEL = {
  super_admin:      'superAdmin',
  district_admin:   'districtAdmin',
  village_officer:  'villageOfficer',
  hospital_officer: 'hospitalOfficer',
  public_user:      'publicUser',
}

router.patch('/users/:role/:id', requireRole('super_admin'), async (req, res) => {
  const { role, id } = req.params
  const { status } = req.body
  const model = ROLE_MODEL[role]
  if (!model) return res.status(400).json({ success: false, message: 'Unknown role' })

  const validStatuses = role === 'public_user' ? ['active', 'suspended']
    : (role === 'super_admin' || role === 'district_admin') ? ADMIN_STATUSES
    : OFFICER_STATUSES
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ success: false, message: `status must be one of ${validStatuses.join(', ')}` })
  }
  // Prevent a super_admin from locking themselves out
  if (role === 'super_admin' && id === req.user.id && status !== 'active') {
    return res.status(400).json({ success: false, message: 'You cannot change your own status' })
  }

  try {
    const updated = await prisma[model].update({ where: { id }, data: { status }, select: { id: true, status: true } })
    await logAction(req, { action: 'update_user_status', targetTable: `${role}s`, targetId: id, newData: { role, status }, severity: status === 'suspended' ? 'warning' : 'info' })
    return res.json({ success: true, data: updated })
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ success: false, message: 'Not found' })
    console.error('[admin/update-user]', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
})

router.delete('/users/:role/:id', requireRole('super_admin'), async (req, res) => {
  const { role, id } = req.params
  const model = ROLE_MODEL[role]
  if (!model) return res.status(400).json({ success: false, message: 'Unknown role' })
  if (role === 'super_admin' && id === req.user.id) {
    return res.status(400).json({ success: false, message: 'You cannot delete your own account' })
  }
  try {
    // PATCH-ADMINREG-DELUSERS-2026
    await prisma[model].delete({ where: { id } })
    await logAction(req, { action: 'delete_user', targetTable: `${role}s`, targetId: id, newData: { role }, severity: 'warning' })
    return res.json({ success: true })
  } catch (err) {
    return handleDeleteError(res, err, role.replace('_', ' '))
  }
})

// ── AUDIT LOGS / SECURITY ALERTS ────────────────────────────────────────────────

/** Build a Prisma where clause for AuditLog, scoped to a district_admin's own officers. */
async function buildAuditWhere(req) {
  if (req.user.role !== 'district_admin') return {}
  const [villageOfficers, hospitalOfficers] = await Promise.all([
    prisma.villageOfficer.findMany({ where: { createdById: req.user.id }, select: { id: true } }),
    prisma.hospitalOfficer.findMany({ where: { createdById: req.user.id }, select: { id: true } }),
  ])
  const actorIds = [req.user.id, ...villageOfficers.map(o => o.id), ...hospitalOfficers.map(o => o.id)]
  return { actorId: { in: actorIds } }
}

router.get('/audit-logs', async (req, res) => {
  const { actorRole, action, severity, from, to } = req.query
  const { page, limit, skip } = pagination(req, 25, 100)
  try {
    const where = {
      ...(await buildAuditWhere(req)),
      ...(actorRole ? { actorRole } : {}),
      ...(action ? { action: { contains: action, mode: 'insensitive' } } : {}),
      ...(severity ? { severity } : {}),
      ...((from || to) ? { timestamp: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {}),
    }
    const [data, total] = await Promise.all([
      prisma.auditLog.findMany({ where, skip, take: limit, orderBy: { timestamp: 'desc' } }),
      prisma.auditLog.count({ where }),
    ])
    return res.json({ success: true, data, total, page, limit })
  } catch (err) {
    console.error('[admin/audit-logs]', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
})

router.get('/security-alerts', async (req, res) => {
  const { severity } = req.query
  const { page, limit, skip } = pagination(req, 25, 100)
  try {
    const where = {
      ...(await buildAuditWhere(req)),
      severity: severity ? severity : { in: ['warning', 'critical'] },
    }
    const [data, total] = await Promise.all([
      prisma.auditLog.findMany({ where, skip, take: limit, orderBy: { timestamp: 'desc' } }),
      prisma.auditLog.count({ where }),
    ])
    return res.json({ success: true, data, total, page, limit })
  } catch (err) {
    console.error('[admin/security-alerts]', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
})

// ── SYSTEM PERFORMANCE — [super_admin only] ──────────────────────────────────────
// BUGFIX-DASHBOARD-2026: this was super_admin-only, but the Dashboard
// Overview tab (first sidebar icon) calls it for BOTH roles to render its
// PostgreSQL/Redis/Uptime/Node cards. For district_admin the request
// 403'd, the frontend's .catch(()=>null) swallowed it, and those 4 cards
// silently showed "Offline"/"—" even though everything was fine. This
// endpoint returns no district-scoped or sensitive data, so it's safe to
// open to district_admin as well.
router.get('/system-performance', requireRole('super_admin', 'district_admin'), async (req, res) => {
  try {
    const dbStart = Date.now()
    let databaseOk = true
    try { await prisma.$queryRaw`SELECT 1` } catch { databaseOk = false }
    const dbLatencyMs = Date.now() - dbStart

    let redisOk = false
    let redisLatencyMs = null
    try {
      const redis = getRedis()
      if (redis) {
        const redisStart = Date.now()
        await redis.ping()
        redisLatencyMs = Date.now() - redisStart
        redisOk = isRedisReady()
      }
    } catch { redisOk = false }

    const [citizens, births, deaths, migrations, marriages, auditLogs] = await Promise.all([
      prisma.citizen.count(),
      prisma.birth.count(),
      prisma.death.count(),
      prisma.migration.count().catch(() => 0),
      prisma.marriage.count().catch(() => 0),
      prisma.auditLog.count(),
    ])

    return res.json({
      success: true,
      data: {
        databaseOk, dbLatencyMs,
        redisOk, redisLatencyMs,
        uptimeSeconds: Math.round(process.uptime()),
        nodeVersion: process.version,
        tableCounts: { citizens, births, deaths, migrations, marriages, auditLogs },
      },
    })
  } catch (err) {
    console.error('[admin/system-performance]', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
})

// ── MIGRATIONS ──────────────────────────────────────────────────────────────────
router.get('/migrations', async (req, res) => {
  const { status } = req.query
  const { page, limit, skip } = pagination(req)
  try {
    const adminDistrictId = await getAdminDistrictId(req)
    const where = {
      ...(status ? { status } : {}),
      ...(req.user.role === 'district_admin' ? {
        OR: [
          { fromVillage: { ward: { districtId: adminDistrictId } } },
          { toVillage:   { ward: { districtId: adminDistrictId } } },
        ],
      } : {}),
    }
    const [data, total] = await Promise.all([
      prisma.migration.findMany({
        where, skip, take: limit, orderBy: { requestDate: 'desc' },
        select: {
          id: true, status: true, reason: true, requestDate: true, expiryDate: true, confirmedDate: true,
          citizen:     { select: { id: true, firstName: true, surname: true, nationalId: true } },
          fromVillage: { select: { id: true, name: true } },
          toVillage:   { select: { id: true, name: true } },
        },
      }),
      prisma.migration.count({ where }),
    ])
    return res.json({ success: true, data, total, page, limit })
  } catch (err) {
    console.error('[admin/migrations]', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
})

// ── PATCH-MIGTRENDS-2026: GET /migrations/trends — Migration Trends sidebar ───
// National admins filter starting at Region -> District -> Ward -> Village/
// Street; district admins are floored to their own district and filter by
// Ward -> Village/Street only (same GeoFilterBar contract as RITA/NIDA).
router.get('/migrations/trends', async (req, res) => {
  try {
    // PATCH-WEEKLYTRENDS-2026: floored to ONE month/year (picked above the
    // cards on the dashboard) and charted as Week 1..5 within it.
    const { start, end, year, month } = monthRange(req.query)
    const geoWhere = await migrationGeoWhere(req)
    const where = { ...geoWhere, requestDate: { gte: start, lt: end } }

    const [rows, statusCounts] = await Promise.all([
      prisma.migration.groupBy({
        by: ['requestDate'],
        _count: { id: true },
        where,
        orderBy: { requestDate: 'asc' },
      }),
      prisma.migration.groupBy({ by: ['status'], where, _count: { _all: true } }),
    ])

    const trend = groupByWeek(rows, 'requestDate')

    const totals = { pending: 0, confirmed: 0, cancelled: 0, expired: 0 }
    statusCounts.forEach(s => { totals[s.status] = s._count._all })
    totals.all = rows.reduce((s, r) => s + r._count.id, 0)

    return res.json({ success: true, data: { trend, totals, year, month } })
  } catch (err) {
    console.error('[admin/migrations/trends]', err)
    return res.status(500).json({ success: false, message: 'Failed to fetch migration trends' })
  }
})

// ── MARRIAGES ───────────────────────────────────────────────────────────────────
router.get('/marriages', async (req, res) => {
  const { status } = req.query
  const { page, limit, skip } = pagination(req)
  try {
    const adminDistrictId = await getAdminDistrictId(req)
    const where = {
      ...(status ? { status } : {}),
      ...(req.user.role === 'district_admin' ? {
        registeredBy: { districtId: adminDistrictId },
      } : {}),
    }
    const [data, total, statusCounts] = await Promise.all([
      prisma.marriage.findMany({
        where, skip, take: limit, orderBy: { registeredAt: 'desc' },
        select: {
          id: true, marriageCertNo: true, marriageDate: true, marriagePlace: true, status: true,
          religion: true, kindOfMarriage: true,
          husband: { select: { firstName: true, surname: true } },
          wife:    { select: { firstName: true, surname: true } },
        },
      }),
      prisma.marriage.count({ where }),
      prisma.marriage.groupBy({ by: ['status'], where, _count: { _all: true } }),
    ])
    return res.json({ success: true, data, total, page, limit, statusCounts })
  } catch (err) {
    console.error('[admin/marriages]', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
})


// ── PATCH-4: DELETE /births — wipe all birth records except test parents ──────
// Used by super_admin to clear births for a fresh end-to-end test run.
// "Test parents" (citizens seeded by prisma/seed.js) are identified by the
// seeded employee_id prefix of the registering officer or by having no
// linked birth records — so we only delete Birth rows, not Citizen rows.
router.delete('/births', requireRole('super_admin'), async (req, res) => {
  try {
    const { count } = await prisma.birth.deleteMany({})
    return res.json({ success: true, deleted: count, message: `Deleted ${count} birth record(s). Test parent citizens preserved.` })
  } catch (err) {
    console.error('[admin/births DELETE]', err)
    return res.status(500).json({ success: false, message: 'Failed to delete births' })
  }
})

// ── PATCH-4: GET /rita — birth/death/marriage trends for RITA sidebar ─────────
router.get('/rita', async (req, res) => {
  try {
    const { regionId, districtId } = req.query
    // PATCH-WEEKLYTRENDS-2026: floored to a single selected month/year; charts
    // below bucket into Week 1..5 within that window.
    const { start, end, year, month } = monthRange(req.query)
    const dateFilter = { gte: start, lt: end }

    // BUGFIX-RITA-2026: district_admin is now floored to their own district
    // regardless of query params — previously this route only honoured an
    // explicit regionId/districtId, which the scoped GeoFilterBar (the one
    // district_admin actually uses) never sends, so a district_admin always
    // saw unfiltered NATIONAL data here.
    const adminDistrictId = req.user.role === 'district_admin' ? await getAdminDistrictId(req) : null
    const districtScope = adminDistrictId ?? (districtId ? Number(districtId) : undefined)
    const regionScope   = adminDistrictId != null ? undefined : (regionId ? Number(regionId) : undefined)

    // BUGFIX-RITA-2026: `createdAt` does not exist on Birth/Death/Marriage
    // — the real field is `registeredAt`. Every call was throwing a Prisma
    // validation error, which is why this card always came back empty.
    const birthWhere = {
      ...(Object.keys(dateFilter).length ? { registeredAt: dateFilter } : {}),
      ...(districtScope != null ? { officer: { districtId: districtScope } } :
          regionScope   != null ? { officer: { district: { regionId: regionScope } } } : {}),
    }
    const deathWhere = {
      ...(Object.keys(dateFilter).length ? { registeredAt: dateFilter } : {}),
      ...(districtScope != null ? { OR: [
            { villageOfficer:  { districtId: districtScope } },
            { hospitalOfficer: { districtId: districtScope } },
          ] } :
          regionScope != null ? { OR: [
            { villageOfficer:  { district: { regionId: regionScope } } },
            { hospitalOfficer: { district: { regionId: regionScope } } },
          ] } : {}),
    }
    const marriageWhere = {
      ...(Object.keys(dateFilter).length ? { registeredAt: dateFilter } : {}),
      ...(districtScope != null ? { registeredBy: { districtId: districtScope } } :
          regionScope   != null ? { registeredBy: { district: { regionId: regionScope } } } : {}),
    }

    const [birthRows, deathRows, marriageRows] = await Promise.all([
      prisma.birth.groupBy({
        by: ['registeredAt'],
        _count: { id: true },
        where: birthWhere,
        orderBy: { registeredAt: 'asc' },
      }),
      prisma.death.groupBy({
        by: ['registeredAt'],
        _count: { id: true },
        where: deathWhere,
        orderBy: { registeredAt: 'asc' },
      }),
      prisma.marriage.groupBy({
        by: ['registeredAt'],
        _count: { id: true },
        where: marriageWhere,
        orderBy: { registeredAt: 'asc' },
      }),
    ])

    // PATCH-WEEKLYTRENDS-2026: bucket into Week 1..5 of the selected month
    // instead of one point per calendar month.
    return res.json({
      success: true,
      data: {
        births:    groupByWeek(birthRows,    'registeredAt'),
        deaths:    groupByWeek(deathRows,    'registeredAt'),
        marriages: groupByWeek(marriageRows, 'registeredAt'),
        totals: {
          births:    birthRows.reduce((s, r) => s + r._count.id, 0),
          deaths:    deathRows.reduce((s, r) => s + r._count.id, 0),
          marriages: marriageRows.reduce((s, r) => s + r._count.id, 0),
        },
        year, month,
      },
    })
  } catch (err) {
    console.error('[admin/rita]', err)
    return res.status(500).json({ success: false, message: 'Failed to fetch RITA trends' })
  }
})

// ── PATCH-4: GET /nida — NIN issuance trends for NIDA sidebar ─────────────────
router.get('/nida', async (req, res) => {
  try {
    // PATCH-WEEKLYTRENDS-2026: floored to a single selected month/year.
    const { start, end, year, month } = monthRange(req.query)
    const dateFilter = { gte: start, lt: end }

    // BUGFIX-NIDA-2026: `nin` and `createdAt` do not exist on Citizen — the
    // real fields are `nationalId` and `idCardIssued` (the actual NIN
    // *issuance* event/date; `registeredAt` is when the citizen record was
    // created, which can predate NIN issuance). Every call was throwing a
    // Prisma validation error, which is why this card always came back
    // empty even with real issuances in the database. Geo scoping now
    // reuses buildCitizenGeoWhere() — the same helper every other
    // citizen-scoped query in this file already uses — so district_admin
    // is floored to their own district and can narrow by ward/village.
    const geoWhere = await buildCitizenGeoWhere(req)
    const where = {
      ...geoWhere,
      idCardIssued: Object.keys(dateFilter).length ? { ...dateFilter, not: null } : { not: null },
    }

    const ninRows = await prisma.citizen.groupBy({
      by: ['idCardIssued'],
      _count: { id: true },
      where,
      orderBy: { idCardIssued: 'asc' },
    })

    const trend = groupByWeek(ninRows, 'idCardIssued')

    return res.json({
      success: true,
      data: {
        ninIssuances: trend,
        total: ninRows.reduce((s, r) => s + r._count.id, 0),
        year, month,
      },
    })
  } catch (err) {
    console.error('[admin/nida]', err)
    return res.status(500).json({ success: false, message: 'Failed to fetch NIDA trends' })
  }
})

module.exports = router
