/**
 * backfill-citizen-geo.js - one-off: fill Citizen.regionId from the citizen's village
 * (village -> ward -> district -> region) for rows registered before the hierarchy was tracked.
 *   cd code/backend && node scripts/backfill-citizen-geo.js
 */
const { prisma } = require('../src/lib/prisma')

async function main() {
  const rows = await prisma.citizen.findMany({
    where: { regionId: null, currentVillageId: { not: null } },
    select: { id: true, currentVillage: { select: { ward: { select: { district: { select: { regionId: true } } } } } } },
  })
  let n = 0
  for (const c of rows) {
    const rid = c.currentVillage?.ward?.district?.regionId
    if (!rid) continue
    await prisma.citizen.update({ where: { id: c.id }, data: { regionId: rid } })
    n++
  }
  console.log(`regionId filled for ${n} of ${rows.length} citizen(s)`)
}
main().catch((e) => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
