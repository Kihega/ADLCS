// PATCH-TOKEN-CLEANUP-2026
/**
 * tokenCleanup.js — purges stale one-time login tokens.
 *
 * A one-time token (SADM-/DADM-/VOFF-/HOFF-) is set with a 7-day expiry at
 * creation time (see admin.js). If it's used, auth.js clears it
 * immediately (single-use). If it's NEVER used, nothing else clears it —
 * it just sits in the DB, still technically valid, until its expiry date
 * passes, and even after expiry the hash/expiry columns are never cleared.
 *
 * This job runs once a day and clears loginTokenHash/loginTokenExpires for
 * any account whose token has passed its expiry, regardless of whether it
 * was ever used. It never deletes the admin/officer account itself — only
 * the stale token fields, which is a no-op from the user's perspective
 * (an expired token was already rejected by /auth/validate-token) but
 * keeps the DB from holding onto token hashes indefinitely.
 */
const cron = require('node-cron')
const { prisma } = require('./prisma')

const MODELS = ['superAdmin', 'districtAdmin', 'villageOfficer', 'hospitalOfficer']

async function purgeExpiredTokens() {
  const now = new Date()
  for (const model of MODELS) {
    try {
      const { count } = await prisma[model].updateMany({
        where: {
          loginTokenExpires: { lt: now },
          loginTokenHash: { not: null },
        },
        data: { loginTokenHash: null, loginTokenExpires: null },
      })
      if (count > 0) {
        console.log(`[token-cleanup] cleared ${count} expired token(s) on ${model}`)
      }
    } catch (err) {
      console.error(`[token-cleanup] failed for ${model}:`, err.message)
    }
  }
}

/** Starts the daily cleanup schedule. Call once at server startup. */
function startTokenCleanupJob() {
  // Runs every day at 03:00 server time — low-traffic hours.
  cron.schedule('0 3 * * *', () => {
    purgeExpiredTokens().catch((err) => console.error('[token-cleanup]', err.message))
  })
  // Also run once shortly after boot so a long-idle deploy doesn't wait a
  // full day before its first cleanup.
  setTimeout(() => {
    purgeExpiredTokens().catch((err) => console.error('[token-cleanup]', err.message))
  }, 30_000)
  console.log('[token-cleanup] scheduled daily at 03:00')
}

module.exports = { startTokenCleanupJob, purgeExpiredTokens }
