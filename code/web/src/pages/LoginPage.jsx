/**
 * LoginPage.jsx — ADLCS Web Login
 *
 * Two-step login flow:
 *   Step 1 — email + password  → if MFA disabled: issue tokens immediately
 *                              → if MFA enabled:  return tempToken for step 2
 *   Step 2 — 6-digit TOTP code → verify and issue tokens
 *
 * On success, redirects to the role-specific dashboard.
 */

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { apiLogin, apiMfaVerify } from '../api/auth.api'

// Where each role lands after login
const ROLE_ROUTES = {
  super_admin:      '/super-admin',
  district_admin:   '/district-admin',
  village_officer:  '/village-officer',
  hospital_officer: '/hospital-officer',
  public_user:      '/public',
}

// ── Sub-components ────────────────────────────────────────────────────────────

/** Tanzania flag stripe — decorative header for the login card */
function FlagStripe() {
  return (
    <div className="flex h-2 rounded-t-2xl overflow-hidden">
      <div className="flex-1 bg-[#1eb53a]" />   {/* green */}
      <div className="w-6 bg-[#fcd116]" />        {/* yellow */}
      <div className="w-6 bg-black" />             {/* black */}
      <div className="w-6 bg-[#fcd116]" />         {/* yellow */}
      <div className="flex-1 bg-[#00a3dd]" />      {/* blue */}
    </div>
  )
}

/** Animated loading spinner */
function Spinner() {
  return (
    <svg
      className="animate-spin h-5 w-5 text-[#050d1a]"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-label="Loading"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
  )
}

/** Eye icon for show/hide password */
function EyeIcon({ open }) {
  return open ? (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7
           -1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  ) : (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.477 0-8.268-2.943-9.542-7
           a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243
           M9.878 9.878l4.242 4.242M9.88 9.88L6.59 6.59m7.532 7.532l3.29 3.29
           M3 3l18 18" />
    </svg>
  )
}

/** Error banner */
function ErrorBanner({ message }) {
  if (!message) return null
  return (
    <div
      role="alert"
      className="flex items-start gap-2 bg-red-900/30 border border-red-500/40
                 text-red-300 text-sm rounded-lg px-4 py-3"
    >
      <svg className="w-4 h-4 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zm-1-9v4a1 1 0 102 0V9a1 1 0
             10-2 0zm0-4a1 1 0 112 0 1 1 0 01-2 0z" clipRule="evenodd" />
      </svg>
      {message}
    </div>
  )
}

/** Step indicator dots */
function StepIndicator({ current }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-6">
      {[1, 2].map((s) => (
        <div key={s} className="flex items-center gap-2">
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold
              transition-all duration-300
              ${current === s
                ? 'bg-[#00d4ff] text-[#050d1a]'
                : current > s
                  ? 'bg-[#00d4ff]/30 text-[#00d4ff]'
                  : 'bg-[#1a3060] text-gray-500'
              }`}
          >
            {current > s ? '✓' : s}
          </div>
          {s < 2 && (
            <div className={`w-8 h-0.5 ${current > 1 ? 'bg-[#00d4ff]/50' : 'bg-[#1a3060]'}`} />
          )}
        </div>
      ))}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function LoginPage() {
  const navigate       = useNavigate()
  const { setAuth, isAuthenticated, role } = useAuthStore()

  // If already logged in, redirect immediately
  useEffect(() => {
    if (isAuthenticated && role) {
      navigate(ROLE_ROUTES[role] || '/login', { replace: true })
    }
  }, [isAuthenticated, role, navigate])

  // ── Form state ──────────────────────────────────────────────────────────────
  const [step,         setStep]         = useState('credentials') // 'credentials' | 'mfa'
  const [email,        setEmail]        = useState('')
  const [password,     setPassword]     = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [mfaCode,      setMfaCode]      = useState('')
  const [tempToken,    setTempToken]    = useState('')   // holds MFA step-up token
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState('')

  // ── Step 1: email + password ────────────────────────────────────────────────
  async function handleCredentials(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const result = await apiLogin(email, password)

      if (result.mfaRequired) {
        // Password ok — user has MFA enabled. Move to step 2.
        setTempToken(result.tempToken)
        setStep('mfa')
      } else {
        // No MFA — full session issued
        setAuth({
          user:         result.profile,
          role:         result.profile.role,
          accessToken:  result.accessToken,
          refreshToken: result.refreshToken,
        })
        navigate(ROLE_ROUTES[result.profile.role] || '/', { replace: true })
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed. Please check your credentials.')
    } finally {
      setLoading(false)
    }
  }

  // ── Step 2: TOTP verification ───────────────────────────────────────────────
  async function handleMfa(e) {
    e.preventDefault()
    setError('')

    if (mfaCode.length !== 6) {
      setError('Please enter all 6 digits of your MFA code.')
      return
    }

    setLoading(true)
    try {
      const result = await apiMfaVerify(tempToken, mfaCode)
      setAuth({
        user:         result.profile,
        role:         result.profile.role,
        accessToken:  result.accessToken,
        refreshToken: result.refreshToken,
      })
      navigate(ROLE_ROUTES[result.profile.role] || '/', { replace: true })
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid MFA code. Please try again.')
      setMfaCode('')
    } finally {
      setLoading(false)
    }
  }

  // Allow only digits in MFA input, max 6 chars
  function handleMfaInput(e) {
    const val = e.target.value.replace(/\D/g, '').slice(0, 6)
    setMfaCode(val)
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#050d1a] flex flex-col items-center justify-center p-4">

      {/* Background grid pattern */}
      <div
        className="fixed inset-0 opacity-5 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(#00d4ff 1px, transparent 1px), linear-gradient(90deg, #00d4ff 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      {/* NBS header above card */}
      <div className="text-center mb-8 relative z-10">
        {/* Coat of arms placeholder */}
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full
                        bg-[#0a1628] border-2 border-[#00d4ff]/30 mb-4">
          <span className="text-2xl" role="img" aria-label="Tanzania coat of arms">🦅</span>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-wide">
          UNITED REPUBLIC OF TANZANIA
        </h1>
        <p className="text-[#00d4ff] font-semibold text-sm tracking-widest uppercase mt-1">
          National Bureau of Statistics
        </p>
      </div>

      {/* Login card */}
      <div className="w-full max-w-md relative z-10">
        <div className="bg-[#0a1628] rounded-2xl shadow-2xl shadow-black/50 overflow-hidden
                        border border-[#1a3060]">

          {/* Tanzania flag stripe at top of card */}
          <FlagStripe />

          <div className="px-8 pt-8 pb-10">

            {/* Card header */}
            <div className="text-center mb-6">
              <h2 className="text-xl font-bold text-white">
                {step === 'credentials' ? 'System Login' : 'Two-Factor Authentication'}
              </h2>
              <p className="text-gray-400 text-sm mt-1">
                {step === 'credentials'
                  ? 'Automated Digital Live Census System'
                  : 'Enter the code from your authenticator app'}
              </p>
            </div>

            {/* Step indicator */}
            <StepIndicator current={step === 'credentials' ? 1 : 2} />

            {/* Error banner */}
            <div className="mb-4">
              <ErrorBanner message={error} />
            </div>

            {/* ── Step 1: Credentials ───────────────────────────────────── */}
            {step === 'credentials' && (
              <form onSubmit={handleCredentials} noValidate>

                {/* Email */}
                <div className="mb-4">
                  <label
                    htmlFor="email"
                    className="block text-gray-300 text-sm font-medium mb-2"
                  >
                    Email Address
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your.name@nbs.go.tz"
                    required
                    autoComplete="email"
                    className="w-full bg-[#0f1e38] border border-[#1a3060] text-white
                               rounded-lg px-4 py-3 text-sm outline-none
                               placeholder-gray-600
                               focus:border-[#00d4ff] focus:ring-1 focus:ring-[#00d4ff]/30
                               transition-colors"
                  />
                </div>

                {/* Password */}
                <div className="mb-6">
                  <label
                    htmlFor="password"
                    className="block text-gray-300 text-sm font-medium mb-2"
                  >
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      required
                      autoComplete="current-password"
                      className="w-full bg-[#0f1e38] border border-[#1a3060] text-white
                                 rounded-lg px-4 py-3 pr-12 text-sm outline-none
                                 placeholder-gray-600
                                 focus:border-[#00d4ff] focus:ring-1 focus:ring-[#00d4ff]/30
                                 transition-colors"
                    />
                    {/* Show/hide password toggle */}
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2
                                 text-gray-500 hover:text-[#00d4ff] transition-colors"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      <EyeIcon open={showPassword} />
                    </button>
                  </div>
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={loading || !email || !password}
                  className="w-full bg-[#00d4ff] text-[#050d1a] font-bold rounded-lg
                             py-3 text-sm tracking-wide uppercase
                             hover:bg-[#00b8d9] active:scale-[0.98]
                             disabled:opacity-50 disabled:cursor-not-allowed
                             transition-all flex items-center justify-center gap-2"
                >
                  {loading ? <><Spinner /> Verifying...</> : 'Login'}
                </button>
              </form>
            )}

            {/* ── Step 2: MFA ───────────────────────────────────────────── */}
            {step === 'mfa' && (
              <form onSubmit={handleMfa} noValidate>

                {/* Info box */}
                <div className="bg-[#00d4ff]/5 border border-[#00d4ff]/20 rounded-lg
                                px-4 py-3 mb-6 text-sm text-gray-300">
                  Open <span className="text-[#00d4ff] font-medium">Google Authenticator</span> or
                  any TOTP app and enter the current 6-digit code for this account.
                </div>

                {/* 6-digit input */}
                <div className="mb-6">
                  <label
                    htmlFor="mfaCode"
                    className="block text-gray-300 text-sm font-medium mb-2"
                  >
                    Authentication Code
                  </label>
                  <input
                    id="mfaCode"
                    type="text"
                    inputMode="numeric"
                    value={mfaCode}
                    onChange={handleMfaInput}
                    placeholder="000000"
                    maxLength={6}
                    autoComplete="one-time-code"
                    autoFocus
                    className="w-full bg-[#0f1e38] border border-[#1a3060] text-white
                               rounded-lg px-4 py-3 text-center text-2xl tracking-[0.5em]
                               font-mono outline-none placeholder-gray-700
                               focus:border-[#00d4ff] focus:ring-1 focus:ring-[#00d4ff]/30
                               transition-colors"
                  />
                  <p className="text-gray-600 text-xs mt-2 text-center">
                    Code refreshes every 30 seconds
                  </p>
                </div>

                {/* Verify button */}
                <button
                  type="submit"
                  disabled={loading || mfaCode.length !== 6}
                  className="w-full bg-[#00d4ff] text-[#050d1a] font-bold rounded-lg
                             py-3 text-sm tracking-wide uppercase
                             hover:bg-[#00b8d9] active:scale-[0.98]
                             disabled:opacity-50 disabled:cursor-not-allowed
                             transition-all flex items-center justify-center gap-2 mb-3"
                >
                  {loading ? <><Spinner /> Verifying...</> : 'Verify Code'}
                </button>

                {/* Back link */}
                <button
                  type="button"
                  onClick={() => { setStep('credentials'); setError(''); setMfaCode('') }}
                  className="w-full text-gray-500 hover:text-gray-300 text-sm
                             py-2 transition-colors"
                >
                  ← Back to login
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-gray-700 text-xs mt-6">
          © {new Date().getFullYear()} National Bureau of Statistics — Tanzania
          <br />
          Automated Digital Live Census System (ADLCS)
          <br />
          <span className="text-gray-800">Authorised personnel only</span>
        </p>
      </div>
    </div>
  )
}
