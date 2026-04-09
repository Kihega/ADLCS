const Redis = require('ioredis')

let redis

function connectRedis() {
  try {
    redis = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 3) {
          console.error('❌ Redis retry limit reached')
          return null
        }
        return Math.min(times * 200, 1000)
      },
    })

    redis.on('connect', () => {
      console.log('✅ Redis connected successfully')
    })

    redis.on('error', (err) => {
      console.error('❌ Redis error:', err.message)
    })

    return redis
  } catch (error) {
    console.error('❌ Redis connection failed:', error.message)
  }
}

function getRedis() {
  if (!redis) {
    throw new Error('Redis not initialized. Call connectRedis() first.')
  }
  return redis
}

module.exports = { connectRedis, getRedis }
