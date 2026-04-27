/**
 * index.js — ADLCS Backend Entry Point
 *
 * Sets up Express, applies security middleware, mounts all API routes,
 * and starts the HTTP server.
 *
 * The server start is guarded with require.main === module so Jest can
 * import this file as a test subject without binding a port.
 */

require('dotenv').config()
const express = require('express')
const morgan  = require('morgan')

const { connectDB } = require('./lib/prisma')
const { connectRedis } = require('./lib/redis')
const { helmetConfig, corsConfig, globalLimiter } = require('./middleware/security')

// ── Route modules ─────────────────────────────────────────────────────────────
const healthRouter = require('./routes/health')
const authRouter   = require('./routes/auth')

const app  = express()
const PORT = process.env.PORT || 5000

// ── Global middleware ─────────────────────────────────────────────────────────
app.use(helmetConfig)
app.use(corsConfig)
app.use(globalLimiter)
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// HTTP request logging — verbose in dev, Apache-combined format in production
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'))

// ── API routes ────────────────────────────────────────────────────────────────
app.use('/api/health', healthRouter)
app.use('/api/auth',   authRouter)

// ── 404 handler ───────────────────────────────────────────────────────────────
// Express 4: no wildcard needed — any unmatched request falls through here
app.use((req, res) => {
  res.status(404).json({
    error:  'Route not found',
    path:   req.originalUrl,
    method: req.method,
  })
})

// ── Global error handler ──────────────────────────────────────────────────────
// Must have 4 parameters for Express to recognise it as an error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('❌ Unhandled error:', err.message)

  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'CORS: Origin not allowed' })
  }

  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message,
  })
})

// ── Server start ──────────────────────────────────────────────────────────────
// Only start the HTTP server when this file is run directly (node src/index.js).
// When required by Jest, the app is exported without binding a port.
async function startServer() {
  try {
    connectRedis()
    await connectDB()
    app.listen(PORT, () => {
      console.log('═══════════════════════════════════════════')
      console.log('  ADLCS — Tanzania Digital Live Census API')
      console.log(`  🚀 Server running on port ${PORT}`)
      console.log(`  🌍 Environment: ${process.env.NODE_ENV || 'development'}`)
      console.log(`  📡 Health: http://localhost:${PORT}/api/health`)
      console.log(`  🔐 Auth:   http://localhost:${PORT}/api/auth`)
      console.log('═══════════════════════════════════════════')
    })
  } catch (error) {
    console.error('❌ Failed to start server:', error.message)
    process.exit(1)
  }
}

// Guard: only start when executed directly, not when imported by tests
if (require.main === module) {
  startServer()
}

module.exports = app
