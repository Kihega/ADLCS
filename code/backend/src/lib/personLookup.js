/**
 * personLookup.js — shared Birth-ID (BID) person lookup   v2.0 (PATCH-BID-GEO-2026)
 *
 * PATCH-BID-UNIVERSAL-2026:
 * A BID is generated the moment a Hospital Officer registers a birth, but a
 * Citizen row (and NIN) is only created later — at age 18 — when a Village
 * Officer runs the NIN-issuance workflow (see POST /api/village/nin-issue).
 *
 * Several screens search "by BID" for an already-registered person (a
 * father/mother during another birth registration, a person being enrolled
 * as an officer, etc.) by querying only the `citizen` table. That means a
 * BID generated minutes ago — or belonging to anyone who hasn't turned 18
 * yet — could never be found anywhere, even though the BID is meant to be
 * the system's core identifier and usable immediately, everywhere.
 *
 * findPersonByBid() searches Citizen first (people who already have a NIN),
 * then falls back to the Birth table (BID exists, NIN not issued yet) and
 * maps the birth record into the same shape, with nationalId left null.
 *
 * PATCH-BID-GEO-2026: every lookup also resolves the person's geographic
 * hierarchy (village -> ward -> district -> region) and a live age
 * computed from date of birth, so any screen that looks someone up by BID
 * gets the full picture — even if that screen only chooses to *display* a
 * subset of it. For an already-registered Citizen this comes from
 * currentVillage; for a child who only has a Birth record (no NIN issued
 * yet) it comes from the birth's originVillage — the family's home area
 * captured at birth registration, independent of which region the
 * hospital/facility itself is in.
 */
const { prisma } = require('./prisma')

// Nested village -> ward -> district -> region select, reused by every
// BID-lookup consumer in the system so the shape is always identical.
const VILLAGE_GEO_SELECT = {
  name: true,
  ward: {
    select: {
      name: true,
      district: {
        select: {
          name: true,
          region: { select: { name: true } },
        },
      },
    },
  },
}

const CITIZEN_SELECT = {
  id: true, birthId: true, nationalId: true, firstName: true, middleName: true,
  surname: true, gender: true, dateOfBirth: true, vitalStatus: true, age: true,
  currentVillage: { select: VILLAGE_GEO_SELECT },
}

/** Live age in whole years from a date of birth, or null if unknown. */
function calcAge(dob) {
  if (!dob) return null
  const d = new Date(dob)
  if (Number.isNaN(d.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - d.getFullYear()
  const mo = now.getMonth() - d.getMonth()
  if (mo < 0 || (mo === 0 && now.getDate() < d.getDate())) age--
  return age
}

/**
 * Flattens a `{ name, ward: { name, district: { name, region: { name } } } }`
 * village record into both the original nested shape (`currentVillage`, for
 * callers that already expect it) and convenience flat strings
 * (`village`/`ward`/`district`/`region`) that any screen can drop straight
 * into a card without walking the tree itself.
 */
function buildGeo(village) {
  if (!village) {
    return { currentVillage: null, village: null, ward: null, district: null, region: null }
  }
  return {
    currentVillage: village,
    village:  village.name ?? null,
    ward:     village.ward?.name ?? null,
    district: village.ward?.district?.name ?? null,
    region:   village.ward?.district?.region?.name ?? null,
  }
}

/**
 * Look up a person by exact Birth ID (BID). Returns a citizen-shaped object
 * (always including geo + age — PATCH-BID-GEO-2026) or null. `source` tells
 * the caller whether the person already has a NIN ('citizen') or is only a
 * Birth-table record with no NIN yet ('birth').
 */
async function findPersonByBid(birthId) {
  const term = typeof birthId === 'string' ? birthId.trim() : ''
  if (!term) return null

  const citizen = await prisma.citizen.findFirst({ where: { birthId: term }, select: CITIZEN_SELECT })
  if (citizen) {
    return {
      ...citizen,
      age: citizen.age ?? calcAge(citizen.dateOfBirth),
      ...buildGeo(citizen.currentVillage),
      source: 'citizen',
    }
  }

  const birth = await prisma.birth.findFirst({
    where: { birthId: term },
    select: {
      id: true, birthId: true, childFirstName: true, childMiddleName: true,
      childSurname: true, gender: true, dateOfBirth: true, childCitizenId: true,
      originVillage: { select: VILLAGE_GEO_SELECT },
    },
  })
  if (!birth) return null

  return {
    id: birth.id,
    birthId: birth.birthId,
    nationalId: null, // NIN not issued yet — Village Officer issues it at age 18
    firstName: birth.childFirstName,
    middleName: birth.childMiddleName || '',
    surname: birth.childSurname,
    gender: birth.gender,
    dateOfBirth: birth.dateOfBirth,
    age: calcAge(birth.dateOfBirth),
    vitalStatus: 'alive',
    ...buildGeo(birth.originVillage),
    source: 'birth',
  }
}

module.exports = { findPersonByBid, calcAge, buildGeo, VILLAGE_GEO_SELECT }
