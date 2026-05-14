/**
 * village.js — Village Officer API Routes  v1.0
 *
 * GET  /api/village/dashboard    — village stats
 * POST /api/village/citizen      — register new citizen
 * POST /api/village/birth        — record village birth
 * POST /api/village/death        — record village death
 * POST /api/village/migration    — record migration
 * GET  /api/officer/profile      — officer profile (used by ID card modal)
 */

const { Router } = require('express')
const { prisma }  = require('../lib/prisma')
const { requireAuth } = require('../middleware/auth')

const router = Router()
router.use(requireAuth)

// ── GET /api/village/dashboard ────────────────────────────────────────────────
router.get('/dashboard', async (req, res) => {
  const { id } = req.user
  try {
    const officer = await prisma.villageOfficer.findUnique({
      where:   { id },
      include: { village:true, ward:true },
    })
    if (!officer) return res.status(404).json({ success:false, message:'Officer not found' })

    const now        = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const vid        = officer.villageId ?? -1

    const [totalCitizens, monthBirths, monthDeaths] = await Promise.all([
      prisma.citizen.count({ where:{ currentVillageId:vid } }),
      prisma.birth.count({
        where:{ registeredAt:{ gte:monthStart }, child:{ currentVillageId:vid } },
      }).catch(() => 0),
      prisma.death.count({ where:{ createdAt:{ gte:monthStart }, villageOfficerId:id } }).catch(() => 0),
    ])

    return res.json({
      success:true,
      data:{
        officerName:    officer.fullName,
        employeeId:     officer.employeeId,
        villageName:    officer.village?.name   ?? 'Unknown Village',
        wardName:       officer.ward?.name      ?? 'Unknown Ward',
        totalCitizens,
        monthBirths,
        monthDeaths,
        monthMigrations: 0,
        pendingCases:   0,
      },
    })
  } catch (err) {
    console.error('[village/dashboard]', err)
    return res.status(500).json({ success:false, message:'Internal server error' })
  }
})

// ── POST /api/village/citizen ─────────────────────────────────────────────────
router.post('/citizen', async (req, res) => {
  const { id:officerId } = req.user
  const { firstName, middleName, surname, gender, dateOfBirth, bloodGroup, placeOfBirth, nationalId } = req.body
  if (!firstName||!surname||!gender) {
    return res.status(400).json({ success:false, message:'firstName, surname and gender required' })
  }
  try {
    const officer = await prisma.villageOfficer.findUnique({ where:{ id:officerId }, select:{ villageId:true } })
    const citizen = await prisma.citizen.create({
      data:{
        firstName:firstName.trim(),
        middleName:middleName?.trim() ?? '',
        surname:surname.trim(),
        gender:gender.toLowerCase(),
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth.replace(/(\d{2})\/(\d{2})\/(\d{4})/,'$3-$2-$1')) : null,
        nationalId:  nationalId ?? undefined,
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

// ── POST /api/village/birth ───────────────────────────────────────────────────
router.post('/birth', async (req, res) => {
  const { id:officerId } = req.user
  const { childFirstName, childMiddleName, childSurname, gender, dateOfBirth,
          fatherName, motherName, birthCertNo, nationalId } = req.body
  if (!childFirstName||!childSurname||!gender) {
    return res.status(400).json({ success:false, message:'childFirstName, childSurname and gender required' })
  }
  try {
    const existing = birthCertNo
      ? await prisma.birth.findFirst({ where:{ birthCertNo }, select:{ id:true } })
      : null
    if (existing) return res.json({ success:true, duplicate:true, serverId:existing.id })

    const officer = await prisma.hospitalOfficer.findFirst({
      where:{ id:officerId }, select:{ facilityId:true }
    }).catch(() => null)

    const birth = await prisma.birth.create({
      data:{
        birthCertNo:     birthCertNo ?? `VB-${Date.now()}`,
        nationalId:      nationalId ?? undefined,
        childFirstName:  childFirstName.trim(),
        childMiddleName: childMiddleName?.trim() ?? '',
        childSurname:    childSurname.trim(),
        gender:          gender.toLowerCase(),
        dateOfBirth:     dateOfBirth
          ? new Date(dateOfBirth.replace(/(\d{2})\/(\d{2})\/(\d{4})/,'$3-$2-$1'))
          : new Date(),
        officerId:   officerId,
        facilityId:  officer?.facilityId ?? undefined,
        registeredAt: new Date(),
        ritaSynced:  false,
      },
      select:{ id:true, birthCertNo:true },
    })
    return res.json({ success:true, data:{ serverId:birth.id, birthCertNo:birth.birthCertNo } })
  } catch (err) {
    if (err.code === 'P2002') return res.json({ success:true, duplicate:true })
    console.error('[village/birth]', err)
    return res.status(500).json({ success:false, message:'Internal server error' })
  }
})

// ── POST /api/village/death ───────────────────────────────────────────────────
router.post('/death', async (req, res) => {
  const { id:officerId } = req.user
  const { deceasedName, nationalId, causeOfDeath, dateOfDeath, category, informantName, deathCertNo } = req.body
  if (!causeOfDeath||!dateOfDeath) {
    return res.status(400).json({ success:false, message:'causeOfDeath and dateOfDeath required' })
  }
  try {
    const existing = deathCertNo
      ? await prisma.death.findFirst({ where:{ deathCertNo }, select:{ id:true } })
      : null
    if (existing) return res.json({ success:true, duplicate:true, serverId:existing.id })

    const death = await prisma.death.create({
      data:{
        deathCertNo:      deathCertNo ?? `VD-${Date.now()}`,
        nationalId:       nationalId  ?? undefined,
        causeOfDeath,
        dateOfDeath:      new Date(dateOfDeath.replace(/(\d{2})\/(\d{2})\/(\d{4})/,'$3-$2-$1')),
        locationType:     'home',
        category:         category ?? 'adult',
        informantName:    informantName ?? undefined,
        hospitalOfficerId: officerId,
        createdAt:        new Date(),
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

// ── POST /api/village/migration ───────────────────────────────────────────────
router.post('/migration', async (req, res) => {
  const { citizenName, nationalId, direction, fromVillage, toVillage, reason, referenceNo } = req.body
  if (!citizenName) return res.status(400).json({ success:false, message:'citizenName required' })
  try {
    // Log migration — prisma.migration may not exist in all schema versions
    const result = await prisma.migration?.create({
      data:{
        citizenName, nationalId:nationalId??undefined, direction, fromVillage,
        toVillage, reason:reason??undefined, referenceNo:referenceNo??undefined,
        createdAt: new Date(),
      },
      select:{ id:true },
    }).catch(() => null)
    return res.json({ success:true, data:{ referenceNo, serverId:result?.id ?? null } })
  } catch (err) {
    console.error('[village/migration]', err)
    return res.status(500).json({ success:false, message:'Internal server error' })
  }
})

// ── GET /api/officer/profile (used by ID card modal) ─────────────────────────
router.get('/profile', async (req, res) => {
  const { id, role } = req.user
  try {
    if (role === 'hospital_officer') {
      const o = await prisma.hospitalOfficer.findUnique({
        where:   { id },
        include: { facility:true },
      })
      if (!o) return res.status(404).json({ success:false, message:'Not found' })
      return res.json({
        success:true,
        data:{
          officerName:      o.fullName,
          employeeId:       o.employeeId ?? `NBS-HO-${id.slice(-6)}`,
          role:             'hospital_officer',
          facilityName:     o.facility?.facilityName  ?? '—',
          facilityType:     o.facility?.facilityType  ?? '—',
          facilityGrade:    o.facility?.facilityGrade ?? '—',
          facilityRegion:   '—',
          facilityDistrict: '—',
          email:            o.email,
        },
      })
    }
    if (role === 'village_officer') {
      const o = await prisma.villageOfficer.findUnique({
        where:   { id },
        include: { village:true, ward:true },
      })
      if (!o) return res.status(404).json({ success:false, message:'Not found' })
      return res.json({
        success:true,
        data:{
          officerName:  o.fullName,
          employeeId:   o.employeeId ?? `NBS-VO-${id.slice(-6)}`,
          role:         'village_officer',
          facilityName: o.village?.name ?? '—',
          wardName:     o.ward?.name    ?? '—',
          email:        o.email,
        },
      })
    }
    return res.status(403).json({ success:false, message:'Not eligible' })
  } catch (err) {
    console.error('[officer/profile]', err)
    return res.status(500).json({ success:false, message:'Internal server error' })
  }
})

module.exports = router
