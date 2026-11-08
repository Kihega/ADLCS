/**
 * nidaClient / parentIdentifier unit tests — no database needed.
 */
const { mapPerson, isConfigured, lookupByNin } = require('../src/lib/nidaClient')
const { classifyIdentifier } = require('../src/lib/parentIdentifier')

describe('nidaClient placeholder', () => {
  const saved = process.env.NIDA_API_URL
  afterEach(() => {
    if (saved === undefined) delete process.env.NIDA_API_URL
    else process.env.NIDA_API_URL = saved
  })

  test('is not configured when NIDA_API_URL is empty', async () => {
    process.env.NIDA_API_URL = ''
    expect(isConfigured()).toBe(false)
    await expect(lookupByNin('12345678901234567890')).resolves.toEqual({
      available: false,
      reason: 'NIDA_NOT_CONFIGURED',
    })
  })

  test('mapPerson understands snake_case and nested payloads', () => {
    const p = mapPerson({ data: { first_name: 'Asha', surname: 'Juma', sex: 'F', dob: '1990-05-01' } })
    expect(p).toMatchObject({ firstName: 'Asha', surname: 'Juma', gender: 'female' })
    expect(p.dateOfBirth).toMatch(/^1990-05-01/)
  })

  test('mapPerson returns null without a usable name', () => {
    expect(mapPerson({ foo: 'bar' })).toBeNull()
  })
})

describe('identifier classification (BID or NIN only)', () => {
  test('names are rejected', () => {
    expect(classifyIdentifier('John Makonde').type).toBeNull()
  })
  test('BID and NIN are accepted', () => {
    expect(classifyIdentifier('bid-abc123xyz9').type).toBe('BID')
    expect(classifyIdentifier('19850315-07031-00001-24').type).toBe('NIN')
  })
})
