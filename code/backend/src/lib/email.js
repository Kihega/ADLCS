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
