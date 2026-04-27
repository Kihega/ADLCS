/**
 * auth.js — ADLCS Authentication Middleware
 *
 * requireAuth      — verifies Bearer access token on every protected route
 * requireRole      — restricts a route to one or more specific roles
 * requireMfaTemp   — verifies the short-lived MFA step-up token
 */

const { verifyAccess } = require('../lib/jwt')

/**
 * requireAuth
 * Extracts the Bearer token from Authorization header, verifies it, and
 * injects req.user = { id, role, email } for downstream handlers.
 */
function requireAuth(req, res, next) {
  const header = req.headers.authorization || ''
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null

  if (!token) {
    return res.status(401).json({ success: false, message: 'Authentication required' })
  }

  try {
    const decoded = verifyAccess(token)

    // Reject MFA temp tokens — they must not authorise regular routes
    if (decoded.mfa) {
      return res.status(401).json({ success: false, message: 'Invalid token type' })
    }

    req.user = { id: decoded.sub, role: decoded.role, email: decoded.email }
    next()
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' })
  }
}

/**
 * requireRole(...roles)
 * Factory — returns middleware that allows only the specified roles through.
 * Always use AFTER requireAuth.
 *
 * Example: router.get('/admin', requireAuth, requireRole('super_admin'), handler)
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required role: ${roles.join(' or ')}`,
      })
    }
    next()
  }
}

/**
 * requireMfaTemp
 * Verifies the short-lived temp token issued at the end of step 1 login.
 * The token must have { mfa: true } in its payload — this distinguishes it
 * from a regular access token.
 * Injects req.mfaUser = { id, role } for the MFA verify handler.
 */
function requireMfaTemp(req, res, next) {
  const { tempToken } = req.body

  if (!tempToken) {
    return res.status(400).json({ success: false, message: 'tempToken is required' })
  }

  try {
    const decoded = verifyAccess(tempToken)

    if (!decoded.mfa) {
      return res.status(401).json({ success: false, message: 'Invalid temp token' })
    }

    req.mfaUser = { id: decoded.sub, role: decoded.role }
    next()
  } catch {
    return res.status(401).json({ success: false, message: 'Temp token expired or invalid' })
  }
}

module.exports = { requireAuth, requireRole, requireMfaTemp }
