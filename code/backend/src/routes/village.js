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

    const dayStart   = new Date(); dayStart.setHours(0,0,0,0)
    const dayEnd     = new Date(); dayEnd.setHours(23,59,59,999)

    const [totalCitizens, monthDeaths, todayDeaths, todayCitizens, pendingCases] = await Promise.all([
      prisma.citizen.count({ where:{ currentVillageId:vid } }),
      prisma.death.count({ where:{ villageOfficerId:id, registeredAt:{ gte:monthStart } } }).catch(()=>0),
      prisma.death.count({ where:{ villageOfficerId:id, registeredAt:{ gte:dayStart, lte:dayEnd } } }).catch(()=>0),
      prisma.citizen.count({ where:{ registeredById:id, registeredAt:{ gte:dayStart, lte:dayEnd } } }).catch(()=>0),
      prisma.citizen.count({ where:{ currentVillageId:vid, vitalStatus:'alive', idCardIssued:null } }).catch(()=>0),
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

// ── POST /api/village/building ────────────────────────────────────────────────
router.post('/building', async (req, res) => {
  const { id:officerId } = req.user
  const { name, buildingType, floors, yearBuilt, material, condition,
          occupants, ownerName, ownerNid, notes, referenceNo } = req.body
  if (!name) return res.status(400).json({ success:false, message:'Building name required' })
  try {
    const officer = await prisma.villageOfficer.findUnique({ where:{ id:officerId }, select:{ villageId:true } })
    const bldgTypeMap = {
      residential:'residential', business:'business', hotel:'hotel',
      hospital:'hospital', school:'school', college:'college',
      university:'university', industry:'industry', government:'government',
      police:'police', military:'military', training:'training', other:'other',
    }
    const bldgId = (referenceNo ?? `BLDG-${Date.now()}`).slice(0, 20)
    const record = await prisma.building.create({
      data:{
        id:            bldgId,
        buildingType:  bldgTypeMap[(buildingType ?? '').toLowerCase()] ?? 'other',
        streetLocation: name ?? 'Unknown',
        villageId:     officer?.villageId ?? 1,
        owners:        [{ name: ownerName ?? 'Unknown', nid: ownerNid ?? null, floors: floors ?? 1 }],
        ownershipType: 'private',
        registeredById: officerId,
      },
      select:{ id:true },
    })
    return res.json({ success:true, data:{ referenceNo:bldgId, serverId:record.id } })
  } catch (err) {
    if (err.code === 'P2002') return res.json({ success:true, duplicate:true })
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
    const officer = await prisma.villageOfficer.findUnique({ where:{ id:officerId }, select:{ villageId:true } })
    // InfraType enum: road | railway | station | port | bus_stand
    const infraMap = {
      road:'road', railway:'railway', station:'station', port:'port', bus_stand:'bus_stand',
      school:'road', hospital:'road', water:'road', electricity:'road', other:'road',
    }
    const record = await prisma.publicInfrastructure.create({
      data:{
        infraType:     infraMap[(infraType ?? '').toLowerCase()] ?? 'road',
        name:          name.trim(),
        villageId:     officer?.villageId ?? 1,
        registeredById: officerId,
      },
      select:{ id:true },
    })
    return res.json({ success:true, data:{ referenceNo: referenceNo ?? `INFRA-${record.id}`, serverId:record.id } })
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
    const officer  = await prisma.villageOfficer.findUnique({ where:{ id:officerId }, select:{ villageId:true } })
    const citizen  = nationalId ? await prisma.citizen.findFirst({ where:{ nationalId }, select:{ id:true } }) : null

    if (!citizen) {
      return res.status(422).json({ success:false, message:'Citizen not found. Register the citizen first using their National ID, then record their migration.' })
    }

    const fromVid  = officer?.villageId ?? 1
    let   toVid    = fromVid
    if (toVillage) {
      const dest = await prisma.village.findFirst({ where:{ name:{ contains:toVillage, mode:'insensitive' } }, select:{ id:true } }).catch(()=>null)
      if (dest) toVid = dest.id
    }

    const expiry   = new Date(); expiry.setDate(expiry.getDate() + 30)
    const record   = await prisma.migration.create({
      data:{
        citizenId:       citizen.id,
        fromVillageId:   fromVid,
        toVillageId:     toVid,
        reason:          reason ?? 'Voluntary relocation',
        expiryDate:      expiry,
        sourceOfficerId: officerId,
      },
      select:{ id:true },
    })
    return res.json({ success:true, data:{ referenceNo: referenceNo ?? `MIG-${record.id}`, serverId:record.id } })
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
