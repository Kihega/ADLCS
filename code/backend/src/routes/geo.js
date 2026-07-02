/**
 * geo.js — Shared Geography Hierarchy Routes  v1.0
 *
 * Region → District → Ward → Village/Street, available to ANY authenticated
 * role (hospital officer, village officer, district admin, super admin) —
 * unlike /api/admin/geo/*, which is restricted to super_admin/district_admin
 * and can't be reached by the mobile app's Hospital/Village Officer forms.
 *
 * GET  /api/geo/regions
 * GET  /api/geo/districts          — ?regionId=
 * GET  /api/geo/wards              — ?districtId=
 * GET  /api/geo/villages           — ?wardId=  (optional &type=village|street)
 * POST /api/geo/villages           — get-or-create { wardId, name, type }
 *
 * WHY get-or-create matters:
 * A village/street is entered manually the first time a Hospital or Village
 * Officer encounters it for a given ward (it won't be seeded in the DB in
 * advance for every ward in the country). Once created, it's linked
 * directly to its ward, so every subsequent registration in that same ward
 * sees it as a normal dropdown option instead of needing to be re-typed —
 * and a Prisma `@@unique([wardId, name])` constraint on Village guarantees
 * one canonical row per (ward, name) pair, so two officers typing the same
 * village name for the same ward converge on the same row instead of
 * creating duplicates. The same name IS allowed to exist in a different
 * ward (e.g. many wards have a village called "Kati").
 */

const { Router } = require('express')
const { prisma } = require('../lib/prisma')
const { requireAuth } = require('../middleware/auth')

const router = Router()
router.use(requireAuth)

// ── GET /api/geo/regions ────────────────────────────────────────────────────
router.get('/regions', async (req, res) => {
  try {
    const regions = await prisma.region.findMany({
      select: { id: true, name: true, jurisdiction: true },
      orderBy: { name: 'asc' },
    })
    return res.json({ success: true, data: regions })
  } catch (err) {
    console.error('[geo/regions]', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
})

// ── GET /api/geo/districts?regionId= ────────────────────────────────────────
router.get('/districts', async (req, res) => {
  const regionId = Number(req.query.regionId) || undefined
  if (!regionId) {
    return res.status(400).json({ success: false, message: 'regionId query param required' })
  }
  try {
    const districts = await prisma.district.findMany({
      where: { regionId },
      select: { id: true, name: true, regionId: true },
      orderBy: { name: 'asc' },
    })
    return res.json({ success: true, data: districts })
  } catch (err) {
    console.error('[geo/districts]', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
})

// ── GET /api/geo/wards?districtId= ──────────────────────────────────────────
router.get('/wards', async (req, res) => {
  const districtId = Number(req.query.districtId) || undefined
  if (!districtId) {
    return res.status(400).json({ success: false, message: 'districtId query param required' })
  }
  try {
    const wards = await prisma.ward.findMany({
      where: { districtId },
      select: { id: true, name: true, districtId: true },
      orderBy: { name: 'asc' },
    })
    return res.json({ success: true, data: wards })
  } catch (err) {
    console.error('[geo/wards]', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
})

// ── GET /api/geo/villages?wardId=&type= ─────────────────────────────────────
router.get('/villages', async (req, res) => {
  const wardId = Number(req.query.wardId) || undefined
  const { type } = req.query // optional: 'village' | 'street'
  if (!wardId) {
    return res.status(400).json({ success: false, message: 'wardId query param required' })
  }
  try {
    const villages = await prisma.village.findMany({
      where: {
        wardId,
        ...(type === 'village' || type === 'street' ? { type } : {}),
      },
      select: { id: true, name: true, wardId: true, type: true },
      orderBy: { name: 'asc' },
    })
    return res.json({ success: true, data: villages })
  } catch (err) {
    console.error('[geo/villages]', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
})

// ── POST /api/geo/villages ──────────────────────────────────────────────────
// Get-or-create a village/street within a ward. Case-insensitive match on
// name so "Kati", "kati", and "KATI" all resolve to the same row.
router.post('/villages', async (req, res) => {
  const { wardId, name, type } = req.body
  const wardIdNum = Number(wardId)
  const cleanName = typeof name === 'string' ? name.trim() : ''
  const cleanType = type === 'street' ? 'street' : 'village'

  if (!wardIdNum || !cleanName) {
    return res.status(400).json({ success: false, message: 'wardId and name are required' })
  }
  if (cleanName.length > 80) {
    return res.status(400).json({ success: false, message: 'name must be 80 characters or fewer' })
  }

  try {
    const ward = await prisma.ward.findUnique({ where: { id: wardIdNum }, select: { id: true } })
    if (!ward) {
      return res.status(404).json({ success: false, message: 'Ward not found' })
    }

    // Case-insensitive lookup first — the @@unique([wardId, name]) constraint
    // is case-sensitive at the DB level, so we check manually to avoid
    // creating "Kati" and "kati" as two rows for the same ward.
    const existing = await prisma.village.findFirst({
      where: { wardId: wardIdNum, name: { equals: cleanName, mode: 'insensitive' } },
      select: { id: true, name: true, wardId: true, type: true },
    })
    if (existing) {
      return res.json({ success: true, data: existing, created: false })
    }

    const created = await prisma.village.create({
      data: { wardId: wardIdNum, name: cleanName, type: cleanType },
      select: { id: true, name: true, wardId: true, type: true },
    })
    return res.json({ success: true, data: created, created: true })
  } catch (err) {
    // Race condition: two officers submit the same new village at the same
    // instant — the unique constraint catches it, so fetch and return the
    // row that won instead of erroring out.
    if (err.code === 'P2002') {
      const winner = await prisma.village.findFirst({
        where: { wardId: wardIdNum, name: { equals: cleanName, mode: 'insensitive' } },
        select: { id: true, name: true, wardId: true, type: true },
      })
      if (winner) return res.json({ success: true, data: winner, created: false })
    }
    console.error('[geo/villages POST]', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
})

module.exports = router
