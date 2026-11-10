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
async function lookupIdentity(raw) {
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
async function findBirthResidentInVillage(birthId, villageId) {
  if (!birthId || villageId == null || villageId < 0) return null
  const birth = await prisma.birth.findFirst({
    where: { birthId, originVillageId: villageId, childCitizenId: null },
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
async function lookupResidentInVillage(raw, villageId, select) {
  const ident = classifyIdentifier(raw)
  if (!ident.type) return { found: false, code: 'INVALID_ID', message: INVALID_ID_MESSAGE }
  if (ident.type === 'NIN' && !nida.isConfigured()) {
    return { found: false, idType: 'NIN', code: 'NIDA_NOT_CONFIGURED', message: NIDA_NOT_LINKED_MESSAGE }
  }
  const where = ident.type === 'BID'
    ? { birthId: ident.value, currentVillageId: villageId }
    : { OR: [{ nationalId: ident.value }, { nationalId: String(raw).trim() }], currentVillageId: villageId }
  const citizen = await prisma.citizen.findFirst({ where, select })
  // PATCH-V2-2026-11: newborn registered at the hospital (Birth row only)
  if (!citizen && ident.type === 'BID') {
    const fromBirth = await findBirthResidentInVillage(ident.value, villageId)
    if (fromBirth) return { found: true, idType: 'BID', source: 'birth', citizen: fromBirth }
  }
  if (!citizen) {
    return {
      found: false,
      idType: ident.type,
      code: 'NOT_IN_VILLAGE',
      message: 'No citizen with this Birth ID / NIN is registered in your village.',
    }
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

module.exports = {
  lookupIdentity,
  lookupResidentInVillage,
  findBirthResidentInVillage,
  materializeCitizenFromBirth,
  resolveDeceasedRef,
  INVALID_ID_MESSAGE,
}
