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
const { findPersonByBid, calcAge, buildGeo, VILLAGE_GEO_SELECT } = require('../lib/personLookup')
const { classifyIdentifier } = require('../lib/parentIdentifier')
const nida = require('../lib/nidaClient')
const { lookupIdentity, resolveDeceasedRef, resolveDeceasedDisplay, getScope, citizenScopeWhere, birthScopeWhere } = require('../lib/identityLookup')

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
// PATCH-VILLAGE-SCOPE-2026: residents of the officer's area = registered citizens
// + newborns that so far only have a hospital birth record.
async function countVillageResidents(vid) {
  const scope = await getScope(vid)
  if (!scope) return 0
  const [c, b] = await Promise.all([
    prisma.citizen.count({ where: citizenScopeWhere(scope) }),
    prisma.birth.count({ where: { childCitizenId: null, ...birthScopeWhere(scope) } }),
  ])
  return c + b
}

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

      const [totalCitizens, monthBirths, monthDeaths, monthMigrations, pendingCases, incomingMigrationsPending] = await Promise.all([
        countVillageResidents(vid).catch(() => 0),
        prisma.birth.count({
          where: { registeredAt: { gte: monthStart }, child: { currentVillageId: vid } },
        }),
        prisma.death.count({ where: { registeredAt: { gte: monthStart }, villageOfficerId: id } }),
        prisma.migration?.count?.({
          where: { OR: [{ sourceOfficerId: id }, { targetOfficerId: id }] },
        }).catch(() => 0) ?? Promise.resolve(0),
        prisma.citizen.count({ where: { currentVillageId: vid, vitalStatus: 'alive', idCardIssued: null } })
          .catch(() => 0),
        // PATCH-MIGRATION-2026: incoming migration requests awaiting this
        // officer's approval — drives the bell-icon badge on the home screen.
        prisma.migration.count({ where: { targetOfficerId: id, status: 'pending' } }).catch(() => 0),
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
          incomingMigrationsPending,
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
  // PATCH-D-2026-11: "Recent Activity" = the officer's LAST 5 records (any day), the same
  // kinds of records the View Records screen lists. Everything older lives in View Records.
  //   hospital officer -> births + deaths      village officer -> deaths + migrations
  const { id, role } = req.user
  const limit = 5
  const whenLabel = (v) => {
    const d = new Date(v ?? new Date())
    return d.toDateString() === new Date().toDateString()
      ? d.toLocaleTimeString('en-TZ', { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString('en-TZ')
  }
  try {
    const items = []
    if (role === 'hospital_officer') {
      const [births, deaths] = await Promise.all([
        prisma.birth.findMany({
          where: { officerId: id },
          orderBy: { registeredAt: 'desc' }, take: limit,
          select: { id: true, birthId: true, childFirstName: true, childSurname: true, registeredAt: true },
        }),
        prisma.death.findMany({
          where: { hospitalOfficerId: id },
          orderBy: { registeredAt: 'desc' }, take: limit,
          select: { id: true, deathCertNo: true, citizenId: true, nationalId: true, registeredAt: true },
        }).catch(() => []),
      ])
      for (const b of births) {
        items.push({
          id: `birth-${b.id}`, icon: '👤', label: 'New citizen registered',
          name: [`${b.childFirstName} ${b.childSurname}`.trim(), b.birthId].filter(Boolean).join(' · '),
          time: whenLabel(b.registeredAt), registeredAt: b.registeredAt, color: '#1eb53a',
        })
      }
      const info = await resolveDeceasedDisplay(deaths).catch(() => new Map())
      for (const d of deaths) {
        items.push({
          id: `death-${d.id}`, icon: '✝', label: 'Death recorded',
          name: [info.get(d.id)?.name || d.nationalId || 'Unknown', info.get(d.id)?.birthId].filter(Boolean).join(' · '),
          time: whenLabel(d.registeredAt), registeredAt: d.registeredAt, color: '#dc2626',
        })
      }
    }
    if (role === 'village_officer') {
      const [deaths, migrations] = await Promise.all([
        prisma.death.findMany({
          where: { villageOfficerId: id },
          orderBy: { registeredAt: 'desc' }, take: limit,
          select: { id: true, deathCertNo: true, citizenId: true, nationalId: true, registeredAt: true },
        }).catch(() => []),
        prisma.migration.findMany({
          where: { OR: [{ sourceOfficerId: id }, { targetOfficerId: id }] },
          orderBy: { requestDate: 'desc' }, take: limit,
          select: {
            id: true, requestDate: true, sourceOfficerId: true,
            citizen: { select: { firstName: true, middleName: true, surname: true } },
            toVillage: { select: { name: true } },
          },
        }).catch(() => []),
      ])
      const info = await resolveDeceasedDisplay(deaths).catch(() => new Map())
      for (const d of deaths) {
        items.push({
          id: `death-${d.id}`, icon: '✝', label: 'Death recorded',
          name: [info.get(d.id)?.name || d.nationalId || 'Unknown', info.get(d.id)?.birthId].filter(Boolean).join(' · '),
          time: whenLabel(d.registeredAt), registeredAt: d.registeredAt, color: '#dc2626',
        })
      }
      for (const m of migrations) {
        const nm = [m.citizen?.firstName, m.citizen?.middleName, m.citizen?.surname].filter(Boolean).join(' ')
        items.push({
          id: `migration-${m.id}`, icon: '🔁',
          label: m.sourceOfficerId === id ? 'Migration requested' : 'Migration received',
          name: `${nm || 'Unknown'} → ${m.toVillage?.name ?? '—'}`,
          time: whenLabel(m.requestDate), registeredAt: m.requestDate, color: '#7c3aed',
        })
      }
    }
    items.sort((a, b) => new Date(b.registeredAt).getTime() - new Date(a.registeredAt).getTime())
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
  const unissuedWhere = req.query.unissued === '1' ? { certPdfUrl: null } : {} // PATCH-PENDING-2026

  // Village officers use the dedicated village/records endpoint
  if (role === 'village_officer') {
    try {
      const out = []
      const deaths = await prisma.death.findMany({
        where: { villageOfficerId: id },
        orderBy: { registeredAt: 'desc' }, take: limit, skip,
        select: { id: true, deathCertNo: true, citizenId: true, nationalId: true, causeOfDeath: true, registeredAt: true, ritaSynced: true },
      })
      const deathInfoV = await resolveDeceasedDisplay(deaths)
      for (const d of deaths) {
        out.push({ id: `death-${d.id}`, type: 'death', certNo: d.deathCertNo,
          birthId: deathInfoV.get(d.id)?.birthId ?? null,
          name: deathInfoV.get(d.id)?.name || d.nationalId || 'Unknown',
          date: new Date(d.registeredAt ?? new Date()).toLocaleDateString('en-TZ'),
          ritaSynced: d.ritaSynced ?? false, certIssued: false })
      }
      const citizens = await prisma.citizen.findMany({
        where: { registeredById: id },
        orderBy: { registeredAt: 'desc' }, take: limit, skip,
        select: { id: true, birthId: true, firstName: true, surname: true, nationalId: true, registeredAt: true },
      })
      for (const c of citizens) {
        out.push({ id: `citizen-${c.id}`, type: 'birth', certNo: c.nationalId ?? '—',
          birthId: c.birthId ?? null,
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
          ...unissuedWhere,
          ...(q ? { OR: [
            { birthCertNo:    { contains: q, mode: 'insensitive' } },
            { childFirstName: { contains: q, mode: 'insensitive' } },
            { childSurname:   { contains: q, mode: 'insensitive' } },
          ]} : {}),
        },
        orderBy: { registeredAt: 'desc' }, take: type === 'all' ? skip + limit : limit, skip: type === 'all' ? 0 : skip,
        select: { id: true, birthId: true, birthCertNo: true, childFirstName: true, childSurname: true, registeredAt: true, ritaSynced: true, certPdfUrl: true },
      })
      for (const b of births) {
        results.push({ id: `birth-${b.id}`, type: 'birth', certNo: b.birthCertNo,
          birthId: b.birthId ?? null,
          name: `${b.childFirstName} ${b.childSurname}`,
          date: new Date(b.registeredAt).toLocaleDateString('en-TZ'),
          ritaSynced: b.ritaSynced, certIssued: !!b.certPdfUrl, registeredAt: b.registeredAt })
      }
    }
    if (type === 'all' || type === 'death') {
      const deaths = await prisma.death.findMany({
        where: {
          hospitalOfficerId: id,
          ...unissuedWhere,
          ...(q ? { OR: [
            { deathCertNo: { contains: q, mode: 'insensitive' } },
            { nationalId:  { contains: q, mode: 'insensitive' } },
          ]} : {}),
        },
        orderBy: { registeredAt: 'desc' }, take: limit, skip,
        select: { id: true, deathCertNo: true, citizenId: true, nationalId: true, registeredAt: true, ritaSynced: true, certPdfUrl: true },
      })
      const deathInfoH = await resolveDeceasedDisplay(deaths)
      for (const d of deaths) {
        results.push({ id: `death-${d.id}`, type: 'death', certNo: d.deathCertNo,
          birthId: deathInfoH.get(d.id)?.birthId ?? null,
          name: deathInfoH.get(d.id)?.name || d.nationalId || 'Unknown',
          date: new Date(d.registeredAt ?? new Date()).toLocaleDateString('en-TZ'),
          ritaSynced: d.ritaSynced ?? false, certIssued: !!d.certPdfUrl, registeredAt: d.registeredAt })
      }
    }
    results.sort((a, b) => new Date(b.registeredAt || 0) - new Date(a.registeredAt || 0))
    const pageRows = type === 'all' ? results.slice(skip, skip + limit) : results.slice(0, limit)
    // Real totals per kind, so the Certificates tabs never show a count that
    // depends on which tab is currently loaded.
    const [birthCount, deathCount] = await Promise.all([
      prisma.birth.count({ where: { officerId: id, ...unissuedWhere } }),
      prisma.death.count({ where: { hospitalOfficerId: id, ...unissuedWhere } }),
    ])
    return res.json({
      success: true, data: pageRows, total: results.length, page,
      counts: { all: birthCount + deathCount, birth: birthCount, death: deathCount },
    })
  } catch (err) {
    console.error('[records]', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
})

// ── GET /api/officer/records/pending ─────────────────────────────────────────
router.get('/records/pending', async (req, res) => {
  const { id } = req.user
  try {
    // PATCH-PENDING-2026: a case is pending only until its certificate has been issued.
    const [births, deaths] = await Promise.all([
      prisma.birth.findMany({
        where: { officerId: id, certPdfUrl: null },
        orderBy: { registeredAt: 'desc' }, take: 50,
        select: { id: true, birthCertNo: true, childFirstName: true, childSurname: true, registeredAt: true, ritaSynced: true },
      }),
      prisma.death.findMany({
        where: { hospitalOfficerId: id, certPdfUrl: null },
        orderBy: { registeredAt: 'desc' }, take: 50,
        select: { id: true, deathCertNo: true, citizenId: true, nationalId: true, registeredAt: true, ritaSynced: true },
      }),
    ])
    const deathInfo = await resolveDeceasedDisplay(deaths).catch(() => new Map())
    const rows = [
      ...births.map((b) => ({
        id: `birth-${b.id}`, type: 'birth', certNo: b.birthCertNo,
        name: `${b.childFirstName} ${b.childSurname}`,
        date: new Date(b.registeredAt).toLocaleDateString('en-TZ'),
        registeredAt: b.registeredAt,
        reasons: ['no_certificate', ...(!b.ritaSynced ? ['rita_unsynced'] : [])],
      })),
      ...deaths.map((d) => ({
        id: `death-${d.id}`, type: 'death', certNo: d.deathCertNo,
        name: deathInfo.get(d.id)?.name || d.nationalId || 'Unknown',
        date: new Date(d.registeredAt).toLocaleDateString('en-TZ'),
        registeredAt: d.registeredAt,
        reasons: ['no_certificate', ...(!d.ritaSynced ? ['rita_unsynced'] : [])],
      })),
    ].sort((a, b) => new Date(b.registeredAt).getTime() - new Date(a.registeredAt).getTime())
    return res.json({ success: true, data: rows })
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
    // PATCH-STRICT-ID-2026: the deceased must resolve to a real person (BID / NIN).
    const deceased = await resolveDeceasedRef(nationalId, { category, citizenId })
    if (!deceased.ok) return res.status(deceased.status || 422).json({ success: false, message: deceased.message })
    const officer = await prisma.hospitalOfficer.findUnique({ where: { id }, select: { facilityId: true } })
    const certNo  = `TZ-DEATH-${Date.now()}-${Math.floor(Math.random() * 9000) + 1000}`
    const death   = await prisma.death.create({
      data: {
        deathCertNo:       certNo,
        citizenId:         deceased.citizenId,
        nationalId:        deceased.nationalId,
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
    // PATCH-C-2026-11: the citizen is now deceased
    if (deceased.citizenId) {
      await prisma.citizen.update({ where: { id: deceased.citizenId }, data: { vitalStatus: 'deceased' } })
        .catch((e) => console.warn('[death] vitalStatus', e && e.message))
    }
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

// ── GET /api/officer/certificate/data ────────────────────────────────────────
// PATCH-V3-2026-11: everything needed to build a birth / death certificate PDF on
// the phone (same shape the registration screens use), for ANY record the
// officer is allowed to see - so every "download certificate" button can use the
// one shared download function.
//   ?type=birth&id=<birth id>            (hospital officer: own registrations)
//   ?type=birth&birthId=BID-XXXXXXXXXX   (hospital officer, or village officer for
//                                         children of his own village)
//   ?type=death&id=<death id>            (hospital or village officer: own records)
function fmtDDMMYYYY(v) {
  if (!v) return ''
  const x = new Date(v)
  if (Number.isNaN(x.getTime())) return ''
  const p = (n) => String(n).padStart(2, '0')
  return `${p(x.getUTCDate())}/${p(x.getUTCMonth() + 1)}/${x.getUTCFullYear()}`
}
router.get('/certificate/data', async (req, res) => {
  const { id: officerId, role } = req.user
  const type = String(req.query.type || '')
  const recordId = String(req.query.id || '').trim().replace(/^(birth|death|b|d)-/, '')
  const bid = String(req.query.birthId || '').trim().toUpperCase()
  if (!recordId && !bid) return res.status(400).json({ success: false, message: 'Record id or Birth ID required' })
  try {
    if (type === 'birth') {
      let where
      if (role === 'village_officer') {
        const vo = await prisma.villageOfficer.findUnique({ where: { id: officerId }, select: { villageId: true } })
        if (!vo?.villageId) return res.status(403).json({ success: false, message: 'Your officer account is not assigned to a village yet.' })
        where = {
          ...(bid ? { birthId: bid } : { id: recordId }),
          OR: [{ originVillageId: vo.villageId }, { child: { currentVillageId: vo.villageId } }],
        }
      } else {
        // PATCH-C-2026-11: a hospital officer who looked a citizen up by Birth ID may issue
        // that citizen's birth certificate; by record id only his own registrations.
        where = bid ? { birthId: bid } : { id: recordId, officerId }
      }
      const b = await prisma.birth.findFirst({
        where,
        include: {
          officer: { select: { fullName: true } },
          facility: { select: { facilityName: true } },
          child: { select: { nationalId: true } },
        },
      })
      if (!b) return res.status(404).json({ success: false, message: 'No birth record on file for this person.' })
      const loc = await resolveFacilityLocation(b.facilityId)
      return res.json({
        success: true,
        data: {
          id: b.id,
          certNo: b.birthCertNo,
          birthId: b.birthId || '',
          childFirstName: b.childFirstName,
          childMiddleName: b.childMiddleName || '',
          childSurname: b.childSurname,
          gender: b.gender,
          dateOfBirth: fmtDDMMYYYY(b.dateOfBirth),
          fatherName: b.fatherName || '',
          fatherNid: b.fatherIdentifier || '',
          motherName: b.motherName || '',
          motherNid: b.motherIdentifier || '',
          facilityName: b.facility?.facilityName || '',
          facilityDistrict: loc.district,
          facilityRegion: loc.region,
          officerName: b.officer?.fullName || '',
          registeredAt: new Date(b.registeredAt).toISOString(),
          synced: b.ritaSynced ? 1 : 0,
          certPdfPath: '',
          rawJson: '',
          nationalId: b.child?.nationalId || '',
        },
      })
    }
    if (type === 'death') {
      if (!recordId && !bid) return res.status(400).json({ success: false, message: 'Record id required' })
      // PATCH-C-2026-11: hospital officers can issue a death certificate for any recorded death
      // they looked up; village officers still only their own records.
      const dthWhere = role === 'hospital_officer'
        ? (recordId ? { id: recordId } : { nationalId: bid })
        : { id: recordId, OR: [{ hospitalOfficerId: officerId }, { villageOfficerId: officerId }] }
      const dth = await prisma.death.findFirst({
        where: dthWhere,
        include: {
          facility: { select: { facilityName: true } },
          hospitalOfficer: { select: { fullName: true } },
          villageOfficer: { select: { fullName: true, village: { select: { name: true } } } },
        },
      })
      if (!dth) return res.status(404).json({ success: false, message: 'Death record not found.' })
      const info = (await resolveDeceasedDisplay([dth])).get(dth.id)
      return res.json({
        success: true,
        data: {
          id: dth.id,
          certNo: dth.deathCertNo,
          nationalId: dth.nationalId || '',
          deceasedName: info?.name || dth.nationalId || '',
          gender: info?.gender || '',
          causeOfDeath: dth.causeOfDeath || '',
          dateOfDeath: fmtDDMMYYYY(dth.dateOfDeath),
          locationType: dth.locationType || '',
          category: dth.category || '',
          informantName: dth.informantName || '',
          facilityName: dth.facility?.facilityName || dth.villageOfficer?.village?.name || '',
          officerName: dth.hospitalOfficer?.fullName || dth.villageOfficer?.fullName || '',
          registeredAt: new Date(dth.registeredAt).toISOString(),
          synced: dth.ritaSynced ? 1 : 0,
          certPdfPath: '',
          rawJson: '',
        },
      })
    }
    return res.status(400).json({ success: false, message: 'Invalid type' })
  } catch (err) {
    console.error('[certificate/data]', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
})

// ── POST /api/officer/certificate/issue ──────────────────────────────────────
router.post('/certificate/issue', async (req, res) => {
  // PATCH-PENDING-2026: marks a certificate as issued. The app sends the server id OR the
  // certificate number (registration screens only know the number). Owner records only.
  const { id: officerId } = req.user
  const { type, recordId, certNo } = req.body
  const rid = String(recordId || '').trim().replace(/^(birth|death|b|d)-/, '')
  const cno = String(certNo || '').trim()
  if (!type || (!rid && !cno)) return res.status(400).json({ success: false, message: 'type and recordId (or certNo) required' })
  try {
    // BUGFIX-2: build the certificate URL from .env instead of a hardcoded domain.
    const publicBase = (process.env.PUBLIC_BACKEND_URL || '').replace(/\/$/, '')
    let rec = null
    if (type === 'birth') {
      rec = await prisma.birth.findFirst({
        where: { ...(rid ? { id: rid } : { birthCertNo: cno }), officerId },
        select: { id: true },
      })
    } else if (type === 'death') {
      rec = await prisma.death.findFirst({
        where: { ...(rid ? { id: rid } : { deathCertNo: cno }), OR: [{ hospitalOfficerId: officerId }, { villageOfficerId: officerId }] },
        select: { id: true },
      })
    } else {
      return res.status(400).json({ success: false, message: 'Invalid type' })
    }
    if (!rec) return res.status(404).json({ success: false, message: 'Record not found' })
    const pdfUrl = `${publicBase}/certificates/${type}/${rec.id}.pdf`
    if (type === 'birth') await prisma.birth.update({ where: { id: rec.id }, data: { certPdfUrl: pdfUrl } })
    else await prisma.death.update({ where: { id: rec.id }, data: { certPdfUrl: pdfUrl } })
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
// PATCH-BID-LOOKUP-2026: Birth ID (BID) is the primary key for finding an
// already-registered citizen (parent, spouse, deceased) — a citizen only
// ever has a NIN because they already had a BID, so BID alone is enough;
// no need to also ask for/know their NIN. Exact NIN match is kept as a
// legacy fallback, then partial name/BID/NIN search.
// PATCH-BID-GEO-2026: always resolves + returns the citizen's full
// geographic hierarchy (village/ward/district/region) and live age via the
// shared personLookup helpers, so any BID-driven screen (e.g. the Register
// Birth father/mother card) has the real data to show instead of
// placeholder text.
const OFFICER_CITIZEN_LOOKUP_SELECT = {
  id: true, birthId: true, nationalId: true, firstName: true, middleName: true,
  surname: true, gender: true, dateOfBirth: true, vitalStatus: true, age: true,
  currentVillage: { select: VILLAGE_GEO_SELECT },
}
router.get('/citizen-lookup', async (req, res) => {
  // PATCH-STRICT-ID-2026: a person can ONLY be fetched by Birth ID (main way)
  // or NIN. No name / partial search — nobody can be "found" by typing a name
  // and used to register a false birth, death or migration. A NIN that is not
  // in the local registry is resolved through the NIDA adapter
  // (lib/nidaClient.js, configured with NIDA_API_URL in backend/.env).
  const q = String(req.query.birthId || req.query.nin || req.query.q || '').trim()
  if (!q) return res.status(400).json({ success: false, message: 'Birth ID or NIN required' })
  try {
    const r = await lookupIdentity(q)
    if (r.found) {
      // PATCH-C-2026-11: enrich the card (marital status, education, registration, records on file)
      const p = r.person
      const extra = {}
      try {
        if (p.source === 'birth') { extra.maritalStatus = 'single'; extra.educationLevel = 'none' }
        if (p.source === 'citizen' && p.id) {
          const c = await prisma.citizen.findUnique({
            where: { id: p.id },
            select: { maritalStatus: true, educationLevel: true, registeredAt: true },
          })
          if (c) Object.assign(extra, c)
        }
        if (p.birthId) {
          const b = await prisma.birth.findFirst({ where: { birthId: p.birthId }, select: { registeredAt: true } })
          extra.hasBirthRecord = !!b
          if (b && !extra.registeredAt) extra.registeredAt = b.registeredAt
        }
      } catch (e) {
        console.warn('[citizen-lookup] enrich', e && e.message)
      }
      return res.json({ success: true, data: { ...p, ...extra } })
    }
    return res.json({
      success: false,
      idType: r.idType ?? null,
      code: r.code,
      message: r.message,
      nidaAvailable: r.nidaAvailable,
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
