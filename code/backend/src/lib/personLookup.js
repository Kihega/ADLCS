/**
 * personLookup.js — shared Birth-ID (BID) person lookup
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
 */
const { prisma } = require('./prisma')

const CITIZEN_SELECT = {
  id: true, birthId: true, nationalId: true, firstName: true, middleName: true,
  surname: true, gender: true, dateOfBirth: true, vitalStatus: true,
}

/**
 * Look up a person by exact Birth ID (BID). Returns a citizen-shaped object
 * or null. `source` tells the caller whether the person already has a NIN
 * ('citizen') or is only a Birth-table record with no NIN yet ('birth').
 */
async function findPersonByBid(birthId) {
  const term = typeof birthId === 'string' ? birthId.trim() : ''
  if (!term) return null

  const citizen = await prisma.citizen.findFirst({ where: { birthId: term }, select: CITIZEN_SELECT })
  if (citizen) return { ...citizen, source: 'citizen' }

  const birth = await prisma.birth.findFirst({
    where: { birthId: term },
    select: {
      id: true, birthId: true, childFirstName: true, childMiddleName: true,
      childSurname: true, gender: true, dateOfBirth: true, childCitizenId: true,
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
    vitalStatus: 'alive',
    source: 'birth',
  }
}

module.exports = { findPersonByBid }
