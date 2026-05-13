/**
 * syncRoutes.js — Receive offline-queued records from mobile  v1.0
 *
 * Mobile devices save records locally (SQLite) when offline.
 * These endpoints accept those records when the device comes back online.
 *
 * POST /api/officer/birth/sync   — receive a locally-saved birth registration
 * POST /api/officer/death/sync   — receive a locally-saved death registration
 *
 * Both endpoints are idempotent: if the record already exists (duplicate field),
 * they return { success: true, duplicate: true } so the mobile can mark it synced.
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
    localId, birthCertNo, nationalId,
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

    const birth = await prisma.birth.create({
      data: {
        birthCertNo,
        nationalId:       nationalId || undefined,
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
        locationType:      locationType ?? 'health_facility',
        category:          category ?? 'adult',
        informantName:     informantName || undefined,
        hospitalOfficerId: officerId,
        facilityId:        officer?.facilityId || undefined,
        createdAt:         registeredAt ? new Date(registeredAt) : new Date(),
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
