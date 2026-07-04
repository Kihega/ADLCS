#!/usr/bin/env python3
"""
patch_adlcs_fixes.py

Run from the ADLCS project root (the folder that contains "code/"):
    python3 patch_adlcs_fixes.py

WHAT THIS FIXES
================================================================================
1) "App reloads / previous screen blanks out" when navigating the mobile app.
   ROOT CAUSE: HospitalHomeScreen, VillageHomeScreen, PendingCasesScreen,
   ViewRecordsScreen and VillageViewRecordsScreen all call their data-loading
   function with `useFocusEffect(() => load())`. Every one of those `load`
   functions does `if (!silent) setLoading(true)`, and every one of those
   screens does `if (loading) return <FullScreenSpinner/>`. Because the
   focus effect never passes `silent`, EVERY time you navigate back to one
   of these screens (not just the first time), the whole screen is torn
   down and replaced with a full-screen spinner while it re-fetches — which
   is exactly what feels like the "screen reloading" you described.
   FIX: each screen now remembers (via a ref) whether it has already loaded
   once. The first mount still shows the spinner (you want a loading state
   before there's any data). Every subsequent focus event calls the loader
   in "silent" mode instead — it still refreshes the data from the backend
   in the background, but it does NOT blank the screen while doing so. This
   is "refresh data, don't reload the screen," which is what you described
   wanting.
   NOTE ON THE PHOTO/CAMERA CRASH: this codebase's NIN photo-capture flow
   (NINRegistrationScreen -> src/utils/imageCompression.ts) already resizes
   and re-encodes every captured photo down to <=3MB before it's held in
   state or uploaded, specifically to avoid the OOM-kill-looks-like-a-crash
   problem on mid/low-range phones. That fix is already present in this
   zip. What was almost certainly ALSO happening on top of that: after
   saving, the very next screen you land on is one of the screens fixed in
   this patch, and its non-silent focus reload made it look like the app
   had crashed/restarted right after you tapped save. Fixing #1 above
   should make the whole "capture -> save -> reload" sequence feel smooth.
   If you still see a crash on a specific device, capture the device logs
   (adb logcat, or the Expo dev client "Show logs") around the crash —
   that's the only way to tell an OOM kill apart from a JS exception.

2) One-time login tokens (SADM-/DADM-/VOFF-/HOFF-) were NOT invalidated
   after a successful use. POST /api/auth/validate-token would accept the
   same token again and again until its 7-day expiry. FIX: on a successful
   match, the token's hash/expiry are cleared in the same request, so it
   becomes unusable immediately after the first successful validation
   (single-use), while the admin/officer record itself is untouched.

3) Nothing ever purged expired token data. `node-cron` was already listed
   in package.json but never imported anywhere. FIX: adds
   code/backend/src/lib/tokenCleanup.js, a daily job that clears
   loginTokenHash/loginTokenExpires for any account whose token has passed
   its 7-day expiry (whether or not it was ever used), and wires it up in
   src/index.js on server start.

4) POST /api/admin/district-admins, /village-officers, /health-officers and
   /super-admins accepted any non-empty string as `email` (no format check)
   before generating a token and emailing it via Resend. FIX: adds a shared
   email-format check (used before token generation) to all four routes,
   returning a 400 with a clear message for malformed addresses instead of
   silently trying to email an invalid address.

WHAT THIS DOES NOT DO
================================================================================
This script does not touch data-fetching architecture (dashboard.js,
village.js, admin.js already read/write exclusively through Prisma against
DATABASE_URL, i.e. the central Postgres DB — there is no separate local
mock data source for the admin dashboard cards/tables) and does not touch
web routing (code/web/src/App.jsx already uses React Router client-side
navigation with no window.location/full-page reloads).

Behavior:
  - Idempotent: safe to re-run; each fix is skipped with [OK] if already
    applied.
  - Refuses (exits non-zero, clear message) to touch a file whose expected
    anchor text isn't found, rather than guessing and silently corrupting
    it.
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
if not (ROOT / "code").is_dir():
    # allow running from one level up (e.g. next to the extracted ADLCS-main folder)
    alt = ROOT / "ADLCS-main"
    if (alt / "code").is_dir():
        ROOT = alt

BACKEND = ROOT / "code" / "backend"
MOBILE = ROOT / "code" / "mobile"

FAILURES = []


def fail(path, msg):
    FAILURES.append(f"{path}: {msg}")
    print(f"[FAIL] {path}: {msg}")


def ok(path, msg):
    print(f"[OK] {path}: {msg}")


def patched(path, msg):
    print(f"[PATCHED] {path}: {msg}")


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def write(path: Path, text: str):
    path.write_text(text, encoding="utf-8")


# ─────────────────────────────────────────────────────────────────────────
# Fix 1: silent-refresh-on-focus for the 5 mobile screens
# ─────────────────────────────────────────────────────────────────────────

MARKER = "PATCH-FASTNAV-2026"

FOCUS_SCREENS = [
    {
        "path": MOBILE / "src" / "screens" / "hospital" / "HospitalHomeScreen.tsx",
        "needs_useref_import": False,
        "anchor": (
            "  // \u2190 Refresh whenever screen comes back into focus (e.g. after RegisterBirth)\n"
            "  useFocusEffect(\n"
            "    useCallback(() => {\n"
            "      loadData()\n"
            "    }, [loadData])\n"
            "  )\n"
        ),
        "load_call": "loadData",
    },
    {
        "path": MOBILE / "src" / "screens" / "village" / "VillageHomeScreen.tsx",
        "needs_useref_import": False,
        "anchor": (
            "  // Refresh on focus (picks up new citizen/death registrations immediately)\n"
            "  useFocusEffect(\n"
            "    useCallback(() => {\n"
            "      loadData()\n"
            "    }, [loadData])\n"
            "  )\n"
        ),
        "load_call": "loadData",
    },
    {
        "path": MOBILE / "src" / "screens" / "hospital" / "PendingCasesScreen.tsx",
        "needs_useref_import": True,
        "anchor": (
            "  useFocusEffect(\n"
            "    useCallback(() => {\n"
            "      load()\n"
            "    }, [load])\n"
            "  )\n"
        ),
        "load_call": "load",
    },
    {
        "path": MOBILE / "src" / "screens" / "hospital" / "ViewRecordsScreen.tsx",
        "needs_useref_import": True,
        "anchor": (
            "  useFocusEffect(\n"
            "    useCallback(() => {\n"
            "      loadRecords()\n"
            "    }, [loadRecords])\n"
            "  )\n"
        ),
        "load_call": "loadRecords",
    },
    {
        "path": MOBILE / "src" / "screens" / "village" / "VillageViewRecordsScreen.tsx",
        "needs_useref_import": True,
        "anchor": (
            "  useFocusEffect(\n"
            "    useCallback(() => {\n"
            "      loadRecords()\n"
            "    }, [loadRecords])\n"
            "  )\n"
        ),
        "load_call": "loadRecords",
    },
]


def fix_focus_screen(spec):
    p = spec["path"]
    rel = p.relative_to(ROOT) if p.is_relative_to(ROOT) else p
    if not p.is_file():
        fail(rel, "file not found")
        return

    text = read(p)

    if MARKER in text:
        ok(rel, "already patched, skipping")
        return

    if spec["needs_useref_import"]:
        old_import = "import React, { useState, useCallback } from 'react'"
        new_import = "import React, { useState, useCallback, useRef } from 'react'"
        if old_import in text:
            text = text.replace(old_import, new_import, 1)
        elif "useRef" not in text.split("\n", 1)[0] and "useRef" not in text[: text.find("\n\n")]:
            # import line differs from expected exact form — don't guess at it
            fail(rel, "could not find expected React import line to add useRef; please add "
                       "`useRef` to the `react` import manually and re-run")
            return

    anchor = spec["anchor"]
    if anchor not in text:
        fail(rel, "expected useFocusEffect block not found (file structure may have changed); "
                   "refusing to guess, please inspect manually")
        return

    load_call = spec["load_call"]
    replacement = (
        f"  // {MARKER}: only show the full-screen loading spinner on first mount.\n"
        f"  // Later focus events (navigating back to this screen) refresh data\n"
        f"  // silently in the background instead of blanking the screen, so moving\n"
        f"  // between screens feels instant instead of like a reload.\n"
        f"  const hasLoadedOnceRef = useRef(false)\n"
        f"  useFocusEffect(\n"
        f"    useCallback(() => {{\n"
        f"      {load_call}(hasLoadedOnceRef.current)\n"
        f"      hasLoadedOnceRef.current = true\n"
        f"    }}, [{load_call}])\n"
        f"  )\n"
    )

    text = text.replace(anchor, replacement, 1)
    write(p, text)
    patched(rel, "focus refresh is now silent after first load")


# ─────────────────────────────────────────────────────────────────────────
# Fix 2: invalidate one-time token after successful validation
# ─────────────────────────────────────────────────────────────────────────

def fix_token_single_use():
    p = BACKEND / "src" / "routes" / "auth.js"
    rel = p.relative_to(ROOT)
    if not p.is_file():
        fail(rel, "file not found")
        return

    text = read(p)
    marker = "PATCH-TOKEN-SINGLEUSE-2026"
    if marker in text:
        ok(rel, "already patched, skipping")
        return

    anchor = (
        "    if (!found) {\n"
        "      return res.status(401).json({ success: false, message: 'Invalid or expired authorization token.' })\n"
        "    }\n"
        "\n"
        "    return res.json({ success: true, role: match.role, userId: found.id })\n"
    )
    if anchor not in text:
        fail(rel, "expected validate-token success block not found; refusing to guess")
        return

    replacement = (
        "    if (!found) {\n"
        "      return res.status(401).json({ success: false, message: 'Invalid or expired authorization token.' })\n"
        "    }\n"
        "\n"
        f"    // {marker}: a token is single-use. Clear it the moment it's\n"
        "    // successfully validated so it can't be replayed by anyone who\n"
        "    // intercepts it later, even though it's not yet at its 7-day\n"
        "    // expiry. The account record itself is untouched; the officer/\n"
        "    // admin will need a fresh token issued if they ever need another\n"
        "    // one-time login link.\n"
        "    await prisma[match.model].update({\n"
        "      where: { id: found.id },\n"
        "      data: { loginTokenHash: null, loginTokenExpires: null },\n"
        "    })\n"
        "\n"
        "    return res.json({ success: true, role: match.role, userId: found.id })\n"
    )
    text = text.replace(anchor, replacement, 1)
    write(p, text)
    patched(rel, "token is now cleared immediately after a successful validation (single-use)")


# ─────────────────────────────────────────────────────────────────────────
# Fix 3: daily cleanup job for expired (but never-cleared) tokens
# ─────────────────────────────────────────────────────────────────────────

CLEANUP_FILE_CONTENT = '''// PATCH-TOKEN-CLEANUP-2026
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
'''


def fix_add_cleanup_file():
    p = BACKEND / "src" / "lib" / "tokenCleanup.js"
    rel = p.relative_to(ROOT)
    if p.is_file() and "PATCH-TOKEN-CLEANUP-2026" in read(p):
        ok(rel, "already exists, skipping")
        return
    p.parent.mkdir(parents=True, exist_ok=True)
    write(p, CLEANUP_FILE_CONTENT)
    patched(rel, "created daily token-cleanup job")


def fix_wire_cleanup_into_index():
    p = BACKEND / "src" / "index.js"
    rel = p.relative_to(ROOT)
    if not p.is_file():
        fail(rel, "file not found")
        return
    text = read(p)
    marker = "PATCH-TOKEN-CLEANUP-2026"
    if marker in text:
        ok(rel, "already wired up, skipping")
        return

    # Find `app.listen(` to hook in right after the server starts listening.
    m = re.search(r"app\.listen\([^\n]*\{", text)
    if not m:
        # Fallback: just look for any app.listen( call
        m = re.search(r"app\.listen\(", text)
    if not m:
        fail(rel, "could not find app.listen(...) to hook the cleanup job into; "
                   "refusing to guess — please call startTokenCleanupJob() manually "
                   "after the server starts")
        return

    require_line = f"const {{ startTokenCleanupJob }} = require('./lib/tokenCleanup') // {marker}\n"
    # Insert the require near the top, after the first block of requires.
    first_require_match = re.search(r"^const .*require\(.*\).*\n", text, re.MULTILINE)
    if first_require_match:
        insert_at = first_require_match.end()
        text = text[:insert_at] + require_line + text[insert_at:]
    else:
        text = require_line + text

    # Insert a call to startTokenCleanupJob() right after app.listen(...) opens.
    # Re-search since text length changed.
    m2 = re.search(r"^([ \t]*).*app\.listen\([^\n]*\{", text, re.MULTILINE)
    if m2:
        indent = m2.group(1) + "  "
        insert_at = m2.end()
        call = f"\n{indent}startTokenCleanupJob() // {marker}"
        text = text[:insert_at] + call + text[insert_at:]
    else:
        fail(rel, "require added, but could not find app.listen callback body to start the job; "
                   "please call startTokenCleanupJob() manually")
        write(p, text)
        return

    write(p, text)
    patched(rel, "wired daily token-cleanup job into server startup")


# ─────────────────────────────────────────────────────────────────────────
# Fix 4: email format validation before token generation
# ─────────────────────────────────────────────────────────────────────────

def fix_email_validation():
    p = BACKEND / "src" / "routes" / "admin.js"
    rel = p.relative_to(ROOT)
    if not p.is_file():
        fail(rel, "file not found")
        return
    text = read(p)
    marker = "PATCH-EMAIL-VALIDATE-2026"
    if marker in text:
        ok(rel, "already patched, skipping")
        return

    helper_anchor = "const { sendAuthTokenEmail } = require('../lib/email')\n"
    if helper_anchor not in text:
        fail(rel, "could not find the sendAuthTokenEmail import line to anchor the email "
                   "validator helper; refusing to guess")
        return

    helper = (
        f"\n// {marker}\n"
        "const EMAIL_RE = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/\n"
        "/** Returns an error string if `email` isn't a plausible address, else null. */\n"
        "function emailFormatError(email) {\n"
        "  if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {\n"
        "    return 'A valid email address is required'\n"
        "  }\n"
        "  return null\n"
        "}\n"
    )
    text = text.replace(helper_anchor, helper_anchor + helper, 1)

    # Four identical-shaped required-fields checks, one per creation route.
    # Each is uniquely identified by the destructured field list that
    # precedes it, so we patch each individually rather than a single
    # global replace (the message text is identical across all four).
    targets = [
        (
            "  const { fullName, email, nidaNumber, employeeId, mobile, regionId, districtId, department } = req.body\n"
            "  if (!fullName || !email || !nidaNumber || !employeeId) {\n"
            "    return res.status(400).json({ success: false, message: 'fullName, email, nidaNumber and employeeId are required' })\n"
            "  }\n"
        ),
        (
            "  const { fullName, email, nidaNumber, employeeId, mobile, villageId, wardId } = req.body\n"
            "  if (!fullName || !email || !nidaNumber || !employeeId) {\n"
            "    return res.status(400).json({ success: false, message: 'fullName, email, nidaNumber and employeeId are required' })\n"
            "  }\n"
        ),
        (
            "  const { fullName, email, nidaNumber, employeeId, mobile, facilityId } = req.body\n"
            "  if (!fullName || !email || !nidaNumber || !employeeId) {\n"
            "    return res.status(400).json({ success: false, message: 'fullName, email, nidaNumber and employeeId are required' })\n"
            "  }\n"
        ),
        (
            "  const { fullName, email, nidaNumber, employeeId, mobile, department } = req.body\n"
            "  if (!fullName || !email || !nidaNumber || !employeeId) {\n"
            "    return res.status(400).json({ success: false, message: 'fullName, email, nidaNumber and employeeId are required' })\n"
            "  }\n"
        ),
    ]

    applied = 0
    for target in targets:
        if target not in text:
            continue
        insert = (
            f"  {{\n"
            f"    const err = emailFormatError(email) // {marker}\n"
            f"    if (err) return res.status(400).json({{ success: false, message: err }})\n"
            f"  }}\n"
        )
        text = text.replace(target, target + insert, 1)
        applied += 1

    if applied == 0:
        fail(rel, "none of the 4 expected create-admin/officer required-field blocks were "
                   "found; refusing to guess")
        return

    write(p, text)
    patched(rel, f"added email format validation to {applied}/4 admin/officer creation routes")
    if applied < 4:
        print(f"[WARN] {rel}: only matched {applied} of the expected 4 routes — "
              f"check the remaining route(s) manually")


def main():
    if not BACKEND.is_dir() or not MOBILE.is_dir():
        print("[FAIL] Could not find code/backend and code/mobile under the project root.")
        print(f"       Looked in: {ROOT}")
        print("       Run this script from the ADLCS project root (the folder containing 'code/').")
        sys.exit(1)

    for spec in FOCUS_SCREENS:
        fix_focus_screen(spec)

    fix_token_single_use()
    fix_add_cleanup_file()
    fix_wire_cleanup_into_index()
    fix_email_validation()

    print()
    if FAILURES:
        print(f"Done with {len(FAILURES)} failure(s):")
        for f in FAILURES:
            print(f"  - {f}")
        sys.exit(1)
    print("All fixes applied (or already present). Next steps:")
    print("  - backend: npm install   (picks up node-cron if not already installed)")
    print("  - backend: restart the server so the cleanup job + token-invalidation take effect")
    print("  - mobile: restart Metro / rebuild the dev client")


if __name__ == "__main__":
    main()
1
