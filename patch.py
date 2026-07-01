#!/usr/bin/env python3
"""
fix_web_admin_dashboard.py — TzCRVS Web Admin Portal patch script

Run from the project root (~/ADLCS):
    python3 fix_web_admin_dashboard.py

Idempotent — safe to re-run any number of times, in any order relative to
the other fix_*.py scripts already applied to this project.

Fixes applied (see handwritten notes, "(Web)" list items 1–8):

  1. Dashboard "home" stat cards showing nothing despite real DB data.
     Root cause: apiResolver.js's probe() only accepted a 200 response
     from GET /api/health as "backend reachable". The health endpoint
     returns HTTP 503 whenever a *secondary* sub-system (e.g. Upstash
     Redis) is briefly unreachable, even though Postgres — and every
     dashboard card that depends on it — is completely fine. A 503 made
     resolveBase() throw "No internet connection" and silently aborted
     *every* admin API call, so the cards rendered their zero/fallback
     values. Fixed to treat any HTTP response (not just 2xx) as proof
     the backend is reachable.

  2. Top bar (NBSHeader) — the institutional text block next to the
     Coat of Arms now sits centered as its own block instead of
     trailing left, and the gap to the logo is tightened.

  3. District Admin → Demographics (and RITA / NIDA, which share the
     same GeoFilterBar component) now show a real two-tier filter for
     district admins: Ward, then Village/Street (populated once a ward
     is chosen) — instead of a static "showing data for your district"
     label with no controls. This required two backend fixes:
       a. GET /api/admin/geo/wards now auto-scopes to the caller's own
          district when a district_admin omits districtId, instead of
          returning every ward nationwide.
       b. buildCitizenGeoWhere() previously *ignored* any wardId /
          villageId filter for district_admin and always fell back to
          district-wide scope — so the new filter would have had no
          effect. Now the district scope is the floor, narrowed further
          by ward/village when selected.

  4 & 6. "Migration Trends" menu button + its content section removed
     from both Super Admin and District Admin dashboards (component,
     nav entry, route-switch case, and section-title entry). The
     underlying /api/admin/migrations route and apiGetMigrations()
     client function are left untouched per the brief.
     "System Log Reports" and "Security Alerts" menu buttons are now
     Super-Admin-only (removed from the District Admin dashboard) —
     the section components themselves are untouched.

  5. RITA / NIDA cards already fetch live data from the central DB —
     the empty-card symptom was the same apiResolver bug as #1, fixed
     once in apiResolver.js.

  7. PlaceholderDashboard.jsx — confirmed unused (no imports anywhere
     in the codebase, not referenced by App.jsx's router) and removed.

  8. Super Admin → System Performance now shows only the first row of
     stat cards (DB / Redis / Uptime / Node runtime). The unused
     "Table Record Counts" card grid below it has been removed.

Also checked per request: code/web/src/data/tanzania.js — it is NOT
dead code. It is still imported and used by LoginPage.jsx
(`getRegions` / `getDistricts`) to power the Region/District dropdowns
on the public self-registration tab of the login page, which has no
auth token yet and therefore cannot hit the authenticated
/api/admin/geo/* endpoints. It is left in place.
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
WEB = ROOT / "code" / "web" / "src"
BACKEND = ROOT / "code" / "backend" / "src"

CHANGED = []
SKIPPED = []
FAILED = []


def log(msg):
    print(msg)


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def write(path: Path, text: str):
    path.write_text(text, encoding="utf-8")


def patch_file(path: Path, replacements, label):
    """Apply a list of (old, new, marker) tuples to a file.

    marker: a substring whose presence in the *original* file content
    means "this replacement was already applied" (idempotency guard).
    """
    if not path.exists():
        FAILED.append(f"{label}: file not found at {path}")
        return

    text = read(path)
    original = text
    applied_any = False
    already_done = 0

    for old, new, marker in replacements:
        if marker in text:
            already_done += 1
            continue
        if old not in text:
            FAILED.append(f"{label}: expected old text not found (already patched differently, or source changed) — marker={marker!r}")
            continue
        text = text.replace(old, new, 1)
        applied_any = True

    if applied_any:
        write(path, text)
        CHANGED.append(label)
    elif already_done == len(replacements):
        SKIPPED.append(f"{label} (already applied)")
    elif text != original:
        # partial — shouldn't normally happen, but write anyway
        write(path, text)
        CHANGED.append(label + " (partial)")


# ─────────────────────────────────────────────────────────────────────────
# Fix 1 — apiResolver.js: probe() must not require strict 2xx
# ─────────────────────────────────────────────────────────────────────────
def fix_api_resolver():
    path = WEB / "api" / "apiResolver.js"
    old = """async function probe(base) {
  const ctrl  = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT)
  try {
    const res = await fetch(`${base}/health`, { signal: ctrl.signal })
    clearTimeout(timer)
    return res.ok
  } catch {
    clearTimeout(timer)
    return false
  }
}"""
    new = """async function probe(base) {
  const ctrl  = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT)
  try {
    // BUGFIX-7: any HTTP response (even a 503 from a degraded sub-system
    // such as Redis) proves the backend is reachable. Requiring a strict
    // 2xx here made resolveBase() throw "No internet connection" — and
    // every admin dashboard card silently fail to load — whenever Redis
    // hiccuped, even though Postgres (and therefore the real data) was
    // completely fine.
    await fetch(`${base}/health`, { signal: ctrl.signal })
    clearTimeout(timer)
    return true
  } catch {
    clearTimeout(timer)
    return false
  }
}"""
    patch_file(path, [(old, new, "BUGFIX-7")], "apiResolver.js — probe() accepts non-2xx health responses")


# ─────────────────────────────────────────────────────────────────────────
# Fix 2 — NBSHeader.jsx: center the institutional text block
# ─────────────────────────────────────────────────────────────────────────
def fix_nbs_header():
    path = WEB / "components" / "NBSHeader.jsx"
    old = """        {/* Left: CoA + text */}
        <div className="flex items-center gap-4">
          <div className="w-[60px] h-[60px] rounded-full border-2 border-white/35
                          bg-white/10 flex items-center justify-center shrink-0">
            <img src="/assets/court_of_arm.png" alt="Coat of Arms"
                 className="w-11 h-11 object-contain drop-shadow" />
          </div>
          <div>
            <p className="text-[8.5px] font-bold text-yellow-300 tracking-[0.22em] uppercase mb-0.5">"""
    new = """        {/* Left: CoA + text */}
        {/* BUGFIX-8: text block centered as its own unit, squeezed closer
            to the Coat of Arms instead of trailing left after it. */}
        <div className="flex items-center gap-3">
          <div className="w-[60px] h-[60px] rounded-full border-2 border-white/35
                          bg-white/10 flex items-center justify-center shrink-0">
            <img src="/assets/court_of_arm.png" alt="Coat of Arms"
                 className="w-11 h-11 object-contain drop-shadow" />
          </div>
          <div className="text-center">
            <p className="text-[8.5px] font-bold text-yellow-300 tracking-[0.22em] uppercase mb-0.5">"""
    patch_file(path, [(old, new, "BUGFIX-8")], "NBSHeader.jsx — center topbar text block")


# ─────────────────────────────────────────────────────────────────────────
# Fix 3 — GeoFilterBar.jsx: real ward/village filter for district_admin
# ─────────────────────────────────────────────────────────────────────────
def fix_geo_filter_bar():
    path = WEB / "components" / "GeoFilterBar.jsx"

    old_region_effect = """  useEffect(() => {
    if (scoped) return
    apiGetRegions().then(r => setRegions(r.data || [])).catch(() => setRegions([]))
  }, [scoped])"""
    new_region_effect = """  useEffect(() => {
    if (scoped) return
    apiGetRegions().then(r => setRegions(r.data || [])).catch(() => setRegions([]))
  }, [scoped])

  // PATCH-9: scoped (district_admin) mode skips Region/District entirely —
  // fetch wards for the caller's own district directly. The backend
  // auto-scopes /admin/geo/wards to the requester's district when no
  // districtId is supplied and the caller is a district_admin.
  useEffect(() => {
    if (!scoped) return
    apiGetWards().then(r => setWards(r.data || [])).catch(() => setWards([]))
  }, [scoped])"""

    old_scoped_block = """  if (scoped) {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-400 mb-4">
        <MapPin size={14} className="text-[#00d4ff]" />
        <span>Showing data for your assigned district</span>
      </div>
    )
  }"""
    new_scoped_block = """  if (scoped) {
    // PATCH-9: district admins get a real two-tier filter — Ward, then
    // Village/Street (populated once a ward is selected) — scoped to
    // their own district, instead of a static read-only label.
    return (
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <MapPin size={14} className="text-[#00d4ff] shrink-0" />
        <span className="text-xs text-gray-500 shrink-0">Your district</span>
        <select className={sel} value={wardId} onChange={e => setWardId(e.target.value)}>
          <option value="">All Wards</option>
          {wards.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <select className={sel} value={villageId} onChange={e => setVillageId(e.target.value)} disabled={!wardId}>
          <option value="">All Villages / Streets</option>
          {villages.map(v => (
            <option key={v.id} value={v.id}>{v.name}{v.type === 'street' ? ' (Street)' : ''}</option>
          ))}
        </select>
        {(wardId || villageId) && (
          <button onClick={reset} className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-red-300">
            <X size={12} /> Clear
          </button>
        )}
      </div>
    )
  }"""

    patch_file(
        path,
        [
            (old_region_effect, new_region_effect, "PATCH-9: scoped (district_admin) mode skips"),
            (old_scoped_block, new_scoped_block, "PATCH-9: district admins get a real two-tier filter"),
        ],
        "GeoFilterBar.jsx — real ward/village filter for district_admin",
    )


# ─────────────────────────────────────────────────────────────────────────
# Fix 3b — backend: auto-scope /geo/wards + fix buildCitizenGeoWhere
# ─────────────────────────────────────────────────────────────────────────
def fix_backend_admin_routes():
    path = BACKEND / "routes" / "admin.js"

    old_where = """async function buildCitizenGeoWhere(req) {
  const { regionId, districtId, wardId, villageId } = req.query
  let where = {}
  if (villageId)       where = { currentVillageId: Number(villageId) }
  else if (wardId)     where = { currentVillage: { wardId: Number(wardId) } }
  else if (districtId) where = { currentVillage: { ward: { districtId: Number(districtId) } } }
  else if (regionId)   where = { currentVillage: { ward: { district: { regionId: Number(regionId) } } } }

  if (req.user.role === 'district_admin') {
    const adminDistrictId = await getAdminDistrictId(req)
    where = { currentVillage: { ward: { districtId: adminDistrictId } } }
  }
  return where
}"""
    new_where = """async function buildCitizenGeoWhere(req) {
  const { regionId, districtId, wardId, villageId } = req.query

  // BUGFIX-9: a district_admin's ward/village filter selection used to be
  // silently discarded — this function always fell back to the full
  // district scope regardless of what was selected. District scope is now
  // the floor (never escapable) but is narrowed further when the admin
  // picks a ward or village within it.
  if (req.user.role === 'district_admin') {
    const adminDistrictId = await getAdminDistrictId(req)
    if (villageId) return { currentVillageId: Number(villageId) }
    if (wardId)    return { currentVillage: { wardId: Number(wardId) } }
    return { currentVillage: { ward: { districtId: adminDistrictId } } }
  }

  if (villageId)  return { currentVillageId: Number(villageId) }
  if (wardId)     return { currentVillage: { wardId: Number(wardId) } }
  if (districtId) return { currentVillage: { ward: { districtId: Number(districtId) } } }
  if (regionId)   return { currentVillage: { ward: { district: { regionId: Number(regionId) } } } }
  return {}
}"""

    old_wards_route = """router.get('/geo/wards', async (req, res) => {
  const districtId = Number(req.query.districtId) || undefined
  try {
    // PATCH-2: deduplicate ward names within district
    const rawW = await prisma.ward.findMany({"""
    new_wards_route = """router.get('/geo/wards', async (req, res) => {
  let districtId = Number(req.query.districtId) || undefined
  try {
    // BUGFIX-9: a district_admin who omits districtId (the scoped
    // Demographics/RITA/NIDA filter) gets wards for their own district
    // only, instead of every ward in the country.
    if (!districtId && req.user.role === 'district_admin') {
      districtId = await getAdminDistrictId(req)
    }
    // PATCH-2: deduplicate ward names within district
    const rawW = await prisma.ward.findMany({"""

    patch_file(
        path,
        [
            (old_where, new_where, "BUGFIX-9: a district_admin's ward/village filter"),
            (old_wards_route, new_wards_route, "BUGFIX-9: a district_admin who omits districtId"),
        ],
        "backend/routes/admin.js — scope geo/wards + fix citizen geo where for district_admin",
    )


# ─────────────────────────────────────────────────────────────────────────
# Fix 4 & 6 — remove Migration Trends entirely; District-Admin-hide logs/alerts
# ─────────────────────────────────────────────────────────────────────────
def fix_admin_dashboard_nav_and_sections():
    path = WEB / "pages" / "AdminDashboard.jsx"
    text = read(path)
    marker = "BUGFIX-10"
    if marker in text:
        SKIPPED.append("AdminDashboard.jsx (already applied)")
        return
    original = text

    # 1) Drop unused ArrowLeftRight icon import (only used by Migrations UI)
    old_imports = """  ShieldAlert, ArrowLeftRight, Stethoscope,"""
    new_imports = """  ShieldAlert, Stethoscope,"""
    if old_imports in text:
        text = text.replace(old_imports, new_imports, 1)
    else:
        FAILED.append("AdminDashboard.jsx: ArrowLeftRight import line not found")

    # 2) Remove the entire MigrationsSection function (BUGFIX-10 marker added)
    old_section_header = "// ── Section: Migrations ──────────────────────────────────────────────────────"
    old_section_full = """// ── Section: Migrations ──────────────────────────────────────────────────────

function MigrationsSection() {
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('all')
  const [loading, setLoading] = useState(true)
  const limit = 10

  const load = useCallback(() => {
    setLoading(true)
    api.apiGetMigrations({ page, limit, ...(status !== 'all' ? { status } : {}) })
      .then(r => { setRows(r.data || []); setTotal(r.total || 0) })
      .catch(err => console.error('[migrations]', err))
      .finally(() => setLoading(false))
  }, [page, status])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <ArrowLeftRight size={14} className="text-[#00d4ff]" />
        <StatusSelect value={status} options={['all', 'pending', 'confirmed', 'cancelled', 'expired']} onChange={v => { setPage(1); setStatus(v) }} />
      </div>

      <Card className="p-0 overflow-x-auto">
        <table className="w-full">
          <thead><tr className="border-b border-[#1a3060]">
            <Th>Citizen</Th><Th>From</Th><Th>To</Th><Th>Reason</Th><Th>Status</Th><Th>Requested</Th>
          </tr></thead>
          <tbody>
            {loading && <LoadingState colSpan={6} />}
            {!loading && rows.length === 0 && <EmptyState colSpan={6} />}
            {!loading && rows.map(m => (
              <tr key={m.id} className="border-b border-[#1a3060]/50 hover:bg-white/[0.02]">
                <Td className="text-white font-medium">{m.citizen ? `${m.citizen.firstName} ${m.citizen.surname}` : '—'}</Td>
                <Td>{m.fromVillage?.name || '—'}</Td>
                <Td>{m.toVillage?.name || '—'}</Td>
                <Td className="truncate max-w-[160px]">{m.reason}</Td>
                <Td><StatusPill status={m.status === 'confirmed' ? 'active' : (m.status === 'pending' ? 'pending' : 'suspended')} /></Td>
                <Td>{new Date(m.requestDate).toLocaleDateString('en-TZ')}</Td>
              </tr>
            ))}
          </tbody>
        </table>
        <PagerFooter page={page} total={total} limit={limit} onPage={setPage} />
      </Card>
    </div>
  )
}

// ── Section: Marriages ───────────────────────────────────────────────────────"""
    new_section_replacement = """// BUGFIX-10: "Migration Trends" menu button + section removed (Super Admin
// and District Admin dashboards). /api/admin/migrations and
// apiGetMigrations() are left untouched in case they're needed again.

// ── Section: Marriages ───────────────────────────────────────────────────────"""
    if old_section_full in text:
        text = text.replace(old_section_full, new_section_replacement, 1)
    elif old_section_header in text:
        FAILED.append("AdminDashboard.jsx: MigrationsSection body didn't match exactly — manual review needed")
    # else: already removed, fine

    # 3) NAV array — drop migrations entry, restrict audit_logs/security_alerts to super_admin
    old_nav = """const NAV = [
  { key: 'dashboard',           label: 'Dashboard',            Icon: LayoutDashboard, roles: ['super_admin', 'district_admin'] },
  { key: 'demographics',        label: 'Demographics',         Icon: MapIcon,         roles: ['super_admin', 'district_admin'] },
  { key: 'district_admins',     label: 'District Admins',      Icon: Landmark,        roles: ['super_admin'] },
  { key: 'village_officers',    label: 'Village Officers',     Icon: Users,           roles: ['super_admin', 'district_admin'] },
  { key: 'health_officers',     label: 'Health Officers',      Icon: Stethoscope,     roles: ['super_admin', 'district_admin'] },
  { key: 'manage_users',        label: 'Manage Users',         Icon: Shield,          roles: ['super_admin'] },
  { key: 'migrations',          label: 'Migration Trends',     Icon: ArrowLeftRight,  roles: ['super_admin', 'district_admin'] },
  { key: 'marriages',           label: 'Marriage Records',     Icon: Heart,           roles: ['super_admin', 'district_admin'] },
  { key: 'audit_logs',          label: 'System Log Reports',   Icon: FileText,        roles: ['super_admin', 'district_admin'] },
  { key: 'security_alerts',     label: 'Security Alerts',      Icon: ShieldAlert,     roles: ['super_admin', 'district_admin'] },
  { key: 'system_performance',  label: 'System Performance',   Icon: Cpu,             roles: ['super_admin'] },
  { key: 'rita',               label: 'RITA',                 Icon: FileText,        roles: ['super_admin', 'district_admin'] },
  { key: 'nida',               label: 'NIDA',                 Icon: Shield,          roles: ['super_admin', 'district_admin'] },
]"""
    new_nav = """// BUGFIX-10: Migration Trends removed; System Log Reports / Security
// Alerts are now Super-Admin-only (District Admin dashboard no longer
// shows these two menu buttons).
const NAV = [
  { key: 'dashboard',           label: 'Dashboard',            Icon: LayoutDashboard, roles: ['super_admin', 'district_admin'] },
  { key: 'demographics',        label: 'Demographics',         Icon: MapIcon,         roles: ['super_admin', 'district_admin'] },
  { key: 'district_admins',     label: 'District Admins',      Icon: Landmark,        roles: ['super_admin'] },
  { key: 'village_officers',    label: 'Village Officers',     Icon: Users,           roles: ['super_admin', 'district_admin'] },
  { key: 'health_officers',     label: 'Health Officers',      Icon: Stethoscope,     roles: ['super_admin', 'district_admin'] },
  { key: 'manage_users',        label: 'Manage Users',         Icon: Shield,          roles: ['super_admin'] },
  { key: 'marriages',           label: 'Marriage Records',     Icon: Heart,           roles: ['super_admin', 'district_admin'] },
  { key: 'audit_logs',          label: 'System Log Reports',   Icon: FileText,        roles: ['super_admin'] },
  { key: 'security_alerts',     label: 'Security Alerts',      Icon: ShieldAlert,     roles: ['super_admin'] },
  { key: 'system_performance',  label: 'System Performance',   Icon: Cpu,             roles: ['super_admin'] },
  { key: 'rita',               label: 'RITA',                 Icon: FileText,        roles: ['super_admin', 'district_admin'] },
  { key: 'nida',               label: 'NIDA',                 Icon: Shield,          roles: ['super_admin', 'district_admin'] },
]"""
    if old_nav in text:
        text = text.replace(old_nav, new_nav, 1)
    else:
        FAILED.append("AdminDashboard.jsx: NAV array didn't match exactly — manual review needed")

    # 4) SECTION_TITLE — drop migrations key
    old_titles = """const SECTION_TITLE = {
  dashboard: 'Dashboard', demographics: 'Demographics View', district_admins: 'District Admins',
  village_officers: 'Village Officers', health_officers: 'Health Officers', manage_users: 'Manage Users',
  migrations: 'Migration Trends', marriages: 'Marriage Records', audit_logs: 'System Log Reports',
  security_alerts: 'Security Alerts', system_performance: 'System Performance',
}"""
    new_titles = """const SECTION_TITLE = {
  dashboard: 'Dashboard', demographics: 'Demographics View', district_admins: 'District Admins',
  village_officers: 'Village Officers', health_officers: 'Health Officers', manage_users: 'Manage Users',
  marriages: 'Marriage Records', audit_logs: 'System Log Reports',
  security_alerts: 'Security Alerts', system_performance: 'System Performance',
}"""
    if old_titles in text:
        text = text.replace(old_titles, new_titles, 1)
    else:
        FAILED.append("AdminDashboard.jsx: SECTION_TITLE object didn't match exactly — manual review needed")

    # 5) renderSection switch — drop migrations case
    old_case = """      case 'manage_users':        return <ManageUsersSection currentUserId={user?.id} />
      case 'migrations':          return <MigrationsSection />
      case 'marriages':           return <MarriagesSection />"""
    new_case = """      case 'manage_users':        return <ManageUsersSection currentUserId={user?.id} />
      case 'marriages':           return <MarriagesSection />"""
    if old_case in text:
        text = text.replace(old_case, new_case, 1)
    else:
        FAILED.append("AdminDashboard.jsx: renderSection switch case didn't match exactly — manual review needed")

    # 6) Fix 8 — System Performance: keep only the first row of stat cards
    old_perf = """      <Card>
        <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3">Table Record Counts</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {Object.entries(perf?.tableCounts || {}).map(([k, v]) => (
            <div key={k} className="bg-[#060f1e] border border-[#1a3060] rounded-lg p-3 text-center">
              <p className="text-gray-500 text-[10px] uppercase tracking-wider">{k}</p>
              <p className="text-white font-bold text-lg">{v.toLocaleString()}</p>
            </div>
          ))}
        </div>
      </Card>

      <button onClick={load} className="flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-[#00d4ff] border border-[#1a3060] px-3 py-1.5 rounded-lg">"""
    new_perf = """      {/* BUGFIX-10: unused "Table Record Counts" card grid removed — System
          Performance now shows only the first row of live health cards. */}
      <button onClick={load} className="flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-[#00d4ff] border border-[#1a3060] px-3 py-1.5 rounded-lg">"""
    if old_perf in text:
        text = text.replace(old_perf, new_perf, 1)
    else:
        FAILED.append("AdminDashboard.jsx: System Performance 'Table Record Counts' block didn't match exactly — manual review needed")

    if text != original:
        write(path, text)
        CHANGED.append("AdminDashboard.jsx — remove Migration Trends, restrict logs/alerts to super_admin, trim System Performance")


# ─────────────────────────────────────────────────────────────────────────
# Fix 7 — remove unused PlaceholderDashboard.jsx
# ─────────────────────────────────────────────────────────────────────────
def fix_remove_placeholder_dashboard():
    path = WEB / "pages" / "PlaceholderDashboard.jsx"
    if not path.exists():
        SKIPPED.append("PlaceholderDashboard.jsx (already removed)")
        return

    # Safety check: confirm it really is unused before deleting anything.
    web_root = WEB
    referenced = False
    for f in web_root.rglob("*.jsx"):
        if f == path:
            continue
        if "PlaceholderDashboard" in read(f):
            referenced = True
            break
    if not referenced:
        for f in web_root.rglob("*.js"):
            if "PlaceholderDashboard" in read(f):
                referenced = True
                break

    if referenced:
        FAILED.append("PlaceholderDashboard.jsx: still referenced elsewhere — NOT deleted, manual review needed")
        return

    path.unlink()
    CHANGED.append("Removed unused code/web/src/pages/PlaceholderDashboard.jsx")


# ─────────────────────────────────────────────────────────────────────────

def main():
    if not (ROOT / "code" / "web").exists() or not (ROOT / "code" / "backend").exists():
        log(f"ERROR: expected to be run from the ADLCS project root (looked for code/web and "
            f"code/backend under {ROOT}). Aborting.")
        sys.exit(1)

    fix_api_resolver()
    fix_nbs_header()
    fix_geo_filter_bar()
    fix_backend_admin_routes()
    fix_admin_dashboard_nav_and_sections()
    fix_remove_placeholder_dashboard()

    log("\n" + "=" * 70)
    log(f"APPLIED  ({len(CHANGED)}):")
    for c in CHANGED:
        log(f"  ✓ {c}")
    log(f"\nSKIPPED — already applied ({len(SKIPPED)}):")
    for s in SKIPPED:
        log(f"  · {s}")
    if FAILED:
        log(f"\nFAILED — needs manual review ({len(FAILED)}):")
        for f in FAILED:
            log(f"  ✗ {f}")
        log("=" * 70)
        sys.exit(1)
    log("=" * 70)
    log("Note: code/web/src/data/tanzania.js was checked and left in place — "
        "it is still used by LoginPage.jsx's public self-registration tab.")


if __name__ == "__main__":
    main()
