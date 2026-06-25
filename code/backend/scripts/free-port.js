#!/usr/bin/env node
/**
 * scripts/free-port.js
 * ─────────────────────────────────────────────────────────────────────────
 * BUGFIX-1: kills whatever process is bound to the backend's configured
 * PORT (read from .env, default 5000) BEFORE the server starts, so a
 * stale process from a previous `npm run dev` never causes EADDRINUSE.
 *
 * Wired up as the `predev` npm script — runs automatically before `dev`.
 * Safe to run manually too: `node scripts/free-port.js`
 */
require('dotenv').config()
const { execSync } = require('child_process')

const PORT = process.env.PORT || 5000

function tryKill(cmd) {
  try {
    const out = execSync(cmd, { stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim()
    return out
  } catch (e) {
    return ''
  }
}

function main() {
  const platform = process.platform

  if (platform === 'win32') {
    // Windows: find PID via netstat, kill via taskkill
    const out = tryKill(`netstat -ano | findstr :${PORT}`)
    const pids = [...new Set(out.split('\n').map(l => l.trim().split(/\s+/).pop()).filter(Boolean))]
    pids.forEach(pid => tryKill(`taskkill /PID ${pid} /F`))
    if (pids.length) console.log(`✔ Freed port ${PORT} (killed PID ${pids.join(', ')})`)
    else console.log(`✔ Port ${PORT} already free`)
    return
  }

  // Linux / macOS / Kali: prefer lsof, fall back to fuser
  let pids = tryKill(`lsof -t -i:${PORT}`).split('\n').filter(Boolean)
  if (!pids.length) {
    tryKill(`fuser -k ${PORT}/tcp`)
    console.log(`✔ Port ${PORT} checked (fuser fallback)`)
    return
  }
  pids.forEach(pid => tryKill(`kill -9 ${pid}`))
  console.log(`✔ Freed port ${PORT} (killed PID ${pids.join(', ')})`)
}

main()
