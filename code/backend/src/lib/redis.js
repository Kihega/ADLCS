const Redis = require('ioredis')

let redis = null

function connectRedis() {
  if (redis && redis.status === 'ready') return redis

  redis = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    retryStrategy(times) {
      if (times > 3) {
        console.error('❌ Redis retry limit reached')
        return null
      }
      return Math.min(times * 500, 2000)
    },
  })

  redis.on('ready', () => {
    console.log('✅ Redis connected successfully')
  })

  redis.on('error', (err) => {
    console.error('❌ Redis error:', err.message)
  })

  redis.on('close', () => {
    console.log('⚠️ Redis connection closed')
  })

  return redis
}

function getRedis() {
  if (!redis) {
    return connectRedis()
  }
  return redis
}

module.exports = { connectRedis, getRedis }
