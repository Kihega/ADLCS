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
 *   GET   /api/admin/marriages                — scoped
 */

const { Router } = require('express')
const bcrypt = require('bcryptjs')
const crypto = require('crypto')
const { prisma } = require('../lib/prisma')
const { getRedis, isRedisReady } = require('../lib/redis')
const { requireAuth, requireRole } = require('../middleware/auth')

const { sendAuthTokenEmail } = require('../lib/email')

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

/** Generate a one-time authorization token (e.g. SADM-XXXX-XXXX / DADM-XXXX-XXXX). */
function generateAuthToken(prefix) {
  const part = () => crypto.randomInt(1000, 9999)
  return `${prefix}-${part()}-${part()}`
}

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
  const { fullName, email, nidaNumber, employeeId, mobile, regionId, districtId, department } = req.body
  if (!fullName || !email || !nidaNumber || !employeeId) {
    return res.status(400).json({ success: false, message: 'fullName, email, nidaNumber and employeeId are required' })
  }
  try {
    const token = generateAuthToken('DADM')
    const tokenHash = await bcrypt.hash(token, 10)
    const created = await prisma.districtAdmin.create({
      data: {
        fullName, email, nidaNumber, employeeId,
        mobile: mobile || undefined,
        regionId: regionId ? Number(regionId) : undefined,
        districtId: districtId ? Number(districtId) : undefined,
        department: department || undefined,
        status: 'pending',
        loginTokenHash: tokenHash,
        loginTokenExpires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdById: req.user.id,
      },
      select: { id: true, fullName: true, email: true, employeeId: true, status: true },
    })
    await logAction(req, { action: 'create_district_admin', targetTable: 'district_admins', targetId: created.id, newData: created })
    // PATCH-EMAIL-2025: send one-time token to newly registered district admin
    sendAuthTokenEmail({
      to:        email,
      fullName,
      token,
      role:      'district_admin',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    }).catch(err => console.error('[email/district-admin]', err.message))
    return res.json({ success: true, data: { ...created, authToken: token } })
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ success: false, message: 'A record with this email, NIDA number, or employee ID already exists' })
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
    if (err.code === 'P2025') return res.status(404).json({ success: false, message: 'Not found' })
    console.error('[admin/delete-district-admin]', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
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
  const { fullName, email, nidaNumber, employeeId, mobile, villageId, wardId } = req.body
  if (!fullName || !email || !nidaNumber || !employeeId) {
    return res.status(400).json({ success: false, message: 'fullName, email, nidaNumber and employeeId are required' })
  }
  try {
    const adminDistrictId = await getAdminDistrictId(req)
    const token = generateAuthToken('VOFF')
    const tokenHash = await bcrypt.hash(token, 10)
    const created = await prisma.villageOfficer.create({
      data: {
        fullName, email, nidaNumber, employeeId,
        mobile: mobile || undefined,
        villageId: villageId ? Number(villageId) : undefined,
        wardId: wardId ? Number(wardId) : undefined,
        districtId: adminDistrictId,
        status: 'pending',
        loginTokenHash: tokenHash,
        loginTokenExpires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdById: req.user.id,
      },
      select: { id: true, fullName: true, email: true, employeeId: true, status: true },
    })
    await logAction(req, { action: 'create_village_officer', targetTable: 'village_officers', targetId: created.id, newData: created })
    return res.json({ success: true, data: { ...created, authToken: token } })
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ success: false, message: 'A record with this email, NIDA number, or employee ID already exists' })
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

router.delete('/village-officers/:id', async (req, res) => {
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
    console.error('[admin/delete-village-officer]', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
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
  const { fullName, email, nidaNumber, employeeId, mobile, facilityId } = req.body
  if (!fullName || !email || !nidaNumber || !employeeId) {
    return res.status(400).json({ success: false, message: 'fullName, email, nidaNumber and employeeId are required' })
  }
  try {
    const adminDistrictId = await getAdminDistrictId(req)
    const token = generateAuthToken('HOFF')
    const tokenHash = await bcrypt.hash(token, 10)
    const created = await prisma.hospitalOfficer.create({
      data: {
        fullName, email, nidaNumber, employeeId,
        mobile: mobile || undefined,
        facilityId: facilityId ? Number(facilityId) : undefined,
        districtId: adminDistrictId,
        status: 'pending',
        loginTokenHash: tokenHash,
        loginTokenExpires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdById: req.user.id,
      },
      select: { id: true, fullName: true, email: true, employeeId: true, status: true },
    })
    await logAction(req, { action: 'create_hospital_officer', targetTable: 'hospital_officers', targetId: created.id, newData: created })
    return res.json({ success: true, data: { ...created, authToken: token } })
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ success: false, message: 'A record with this email, NIDA number, or employee ID already exists' })
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

router.delete('/health-officers/:id', async (req, res) => {
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
    console.error('[admin/delete-hospital-officer]', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
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
  const { fullName, email, nidaNumber, employeeId, mobile, department } = req.body
  if (!fullName || !email || !nidaNumber || !employeeId) {
    return res.status(400).json({ success: false, message: 'fullName, email, nidaNumber and employeeId are required' })
  }
  try {
    const token     = generateAuthToken('SADM')
    const tokenHash = await bcrypt.hash(token, 10)
    const created   = await prisma.superAdmin.create({
      data: {
        fullName, email, nidaNumber, employeeId,
        mobile:     mobile     || undefined,
        department: department || undefined,
        status:            'pending',
        loginTokenHash:    tokenHash,
        loginTokenExpires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdById:       req.user.id,
      },
      select: { id: true, fullName: true, email: true, employeeId: true, status: true },
    })
    await logAction(req, {
      action: 'create_super_admin', targetTable: 'super_admins', targetId: created.id,
      newData: created, severity: 'warning',
    })
    // PATCH-EMAIL-2025: send one-time token to newly registered super admin
    sendAuthTokenEmail({
      to:        email,
      fullName,
      token,
      role:      'super_admin',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    }).catch(err => console.error('[email/super-admin]', err.message))
    return res.json({ success: true, data: { ...created, authToken: token } })
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ success: false, message: 'A record with this email, NIDA number, or employee ID already exists' })
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
    if (err.code === 'P2025') return res.status(404).json({ success: false, message: 'Not found' })
    console.error('[admin/delete-super-admin]', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
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
    await prisma[model].delete({ where: { id } })
    await logAction(req, { action: 'delete_user', targetTable: `${role}s`, targetId: id, newData: { role }, severity: 'warning' })
    return res.json({ success: true })
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ success: false, message: 'Not found' })
    console.error('[admin/delete-user]', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
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
router.get('/system-performance', requireRole('super_admin'), async (req, res) => {
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
    const { regionId, districtId, startDate, endDate } = req.query
    const dateFilter = {}
    if (startDate) dateFilter.gte = new Date(startDate)
    if (endDate)   dateFilter.lte = new Date(endDate)

    const geoFilter = {}
    if (regionId)   geoFilter.regionId   = regionId
    if (districtId) geoFilter.districtId = districtId

    const [birthRows, deathRows, marriageRows] = await Promise.all([
      prisma.birth.groupBy({
        by: ['createdAt'],
        _count: { id: true },
        where: {
          ...(Object.keys(dateFilter).length ? { createdAt: dateFilter } : {}),
          ...(regionId || districtId ? {
            registeredBy: { district: { ...(regionId ? { regionId } : {}), ...(districtId ? { id: districtId } : {}) } }
          } : {}),
        },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.death.groupBy({
        by: ['createdAt'],
        _count: { id: true },
        where: Object.keys(dateFilter).length ? { createdAt: dateFilter } : {},
        orderBy: { createdAt: 'asc' },
      }),
      prisma.marriage.groupBy({
        by: ['createdAt'],
        _count: { id: true },
        where: Object.keys(dateFilter).length ? { createdAt: dateFilter } : {},
        orderBy: { createdAt: 'asc' },
      }),
    ])

    // Aggregate by month label
    const toMonth = (row) => {
      const d = new Date(row.createdAt)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    }
    const agg = (rows) => {
      const map = {}
      rows.forEach(r => { const m = toMonth(r); map[m] = (map[m] || 0) + r._count.id })
      return Object.entries(map).sort().map(([month, count]) => ({ month, count }))
    }

    return res.json({
      success: true,
      data: {
        births:    agg(birthRows),
        deaths:    agg(deathRows),
        marriages: agg(marriageRows),
        totals: {
          births:    birthRows.reduce((s, r) => s + r._count.id, 0),
          deaths:    deathRows.reduce((s, r) => s + r._count.id, 0),
          marriages: marriageRows.reduce((s, r) => s + r._count.id, 0),
        },
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
    const { regionId, districtId, startDate, endDate } = req.query
    const dateFilter = {}
    if (startDate) dateFilter.gte = new Date(startDate)
    if (endDate)   dateFilter.lte = new Date(endDate)

    const ninRows = await prisma.citizen.groupBy({
      by: ['createdAt'],
      _count: { id: true },
      where: {
        nin: { not: null },
        ...(Object.keys(dateFilter).length ? { createdAt: dateFilter } : {}),
        ...(regionId ? { regionId } : {}),
      },
      orderBy: { createdAt: 'asc' },
    })

    const toMonth = (row) => {
      const d = new Date(row.createdAt)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    }
    const monthMap = {}
    ninRows.forEach(r => { const m = toMonth(r); monthMap[m] = (monthMap[m] || 0) + r._count.id })
    const trend = Object.entries(monthMap).sort().map(([month, count]) => ({ month, count }))

    return res.json({
      success: true,
      data: {
        ninIssuances: trend,
        total: ninRows.reduce((s, r) => s + r._count.id, 0),
      },
    })
  } catch (err) {
    console.error('[admin/nida]', err)
    return res.status(500).json({ success: false, message: 'Failed to fetch NIDA trends' })
  }
})

module.exports = router
