/**
 * parentIdentifier.js — classify/normalise a parent identifier that may be a
 * Birth ID (BID) or a National ID (NIN).
 *
 *   BID : BID-XXXXXXXXXX            (system generated; fully supported)
 *   NIN : 20 digits, optionally written 8-5-5-2 with dashes
 *         (legacy NBS-generated "NIDA-XXXXXXXXXXXX-CC" values are still accepted
 *          so records created before NIN issuance was removed keep working)
 */
const BID_RE = /^BID-[A-Z0-9]{6,12}$/
const NIN_RE = /^\d{20}$/
const LEGACY_NIN_RE = /^NIDA-[A-Z0-9]{12}-\d{2}$/

function normalizeIdentifier(raw) {
  return typeof raw === 'string' ? raw.trim().toUpperCase() : ''
}

/** @returns {{type:'BID'|'NIN'|null, value:string}} */
function classifyIdentifier(raw) {
  const v = normalizeIdentifier(raw)
  if (!v) return { type: null, value: '' }
  if (BID_RE.test(v)) return { type: 'BID', value: v }
  if (LEGACY_NIN_RE.test(v)) return { type: 'NIN', value: v }
  const digits = v.replace(/[-\s]/g, '')
  if (NIN_RE.test(digits) && /^[\d\s-]+$/.test(v)) return { type: 'NIN', value: digits }
  return { type: null, value: v }
}

/**
 * Resolve an identifier to a local Citizen id (or undefined).
 * `prisma` is injected so the helper is unit-testable.
 * NIDA is only consulted for NINs that are not in the local registry.
 */
async function resolveParentCitizen(prisma, raw, nida) {
  const { type, value } = classifyIdentifier(raw)
  if (!type) return { type: null, value, citizenId: undefined, source: 'invalid' }
  if (type === 'BID') {
    const c = await prisma.citizen.findFirst({ where: { birthId: value }, select: { id: true } })
    return { type, value, citizenId: c?.id, source: c ? 'local' : 'unresolved' }
  }
  const c = await prisma.citizen.findFirst({
    where: { OR: [{ nationalId: value }, { nationalId: String(raw).trim() }] },
    select: { id: true },
  })
  if (c) return { type, value, citizenId: c.id, source: 'local' }
  const ext = nida ? await nida.lookupByNin(value) : { available: false }
  return { type, value, citizenId: undefined, source: ext.available ? 'nida' : 'unverified' }
}

module.exports = { classifyIdentifier, normalizeIdentifier, resolveParentCitizen }
