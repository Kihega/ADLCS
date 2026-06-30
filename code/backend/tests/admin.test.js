/**
 * admin.test.js — TzCRVS Admin Dashboard Route Integration Tests
 *
 * All external dependencies (Prisma, Redis) are mocked so tests run
 * in CI without a real database or Redis instance.
 *
 * Coverage:
 *   • requireAuth / requireRole enforcement (401 / 403)
 *   • GET /api/admin/overview            — super_admin
 *   • GET /api/admin/geo/regions         — super_admin
 *   • GET /api/admin/district-admins     — 403 for district_admin
 *   • GET /api/admin/village-officers    — district_admin (scoped)
 */

// ── Mock Prisma ─────────────────────────────────────────────────────────────
jest.mock('../src/lib/prisma', () => ({
  prisma: {
    citizen:         { count: jest.fn().mockResolvedValue(0), groupBy: jest.fn().mockResolvedValue([]) },
    districtAdmin:   { count: jest.fn().mockResolvedValue(0), findUnique: jest.fn().mockResolvedValue({ districtId: 1 }), findMany: jest.fn().mockResolvedValue([]) },
    villageOfficer:  { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
    hospitalOfficer: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
    superAdmin:      { findMany: jest.fn().mockResolvedValue([]) },
    publicUser:      { findMany: jest.fn().mockResolvedValue([]) },
    auditLog:        { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue({}) },
    region:          { findMany: jest.fn().mockResolvedValue([{ id: 1, name: 'Dodoma', jurisdiction: 'mainland' }]) },
    district:        { findMany: jest.fn().mockResolvedValue([]) },
    ward:            { findMany: jest.fn().mockResolvedValue([]) },
    village:         { findMany: jest.fn().mockResolvedValue([]) },
    migration:       { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
    marriage:        { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]), groupBy: jest.fn().mockResolvedValue([]) },
    birth:           { count: jest.fn().mockResolvedValue(0) },
    death:           { count: jest.fn().mockResolvedValue(0) },
    $queryRaw:       jest.fn().mockResolvedValue([{ '?column?': 1 }]),
  },
  connectDB: jest.fn().mockResolvedValue(undefined),
}))

// ── Mock Redis ──────────────────────────────────────────────────────────────
jest.mock('../src/lib/redis', () => ({
  connectRedis: jest.fn().mockReturnValue(null),
  getRedis:     jest.fn().mockReturnValue(null),
  isRedisReady: jest.fn().mockReturnValue(false),
}))

const request = require('supertest')
const app = require('../src/index')
const { signAccess } = require('../src/lib/jwt')

const superAdminToken    = signAccess({ sub: 'super-1', role: 'super_admin',    email: 'super@nbs.go.tz' })
const districtAdminToken = signAccess({ sub: 'dist-1',  role: 'district_admin', email: 'dist@nbs.go.tz' })

describe('Admin dashboard routes', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/admin/overview')
    expect(res.status).toBe(401)
  })

  it('rejects roles other than super_admin / district_admin', async () => {
    const officerToken = signAccess({ sub: 'off-1', role: 'village_officer', email: 'off@nbs.go.tz' })
    const res = await request(app).get('/api/admin/overview').set('Authorization', `Bearer ${officerToken}`)
    expect(res.status).toBe(403)
  })

  it('returns overview stats for super_admin', async () => {
    const res = await request(app).get('/api/admin/overview').set('Authorization', `Bearer ${superAdminToken}`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toHaveProperty('totalPopulation')
    expect(res.body.data).toHaveProperty('systemHealth')
  })

  it('returns geo regions', async () => {
    const res = await request(app).get('/api/admin/geo/regions').set('Authorization', `Bearer ${superAdminToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
  })

  it('forbids district_admin from listing district admins', async () => {
    const res = await request(app).get('/api/admin/district-admins').set('Authorization', `Bearer ${districtAdminToken}`)
    expect(res.status).toBe(403)
  })

  it('allows district_admin to list (scoped) village officers', async () => {
    const res = await request(app).get('/api/admin/village-officers').set('Authorization', `Bearer ${districtAdminToken}`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })

  it('validates status on village officer status update', async () => {
    const res = await request(app)
      .patch('/api/admin/village-officers/some-id')
      .set('Authorization', `Bearer ${districtAdminToken}`)
      .send({ status: 'not-a-status' })
    expect(res.status).toBe(400)
  })
})
