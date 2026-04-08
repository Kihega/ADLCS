const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' 
    ? ['query', 'error', 'warn'] 
    : ['error'],
})

// Test database connection
async function connectDB() {
  try {
    await prisma.$connect()
    console.log('✅ PostgreSQL connected successfully')
  } catch (error) {
    console.error('❌ PostgreSQL connection failed:', error.message)
    process.exit(1)
  }
}

module.exports = { prisma, connectDB }
