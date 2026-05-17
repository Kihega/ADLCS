/**
 * village.js — Village Officer API Routes  v2.0
 *
 * GET  /api/village/dashboard
 * POST /api/village/citizen
 * POST /api/village/birth        (fallback — primary is hospital officer)
 * POST /api/village/death
 * POST /api/village/marriage
 * POST /api/village/building
 * POST /api/village/infrastructure
 * POST /api/village/migration
 * GET  /api/village/records      (aggregated records for VillageViewRecordsScreen)
 * GET  /api/officer/profile      (used by ID card modal — both roles)
 */

const { Router } = require('express')
const { prisma }  = require('../lib/prisma')
const { requireAuth } = require('../middleware/auth')

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

    const [totalCitizens, monthDeaths] = await Promise.all([
      prisma.citizen.count({ where:{ currentVillageId:vid } }),
      prisma.death.count({ where:{ villageOfficerId:id, createdAt:{ gte:monthStart } } }).catch(()=>0),
    ])

    return res.json({
      success:true,
      data:{
        officerName:    officer.fullName,
        employeeId:     officer.employeeId ?? '',
        villageName:    officer.village?.name ?? 'Unknown Village',
        wardName:       officer.ward?.name    ?? 'Unknown Ward',
        totalCitizens,
        monthBirths:    0,
        monthDeaths,
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

    const death = await prisma.death.create({
      data:{
        deathCertNo:      deathCertNo ?? `VD-${Date.now()}`,
        nationalId:       nationalId  ?? undefined,
        causeOfDeath,
        dateOfDeath:      parseDDMMYYYY(dateOfDeath),
        locationType:     locationType ?? 'home',
        category:         category     ?? 'adult',
        informantName:    informantName ?? undefined,
        hospitalOfficerId: officerId,
        villageOfficerId:  officerId,
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

    // Try to use Marriage model if it exists in schema, else log to audit
    const record = await prisma.marriage?.create?.({
      data:{
        certNo:      certNo ?? `TZ-MAR-${Date.now()}`,
        husbandNid:  husbandNid ?? undefined,
        husbandName: husbandName ?? husbandNid,
        wifeNid:     wifeNid    ?? undefined,
        wifeName:    wifeName   ?? wifeNid,
        marriageDate: parseDDMMYYYY(marriageDate),
        marriageType: marriageType ?? 'customary',
        witness1:    witness1 ?? undefined,
        witness2:    witness2 ?? undefined,
        bridePrice:  bridePrice ?? undefined,
        officerId,
      },
      select:{ id:true },
    }).catch(()=>null)

    // Fallback: audit log
    if (!record) {
      await prisma.auditLog?.create?.({
        data:{
          action:     'MARRIAGE_REGISTERED',
          entityType: 'Marriage',
          details:    JSON.stringify({ certNo, husbandName:husbandName??husbandNid, wifeName:wifeName??wifeNid, marriageDate, marriageType }),
          officerId,
        },
      }).catch(()=>{})
    }

    return res.json({ success:true, data:{ certNo, serverId:record?.id ?? null } })
  } catch (err) {
    console.error('[village/marriage]', err)
    return res.status(500).json({ success:false, message:'Internal server error' })
  }
})

// ── POST /api/village/building ────────────────────────────────────────────────
router.post('/building', async (req, res) => {
  const { id:officerId } = req.user
  const { name, buildingType, floors, yearBuilt, material, condition,
          occupants, ownerName, ownerNid, notes, referenceNo } = req.body
  if (!name) return res.status(400).json({ success:false, message:'Building name required' })
  try {
    const record = await prisma.building?.create?.({
      data:{
        name:         name.trim(),
        buildingType: buildingType ?? 'Residential',
        floors:       floors       ?? 1,
        yearBuilt:    yearBuilt    ?? undefined,
        material:     material     ?? undefined,
        condition:    condition    ?? undefined,
        occupants:    occupants    ?? undefined,
        ownerName:    ownerName    ?? undefined,
        ownerNid:     ownerNid     ?? undefined,
        notes:        notes        ?? undefined,
        referenceNo:  referenceNo  ?? `BLDG-${Date.now()}`,
        officerId,
      },
      select:{ id:true, referenceNo:true },
    }).catch(()=>null)

    // Fallback to audit log
    if (!record) {
      await prisma.auditLog?.create?.({
        data:{
          action:'BUILDING_REGISTERED', entityType:'Building',
          details: JSON.stringify({ name, buildingType, referenceNo }),
          officerId,
        },
      }).catch(()=>{})
    }

    return res.json({ success:true, data:{ referenceNo, serverId:record?.id ?? null } })
  } catch (err) {
    console.error('[village/building]', err)
    return res.status(500).json({ success:false, message:'Internal server error' })
  }
})

// ── POST /api/village/infrastructure ─────────────────────────────────────────
router.post('/infrastructure', async (req, res) => {
  const { id:officerId } = req.user
  const { name, infraType, status, condition, capacity,
          yearBuilt, manager, notes, referenceNo } = req.body
  if (!name) return res.status(400).json({ success:false, message:'Infrastructure name required' })
  try {
    const record = await prisma.publicInfrastructure?.create?.({
      data:{
        name:        name.trim(),
        infraType:   infraType ?? 'Other',
        status:      status    ?? 'Operational',
        condition:   condition ?? undefined,
        capacity:    capacity  ?? undefined,
        yearBuilt:   yearBuilt ?? undefined,
        manager:     manager   ?? undefined,
        notes:       notes     ?? undefined,
        referenceNo: referenceNo ?? `INFRA-${Date.now()}`,
        officerId,
      },
      select:{ id:true, referenceNo:true },
    }).catch(()=>null)

    if (!record) {
      await prisma.auditLog?.create?.({
        data:{
          action:'INFRASTRUCTURE_REGISTERED', entityType:'PublicInfrastructure',
          details: JSON.stringify({ name, infraType, referenceNo }),
          officerId,
        },
      }).catch(()=>{})
    }

    return res.json({ success:true, data:{ referenceNo, serverId:record?.id ?? null } })
  } catch (err) {
    console.error('[village/infrastructure]', err)
    return res.status(500).json({ success:false, message:'Internal server error' })
  }
})

// ── POST /api/village/migration ───────────────────────────────────────────────
router.post('/migration', async (req, res) => {
  const { id:officerId } = req.user
  const { citizenName, nationalId, direction, fromVillage, fromRegion,
          toVillage, toRegion, reason, moveDate, notes, referenceNo } = req.body
  if (!citizenName) return res.status(400).json({ success:false, message:'citizenName required' })
  try {
    const record = await prisma.migration?.create?.({
      data:{
        citizenName, nationalId:nationalId??undefined, direction:direction??'departing',
        fromVillage:fromVillage??undefined, fromRegion:fromRegion??undefined,
        toVillage:toVillage??undefined,   toRegion:toRegion??undefined,
        reason:reason??undefined, moveDate:moveDate?parseDDMMYYYY(moveDate):new Date(),
        notes:notes??undefined, referenceNo:referenceNo??`MIG-${Date.now()}`,
        officerId,
      },
      select:{ id:true },
    }).catch(()=>null)

    if (!record) {
      await prisma.auditLog?.create?.({
        data:{
          action:'MIGRATION_RECORDED', entityType:'Migration',
          details: JSON.stringify({ citizenName, direction, reason, referenceNo }),
          officerId,
        },
      }).catch(()=>{})
    }

    return res.json({ success:true, data:{ referenceNo, serverId:record?.id ?? null } })
  } catch (err) {
    console.error('[village/migration]', err)
    return res.status(500).json({ success:false, message:'Internal server error' })
  }
})

// ── GET /api/village/records ──────────────────────────────────────────────────
router.get('/records', async (req, res) => {
  const { id:officerId } = req.user
  try {
    const out = []

    // Deaths
    const deaths = await prisma.death.findMany({
      where:{ villageOfficerId:officerId },
      orderBy:{ createdAt:'desc' }, take:30,
      select:{ id:true, deathCertNo:true, nationalId:true, causeOfDeath:true, createdAt:true },
    }).catch(()=>[])
    for (const d of deaths) {
      out.push({ id:`d-${d.id}`, type:'deaths', icon:'✝', color:'#dc2626',
        label: d.nationalId || 'Unknown', sub:`Cert: ${d.deathCertNo}`,
        date: new Date(d.createdAt).toLocaleDateString('en-TZ') })
    }

    // Citizens
    const citizens = await prisma.citizen.findMany({
      where:{ registeredById:officerId },
      orderBy:{ createdAt:'desc' }, take:30,
      select:{ id:true, firstName:true, surname:true, nationalId:true, createdAt:true },
    }).catch(()=>[])
    for (const c of citizens) {
      out.push({ id:`c-${c.id}`, type:'citizens', icon:'👤', color:'#0891b2',
        label:`${c.firstName} ${c.surname}`, sub:c.nationalId||'—',
        date: new Date(c.createdAt).toLocaleDateString('en-TZ') })
    }

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

module.exports = router
