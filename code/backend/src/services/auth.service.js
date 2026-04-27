/**
 * auth.service.js — ADLCS Authentication Service
 *
 * Handles all auth business logic for 5 user roles:
 *   super_admin, district_admin, village_officer, hospital_officer, public_user
 *
 * Flow:
 *   Login step 1 → password check → (if MFA) return tempToken
 *   Login step 2 → TOTP verify   → return access + refresh tokens
 *   Refresh       → validate Redis hash → return new access token
 *   Logout        → delete Redis hash
 */

const bcrypt    = require('bcryptjs')
const speakeasy = require('speakeasy')
const crypto    = require('crypto')

const { prisma }   = require('../lib/prisma')
const { getRedis } = require('../lib/redis')
const { signAccess, signRefresh, signTemp } = require('../lib/jwt')

// ── Role → Prisma model name mapping ─────────────────────────────────────────
// These match the Prisma schema model names exactly (camelCase delegate names)
const ROLE_MODEL = {
  super_admin:      'superAdmin',
  district_admin:   'districtAdmin',
  village_officer:  'villageOfficer',
  hospital_officer: 'hospitalOfficer',
  public_user:      'publicUser',
}

// Search order — most privileged first so super_admin is resolved quickly
const ROLE_SEARCH_ORDER = [
  'super_admin',
  'district_admin',
  'village_officer',
  'hospital_officer',
  'public_user',
]

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * SHA-256 hash a token before storing in Redis.
 * We never store raw JWTs — if Redis is compromised the hashes are useless.
 */
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

/** Redis key for a user's refresh token */
function refreshKey(role, userId) {
  return `refresh:${role}:${userId}`
}

/**
 * Walk all role tables and return the first user whose email matches.
 * Returns { user, role } or null.
 */
async function resolveUser(email) {
  for (const role of ROLE_SEARCH_ORDER) {
    const model = ROLE_MODEL[role]
    const user  = await prisma[model].findUnique({ where: { email } })
    if (user) return { user, role }
  }
  return null
}

/**
 * Strip sensitive fields before returning user data to the client.
 * Never send passwordHash, mfaSecret, or loginToken fields over the wire.
 */
function safeProfile(user, role) {
  // eslint-disable-next-line no-unused-vars
  const { passwordHash, mfaSecret, loginTokenHash, loginTokenExpires, ...safe } = user
  return { ...safe, role }
}

/** Persist refresh token hash in Redis with 7-day TTL (604 800 seconds) */
async function storeRefreshToken(role, userId, refreshToken) {
  const redis = getRedis()
  await redis.setex(refreshKey(role, userId), 60 * 60 * 24 * 7, hashToken(refreshToken))
}

/** Returns true if the provided refresh token hash matches what is in Redis */
async function validateRefreshToken(role, userId, refreshToken) {
  const redis  = getRedis()
  const stored = await redis.get(refreshKey(role, userId))
  if (!stored) return false
  return stored === hashToken(refreshToken)
}

/** Delete the refresh token from Redis (used on logout) */
async function deleteRefreshToken(role, userId) {
  const redis = getRedis()
  await redis.del(refreshKey(role, userId))
}

/** Stamp lastLogin on the user record after successful authentication */
async function touchLastLogin(role, userId) {
  const model = ROLE_MODEL[role]
  await prisma[model].update({
    where: { id: userId },
    data:  { lastLogin: new Date() },
  })
}

/**
 * Issue a full access + refresh token pair, store the refresh hash in Redis,
 * and update lastLogin. Called after both password-only and MFA flows succeed.
 */
async function issueTokens(user, role) {
  const payload      = { sub: user.id, role, email: user.email }
  const accessToken  = signAccess(payload)
  const refreshToken = signRefresh(payload)
  await storeRefreshToken(role, user.id, refreshToken)
  await touchLastLogin(role, user.id)
  return { accessToken, refreshToken }
}

// ── Exported service functions ────────────────────────────────────────────────

/**
 * login — Step 1: validate email + password
 *
 * Returns:
 *   { mfaRequired: false, accessToken, refreshToken, profile } — no MFA
 *   { mfaRequired: true,  tempToken }                          — MFA enabled
 *
 * Throws { status, message } on any failure so routes can return the right HTTP code.
 */
async function login(email, password) {
  // Find the user across all role tables
  const resolved = await resolveUser(email)
  if (!resolved) {
    // Return a generic message — do not reveal whether the email exists
    throw { status: 401, message: 'Invalid email or password' }
  }

  const { user, role } = resolved

  // Only active accounts can authenticate
  if (user.status !== 'active') {
    throw { status: 403, message: `Account is ${user.status}. Contact your administrator.` }
  }

  // passwordHash can be null if the account was created but never activated
  if (!user.passwordHash) {
    throw { status: 401, message: 'Invalid email or password' }
  }

  const passwordOk = await bcrypt.compare(password, user.passwordHash)
  if (!passwordOk) {
    throw { status: 401, message: 'Invalid email or password' }
  }

  // MFA is enabled — issue a short-lived step-up token for TOTP verification
  if (user.mfaEnabled) {
    const tempToken = signTemp({ sub: user.id, role, mfa: true })
    return { mfaRequired: true, tempToken }
  }

  // No MFA — issue full tokens immediately
  const tokens = await issueTokens(user, role)
  return { mfaRequired: false, ...tokens, profile: safeProfile(user, role) }
}

/**
 * verifyMfa — Step 2: validate TOTP code using speakeasy
 *
 * tempToken has already been verified by requireMfaTemp middleware before this
 * function is called, so userId and role are trusted.
 */
async function verifyMfa(userId, role, totpCode) {
  const model = ROLE_MODEL[role]
  const user  = await prisma[model].findUnique({ where: { id: userId } })

  if (!user || !user.mfaSecret) {
    throw { status: 401, message: 'MFA not configured for this account' }
  }

  // window: 1 allows 1 step (30 s) of clock drift in either direction
  const valid = speakeasy.totp.verify({
    secret:   user.mfaSecret,
    encoding: 'base32',
    token:    totpCode,
    window:   1,
  })

  if (!valid) {
    throw { status: 401, message: 'Invalid MFA code' }
  }

  const tokens = await issueTokens(user, role)
  return { ...tokens, profile: safeProfile(user, role) }
}

/**
 * refresh — issue a new access token using a valid refresh token
 *
 * The refresh token signature is verified by the route before calling this.
 * Here we additionally check the Redis hash to catch logged-out tokens.
 */
async function refresh(userId, role, refreshToken) {
  const valid = await validateRefreshToken(role, userId, refreshToken)
  if (!valid) {
    throw { status: 401, message: 'Invalid or expired refresh token' }
  }

  const model = ROLE_MODEL[role]
  const user  = await prisma[model].findUnique({ where: { id: userId } })
  if (!user || user.status !== 'active') {
    throw { status: 403, message: 'Account is not active' }
  }

  const accessToken = signAccess({ sub: user.id, role, email: user.email })
  return { accessToken }
}

/**
 * logout — invalidate the refresh token in Redis
 * After this, any attempt to refresh will fail even with a valid JWT signature.
 */
async function logout(userId, role) {
  await deleteRefreshToken(role, userId)
}

/**
 * getMe — return the authenticated user's safe profile
 */
async function getMe(userId, role) {
  const model = ROLE_MODEL[role]
  const user  = await prisma[model].findUnique({ where: { id: userId } })
  if (!user) {
    throw { status: 404, message: 'User not found' }
  }
  return safeProfile(user, role)
}

module.exports = { login, verifyMfa, refresh, logout, getMe }
