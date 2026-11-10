const express = require('express')
const router = express.Router()
const { prisma } = require('../lib/prisma')
const { getRedis } = require('../lib/redis')

// PATCH-V3-2026-11: cheap liveness probe used by the mobile app. It never touches
// the database or Redis, so it answers 200 the moment the server is awake -
// the full check below returns 503 whenever Redis/DB is "degraded".
router.get('/live', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() })
})

router.get('/', async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'Tanzania Digital Live Census API',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    uptime: `${Math.floor(process.uptime())} seconds`,
    database: 'disconnected',
    redis: 'disconnected',
  }

  // Check database
  try {
    await prisma.$executeRaw`SELECT 1`
    health.database = 'connected'
  } catch (error) {
    try {
      // fallback check
      await prisma.superAdmin.count()
      health.database = 'connected'
    } catch (err) {
      health.database = `error: ${err.message}`
      health.status = 'degraded'
    }
  }

  // Check Redis
  try {
    const redis = getRedis()
    const ping = await redis.ping()
    if (ping === 'PONG') {
      health.redis = 'connected'
    }
  } catch (error) {
    health.redis = `error: ${error.message}`
    health.status = 'degraded'
  }

  const statusCode = health.status === 'ok' ? 200 : 503
  res.status(statusCode).json(health)
})

module.exports = router
