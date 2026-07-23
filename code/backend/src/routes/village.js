/**
 * village.js — Village Officer API Routes  v2.0
 *
 * GET   /api/village/dashboard
 * POST  /api/village/citizen
 * POST  /api/village/birth        (fallback — primary is hospital officer)
 * POST  /api/village/death
 * POST  /api/village/marriage
 * POST  /api/village/migration           (create a migration REQUEST)
 * GET   /api/village/migration/incoming  (requests awaiting this officer's approval)
 * GET   /api/village/migration/outgoing  (requests this officer sent)
 * PATCH /api/village/migration/:id/respond  (approve | reject)
 * GET   /api/village/records      (aggregated records for VillageViewRecordsScreen)
 * GET   /api/officer/profile      (used by ID card modal — both roles)
 *
 * PATCH-CLEANUP-2026: /api/village/building and /api/village/infrastructure
 * were removed — no mobile or web screen has called them since the
 * Building/Infrastructure cards were pulled from the Village Officer app,
 * and the matching Prisma models have been removed from schema.prisma.
 */

const { Router } = require('express')
const { prisma }  = require('../lib/prisma')
const { requireAuth } = require('../middleware/auth')
const { uploadBase64 } = require('../utils/cloudinaryUpload')

const router = Router()
router.use(requireAuth)

// ── helpers ───────────────────────────────────────────────────────────────────
function startOfMonth() {
  const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d
}
function parseDDMMYYYY(s) {
  if (!s) return new Date()
  const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/)
  if (m) return new Date(`${m[3]}-${m[2]}-${m[1]}`)
  return new Date(s)
}

// ── GET /api/village/dashboard ────────────────────────────────────────────────
router.get('/dashboard', async (req, res) => {
  const { id } = req.user
  try {
    const officer = await prisma.villageOfficer.findUnique({
      where:   { id },
      include: { village:true, ward:true },
    })
    if (!officer) return res.status(404).json({ success:false, message:'Officer not found' })

    const vid        = officer.villageId ?? -1
    const monthStart = startOfMonth()

    const dayStart   = new Date(); dayStart.setHours(0,0,0,0)
    const dayEnd     = new Date(); dayEnd.setHours(23,59,59,999)

    // PATCH-MIGFLOW-2026: incomingMigrationsPending powers the bell badge
    // on VillageHomeScreen — migration requests awaiting this officer.
    const [totalCitizens, monthDeaths, todayDeaths, todayCitizens, pendingCases, incomingMigrationsPending] = await Promise.all([
      prisma.citizen.count({ where:{ currentVillageId:vid } }),
      prisma.death.count({ where:{ villageOfficerId:id, registeredAt:{ gte:monthStart } } }).catch(()=>0),
      prisma.death.count({ where:{ villageOfficerId:id, registeredAt:{ gte:dayStart, lte:dayEnd } } }).catch(()=>0),
      prisma.citizen.count({ where:{ registeredById:id, registeredAt:{ gte:dayStart, lte:dayEnd } } }).catch(()=>0),
      prisma.citizen.count({ where:{ currentVillageId:vid, vitalStatus:'alive', idCardIssued:null } }).catch(()=>0),
      prisma.migration.count({ where:{ targetOfficerId:id, status:'pending' } }).catch(()=>0),
    ])

    return res.json({
      success:true,
      data:{
        officerName:    officer.fullName,
        employeeId:     officer.employeeId ?? '',
        villageName:    officer.village?.name ?? 'Unknown Village',
        wardName:       officer.ward?.name    ?? 'Unknown Ward',
        totalCitizens,
        todayBirths:    todayCitizens,
        todayDeaths,
        monthBirths:    0,
        monthDeaths,
        pendingCases,
        incomingMigrationsPending,
      },
    })
  } catch (err) {
    console.error('[village/dashboard]', err)
    return res.status(500).json({ success:false, message:'Internal server error' })
  }
})

// ── national-id generator (23-char NIDA format YYYYMMDD-LLLLL-SSSSS-CC) ────────
function genNationalId(dob) {
  const d = dob ? parseDDMMYYYY(dob) : new Date()
  const y  = d.getFullYear()
  const mo = String(d.getMonth()+1).padStart(2,'0')
  const dy = String(d.getDate()).padStart(2,'0')
  const seq = String(Math.floor(Math.random()*89999)+10001).padStart(5,'0')
  const cc  = String(Math.floor(Math.random()*89)+10)
  return `${y}${mo}${dy}-07031-${seq}-${cc}`
}

// ── POST /api/village/citizen ─────────────────────────────────────────────────
router.post('/citizen', async (req, res) => {
  const { id:officerId } = req.user
  const { firstName, middleName, surname, gender, dateOfBirth, bloodGroup,
          phone, occupation, nationalId } = req.body
  if (!firstName || !surname || !gender)
    return res.status(400).json({ success:false, message:'firstName, surname, gender required' })
  try {
    const officer = await prisma.villageOfficer.findUnique({ where:{ id:officerId }, select:{ villageId:true } })
    const citizen = await prisma.citizen.create({
      data:{
        firstName:   firstName.trim(),
        middleName:  middleName?.trim() ?? '',
        surname:     surname.trim(),
        gender:      gender.toLowerCase(),
        dateOfBirth: dateOfBirth ? parseDDMMYYYY(dateOfBirth) : null,
        nationalId:  nationalId ?? genNationalId(dateOfBirth),
        currentVillageId: officer?.villageId ?? undefined,
        registeredById:   officerId,
        vitalStatus:      'alive',
      },
      select:{ id:true, nationalId:true },
    })
    return res.json({ success:true, data:{ citizenId:citizen.id, nationalId:citizen.nationalId } })
  } catch (err) {
    if (err.code === 'P2002') return res.json({ success:true, duplicate:true })
    console.error('[village/citizen]', err)
    return res.status(500).json({ success:false, message:'Internal server error' })
  }
})

// ── POST /api/village/death ───────────────────────────────────────────────────
router.post('/death', async (req, res) => {
  const { id:officerId } = req.user
  const { deceasedName, nationalId, causeOfDeath, dateOfDeath,
          locationType, category, informantName, deathCertNo } = req.body
  if (!causeOfDeath || !dateOfDeath)
    return res.status(400).json({ success:false, message:'causeOfDeath and dateOfDeath required' })
  try {
    const existing = deathCertNo
      ? await prisma.death.findFirst({ where:{ deathCertNo }, select:{ id:true } })
      : null
    if (existing) return res.json({ success:true, duplicate:true, serverId:existing.id })

    // Map mobile enum values to schema enums
    // DeathLocationType: hospital | outside
    // DeathCategory:     infant   | adult
    const locMap = { health_facility:'hospital', hospital:'hospital', home:'outside', public_place:'outside', other:'outside' }
    const catMap = { infant:'infant', child:'infant', adult:'adult', maternal:'adult' }

    const death = await prisma.death.create({
      data:{
        deathCertNo:      deathCertNo ?? `VD-${Date.now()}`,
        nationalId:       nationalId  ?? undefined,
        causeOfDeath,
        dateOfDeath:      parseDDMMYYYY(dateOfDeath),
        locationType:     locMap[locationType]  ?? 'outside',
        category:         catMap[category]      ?? 'adult',
        informantName:    informantName ?? undefined,
        villageOfficerId: officerId,   // village officer FK only — no hospitalOfficerId
      },
      select:{ id:true, deathCertNo:true },
    })
    return res.json({ success:true, data:{ serverId:death.id, deathCertNo:death.deathCertNo } })
  } catch (err) {
    if (err.code === 'P2002') return res.json({ success:true, duplicate:true })
    console.error('[village/death]', err)
    return res.status(500).json({ success:false, message:'Internal server error' })
  }
})

// ── POST /api/village/marriage ────────────────────────────────────────────────
router.post('/marriage', async (req, res) => {
  const { id:officerId } = req.user
  const { husbandNid, husbandName, wifeNid, wifeName, marriageDate,
          marriageType, witness1, witness2, bridePrice, certNo } = req.body
  if (!husbandName && !husbandNid)
    return res.status(400).json({ success:false, message:'Husband details required' })
  try {
    // Check for duplicate cert
    if (certNo) {
      const existing = await prisma.marriage?.findFirst?.({ where:{ certNo }, select:{ id:true } }).catch(()=>null)
      if (existing) return res.json({ success:true, duplicate:true })
    }

    // Look up both citizens by NID — both must be registered
    const husband = husbandNid ? await prisma.citizen.findFirst({ where:{ nationalId:husbandNid }, select:{ id:true, dateOfBirth:true } }) : null
    const wife    = wifeNid    ? await prisma.citizen.findFirst({ where:{ nationalId:wifeNid    }, select:{ id:true, dateOfBirth:true } }) : null

    if (!husband || !wife) {
      return res.status(422).json({ success:false, message:'Both spouses must be registered citizens. Please use Register Citizen for each spouse first.' })
    }

    function ageFrom(dob) {
      if (!dob) return 18
      return Math.max(Math.floor((Date.now() - new Date(dob)) / 31557600000), 18)
    }

    const relMap = { islamic:'islamic', christian:'christian', customary:'customary', civil:'civil' }
    const marriageCertNo = certNo ?? `TZ-MAR-${Date.now()}`

    const record = await prisma.marriage.create({
      data:{
        marriageCertNo,
        husbandId:        husband.id,
        wifeId:           wife.id,
        husbandNid:       husbandNid,
        wifeNid:          wifeNid,
        husbandAge:       ageFrom(husband.dateOfBirth),
        wifeAge:          ageFrom(wife.dateOfBirth),
        husbandStatusPrev:'single',
        wifeStatusPrev:   'single',
        marriageDate:     parseDDMMYYYY(marriageDate),
        marriagePlace:    marriagePlace ?? 'Tanzania',
        religion:         relMap[marriageType] ?? 'customary',
        kindOfMarriage:   'monogamous',
        registeredById:   officerId,
      },
      select:{ id:true },
    })

    return res.json({ success:true, data:{ certNo:marriageCertNo, serverId:record.id } })
  } catch (err) {
    console.error('[village/marriage]', err)
    return res.status(500).json({ success:false, message:'Internal server error' })
  }
})

// ── migration token + lazy-expiry helpers (PATCH-MIGFLOW-2026) ─────────────────
// Short human-readable code the source officer reads out / writes down for the
// citizen. Format: TZM-XXXXXX, ambiguous characters (0/O/1/I) excluded so it's
// easy to relay verbally or on paper.
function genMigrationToken() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)]
  return `TZM-${code}`
}

// A migration request is only valid for ONE WEEK from issuance. If that window
// has passed and it is still 'pending', it is lazily flipped to 'expired' the
// next time it's touched (list, respond, or confirm) — the citizen must ask the
// source village officer to issue a fresh one.
async function expireIfDue(migration) {
  if (migration.status === 'pending' && new Date(migration.expiryDate) < new Date()) {
    await prisma.migration.update({ where: { id: migration.id }, data: { status: 'expired' } })
    return true
  }
  return false
}

// ── Migration helpers ───────────────────────────────────────────────────────────
// Finds an officer to notify/approve a migration into `villageId`. Prefers an
// active officer; falls back to any non-suspended one so a freshly-created
// village isn't a dead end (surfaced to the requester either way).
async function resolveTargetOfficer(villageId) {
  const active = await prisma.villageOfficer.findFirst({
    where: { villageId, status: 'active' },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  })
  if (active) return active
  return prisma.villageOfficer.findFirst({
    where: { villageId, status: { not: 'suspended' } },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  })
}

// ── POST /api/village/migration — create a migration REQUEST ───────────────────
// Flow: (1) mobile already looked the citizen up via /citizen-lookup, scoped
// to the officer's own village; (2) officer picks the destination via the
// strict region→district→ward→village/street dropdown (GeoCascadePicker with
// manual entry disabled) plus an optional reason. This just creates a
// `pending` Migration row addressed to the destination village's officer —
// nothing about the citizen changes until that officer approves it (see
// PATCH /migration/:id/respond below).
router.post('/migration', async (req, res) => {
  const { id: officerId } = req.user
  const { citizenId, nationalId, toVillageId, reason } = req.body

  if (!toVillageId) {
    return res.status(400).json({ success: false, message: 'Destination village/street is required.' })
  }

  try {
    const officer = await prisma.villageOfficer.findUnique({
      where: { id: officerId },
      select: { villageId: true },
    })
    if (!officer?.villageId) {
      return res.status(422).json({ success: false, message: 'Your officer account is not assigned to a village yet.' })
    }

    // Citizen must exist AND already live in the requesting officer's own
    // village — an officer may only initiate migration for residents they
    // are actually responsible for.
    const citizen = citizenId
      ? await prisma.citizen.findFirst({ where: { id: citizenId, currentVillageId: officer.villageId }, select: { id: true, currentVillageId: true } })
      : nationalId
        ? await prisma.citizen.findFirst({ where: { nationalId: String(nationalId).trim(), currentVillageId: officer.villageId }, select: { id: true, currentVillageId: true } })
        : null

    if (!citizen) {
      return res.status(422).json({ success: false, message: 'Citizen not found in your village. Look them up first using their NIN, Birth ID, or full name.' })
    }

    const toVid = Number(toVillageId)
    if (toVid === citizen.currentVillageId) {
      return res.status(400).json({ success: false, message: 'This citizen already lives in the selected destination.' })
    }
    const destination = await prisma.village.findUnique({ where: { id: toVid }, select: { id: true } })
    if (!destination) {
      return res.status(404).json({ success: false, message: 'Destination village/street not found.' })
    }

    const existingPending = await prisma.migration.findFirst({
      where: { citizenId: citizen.id, status: 'pending' },
      select: { id: true },
    })
    if (existingPending) {
      return res.status(409).json({ success: false, message: 'This citizen already has a pending migration request.' })
    }

    const targetOfficer = await resolveTargetOfficer(toVid)

    // PATCH-MIGFLOW-2026: the confirmation window is ONE WEEK, not 30 days —
    // after this the request auto-expires and must be re-issued from scratch.
    const expiry = new Date()
    expiry.setDate(expiry.getDate() + 7)

    // The migration token is what the citizen actually carries — together with
    // their own NIN it's what the destination officer asks for to confirm the
    // move (see POST /migration/confirm below). Retry on the rare unique clash.
    let migrationToken
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = genMigrationToken()
      const clash = await prisma.migration.findUnique({ where: { migrationToken: candidate }, select: { id: true } }).catch(() => null)
      if (!clash) { migrationToken = candidate; break }
    }
    if (!migrationToken) migrationToken = `TZM-${Date.now().toString(36).toUpperCase().slice(-6)}`

    const record = await prisma.migration.create({
      data: {
        citizenId: citizen.id,
        fromVillageId: officer.villageId,
        toVillageId: toVid,
        reason: (reason ?? '').toString().trim() || 'Not specified',
        expiryDate: expiry,
        migrationToken,
        sourceOfficerId: officerId,
        targetOfficerId: targetOfficer?.id,
      },
      select: { id: true, status: true, requestDate: true, expiryDate: true, migrationToken: true },
    })

    return res.json({
      success: true,
      data: {
        referenceNo: `MIG-${record.id.slice(0, 8).toUpperCase()}`,
        migrationToken: record.migrationToken,
        expiryDate: record.expiryDate,
        serverId: record.id,
        status: record.status,
        targetOfficerAssigned: !!targetOfficer,
      },
      message: targetOfficer
        ? `Migration request sent. Give the citizen this migration token: ${record.migrationToken}. It is valid for ONE WEEK — within that time the citizen must report to the destination village officer with their NIN and this token to confirm the move. After a week it expires and must be issued again.`
        : `Migration request saved (no officer is currently assigned to the destination village yet), but the citizen already has their token: ${record.migrationToken}, valid for one week.`,
    })
  } catch (err) {
    console.error('[village/migration]', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
})

// ── GET /api/village/migration/incoming — requests awaiting THIS officer ───────
router.get('/migration/incoming', async (req, res) => {
  const { id: officerId } = req.user
  try {
    const rows = await prisma.migration.findMany({
      where: { targetOfficerId: officerId, status: 'pending' },
      orderBy: { requestDate: 'desc' },
      select: {
        id: true, status: true, reason: true, requestDate: true, expiryDate: true, migrationToken: true,
        citizen: { select: { id: true, firstName: true, middleName: true, surname: true, nationalId: true, gender: true, dateOfBirth: true } },
        fromVillage: { select: { id: true, name: true, ward: { select: { name: true, district: { select: { name: true } } } } } },
      },
    })

    // PATCH-MIGFLOW-2026: lazily flip anything past its one-week window to
    // 'expired' before showing it as an actionable inbox item.
    const stillPending = []
    for (const r of rows) {
      if (await expireIfDue(r)) continue
      stillPending.push(r)
    }

    return res.json({
      success: true,
      data: stillPending.map(r => ({
        id: r.id,
        reason: r.reason,
        requestDate: r.requestDate,
        expiryDate: r.expiryDate,
        migrationToken: r.migrationToken,
        citizenName: [r.citizen?.firstName, r.citizen?.middleName, r.citizen?.surname].filter(Boolean).join(' '),
        nationalId: r.citizen?.nationalId ?? null,
        gender: r.citizen?.gender ?? null,
        fromVillageName: r.fromVillage?.name ?? '—',
        fromWardName: r.fromVillage?.ward?.name ?? '—',
        fromDistrictName: r.fromVillage?.ward?.district?.name ?? '—',
      })),
    })
  } catch (err) {
    console.error('[village/migration/incoming]', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
})

// ── GET /api/village/migration/outgoing — requests THIS officer sent ───────────
router.get('/migration/outgoing', async (req, res) => {
  const { id: officerId } = req.user
  try {
    const rows = await prisma.migration.findMany({
      where: { sourceOfficerId: officerId },
      orderBy: { requestDate: 'desc' },
      take: 50,
      select: {
        id: true, status: true, reason: true, requestDate: true, confirmedDate: true, expiryDate: true, migrationToken: true,
        citizen: { select: { firstName: true, surname: true, nationalId: true } },
        toVillage: { select: { name: true } },
      },
    })

    // PATCH-MIGFLOW-2026: sweep any pending-but-past-due rows to 'expired' so
    // the officer's own outbox reflects reality straight away.
    for (const r of rows) {
      if (await expireIfDue(r)) r.status = 'expired'
    }

    return res.json({
      success: true,
      data: rows.map(r => ({
        id: r.id,
        status: r.status,
        reason: r.reason,
        requestDate: r.requestDate,
        confirmedDate: r.confirmedDate,
        expiryDate: r.expiryDate,
        migrationToken: r.migrationToken,
        citizenName: [r.citizen?.firstName, r.citizen?.surname].filter(Boolean).join(' '),
        nationalId: r.citizen?.nationalId ?? null,
        toVillageName: r.toVillage?.name ?? '—',
      })),
    })
  } catch (err) {
    console.error('[village/migration/outgoing]', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
})

// ── PATCH /api/village/migration/:id/respond — approve or reject ───────────────
// Approving finalises the migration: the citizen's currentVillageId moves to
// the destination village. Per the paper process, the target officer should
// only tap Approve after the citizen has physically reported to them for
// verification — the app can't enforce that in-person step, so it's spelled
// out in the confirmation copy on the mobile screen instead.
router.patch('/migration/:id/respond', async (req, res) => {
  const { id: officerId } = req.user
  const { id: migrationId } = req.params
  const { action } = req.body // 'approve' | 'reject'

  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({ success: false, message: "action must be 'approve' or 'reject'" })
  }

  try {
    const migration = await prisma.migration.findUnique({
      where: { id: migrationId },
      select: { id: true, status: true, citizenId: true, toVillageId: true, targetOfficerId: true, expiryDate: true },
    })
    if (!migration) return res.status(404).json({ success: false, message: 'Migration request not found.' })
    if (migration.targetOfficerId !== officerId) {
      return res.status(403).json({ success: false, message: 'This request is not addressed to you.' })
    }
    // PATCH-MIGFLOW-2026: one-week validity window — flip to 'expired' the
    // moment anyone tries to act on a stale pending request.
    if (await expireIfDue(migration)) {
      return res.status(410).json({ success: false, message: 'This migration request has expired (its one-week validity window has passed). The citizen must ask the source village officer to issue a new migration request.' })
    }
    if (migration.status !== 'pending') {
      return res.status(409).json({ success: false, message: `This request was already ${migration.status}.` })
    }

    if (action === 'approve') {
      await prisma.$transaction([
        prisma.migration.update({
          where: { id: migrationId },
          data: { status: 'confirmed', confirmedDate: new Date() },
        }),
        prisma.citizen.update({
          where: { id: migration.citizenId },
          data: { currentVillageId: migration.toVillageId },
        }),
      ])
      return res.json({ success: true, message: 'Migration approved. The citizen record has been updated.' })
    }

    await prisma.migration.update({ where: { id: migrationId }, data: { status: 'cancelled' } })
    return res.json({ success: true, message: 'Migration request rejected.' })
  } catch (err) {
    console.error('[village/migration/respond]', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
})

// ── POST /api/village/migration/confirm — INCOMING citizen self-service ────────
// PATCH-MIGFLOW-2026: the primary confirmation path. The citizen who has
// physically arrived at their NEW village presents their NIN and the migration
// token the source officer gave them; the destination officer types both in
// here — no need to browse a pending-requests inbox at all. Only valid for
// officers whose OWN village matches the request's destination village, and
// only within the one-week window.
router.post('/migration/confirm', async (req, res) => {
  const { id: officerId } = req.user
  const { nationalId, migrationToken } = req.body

  const nin = typeof nationalId === 'string' ? nationalId.trim() : ''
  const token = typeof migrationToken === 'string' ? migrationToken.trim().toUpperCase() : ''
  if (!nin || !token) {
    return res.status(400).json({ success: false, message: 'Citizen NIN and migration token are both required.' })
  }

  try {
    const officer = await prisma.villageOfficer.findUnique({
      where: { id: officerId },
      select: { villageId: true },
    })
    if (!officer?.villageId) {
      return res.status(422).json({ success: false, message: 'Your officer account is not assigned to a village yet.' })
    }

    const migration = await prisma.migration.findFirst({
      where: { migrationToken: token, citizen: { nationalId: nin } },
      select: {
        id: true, status: true, citizenId: true, toVillageId: true, expiryDate: true,
        citizen: { select: { firstName: true, middleName: true, surname: true } },
      },
    })

    if (!migration) {
      return res.status(404).json({ success: false, message: 'No matching migration request found for that NIN and token. Please check both are correct.' })
    }

    if (migration.toVillageId !== officer.villageId) {
      return res.status(403).json({ success: false, message: 'This migration request is not addressed to your village.' })
    }

    if (await expireIfDue(migration)) {
      return res.status(410).json({ success: false, message: 'This migration token has expired (its one-week validity window has passed). Ask the citizen to request a fresh migration from the source village officer.' })
    }

    if (migration.status !== 'pending') {
      return res.status(409).json({ success: false, message: `This migration request was already ${migration.status}.` })
    }

    await prisma.$transaction([
      prisma.migration.update({
        where: { id: migration.id },
        data: { status: 'confirmed', confirmedDate: new Date(), targetOfficerId: officerId },
      }),
      prisma.citizen.update({
        where: { id: migration.citizenId },
        data: { currentVillageId: migration.toVillageId },
      }),
    ])

    const citizenName = [migration.citizen?.firstName, migration.citizen?.middleName, migration.citizen?.surname]
      .filter(Boolean).join(' ')

    return res.json({
      success: true,
      message: `Migration confirmed. ${citizenName || 'The citizen'} is now registered in your village.`,
    })
  } catch (err) {
    console.error('[village/migration/confirm]', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
})

// ── GET /api/village/records ──────────────────────────────────────────────────
// ── GET /api/village/citizen-lookup ────────────────────────────────────
// Village Officer searches an existing citizen by National ID (NIN). Results
// are STRICTLY scoped to the officer's own village — a citizen registered in
// a different village is treated as not-found so officers can never browse
// another village's residents.
const CITIZEN_LOOKUP_SELECT = {
  id: true,
  nationalId: true,
  firstName: true,
  middleName: true,
  surname: true,
  gender: true,
  dateOfBirth: true,
  age: true,
  vitalStatus: true,
  maritalStatus: true,
  photoUrl: true,
  idCardIssued: true,
  idCardExpires: true,
  streetName: true,
  houseRegNumber: true,
  educationLevel: true,
  registeredAt: true,
  currentVillageId: true,
}

router.get('/citizen-lookup', async (req, res) => {
  const { id: officerId } = req.user
  const nationalId = typeof req.query.nationalId === 'string' ? req.query.nationalId.trim() : ''
  // PATCH-MIGRATION-2026: `q` is the generic lookup used by the migration
  // flow — matches NIN, Birth Registration ID (BID) / birth cert no, or a
  // partial full name. The original `nationalId` param keeps its strict
  // exact-match-only contract for existing callers (CitizenProfileScreen).
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''
  const term = nationalId || q
  if (!term) {
    return res.status(400).json({ success: false, message: 'nationalId or q query param required' })
  }
  try {
    const officer = await prisma.villageOfficer.findUnique({
      where: { id: officerId },
      select: { villageId: true, village: { select: { name: true } } },
    })
    if (!officer) return res.status(404).json({ success: false, message: 'Officer not found' })

    const vid = officer.villageId ?? -1

    let citizen = await prisma.citizen.findFirst({
      where: { nationalId: term, currentVillageId: vid },
      select: CITIZEN_LOOKUP_SELECT,
    })

    if (!citizen && q) {
      citizen = await prisma.citizen.findFirst({
        where: {
          currentVillageId: vid,
          OR: [
            { birthRecord: { birthId: term } },
            { birthRecord: { birthCertNo: term } },
            { firstName: { contains: term, mode: 'insensitive' } },
            { surname: { contains: term, mode: 'insensitive' } },
          ],
        },
        select: CITIZEN_LOOKUP_SELECT,
      })
    }

    if (!citizen) {
      return res.status(404).json({
        success: false,
        message: 'No citizen matching this NIN, Birth ID, or name was found registered in your village.',
      })
    }

    return res.json({
      success: true,
      data: {
        ...citizen,
        fullName: [citizen.firstName, citizen.middleName, citizen.surname].filter(Boolean).join(' '),
        ninCertificateIssued: !!citizen.idCardIssued,
        villageName: officer.village?.name ?? null,
      },
    })
  } catch (err) {
    console.error('[village/citizen-lookup]', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
})

router.get('/records', async (req, res) => {
  const { id:officerId } = req.user
  try {
    const out = []

    // Deaths
    const deaths = await prisma.death.findMany({
      where:{ villageOfficerId:officerId },
      orderBy:{ registeredAt:'desc' }, take:30,
      select:{ id:true, deathCertNo:true, nationalId:true, causeOfDeath:true, registeredAt:true },
    }).catch(()=>[])
    for (const d of deaths) {
      out.push({ id:`d-${d.id}`, type:'deaths', icon:'✝', color:'#dc2626',
        label: d.nationalId || 'Unknown', sub:`Cert: ${d.deathCertNo}`,
        date: new Date(d.registeredAt ?? new Date()).toLocaleDateString('en-TZ') })
    }

    // Citizens
    const citizens = await prisma.citizen.findMany({
      where:{ registeredById:officerId },
      orderBy:{ registeredAt:'desc' }, take:30,
      select:{ id:true, firstName:true, surname:true, nationalId:true, registeredAt:true },
    }).catch(()=>[])
    for (const c of citizens) {
      out.push({ id:`c-${c.id}`, type:'citizens', icon:'👤', color:'#0891b2',
        label:`${c.firstName} ${c.surname}`, sub:c.nationalId||'—',
        date: new Date(c.registeredAt ?? new Date()).toLocaleDateString('en-TZ') })
    }

    // Marriages
    const marriages = await prisma.marriage.findMany({
      where:{ registeredById:officerId },
      orderBy:{ registeredAt:'desc' }, take:30,
      select:{ id:true, marriageCertNo:true, husbandNid:true, wifeNid:true, registeredAt:true },
    }).catch(()=>[])
    for (const m of marriages) {
      out.push({ id:`m-${m.id}`, type:'marriages', icon:'💍', color:'#e11d48',
        label:`${m.husbandNid} & ${m.wifeNid}`, sub:`Cert: ${m.marriageCertNo}`,
        date: new Date(m.registeredAt ?? new Date()).toLocaleDateString('en-TZ') })
    }

    out.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    return res.json({ success:true, data:out })
  } catch (err) {
    console.error('[village/records]', err)
    return res.status(500).json({ success:false, message:'Internal server error' })
  }
})

// ── GET /api/officer/profile ──────────────────────────────────────────────────
router.get('/profile', async (req, res) => {
  const { id, role } = req.user
  try {
    if (role === 'hospital_officer') {
      const o = await prisma.hospitalOfficer.findUnique({ where:{ id }, include:{ facility:true } })
      if (!o) return res.status(404).json({ success:false, message:'Not found' })
      return res.json({ success:true, data:{
        officerName: o.fullName, employeeId: o.employeeId ?? `NBS-HO-${id.slice(-6)}`,
        role:'hospital_officer', facilityName: o.facility?.facilityName ?? '—',
        facilityType: o.facility?.facilityType ?? '—', facilityGrade: o.facility?.facilityGrade ?? '—',
        facilityRegion:'—', facilityDistrict:'—', email: o.email,
      }})
    }
    if (role === 'village_officer') {
      const o = await prisma.villageOfficer.findUnique({ where:{ id }, include:{ village:true, ward:true } })
      if (!o) return res.status(404).json({ success:false, message:'Not found' })
      return res.json({ success:true, data:{
        officerName: o.fullName, employeeId: o.employeeId ?? `NBS-VO-${id.slice(-6)}`,
        role:'village_officer', facilityName: o.village?.name ?? '—',
        villageName: o.village?.name ?? '—', wardName: o.ward?.name ?? '—',
        email: o.email,
      }})
    }
    return res.status(403).json({ success:false, message:'Not eligible' })
  } catch (err) {
    console.error('[officer/profile]', err)
    return res.status(500).json({ success:false, message:'Internal server error' })
  }
})

// ── POST /api/village/nin-issue ───────────────────────────────────────────────────
// Village Officer issues a NIN after biometric registration.
// Creates Citizen record, links Birth.childCitizenId, returns NIN.
router.post('/nin-issue', async (req, res) => {
  const { id: officerId } = req.user
  const { birthId, birthCertNo, photoBase64 } = req.body
  if (!birthId && !birthCertNo) {
    return res.status(400).json({ success:false, message:'birthId or birthCertNo required' })
  }
  try {
    const birth = await prisma.birth.findFirst({
      where: birthId ? { birthId } : { birthCertNo },
      select: {
        id:true, birthId:true, birthCertNo:true,
        childFirstName:true, childMiddleName:true, childSurname:true,
        gender:true, dateOfBirth:true, childCitizenId:true,
        fatherCitizenId:true, motherCitizenId:true,
      },
    })
    if (!birth) return res.status(404).json({ success:false, message:'Birth record not found' })
    if (birth.childCitizenId) {
      const existing = await prisma.citizen.findUnique({
        where:  { id: birth.childCitizenId },
        select: { nationalId:true },
      })
      return res.status(409).json({ success:false, message:'NIN already issued', nationalId:existing?.nationalId })
    }

    // Age check
    const dob = new Date(birth.dateOfBirth)
    const now = new Date()
    let age = now.getFullYear() - dob.getFullYear()
    const mo = now.getMonth() - dob.getMonth()
    if (mo < 0 || (mo === 0 && now.getDate() < dob.getDate())) age--
    if (age < 18) {
      return res.status(422).json({ success:false, message:`Citizen is ${age} years old — must be 18+` })
    }

    // Officer village
    const officer = await prisma.villageOfficer.findUnique({
      where:  { id: officerId },
      select: { villageId:true },
    })

    // Generate NIN: YYYYMMDD-07031-SSSSS-CC
    const yy  = dob.getFullYear()
    const mm  = String(dob.getMonth()+1).padStart(2,'0')
    const dd  = String(dob.getDate()).padStart(2,'0')
    const seq = String(Math.floor(Math.random()*89999)+10001).padStart(5,'0')
    const cc  = String(Math.floor(Math.random()*89)+10)
    const nationalId = `${yy}${mm}${dd}-07031-${seq}-${cc}`

    const issuedDate  = new Date()
    const expiresDate = new Date()
    expiresDate.setFullYear(expiresDate.getFullYear() + 10)

    // Upload the citizen photo captured on the mobile app to Cloudinary.
    // Best-effort: if Cloudinary isn't configured or the upload fails, we
    // still issue the NIN — a missing photo shouldn't block registration —
    // but we log it loudly so it can be backfilled.
    let photoUrl = null
    if (photoBase64 && typeof photoBase64 === 'string' && photoBase64.startsWith('data:')) {
      try {
        photoUrl = await uploadBase64(photoBase64, 'tzcrvs/citizen_photos', nationalId, 'image')
      } catch (uploadErr) {
        console.error('[village/nin-issue] Cloudinary photo upload failed:', uploadErr.message)
      }
    }

    const citizen = await prisma.citizen.create({
      data: {
        nationalId,
        firstName:        birth.childFirstName,
        middleName:       birth.childMiddleName ?? '',
        surname:          birth.childSurname,
        gender:           birth.gender,
        dateOfBirth:      birth.dateOfBirth,
        age,
        vitalStatus:      'alive',
        idCardIssued:     issuedDate,
        idCardExpires:    expiresDate,
        photoUrl:         photoUrl ?? undefined,
        fatherCitizenId:  birth.fatherCitizenId ?? undefined,
        motherCitizenId:  birth.motherCitizenId ?? undefined,
        currentVillageId: officer?.villageId    ?? undefined,
        registeredById:   officerId,
        registeredAt:     new Date(),
      },
      select: { id:true, nationalId:true },
    })

    await prisma.birth.update({
      where: { id: birth.id },
      data:  { childCitizenId: citizen.id },
    })

    return res.json({
      success: true,
      data: { citizenId:citizen.id, nationalId:citizen.nationalId, age, message:'NIN issued successfully' },
    })
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ success:false, message:'NIN conflict — please retry' })
    console.error('[village/nin-issue]', err)
    return res.status(500).json({ success:false, message:'Internal server error' })
  }
})

// ── GET /api/village/birth-lookup?bid=BID-YYYYMMDD-XXXXXXX ──────────────────────
// Village Officer enters the child's Birth Registration ID to pre-fill
// the citizen registration form at age 18 (NIN issuance workflow).
router.get('/birth-lookup', async (req, res) => {
  const { bid } = req.query
  if (!bid || typeof bid !== 'string' || !bid.startsWith('BID-')) {
    return res.status(400).json({ success: false, message: 'bid query param required (format: BID-YYYYMMDD-XXXXXXX)' })
  }
  try {
    // Step 1 — fetch scalar birth fields only. This is guaranteed to work
    // even if the Citizen relations (father/mother) or facility are not
    // yet fully migrated — keeps the core lookup functional.
    let birth
    try {
      birth = await prisma.birth.findFirst({
        where: { birthId: bid.trim() },
        select: {
          id:              true,
          birthId:         true,
          birthCertNo:     true,
          childFirstName:  true,
          childMiddleName: true,
          childSurname:    true,
          gender:          true,
          dateOfBirth:     true,
          childCitizenId:  true,   // null until NIN issued
          fatherCitizenId: true,
          motherCitizenId: true,
          facilityId:      true,
          registeredAt:    true,
        },
      })
    } catch (scalarErr) {
      console.error('[village/birth-lookup] scalar query failed:', scalarErr.code, scalarErr.message)
      return res.status(500).json({
        success: false,
        message: `Database error (${scalarErr.code || 'unknown'}): ${scalarErr.message}`,
      })
    }

    if (!birth) {
      return res.status(404).json({ success: false, message: 'No birth record found for this BID' })
    }
    if (birth.childCitizenId) {
      return res.status(409).json({
        success: false,
        message: 'NIN already issued for this birth record',
        nationalId: birth.childCitizenId,
      })
    }

    // Step 2 — best-effort enrichment with father/mother/facility details.
    // If these relation lookups fail (e.g. pending migration), don't fail
    // the whole request — just return the core birth record without them.
    let father = null, mother = null, facility = null
    try {
      if (birth.fatherCitizenId) {
        father = await prisma.citizen.findUnique({
          where:  { id: birth.fatherCitizenId },
          select: { nationalId:true, firstName:true, middleName:true, surname:true },
        })
      }
      if (birth.motherCitizenId) {
        mother = await prisma.citizen.findUnique({
          where:  { id: birth.motherCitizenId },
          select: { nationalId:true, firstName:true, middleName:true, surname:true },
        })
      }
      if (birth.facilityId) {
        facility = await prisma.healthFacility.findUnique({
          where:  { id: birth.facilityId },
          select: { facilityName:true },
        })
      }
    } catch (enrichErr) {
      console.error('[village/birth-lookup] enrichment lookup failed (non-fatal):', enrichErr.code, enrichErr.message)
    }

    const { fatherCitizenId, motherCitizenId, facilityId, ...core } = birth
    return res.json({ success: true, data: { ...core, father, mother, facility } })
  } catch (err) {
    console.error('[village/birth-lookup]', err.code, err.message)
    return res.status(500).json({ success: false, message: `Internal server error: ${err.message}` })
  }
})

module.exports = router
