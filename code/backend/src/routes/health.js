const express = require('express')
const router = express.Router()
const { prisma } = require('../lib/prisma')
const { getRedis } = require('../lib/redis')

// GET /api/health
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
    await prisma.$queryRaw`SELECT 1`
    health.database = 'connected'
  } catch (error) {
    health.database = `error: ${error.message}`
    health.status = 'degraded'
  }

  // Check Redis
  try {
    const redis = getRedis()
    await redis.ping()
    health.redis = 'connected'
  } catch (error) {
    health.redis = `error: ${error.message}`
    health.status = 'degraded'
  }

  const statusCode = health.status === 'ok' ? 200 : 503
  res.status(statusCode).json(health)
})

module.exports = router
