/**
 * nidaClient.js — adapter for the EXTERNAL NIDA (National ID Authority) NIN API.
 *
 * NIN issuance and verification belong to NIDA, not to this NBS system.
 * This module is the single integration point.
 *
 * ── How to connect it later ────────────────────────────────────────────────
 * Put the NIDA link in backend/.env — nothing else in the code base changes:
 *
 *   NIDA_API_URL          Base URL of the NIDA lookup endpoint.
 *                         Either  https://nida.example.go.tz/api/v1/persons
 *                         (the NIN is appended:  .../persons/<NIN>)
 *                         or a template containing {nin}:
 *                         https://nida.example.go.tz/lookup?nin={nin}
 *   NIDA_API_KEY          (optional) credential sent with every request.
 *   NIDA_API_KEY_HEADER   (optional) header carrying the key.
 *                         Default "Authorization" (sent as "Bearer <key>");
 *                         any other name sends the raw key, e.g. "x-api-key".
 *   NIDA_API_TIMEOUT_MS   (optional) default 8000.
 *
 * While NIDA_API_URL is empty the adapter is a placeholder: lookupByNin()
 * resolves to { available:false, reason:'NIDA_NOT_CONFIGURED' } and callers
 * tell the officer that NIDA is not connected yet. Once the URL is set,
 * citizens that are not in the local registry are fetched from the real
 * national NIDA database.
 *
 * mapPerson() accepts the usual spellings (firstName / first_name / FIRSTNAME
 * …); adjust it here if NIDA's real payload differs.
 */
const DEFAULT_TIMEOUT_MS = 8000

function baseUrl() {
  return String(process.env.NIDA_API_URL || '').trim()
}

function isConfigured() {
  return baseUrl().length > 0
}

function buildUrl(nin) {
  const base = baseUrl()
  const id = encodeURIComponent(nin)
  if (base.includes('{nin}')) return base.replace('{nin}', id)
  return `${base.replace(/\/+$/, '')}/${id}`
}

function buildHeaders() {
  const headers = { Accept: 'application/json' }
  const key = String(process.env.NIDA_API_KEY || '').trim()
  if (key) {
    const name = String(process.env.NIDA_API_KEY_HEADER || 'Authorization').trim()
    headers[name] = name.toLowerCase() === 'authorization' ? `Bearer ${key}` : key
  }
  return headers
}

function pick(obj, keys) {
  if (!obj || typeof obj !== 'object') return undefined
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null && String(obj[k]).trim() !== '') return obj[k]
  }
  return undefined
}

function normaliseGender(v) {
  const s = String(v || '').trim().toUpperCase()
  if (s === 'M' || s === 'MALE' || s === 'ME') return 'male'
  if (s === 'F' || s === 'FEMALE' || s === 'KE') return 'female'
  return null
}

/**
 * Map a NIDA payload to { firstName, middleName, surname, gender, dateOfBirth }.
 * Returns null when the payload has no usable name (treated as "not found").
 */
function mapPerson(raw) {
  const src = (raw && (raw.data || raw.person || raw.result)) || raw
  const firstName = pick(src, ['firstName', 'first_name', 'FIRSTNAME', 'givenName', 'given_name', 'FIRST_NAME'])
  const surname = pick(src, ['surname', 'SURNAME', 'lastName', 'last_name', 'LASTNAME', 'familyName', 'family_name'])
  if (!firstName || !surname) return null
  const middleName = pick(src, ['middleName', 'middle_name', 'MIDDLENAME', 'MIDDLE_NAME']) || ''
  const gender = normaliseGender(pick(src, ['gender', 'sex', 'GENDER', 'SEX']))
  const dobRaw = pick(src, ['dateOfBirth', 'date_of_birth', 'dob', 'birthDate', 'birth_date', 'DATEOFBIRTH', 'DOB'])
  let dateOfBirth = null
  if (dobRaw) {
    const d = new Date(dobRaw)
    dateOfBirth = Number.isNaN(d.getTime()) ? null : d.toISOString()
  }
  return {
    firstName: String(firstName).trim(),
    middleName: String(middleName).trim(),
    surname: String(surname).trim(),
    gender,
    dateOfBirth,
  }
}

/**
 * Real NIDA call. Resolves to a person, or null when NIDA does not know the NIN.
 * Throws on network / server errors (lookupByNin turns that into "unavailable").
 */
async function fetchFromNida(nin) {
  const timeoutMs = Number(process.env.NIDA_API_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(buildUrl(nin), { method: 'GET', headers: buildHeaders(), signal: ctrl.signal })
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`NIDA responded with HTTP ${res.status}`)
    return mapPerson(await res.json())
  } finally {
    clearTimeout(timer)
  }
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
    console.error('[nida] lookup failed:', err.message)
    return { available: false, reason: 'NIDA_UNAVAILABLE' }
  }
}

module.exports = { lookupByNin, isConfigured, fetchFromNida, mapPerson }
