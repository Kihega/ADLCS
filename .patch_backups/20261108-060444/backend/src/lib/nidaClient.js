/**
 * nidaClient.js — adapter for the EXTERNAL NIDA (National ID Authority) NIN API.
 *
 * NIN issuance and verification belong to NIDA, not to this NBS system. This
 * module is the single integration point: when NIDA grants API access, fill
 * in `fetchFromNida()` and set NIDA_API_URL / NIDA_API_KEY — nothing else in
 * the codebase needs to change.
 *
 * Until then the adapter is intentionally NOT implemented: lookupByNin()
 * resolves to { available:false } so callers fall back gracefully.
 */
function isConfigured() {
  return Boolean(process.env.NIDA_API_URL && process.env.NIDA_API_KEY)
}

/**
 * Placeholder for the real NIDA call. Expected to resolve to
 * { firstName, middleName, surname, gender, dateOfBirth } or null (not found).
 * eslint-disable-next-line no-unused-vars
 */
async function fetchFromNida(_nin) {
  throw new Error('NIDA integration is not implemented yet')
}

/**
 * @returns {Promise<{available:boolean, found?:boolean, person?:object, reason?:string}>}
 */
async function lookupByNin(nin) {
  if (!isConfigured()) {
    return { available: false, reason: 'NIDA_NOT_CONFIGURED' }
  }
  try {
    const person = await fetchFromNida(String(nin))
    return person ? { available: true, found: true, person } : { available: true, found: false }
  } catch (err) {
    return { available: false, reason: 'NIDA_UNAVAILABLE' }
  }
}

module.exports = { lookupByNin, isConfigured }
