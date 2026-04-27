/**
 * auth.js — ADLCS Auth Routes
 *
 * POST /api/auth/login        — step 1: email + password
 * POST /api/auth/mfa/verify   — step 2: TOTP code (only when MFA is enabled)
 * POST /api/auth/refresh      — get a new access token from a refresh token
 * POST /api/auth/logout       — invalidate the refresh token (requires auth)
 * GET  /api/auth/me           — return current user's profile (requires auth)
 */

const { Router } = require('express')
const { z }      = require('zod')

const authService              = require('../services/auth.service')
const { requireAuth,
        requireMfaTemp }       = require('../middleware/auth')
const { verifyRefresh }        = require('../lib/jwt')

const router = Router()

// ── Zod validation schemas ────────────────────────────────────────────────────

const loginSchema = z.object({
  email:    z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

const mfaSchema = z.object({
  tempToken: z.string().min(1, 'tempToken is required'),
  // TOTP codes are always exactly 6 digits
  code: z.string().length(6).regex(/^\d{6}$/, 'MFA code must be 6 digits'),
})

const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'refreshToken is required'),
})

/** Parse and validate request body against a schema. Returns { data } or { error }. */
function validate(schema, body) {
  const result = schema.safeParse(body)
  if (!result.success) {
    return { error: result.error.errors[0].message }
  }
  return { data: result.data }
}

// ── POST /api/auth/login ──────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { error, data } = validate(loginSchema, req.body)
  if (error) return res.status(400).json({ success: false, message: error })

  try {
    const result = await authService.login(data.email, data.password)
    return res.json({ success: true, ...result })
  } catch (err) {
    return res.status(err.status || 500).json({ success: false, message: err.message })
  }
})

// ── POST /api/auth/mfa/verify ─────────────────────────────────────────────────
// requireMfaTemp runs first — it verifies the tempToken and injects req.mfaUser
router.post('/mfa/verify', requireMfaTemp, async (req, res) => {
  const { error, data } = validate(mfaSchema, req.body)
  if (error) return res.status(400).json({ success: false, message: error })

  try {
    const result = await authService.verifyMfa(req.mfaUser.id, req.mfaUser.role, data.code)
    return res.json({ success: true, ...result })
  } catch (err) {
    return res.status(err.status || 500).json({ success: false, message: err.message })
  }
})

// ── POST /api/auth/refresh ────────────────────────────────────────────────────
router.post('/refresh', async (req, res) => {
  const { error, data } = validate(refreshSchema, req.body)
  if (error) return res.status(400).json({ success: false, message: error })

  try {
    // Verify JWT signature to extract sub + role before hitting Redis
    const decoded = verifyRefresh(data.refreshToken)
    const result  = await authService.refresh(decoded.sub, decoded.role, data.refreshToken)
    return res.json({ success: true, ...result })
  } catch (err) {
    // verifyRefresh throws a JWT error (no .status), service throws { status, message }
    return res.status(err.status || 401).json({
      success: false,
      message: err.message || 'Invalid or expired refresh token',
    })
  }
})

// ── POST /api/auth/logout ─────────────────────────────────────────────────────
router.post('/logout', requireAuth, async (req, res) => {
  try {
    await authService.logout(req.user.id, req.user.role)
    return res.json({ success: true, message: 'Logged out successfully' })
  } catch {
    return res.status(500).json({ success: false, message: 'Logout failed' })
  }
})

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
router.get('/me', requireAuth, async (req, res) => {
  try {
    const profile = await authService.getMe(req.user.id, req.user.role)
    return res.json({ success: true, data: profile })
  } catch (err) {
    return res.status(err.status || 500).json({ success: false, message: err.message })
  }
})

module.exports = router
