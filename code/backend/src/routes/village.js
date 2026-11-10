/**
 * village.js — Village Officer API Routes  v2.0
 *
 * GET   /api/village/dashboard
 * POST  /api/village/citizen
 * POST  /api/village/birth        (fallback — primary is hospital officer)
 * POST  /api/village/death
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
const { classifyIdentifier } = require('../lib/parentIdentifier')
const { lookupResidentInVillage, materializeCitizenFromBirth, resolveDeceasedRef, resolveDeceasedDisplay, getScope, birthScopeWhere, findDeathRecord } = require('../lib/identityLookup')
const { buildGeo, VILLAGE_GEO_SELECT } = require('../lib/personLookup')

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

// PATCH-PRIVACY-2026: neither ID format encodes date of birth (or any other
// personal detail) any more — regulatory/privacy requirement. Uniqueness comes
// from a high-entropy random block plus the DB's UNIQUE constraint (callers
// retry on the rare P2002 collision). `dob` params are kept-but-unused on the
// exported helpers so existing call sites don't need to change.
const ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O/1/I — avoids confusion
function randomIdBlock(len) {
  let out = ''
  for (let i = 0; i < len; i++) out += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)]
  return out
}
// Birth ID (BID) — format: BID-XXXXXXXXXX. Used for the "register citizen"
// fallback path (adults with no birth record on file) so every citizen ends
// up with a Birth ID one way or another.
function genBirthId() {
  return `BID-${randomIdBlock(10)}`
}

// ── POST /api/village/citizen ─────────────────────────────────────────────────
router.post('/citizen', async (req, res) => {
  const { id:officerId } = req.user
  const { firstName, middleName, surname, gender, dateOfBirth, bloodGroup,
          phone, occupation, nationalId, birthId } = req.body
  if (!firstName || !surname || !gender)
    return res.status(400).json({ success:false, message:'firstName, surname, gender required' })
  let nin
  if (nationalId) {
    const c = classifyIdentifier(nationalId)
    if (c.type !== 'NIN') return res.status(400).json({ success:false, message:'nationalId is not a valid NIN' })
    nin = c.value
  }
  try {
    const officer = await prisma.villageOfficer.findUnique({
      where:{ id:officerId },
      select:{ villageId:true, village:{ select:{ ward:{ select:{ district:{ select:{ regionId:true } } } } } } },
    })
    const citizen = await prisma.citizen.create({
      data:{
        firstName:   firstName.trim(),
        middleName:  middleName?.trim() ?? '',
        surname:     surname.trim(),
        gender:      gender.toLowerCase(),
        dateOfBirth: dateOfBirth ? parseDDMMYYYY(dateOfBirth) : null,
        // NIN is optional and NEVER generated here — it only comes from NIDA.
        nationalId:  nin || undefined,
        // PATCH-BID-LOOKUP-2026: this is the "no prior birth record" fallback
        // path — give the citizen a Birth ID here too so they can still be
        // found by BID everywhere else in the system.
        birthId:     birthId ?? genBirthId(),
        currentVillageId: officer?.villageId ?? undefined,
        regionId:         officer?.village?.ward?.district?.regionId ?? undefined,
        registeredById:   officerId,
        vitalStatus:      'alive',
      },
      select:{ id:true, nationalId:true, birthId:true },
    })
    return res.json({ success:true, data:{ citizenId:citizen.id, nationalId:citizen.nationalId, birthId:citizen.birthId } })
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

    // PATCH-STRICT-ID-2026: the deceased must resolve to a real person (BID / NIN).
    // PATCH-V2-2026-11: a village officer may only record a death for someone
    // registered in HIS OWN village/street (BID or NIN is checked against it).
    const officerRow = await prisma.villageOfficer.findUnique({ where:{ id:officerId }, select:{ villageId:true } })
    if (!officerRow?.villageId) {
      return res.status(422).json({ success:false, message:'Your officer account is not assigned to a village yet.' })
    }
    const scope = await lookupResidentInVillage(nationalId, officerRow.villageId, { id:true, vitalStatus:true }, { wide: true })
    if (!scope.found) {
      return res.status(scope.code === 'INVALID_ID' ? 400 : 422).json({ success:false, code:scope.code, message:scope.message })
    }
    if (String(scope.citizen.vitalStatus || '').toLowerCase() === 'deceased') {
      return res.status(409).json({ success:false, message:'This person is already recorded as deceased.' })
    }
    const deceased = await resolveDeceasedRef(nationalId, { category })
    if (!deceased.ok) return res.status(deceased.status || 422).json({ success:false, message: deceased.message })

    // Map mobile enum values to schema enums
    // DeathLocationType: hospital | outside
    // DeathCategory:     infant   | adult
    const locMap = { health_facility:'hospital', hospital:'hospital', home:'outside', public_place:'outside', other:'outside' }
    const catMap = { infant:'infant', child:'infant', adult:'adult', maternal:'adult' }

    const death = await prisma.death.create({
      data:{
        deathCertNo:      deathCertNo ?? `VD-${Date.now()}`,
        citizenId:        deceased.citizenId,
        nationalId:       deceased.nationalId,
        causeOfDeath,
        dateOfDeath:      parseDDMMYYYY(dateOfDeath),
        locationType:     locMap[locationType]  ?? 'outside',
        category:         catMap[category]      ?? 'adult',
        informantName:    (typeof informantName === 'string' && informantName.trim()) ? informantName.trim() : undefined, // optional
        villageOfficerId: officerId,   // village officer FK only — no hospitalOfficerId
      },
      select:{ id:true, deathCertNo:true },
    })
    // PATCH-C-2026-11: the citizen is now deceased (migration etc. must see this)
    if (deceased.citizenId) {
      await prisma.citizen.update({ where:{ id: deceased.citizenId }, data:{ vitalStatus:'deceased' } })
        .catch((e) => console.warn('[village/death] vitalStatus', e && e.message))
    }
    return res.json({ success:true, data:{ serverId:death.id, deathCertNo:death.deathCertNo } })
  } catch (err) {
    if (err.code === 'P2002') return res.json({ success:true, duplicate:true })
    console.error('[village/death]', err)
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
  const { citizenId, nationalId, birthId, toVillageId, reason } = req.body

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
    // PATCH-BID-LOOKUP-2026: birthId is preferred; nationalId kept only as a
    // legacy fallback for any older client still sending it.
    let citizen = citizenId
      ? await prisma.citizen.findFirst({ where: { id: citizenId, currentVillageId: officer.villageId }, select: { id: true, currentVillageId: true } })
      : birthId
        ? await prisma.citizen.findFirst({ where: { birthId: String(birthId).trim(), currentVillageId: officer.villageId }, select: { id: true, currentVillageId: true } })
        : nationalId
          ? await prisma.citizen.findFirst({ where: { nationalId: String(nationalId).trim(), currentVillageId: officer.villageId }, select: { id: true, currentVillageId: true } })
          : null

    // PATCH-V2-2026-11: a child registered at the hospital has no Citizen row yet.
    // Create it from the birth record - only if the child's origin village is
    // THIS officer's village.
    if (!citizen && !citizenId && birthId) {
      citizen = await materializeCitizenFromBirth(String(birthId).trim().toUpperCase(), officer.villageId)
    }

    if (!citizen) {
      return res.status(422).json({ success: false, message: 'Citizen not found in your village. Look them up first using their Birth ID (or NIN).' })
    }

    // PATCH-C-2026-11: only a LIVING citizen can be migrated.
    {
      const row = await prisma.citizen.findUnique({
        where: { id: citizen.id },
        select: { vitalStatus: true, birthId: true, nationalId: true },
      })
      const dead = row && (row.vitalStatus === 'deceased'
        || await findDeathRecord({ citizenId: citizen.id, birthId: row.birthId, nationalId: row.nationalId }))
      if (dead) {
        return res.status(409).json({ success: false, code: 'CITIZEN_DECEASED', message: 'This citizen is deceased. A citizen must be alive to register a migration.' })
      }
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
// PATCH-MIGFLOW-2026 / PATCH-BID-LOOKUP-2026: the primary confirmation path.
// The citizen who has physically arrived at their NEW village presents their
// Birth ID (BID) and the migration token the source officer gave them; the
// destination officer types both in here — no need to browse a pending-
// requests inbox at all. Only valid for officers whose OWN village matches
// the request's destination village, and only within the one-week window.
router.post('/migration/confirm', async (req, res) => {
  const { id: officerId } = req.user
  const { birthId, migrationToken } = req.body

  const bid = typeof birthId === 'string' ? birthId.trim() : ''
  const token = typeof migrationToken === 'string' ? migrationToken.trim().toUpperCase() : ''
  if (!bid || !token) {
    return res.status(400).json({ success: false, message: 'Citizen Birth ID and migration token are both required.' })
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
      where: { migrationToken: token, citizen: { birthId: bid } },
      select: {
        id: true, status: true, citizenId: true, toVillageId: true, expiryDate: true,
        citizen: { select: { firstName: true, middleName: true, surname: true } },
      },
    })

    if (!migration) {
      return res.status(404).json({ success: false, message: 'No matching migration request found for that Birth ID and token. Please check both are correct.' })
    }

    // PATCH-C-2026-11: a citizen who has died cannot be confirmed into a village.
    {
      const row = await prisma.citizen.findUnique({
        where: { id: migration.citizenId },
        select: { vitalStatus: true, birthId: true, nationalId: true },
      })
      if (row && (row.vitalStatus === 'deceased'
        || await findDeathRecord({ citizenId: migration.citizenId, birthId: row.birthId, nationalId: row.nationalId }))) {
        return res.status(409).json({ success: false, code: 'CITIZEN_DECEASED', message: 'This citizen is deceased. A citizen must be alive to register a migration.' })
      }
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
  birthId: true,
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
  currentVillage: { select: VILLAGE_GEO_SELECT },
}

router.get('/citizen-lookup', async (req, res) => {
  const { id: officerId } = req.user
  // PATCH-STRICT-ID-2026: Birth ID (main way) or NIN only — never a name.
  // `birthId` / `nin` / legacy `nationalId` / generic `q` are all accepted as
  // the *identifier*, but whatever is sent must be a valid BID or NIN.
  const pick = (v) => (typeof v === 'string' ? v.trim() : '')
  const term = pick(req.query.birthId) || pick(req.query.nin) || pick(req.query.nationalId) || pick(req.query.q)
  if (!term) {
    return res.status(400).json({ success: false, message: 'Birth ID or NIN required' })
  }
  try {
    const officer = await prisma.villageOfficer.findUnique({
      where: { id: officerId },
      select: { villageId: true, village: { select: { name: true } } },
    })
    if (!officer) return res.status(404).json({ success: false, message: 'Officer not found' })

    const r = await lookupResidentInVillage(term, officer.villageId ?? -1, CITIZEN_LOOKUP_SELECT, { wide: true })
    if (!r.found) {
      return res.status(r.code === 'INVALID_ID' ? 400 : 404).json({ success: false, code: r.code, message: r.message })
    }
    const citizen = r.citizen

    return res.json({
      success: true,
      data: {
        ...citizen,
        ...buildGeo(citizen.currentVillage),
        fullName: [citizen.firstName, citizen.middleName, citizen.surname].filter(Boolean).join(' '),
        ninCertificateIssued: !!citizen.idCardIssued,
        source: r.source ?? 'citizen',
        hasBirthRecord: r.source === 'birth'
          || (citizen.birthId ? (await prisma.birth.count({ where: { birthId: citizen.birthId } })) > 0 : false),
        villageName: officer.village?.name ?? null,
      },
    })
  } catch (err) {
    console.error('[village/citizen-lookup]', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
})

router.get('/records', async (req, res) => {
  // PATCH-C-2026-11: the village "View Records" screen lists this officer's DEATH and
  // MIGRATION records only. `ts` is a real timestamp so the app can sort newest first.
  const { id: officerId } = req.user
  try {
    const out = []

    const deaths = await prisma.death.findMany({
      where: { villageOfficerId: officerId },
      orderBy: { registeredAt: 'desc' }, take: 100,
      select: { id: true, deathCertNo: true, citizenId: true, nationalId: true, causeOfDeath: true, registeredAt: true },
    }).catch(() => [])
    const deathInfo = await resolveDeceasedDisplay(deaths).catch(() => new Map())
    for (const d of deaths) {
      const when = new Date(d.registeredAt ?? new Date())
      out.push({
        id: `d-${d.id}`, recordId: d.id, type: 'deaths', color: '#dc2626',
        birthId: deathInfo.get(d.id)?.birthId ?? null,
        label: deathInfo.get(d.id)?.name || d.nationalId || 'Unknown',
        certNo: d.deathCertNo, cause: d.causeOfDeath || '',
        sub: `Cert: ${d.deathCertNo}`,
        date: when.toLocaleDateString('en-TZ'), ts: when.toISOString(),
      })
    }

    const migrations = await prisma.migration.findMany({
      where: { OR: [{ sourceOfficerId: officerId }, { targetOfficerId: officerId }] },
      orderBy: { requestDate: 'desc' }, take: 100,
      select: {
        id: true, status: true, reason: true, requestDate: true, confirmedDate: true, expiryDate: true,
        migrationToken: true, sourceOfficerId: true,
        citizen: { select: { firstName: true, middleName: true, surname: true, birthId: true } },
        fromVillage: { select: { name: true } },
        toVillage: { select: { name: true } },
      },
    }).catch(() => [])
    const now = new Date()
    for (const m of migrations) {
      const status = (m.status === 'pending' && m.expiryDate && new Date(m.expiryDate) < now) ? 'expired' : m.status
      const when = new Date(m.confirmedDate ?? m.requestDate ?? now)
      const name = [m.citizen?.firstName, m.citizen?.middleName, m.citizen?.surname].filter(Boolean).join(' ')
      out.push({
        id: `m-${m.id}`, recordId: m.id, type: 'migrations', color: '#7c3aed',
        birthId: m.citizen?.birthId ?? null,
        label: name || 'Unknown',
        sub: `${m.fromVillage?.name ?? '—'} → ${m.toVillage?.name ?? '—'}`,
        status,
        direction: m.sourceOfficerId === officerId ? 'outgoing' : 'incoming',
        fromVillage: m.fromVillage?.name ?? '—',
        toVillage: m.toVillage?.name ?? '—',
        reason: m.reason || '',
        migrationToken: m.migrationToken ?? null,
        requestDate: m.requestDate, confirmedDate: m.confirmedDate, expiryDate: m.expiryDate,
        date: when.toLocaleDateString('en-TZ'), ts: when.toISOString(),
      })
    }

    out.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
    return res.json({ success: true, data: out })
  } catch (err) {
    console.error('[village/records]', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
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

// NOTE: POST /nin-issue and GET /birth-lookup were removed. NIN registration /
// issuance is handled by a separate organisation (NIDA); this NBS system only
// stores a NIN when it is supplied from NIDA data (see lib/nidaClient.js).

module.exports = router
