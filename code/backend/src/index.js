require('dotenv').config()
const express = require('express')
const morgan = require('morgan')

const { connectDB } = require('./lib/prisma')
const { connectRedis } = require('./lib/redis')
const {
  helmetConfig,
  corsConfig,
  globalLimiter,
} = require('./middleware/security')

// Route imports
const healthRouter = require('./routes/health')

const app = express()
const PORT = process.env.PORT || 5000

// ─── Security Middleware ───────────────────────────────────
app.use(helmetConfig)
app.use(corsConfig)
app.use(globalLimiter)

// ─── General Middleware ────────────────────────────────────
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'))

// ─── Routes ───────────────────────────────────────────────
app.use('/api/health', healthRouter)

// ─── 404 Handler ──────────────────────────────────────────
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl,
    method: req.method,
  })
})

// ─── Global Error Handler ─────────────────────────────────
app.use((err, req, res, next) => {
  console.error('❌ Error:', err.message)

  // CORS error
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'CORS: Origin not allowed' })
  }

  // Generic error (never expose stack in production)
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message,
  })
})

// ─── Start Server ─────────────────────────────────────────
async function startServer() {
  try {
    // Connect to databases
    connectRedis()
    await connectDB()

    app.listen(PORT, () => {
      console.log('═══════════════════════════════════════════')
      console.log('  Tanzania Digital Live Census API')
      console.log(`  🚀 Server running on port ${PORT}`)
      console.log(`  🌍 Environment: ${process.env.NODE_ENV || 'development'}`)
      console.log(`  📡 Health: http://localhost:${PORT}/api/health`)
      console.log('═══════════════════════════════════════════')
    })
  } catch (error) {
    console.error('❌ Failed to start server:', error.message)
    process.exit(1)
  }
}

startServer()

module.exports = app
