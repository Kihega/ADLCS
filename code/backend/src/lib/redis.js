const Redis = require('ioredis')

let redis = null
let redisAvailable = false

function connectRedis() {
  // If no REDIS_URL set (local dev without Redis), skip gracefully
  if (!process.env.REDIS_URL) {
    console.warn('⚠️  REDIS_URL not set — Redis disabled (dev mode only)')
    return null
  }

  if (redis && redis.status === 'ready') return redis

  redis = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    connectTimeout: 10000,
    lazyConnect: false,
    retryStrategy(times) {
      if (times > 3) {
        console.error('❌ Redis retry limit reached — running without cache')
        redisAvailable = false
        return null  // stop retrying
      }
      return Math.min(times * 500, 2000)
    },
  })

  redis.on('ready', () => {
    redisAvailable = true
    console.log('✅ Redis connected successfully')
  })

  redis.on('error', (err) => {
    redisAvailable = false
    console.error('❌ Redis error:', err.message)
  })

  redis.on('close', () => {
    redisAvailable = false
    console.log('⚠️  Redis connection closed')
  })

  return redis
}

function getRedis() {
  if (!redis) {
    return connectRedis()
  }
  return redis
}

function isRedisReady() {
  return redisAvailable && redis && redis.status === 'ready'
}

module.exports = { connectRedis, getRedis, isRedisReady }
