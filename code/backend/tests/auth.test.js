/**
 * auth.test.js — ADLCS Auth Route Integration Tests
 *
 * All external dependencies (Prisma, Redis) are mocked so tests run
 * in CI without a real database or Redis instance.
 *
 * Coverage:
 *   POST /api/auth/login       — validation, unknown user, suspended, wrong pw, success, MFA
 *   POST /api/auth/mfa/verify  — missing token, invalid code
 *   POST /api/auth/refresh     — missing token, invalid token
 *   POST /api/auth/logout      — no auth, success
 *   GET  /api/auth/me          — no auth, success
 */

// ── Mock Prisma ───────────────────────────────────────────────────────────────
// jest.mock must be called before any require that pulls in the real module
jest.mock('../src/lib/prisma', () => ({
  prisma: {
    superAdmin:      { findUnique: jest.fn(), update: jest.fn() },
    districtAdmin:   { findUnique: jest.fn(), update: jest.fn() },
    villageOfficer:  { findUnique: jest.fn(), update: jest.fn() },
    hospitalOfficer: { findUnique: jest.fn(), update: jest.fn() },
    publicUser:      { findUnique: jest.fn(), update: jest.fn() },
  },
  connectDB: jest.fn().mockResolvedValue(undefined),
}))

// ── Mock Redis ────────────────────────────────────────────────────────────────
const mockRedis = {
  setex: jest.fn().mockResolvedValue('OK'),
  get:   jest.fn().mockResolvedValue(null),
  del:   jest.fn().mockResolvedValue(1),
}
jest.mock('../src/lib/redis', () => ({
  connectRedis: jest.fn().mockReturnValue(mockRedis),
  getRedis:     jest.fn().mockReturnValue(mockRedis),
}))

// ── Imports (after mocks are registered) ─────────────────────────────────────
const request  = require('supertest')
const bcrypt   = require('bcryptjs')
const crypto   = require('crypto')
const app      = require('../src/index')
const { prisma }  = require('../src/lib/prisma')
const { signAccess, signRefresh } = require('../src/lib/jwt')

// Pre-hash a known password with low rounds (4) so tests stay fast
const KNOWN_PASSWORD = 'Password123!'
const KNOWN_HASH     = bcrypt.hashSync(KNOWN_PASSWORD, 4)

// A representative active SuperAdmin record
const MOCK_SUPER_ADMIN = {
  id:              'uuid-super-1',
  email:           'admin@nbs.go.tz',
  passwordHash:    KNOWN_HASH,
  fullName:        'Test Super Admin',
  employeeId:      'EMP001',
  nidaNumber:      '19900101-00001-00001-01',
  status:          'active',
  mfaEnabled:      false,
  mfaSecret:       null,
  mobile:          '+255700000001',
  department:      'IT',
  profilePhotoUrl: null,
  loginTokenHash:  null,
  loginTokenExpires: null,
  createdAt:       new Date(),
  lastLogin:       null,
}

// Helper: clear all mock call history before each test
function resetAllMocks() {
  jest.clearAllMocks()
  // Default: every model returns null (user not found)
  prisma.superAdmin.findUnique.mockResolvedValue(null)
  prisma.districtAdmin.findUnique.mockResolvedValue(null)
  prisma.villageOfficer.findUnique.mockResolvedValue(null)
  prisma.hospitalOfficer.findUnique.mockResolvedValue(null)
  prisma.publicUser.findUnique.mockResolvedValue(null)
  prisma.superAdmin.update.mockResolvedValue({})
}

// ── POST /api/auth/login ──────────────────────────────────────────────────────
describe('POST /api/auth/login', () => {
  beforeEach(resetAllMocks)

  it('400 — missing email', async () => {
    const res = await request(app).post('/api/auth/login').send({ password: KNOWN_PASSWORD })
    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
  })

  it('400 — short password', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'admin@nbs.go.tz', password: 'short' })
    expect(res.status).toBe(400)
  })

  it('401 — unknown email', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'nobody@nbs.go.tz', password: KNOWN_PASSWORD })
    expect(res.status).toBe(401)
    expect(res.body.success).toBe(false)
  })

  it('403 — suspended account', async () => {
    prisma.superAdmin.findUnique.mockResolvedValue({ ...MOCK_SUPER_ADMIN, status: 'suspended' })
    const res = await request(app).post('/api/auth/login').send({ email: 'admin@nbs.go.tz', password: KNOWN_PASSWORD })
    expect(res.status).toBe(403)
  })

  it('403 — pending account', async () => {
    prisma.superAdmin.findUnique.mockResolvedValue({ ...MOCK_SUPER_ADMIN, status: 'pending' })
    const res = await request(app).post('/api/auth/login').send({ email: 'admin@nbs.go.tz', password: KNOWN_PASSWORD })
    expect(res.status).toBe(403)
  })

  it('401 — wrong password', async () => {
    prisma.superAdmin.findUnique.mockResolvedValue(MOCK_SUPER_ADMIN)
    const res = await request(app).post('/api/auth/login').send({ email: 'admin@nbs.go.tz', password: 'WrongPassword1!' })
    expect(res.status).toBe(401)
  })

  it('200 — valid credentials, no MFA → returns access + refresh tokens', async () => {
    prisma.superAdmin.findUnique.mockResolvedValue(MOCK_SUPER_ADMIN)
    const res = await request(app).post('/api/auth/login').send({ email: 'admin@nbs.go.tz', password: KNOWN_PASSWORD })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.mfaRequired).toBe(false)
    expect(res.body.accessToken).toBeDefined()
    expect(res.body.refreshToken).toBeDefined()
    // Profile must not contain sensitive fields
    expect(res.body.profile.passwordHash).toBeUndefined()
    expect(res.body.profile.mfaSecret).toBeUndefined()
  })

  it('200 — MFA enabled → returns tempToken only', async () => {
    prisma.superAdmin.findUnique.mockResolvedValue({
      ...MOCK_SUPER_ADMIN,
      mfaEnabled: true,
      mfaSecret:  'JBSWY3DPEHPK3PXP',
    })
    const res = await request(app).post('/api/auth/login').send({ email: 'admin@nbs.go.tz', password: KNOWN_PASSWORD })
    expect(res.status).toBe(200)
    expect(res.body.mfaRequired).toBe(true)
    expect(res.body.tempToken).toBeDefined()
    // No full tokens yet
    expect(res.body.accessToken).toBeUndefined()
    expect(res.body.refreshToken).toBeUndefined()
  })
})

// ── POST /api/auth/mfa/verify ─────────────────────────────────────────────────
describe('POST /api/auth/mfa/verify', () => {
  beforeEach(resetAllMocks)

  it('400 — missing tempToken', async () => {
    const res = await request(app).post('/api/auth/mfa/verify').send({ code: '123456' })
    expect(res.status).toBe(400)
  })

  it('401 — expired / invalid tempToken', async () => {
    const res = await request(app).post('/api/auth/mfa/verify').send({ tempToken: 'bad.token.here', code: '123456' })
    expect(res.status).toBe(401)
  })
})

// ── POST /api/auth/refresh ────────────────────────────────────────────────────
describe('POST /api/auth/refresh', () => {
  it('400 — missing refreshToken', async () => {
    const res = await request(app).post('/api/auth/refresh').send({})
    expect(res.status).toBe(400)
  })

  it('401 — invalid JWT', async () => {
    const res = await request(app).post('/api/auth/refresh').send({ refreshToken: 'not.a.jwt' })
    expect(res.status).toBe(401)
  })
})

// ── POST /api/auth/logout ─────────────────────────────────────────────────────
describe('POST /api/auth/logout', () => {
  it('401 — no Authorization header', async () => {
    const res = await request(app).post('/api/auth/logout')
    expect(res.status).toBe(401)
  })

  it('200 — valid access token → logs out', async () => {
    // Sign a real access token for the mock user
    const token = signAccess({ sub: 'uuid-super-1', role: 'super_admin', email: 'admin@nbs.go.tz' })
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    // Redis del must have been called to invalidate the token
    expect(mockRedis.del).toHaveBeenCalledWith('refresh:super_admin:uuid-super-1')
  })
})

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
describe('GET /api/auth/me', () => {
  beforeEach(resetAllMocks)

  it('401 — no token', async () => {
    const res = await request(app).get('/api/auth/me')
    expect(res.status).toBe(401)
  })

  it('200 — returns safe profile', async () => {
    prisma.superAdmin.findUnique.mockResolvedValue(MOCK_SUPER_ADMIN)
    const token = signAccess({ sub: 'uuid-super-1', role: 'super_admin', email: 'admin@nbs.go.tz' })
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.email).toBe('admin@nbs.go.tz')
    expect(res.body.data.passwordHash).toBeUndefined()
    expect(res.body.data.mfaSecret).toBeUndefined()
  })
})
