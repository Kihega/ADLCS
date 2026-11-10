/**
 * backfill-birth-origin.js - one-off: give births that were saved WITHOUT a village/street of
 * origin the village of their mother (else father), so a village officer can find them by BID.
 *   cd code/backend && node scripts/backfill-birth-origin.js
 */
const { prisma } = require('../src/lib/prisma')

async function main() {
  const births = await prisma.birth.findMany({
    where: { originVillageId: null },
    select: {
      id: true,
      mother: { select: { currentVillageId: true } },
      father: { select: { currentVillageId: true } },
    },
  })
  let n = 0
  for (const b of births) {
    const vid = b.mother?.currentVillageId ?? b.father?.currentVillageId
    if (!vid) continue
    await prisma.birth.update({ where: { id: b.id }, data: { originVillageId: vid } })
    n++
  }
  console.log(`village of origin set for ${n} of ${births.length} birth(s) that had none`)
}
main().catch((e) => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
