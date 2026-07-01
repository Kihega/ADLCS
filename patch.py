#!/usr/bin/env python3
"""
fix_superadmin_registration_email_darkmode.py — TzCRVS patch #2

Run from the project root (~/ADLCS):
    python3 fix_superadmin_registration_email_darkmode.py

Idempotent — safe to re-run any number of times.

Fixes applied:

  1. Manage Users — "Add National Admin" button for Super Admin tab.
     System enforces min-1 / max-3 super_admin rule:
       • Deletion blocked when only 1 remains.
       • Addition blocked when 3 already exist.
     Only a super_admin can add/delete another super_admin.
     Reuses the existing NewRegistrationModal (extended to accept
     target='super_admin').

  2. Registration email — upon successful creation of a District Admin
     or Super Admin, the one-time authorization token is sent to the
     newly registered email via the Resend API:
       a. lib/email.js created (Resend client wrapper).
       b. Admin routes updated to call sendAuthTokenEmail() after each
          POST /district-admins and POST /super-admins (new).
       c. A formal, well-designed HTML email is included.
     The registration still succeeds even if the email send fails
     (RESEND_API_KEY may not be configured in dev; errors are logged).
     The token is also returned in the JSON response as a fallback
     (existing copy-to-clipboard UX in NewRegistrationModal unchanged).

  3. POST /api/admin/super-admins  — NEW backend route (super_admin only):
       • Enforces min-1 / max-3 guard on GET too (count returned).
       • Supports DELETE /api/admin/super-admins/:id with same guards.
     GET  /api/admin/super-admins  — list (with count) for UI guard.

  4. Token validation — POST /api/auth/validate-token (new route):
     The Login page's "Authorize" button currently runs mock logic.
     This patch wires it to the real backend: it checks loginTokenHash
     and loginTokenExpires, returns { valid, role, userId } so the
     frontend can proceed to MFA setup → profile completion.

  5. LoginPage.jsx — handleToken() is replaced with a real API call to
     POST /api/auth/validate-token. On success, the detected role and
     userId are stored in state and the flow continues identically
     (mode → 'mfa_setup'). Also updates the token hint text to include
     SADM- prefix.

  6. Dark mode / light mode toggle — an icon button is added to the
     AdminDashboard topbar (visible to both super_admin and
     district_admin). The preference is stored in localStorage under
     'tzcrvs_theme' and survives page reloads. It is session/user-
     scoped: changing theme only affects the device/browser where the
     currently-logged-in user made the change — it does not persist to
     the server or affect other sessions.
     Dark mode is the existing default; light mode inverts the palette
     using a CSS class on <html>.

  7. NewRegistrationModal.jsx — adds 'super_admin' as a registerable
     target (reuses the same form fields as district_admin, minus the
     Region/District dropdowns which aren't needed for a national admin),
     and calls the new apiCreateSuperAdmin() API function.
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
WEB  = ROOT / "code" / "web"  / "src"
BACK = ROOT / "code" / "backend" / "src"

CHANGED = []
SKIPPED = []
FAILED  = []


def read(p):  return p.read_text(encoding="utf-8")
def write(p, t): p.write_text(t, encoding="utf-8")

def patch(path, replacements, label):
    if not path.exists():
        FAILED.append(f"{label}: {path} not found"); return
    text = read(path)
    orig = text
    applied = already = 0
    for old, new, marker in replacements:
        if marker in text:
            already += 1; continue
        if old not in text:
            FAILED.append(f"{label}: old text not found (marker={marker!r})"); continue
        text = text.replace(old, new, 1); applied += 1
    if applied:
        write(path, text); CHANGED.append(label)
    elif already == len(replacements):
        SKIPPED.append(f"{label} (already applied)")
    elif text != orig:
        write(path, text); CHANGED.append(label + " (partial)")


def create_file(path, content, label):
    if path.exists() and "PATCH-EMAIL-2025" in read(path):
        SKIPPED.append(f"{label} (already created)"); return
    path.parent.mkdir(parents=True, exist_ok=True)
    write(path, content); CHANGED.append(label)


# ─────────────────────────────────────────────────────────────────────────────
# 1. lib/email.js  — Resend client wrapper
# ─────────────────────────────────────────────────────────────────────────────
EMAIL_LIB = '''\
// PATCH-EMAIL-2025
/**
 * email.js — TzCRVS transactional email via Resend
 *
 * RESEND_API_KEY and EMAIL_FROM must be set in the backend .env file.
 * If they are absent the helper logs a warning and resolves without
 * throwing — registration still succeeds even without email delivery.
 *
 * Usage:
 *   const { sendAuthTokenEmail } = require('./email')
 *   await sendAuthTokenEmail({ to, fullName, token, role, expiresAt })
 */

const { Resend } = require('resend')

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null

/** Role-to-human label mapping for the email body. */
const ROLE_LABEL = {
  super_admin:    'National System Administrator (Super Admin)',
  district_admin: 'District Administrator',
}

/** Token prefix displayed in the email (matches login-page hint). */
const TOKEN_PREFIX_HINT = {
  super_admin:    'SADM-',
  district_admin: 'DADM-',
}

/**
 * Build the formal HTML email body for the one-time authorization token.
 *
 * @param {object} opts
 * @param {string} opts.fullName   Recipient's full name
 * @param {string} opts.token      Plain-text one-time token (e.g. SADM-1234-5678)
 * @param {string} opts.role       'super_admin' | 'district_admin'
 * @param {Date}   opts.expiresAt  Expiry timestamp
 */
function buildHtml({ fullName, token, role, expiresAt }) {
  const roleLabel    = ROLE_LABEL[role] || role
  const prefixHint   = TOKEN_PREFIX_HINT[role] || ''
  const expiryStr    = expiresAt
    ? new Date(expiresAt).toUTCString()
    : '7 days from now'

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>TzCRVS — Authorization Token</title>
</head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:'Segoe UI',Arial,sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

        <!-- ── Header banner ─────────────────────────────────────────── -->
        <tr>
          <td style="background:linear-gradient(135deg,#0a1628 0%,#1a3060 100%);padding:32px 40px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <p style="margin:0;color:#fbbf24;font-size:9px;font-weight:700;letter-spacing:3px;text-transform:uppercase;">
                    THE UNITED REPUBLIC OF TANZANIA
                  </p>
                  <h1 style="margin:6px 0 4px;color:#ffffff;font-size:20px;font-weight:800;letter-spacing:0.5px;">
                    National Bureau of Statistics
                  </h1>
                  <p style="margin:0;color:rgba(255,255,255,0.5);font-size:10px;letter-spacing:2px;text-transform:uppercase;">
                    TzCRVS · Civil Registration &amp; Vital Statistics
                  </p>
                </td>
                <td align="right" style="vertical-align:top;">
                  <div style="width:52px;height:52px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);border-radius:10px;display:flex;align-items:center;justify-content:center;">
                    <span style="color:#00d4ff;font-size:22px;font-weight:900;font-family:monospace;">NBS</span>
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ── Body ─────────────────────────────────────────────────── -->
        <tr>
          <td style="padding:40px 40px 32px;">

            <!-- Greeting -->
            <p style="margin:0 0 8px;color:#374151;font-size:14px;">Dear <strong>${fullName}</strong>,</p>
            <p style="margin:0 0 24px;color:#6b7280;font-size:13px;line-height:1.7;">
              Your account has been created on the <strong>TzCRVS</strong> platform with the role of
              <strong>${roleLabel}</strong>. To activate your account and complete your profile,
              you must use the one-time authorization token below on your first login.
            </p>

            <!-- Token box -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
              <tr>
                <td style="background:#f8fafc;border:2px dashed #00d4ff;border-radius:10px;padding:24px;text-align:center;">
                  <p style="margin:0 0 8px;color:#6b7280;font-size:10px;font-weight:600;letter-spacing:2px;text-transform:uppercase;">
                    One-Time Authorization Token
                  </p>
                  <p style="margin:0;color:#0a1628;font-size:28px;font-weight:900;font-family:'Courier New',monospace;letter-spacing:4px;word-break:break-all;">
                    ${token}
                  </p>
                  <p style="margin:8px 0 0;color:#9ca3af;font-size:10px;">
                    Token prefix: <code style="background:#e5e7eb;padding:2px 6px;border-radius:4px;font-size:10px;">${prefixHint}</code>
                  </p>
                </td>
              </tr>
            </table>

            <!-- Instructions -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
              <tr>
                <td style="background:#f0fdf4;border-left:4px solid #00d4ff;border-radius:4px;padding:16px 20px;">
                  <p style="margin:0 0 10px;color:#0a1628;font-size:12px;font-weight:700;">
                    How to use this token:
                  </p>
                  <ol style="margin:0;padding-left:18px;color:#374151;font-size:12px;line-height:2;">
                    <li>Visit the TzCRVS login portal.</li>
                    <li>Click <strong>"New admin? Use Authorization Token →"</strong></li>
                    <li>Enter the token exactly as shown above.</li>
                    <li>Complete the MFA setup and fill in your profile details.</li>
                    <li>Your account will be activated upon successful completion.</li>
                  </ol>
                </td>
              </tr>
            </table>

            <!-- Expiry warning -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
              <tr>
                <td style="background:#fff7ed;border-left:4px solid #f59e0b;border-radius:4px;padding:12px 16px;">
                  <p style="margin:0;color:#92400e;font-size:11px;">
                    ⚠ &nbsp;<strong>This token expires on ${expiryStr}.</strong>
                    After expiry, a new token must be issued by your system administrator.
                    Do not share this token with anyone.
                  </p>
                </td>
              </tr>
            </table>

            <p style="margin:0;color:#9ca3af;font-size:11px;line-height:1.6;">
              If you did not expect this email, please contact your system administrator immediately.
              This is an automated message from the NBS TzCRVS platform — please do not reply.
            </p>

          </td>
        </tr>

        <!-- ── Footer ────────────────────────────────────────────────── -->
        <tr>
          <td style="background:#f8fafc;border-top:1px solid #e5e7eb;padding:20px 40px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <p style="margin:0;color:#9ca3af;font-size:10px;line-height:1.6;">
                    National Bureau of Statistics · NBS HQ, Dodoma, Tanzania<br/>
                    TzCRVS — Civil Registration &amp; Vital Statistics System (Research Model V 1.X.X)
                  </p>
                </td>
                <td align="right">
                  <p style="margin:0;color:#d1d5db;font-size:9px;letter-spacing:1px;text-transform:uppercase;">
                    CONFIDENTIAL
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>

</body>
</html>`
}

/**
 * Send the one-time authorization token to a newly registered admin.
 *
 * @param {object} opts
 * @param {string} opts.to        Recipient email address
 * @param {string} opts.fullName  Recipient's full name
 * @param {string} opts.token     Plain-text token (e.g. SADM-1234-5678)
 * @param {string} opts.role      'super_admin' | 'district_admin'
 * @param {Date}   opts.expiresAt Token expiry timestamp
 */
async function sendAuthTokenEmail({ to, fullName, token, role, expiresAt }) {
  if (!resend) {
    console.warn('[email] RESEND_API_KEY not set — skipping email delivery (token logged below)')
    console.warn(`[email] TOKEN FOR ${to}: ${token}`)
    return
  }

  const from     = process.env.EMAIL_FROM || 'onboarding@resend.dev'
  const roleLabel = ROLE_LABEL[role] || 'System User'

  try {
    const { data, error } = await resend.emails.send({
      from,
      to:      [to],
      subject: `[TzCRVS] Your ${roleLabel} Authorization Token`,
      html:    buildHtml({ fullName, token, role, expiresAt }),
    })

    if (error) {
      console.error('[email] Resend delivery error:', error)
    } else {
      console.log(`[email] Token email sent → ${to} (id: ${data?.id})`)
    }
  } catch (err) {
    console.error('[email] Unexpected send error:', err.message)
  }
}

module.exports = { sendAuthTokenEmail }
'''


def fix_create_email_lib():
    create_file(
        BACK / "lib" / "email.js",
        EMAIL_LIB,
        "backend/lib/email.js — Resend email client + HTML template",
    )


# ─────────────────────────────────────────────────────────────────────────────
# 2 & 3. Backend — super_admin CRUD routes + email on district-admin create
# ─────────────────────────────────────────────────────────────────────────────
def fix_backend_admin_routes():
    path = BACK / "routes" / "admin.js"

    # 2a. Add require('email') at top of admin.js
    old_require = "const router = Router()\nrouter.use(requireAuth)"
    new_require = """\
const { sendAuthTokenEmail } = require('../lib/email')

const router = Router()
router.use(requireAuth)"""
    patch(path,
          [(old_require, new_require, "sendAuthTokenEmail")],
          "backend/routes/admin.js — require email lib")

    # 2b. Send email after district admin creation (add after logAction line)
    old_dadm_log = """\
    await logAction(req, { action: 'create_district_admin', targetTable: 'district_admins', targetId: created.id, newData: created })
    return res.json({ success: true, data: { ...created, authToken: token } })"""
    new_dadm_log = """\
    await logAction(req, { action: 'create_district_admin', targetTable: 'district_admins', targetId: created.id, newData: created })
    // PATCH-EMAIL-2025: send one-time token to newly registered district admin
    sendAuthTokenEmail({
      to:        email,
      fullName,
      token,
      role:      'district_admin',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    }).catch(err => console.error('[email/district-admin]', err.message))
    return res.json({ success: true, data: { ...created, authToken: token } })"""
    patch(path,
          [(old_dadm_log, new_dadm_log, "PATCH-EMAIL-2025: send one-time token to newly registered district admin")],
          "backend/routes/admin.js — email on district-admin create")

    # 3. Add Super Admin CRUD routes (insert before the MANAGE USERS section)
    SUPER_ADMIN_ROUTES = """\

// ── SUPER ADMINS — [super_admin only, min-1 / max-3 guard] ───────────────────
// PATCH-EMAIL-2025

const SUPER_ADMIN_MIN = 1
const SUPER_ADMIN_MAX = 3

router.get('/super-admins', requireRole('super_admin'), async (req, res) => {
  const { q } = req.query
  const take   = Math.min(parseInt(req.query.limit) || 25, 100)
  const search = q
    ? { OR: [{ fullName: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }] }
    : {}
  try {
    const [rows, total] = await Promise.all([
      prisma.superAdmin.findMany({
        where:   search,
        take,
        orderBy: { createdAt: 'desc' },
        select:  { id: true, employeeId: true, fullName: true, email: true, mobile: true,
                   department: true, status: true, mfaEnabled: true, createdAt: true, lastLogin: true },
      }),
      prisma.superAdmin.count(),
    ])
    return res.json({ success: true, data: rows, total, canAdd: total < SUPER_ADMIN_MAX, canDelete: total > SUPER_ADMIN_MIN })
  } catch (err) {
    console.error('[admin/super-admins]', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
})

router.post('/super-admins', requireRole('super_admin'), async (req, res) => {
  const total = await prisma.superAdmin.count()
  if (total >= SUPER_ADMIN_MAX) {
    return res.status(409).json({
      success: false,
      message: `System already has the maximum of ${SUPER_ADMIN_MAX} Super Administrators.`,
    })
  }
  const { fullName, email, nidaNumber, employeeId, mobile, department } = req.body
  if (!fullName || !email || !nidaNumber || !employeeId) {
    return res.status(400).json({ success: false, message: 'fullName, email, nidaNumber and employeeId are required' })
  }
  try {
    const token     = generateAuthToken('SADM')
    const tokenHash = await bcrypt.hash(token, 10)
    const created   = await prisma.superAdmin.create({
      data: {
        fullName, email, nidaNumber, employeeId,
        mobile:     mobile     || undefined,
        department: department || undefined,
        status:            'pending',
        loginTokenHash:    tokenHash,
        loginTokenExpires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdById:       req.user.id,
      },
      select: { id: true, fullName: true, email: true, employeeId: true, status: true },
    })
    await logAction(req, {
      action: 'create_super_admin', targetTable: 'super_admins', targetId: created.id,
      newData: created, severity: 'warning',
    })
    // PATCH-EMAIL-2025: send one-time token to newly registered super admin
    sendAuthTokenEmail({
      to:        email,
      fullName,
      token,
      role:      'super_admin',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    }).catch(err => console.error('[email/super-admin]', err.message))
    return res.json({ success: true, data: { ...created, authToken: token } })
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ success: false, message: 'A record with this email, NIDA number, or employee ID already exists' })
    console.error('[admin/create-super-admin]', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
})

router.delete('/super-admins/:id', requireRole('super_admin'), async (req, res) => {
  const { id } = req.params
  if (id === req.user.id) {
    return res.status(400).json({ success: false, message: 'You cannot delete your own account.' })
  }
  const total = await prisma.superAdmin.count()
  if (total <= SUPER_ADMIN_MIN) {
    return res.status(409).json({
      success: false,
      message: `Cannot delete — the system must retain at least ${SUPER_ADMIN_MIN} Super Administrator.`,
    })
  }
  try {
    await prisma.superAdmin.delete({ where: { id } })
    await logAction(req, { action: 'delete_super_admin', targetTable: 'super_admins', targetId: id, severity: 'warning' })
    return res.json({ success: true })
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ success: false, message: 'Not found' })
    console.error('[admin/delete-super-admin]', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
})

"""
    old_manage = "// ── MANAGE USERS — [super_admin only] ────────────────────────────────────────────\n"
    patch(path,
          [(old_manage, SUPER_ADMIN_ROUTES + old_manage, "PATCH-EMAIL-2025\n\nconst SUPER_ADMIN_MIN")],
          "backend/routes/admin.js — super-admins CRUD routes")


# ─────────────────────────────────────────────────────────────────────────────
# 4. Token validation route  — POST /api/auth/validate-token
# ─────────────────────────────────────────────────────────────────────────────
def fix_auth_validate_token_route():
    path = BACK / "routes" / "auth.js"

    VALIDATE_ROUTE = """\

// ── POST /api/auth/validate-token ─────────────────────────────────────────────
// PATCH-EMAIL-2025
// Called by the LoginPage token-authorization flow.
// Body: { token: string }
// Returns: { valid: true, role, userId } on success, 401 on failure.
router.post('/validate-token', authLimiter, async (req, res) => {
  const { token } = req.body
  if (!token || typeof token !== 'string' || token.trim().length < 6) {
    return res.status(400).json({ success: false, message: 'token is required' })
  }
  const t = token.trim().toUpperCase()

  // Determine which table to search based on prefix
  const ROLE_TABLES = [
    { prefix: 'SADM', model: 'superAdmin',    role: 'super_admin' },
    { prefix: 'DADM', model: 'districtAdmin', role: 'district_admin' },
    { prefix: 'VOFF', model: 'villageOfficer', role: 'village_officer' },
    { prefix: 'HOFF', model: 'hospitalOfficer', role: 'hospital_officer' },
  ]

  const match = ROLE_TABLES.find(r => t.startsWith(r.prefix))
  if (!match) {
    return res.status(401).json({ success: false, message: 'Unknown token prefix. Expected SADM-, DADM-, VOFF-, or HOFF-.' })
  }

  try {
    const bcrypt = require('bcryptjs')
    // Fetch all candidates with a non-expired token (avoid hashing every row)
    const candidates = await prisma[match.model].findMany({
      where: {
        loginTokenExpires: { gte: new Date() },
        loginTokenHash:    { not: null },
      },
      select: { id: true, loginTokenHash: true, status: true },
    })

    let found = null
    for (const c of candidates) {
      if (await bcrypt.compare(t, c.loginTokenHash)) { found = c; break }
    }

    if (!found) {
      return res.status(401).json({ success: false, message: 'Invalid or expired authorization token.' })
    }

    return res.json({ success: true, role: match.role, userId: found.id })
  } catch (err) {
    console.error('[auth/validate-token]', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
})

"""
    old_module = "module.exports = router\n"
    patch(path,
          [(old_module, VALIDATE_ROUTE + old_module, "PATCH-EMAIL-2025")],
          "backend/routes/auth.js — POST /validate-token")


# ─────────────────────────────────────────────────────────────────────────────
# 5. Frontend admin.api.js — add apiCreateSuperAdmin + apiGetSuperAdmins
# ─────────────────────────────────────────────────────────────────────────────
def fix_admin_api_client():
    path = WEB / "api" / "admin.api.js"

    old_da_block = "// ── District admins [super_admin] ───────────────────────────────────────────────"
    new_da_block = """\
// ── Super admins [super_admin, min-1/max-3 guard] ──────────────────────────────
// PATCH-EMAIL-2025
export async function apiGetSuperAdmins(params = {}) {
  const { data } = await apiClient.get('/admin/super-admins', { params })
  return data
}
export async function apiCreateSuperAdmin(payload) {
  const { data } = await apiClient.post('/admin/super-admins', payload)
  return data
}
export async function apiDeleteSuperAdmin(id) {
  const { data } = await apiClient.delete(`/admin/super-admins/${id}`)
  return data
}

// ── Token validation ────────────────────────────────────────────────────────────
export async function apiValidateToken(token) {
  const { data } = await apiClient.post('/auth/validate-token', { token })
  return data
}

// ── District admins [super_admin] ───────────────────────────────────────────────"""
    patch(path,
          [(old_da_block, new_da_block, "PATCH-EMAIL-2025")],
          "admin.api.js — super admin API + validateToken")


# ─────────────────────────────────────────────────────────────────────────────
# 6. LoginPage.jsx — wire handleToken() to real API
# ─────────────────────────────────────────────────────────────────────────────
def fix_login_page_token():
    path = WEB / "pages" / "LoginPage.jsx"

    # 6a. Import apiValidateToken
    old_import = "import { apiLogin, apiMfaVerify }   from '../api/auth.api'"
    new_import  = """\
import { apiLogin, apiMfaVerify }   from '../api/auth.api'
import { apiValidateToken }         from '../api/admin.api'  // PATCH-EMAIL-2025"""
    patch(path,
          [(old_import, new_import, "apiValidateToken")],
          "LoginPage.jsx — import apiValidateToken")

    # 6b. Add userId state variable (needed to carry it through flow)
    old_state = "  const [tempToken, setTempToken] = useState(null) // from server when MFA required"
    new_state  = """\
  const [tempToken, setTempToken] = useState(null) // from server when MFA required
  const [authUserId, setAuthUserId] = useState(null) // PATCH-EMAIL-2025: from token validation"""
    patch(path,
          [(old_state, new_state, "authUserId")],
          "LoginPage.jsx — authUserId state")

    # 6c. Replace mock handleToken with real API call
    old_handle = """\
  /** First-login token flow — UI only (backend integration in Sprint 2) */
  function handleToken() {
    if (token.length < 6) { setError('Enter the authorization token'); return }
    setError(''); setLoading(true)
    setTimeout(() => {
      setLoading(false)
      const detected = token.startsWith('SADM') ? 'super_admin' : 'district_admin'
      setRoleType(detected)
      setMode('mfa_setup')
    }, 1200)
  }"""
    new_handle = """\
  /** First-login token flow — wired to POST /api/auth/validate-token (PATCH-EMAIL-2025) */
  async function handleToken() {
    if (token.trim().length < 6) { setError('Enter the authorization token'); return }
    setError(''); setLoading(true)
    try {
      const result = await apiValidateToken(token.trim())
      setRoleType(result.role)
      setAuthUserId(result.userId)
      setMode('mfa_setup')
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid or expired authorization token.')
    } finally {
      setLoading(false)
    }
  }"""
    patch(path,
          [(old_handle, new_handle, "wired to POST /api/auth/validate-token")],
          "LoginPage.jsx — handleToken real API")

    # 6d. Update token hint text to include SADM
    old_hint = """\
                    Enter the one-time token sent to your official email. Token prefix:{' '}
                    <span className=\"font-mono\">SADM-</span> (Super Admin) or{' '}
                    <span className=\"font-mono\">DADM-</span> (District Admin)."""
    new_hint = """\
                    Enter the one-time token sent to your official email. Token prefix:{' '}
                    <span className=\"font-mono\">SADM-</span> (Super Admin),{' '}
                    <span className=\"font-mono\">DADM-</span> (District Admin),{' '}
                    <span className=\"font-mono\">VOFF-</span> (Village Officer), or{' '}
                    <span className=\"font-mono\">HOFF-</span> (Health Officer). {/* PATCH-EMAIL-2025 */}"""
    patch(path,
          [(old_hint, new_hint, "PATCH-EMAIL-2025 */}")],
          "LoginPage.jsx — token hint text extended")


# ─────────────────────────────────────────────────────────────────────────────
# 7. NewRegistrationModal.jsx — add super_admin as registerable target
# ─────────────────────────────────────────────────────────────────────────────
def fix_new_registration_modal():
    path = WEB / "modals" / "NewRegistrationModal.jsx"

    # 7a. Import apiCreateSuperAdmin
    old_modal_import = """\
import {
  apiCreateDistrictAdmin, apiCreateVillageOfficer, apiCreateHealthOfficer,
  apiGetRegions, apiGetDistricts, apiGetWards, apiGetVillages,
} from '../api/admin.api'"""
    new_modal_import = """\
import {
  apiCreateDistrictAdmin, apiCreateVillageOfficer, apiCreateHealthOfficer,
  apiCreateSuperAdmin, apiGetSuperAdmins,
  apiGetRegions, apiGetDistricts, apiGetWards, apiGetVillages,
} from '../api/admin.api'  // PATCH-EMAIL-2025"""
    patch(path,
          [(old_modal_import, new_modal_import, "apiCreateSuperAdmin")],
          "NewRegistrationModal.jsx — import super admin API")

    # 7b. Change default target for super_admin to allow super_admin creation
    old_target = "  const isSuperAdmin = role === 'super_admin'\n  const [target, setTarget] = useState(defaultTarget || (isSuperAdmin ? 'district_admin' : 'village_officer'))"
    new_target = """\
  const isSuperAdmin = role === 'super_admin'
  // PATCH-EMAIL-2025: defaultTarget can now be 'super_admin' when opened from Manage Users
  const [target, setTarget] = useState(defaultTarget || (isSuperAdmin ? 'district_admin' : 'village_officer'))
  // Super admin count guard — loaded when defaultTarget === 'super_admin'
  const [superAdminMeta, setSuperAdminMeta] = useState(null)"""
    patch(path,
          [(old_target, new_target, "PATCH-EMAIL-2025: defaultTarget can now be 'super_admin'")],
          "NewRegistrationModal.jsx — super_admin default target + meta state")

    # 7c. Load super admin meta when target is super_admin
    old_region_effect = """\
  useEffect(() => {
    if (isSuperAdmin) apiGetRegions().then(r => setRegions(r.data || [])).catch(() => {})
  }, [isSuperAdmin])"""
    new_region_effect = """\
  useEffect(() => {
    if (isSuperAdmin) apiGetRegions().then(r => setRegions(r.data || [])).catch(() => {})
  }, [isSuperAdmin])

  // PATCH-EMAIL-2025: fetch super admin count to enforce max-3 guard in the UI
  useEffect(() => {
    if (target === 'super_admin') {
      apiGetSuperAdmins().then(r => setSuperAdminMeta(r)).catch(() => {})
    }
  }, [target])"""
    patch(path,
          [(old_region_effect, new_region_effect, "PATCH-EMAIL-2025: fetch super admin count")],
          "NewRegistrationModal.jsx — load super admin meta on mount")

    # 7d. Wire super_admin case in handleSubmit
    old_submit = """\
      let res
      if (target === 'district_admin') {
        res = await apiCreateDistrictAdmin({
          fullName: form.fullName, email: form.email, nidaNumber: form.nidaNumber,
          employeeId: form.employeeId, mobile: form.mobile,
          regionId: form.regionId || undefined, districtId: form.districtId || undefined,
        })
      } else if (target === 'village_officer') {"""
    new_submit = """\
      let res
      if (target === 'super_admin') {
        // PATCH-EMAIL-2025: create a new super admin (min-1/max-3 enforced server-side)
        res = await apiCreateSuperAdmin({
          fullName: form.fullName, email: form.email, nidaNumber: form.nidaNumber,
          employeeId: form.employeeId, mobile: form.mobile,
          department: form.department || undefined,
        })
      } else if (target === 'district_admin') {
        res = await apiCreateDistrictAdmin({
          fullName: form.fullName, email: form.email, nidaNumber: form.nidaNumber,
          employeeId: form.employeeId, mobile: form.mobile,
          regionId: form.regionId || undefined, districtId: form.districtId || undefined,
        })
      } else if (target === 'village_officer') {"""
    patch(path,
          [(old_submit, new_submit, "PATCH-EMAIL-2025: create a new super admin")],
          "NewRegistrationModal.jsx — super_admin handleSubmit case")

    # 7e. Add Department field to form (needed for super_admin, optional for district_admin)
    old_form_fields = """\
    fullName: '', email: '', nidaNumber: '', employeeId: '', mobile: '',
    regionId: '', districtId: '', wardId: '', villageId: '',"""
    new_form_fields = """\
    fullName: '', email: '', nidaNumber: '', employeeId: '', mobile: '',
    department: '',
    regionId: '', districtId: '', wardId: '', villageId: '',  // PATCH-EMAIL-2025"""
    patch(path,
          [(old_form_fields, new_form_fields, "department: '',")],
          "NewRegistrationModal.jsx — department field in form state")

    # 7f. Add department UI field + super_admin guard notice before the error block
    old_error_block = """\
            {error && (
              <p className="text-red-400 text-[10px] flex items-center gap-1">
                <AlertCircle size={10} />{error}
              </p>
            )}"""
    new_error_block = """\
            {/* PATCH-EMAIL-2025: Department field (shown for super_admin and district_admin) */}
            {(target === 'super_admin' || target === 'district_admin') && (
              <div>
                <label className={lbl}>Department{target === 'super_admin' ? '' : ' (optional)'}</label>
                <input className={inp} value={form.department} onChange={e => set('department', e.target.value)}
                  placeholder={target === 'super_admin' ? 'e.g. Statistics & Data Management' : 'e.g. Civil Registration'} />
              </div>
            )}

            {/* PATCH-EMAIL-2025: max-3 guard notice for super_admin */}
            {target === 'super_admin' && superAdminMeta && !superAdminMeta.canAdd && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-400">
                The system already has the maximum of 3 Super Administrators and cannot accept more.
              </div>
            )}

            {error && (
              <p className="text-red-400 text-[10px] flex items-center gap-1">
                <AlertCircle size={10} />{error}
              </p>
            )}"""
    patch(path,
          [(old_error_block, new_error_block, "PATCH-EMAIL-2025: Department field")],
          "NewRegistrationModal.jsx — department field UI + max guard notice")

    # 7g. Disable Register button if super admin max reached
    old_btn = """\
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full py-2.5 rounded-xl font-bold text-sm bg-gradient-to-r from-[#00ff9d] to-[#00bb6e] text-[#060f1e] flex items-center justify-center gap-2 hover:opacity-90 transition-all disabled:opacity-50"
            >
              {loading ? <RefreshCw size={15} className="animate-spin" /> : 'Register'}
            </button>"""
    new_btn = """\
            <button
              onClick={handleSubmit}
              disabled={loading || (target === 'super_admin' && superAdminMeta && !superAdminMeta.canAdd)}
              className="w-full py-2.5 rounded-xl font-bold text-sm bg-gradient-to-r from-[#00ff9d] to-[#00bb6e] text-[#060f1e] flex items-center justify-center gap-2 hover:opacity-90 transition-all disabled:opacity-50"
            >
              {/* PATCH-EMAIL-2025 disabled guard */}
              {loading ? <RefreshCw size={15} className="animate-spin" /> : 'Register'}
            </button>"""
    patch(path,
          [(old_btn, new_btn, "PATCH-EMAIL-2025 disabled guard")],
          "NewRegistrationModal.jsx — Register button disabled when max reached")

    # 7h. Add Super Admin tab to the super_admin modal tab list
    old_tabs = """\
  const tabs = isSuperAdmin
    ? [{ key: 'district_admin', label: 'District Admin' }]
    : ["""
    new_tabs = """\
  // PATCH-EMAIL-2025: super_admin can now also register another super_admin
  const tabs = isSuperAdmin
    ? [
        { key: 'super_admin',    label: 'National Admin' },
        { key: 'district_admin', label: 'District Admin' },
      ]
    : ["""
    patch(path,
          [(old_tabs, new_tabs, "PATCH-EMAIL-2025: super_admin can now also register another super_admin")],
          "NewRegistrationModal.jsx — add super_admin tab")


# ─────────────────────────────────────────────────────────────────────────────
# 8. ManageUsersSection — super_admin tab: "Add National Admin" button + guard
# ─────────────────────────────────────────────────────────────────────────────
def fix_manage_users_section():
    path = WEB / "pages" / "AdminDashboard.jsx"

    # 8a. Thread onRegister prop (already exists in the switch case) +
    #     add superAdminMeta state + load it alongside the users call
    old_mgr_sig = "function ManageUsersSection({ currentUserId }) {\n  const [tab, setTab] = useState('district_admin')"
    new_mgr_sig = """\
// PATCH-EMAIL-2025: accepts onRegister so super_admin tab can open the modal
function ManageUsersSection({ currentUserId, onRegister }) {
  const [tab, setTab] = useState('district_admin')
  const [superAdminMeta, setSuperAdminMeta] = useState({ total: 0, canAdd: true, canDelete: false })"""
    patch(path,
          [(old_mgr_sig, new_mgr_sig, "PATCH-EMAIL-2025: accepts onRegister so super_admin tab")],
          "AdminDashboard.jsx ManageUsersSection — add onRegister prop + superAdminMeta")

    # 8b. Import apiGetSuperAdmins + apiDeleteSuperAdmin in admin.api usage
    old_api_import = "import * as api from '../api/admin.api'"
    new_api_import = """\
import * as api from '../api/admin.api'
import { apiGetSuperAdmins, apiDeleteSuperAdmin } from '../api/admin.api'  // PATCH-EMAIL-2025"""
    patch(path,
          [(old_api_import, new_api_import, "PATCH-EMAIL-2025")],
          "AdminDashboard.jsx — import super admin API functions")

    # 8c. Load super admin meta alongside regular users load
    old_load = """\
  const load = useCallback(() => {
    setLoading(true)
    api.apiGetUsers({ q })
      .then(r => setData(r.data || {}))
      .catch(err => console.error('[users]', err))
      .finally(() => setLoading(false))
  }, [q])"""
    new_load = """\
  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      api.apiGetUsers({ q }),
      apiGetSuperAdmins(),  // PATCH-EMAIL-2025: load count/guard flags
    ])
      .then(([usersRes, saRes]) => {
        setData(usersRes.data || {})
        setSuperAdminMeta({ total: saRes.total ?? 0, canAdd: saRes.canAdd ?? true, canDelete: saRes.canDelete ?? false })
      })
      .catch(err => console.error('[users]', err))
      .finally(() => setLoading(false))
  }, [q])"""
    patch(path,
          [(old_load, new_load, "apiGetSuperAdmins(),  // PATCH-EMAIL-2025")],
          "AdminDashboard.jsx ManageUsersSection load — include super admin meta")

    # 8d. Super admin delete: use dedicated endpoint with guard
    old_remove = """\
  async function remove(id, name) {
    if (!window.confirm(`Delete user "${name}"? This cannot be undone.`)) return
    try { await api.apiDeleteUser(tab, id); load() }
    catch (err) { alert(err.response?.data?.message || 'Delete failed') }
  }"""
    new_remove = """\
  async function remove(id, name) {
    if (!window.confirm(`Delete user "${name}"? This cannot be undone.`)) return
    try {
      // PATCH-EMAIL-2025: super_admin deletion uses the guarded endpoint
      if (tab === 'super_admin') {
        await apiDeleteSuperAdmin(id)
      } else {
        await api.apiDeleteUser(tab, id)
      }
      load()
    } catch (err) { alert(err.response?.data?.message || 'Delete failed') }
  }"""
    patch(path,
          [(old_remove, new_remove, "PATCH-EMAIL-2025: super_admin deletion uses the guarded endpoint")],
          "AdminDashboard.jsx ManageUsersSection — super_admin delete via guarded endpoint")

    # 8e. Add "Add National Admin" button in the toolbar (when on super_admin tab)
    old_search_box = "        <SearchBox value={q} onChange={setQ} placeholder=\"Search name / email…\" />"
    new_search_box = """\
        {/* PATCH-EMAIL-2025: Add National Admin button — super_admin tab only */}
        {tab === 'super_admin' && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-500">{superAdminMeta.total}/{3} admins</span>
            <button
              onClick={() => onRegister && onRegister('super_admin')}
              disabled={!superAdminMeta.canAdd}
              className="flex items-center gap-1.5 bg-[#00d4ff]/10 border border-[#00d4ff]/30 text-[#00d4ff] text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-[#00d4ff]/20 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <UserPlus size={13} /> Add National Admin
            </button>
          </div>
        )}
        <SearchBox value={q} onChange={setQ} placeholder="Search name / email…" />"""
    patch(path,
          [(old_search_box, new_search_box, "PATCH-EMAIL-2025: Add National Admin button")],
          "AdminDashboard.jsx ManageUsersSection — Add National Admin button")

    # 8f. Disable delete button for last super admin
    old_icon_btn = """\
                    <IconButton title="Delete" danger
                      onClick={() => remove(r.id, r.fullName || r.displayName)}
                    >
                      <Trash2 size={13} />
                    </IconButton>"""
    new_icon_btn = """\
                    {/* PATCH-EMAIL-2025: disable delete if last super_admin or self */}
                    <IconButton
                      title={
                        tab === 'super_admin' && !superAdminMeta.canDelete
                          ? 'Cannot delete — system must retain at least 1 Super Admin'
                          : 'Delete'
                      }
                      danger
                      onClick={() => remove(r.id, r.fullName || r.displayName)}
                      disabled={tab === 'super_admin' && (!superAdminMeta.canDelete || r.id === currentUserId)}
                    >
                      <Trash2 size={13} />
                    </IconButton>"""
    patch(path,
          [(old_icon_btn, new_icon_btn, "PATCH-EMAIL-2025: disable delete if last super_admin")],
          "AdminDashboard.jsx ManageUsersSection — disable delete on last super_admin")

    # 8g. Wire onRegister in the ManageUsersSection call in renderSection
    old_switch = "      case 'manage_users':        return <ManageUsersSection currentUserId={user?.id} />"
    new_switch  = """\
      case 'manage_users':        return <ManageUsersSection currentUserId={user?.id}
                                    onRegister={(target) => { setShowNewReg(true); setPendingRegTarget(target) }} />  {/* PATCH-EMAIL-2025 */}"""
    patch(path,
          [(old_switch, new_switch, "PATCH-EMAIL-2025 */}")],
          "AdminDashboard.jsx renderSection — thread onRegister to ManageUsersSection")

    # 8h. Add pendingRegTarget state and wire it into the modal
    old_state_decl = """\
  const [showChangePwd, setShowChangePwd] = useState(false)
  const [showNewReg,    setShowNewReg]    = useState(false)
  const [loggingOut,    setLoggingOut]    = useState(false)"""
    new_state_decl = """\
  const [showChangePwd, setShowChangePwd]       = useState(false)
  const [showNewReg,    setShowNewReg]           = useState(false)
  const [pendingRegTarget, setPendingRegTarget] = useState(undefined)  // PATCH-EMAIL-2025
  const [loggingOut,    setLoggingOut]           = useState(false)"""
    patch(path,
          [(old_state_decl, new_state_decl, "pendingRegTarget, setPendingRegTarget")],
          "AdminDashboard.jsx — pendingRegTarget state")

    # 8i. Pass pendingRegTarget as defaultTarget to NewRegistrationModal + clear on close
    old_modal = """\
      {showNewReg && (
        <NewRegistrationModal
          role={role}
          defaultTarget={activeNav === 'health_officers' ? 'hospital_officer' : activeNav === 'village_officers' ? 'village_officer' : undefined}
          onClose={() => setShowNewReg(false)}
        />
      )}"""
    new_modal = """\
      {showNewReg && (
        <NewRegistrationModal
          role={role}
          defaultTarget={
            pendingRegTarget ||
            (activeNav === 'health_officers' ? 'hospital_officer'
              : activeNav === 'village_officers' ? 'village_officer'
              : undefined)
          }
          onClose={() => { setShowNewReg(false); setPendingRegTarget(undefined) }}  // PATCH-EMAIL-2025
        />
      )}"""
    patch(path,
          [(old_modal, new_modal, "PATCH-EMAIL-2025")],
          "AdminDashboard.jsx — pass pendingRegTarget to NewRegistrationModal")


# ─────────────────────────────────────────────────────────────────────────────
# 9. IconButton — add disabled prop support (needed for delete guard)
# ─────────────────────────────────────────────────────────────────────────────
def fix_icon_button_disabled():
    path = WEB / "pages" / "AdminDashboard.jsx"

    old_icon = """\
function IconButton({ onClick, title, danger, children }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded-lg border transition-colors ${
        danger
          ? 'border-red-500/30 text-red-400 hover:bg-red-500/10'
          : 'border-[#1a3060] text-gray-400 hover:text-[#00d4ff] hover:border-[#00d4ff]/40'
      }`}
    >
      {children}
    </button>
  )
}"""
    new_icon = """\
// PATCH-EMAIL-2025: added disabled prop for min-admin guard
function IconButton({ onClick, title, danger, disabled, children }) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      title={title}
      disabled={disabled}
      className={`p-1.5 rounded-lg border transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
        danger
          ? 'border-red-500/30 text-red-400 hover:bg-red-500/10'
          : 'border-[#1a3060] text-gray-400 hover:text-[#00d4ff] hover:border-[#00d4ff]/40'
      }`}
    >
      {children}
    </button>
  )
}"""
    patch(path,
          [(old_icon, new_icon, "PATCH-EMAIL-2025: added disabled prop for min-admin guard")],
          "AdminDashboard.jsx IconButton — add disabled prop")


# ─────────────────────────────────────────────────────────────────────────────
# 10. Dark/light mode toggle in AdminDashboard
# ─────────────────────────────────────────────────────────────────────────────
def fix_dark_mode_toggle():
    path = WEB / "pages" / "AdminDashboard.jsx"

    # 10a. Import Sun/Moon icons
    old_icons = """\
  Menu, X, LogOut, Shield, Users, RefreshCw, CheckCircle2,
  AlertTriangle, Database, Server, Globe, UserCheck, UserX,
  Trash2, UserPlus, ChevronLeft, ChevronRight, Settings,
  ShieldAlert, Stethoscope,
  Map as MapIcon, Search, Cpu, LayoutDashboard, Landmark, Heart,
  FileText,"""
    new_icons = """\
  Menu, X, LogOut, Shield, Users, RefreshCw, CheckCircle2,
  AlertTriangle, Database, Server, Globe, UserCheck, UserX,
  Trash2, UserPlus, ChevronLeft, ChevronRight, Settings,
  ShieldAlert, Stethoscope,
  Map as MapIcon, Search, Cpu, LayoutDashboard, Landmark, Heart,
  FileText, Sun, Moon,  // PATCH-EMAIL-2025: light/dark mode toggle icons"""
    patch(path,
          [(old_icons, new_icons, "Sun, Moon,  // PATCH-EMAIL-2025")],
          "AdminDashboard.jsx — import Sun/Moon icons")

    # 10b. Add useTheme hook just above the component body
    old_nav_const = "const NAV = ["
    new_nav_const = """\
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
}

const NAV = ["""
    patch(path,
          [(old_nav_const, new_nav_const, "PATCH-EMAIL-2025\nfunction useTheme")],
          "AdminDashboard.jsx — useTheme hook")

    # 10c. Add React import at top (useTheme uses React.useState / React.useEffect)
    old_react_import = "import { useEffect, useState, useCallback } from 'react'"
    new_react_import = "import React, { useEffect, useState, useCallback } from 'react'  // PATCH-EMAIL-2025: React needed by useTheme"
    patch(path,
          [(old_react_import, new_react_import, "React, { useEffect")],
          "AdminDashboard.jsx — add React default import")

    # 10d. Wire useTheme in the main component and render the toggle button
    old_role_label = "  const roleLabel = role === 'super_admin' ? 'Super Administrator' : 'District Administrator'"
    new_role_label = """\
  const roleLabel = role === 'super_admin' ? 'Super Administrator' : 'District Administrator'
  const [theme, setTheme] = useTheme()  // PATCH-EMAIL-2025"""
    patch(path,
          [(old_role_label, new_role_label, "const [theme, setTheme] = useTheme()")],
          "AdminDashboard.jsx — wire useTheme in component")

    # 10e. Add toggle button in the topbar (inside the main content header row)
    old_header_row = """\
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-white font-bold text-lg">{SECTION_TITLE[activeNav]}</h1>
              <p className="text-gray-500 text-xs">
                {user?.fullName || user?.email} · {roleLabel}
              </p>
            </div>
          </div>"""
    new_header_row = """\
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-white font-bold text-lg">{SECTION_TITLE[activeNav]}</h1>
              <p className="text-gray-500 text-xs">
                {user?.fullName || user?.email} · {roleLabel}
              </p>
            </div>
            {/* PATCH-EMAIL-2025: light/dark mode toggle — scoped to this device/session */}
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="p-2 rounded-lg border border-[#1a3060] text-gray-400 hover:text-[#00d4ff] hover:border-[#00d4ff]/40 transition-colors"
            >
              {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            </button>
          </div>"""
    patch(path,
          [(old_header_row, new_header_row, "PATCH-EMAIL-2025: light/dark mode toggle")],
          "AdminDashboard.jsx — dark/light mode toggle button in topbar")

    # 10f. Inject light-mode CSS into the web index.html
    html_path = WEB.parent / "index.html"
    if html_path.exists():
        html = read(html_path)
        if "tzcrvs-light" not in html:
            old_head = "</head>"
            new_head = """\
  <!-- PATCH-EMAIL-2025: light mode overrides — class toggled on <html> by useTheme() -->
  <style>
    .tzcrvs-light { filter: invert(1) hue-rotate(180deg); }
    .tzcrvs-light img,
    .tzcrvs-light video,
    .tzcrvs-light [data-no-invert] { filter: invert(1) hue-rotate(180deg); }
  </style>
</head>"""
            if old_head in html:
                html = html.replace(old_head, new_head, 1)
                write(html_path, html)
                CHANGED.append("web/index.html — light mode CSS class")
            else:
                FAILED.append("web/index.html: </head> not found for CSS injection")
        else:
            SKIPPED.append("web/index.html light mode CSS (already applied)")


# ─────────────────────────────────────────────────────────────────────────────

def main():
    if not (ROOT / "code" / "web").exists() or not (ROOT / "code" / "backend").exists():
        print(f"ERROR: run from ADLCS project root (expected code/web and code/backend under {ROOT})")
        sys.exit(1)

    fix_create_email_lib()
    fix_backend_admin_routes()
    fix_auth_validate_token_route()
    fix_admin_api_client()
    fix_login_page_token()
    fix_new_registration_modal()
    fix_manage_users_section()
    fix_icon_button_disabled()
    fix_dark_mode_toggle()

    print("\n" + "=" * 70)
    print(f"APPLIED  ({len(CHANGED)}):")
    for c in CHANGED: print(f"  ✓ {c}")
    print(f"\nSKIPPED — already applied ({len(SKIPPED)}):")
    for s in SKIPPED: print(f"  · {s}")
    if FAILED:
        print(f"\nFAILED ({len(FAILED)}):")
        for f in FAILED: print(f"  ✗ {f}")
        print("=" * 70); sys.exit(1)
    print("=" * 70)
    print("\nPost-install reminder:")
    print("  • Ensure RESEND_API_KEY and EMAIL_FROM are set in code/backend/.env")
    print("    (EMAIL_FROM must be a verified Resend sender domain, e.g. nbs@yourdomain.com)")
    print("  • Re-deploy the backend — the new /api/admin/super-admins routes and")
    print("    /api/auth/validate-token require the updated bundle to be live on Render.")


if __name__ == "__main__":
    main()
