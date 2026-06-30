/**
 * auth.js — TzCRVS Auth Routes
 *
 * POST /api/auth/login        — step 1: email + password         [rate-limited]
 * POST /api/auth/mfa/verify   — step 2: TOTP code               [rate-limited]
 * POST /api/auth/refresh      — new access token from refresh token
 * POST /api/auth/logout       — invalidate refresh token         [requires auth]
 * GET  /api/auth/me           — current user profile             [requires auth]
 */

const { Router } = require('express')
const { z }      = require('zod')

const authService              = require('../services/auth.service')
const { requireAuth,
        requireMfaTemp }       = require('../middleware/auth')
const { verifyRefresh }        = require('../lib/jwt')
const { prisma }               = require('../lib/prisma')
const { authLimiter }          = require('../middleware/security')

const router = Router()

// ── Zod validation schemas ────────────────────────────────────────────────────

const loginSchema = z.object({
  email:    z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

const mfaSchema = z.object({
  tempToken: z.string().min(1, 'tempToken is required'),
  code:      z.string().length(6).regex(/^\d{6}$/, 'MFA code must be 6 digits'),
})

const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'refreshToken is required'),
})

/** Parse and validate request body against a schema. */
function validate(schema, body) {
  const result = schema.safeParse(body)
  if (!result.success) {
    return { error: result.error.errors[0].message }
  }
  return { data: result.data }
}

// ── POST /api/auth/login ──────────────────────────────────────────────────────
// authLimiter: max 10 attempts per 15 min — slows brute-force attacks
router.post('/login', authLimiter, async (req, res) => {
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
// authLimiter: also throttle TOTP guessing
// requireMfaTemp: verifies the tempToken and injects req.mfaUser
router.post('/mfa/verify', authLimiter, requireMfaTemp, async (req, res) => {
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
    const decoded = verifyRefresh(data.refreshToken)
    const result  = await authService.refresh(decoded.sub, decoded.role, data.refreshToken)
    return res.json({ success: true, ...result })
  } catch (err) {
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


// ── POST /api/auth/change-password ────────────────────────────────────────────
// Allows any authenticated officer or admin to change their own password.
// Body: { currentPassword: string, newPassword: string }
router.post('/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ success: false, message: 'currentPassword and newPassword are required' })
  }
  if (typeof newPassword !== 'string' || newPassword.length < 8) {
    return res.status(400).json({ success: false, message: 'New password must be at least 8 characters' })
  }

  try {
    const bcrypt = require('bcryptjs')
    const { id, role } = req.user
    let record = null

    if (role === 'hospital_officer') {
      record = await prisma.hospitalOfficer.findUnique({
        where: { id }, select: { id: true, passwordHash: true },
      })
    } else if (role === 'village_officer') {
      record = await prisma.villageOfficer.findUnique({
        where: { id }, select: { id: true, passwordHash: true },
      })
    } else if (role === 'super_admin') {
      record = await prisma.superAdmin.findUnique({
        where: { id }, select: { id: true, passwordHash: true },
      })
    } else if (role === 'district_admin') {
      record = await prisma.districtAdmin.findUnique({
        where: { id }, select: { id: true, passwordHash: true },
      })
    } else {
      return res.status(403).json({ success: false, message: 'Role not permitted to change password via this endpoint' })
    }

    if (!record) {
      return res.status(404).json({ success: false, message: 'User record not found' })
    }

    const valid = await bcrypt.compare(currentPassword, record.passwordHash)
    if (!valid) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect' })
    }

    const newHash = await bcrypt.hash(newPassword, 12)

    if (role === 'hospital_officer') {
      await prisma.hospitalOfficer.update({ where: { id }, data: { passwordHash: newHash } })
    } else if (role === 'village_officer') {
      await prisma.villageOfficer.update({ where: { id }, data: { passwordHash: newHash } })
    } else if (role === 'super_admin') {
      await prisma.superAdmin.update({ where: { id }, data: { passwordHash: newHash } })
    } else {
      await prisma.districtAdmin.update({ where: { id }, data: { passwordHash: newHash } })
    }

    console.log(`[change-password] Officer ${id} (${role}) changed password`)
    return res.json({ success: true, message: 'Password changed successfully' })
  } catch (err) {
    console.error('[change-password]', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
})

module.exports = router
