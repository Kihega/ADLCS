#!/usr/bin/env python3
"""
fix_dashboard_population_darkmode.py — TzCRVS patch #3

Run from the project root (~/ADLCS):
    python3 fix_dashboard_population_darkmode.py

Idempotent — safe to re-run.

Fixes applied (per handwritten notes):

  1. Dashboard home — second row cards
     The three simple status cards (Security Alerts, Database Online/Offline,
     Redis Online/Offline) are replaced with the four real System-Performance
     cards (PostgreSQL + latency, Redis + latency, Backend Uptime, Node
     Runtime). These cards call apiGetSystemPerformance() which does a proper
     live latency probe rather than the boolean isRedisReady() used by
     /overview, so they remain accurate even when a sub-system is briefly
     degraded. The DashboardSection now loads both apiGetOverview() AND
     apiGetSystemPerformance() in parallel.

  2. Dashboard home — first row cards showing zero
     The /overview backend route queries only the `citizens` table, which
     holds adults who have been issued a NIN. Children who have a birth
     record but have not yet turned 18 and registered for NIN are stored
     in the `births` table with `childCitizenId = NULL`. These are not
     counted, causing the dashboard totalPopulation (and M/F split) to
     show far fewer people than actually exist.
     Fix: /overview now adds unlinked birth records to every population
     counter (total, male, female). The same logic is applied to
     /population so the pyramid and age-distribution charts are also
     complete.

  3. Population query — include children without NIN (Birth model)
     Three-priority lookup (also described in notes):
       a) citizen WITH birth record → already in citizens table → count once
       b) citizen WITHOUT birth record (seeded/test) → in citizens table → count
       c) birth record with childCitizenId IS NULL (child, no NIN yet) → add from births
     For age-band breakdown, children's ages are computed from dateOfBirth.
     For geographic filtering of unlinked births, the facility's districtId
     is used so district_admin counts remain district-scoped.

  4. Dark/light mode — session-scoped, login page excluded
     The current useTheme() hook stores the preference in localStorage under
     a single key 'tzcrvs_theme' — shared across all users on the same
     device, and leaks into the login page because the CSS class stays on
     <html> even after logout.
     Fixed:
       • Key is now 'tzcrvs_theme_<userId>' — different users on the same
         device each have their own preference.
       • A cleanup effect removes the 'tzcrvs-light' class from <html>
         when the AdminDashboard unmounts (i.e. after logout) so the login
         page is always displayed in the default dark theme.
       • useTheme() now accepts userId so the key is computed correctly.
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
WEB  = ROOT / "code" / "web"  / "src"
BACK = ROOT / "code" / "backend" / "src"

CHANGED, SKIPPED, FAILED = [], [], []

def read(p):  return p.read_text(encoding="utf-8")
def write(p, t): p.write_text(t, encoding="utf-8")

def patch(path, old, new, marker, label):
    if not path.exists():
        FAILED.append(f"{label}: {path} not found"); return
    t = read(path)
    if marker in t:
        SKIPPED.append(label); return
    if old not in t:
        FAILED.append(f"{label}: anchor not found — manual review needed"); return
    write(path, t.replace(old, new, 1))
    CHANGED.append(label)


# ─────────────────────────────────────────────────────────────────────────────
# Fix 1 & 2 — DashboardSection: load perf data + replace second-row cards
# ─────────────────────────────────────────────────────────────────────────────
def fix_dashboard_section_frontend():
    path = WEB / "pages" / "AdminDashboard.jsx"

    # 1a. Add perf state + load apiGetSystemPerformance in parallel
    old_load = """\
function DashboardSection({ role }) {
  const [overview, setOverview] = useState(null)
  const [population, setPopulation] = useState(null)
  const [recentLogs, setRecentLogs] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [ov, pop, logs] = await Promise.all([
        api.apiGetOverview(),
        api.apiGetPopulation({}),
        api.apiGetAuditLogs({ limit: 6 }),
      ])
      setOverview(ov.data)
      setPopulation(pop.data)
      setRecentLogs(logs.data || [])
    } catch (err) {
      console.error('[dashboard]', err)
    } finally {
      setLoading(false)
    }
  }, [])"""
    new_load = """\
// PATCH-POP-3: DashboardSection also loads system-performance for accurate
// DB/Redis status cards (real latency probes instead of boolean isRedisReady)
function DashboardSection({ role }) {
  const [overview, setOverview] = useState(null)
  const [population, setPopulation] = useState(null)
  const [recentLogs, setRecentLogs] = useState([])
  const [perf, setPerf] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [ov, pop, logs, perfRes] = await Promise.all([
        api.apiGetOverview(),
        api.apiGetPopulation({}),
        api.apiGetAuditLogs({ limit: 6 }),
        api.apiGetSystemPerformance().catch(() => null),  // graceful — not fatal if role has no access
      ])
      setOverview(ov.data)
      setPopulation(pop.data)
      setRecentLogs(logs.data || [])
      setPerf(perfRes?.data || null)
    } catch (err) {
      console.error('[dashboard]', err)
    } finally {
      setLoading(false)
    }
  }, [])"""
    patch(path, old_load, new_load, "PATCH-POP-3", "AdminDashboard.jsx DashboardSection — add perf state + parallel load")

    # 1b. Replace the second-row cards (Security Alerts / DB / Redis)
    #     with the 4 proper system-performance cards.
    old_cards = """\
        <StatCard Icon={ShieldAlert} label="Security Alerts (24h)" value={overview?.securityAlerts24h ?? 0}
          sub="warning + critical" accent="text-red-400" />
        <StatCard Icon={Database}
          label="Database"
          value={overview?.systemHealth?.databaseOk ? 'Online' : 'Offline'}
          accent={overview?.systemHealth?.databaseOk ? 'text-[#00ff9d]' : 'text-red-400'} />
        <StatCard Icon={Server}
          label="Redis Cache"
          value={overview?.systemHealth?.redisOk ? 'Online' : 'Offline'}
          accent={overview?.systemHealth?.redisOk ? 'text-[#00ff9d]' : 'text-gray-500'} />"""
    new_cards = """\
        {/* PATCH-POP-3: replaced simple boolean health cards with real system-perf cards */}
        <StatCard Icon={Database} label="PostgreSQL (Supabase)" value={perf?.databaseOk ? 'Online' : 'Offline'}
          sub={perf?.dbLatencyMs != null ? `${perf.dbLatencyMs} ms` : ''}
          accent={perf?.databaseOk ? 'text-[#00ff9d]' : 'text-red-400'} />
        <StatCard Icon={Server} label="Redis (Upstash)" value={perf?.redisOk ? 'Online' : 'Offline'}
          sub={perf?.redisLatencyMs != null ? `${perf.redisLatencyMs} ms` : ''}
          accent={perf?.redisOk ? 'text-[#00ff9d]' : 'text-gray-500'} />
        <StatCard Icon={Cpu} label="Backend Uptime" value={perf ? `${Math.floor((perf.uptimeSeconds||0)/3600)}h ${Math.floor(((perf.uptimeSeconds||0)%3600)/60)}m` : '—'} accent="text-[#00d4ff]" />
        <StatCard Icon={Globe} label="Node Runtime" value={perf?.nodeVersion || '—'} accent="text-purple-400" />"""
    patch(path, old_cards, new_cards, "PATCH-POP-3: replaced simple boolean health cards", "AdminDashboard.jsx DashboardSection — replace second-row cards with system-perf cards")


# ─────────────────────────────────────────────────────────────────────────────
# Fix 2 & 3 — Backend /overview: include unlinked births in population totals
# ─────────────────────────────────────────────────────────────────────────────
def fix_overview_backend():
    path = BACK / "routes" / "admin.js"

    old_overview_block = """\
    const [
      totalPopulation, maleCount, femaleCount,
      districtAdminsTotal, districtAdminsPending,
      villageOfficersTotal, villageOfficersPending,
      hospitalOfficersTotal, hospitalOfficersPending,
      securityAlerts24h,
      dbCheck,
    ] = await Promise.all([
      prisma.citizen.count({ where: citizenWhere }),
      prisma.citizen.count({ where: { ...citizenWhere, gender: 'male' } }),
      prisma.citizen.count({ where: { ...citizenWhere, gender: 'female' } }),
      req.user.role === 'super_admin' ? prisma.districtAdmin.count() : Promise.resolve(null),
      req.user.role === 'super_admin' ? prisma.districtAdmin.count({ where: { status: 'pending' } }) : Promise.resolve(null),
      prisma.villageOfficer.count({ where: officerWhere }),
      prisma.villageOfficer.count({ where: { ...officerWhere, status: 'pending' } }),
      prisma.hospitalOfficer.count({ where: officerWhere }),
      prisma.hospitalOfficer.count({ where: { ...officerWhere, status: 'pending' } }),
      prisma.auditLog.count({ where: { ...auditWhere, severity: { in: ['warning', 'critical'] }, timestamp: { gte: since24h } } }),
      prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
    ])

    return res.json({
      success: true,
      data: {
        totalPopulation,
        maleCount,
        femaleCount,
        malePct:   totalPopulation ? Number(((maleCount / totalPopulation) * 100).toFixed(1))   : 0,
        femalePct: totalPopulation ? Number(((femaleCount / totalPopulation) * 100).toFixed(1)) : 0,
        districtAdminsTotal,
        districtAdminsPending,
        villageOfficersTotal,
        villageOfficersPending,
        hospitalOfficersTotal,
        hospitalOfficersPending,
        securityAlerts24h,
        systemHealth: {
          databaseOk: dbCheck,
          redisOk:    isRedisReady(),
        },
      },
    })"""
    new_overview_block = """\
    // PATCH-POP-3: build the geo-filter for unlinked births.
    // Births belong to a HealthFacility which has a districtId — use that
    // to scope district_admin counts. super_admin gets all births.
    const birthGeoWhere = req.user.role === 'district_admin'
      ? { childCitizenId: null, facility: { districtId: adminDistrictId } }
      : { childCitizenId: null }

    const [
      citizenCount, maleCitizenCount, femaleCitizenCount,
      unlinkedBirthCount, maleUnlinkedBirths, femaleUnlinkedBirths,
      districtAdminsTotal, districtAdminsPending,
      villageOfficersTotal, villageOfficersPending,
      hospitalOfficersTotal, hospitalOfficersPending,
      securityAlerts24h,
      dbCheck,
    ] = await Promise.all([
      prisma.citizen.count({ where: citizenWhere }),
      prisma.citizen.count({ where: { ...citizenWhere, gender: 'male' } }),
      prisma.citizen.count({ where: { ...citizenWhere, gender: 'female' } }),
      // PATCH-POP-3: add children with birth record but no NIN yet
      prisma.birth.count({ where: birthGeoWhere }),
      prisma.birth.count({ where: { ...birthGeoWhere, gender: 'male' } }),
      prisma.birth.count({ where: { ...birthGeoWhere, gender: 'female' } }),
      req.user.role === 'super_admin' ? prisma.districtAdmin.count() : Promise.resolve(null),
      req.user.role === 'super_admin' ? prisma.districtAdmin.count({ where: { status: 'pending' } }) : Promise.resolve(null),
      prisma.villageOfficer.count({ where: officerWhere }),
      prisma.villageOfficer.count({ where: { ...officerWhere, status: 'pending' } }),
      prisma.hospitalOfficer.count({ where: officerWhere }),
      prisma.hospitalOfficer.count({ where: { ...officerWhere, status: 'pending' } }),
      prisma.auditLog.count({ where: { ...auditWhere, severity: { in: ['warning', 'critical'] }, timestamp: { gte: since24h } } }),
      prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
    ])

    const totalPopulation = citizenCount + unlinkedBirthCount
    const maleCount       = maleCitizenCount + maleUnlinkedBirths
    const femaleCount     = femaleCitizenCount + femaleUnlinkedBirths

    return res.json({
      success: true,
      data: {
        totalPopulation,
        maleCount,
        femaleCount,
        malePct:   totalPopulation ? Number(((maleCount / totalPopulation) * 100).toFixed(1))   : 0,
        femalePct: totalPopulation ? Number(((femaleCount / totalPopulation) * 100).toFixed(1)) : 0,
        districtAdminsTotal,
        districtAdminsPending,
        villageOfficersTotal,
        villageOfficersPending,
        hospitalOfficersTotal,
        hospitalOfficersPending,
        securityAlerts24h,
        systemHealth: {
          databaseOk: dbCheck,
          redisOk:    isRedisReady(),
        },
      },
    })"""
    patch(path, old_overview_block, new_overview_block, "PATCH-POP-3: add children with birth record but no NIN yet",
          "backend/routes/admin.js — /overview includes unlinked births in population")


# ─────────────────────────────────────────────────────────────────────────────
# Fix 3 — Backend /population: include unlinked births in age-band breakdown
# ─────────────────────────────────────────────────────────────────────────────
def fix_population_backend():
    path = BACK / "routes" / "admin.js"

    old_pop = """\
router.get('/population', async (req, res) => {
  try {
    const where = await buildCitizenGeoWhere(req)
    const rows = await prisma.citizen.groupBy({
      by:     ['gender', 'age'],
      where,
      _count: { _all: true },
    })

    const bands = {}
    for (const band of AGE_BANDS) bands[band] = { male: 0, female: 0 }
    for (const r of rows) {
      const band = ageBand(r.age)
      bands[band][r.gender] += r._count._all
    }
    const pyramid = AGE_BANDS.map((age) => ({ age, male: bands[age].male, female: bands[age].female }))

    const total  = await prisma.citizen.count({ where })
    const male   = await prisma.citizen.count({ where: { ...where, gender: 'male' } })
    const female = total - male

    return res.json({
      success: true,
      data: {
        pyramid,
        total,
        male,
        female,
        malePct:   total ? Number(((male / total) * 100).toFixed(1))   : 0,
        femalePct: total ? Number(((female / total) * 100).toFixed(1)) : 0,
      },
    })
  } catch (err) {
    console.error('[admin/population]', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
})"""
    new_pop = """\
router.get('/population', async (req, res) => {
  // PATCH-POP-3: include children with birth records but no NIN yet.
  // Priority:
  //   a) citizen WITH birth record  → in citizens table, count once
  //   b) citizen WITHOUT birth record (seeded) → in citizens table, count
  //   c) birth where childCitizenId IS NULL → not yet registered → add from births
  try {
    const where = await buildCitizenGeoWhere(req)

    // Build birth geo-filter (scoped by facility.districtId for district_admin)
    let birthGeoWhere = { childCitizenId: null }
    if (req.user.role === 'district_admin') {
      const adminDistrictId = await getAdminDistrictId(req)
      birthGeoWhere = { childCitizenId: null, facility: { districtId: adminDistrictId } }
    }

    // ── Citizens (age-band groupBy is fast — age is a stored Int) ───────────
    const rows = await prisma.citizen.groupBy({
      by:     ['gender', 'age'],
      where,
      _count: { _all: true },
    })

    const bands = {}
    for (const band of AGE_BANDS) bands[band] = { male: 0, female: 0 }
    for (const r of rows) {
      const band = ageBand(r.age)
      bands[band][r.gender] += r._count._all
    }

    // ── Unlinked births (compute age from dateOfBirth in JS) ────────────────
    const unlinkedBirths = await prisma.birth.findMany({
      where:  birthGeoWhere,
      select: { gender: true, dateOfBirth: true },
    })
    const now = Date.now()
    for (const b of unlinkedBirths) {
      const ageYrs = Math.floor((now - new Date(b.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
      const band   = ageBand(ageYrs)
      if (bands[band]) bands[band][b.gender] = (bands[band][b.gender] || 0) + 1
    }

    const pyramid = AGE_BANDS.map((age) => ({ age, male: bands[age].male, female: bands[age].female }))

    // ── Totals ───────────────────────────────────────────────────────────────
    const [citizenTotal, citizenMale, unlinkedTotal, unlinkedMale] = await Promise.all([
      prisma.citizen.count({ where }),
      prisma.citizen.count({ where: { ...where, gender: 'male' } }),
      prisma.birth.count({ where: birthGeoWhere }),
      prisma.birth.count({ where: { ...birthGeoWhere, gender: 'male' } }),
    ])

    const total  = citizenTotal + unlinkedTotal
    const male   = citizenMale  + unlinkedMale
    const female = total - male

    return res.json({
      success: true,
      data: {
        pyramid,
        total,
        male,
        female,
        malePct:   total ? Number(((male / total) * 100).toFixed(1))   : 0,
        femalePct: total ? Number(((female / total) * 100).toFixed(1)) : 0,
      },
    })
  } catch (err) {
    console.error('[admin/population]', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
})"""
    patch(path, old_pop, new_pop, "PATCH-POP-3: include children with birth records but no NIN yet",
          "backend/routes/admin.js — /population includes unlinked births in age-band breakdown")


# ─────────────────────────────────────────────────────────────────────────────
# Fix 4 — useTheme: session-scoped key + cleanup on logout (login page unaffected)
# ─────────────────────────────────────────────────────────────────────────────
def fix_dark_mode_session_scoped():
    path = WEB / "pages" / "AdminDashboard.jsx"

    # 4a. Update useTheme to accept userId + cleanup on unmount
    old_theme = """\
// ── useTheme — persists 'dark'/'light' in localStorage, scoped to this device/session ──
// PATCH-EMAIL-2025
function useTheme() {
  const THEME_KEY = 'tzcrvs_theme'
  const [theme, setThemeRaw] = React.useState(
    () => localStorage.getItem(THEME_KEY) || 'dark'
  )
  function setTheme(t) {
    setThemeRaw(t)
    localStorage.setItem(THEME_KEY, t)
    document.documentElement.classList.toggle('tzcrvs-light', t === 'light')
  }
  React.useEffect(() => {
    document.documentElement.classList.toggle('tzcrvs-light', theme === 'light')
  }, [theme])
  return [theme, setTheme]
}"""
    new_theme = """\
// ── useTheme — persisted per user-ID in localStorage, removed on logout ────
// PATCH-POP-3: key is now scoped to userId so different users on the same
// device each keep their own preference. The cleanup effect removes the CSS
// class when AdminDashboard unmounts (logout), so the login page is always
// shown in the default dark theme regardless of what the previous user chose.
function useTheme(userId) {
  const THEME_KEY = userId ? `tzcrvs_theme_${userId}` : 'tzcrvs_theme'
  const [theme, setThemeRaw] = React.useState(
    () => (userId ? localStorage.getItem(THEME_KEY) : null) || 'dark'
  )
  function setTheme(t) {
    setThemeRaw(t)
    if (userId) localStorage.setItem(THEME_KEY, t)
    document.documentElement.classList.toggle('tzcrvs-light', t === 'light')
  }
  // Apply class on every theme change
  React.useEffect(() => {
    document.documentElement.classList.toggle('tzcrvs-light', theme === 'light')
  }, [theme])
  // Cleanup on unmount (logout) — ensures login page is never in light mode
  React.useEffect(() => {
    return () => { document.documentElement.classList.remove('tzcrvs-light') }
  }, [])
  return [theme, setTheme]
}"""
    patch(path, old_theme, new_theme, "PATCH-POP-3: key is now scoped to userId",
          "AdminDashboard.jsx useTheme — session-scoped key + cleanup on unmount")

    # 4b. Pass user?.id to useTheme in the component body
    old_call = "  const [theme, setTheme] = useTheme()  // PATCH-EMAIL-2025"
    new_call  = "  const [theme, setTheme] = useTheme(user?.id)  // PATCH-POP-3: scoped to logged-in user"
    patch(path, old_call, new_call, "PATCH-POP-3: scoped to logged-in user",
          "AdminDashboard.jsx — pass userId to useTheme")


# ─────────────────────────────────────────────────────────────────────────────

def main():
    if not (ROOT / "code" / "web").exists() or not (ROOT / "code" / "backend").exists():
        print(f"ERROR: run from the ADLCS project root (expected code/web and code/backend under {ROOT})")
        sys.exit(1)

    fix_dashboard_section_frontend()
    fix_overview_backend()
    fix_population_backend()
    fix_dark_mode_session_scoped()

    print("\n" + "=" * 68)
    print(f"APPLIED  ({len(CHANGED)}):")
    for c in CHANGED: print(f"  ✓ {c}")
    print(f"\nSKIPPED  ({len(SKIPPED)}):")
    for s in SKIPPED: print(f"  · {s}")
    if FAILED:
        print(f"\nFAILED   ({len(FAILED)}):")
        for f in FAILED: print(f"  ✗ {f}")
        print("=" * 68); sys.exit(1)
    print("=" * 68)


if __name__ == "__main__":
    main()
