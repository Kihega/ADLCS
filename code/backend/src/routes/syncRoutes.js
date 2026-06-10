/**
 * syncRoutes.js — Receive registration records from mobile  v10.0
 *
 * Mobile sends records directly (online-only mode — no local SQLite).
 *
 * POST /api/officer/birth/sync   — save birth registration to Supabase
 * POST /api/officer/death/sync   — save death registration to Supabase
 *
 * Both endpoints are idempotent (duplicate → { success:true, duplicate:true }).
 *
 * ⚠️  BIRTH POLICY: No NIN is generated at birth.
 *     Birth record stores only BID + cert no + child name/gender/DOB + parents.
 *     childCitizenId is NULL until the child reaches age 18 and registers
 *     with a Village Officer who issues the NIN via the NIN issuance workflow.
 */

const { Router } = require('express')
const { prisma }  = require('../lib/prisma')
const { requireAuth } = require('../middleware/auth')

const router = Router()
router.use(requireAuth)

// ── POST /api/officer/birth/sync ──────────────────────────────────────────────
router.post('/birth/sync', async (req, res) => {
  const { id: officerId } = req.user
  const {
    localId, birthCertNo, birthId,
    childFirstName, childMiddleName, childSurname,
    gender, dateOfBirth,
    fatherNid, motherNid,
    registeredAt,
  } = req.body

  if (!birthCertNo || !childFirstName || !childSurname) {
    return res.status(400).json({ success: false, message: 'Missing required fields: birthCertNo, childFirstName, childSurname' })
  }

  try {
    // Check for duplicate
    const existing = await prisma.birth.findFirst({
      where: { birthCertNo },
      select: { id: true },
    })
    if (existing) {
      return res.json({ success: true, duplicate: true, serverId: existing.id })
    }

    const officer = await prisma.hospitalOfficer.findUnique({
      where: { id: officerId },
      select: { facilityId: true },
    })

    // Resolve father citizen ID from NID
    let fatherCitizenId
    let motherCitizenId
    if (fatherNid) {
      const father = await prisma.citizen.findFirst({ where: { nationalId: fatherNid }, select: { id: true } })
      fatherCitizenId = father?.id
    }
    if (motherNid) {
      const mother = await prisma.citizen.findFirst({ where: { nationalId: motherNid }, select: { id: true } })
      motherCitizenId = mother?.id
    }

    // childCitizenId intentionally NOT set here.
    // It remains NULL until Village Officer NIN issuance at age 18.
    const birth = await prisma.birth.create({
      data: {
        birthCertNo,
        birthId:          birthId || undefined,
        childFirstName,
        childMiddleName:  childMiddleName || '',
        childSurname,
        gender:           gender?.toLowerCase() ?? 'unknown',
        dateOfBirth:      dateOfBirth ? new Date(dateOfBirth.replace(/(\d{2})\/(\d{2})\/(\d{4})/,'$3-$2-$1')) : new Date(),
        fatherCitizenId:  fatherCitizenId || undefined,
        motherCitizenId:  motherCitizenId || undefined,
        officerId,
        facilityId:       officer?.facilityId || undefined,
        registeredAt:     registeredAt ? new Date(registeredAt) : new Date(),
        ritaSynced:       false,
      },
      select: { id: true, birthCertNo: true },
    })

    return res.json({ success: true, serverId: birth.id, birthCertNo: birth.birthCertNo })
  } catch (err) {
    // Handle unique constraint violation (duplicate) gracefully
    if (err.code === 'P2002') {
      return res.json({ success: true, duplicate: true })
    }
    console.error('[birth/sync]', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
})

// ── POST /api/officer/death/sync ──────────────────────────────────────────────
router.post('/death/sync', async (req, res) => {
  const { id: officerId } = req.user
  const {
    localId, deathCertNo, nationalId,
    causeOfDeath, dateOfDeath,
    locationType, category,
    informantName, registeredAt,
  } = req.body

  if (!deathCertNo || !causeOfDeath || !dateOfDeath) {
    return res.status(400).json({ success: false, message: 'Missing required fields: deathCertNo, causeOfDeath, dateOfDeath' })
  }

  try {
    const existing = await prisma.death.findFirst({
      where: { deathCertNo },
      select: { id: true },
    })
    if (existing) {
      return res.json({ success: true, duplicate: true, serverId: existing.id })
    }

    const officer = await prisma.hospitalOfficer.findUnique({
      where: { id: officerId },
      select: { facilityId: true },
    })

    let citizenId
    if (nationalId) {
      const citizen = await prisma.citizen.findFirst({ where: { nationalId }, select: { id: true } })
      citizenId = citizen?.id
    }

    const death = await prisma.death.create({
      data: {
        deathCertNo,
        citizenId:         citizenId || undefined,
        nationalId:        nationalId || undefined,
        causeOfDeath,
        dateOfDeath:       dateOfDeath ? new Date(dateOfDeath.replace(/(\d{2})\/(\d{2})\/(\d{4})/,'$3-$2-$1')) : new Date(),
        locationType:      ({'hospital':'hospital','outside':'outside','health_facility':'hospital','home':'outside','public_place':'outside','other':'outside'}[locationType] ?? 'outside'),
        category:          ({'infant':'infant','child':'infant','adult':'adult','maternal':'adult'}[category] ?? 'adult'),
        informantName:     informantName || undefined,
        hospitalOfficerId: officerId,
        facilityId:        officer?.facilityId || undefined,
        ritaSynced:        false,
      },
      select: { id: true, deathCertNo: true },
    })

    return res.json({ success: true, serverId: death.id, deathCertNo: death.deathCertNo })
  } catch (err) {
    if (err.code === 'P2002') {
      return res.json({ success: true, duplicate: true })
    }
    console.error('[death/sync]', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
})

module.exports = router
