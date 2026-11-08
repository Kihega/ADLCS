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

  // ── NIN: local registry, then NIDA ─────────────────────────────────────────
  const local = await prisma.citizen.findFirst({
    where: { OR: [{ nationalId: ident.value }, { nationalId: String(raw).trim() }] },
    select: CITIZEN_SELECT,
  })
  if (local) return { found: true, idType: 'NIN', person: shapeCitizen(local) }

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
  return {
    found: false,
    idType: 'NIN',
    nidaAvailable: ext.available,
    code: ext.available ? 'NIN_NOT_FOUND' : (ext.reason || 'NIDA_NOT_CONFIGURED'),
    message: ext.available
      ? 'NIN not found at NIDA.'
      : 'This citizen has no Birth ID in the system and NIDA is not connected yet, so the NIN cannot be verified. Use the Birth ID.',
  }
}

/**
 * Village-scoped strict lookup (migration tracking, citizen profile): the
 * citizen must already be registered in `villageId`. BID or NIN only.
 */
async function lookupResidentInVillage(raw, villageId, select) {
  const ident = classifyIdentifier(raw)
  if (!ident.type) return { found: false, code: 'INVALID_ID', message: INVALID_ID_MESSAGE }
  const where = ident.type === 'BID'
    ? { birthId: ident.value, currentVillageId: villageId }
    : { OR: [{ nationalId: ident.value }, { nationalId: String(raw).trim() }], currentVillageId: villageId }
  const citizen = await prisma.citizen.findFirst({ where, select })
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
  resolveDeceasedRef,
  INVALID_ID_MESSAGE,
}
