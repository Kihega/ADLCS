/**
 * parentIdentifier.test.js — parent NIN / Birth-ID handling on birth registration.
 *
 * Covers:
 *   • classifyIdentifier()   BID vs NIN vs invalid
 *   • resolveParentCitizen() local BID match, local NIN match, NIDA fallback
 *   • nidaClient             stub reports "not available" until configured
 *   • removed NIN-issuance   /village/nin-issue and /village/birth-lookup are gone
 */
jest.mock('../src/lib/prisma', () => ({ prisma: {} }))
jest.mock('../src/middleware/auth', () => ({
  requireAuth: (_req, _res, next) => next(),
  requireRole: () => (_req, _res, next) => next(),
}))

const { classifyIdentifier, resolveParentCitizen } = require('../src/lib/parentIdentifier')
const nida = require('../src/lib/nidaClient')

const fakePrisma = (rows) => ({
  citizen: {
    findFirst: jest.fn(async ({ where }) => {
      if (where.birthId) return rows.find((r) => r.birthId === where.birthId) || null
      if (where.OR) return rows.find((r) => where.OR.some((c) => c.nationalId === r.nationalId)) || null
      return null
    }),
  },
})

describe('classifyIdentifier', () => {
  it('detects a Birth ID', () => {
    expect(classifyIdentifier('bid-ab12cd34ef')).toEqual({ type: 'BID', value: 'BID-AB12CD34EF' })
  })
  it('detects a 20-digit NIN with or without dashes', () => {
    expect(classifyIdentifier('19850315-07031-00001-24').type).toBe('NIN')
    expect(classifyIdentifier('19850315070310000124')).toEqual({ type: 'NIN', value: '19850315070310000124' })
  })
  it('still accepts legacy NIDA-generated numbers', () => {
    expect(classifyIdentifier('NIDA-ABCDEFGHJKLM-42').type).toBe('NIN')
  })
  it('rejects junk and empty input', () => {
    expect(classifyIdentifier('12345').type).toBeNull()
    expect(classifyIdentifier('').type).toBeNull()
    expect(classifyIdentifier(undefined).type).toBeNull()
  })
})

describe('resolveParentCitizen', () => {
  const rows = [
    { id: 7, birthId: 'BID-AB12CD34EF', nationalId: null },
    { id: 9, birthId: 'BID-ZZ99YY88XX', nationalId: '19850315070310000124' },
  ]
  it('resolves a BID locally', async () => {
    const r = await resolveParentCitizen(fakePrisma(rows), 'BID-AB12CD34EF', nida)
    expect(r.citizenId).toBe(7)
    expect(r.source).toBe('local')
  })
  it('resolves a NIN that exists locally', async () => {
    const r = await resolveParentCitizen(fakePrisma(rows), '19850315-07031-00001-24', nida)
    expect(r.citizenId).toBe(9)
    expect(r.type).toBe('NIN')
  })
  it('keeps an unknown NIN as unverified (NIDA not connected) without a citizen link', async () => {
    const r = await resolveParentCitizen(fakePrisma(rows), '19900101000010000199', nida)
    expect(r.citizenId).toBeUndefined()
    expect(r.source).toBe('unverified')
    expect(r.value).toBe('19900101000010000199')
  })
  it('reports an unknown BID as unresolved', async () => {
    const r = await resolveParentCitizen(fakePrisma(rows), 'BID-NOPE123456', nida)
    expect(r.citizenId).toBeUndefined()
    expect(r.source).toBe('unresolved')
  })
  it('flags malformed identifiers as invalid', async () => {
    const r = await resolveParentCitizen(fakePrisma(rows), 'abc', nida)
    expect(r.source).toBe('invalid')
  })
})

describe('nidaClient (external API — not implemented yet)', () => {
  it('is unavailable while NIDA_API_URL / NIDA_API_KEY are unset', async () => {
    delete process.env.NIDA_API_URL
    delete process.env.NIDA_API_KEY
    expect(nida.isConfigured()).toBe(false)
    expect(await nida.lookupByNin('19850315070310000124')).toEqual({ available: false, reason: 'NIDA_NOT_CONFIGURED' })
  })
  it('degrades gracefully when configured but the integration is still a stub', async () => {
    process.env.NIDA_API_URL = 'https://nida.example'
    process.env.NIDA_API_KEY = 'k'
    expect((await nida.lookupByNin('19850315070310000124')).available).toBe(false)
    delete process.env.NIDA_API_URL
    delete process.env.NIDA_API_KEY
  })
})

describe('village router — NIN registration removed', () => {
  const paths = require('../src/routes/village').stack.filter((l) => l.route).map((l) => l.route.path)
  it('no longer exposes NIN issuance or its birth lookup', () => {
    expect(paths).not.toContain('/nin-issue')
    expect(paths).not.toContain('/birth-lookup')
  })
  it('keeps the other village endpoints', () => {
    expect(paths).toContain('/citizen')
  })
})
