/**
 * identityLookup.js — the ONE strict way to fetch a person for the officer apps.
 *
 * Used by birth registration (parents), death recording and migration
 * tracking. A person can only be fetched by:
 *
 *   1. Birth ID (BID)  — the main identifier, resolved from the NBS database
 *   2. NIN             — resolved from the local registry first, then from the
 *                        external NIDA database (see nidaClient.js)
 *
 * Searching by name (full or partial) is deliberately NOT possible, so an
 * officer cannot "find" or invent a person by typing a name and register a
 * false certificate for them.
 */
const { prisma } = require('./prisma')
const { classifyIdentifier } = require('./parentIdentifier')
const { findPersonByBid, calcAge, buildGeo, VILLAGE_GEO_SELECT } = require('./personLookup')
const nida = require('./nidaClient')

const CITIZEN_SELECT = {
  id: true, birthId: true, nationalId: true, firstName: true, middleName: true,
  surname: true, gender: true, dateOfBirth: true, vitalStatus: true, age: true,
  currentVillageId: true,
  currentVillage: { select: VILLAGE_GEO_SELECT },
}

const NIDA_NOT_LINKED_MESSAGE = 'NIDA NOT LINKED YET, USE BIRTH ID INSTEAD'

const INVALID_ID_MESSAGE =
  'Enter a valid Birth ID (BID-XXXXXXXXXX) or a 20-digit NIN. Searching by name is not allowed.'

function fullName(p) {
  return [p.firstName, p.middleName, p.surname].filter(Boolean).join(' ')
}

function shapeCitizen(citizen) {
  return {
    ...citizen,
    age: citizen.age ?? calcAge(citizen.dateOfBirth),
    ...buildGeo(citizen.currentVillage),
    fullName: fullName(citizen),
    source: 'citizen',
  }
}

/**
 * @param {string} raw  what the officer typed (BID or NIN)
 * @returns {Promise<{found:boolean, person?:object, idType?:'BID'|'NIN'|null,
 *                    code?:string, message?:string, nidaAvailable?:boolean}>}
 */
async function _lookupIdentity(raw) {
  const ident = classifyIdentifier(raw)
  if (!ident.type) {
    return { found: false, idType: null, code: 'INVALID_ID', message: INVALID_ID_MESSAGE }
  }

  // ── BID: main way ─────────────────────────────────────────────────────────
  if (ident.type === 'BID') {
    const person = await findPersonByBid(ident.value)
    if (person) {
      return { found: true, idType: 'BID', person: { ...person, fullName: fullName(person) } }
    }
    return { found: false, idType: 'BID', code: 'BID_NOT_FOUND', message: 'Birth ID not found in the NBS Central Database.' }
  }

  // ── NIN (starts with digits, like 20020505514250000124) ────────────────────
  // A NIN is verified at the external NIDA database. Until the NIDA link is
  // configured (NIDA_API_URL) the officer is told to use the Birth ID.
  if (!nida.isConfigured()) {
    return { found: false, idType: 'NIN', nidaAvailable: false, code: 'NIDA_NOT_CONFIGURED', message: NIDA_NOT_LINKED_MESSAGE }
  }
  const ext = await nida.lookupByNin(ident.value)
  if (ext.available && ext.found) {
    const p = ext.person
    return {
      found: true,
      idType: 'NIN',
      person: {
        id: null,
        birthId: null,
        nationalId: ident.value,
        firstName: p.firstName,
        middleName: p.middleName ?? '',
        surname: p.surname,
        gender: p.gender,
        dateOfBirth: p.dateOfBirth,
        age: calcAge(p.dateOfBirth),
        vitalStatus: 'alive',
        ...buildGeo(null),
        fullName: fullName(p),
        source: 'nida',
        nidaVerified: true,
      },
    }
  }
  if (!ext.available) {
    const local = await prisma.citizen.findFirst({
      where: { OR: [{ nationalId: ident.value }, { nationalId: String(raw).trim() }] },
      select: CITIZEN_SELECT,
    })
    if (local) return { found: true, idType: 'NIN', person: shapeCitizen(local) }
  }
  return {
    found: false,
    idType: 'NIN',
    nidaAvailable: ext.available,
    code: ext.available ? 'NIN_NOT_FOUND' : (ext.reason || 'NIDA_NOT_CONFIGURED'),
    message: ext.available
      ? 'NIN not found at NIDA.'
      : NIDA_NOT_LINKED_MESSAGE,
  }
}

// -- PATCH-V2-2026-11 ---------------------------------------------------------
// A birth registered at the hospital only creates a `Birth` row (the Citizen row
// is created later). So that a village officer can find the child by Birth ID
// straight away - but ONLY when the child's origin village/street is the
// officer's own village - the village lookup falls back to the Birth table.
// PATCH-VILLAGE-SCOPE-2026 ---------------------------------------------------
// The village/street chosen at birth (or citizen) registration is always linked to
// a ward. A village officer must be able to see people of HIS area even when the
// hospital picked a sibling village/street row, so the profile lookup matches by
// WARD by default. Set VILLAGE_LOOKUP_SCOPE=village in .env for strict matching.
const SCOPE_LEVEL = String(process.env.VILLAGE_LOOKUP_SCOPE || 'ward').toLowerCase()
async function getScope(villageId) {
  if (villageId == null || villageId < 0) return null
  return prisma.village.findUnique({ where: { id: villageId }, select: { id: true, name: true, wardId: true } })
}
function citizenScopeWhere(scope) {
  return SCOPE_LEVEL === 'village' ? { currentVillageId: scope.id } : { currentVillage: { wardId: scope.wardId } }
}
function birthScopeWhere(scope) {
  return SCOPE_LEVEL === 'village' ? { originVillageId: scope.id } : { originVillage: { wardId: scope.wardId } }
}

// Explains WHY a BID / NIN was not found in the officer's area.
async function explainMissing(ident, raw) {
  const geoSel = { currentVillage: { select: VILLAGE_GEO_SELECT } }
  let known = false
  let village = null
  try {
    let c = null
    if (ident.type === 'BID') {
      c = await prisma.citizen.findFirst({ where: { birthId: ident.value }, select: geoSel })
      if (!c) {
        const b = await prisma.birth.findFirst({
          where: { birthId: ident.value },
          select: { originVillage: { select: VILLAGE_GEO_SELECT } },
        })
        if (b) { known = true; village = b.originVillage }
      }
    } else {
      c = await prisma.citizen.findFirst({
        where: { OR: [{ nationalId: ident.value }, { nationalId: String(raw).trim() }] },
        select: geoSel,
      })
    }
    if (c) { known = true; village = c.currentVillage }
  } catch (e) {
    console.warn('[explainMissing]', e && e.message)
  }
  if (!known) {
    return { code: 'NOT_FOUND', message: 'No citizen with this Birth ID / NIN was found in the NBS database. Check the number and try again.' }
  }
  if (!village) {
    return {
      code: 'NO_VILLAGE_ON_RECORD',
      message: 'This Birth ID / NIN is registered, but no village or street was recorded for it, so it cannot be linked to your area. Ask the registering officer to record the village / street.',
    }
  }
  const g = buildGeo(village)
  const area = SCOPE_LEVEL === 'village' ? 'village' : 'ward'
  return {
    code: 'OUTSIDE_YOUR_AREA',
    message: `This citizen is registered in ${g.village} (${g.ward} ward, ${g.district}, ${g.region}), not in your ${area}. Use Migrate Citizen if they have moved to your area.`,
  }
}

async function findBirthResidentInVillage(birthId, villageId, opts = {}) {
  if (!birthId || villageId == null || villageId < 0) return null
  const scope = opts.wide ? await getScope(villageId) : null
  const birth = await prisma.birth.findFirst({
    where: { birthId, childCitizenId: null, ...(scope ? birthScopeWhere(scope) : { originVillageId: villageId }) },
    select: {
      id: true, birthId: true, childFirstName: true, childMiddleName: true,
      childSurname: true, gender: true, dateOfBirth: true, registeredAt: true,
      originVillageId: true,
      originVillage: { select: VILLAGE_GEO_SELECT },
    },
  })
  if (!birth) return null
  // If a Citizen row already carries this BID it is the authority (it may have
  // migrated to another village) - never fall back to the birth in that case.
  const clash = await prisma.citizen.findFirst({ where: { birthId }, select: { id: true } })
  if (clash) return null
  const died = await prisma.death.findFirst({ where: { nationalId: birth.birthId }, select: { id: true } })
  return {
    id: null,
    birthId: birth.birthId,
    nationalId: null,
    firstName: birth.childFirstName,
    middleName: birth.childMiddleName || '',
    surname: birth.childSurname,
    gender: birth.gender,
    dateOfBirth: birth.dateOfBirth,
    age: calcAge(birth.dateOfBirth) ?? 0,
    vitalStatus: died ? 'deceased' : 'alive',
    maritalStatus: 'single',
    photoUrl: null,
    idCardIssued: null,
    idCardExpires: null,
    streetName: null,
    houseRegNumber: null,
    educationLevel: 'none',
    registeredAt: birth.registeredAt,
    currentVillageId: birth.originVillageId,
    currentVillage: birth.originVillage,
    source: 'birth',
  }
}

// Migration needs a real Citizen row. Create it on demand from the birth record
// (only for a birth whose origin village is `villageId`) and link the two.
async function materializeCitizenFromBirth(birthId, villageId) {
  const bid = String(birthId || '').trim().toUpperCase()
  const resident = await findBirthResidentInVillage(bid, villageId)
  if (!resident || resident.vitalStatus === 'deceased') return null
  const birth = await prisma.birth.findFirst({
    where: { birthId: bid },
    select: { id: true, fatherCitizenId: true, motherCitizenId: true },
  })
  if (!birth) return null
  try {
    return await prisma.$transaction(async (tx) => {
      const c = await tx.citizen.create({
        data: {
          birthId: bid,
          firstName: resident.firstName,
          middleName: resident.middleName,
          surname: resident.surname,
          gender: resident.gender,
          dateOfBirth: resident.dateOfBirth,
          age: resident.age,
          vitalStatus: 'alive',
          currentVillageId: villageId,
          fatherCitizenId: birth.fatherCitizenId || undefined,
          motherCitizenId: birth.motherCitizenId || undefined,
          registeredAt: resident.registeredAt,
        },
        select: { id: true, currentVillageId: true },
      })
      await tx.birth.update({ where: { id: birth.id }, data: { childCitizenId: c.id } })
      return c
    })
  } catch (err) {
    if (err && err.code === 'P2002') {
      // created concurrently - use the existing row (still village-scoped)
      return prisma.citizen.findFirst({
        where: { birthId: bid, currentVillageId: villageId },
        select: { id: true, currentVillageId: true },
      })
    }
    throw err
  }
}

/**
 * Village-scoped strict lookup (migration tracking, citizen profile): the
 * citizen must already be registered in `villageId`. BID or NIN only.
 */
async function lookupResidentInVillage(raw, villageId, select, opts = {}) {
  const ident = classifyIdentifier(raw)
  if (!ident.type) return { found: false, code: 'INVALID_ID', message: INVALID_ID_MESSAGE }
  if (ident.type === 'NIN' && !nida.isConfigured()) {
    return { found: false, idType: 'NIN', code: 'NIDA_NOT_CONFIGURED', message: NIDA_NOT_LINKED_MESSAGE }
  }
  // opts.wide = match the officer's whole area (ward) instead of one exact village row
  const wide = !!opts.wide
  const scope = wide ? await getScope(villageId) : null
  const place = scope ? citizenScopeWhere(scope) : { currentVillageId: villageId }
  const idWhere = ident.type === 'BID'
    ? { birthId: ident.value }
    : { OR: [{ nationalId: ident.value }, { nationalId: String(raw).trim() }] }
  // PATCH-C-2026-11: always load what is needed to decide alive / deceased.
  const citizen = await prisma.citizen.findFirst({
    where: { ...idWhere, ...place },
    select: { ...select, id: true, birthId: true, nationalId: true, vitalStatus: true },
  })
  // A death on the death register always wins over a stale "alive" flag.
  if (citizen && String(citizen.vitalStatus || '').toLowerCase() !== 'deceased') {
    const dead = await findDeathRecord({ citizenId: citizen.id, birthId: citizen.birthId, nationalId: citizen.nationalId })
    if (dead) citizen.vitalStatus = 'deceased'
  }
  // PATCH-V2-2026-11: newborn registered at the hospital (Birth row only)
  if (!citizen && ident.type === 'BID') {
    const fromBirth = await findBirthResidentInVillage(ident.value, villageId, { wide })
    if (fromBirth) return { found: true, idType: 'BID', source: 'birth', citizen: fromBirth }
  }
  if (!citizen) {
    const why = await explainMissing(ident, raw)
    return { found: false, idType: ident.type, code: why.code, message: why.message }
  }
  return { found: true, idType: ident.type, citizen }
}

/**
 * Server-side proof of who the deceased is. The death endpoints no longer
 * trust whatever id/name the client sends: the id must resolve to a real
 * person (local registry, birth record, or NIDA).
 *
 * Infant deaths recorded at the hospital use the parent-linked reference
 * "INFANT-<parent id>" (the child never had its own id) — only accepted when
 * category === 'infant'.
 */
async function resolveDeceasedRef(raw, { category, citizenId } = {}) {
  const value = typeof raw === 'string' ? raw.trim().toUpperCase() : ''

  if (!value && citizenId) {
    const c = await prisma.citizen.findUnique({ where: { id: citizenId }, select: CITIZEN_SELECT })
    if (!c) return { ok: false, status: 422, message: 'Deceased citizen not found.' }
    return finishDeceased({ ...c, source: 'citizen' })
  }
  if (!value) {
    return { ok: false, status: 400, message: 'The deceased must be identified by Birth ID or NIN.' }
  }
  if (category === 'infant' && value.startsWith('INFANT-')) {
    return { ok: true, citizenId: undefined, nationalId: value }
  }
  const r = await lookupIdentity(value)
  if (!r.found) return { ok: false, status: 422, message: r.message }
  return finishDeceased(r.person)
}

function finishDeceased(person) {
  if (String(person.vitalStatus || '').toLowerCase() === 'deceased') {
    return { ok: false, status: 409, message: 'This person is already recorded as deceased.' }
  }
  return {
    ok: true,
    citizenId: person.source === 'citizen' ? person.id : undefined,
    nationalId: person.nationalId || person.birthId || undefined,
    person,
  }
}

// -- PATCH-V3-2026-11 --------------------------------------------------------
// For record lists: the deceased's real name and Birth ID for a batch of deaths
// (`deaths` = [{ id, citizenId, nationalId }]). Returns Map(deathId -> {name, birthId}).
async function resolveDeceasedDisplay(deaths) {
  const out = new Map()
  const rows = Array.isArray(deaths) ? deaths : []
  if (!rows.length) return out
  const up = (v) => String(v || '').trim().toUpperCase()
  const citizenIds = [...new Set(rows.map((d) => d.citizenId).filter(Boolean))]
  const bids = [...new Set(rows.map((d) => up(d.nationalId)).filter((v) => v.startsWith('BID-')))]
  const nins = [...new Set(rows.map((d) => String(d.nationalId || '').trim())
    .filter((v) => v && !/^(BID-|INFANT-)/i.test(v)))]
  const or = []
  if (citizenIds.length) or.push({ id: { in: citizenIds } })
  if (bids.length) or.push({ birthId: { in: bids } })
  if (nins.length) or.push({ nationalId: { in: nins } })
  const [citizens, births] = await Promise.all([
    or.length
      ? prisma.citizen.findMany({
          where: { OR: or },
          select: { id: true, birthId: true, nationalId: true, firstName: true, middleName: true, surname: true, gender: true },
        })
      : [],
    bids.length
      ? prisma.birth.findMany({
          where: { birthId: { in: bids } },
          select: { birthId: true, childFirstName: true, childMiddleName: true, childSurname: true, gender: true },
        })
      : [],
  ])
  const byId = new Map(citizens.map((c) => [c.id, c]))
  const byBid = new Map(citizens.filter((c) => c.birthId).map((c) => [c.birthId, c]))
  const byNin = new Map(citizens.filter((c) => c.nationalId).map((c) => [c.nationalId, c]))
  const birthByBid = new Map(births.map((b) => [b.birthId, b]))
  const join = (...p) => p.filter(Boolean).join(' ')
  for (const d of rows) {
    const nid = up(d.nationalId)
    const c = (d.citizenId && byId.get(d.citizenId)) || byBid.get(nid) || byNin.get(String(d.nationalId || '').trim())
    const b = birthByBid.get(nid)
    const name = c ? join(c.firstName, c.middleName, c.surname)
      : b ? join(b.childFirstName, b.childMiddleName, b.childSurname) : null
    out.set(d.id, { name, birthId: c?.birthId || (nid.startsWith('BID-') ? nid : null), gender: c?.gender ?? b?.gender ?? null })
  }
  return out
}

// -- PATCH-C-2026-11 ----------------------------------------------------------
// Is there a death on the register for this person? (by citizen id, Birth ID or NIN)
async function findDeathRecord({ citizenId, birthId, nationalId } = {}) {
  const ids = [birthId, nationalId].filter(Boolean).map((v) => String(v).trim().toUpperCase())
  const or = []
  if (citizenId) or.push({ citizenId })
  if (ids.length) or.push({ nationalId: { in: ids } })
  if (!or.length) return null
  return prisma.death.findFirst({ where: { OR: or }, select: { id: true, dateOfDeath: true } })
}

// Public lookup (hospital apps, death recording): same as before, but a person with
// a death on the register is reported as `deceased` (+ deathRecordId / dateOfDeath).
async function lookupIdentity(raw) {
  const r = await _lookupIdentity(raw)
  if (r.found && r.person && r.person.source !== 'nida') {
    const p = r.person
    const dead = await findDeathRecord({
      citizenId: p.source === 'citizen' ? p.id : null,
      birthId: p.birthId,
      nationalId: p.nationalId,
    })
    if (dead) {
      p.vitalStatus = 'deceased'
      p.deathRecordId = dead.id
      p.dateOfDeath = dead.dateOfDeath
    }
  }
  return r
}

module.exports = {
  findDeathRecord,
  getScope,
  citizenScopeWhere,
  birthScopeWhere,
  lookupIdentity,
  resolveDeceasedDisplay,
  lookupResidentInVillage,
  findBirthResidentInVillage,
  materializeCitizenFromBirth,
  resolveDeceasedRef,
  INVALID_ID_MESSAGE,
}
