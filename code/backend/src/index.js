/**
 * index.js — TzCRVS Backend Entry Point  v2.0
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
const villageRouter  = require('./routes/village')
const adminRouter    = require('./routes/admin')

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
app.use('/api/officer', syncRouter)
app.use('/api/village', villageRouter)
app.use('/api/officer', villageRouter)   // profile endpoint   // ← NEW: officer dashboard, records, sync
app.use('/api/admin',   adminRouter)     // Super Admin / District Admin dashboards

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
  // Warn early if required env vars are missing
  if (!process.env.DATABASE_URL_POOLER) {
    console.warn('⚠️  DATABASE_URL_POOLER is not set — Prisma pooler connection will fail!')
    console.warn('   Set DATABASE_URL_POOLER in Render environment variables.')
    console.warn('   Tip: use your Supabase Transaction pooler connection string.')
  }
  if (!process.env.JWT_ACCESS_SECRET) {
    console.error('❌  JWT_ACCESS_SECRET is not set — authentication will fail!')
    process.exit(1)
  }
  try {
    connectRedis()
    await connectDB()
    // BUGFIX-1: use the http.Server returned by app.listen() so we can
    // attach a proper 'error' handler. Without this, EADDRINUSE (port
    // already taken by a previous process) crashes the whole process with
    // an unhandled exception instead of failing with a clear message.
    const server = app.listen(PORT, () => {
      console.log('═══════════════════════════════════════════════')
      console.log('  TzCRVS — Tanzania Automated Digital Census API')
      console.log(`  🚀 Port     : ${PORT}`)
      console.log(`  🌍 Env      : ${process.env.NODE_ENV || 'development'}`)
      console.log(`  📡 Health   : http://localhost:${PORT}/api/health`)
      console.log(`  🔐 Auth     : http://localhost:${PORT}/api/auth`)
      console.log(`  📊 Dashboard: http://localhost:${PORT}/api/officer/dashboard`)
      console.log('═══════════════════════════════════════════════')
    })

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error('═══════════════════════════════════════════════')
        console.error(`❌  Port ${PORT} is already in use.`)
        console.error('   Another process (often a previous `npm run dev`')
        console.error('   that did not shut down cleanly) is still bound to it.')
        console.error('')
        console.error('   Fix it with ONE of the following:')
        console.error(`     1) node scripts/free-port.js   (frees port ${PORT} automatically)`)
        console.error(`     2) lsof -ti:${PORT} | xargs kill -9   (Linux/macOS, manual)`)
        console.error('     3) Change PORT in backend/.env to a free port, e.g. 5001')
        console.error('═══════════════════════════════════════════════')
        process.exit(1)
      }
      console.error('❌ Server error:', err)
      process.exit(1)
    })
  } catch (err) {
    console.error('❌ Startup failed:', err)
    process.exit(1)
  }
}

if (require.main === module) startServer()

module.exports = app
