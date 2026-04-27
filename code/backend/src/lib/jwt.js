/**
 * jwt.js — ADLCS JWT token utilities
 *
 * Three token types:
 *   access  — 15 min, authorises every protected API call
 *   refresh — 7 days, stored hash in Redis, used to rotate access tokens
 *   temp    — 5 min, issued after password check when MFA is enabled;
 *             only valid for POST /api/auth/mfa/verify
 */

const jwt = require('jsonwebtoken')

const ACCESS_SECRET  = process.env.JWT_ACCESS_SECRET
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET

/** Sign a 15-minute access token */
function signAccess(payload) {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: '15m' })
}

/** Sign a 7-day refresh token */
function signRefresh(payload) {
  return jwt.sign(payload, REFRESH_SECRET, { expiresIn: '7d' })
}

/**
 * Sign a 5-minute MFA step-up token.
 * Payload must include { mfa: true } so the middleware can distinguish it
 * from a real access token.
 */
function signTemp(payload) {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: '5m' })
}

/** Verify and decode an access or temp token (same secret) */
function verifyAccess(token) {
  return jwt.verify(token, ACCESS_SECRET)
}

/** Verify and decode a refresh token */
function verifyRefresh(token) {
  return jwt.verify(token, REFRESH_SECRET)
}

module.exports = { signAccess, signRefresh, signTemp, verifyAccess, verifyRefresh }
