/**
 * index.js — ADLCS Backend Entry Point  v2.0
 *
 * Registers all API route modules and starts the HTTP server.
 * The server start is guarded with require.main === module so Jest
 * can import this file without binding a port.
 *
 * Routes:
 *   /api/health          — liveness + readiness probe
 *   /api/auth            — login, MFA, refresh, logout, /me
 *   /api/officer         — dashboard stats, records, sync (all roles)
 */

require('dotenv').config()
const express = require('express')
const morgan  = require('morgan')

const { connectDB }    = require('./lib/prisma')
const { connectRedis } = require('./lib/redis')
const { helmetConfig, corsConfig, globalLimiter } = require('./middleware/security')

// ── Route modules ─────────────────────────────────────────────────────────────
const healthRouter    = require('./routes/health')
const authRouter      = require('./routes/auth')
const dashboardRouter = require('./routes/dashboard')
const syncRouter     = require('./routes/syncRoutes')

const app  = express()
const PORT = process.env.PORT || 5000

// ── Global middleware ─────────────────────────────────────────────────────────
app.use(helmetConfig)
app.use(corsConfig)
app.use(globalLimiter)
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'))

// ── API routes ────────────────────────────────────────────────────────────────
app.use('/api/health',  healthRouter)
app.use('/api/auth',    authRouter)
app.use('/api/officer', dashboardRouter)
app.use('/api/officer', syncRouter)   // ← NEW: officer dashboard, records, sync

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    error:  'Route not found',
    path:   req.originalUrl,
    method: req.method,
  })
})

// ── Global error handler ──────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('❌ Unhandled error:', err.message)
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'CORS: Origin not allowed' })
  }
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  })
})

// ── Server start ──────────────────────────────────────────────────────────────
async function startServer() {
  try {
    connectRedis()
    await connectDB()
    app.listen(PORT, () => {
      console.log('═══════════════════════════════════════════════')
      console.log('  ADLCS — Tanzania Automated Digital Census API')
      console.log(`  🚀 Port     : ${PORT}`)
      console.log(`  🌍 Env      : ${process.env.NODE_ENV || 'development'}`)
      console.log(`  📡 Health   : http://localhost:${PORT}/api/health`)
      console.log(`  🔐 Auth     : http://localhost:${PORT}/api/auth`)
      console.log(`  📊 Dashboard: http://localhost:${PORT}/api/officer/dashboard`)
      console.log('═══════════════════════════════════════════════')
    })
  } catch (err) {
    console.error('❌ Startup failed:', err)
    process.exit(1)
  }
}

if (require.main === module) startServer()

module.exports = app
