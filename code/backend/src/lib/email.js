// PATCH-WELCOME-EMAIL-2026: this replaces the old one-time-token email.
// Accounts are created active immediately with a real default password (see
// admin.js) — this email is a courtesy notice only. Nothing in the app
// blocks on it being sent or read; if it fails, account creation still
// succeeds (callers fire-and-forget this with a .catch).
const RESEND_API_KEY = process.env.RESEND_API_KEY
const FROM_ADDRESS    = process.env.EMAIL_FROM || 'TzCRVS <no-reply@tzcrvs.go.tz>'

const ROLE_LABELS = {
  super_admin:      'National Administrator',
  district_admin:   'District Administrator',
  village_officer:  'Village Officer',
  hospital_officer: 'Hospital Officer',
}

/**
 * sendWelcomeEmail — notify a newly registered user of their role and
 * default password. Fire-and-forget; callers should .catch() this.
 */
async function sendWelcomeEmail({ to, fullName, role, defaultPassword }) {
  if (!RESEND_API_KEY) {
    console.warn('[email] RESEND_API_KEY not set — skipping welcome email to', to)
    return
  }

  const roleLabel = ROLE_LABELS[role] || role

  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color:#0a1628;">Welcome to TzCRVS</h2>
      <p>Dear ${fullName},</p>
      <p>
        An account has been created for you at the National Bureau of Statistics
        Civil Registration &amp; Vital Statistics system, with the role of
        <strong>${roleLabel}</strong>.
      </p>
      <p>You can sign in right away with:</p>
      <ul>
        <li>Email: <strong>${to}</strong></li>
        <li>Default password: <strong>${defaultPassword}</strong></li>
      </ul>
      <p style="color:#b91c1c;">
        For security, please change this default password within <strong>3 days</strong>
        of your first login.
      </p>
      <p>If you were not expecting this account, please contact your administrator.</p>
    </div>
  `

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from:    FROM_ADDRESS,
      to:      [to],
      subject: `TzCRVS account created — ${roleLabel}`,
      html,
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Resend API error ${res.status}: ${body}`)
  }
}

/**
 * sendTestEmail — minimal diagnostic send, used by POST /admin/test-email
 * to verify the Resend integration in isolation (no fake account/password
 * content, so it can't be mistaken for a real notice if forwarded).
 * Throws on failure — callers should catch and report the message.
 */
async function sendTestEmail(to) {
  if (!RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not set on this server')
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from:    FROM_ADDRESS,
      to:      [to],
      subject: 'TzCRVS — Resend test email',
      html:    '<p>This is a test email from TzCRVS to confirm the Resend integration is working.</p>'
        + `<p style="color:#888;font-size:12px;">Sent ${new Date().toISOString()}</p>`,
    }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Resend API error ${res.status}: ${body}`)
  }
  return true
}

module.exports = { sendWelcomeEmail, sendTestEmail }
