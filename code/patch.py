#!/usr/bin/env python3
"""
patch3.py — TzCRVS fix pack v2 (geo manual-entry verification + email delivery visibility)
================================================================
Run from inside the extracted ADLCS-main/code folder:

    cd ADLCS-main/code
    python3 patch3.py

WHAT THIS DOES
----------------

(1) VILLAGE/STREET MANUAL ENTRY + AUTO-ADD-TO-DROPDOWN — VERIFIED, ALREADY
    IMPLEMENTED, NO CHANGES NEEDED. This script does not touch any file for
    this part; it's documented here because you asked for it to be checked.

    I traced every place in the mobile app and the web dashboard that lets
    someone pick a village or street:

      Mobile (GeoCascadePicker.tsx, used by RegisterBirthScreen's origin-
      village field and TrackMigrationScreen's own-village field):
        - Region/District/Ward are strict dropdowns (fixed administrative
          units — correct, these shouldn't be freely inventable).
        - Village/Street has a searchable dropdown from GET /geo/villages
          PLUS a "+ Add new village/street" row. Typing a name there calls
          POST /geo/villages, which get-or-creates it against the DB
          (case-insensitive match on {wardId, name}, guarded by a real
          @@unique DB constraint — see geo.js) and immediately selects the
          new row. The very next lookup for that ward lists it normally.
        - The ONE place manual entry is deliberately disabled is the
          migration destination picker (allowManualVillage={false} in
          TrackMigrationScreen) — correct, since a migration destination
          must be a place that already exists in the system, not one
          invented on the spot.
        - Every other screen that references a village (CitizenProfile,
          MigrationRequests, ConfirmIncomingMigration, VillageRecordDeath,
          NINRegistration, VillageHome) only *displays* the officer's own
          village — it's never manually entered there, so there's nothing
          to add.

      Web (NewRegistrationModal.jsx, used when a District/Super Admin
      registers a new Village Officer): same pattern — a dropdown sourced
      from GET /admin/geo/villages, with an "Add new" affordance that
      calls the same shared POST /geo/villages get-or-create endpoint.

      Backend (geo.js): implements the full Region→District→Ward→Village
      hierarchy read paths, plus the shared get-or-create POST used by
      both clients above, including a race-condition-safe fallback if two
      officers submit the same new village at the same instant.

    Net result: the flow you described — manual entry when not in the
    dropdown, immediately saved with its correct geographic parent, so
    it appears as a normal dropdown option from then on — already exists
    everywhere it needs to, on both mobile and web. Nothing was missing.

(2) OFFICER-REGISTRATION WELCOME EMAIL — VISIBILITY GAP FOUND AND FIXED.
    The Resend integration itself (backend/src/lib/email.js) was already
    correctly wired: RESEND_API_KEY / EMAIL_FROM are real Render env vars
    (render.yml), and all four officer/admin creation routes already call
    it. The actual problem is that every call site did:

        sendWelcomeEmail(...).catch(err => console.error(...))
        return res.json({ success: true, data: { ...created, defaultPassword } })

    — fire-and-forget. The HTTP response goes back to the admin dashboard
    before Resend even replies, and if the send fails (bad API key, an
    unverified "from" domain, Resend being down, etc.) that failure is
    ONLY ever visible in the backend's server logs. The web dashboard's
    NewRegistrationModal, meanwhile, unconditionally told the admin "A
    confirmation email has also been sent to their address" — true or
    not. There was no way to actually verify from the app whether an
    email reached anyone, which is exactly what you're trying to test.

    Fixed by:
      a) backend/src/lib/email.js — add sendTestEmail(to), a minimal
         diagnostic send that doesn't pretend to be a real account notice.
      b) backend/src/routes/admin.js — all four creation routes
         (super-admin, district-admin, village-officer, hospital-officer)
         now AWAIT sendWelcomeEmail and return real emailSent / emailError
         fields in the response, instead of firing-and-forgetting.
      c) backend/src/routes/admin.js — new POST /admin/test-email
         (super_admin only) that sends a one-off test email to any address
         and reports Resend's actual result — the fastest way to check the
         integration end-to-end without creating a throwaway officer
         account.
      d) web/src/api/admin.api.js — apiSendTestEmail(to) client for (c).
      e) web/src/modals/NewRegistrationModal.jsx — the post-creation screen
         now shows "Confirmation email sent" or the actual failure reason
         instead of an unconditional claim.

    HOW TO ACTUALLY TEST RESEND DELIVERY after applying this patch and
    deploying:
      - Fastest: as a super_admin, POST /api/admin/test-email
        { "to": "you@example.com" } — the JSON response tells you exactly
        whether Resend accepted it or the exact error (bad key, domain not
        verified, rate limit, etc.) if it didn't.
      - Or just register a new officer through the dashboard as before —
        the success screen will now say plainly whether the email went out.
      - If it fails, check (in order): RESEND_API_KEY is actually set in
        Render's env vars for the backend service (not just present in
        render.yml — render.yml only declares the key exists, `sync:
        false` means you still set the value by hand in the Render
        dashboard); EMAIL_FROM's domain is verified in your Resend
        account (Resend rejects sends from unverified domains); and check
        the Resend dashboard's own delivery logs for the message.

Safe to run more than once — already-applied fixes are detected and
skipped.
================================================================
"""

from pathlib import Path
import sys

ROOT = Path(__file__).parent
BACKEND = ROOT / "backend"
WEB = ROOT / "web"

EMAIL_JS = BACKEND / "src/lib/email.js"
ADMIN_JS = BACKEND / "src/routes/admin.js"
ADMIN_API_JS = WEB / "src/api/admin.api.js"
MODAL_JSX = WEB / "src/modals/NewRegistrationModal.jsx"

CHANGED = []


def apply(path: Path, old: str, new: str, label: str, marker: str, required: bool = True):
    if not path.exists():
        print(f"  ! SKIP ({label}) — file not found: {path}")
        return
    text = path.read_text(encoding="utf-8")

    if marker in text:
        print(f"  = already patched ({label}) — skipping")
        return

    count = text.count(old)
    if count == 0:
        print(f"  ! COULD NOT APPLY ({label}) — pattern not found in {path.name}. "
              f"File may have changed; please check by hand.")
        if required:
            sys.exit(1)
        return
    if count > 1:
        print(f"  ! AMBIGUOUS ({label}) — pattern matched {count} times in {path.name}, expected 1. Skipping.")
        if required:
            sys.exit(1)
        return

    path.write_text(text.replace(old, new), encoding="utf-8")
    print(f"  ✓ {label}")
    CHANGED.append(str(path))


# ── (a) email.js — add sendTestEmail ────────────────────────────────────────
def add_send_test_email():
    print("\n[a] backend/src/lib/email.js — add sendTestEmail()")
    old = "module.exports = { sendWelcomeEmail }\n"
    new = (
        "/**\n"
        " * sendTestEmail — minimal diagnostic send, used by POST /admin/test-email\n"
        " * to verify the Resend integration in isolation (no fake account/password\n"
        " * content, so it can't be mistaken for a real notice if forwarded).\n"
        " * Throws on failure — callers should catch and report the message.\n"
        " */\n"
        "async function sendTestEmail(to) {\n"
        "  if (!RESEND_API_KEY) {\n"
        "    throw new Error('RESEND_API_KEY is not set on this server')\n"
        "  }\n"
        "  const res = await fetch('https://api.resend.com/emails', {\n"
        "    method: 'POST',\n"
        "    headers: {\n"
        "      Authorization: `Bearer ${RESEND_API_KEY}`,\n"
        "      'Content-Type': 'application/json',\n"
        "    },\n"
        "    body: JSON.stringify({\n"
        "      from:    FROM_ADDRESS,\n"
        "      to:      [to],\n"
        "      subject: 'TzCRVS — Resend test email',\n"
        "      html:    '<p>This is a test email from TzCRVS to confirm the Resend integration is working.</p>'\n"
        "        + `<p style=\"color:#888;font-size:12px;\">Sent ${new Date().toISOString()}</p>`,\n"
        "    }),\n"
        "  })\n"
        "  if (!res.ok) {\n"
        "    const body = await res.text().catch(() => '')\n"
        "    throw new Error(`Resend API error ${res.status}: ${body}`)\n"
        "  }\n"
        "  return true\n"
        "}\n"
        "\n"
        "module.exports = { sendWelcomeEmail, sendTestEmail }\n"
    )
    apply(EMAIL_JS, old, new, "add sendTestEmail() + export it", marker="async function sendTestEmail(to)")


# ── (b) admin.js — await sendWelcomeEmail + surface result ─────────────────
def make_email_awaited(role, label):
    old = (
        f"    sendWelcomeEmail({{ to: email, fullName, role: '{role}', defaultPassword }}).catch(err => console.error('[email/{label}]', err.message))\n"
        "    return res.json({ success: true, data: { ...created, defaultPassword } })\n"
    )
    new = (
        "    // PATCH-EMAIL-VISIBILITY-2026: await this instead of fire-and-forget so\n"
        "    // the admin dashboard can show whether the welcome email actually sent,\n"
        "    // rather than a fixed claim that it did.\n"
        "    let emailSent = false, emailError = null\n"
        "    try {\n"
        f"      await sendWelcomeEmail({{ to: email, fullName, role: '{role}', defaultPassword }})\n"
        "      emailSent = true\n"
        "    } catch (err) {\n"
        "      emailError = err.message\n"
        f"      console.error('[email/{label}]', err.message)\n"
        "    }\n"
        "    return res.json({ success: true, data: { ...created, defaultPassword, emailSent, emailError } })\n"
    )
    # Marker must be unique to THIS role and present only after patching —
    # "await sendWelcomeEmail({ to: email, fullName, role: '<role>'" only
    # ever appears in the patched (new) text, never the original fire-and-
    # forget call, and the role name keeps the four calls independently
    # idempotent (patching one role must not make the others look "done").
    marker = f"await sendWelcomeEmail({{ to: email, fullName, role: '{role}'"
    apply(
        ADMIN_JS, old, new,
        f"await sendWelcomeEmail + surface emailSent/emailError ({role})",
        marker=marker,
    )


def fix_email_visibility():
    print("\n[b] backend/src/routes/admin.js — await email sends, report real status")
    make_email_awaited("district_admin", "district-admin")
    make_email_awaited("village_officer", "village-officer")
    make_email_awaited("hospital_officer", "hospital-officer")
    make_email_awaited("super_admin", "super-admin")


# ── (c) admin.js — POST /admin/test-email ───────────────────────────────────
def add_test_email_route():
    print("\n[c] backend/src/routes/admin.js — add POST /admin/test-email")
    old = "const AGE_BANDS = [\n"
    new = (
        "// PATCH-EMAIL-VISIBILITY-2026: standalone Resend diagnostic — send a\n"
        "// test email to any address and report exactly what Resend said, without\n"
        "// creating a throwaway officer account just to check delivery.\n"
        "router.post('/test-email', requireRole('super_admin'), async (req, res) => {\n"
        "  const to = typeof req.body.to === 'string' ? req.body.to.trim() : ''\n"
        "  const err = emailFormatError(to)\n"
        "  if (err) return res.status(400).json({ success: false, message: err })\n"
        "  try {\n"
        "    await sendTestEmail(to)\n"
        "    return res.json({ success: true, message: `Test email sent to ${to}.` })\n"
        "  } catch (e) {\n"
        "    console.error('[admin/test-email]', e.message)\n"
        "    return res.status(502).json({ success: false, message: `Resend send failed: ${e.message}` })\n"
        "  }\n"
        "})\n"
        "\n"
        "const AGE_BANDS = [\n"
    )
    apply(ADMIN_JS, old, new, "add POST /admin/test-email", marker="router.post('/test-email'")

    old_import = "const { sendWelcomeEmail } = require('../lib/email')\n"
    new_import = "const { sendWelcomeEmail, sendTestEmail } = require('../lib/email')\n"
    apply(ADMIN_JS, old_import, new_import, "import sendTestEmail", marker="sendWelcomeEmail, sendTestEmail")


# ── (d) web/src/api/admin.api.js — apiSendTestEmail ─────────────────────────
def add_web_test_email_client():
    print("\n[d] web/src/api/admin.api.js — add apiSendTestEmail()")
    old = (
        "export async function apiCreateVillage(wardId, name, type = 'village') {\n"
        "  const { data } = await apiClient.post('/geo/villages', { wardId, name, type })\n"
        "  return data\n"
        "}\n"
    )
    new = (
        old
        + "\n"
        + "// PATCH-EMAIL-VISIBILITY-2026: standalone Resend delivery check.\n"
        + "export async function apiSendTestEmail(to) {\n"
        + "  const { data } = await apiClient.post('/admin/test-email', { to })\n"
        + "  return data\n"
        + "}\n"
    )
    apply(ADMIN_API_JS, old, new, "add apiSendTestEmail()", marker="apiSendTestEmail")


# ── (e) web/src/modals/NewRegistrationModal.jsx — show real email status ───
def fix_modal_email_claim():
    print("\n[e] web/src/modals/NewRegistrationModal.jsx — show real email delivery status")
    old = (
        "            <p className=\"text-gray-500 text-xs\">\n"
        "              Status: <span className=\"text-[#00ff9d] uppercase\">{result.status}</span> — share this default\n"
        "              password with them directly. They can log in right away with their email and this password,\n"
        "              and should change it within 3 days. A confirmation email has also been sent to their address.\n"
        "            </p>\n"
    )
    new = (
        "            <p className=\"text-gray-500 text-xs\">\n"
        "              Status: <span className=\"text-[#00ff9d] uppercase\">{result.status}</span> — share this default\n"
        "              password with them directly. They can log in right away with their email and this password,\n"
        "              and should change it within 3 days.\n"
        "            </p>\n"
        "            {/* PATCH-EMAIL-VISIBILITY-2026: show the real outcome instead of an\n"
        "                unconditional claim the email went out. */}\n"
        "            {result.emailSent ? (\n"
        "              <p className=\"text-[#00ff9d] text-xs\">✓ Confirmation email sent to {result.email}.</p>\n"
        "            ) : (\n"
        "              <p className=\"text-[#ffb020] text-xs\">\n"
        "                ⚠ Confirmation email did NOT send{result.emailError ? `: ${result.emailError}` : '.'} Share the\n"
        "                password with them directly.\n"
        "              </p>\n"
        "            )}\n"
    )
    apply(MODAL_JSX, old, new, "show real emailSent/emailError status", marker="PATCH-EMAIL-VISIBILITY-2026: show the real outcome")


def main():
    print("── TzCRVS patch3.py ──────────────────────────────────────────────")
    print("\n[1] Village/street manual-entry flow — VERIFIED, already fully")
    print("    implemented on mobile + web + backend. No file changes needed.")
    print("    (See the docstring at the top of this script for the full trace.)")

    add_send_test_email()
    fix_email_visibility()
    add_test_email_route()
    add_web_test_email_client()
    fix_modal_email_claim()

    print("\n── Done ───────────────────────────────────────────────────────────")
    if not CHANGED:
        print("No files were changed (everything already patched, or nothing to do).")
    else:
        seen = []
        for f in CHANGED:
            if f not in seen:
                seen.append(f)
        print(f"{len(seen)} file(s) updated:")
        for f in seen:
            print(f"  - {f}")

    print(
        "\n"
        "── Testing Resend delivery after this patch is deployed ────────────\n"
        "  curl -X POST https://<your-backend>/api/admin/test-email \\\n"
        "    -H \"Authorization: Bearer <a super_admin access token>\" \\\n"
        "    -H \"Content-Type: application/json\" \\\n"
        "    -d '{\"to\":\"you@example.com\"}'\n"
        "\n"
        "A 200 response means Resend accepted the send — check your inbox (and\n"
        "spam) and the Resend dashboard's logs. A non-200 response includes the\n"
        "exact reason Resend gave (bad key, unverified from-domain, etc.).\n"
    )


if __name__ == "__main__":
    main()
