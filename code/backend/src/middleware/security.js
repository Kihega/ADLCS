/**
 * security.js — TzCRVS Global Security Middleware
 *
 * Exports:
 *   helmetConfig   — hardened HTTP headers (CSP, HSTS, etc.)
 *   corsConfig     — allow only known Vercel / local origins
 *   globalLimiter  — 100 req / 15 min applied to ALL routes in index.js
 *   authLimiter    — 10 req / 15 min applied only to /login + /mfa/verify
 */

const helmet    = require('helmet')
const cors      = require('cors')
const rateLimit = require('express-rate-limit')

// ── URL normalisation helper ──────────────────────────────────────────────────
// Accepts a URL with or without protocol and always returns https://hostname
// This prevents the double-https:// bug when VERCEL_URL is set to the full URL.
function toHttpsOrigin(url) {
  if (!url) return null
  // Strip any existing protocol so we always add exactly one https://
  const bare = url.replace(/^https?:\/\//, '').replace(/\/$/, '')
  if (!bare) return null
  return `https://${bare}`
}

// ── CORS — allowed origins ────────────────────────────────────────────────────
// VERCEL_URL — set in Render env vars as just the hostname (no protocol)
//   e.g.  adlcs-web.vercel.app
//   Vercel auto-injects this on their platform (also without protocol).
//
// WEB_URL — set in Render env vars as the full URL (with https://)
//   e.g.  https://adlcs-web.vercel.app
//   Both formats are handled safely by toHttpsOrigin().
const allowedOrigins = [
  'http://localhost:5173',   // Vite dev server
  'http://localhost:3000',   // alternate local port
  toHttpsOrigin(process.env.VERCEL_URL),
  toHttpsOrigin(process.env.WEB_URL),
].filter(Boolean)

const corsOptions = {
  origin(origin, callback) {
    // Allow requests with no Origin header (Expo mobile, Postman, curl, health checks)
    if (!origin) return callback(null, true)
    if (allowedOrigins.includes(origin)) return callback(null, true)
    callback(new Error('Not allowed by CORS'))
  },
  credentials:    true,
  methods:        ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}

// ── Rate limiters ─────────────────────────────────────────────────────────────

/** Applied globally to every route — generous ceiling */
const globalLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,  // 15 minutes
  max:             100,
  standardHeaders: true,
  legacyHeaders:   false,
  message: {
    success:    false,
    message:    'Too many requests. Please try again in 15 minutes.',
    error:      'Too many requests. Please try again later.',
    retryAfter: '15 minutes',
  },
})

/**
 * Applied to POST /api/auth/login and POST /api/auth/mfa/verify.
 * Slows brute-force password attempts without locking out legitimate users.
 */
const authLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,  // 15 minutes
  max:             10,               // 10 login attempts per window per IP
  standardHeaders: true,
  legacyHeaders:   false,
  message: {
    success:    false,
    message:    'Too many login attempts. Please wait 15 minutes before trying again.',
    error:      'Too many authentication attempts. Please try again later.',
    retryAfter: '15 minutes',
  },
})

// ── Helmet — hardened HTTP headers ────────────────────────────────────────────
const helmetConfig = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc:   ["'self'", "'unsafe-inline'"],
      scriptSrc:  ["'self'"],
      imgSrc:     ["'self'", 'data:', 'https://res.cloudinary.com'],
    },
  },
})

module.exports = {
  helmetConfig,
  corsConfig: cors(corsOptions),
  globalLimiter,
  authLimiter,
}
