#!/usr/bin/env python3
"""
patch_12.py — ADLCS Patch 12
=====================================================================
Fixes applied
─────────────
1. SYSTEMIC MALFORMED-COLOR BUG (root cause of invisible logos/icons,
   "yellow blur", missing dividers/overlays across the app)

   Across 14 mobile files, rgba() colors are missing a channel:
     rgba(255,255,0.XX)  →  rgba(255,255,255,0.XX)   white @ opacity
     rgba(0,0.XX)        →  rgba(0,0,0,0.XX)         black @ opacity
     rgba(239,68,0.XX)   →  rgba(239,68,68,0.XX)     red/danger @ opacity
     rgba(180,100,0.04)  →  rgba(180,100,100,0.04)   watermark grey
   These are INVALID CSS color strings (3 numbers where 4 are required).
   React Native's color parser rejects them → backgroundColor/color/
   borderColor silently fail → invisible icons, logos, dividers,
   modal overlays, and the "yellow blur" the user reported.

   ~50 occurrences fixed across:
   SplashScreen, HospitalHomeScreen, RegisterBirthScreen,
   IssueCertificateScreen, ViewRecordsScreen, RecordDeathScreen,
   VillageHomeScreen, RegisterCitizenScreen, RegisterMarriageScreen,
   RegisterBuildingScreen, RegisterInfrastructureScreen,
   VillageRecordDeathScreen, TrackMigrationScreen, certificateService

2. HTTP 500 on /village/birth-lookup
   • apiGet/apiPost now surface the backend's JSON `message` in thrown
     errors instead of just "HTTP 500" — makes future errors debuggable
   • /village/birth-lookup made resilient: scalar birth fields are
     fetched first (guaranteed to work); father/mother/facility relation
     lookups are wrapped separately so a relation/migration issue can't
     500 the whole request — it just omits that optional info
   • village.js now logs the full Prisma error code + message server-side

RUN FROM PROJECT ROOT (alongside /code/ folder):
    python3 patch_12.py
=====================================================================
"""
import os, sys, re

ROOT = os.path.dirname(os.path.abspath(__file__))
errors = []
total_color_fixes = 0

def patch(filepath, old, new, label):
    full = os.path.join(ROOT, filepath)
    if not os.path.exists(full):
        errors.append(f"❌  FILE NOT FOUND: {filepath}  [{label}]")
        return
    content = open(full, encoding="utf-8").read()
    if old not in content:
        errors.append(f"❌  PATTERN NOT FOUND in {filepath}  [{label}]\n     Expected: {repr(old[:100])}")
        return
    open(full, "w", encoding="utf-8").write(content.replace(old, new, 1))
    print(f"  ✅  {label}")

def fix_colors(filepath):
    """Fix all malformed rgba() colors in a file. Returns number of fixes."""
    global total_color_fixes
    full = os.path.join(ROOT, filepath)
    if not os.path.exists(full):
        errors.append(f"❌  FILE NOT FOUND: {filepath}  [color fix]")
        return 0
    content = open(full, encoding="utf-8").read()
    original = content
    replacements = [
        (r'rgba\(255,255,0\.',  'rgba(255,255,255,0.'),  # white @ opacity
        (r'rgba\(0,0\.',        'rgba(0,0,0,0.'),        # black @ opacity
        (r'rgba\(239,68,0\.',   'rgba(239,68,68,0.'),    # red/danger @ opacity
        (r'rgba\(180,100,0\.',  'rgba(180,100,100,0.'),  # watermark grey @ opacity
    ]
    count = 0
    for pat, repl in replacements:
        content, n = re.subn(pat, repl, content)
        count += n
    if count == 0:
        errors.append(f"❌  NO MALFORMED COLORS FOUND in {filepath}  [color fix — expected at least 1]")
        return 0
    open(full, "w", encoding="utf-8").write(content)
    total_color_fixes += count
    print(f"  ✅  {filepath.split('/')[-1]}: fixed {count} malformed color(s)")
    return count


# ══════════════════════════════════════════════════════════════════════════════
#  1 — Fix systemic malformed rgba() colors across all affected files
# ══════════════════════════════════════════════════════════════════════════════

COLOR_FILES = [
    "code/mobile/src/screens/SplashScreen.tsx",
    "code/mobile/src/screens/hospital/HospitalHomeScreen.tsx",
    "code/mobile/src/screens/hospital/RegisterBirthScreen.tsx",
    "code/mobile/src/screens/hospital/IssueCertificateScreen.tsx",
    "code/mobile/src/screens/hospital/ViewRecordsScreen.tsx",
    "code/mobile/src/screens/hospital/RecordDeathScreen.tsx",
    "code/mobile/src/screens/village/VillageHomeScreen.tsx",
    "code/mobile/src/screens/village/RegisterCitizenScreen.tsx",
    "code/mobile/src/screens/village/RegisterMarriageScreen.tsx",
    "code/mobile/src/screens/village/RegisterBuildingScreen.tsx",
    "code/mobile/src/screens/village/RegisterInfrastructureScreen.tsx",
    "code/mobile/src/screens/village/VillageRecordDeathScreen.tsx",
    "code/mobile/src/screens/village/TrackMigrationScreen.tsx",
    "code/mobile/src/services/certificateService.ts",
]

for f in COLOR_FILES:
    fix_colors(f)


# ══════════════════════════════════════════════════════════════════════════════
#  2 — syncService.ts: surface backend error messages instead of "HTTP 500"
# ══════════════════════════════════════════════════════════════════════════════

patch(
    "code/mobile/src/services/syncService.ts",
    """export async function apiPost(endpoint: string, body: object): Promise<any> {
  const token = await getToken()
  if (!token) throw new Error('No auth token')
  const { signal, clear } = makeSignal(15_000)
  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify(body),
      signal,
    })
    clear()
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  } catch (e) { clear(); throw e }
}""",
    """export async function apiPost(endpoint: string, body: object): Promise<any> {
  const token = await getToken()
  if (!token) throw new Error('No auth token')
  const { signal, clear } = makeSignal(15_000)
  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify(body),
      signal,
    })
    clear()
    if (!res.ok) {
      // Try to surface the backend's JSON `message` instead of a bare status code
      let detail = `HTTP ${res.status}`
      try { const j = await res.json(); if (j?.message) detail = j.message } catch {}
      throw new Error(detail)
    }
    return res.json()
  } catch (e) { clear(); throw e }
}""",
    "syncService: apiPost surfaces backend error message"
)

patch(
    "code/mobile/src/services/syncService.ts",
    """export async function apiGet(endpoint: string): Promise<any> {
  const token = await getToken()
  if (!token) throw new Error('No auth token')
  const { signal, clear } = makeSignal(10_000)
  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal,
    })
    clear()
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  } catch (e) { clear(); throw e }""",
    """export async function apiGet(endpoint: string): Promise<any> {
  const token = await getToken()
  if (!token) throw new Error('No auth token')
  const { signal, clear } = makeSignal(10_000)
  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal,
    })
    clear()
    if (!res.ok) {
      // Try to surface the backend's JSON `message` instead of a bare status code
      let detail = `HTTP ${res.status}`
      try { const j = await res.json(); if (j?.message) detail = j.message } catch {}
      throw new Error(detail)
    }
    return res.json()
  } catch (e) { clear(); throw e }""",
    "syncService: apiGet surfaces backend error message"
)


# ══════════════════════════════════════════════════════════════════════════════
#  3 — village.js: make /birth-lookup resilient + log full Prisma errors
# ══════════════════════════════════════════════════════════════════════════════

patch(
    "code/backend/src/routes/village.js",
    """router.get('/birth-lookup', async (req, res) => {
  const { bid } = req.query
  if (!bid || typeof bid !== 'string' || !bid.startsWith('BID-')) {
    return res.status(400).json({ success: false, message: 'bid query param required (format: BID-YYYYMMDD-XXXXXXX)' })
  }
  try {
    const birth = await prisma.birth.findFirst({
      where: { birthId: bid.trim() },
      select: {
        id:             true,
        birthId:        true,
        birthCertNo:    true,
        childFirstName: true,
        childMiddleName:true,
        childSurname:   true,
        gender:         true,
        dateOfBirth:    true,
        childCitizenId: true,   // null until NIN issued
        father: { select: { nationalId:true, firstName:true, middleName:true, surname:true } },
        mother: { select: { nationalId:true, firstName:true, middleName:true, surname:true } },
        facility: { select: { facilityName:true } },
        registeredAt: true,
      },
    })
    if (!birth) {
      return res.status(404).json({ success: false, message: 'No birth record found for this BID' })
    }
    if (birth.childCitizenId) {
      return res.status(409).json({
        success: false,
        message: 'NIN already issued for this birth record',
        nationalId: birth.childCitizenId,
      })
    }
    return res.json({ success: true, data: birth })
  } catch (err) {
    console.error('[village/birth-lookup]', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
})""",
    """router.get('/birth-lookup', async (req, res) => {
  const { bid } = req.query
  if (!bid || typeof bid !== 'string' || !bid.startsWith('BID-')) {
    return res.status(400).json({ success: false, message: 'bid query param required (format: BID-YYYYMMDD-XXXXXXX)' })
  }
  try {
    // Step 1 — fetch scalar birth fields only. This is guaranteed to work
    // even if the Citizen relations (father/mother) or facility are not
    // yet fully migrated — keeps the core lookup functional.
    let birth
    try {
      birth = await prisma.birth.findFirst({
        where: { birthId: bid.trim() },
        select: {
          id:              true,
          birthId:         true,
          birthCertNo:     true,
          childFirstName:  true,
          childMiddleName: true,
          childSurname:    true,
          gender:          true,
          dateOfBirth:     true,
          childCitizenId:  true,   // null until NIN issued
          fatherCitizenId: true,
          motherCitizenId: true,
          facilityId:      true,
          registeredAt:    true,
        },
      })
    } catch (scalarErr) {
      console.error('[village/birth-lookup] scalar query failed:', scalarErr.code, scalarErr.message)
      return res.status(500).json({
        success: false,
        message: `Database error (${scalarErr.code || 'unknown'}): ${scalarErr.message}`,
      })
    }

    if (!birth) {
      return res.status(404).json({ success: false, message: 'No birth record found for this BID' })
    }
    if (birth.childCitizenId) {
      return res.status(409).json({
        success: false,
        message: 'NIN already issued for this birth record',
        nationalId: birth.childCitizenId,
      })
    }

    // Step 2 — best-effort enrichment with father/mother/facility details.
    // If these relation lookups fail (e.g. pending migration), don't fail
    // the whole request — just return the core birth record without them.
    let father = null, mother = null, facility = null
    try {
      if (birth.fatherCitizenId) {
        father = await prisma.citizen.findUnique({
          where:  { id: birth.fatherCitizenId },
          select: { nationalId:true, firstName:true, middleName:true, surname:true },
        })
      }
      if (birth.motherCitizenId) {
        mother = await prisma.citizen.findUnique({
          where:  { id: birth.motherCitizenId },
          select: { nationalId:true, firstName:true, middleName:true, surname:true },
        })
      }
      if (birth.facilityId) {
        facility = await prisma.healthFacility.findUnique({
          where:  { id: birth.facilityId },
          select: { facilityName:true },
        })
      }
    } catch (enrichErr) {
      console.error('[village/birth-lookup] enrichment lookup failed (non-fatal):', enrichErr.code, enrichErr.message)
    }

    const { fatherCitizenId, motherCitizenId, facilityId, ...core } = birth
    return res.json({ success: true, data: { ...core, father, mother, facility } })
  } catch (err) {
    console.error('[village/birth-lookup]', err.code, err.message)
    return res.status(500).json({ success: false, message: `Internal server error: ${err.message}` })
  }
})""",
    "village.js: make /birth-lookup resilient (split scalar + relation queries, log full errors)"
)


# ══════════════════════════════════════════════════════════════════════════════
#  REPORT
# ══════════════════════════════════════════════════════════════════════════════

print()
if errors:
    print("=" * 65)
    print("  PATCH COMPLETED WITH ERRORS")
    print("=" * 65)
    for e in errors:
        print(e)
    print()
    sys.exit(1)
else:
    print("=" * 65)
    print("  ✅  patch_12.py — ALL PATCHES APPLIED SUCCESSFULLY")
    print(f"  ✅  Total malformed colors fixed: {total_color_fixes}")
    print("=" * 65)
    print()
    print("  ROOT CAUSE FIXED")
    print("  • ~50 malformed rgba() colors across 14 files were missing a")
    print("    color channel (e.g. rgba(255,255,0.72) instead of")
    print("    rgba(255,255,255,0.72)). React Native silently drops invalid")
    print("    colors — this caused invisible logos/icons, the 'yellow blur'")
    print("    on Village screen, missing dividers, and missing modal overlays.")
    print()
    print("  BACKEND")
    print("  • village.js — /birth-lookup now split into scalar + enrichment")
    print("    queries with detailed error logging. If you still see errors,")
    print("    check Render logs for '[village/birth-lookup]' — the actual")
    print("    Prisma error code/message will now be shown in the mobile app")
    print("    error text too (apiGet now surfaces backend messages).")
    print()
    print("  IMPORTANT — IF HTTP 500 PERSISTS AFTER THIS PATCH:")
    print("  1. Redeploy backend to Render (push these changes)")
    print("  2. Run on Render shell or locally against prod DB:")
    print("       npx prisma generate")
    print("       npx prisma migrate deploy")
    print("  3. Try the BID lookup again — the error message shown will now")
    print("     include the exact Prisma error code (e.g. P2022 = missing")
    print("     column → migration not applied)")
    print()
