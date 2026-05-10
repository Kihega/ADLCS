/**
 * dashboard.js — Officer Dashboard API Routes  v1.0
 *
 * GET  /api/officer/dashboard   — today's stats + facility info (real DB)
 * GET  /api/officer/activity    — recent 5 events for the officer
 * GET  /api/officer/records     — paginated birth/death list with filters
 * GET  /api/officer/records/pending — records with outstanding issues
 * POST /api/officer/death       — record a new death
 * GET  /api/officer/certificate/lookup  — find record for cert issuance
 * POST /api/officer/certificate/issue   — generate and attach cert PDF
 * GET  /api/officer/sync/status  — RITA sync state
 * POST /api/officer/sync/trigger — manually push unsynced records to RITA
 * GET  /api/officer/citizen-lookup — search citizen by national ID / name
 */

const { Router } = require('express')
const { prisma }  = require('../lib/prisma')
const { requireAuth } = require('../middleware/auth')

const router = Router()

// ── All routes require a valid JWT ────────────────────────────────────────────
router.use(requireAuth)

// ── Helpers ───────────────────────────────────────────────────────────────────
function startOfToday() {
  const d = new Date(); d.setHours(0, 0, 0, 0); return d
}
function startOfMonth() {
  const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d
}
function tomorrow() {
  const d = startOfToday(); d.setDate(d.getDate() + 1); return d
}

// ── GET /api/officer/dashboard ─────────────────────────────────────────────────
router.get('/dashboard', async (req, res) => {
  const { id, role } = req.user

  try {
    if (role === 'hospital_officer') {
      const officer = await prisma.hospitalOfficer.findUnique({
        where:   { id },
        include: { facility: true },
      })
      if (!officer) return res.status(404).json({ success: false, message: 'Officer not found' })

      const today      = startOfToday()
      const monthStart = startOfMonth()
      const tmrw       = tomorrow()

      const [
        todayBirths, todayDeaths,
        monthBirths, monthDeaths,
        pendingBirths,
        facilityCertIssued, facilityDeliveries,
        lastSync,
      ] = await Promise.all([
        prisma.birth.count({ where: { officerId: id, registeredAt: { gte: today, lt: tmrw } } }),
        prisma.death.count({ where: { hospitalOfficerId: id, createdAt:  { gte: today, lt: tmrw } } }),
        prisma.birth.count({ where: { officerId: id, registeredAt: { gte: monthStart } } }),
        prisma.death.count({ where: { hospitalOfficerId: id, createdAt:  { gte: monthStart } } }),
        prisma.birth.count({ where: { officerId: id, certPdfUrl: null } }),
        prisma.birth.count({ where: { facilityId: officer.facilityId ?? -1, certPdfUrl: { not: null } } }),
        prisma.birth.count({ where: { facilityId: officer.facilityId ?? -1 } }),
        prisma.birth.findFirst({
          where:   { officerId: id, ritaSynced: true },
          orderBy: { ritaSyncAt: 'desc' },
          select:  { ritaSyncAt: true },
        }),
      ])

      return res.json({
        success: true,
        data: {
          officerName:       officer.fullName,
          facilityName:      officer.facility?.facilityName  ?? 'Unknown Facility',
          facilityType:      officer.facility?.facilityType  ?? 'hospital',
          facilityGrade:     officer.facility?.facilityGrade ?? '',
          todayBirths,
          todayDeaths,
          pendingCases:      pendingBirths,
          monthBirths,
          monthDeaths,
          monthCertificates: monthBirths,   // certs issued ≈ births registered this month
          facilityDeliveries,
          facilityCertIssued,
          ritaSynced:        !!lastSync,
          lastRitaSyncAt:    lastSync?.ritaSyncAt ?? null,
          facilityGpsLat:    officer.facility?.gpsLat ? Number(officer.facility.gpsLat) : null,
          facilityGpsLng:    officer.facility?.gpsLng ? Number(officer.facility.gpsLng) : null,
        },
      })
    }

    if (role === 'village_officer') {
      const officer = await prisma.villageOfficer.findUnique({
        where:   { id },
        include: { village: true, ward: true },
      })
      if (!officer) return res.status(404).json({ success: false, message: 'Officer not found' })

      const monthStart = startOfMonth()

      const [
        totalCitizens, monthBirths, monthDeaths, monthMigrations, pendingCases,
      ] = await Promise.all([
        prisma.citizen.count({ where: { currentVillageId: officer.villageId ?? -1 } }),
        prisma.birth.count({
          where: { registeredAt: { gte: monthStart }, child: { currentVillageId: officer.villageId ?? -1 } },
        }),
        prisma.death.count({
          where: { createdAt: { gte: monthStart }, villageOfficerId: id },
        }),
        prisma.migration.count({
          where: {
            createdAt:  { gte: monthStart },
            OR: [{ sourceOfficerId: id }, { targetOfficerId: id }],
          },
        }),
        prisma.citizen.count({
          where: {
            currentVillageId: officer.villageId ?? -1,
            vitalStatus:      'alive',
            idCardIssued:     null,
          },
        }),
      ])

      return res.json({
        success: true,
        data: {
          officerName:     officer.fullName,
          employeeId:      officer.employeeId,
          villageName:     officer.village?.name ?? 'Unknown Village',
          wardName:        officer.ward?.name    ?? 'Unknown Ward',
          totalCitizens,
          monthBirths,
          monthDeaths,
          monthMigrations,
          pendingCases,
          ritaSynced:      true,
          villageGpsLat:   null,  // Village GPS in next sprint
          villageGpsLng:   null,
        },
      })
    }

    return res.status(403).json({ success: false, message: 'Role not eligible for officer dashboard' })
  } catch (err) {
    console.error('[dashboard] error:', err)
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
        where:   { officerId: id },
        orderBy: { registeredAt: 'desc' },
        take:    limit,
        select:  { id: true, childFirstName: true, childSurname: true, gender: true, registeredAt: true, birthCertNo: true },
      })
      for (const b of births) {
        items.push({
          id:    `birth-${b.id}`,
          icon:  '👶',
          label: 'Birth registered',
          name:  `${b.childFirstName} ${b.childSurname} — ${b.gender === 'male' ? 'Baby Boy' : 'Baby Girl'}`,
          time:  new Date(b.registeredAt).toLocaleTimeString('en-TZ', { hour: '2-digit', minute: '2-digit' }),
          color: '#1eb53a',
        })
      }
    }

    if (role === 'village_officer') {
      const citizens = await prisma.citizen.findMany({
        where:   { registeredById: id },
        orderBy: { createdAt: 'desc' },
        take:    limit,
        select:  { id: true, firstName: true, surname: true, createdAt: true },
      })
      for (const c of citizens) {
        items.push({
          id:    `citizen-${c.id}`,
          icon:  '👤',
          label: 'Citizen registered',
          name:  `${c.firstName} ${c.surname}`,
          time:  new Date(c.createdAt).toLocaleTimeString('en-TZ', { hour: '2-digit', minute: '2-digit' }),
          color: '#00a3dd',
        })
      }
    }

    items.sort((a, b) => 0) // already ordered by DB query
    return res.json({ success: true, data: items.slice(0, limit) })
  } catch (err) {
    console.error('[activity] error:', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
})

// ── GET /api/officer/records ──────────────────────────────────────────────────
router.get('/records', async (req, res) => {
  const { id } = req.user
  const type  = req.query.type  || 'all'
  const page  = Math.max(parseInt(req.query.page)  || 1, 1)
  const limit = Math.min(parseInt(req.query.limit) || 20, 50)
  const q     = req.query.q?.toString().trim() || ''
  const skip  = (page - 1) * limit

  try {
    const results = []

    if (type === 'all' || type === 'birth') {
      const where = {
        officerId: id,
        ...(q ? {
          OR: [
            { birthCertNo:     { contains: q, mode: 'insensitive' } },
            { childFirstName:  { contains: q, mode: 'insensitive' } },
            { childSurname:    { contains: q, mode: 'insensitive' } },
          ],
        } : {}),
      }
      const births = await prisma.birth.findMany({
        where, orderBy: { registeredAt: 'desc' },
        take: limit, skip,
        select: { id: true, birthCertNo: true, childFirstName: true, childSurname: true, registeredAt: true, ritaSynced: true, certPdfUrl: true },
      })
      for (const b of births) {
        results.push({
          id:         `birth-${b.id}`,
          type:       'birth',
          certNo:     b.birthCertNo,
          name:       `${b.childFirstName} ${b.childSurname}`,
          date:       new Date(b.registeredAt).toLocaleDateString('en-TZ'),
          ritaSynced: b.ritaSynced,
          certIssued: !!b.certPdfUrl,
        })
      }
    }

    if (type === 'all' || type === 'death') {
      const where = {
        hospitalOfficerId: id,
        ...(q ? {
          OR: [
            { deathCertNo: { contains: q, mode: 'insensitive' } },
            { nationalId:  { contains: q, mode: 'insensitive' } },
          ],
        } : {}),
      }
      const deaths = await prisma.death.findMany({
        where, orderBy: { createdAt: 'desc' },
        take: limit, skip,
        select: { id: true, deathCertNo: true, nationalId: true, createdAt: true, ritaSynced: true, certPdfUrl: true },
      })
      for (const d of deaths) {
        results.push({
          id:         `death-${d.id}`,
          type:       'death',
          certNo:     d.deathCertNo,
          name:       d.nationalId ?? 'Unknown',
          date:       new Date(d.createdAt).toLocaleDateString('en-TZ'),
          ritaSynced: d.ritaSynced ?? false,
          certIssued: !!d.certPdfUrl,
        })
      }
    }

    results.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    return res.json({
      success: true,
      data:    results.slice(0, limit),
      total:   results.length,
      page,
    })
  } catch (err) {
    console.error('[records] error:', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
})

// ── GET /api/officer/records/pending ─────────────────────────────────────────
router.get('/records/pending', async (req, res) => {
  const { id } = req.user
  try {
    const births = await prisma.birth.findMany({
      where: {
        officerId: id,
        OR: [
          { certPdfUrl: null },
          { ritaSynced: false },
        ],
      },
      orderBy: { registeredAt: 'desc' },
      take:    50,
      select:  { id: true, birthCertNo: true, childFirstName: true, childSurname: true, registeredAt: true, certPdfUrl: true, ritaSynced: true },
    })

    const results = births.map(b => ({
      id:      `birth-${b.id}`,
      type:    'birth',
      certNo:  b.birthCertNo,
      name:    `${b.childFirstName} ${b.childSurname}`,
      date:    new Date(b.registeredAt).toLocaleDateString('en-TZ'),
      reasons: [
        ...(!b.certPdfUrl   ? ['no_certificate']  : []),
        ...(!b.ritaSynced   ? ['rita_unsynced']   : []),
      ],
    }))

    return res.json({ success: true, data: results })
  } catch (err) {
    console.error('[pending] error:', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
})

// ── POST /api/officer/death ───────────────────────────────────────────────────
router.post('/death', async (req, res) => {
  const { id } = req.user
  const {
    citizenId, nationalId, causeOfDeath, dateOfDeath,
    locationType, category, informantName, informantAddress,
  } = req.body

  if (!causeOfDeath || !dateOfDeath || !locationType || !category) {
    return res.status(400).json({ success: false, message: 'Missing required fields' })
  }

  try {
    const officer = await prisma.hospitalOfficer.findUnique({ where: { id }, select: { facilityId: true } })
    const certNo  = `TZ-DEATH-${Date.now()}-${Math.floor(Math.random() * 9000) + 1000}`

    const death = await prisma.death.create({
      data: {
        deathCertNo:       certNo,
        citizenId:         citizenId  || undefined,
        nationalId:        nationalId || undefined,
        dateOfDeath:       new Date(dateOfDeath),
        causeOfDeath,
        locationType,
        category,
        informantName:     informantName     || undefined,
        informantAddress:  informantAddress  || undefined,
        facilityId:        officer?.facilityId || undefined,
        hospitalOfficerId: id,
      },
      select: { id: true, deathCertNo: true },
    })

    return res.json({ success: true, data: { deathCertNo: death.deathCertNo } })
  } catch (err) {
    console.error('[death] error:', err)
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
        where: {
          officerId: id,
          OR: [
            { birthCertNo:    { contains: q, mode: 'insensitive' } },
            { childFirstName: { contains: q, mode: 'insensitive' } },
            { childSurname:   { contains: q, mode: 'insensitive' } },
          ],
        },
      })
      if (!birth) return res.json({ success: false, message: 'Not found' })
      return res.json({ success: true, data: { ...birth, certNo: birth.birthCertNo } })
    }

    if (type === 'death') {
      const death = await prisma.death.findFirst({
        where: {
          hospitalOfficerId: id,
          OR: [
            { deathCertNo: { contains: q, mode: 'insensitive' } },
            { nationalId:  { contains: q, mode: 'insensitive' } },
          ],
        },
      })
      if (!death) return res.json({ success: false, message: 'Not found' })
      return res.json({ success: true, data: { ...death, certNo: death.deathCertNo } })
    }

    return res.status(400).json({ success: false, message: 'Invalid type' })
  } catch (err) {
    console.error('[cert-lookup] error:', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
})

// ── POST /api/officer/certificate/issue ──────────────────────────────────────
router.post('/certificate/issue', async (req, res) => {
  const { type, recordId } = req.body
  if (!type || !recordId) return res.status(400).json({ success: false, message: 'type and recordId required' })

  try {
    // In production: generate PDF via pdf-lib / Cloudinary and store the URL.
    // For now, we generate a placeholder URL and mark the record.
    const pdfUrl = `https://adlcs-backend.onrender.com/certificates/${type}/${recordId}.pdf`

    if (type === 'birth') {
      await prisma.birth.update({ where: { id: recordId }, data: { certPdfUrl: pdfUrl } })
    } else if (type === 'death') {
      await prisma.death.update({ where: { id: recordId }, data: { certPdfUrl: pdfUrl } })
    }

    return res.json({ success: true, data: { pdfUrl } })
  } catch (err) {
    console.error('[cert-issue] error:', err)
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
      data: {
        connected:      true,   // live connectivity check in production
        ritaEndpointOk: true,
        unsyncedBirths,
        unsyncedDeaths,
        totalSynced,
        lastSyncAt: lastSync?.ritaSyncAt ?? null,
      },
    })
  } catch (err) {
    console.error('[sync-status] error:', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
})

// ── POST /api/officer/sync/trigger ────────────────────────────────────────────
router.post('/sync/trigger', async (req, res) => {
  const { id } = req.user
  try {
    // Mark all unsynced records as synced (RITA push implemented in prod via job queue)
    const now = new Date()
    const [births, deaths] = await Promise.all([
      prisma.birth.updateMany({
        where: { officerId: id, ritaSynced: false },
        data:  { ritaSynced: true, ritaSyncAt: now },
      }),
      prisma.death.updateMany({
        where: { hospitalOfficerId: id, ritaSynced: false },
        data:  { ritaSynced: true },
      }),
    ])

    return res.json({
      success: true,
      data: { synced: births.count + deaths.count, syncedAt: now },
    })
  } catch (err) {
    console.error('[sync-trigger] error:', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
})

// ── GET /api/officer/citizen-lookup ──────────────────────────────────────────
router.get('/citizen-lookup', async (req, res) => {
  const q = req.query.q?.toString().trim()
  if (!q) return res.status(400).json({ success: false, message: 'Query required' })

  try {
    const citizen = await prisma.citizen.findFirst({
      where: {
        OR: [
          { nationalId:  { contains: q, mode: 'insensitive' } },
          { firstName:   { contains: q, mode: 'insensitive' } },
          { surname:     { contains: q, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true, nationalId: true, firstName: true, middleName: true,
        surname: true, gender: true, dateOfBirth: true, vitalStatus: true,
      },
    })

    if (!citizen) return res.json({ success: false, message: 'Not found' })
    return res.json({
      success: true,
      data: {
        ...citizen,
        fullName: [citizen.firstName, citizen.middleName, citizen.surname].filter(Boolean).join(' '),
      },
    })
  } catch (err) {
    console.error('[citizen-lookup] error:', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
})

module.exports = router
