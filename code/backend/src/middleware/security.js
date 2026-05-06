/**
 * security.js — ADLCS Global Security Middleware
 *
 * Exports:
 *   helmetConfig   — hardened HTTP headers (CSP, HSTS, etc.)
 *   corsConfig     — allow only known Vercel / local origins
 *   globalLimiter  — 100 req / 15 min applied to ALL routes in index.js
 *   authLimiter    — 10 req / 15 min applied only to auth routes
 */

const helmet    = require('helmet')
const cors      = require('cors')
const rateLimit = require('express-rate-limit')

// ── CORS — allowed origins ────────────────────────────────────────────────────
// process.env.VERCEL_URL is auto-injected by Vercel on every deployment.
// process.env.WEB_URL    is a manual secret for custom domains.
const allowedOrigins = [
  'http://localhost:5173',   // Vite dev server
  'http://localhost:3000',   // alternate local port
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
  process.env.WEB_URL,
].filter(Boolean)

const corsOptions = {
  origin(origin, callback) {
    // Allow requests with no origin (Expo mobile, Postman, curl)
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
    error:       'Too many requests. Please try again later.',
    retryAfter:  '15 minutes',
  },
})

/**
 * Applied to POST /api/auth/login (and optionally /mfa/verify).
 * Slows brute-force password attempts without locking out legitimate users.
 */
const authLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,  // 15 minutes
  max:             10,               // 10 login attempts per window
  standardHeaders: true,
  legacyHeaders:   false,
  message: {
    error:       'Too many authentication attempts. Please try again later.',
    retryAfter:  '15 minutes',
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
