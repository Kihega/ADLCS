/**
 * dashboard.js — Officer Dashboard API Routes  v2.0
 *
 * CHANGES v2.0:
 *   • GET /api/officer/dashboard now returns facilityRegion + facilityDistrict
 *     (joined through HealthFacility → Village → Ward → District → Region)
 *   • GET /api/officer/report — report data for a given period (daily/weekly/monthly/annual)
 *   • Seed check: if no hospital officer or facility exists, returns sensible defaults
 *     without crashing (dev / fresh-DB friendly)
 *   • All counts use real DB queries (no mocks)
 *
 * Routes:
 *   GET  /api/officer/dashboard        — stats + facility info (real DB)
 *   GET  /api/officer/activity         — recent events feed
 *   GET  /api/officer/records          — paginated birth/death list
 *   GET  /api/officer/records/pending  — unresolved records
 *   POST /api/officer/death            — record new death
 *   GET  /api/officer/certificate/lookup
 *   POST /api/officer/certificate/issue
 *   GET  /api/officer/sync/status
 *   POST /api/officer/sync/trigger
 *   GET  /api/officer/citizen-lookup
 *   GET  /api/officer/report           — period report (daily/weekly/monthly/annual)
 */

const { Router } = require('express')
const { prisma }  = require('../lib/prisma')
const { requireAuth } = require('../middleware/auth')

const router = Router()
router.use(requireAuth)

// ── Date helpers ──────────────────────────────────────────────────────────────
function startOfDay(d = new Date()) {
  const r = new Date(d); r.setHours(0, 0, 0, 0); return r
}
function endOfDay(d = new Date()) {
  const r = new Date(d); r.setHours(23, 59, 59, 999); return r
}
function startOfWeek(d = new Date()) {
  const r = new Date(d); r.setDate(r.getDate() - r.getDay()); r.setHours(0, 0, 0, 0); return r
}
function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0)
}
function startOfYear(d = new Date()) {
  return new Date(d.getFullYear(), 0, 1, 0, 0, 0)
}
function tomorrow(d = new Date()) {
  const r = new Date(d); r.setDate(r.getDate() + 1); r.setHours(0, 0, 0, 0); return r
}

// ── Resolve facility region / district via village join chain ─────────────────
async function resolveFacilityLocation(facilityId) {
  if (!facilityId) return { region: '—', district: '—' }
  try {
    const facility = await prisma.healthFacility.findUnique({
      where:   { id: facilityId },
      include: {
        village: {
          include: {
            ward: {
              include: { district: { include: { region: true } } },
            },
          },
        },
      },
    })
    const district = facility?.village?.ward?.district
    const region   = district?.region
    return {
      region:   region?.name   ?? '—',
      district: district?.name ?? '—',
    }
  } catch { return { region: '—', district: '—' } }
}

// ── GET /api/officer/dashboard ─────────────────────────────────────────────────
router.get('/dashboard', async (req, res) => {
  const { id, role } = req.user
  try {
    // ── Hospital officer ─────────────────────────────────────────────────────
    if (role === 'hospital_officer') {
      const officer = await prisma.hospitalOfficer.findUnique({
        where:   { id },
        include: { facility: true },
      })
      if (!officer) return res.status(404).json({ success: false, message: 'Officer not found' })

      const today      = startOfDay()
      const tmrw       = tomorrow()
      const monthStart = startOfMonth()
      const fid        = officer.facilityId ?? -1

      const [
        todayBirths, todayDeaths,
        monthBirths, monthDeaths,
        pendingBirths,
        facilityCertIssued, facilityDeliveries,
        lastSync,
        location,
      ] = await Promise.all([
        prisma.birth.count({ where: { officerId: id, registeredAt: { gte: today, lt: tmrw } } }),
        prisma.death.count({ where: { hospitalOfficerId: id, registeredAt: { gte: today, lt: tmrw } } }),
        prisma.birth.count({ where: { officerId: id, registeredAt: { gte: monthStart } } }),
        prisma.death.count({ where: { hospitalOfficerId: id, registeredAt: { gte: monthStart } } }),
        prisma.birth.count({ where: { officerId: id, certPdfUrl: null } }),
        prisma.birth.count({ where: { facilityId: fid, certPdfUrl: { not: null } } }),
        prisma.birth.count({ where: { facilityId: fid } }),
        prisma.birth.findFirst({
          where:   { officerId: id, ritaSynced: true },
          orderBy: { ritaSyncAt: 'desc' },
          select:  { ritaSyncAt: true },
        }),
        resolveFacilityLocation(officer.facilityId),
      ])

      return res.json({
        success: true,
        data: {
          officerName:        officer.fullName,
          facilityName:       officer.facility?.facilityName  ?? 'Unknown Facility',
          facilityType:       officer.facility?.facilityType  ?? 'hospital',
          facilityGrade:      officer.facility?.facilityGrade ?? '',
          facilityRegion:     location.region,
          facilityDistrict:   location.district,
          todayBirths,
          todayDeaths,
          pendingCases:       pendingBirths,
          monthBirths,
          monthDeaths,
          monthCertificates:  monthBirths,
          facilityDeliveries,
          facilityCertIssued,
          ritaSynced:         !!lastSync,
          lastRitaSyncAt:     lastSync?.ritaSyncAt ?? null,
          facilityGpsLat:     officer.facility?.gpsLat ? Number(officer.facility.gpsLat) : null,
          facilityGpsLng:     officer.facility?.gpsLng ? Number(officer.facility.gpsLng) : null,
        },
      })
    }

    // ── Village officer ──────────────────────────────────────────────────────
    if (role === 'village_officer') {
      const officer = await prisma.villageOfficer.findUnique({
        where:   { id },
        include: { village: true, ward: true },
      })
      if (!officer) return res.status(404).json({ success: false, message: 'Officer not found' })

      const monthStart = startOfMonth()
      const vid = officer.villageId ?? -1

      const [totalCitizens, monthBirths, monthDeaths, monthMigrations, pendingCases] = await Promise.all([
        prisma.citizen.count({ where: { currentVillageId: vid } }),
        prisma.birth.count({
          where: { registeredAt: { gte: monthStart }, child: { currentVillageId: vid } },
        }),
        prisma.death.count({ where: { registeredAt: { gte: monthStart }, villageOfficerId: id } }),
        prisma.migration?.count?.({
          where: { OR: [{ sourceOfficerId: id }, { targetOfficerId: id }] },
        }).catch(() => 0) ?? Promise.resolve(0),
        prisma.citizen.count({ where: { currentVillageId: vid, vitalStatus: 'alive', idCardIssued: null } })
          .catch(() => 0),
      ])

      return res.json({
        success: true,
        data: {
          officerName:     officer.fullName,
          employeeId:      officer.employeeId,
          villageName:     officer.village?.name  ?? 'Unknown Village',
          wardName:        officer.ward?.name     ?? 'Unknown Ward',
          totalCitizens,
          monthBirths,
          monthDeaths,
          monthMigrations,
          pendingCases,
          ritaSynced:      true,
          villageGpsLat:   null,
          villageGpsLng:   null,
        },
      })
    }

    return res.status(403).json({ success: false, message: 'Role not eligible for officer dashboard' })
  } catch (err) {
    console.error('[dashboard]', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
})

// ── GET /api/officer/activity ─────────────────────────────────────────────────
router.get('/activity', async (req, res) => {
  const { id, role } = req.user
  const limit = Math.min(parseInt(req.query.limit) || 5, 20)
  try {
    const items = []
    if (role === 'hospital_officer') {
      const births = await prisma.birth.findMany({
        where:   { officerId: id, registeredAt: { gte: startOfDay(), lte: endOfDay() } },
        orderBy: { registeredAt: 'desc' },
        take:    limit,
        select:  { id: true, childFirstName: true, childSurname: true, gender: true, registeredAt: true },
      })
      for (const b of births) {
        items.push({
          id:           `birth-${b.id}`,
          icon:         '👶',
          label:        'Birth registered',
          name:         `${b.childFirstName} ${b.childSurname} — ${b.gender === 'male' ? 'Baby Boy' : 'Baby Girl'}`,
          time:         new Date(b.registeredAt).toLocaleTimeString('en-TZ', { hour: '2-digit', minute: '2-digit' }),
          registeredAt: b.registeredAt,
          color:        '#1eb53a',
        })
      }
    }
    if (role === 'village_officer') {
      const [citizens, deaths] = await Promise.all([
        prisma.citizen.findMany({
          where: { registeredById: id, registeredAt: { gte: startOfDay(), lte: endOfDay() } },
          orderBy: { registeredAt: 'desc' }, take: limit,
          select: { id: true, firstName: true, surname: true, registeredAt: true },
        }),
        prisma.death.findMany({
          where: { villageOfficerId: id, registeredAt: { gte: startOfDay(), lte: endOfDay() } },
          orderBy: { registeredAt: 'desc' }, take: limit,
          select: { id: true, deathCertNo: true, causeOfDeath: true, registeredAt: true },
        }).catch(() => []),
      ])
      for (const c of citizens) {
        items.push({ id: `citizen-${c.id}`, icon: '👤', label: 'Citizen registered',
          name: `${c.firstName} ${c.surname}`,
          time: new Date(c.registeredAt ?? new Date()).toLocaleTimeString('en-TZ', { hour: '2-digit', minute: '2-digit' }),
          registeredAt: c.registeredAt,
          color: '#00a3dd' })
      }
      for (const d of deaths) {
        items.push({ id: `death-${d.id}`, icon: '✝', label: 'Death recorded',
          name: d.causeOfDeath ?? 'Cause unknown',
          time: new Date(d.registeredAt ?? new Date()).toLocaleTimeString('en-TZ', { hour: '2-digit', minute: '2-digit' }),
          registeredAt: d.registeredAt,
          color: '#dc2626' })
      }
      // Sort by actual timestamp desc (today-only, so this is a same-day sort)
      items.sort((a, b) => new Date(b.registeredAt).getTime() - new Date(a.registeredAt).getTime())
    }
    return res.json({ success: true, data: items.slice(0, limit) })
  } catch (err) {
    console.error('[activity]', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
})

// ── GET /api/officer/records ──────────────────────────────────────────────────
router.get('/records', async (req, res) => {
  const { id, role } = req.user
  const type   = req.query.type  || 'all'
  const page   = Math.max(parseInt(req.query.page) || 1, 1)
  const limit  = Math.min(parseInt(req.query.limit) || 20, 50)
  const q      = req.query.q?.toString().trim() || ''
  const skip   = (page - 1) * limit

  // Village officers use the dedicated village/records endpoint
  if (role === 'village_officer') {
    try {
      const out = []
      const deaths = await prisma.death.findMany({
        where: { villageOfficerId: id },
        orderBy: { registeredAt: 'desc' }, take: limit, skip,
        select: { id: true, deathCertNo: true, nationalId: true, causeOfDeath: true, registeredAt: true, ritaSynced: true },
      })
      for (const d of deaths) {
        out.push({ id: `death-${d.id}`, type: 'death', certNo: d.deathCertNo,
          name: d.nationalId ?? 'Unknown',
          date: new Date(d.registeredAt ?? new Date()).toLocaleDateString('en-TZ'),
          ritaSynced: d.ritaSynced ?? false, certIssued: false })
      }
      const citizens = await prisma.citizen.findMany({
        where: { registeredById: id },
        orderBy: { registeredAt: 'desc' }, take: limit, skip,
        select: { id: true, firstName: true, surname: true, nationalId: true, registeredAt: true },
      })
      for (const c of citizens) {
        out.push({ id: `citizen-${c.id}`, type: 'birth', certNo: c.nationalId ?? '—',
          name: `${c.firstName} ${c.surname}`,
          date: new Date(c.registeredAt ?? new Date()).toLocaleDateString('en-TZ'),
          ritaSynced: true, certIssued: false })
      }
      out.sort((a, b) => new Date(b.date) - new Date(a.date))
      return res.json({ success: true, data: out.slice(0, limit), total: out.length, page })
    } catch (err) {
      console.error('[records/village]', err)
      return res.status(500).json({ success: false, message: 'Internal server error' })
    }
  }

  // Hospital officer
  try {
    const results = []
    if (type === 'all' || type === 'birth') {
      const births = await prisma.birth.findMany({
        where: {
          officerId: id,
          ...(q ? { OR: [
            { birthCertNo:    { contains: q, mode: 'insensitive' } },
            { childFirstName: { contains: q, mode: 'insensitive' } },
            { childSurname:   { contains: q, mode: 'insensitive' } },
          ]} : {}),
        },
        orderBy: { registeredAt: 'desc' }, take: limit, skip,
        select: { id: true, birthCertNo: true, childFirstName: true, childSurname: true, registeredAt: true, ritaSynced: true, certPdfUrl: true },
      })
      for (const b of births) {
        results.push({ id: `birth-${b.id}`, type: 'birth', certNo: b.birthCertNo,
          name: `${b.childFirstName} ${b.childSurname}`,
          date: new Date(b.registeredAt).toLocaleDateString('en-TZ'),
          ritaSynced: b.ritaSynced, certIssued: !!b.certPdfUrl })
      }
    }
    if (type === 'all' || type === 'death') {
      const deaths = await prisma.death.findMany({
        where: {
          hospitalOfficerId: id,
          ...(q ? { OR: [
            { deathCertNo: { contains: q, mode: 'insensitive' } },
            { nationalId:  { contains: q, mode: 'insensitive' } },
          ]} : {}),
        },
        orderBy: { registeredAt: 'desc' }, take: limit, skip,
        select: { id: true, deathCertNo: true, nationalId: true, registeredAt: true, ritaSynced: true, certPdfUrl: true },
      })
      for (const d of deaths) {
        results.push({ id: `death-${d.id}`, type: 'death', certNo: d.deathCertNo,
          name: d.nationalId ?? 'Unknown',
          date: new Date(d.registeredAt ?? new Date()).toLocaleDateString('en-TZ'),
          ritaSynced: d.ritaSynced ?? false, certIssued: !!d.certPdfUrl })
      }
    }
    return res.json({ success: true, data: results.slice(0, limit), total: results.length, page })
  } catch (err) {
    console.error('[records]', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
})

// ── GET /api/officer/records/pending ─────────────────────────────────────────
router.get('/records/pending', async (req, res) => {
  const { id } = req.user
  try {
    const births = await prisma.birth.findMany({
      where: { officerId: id, OR: [{ certPdfUrl: null }, { ritaSynced: false }] },
      orderBy: { registeredAt: 'desc' }, take: 50,
      select: { id: true, birthCertNo: true, childFirstName: true, childSurname: true, registeredAt: true, certPdfUrl: true, ritaSynced: true },
    })
    return res.json({
      success: true,
      data: births.map(b => ({
        id:      `birth-${b.id}`,
        type:    'birth',
        certNo:  b.birthCertNo,
        name:    `${b.childFirstName} ${b.childSurname}`,
        date:    new Date(b.registeredAt).toLocaleDateString('en-TZ'),
        reasons: [
          ...(!b.certPdfUrl  ? ['no_certificate'] : []),
          ...(!b.ritaSynced  ? ['rita_unsynced']  : []),
        ],
      })),
    })
  } catch (err) {
    console.error('[pending]', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
})

// ── POST /api/officer/death ───────────────────────────────────────────────────
router.post('/death', async (req, res) => {
  const { id } = req.user
  const { citizenId, nationalId, causeOfDeath, dateOfDeath, locationType, category, informantName, informantAddress } = req.body
  if (!causeOfDeath || !dateOfDeath || !locationType || !category) {
    return res.status(400).json({ success: false, message: 'Missing required fields' })
  }
  try {
    const officer = await prisma.hospitalOfficer.findUnique({ where: { id }, select: { facilityId: true } })
    const certNo  = `TZ-DEATH-${Date.now()}-${Math.floor(Math.random() * 9000) + 1000}`
    const death   = await prisma.death.create({
      data: {
        deathCertNo:       certNo,
        citizenId:         citizenId  || undefined,
        nationalId:        nationalId || undefined,
        dateOfDeath:       new Date(dateOfDeath),
        causeOfDeath,
        locationType,
        category,
        informantName:     informantName    || undefined,
        informantAddress:  informantAddress || undefined,
        facilityId:        officer?.facilityId || undefined,
        hospitalOfficerId: id,
      },
      select: { id: true, deathCertNo: true },
    })
    return res.json({ success: true, data: { deathCertNo: death.deathCertNo } })
  } catch (err) {
    console.error('[death]', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
})

// ── GET /api/officer/certificate/lookup ──────────────────────────────────────
router.get('/certificate/lookup', async (req, res) => {
  const { id } = req.user
  const { type, q } = req.query
  if (!q) return res.status(400).json({ success: false, message: 'Query required' })
  try {
    if (type === 'birth') {
      const birth = await prisma.birth.findFirst({
        where: { officerId: id, OR: [
          { birthCertNo:    { contains: q, mode: 'insensitive' } },
          { childFirstName: { contains: q, mode: 'insensitive' } },
          { childSurname:   { contains: q, mode: 'insensitive' } },
        ]},
      })
      if (!birth) return res.json({ success: false, message: 'Not found' })
      return res.json({ success: true, data: { ...birth, certNo: birth.birthCertNo } })
    }
    if (type === 'death') {
      const death = await prisma.death.findFirst({
        where: { hospitalOfficerId: id, OR: [
          { deathCertNo: { contains: q, mode: 'insensitive' } },
          { nationalId:  { contains: q, mode: 'insensitive' } },
        ]},
      })
      if (!death) return res.json({ success: false, message: 'Not found' })
      return res.json({ success: true, data: { ...death, certNo: death.deathCertNo } })
    }
    return res.status(400).json({ success: false, message: 'Invalid type' })
  } catch (err) {
    console.error('[cert-lookup]', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
})

// ── POST /api/officer/certificate/issue ──────────────────────────────────────
router.post('/certificate/issue', async (req, res) => {
  const { type, recordId } = req.body
  if (!type || !recordId) return res.status(400).json({ success: false, message: 'type and recordId required' })
  try {
    // BUGFIX-2: build the certificate URL from .env instead of a hardcoded
    // domain, so it automatically follows the backend if it ever moves.
    const publicBase = (process.env.PUBLIC_BACKEND_URL || '').replace(/\/$/, '')
    if (!publicBase) {
      console.warn('⚠️  PUBLIC_BACKEND_URL is not set in .env — certificate links will be relative paths only.')
    }
    const pdfUrl = `${publicBase}/certificates/${type}/${recordId}.pdf`
    if (type === 'birth')       await prisma.birth.update({ where: { id: recordId }, data: { certPdfUrl: pdfUrl } })
    else if (type === 'death')  await prisma.death.update({ where: { id: recordId }, data: { certPdfUrl: pdfUrl } })
    return res.json({ success: true, data: { pdfUrl } })
  } catch (err) {
    console.error('[cert-issue]', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
})

// ── GET /api/officer/sync/status ─────────────────────────────────────────────
router.get('/sync/status', async (req, res) => {
  const { id } = req.user
  try {
    const [unsyncedBirths, unsyncedDeaths, totalSynced, lastSync] = await Promise.all([
      prisma.birth.count({ where: { officerId: id, ritaSynced: false } }),
      prisma.death.count({ where: { hospitalOfficerId: id, ritaSynced: false } }),
      prisma.birth.count({ where: { officerId: id, ritaSynced: true } }),
      prisma.birth.findFirst({
        where: { officerId: id, ritaSynced: true },
        orderBy: { ritaSyncAt: 'desc' },
        select: { ritaSyncAt: true },
      }),
    ])
    return res.json({
      success: true,
      data: { connected: true, systemEndpointOk: true, unsyncedBirths, unsyncedDeaths, totalSynced, lastSyncAt: lastSync?.ritaSyncAt ?? null },
    })
  } catch (err) {
    console.error('[sync-status]', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
})

// ── POST /api/officer/sync/trigger ────────────────────────────────────────────
router.post('/sync/trigger', async (req, res) => {
  const { id } = req.user
  try {
    const now = new Date()
    const [births, deaths] = await Promise.all([
      prisma.birth.updateMany({ where: { officerId: id, ritaSynced: false }, data: { ritaSynced: true, ritaSyncAt: now } }),
      prisma.death.updateMany({ where: { hospitalOfficerId: id, ritaSynced: false }, data: { ritaSynced: true } }),
    ])
    return res.json({ success: true, data: { synced: births.count + deaths.count, syncedAt: now } })
  } catch (err) {
    console.error('[sync-trigger]', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
})

// ── GET /api/officer/citizen-lookup ──────────────────────────────────────────
router.get('/citizen-lookup', async (req, res) => {
  const q = req.query.q?.toString().trim()
  if (!q) return res.status(400).json({ success: false, message: 'Query required' })
  try {
    // Try exact NID match first (most common mobile use-case: scan/type NID)
    let citizen = await prisma.citizen.findFirst({
      where: { nationalId: q },
      select: { id: true, nationalId: true, firstName: true, middleName: true, surname: true, gender: true, dateOfBirth: true, vitalStatus: true },
    })
    // Fallback: partial name search (if not an exact NID query)
    if (!citizen) {
      citizen = await prisma.citizen.findFirst({
        where: { OR: [
          { nationalId: { contains: q, mode: 'insensitive' } },
          { firstName:  { contains: q, mode: 'insensitive' } },
          { surname:    { contains: q, mode: 'insensitive' } },
        ]},
        select: { id: true, nationalId: true, firstName: true, middleName: true, surname: true, gender: true, dateOfBirth: true, vitalStatus: true },
      })
    }
    if (!citizen) return res.json({ success: false, message: 'Not found' })
    return res.json({
      success: true,
      data: { ...citizen, fullName: [citizen.firstName, citizen.middleName, citizen.surname].filter(Boolean).join(' ') },
    })
  } catch (err) {
    console.error('[citizen-lookup]', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
})

// ── GET /api/officer/report — period-based report data ────────────────────────
router.get('/report', async (req, res) => {
  const { id }   = req.user
  const period   = (req.query.period || 'daily').toString().toLowerCase()
  const dataType = (req.query.type   || 'births').toString().toLowerCase()

  const now  = new Date()
  const from = period === 'daily'   ? startOfDay(now)
             : period === 'weekly'  ? startOfWeek(now)
             : period === 'monthly' ? startOfMonth(now)
             :                       startOfYear(now)

  try {
    const officer = await prisma.hospitalOfficer.findUnique({
      where:   { id },
      include: { facility: true },
    })
    const location = await resolveFacilityLocation(officer?.facilityId)

    let records = []
    if (dataType === 'births') {
      const births = await prisma.birth.findMany({
        where:   { officerId: id, registeredAt: { gte: from, lte: endOfDay(now) } },
        orderBy: { registeredAt: 'desc' },
        select:  { birthCertNo: true, childFirstName: true, childSurname: true, gender: true, registeredAt: true, ritaSynced: true, certPdfUrl: true },
      })
      records = births.map(b => ({
        certNo:     b.birthCertNo,
        name:       `${b.childFirstName} ${b.childSurname}`,
        gender:     b.gender,
        date:       new Date(b.registeredAt).toLocaleDateString('en-TZ'),
        synced:     b.ritaSynced,
        certIssued: !!b.certPdfUrl,
      }))
    } else {
      const deaths = await prisma.death.findMany({
        where:   { hospitalOfficerId: id, registeredAt: { gte: from, lte: endOfDay(now) } },
        orderBy: { registeredAt: 'desc' },
        select:  { deathCertNo: true, nationalId: true, causeOfDeath: true, registeredAt: true, ritaSynced: true },
      })
      records = deaths.map(d => ({
        certNo:  d.deathCertNo,
        name:    d.nationalId ?? 'Unknown',
        cause:   d.causeOfDeath,
        date:    new Date(d.registeredAt ?? new Date()).toLocaleDateString('en-TZ'),
        synced:  d.ritaSynced ?? false,
      }))
    }

    return res.json({
      success: true,
      data: {
        period,
        dataType,
        from:          from.toISOString(),
        to:            endOfDay(now).toISOString(),
        facilityName:  officer?.facility?.facilityName ?? '—',
        facilityRegion: location.region,
        facilityDistrict: location.district,
        officerName:   officer?.fullName ?? '—',
        totalCount:    records.length,
        records,
      },
    })
  } catch (err) {
    console.error('[report]', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
})

module.exports = router
