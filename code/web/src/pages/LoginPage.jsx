/**
 * LoginPage.jsx — TzCRVS Secure Login
 *
 * PATCH-NOTOKEN-2026: the "Authorization Token" / first-login onboarding
 * flow (token → MFA setup choice → QR → profile-completion form) has been
 * removed. It was never wired to a real backend action for the MFA/profile
 * steps, and it's no longer needed at all: accounts created by an admin are
 * now active immediately with a real default password (see admin.js /
 * NewRegistrationModal.jsx), so every user — brand new or returning — just
 * logs in here with email + password like normal, then real TOTP MFA
 * verification if their account has it enabled.
 *
 * Integration: real API calls via apiLogin / apiMfaVerify
 *              zustand auth store (setAuth)
 *              react-router-dom navigation by role
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Eye, EyeOff, Lock, Mail, Shield, ChevronRight, RefreshCw,
  MapPin, Smartphone, AlertCircle,
} from 'lucide-react'

import { useAuthStore }           from '../store/authStore'
import { apiLogin, apiMfaVerify } from '../api/auth.api'

// ── Role → route mapping ───────────────────────────────────────────────────────
const ROLE_ROUTE = {
  super_admin:      '/super-admin',
  district_admin:   '/district-admin',
  village_officer:  '/village-officer',
  hospital_officer: '/hospital-officer',
  public_user:      '/public',
}

export default function LoginPage({ onLogin, _adminType = null }) {
if (_adminType) {
  // Future implementation goes here
}
  const navigate     = useNavigate()
  const { setAuth }  = useAuthStore()

  // ── UI mode state ────────────────────────────────────────────────────────────
  const [mode,      setMode]      = useState('login') // 'login' | 'mfa_verify'

  // ── Form field state ─────────────────────────────────────────────────────────
  const [email,     setEmail]     = useState('')
  const [password,  setPassword]  = useState('')
  const [showPass,  setShowPass]  = useState(false)
  const [mfaCode,   setMfaCode]   = useState('')
  const [tempToken, setTempToken] = useState(null) // from server when MFA required

  // ── Shared feedback state ─────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  // ── Route helper — navigate by role returned from API ────────────────────────
  function navigateByRole(role) {
    const route = ROLE_ROUTE[role] || '/login'
    navigate(route, { replace: true })
    onLogin?.()
  }

  // ── Handlers ─────────────────────────────────────────────────────────────────

  /** Step 1: email + password → real API */
  async function handleLogin() {
    if (!email.includes('@'))  { setError('Enter a valid email'); return }
    if (password.length < 4)   { setError('Enter your password'); return }
    setError(''); setLoading(true)
    try {
      const result = await apiLogin(email, password)

      if (result.mfaRequired) {
        // MFA is enabled on this account — go to TOTP verification screen
        setTempToken(result.tempToken)
        setMode('mfa_verify')
      } else {
        setAuth({
          user:         result.profile,
          role:         result.profile.role,
          accessToken:  result.accessToken,
          refreshToken: result.refreshToken,
        })
        navigateByRole(result.profile.role)
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Invalid email or password'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  /** Step 2 (MFA path): TOTP code → real API */
  async function handleMfaVerify() {
    if (mfaCode.length < 6) { setError('Enter the 6-digit TOTP code'); return }
    setError(''); setLoading(true)
    try {
      const result = await apiMfaVerify(tempToken, mfaCode)
      setAuth({
        user:         result.profile,
        role:         result.profile.role,
        accessToken:  result.accessToken,
        refreshToken: result.refreshToken,
      })
      navigateByRole(result.profile.role)
    } catch (err) {
      const msg = err.response?.data?.message || 'Invalid or expired MFA code'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  // ── Shared field styles (exactly as designed) ─────────────────────────────────
  const inp = 'w-full bg-[#060f1e] border border-[#1e3a5f] rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-700 outline-none focus:border-[#00d4ff]/50 transition-colors'
  const lbl = 'text-[10px] text-gray-400 uppercase tracking-widest mb-1.5 block'

  const modeTitle = {
    login:      'Secure Login',
    mfa_verify: 'MFA Verification',
  }
  const modeSub = {
    login:      'Enter credentials to access your dashboard',
    mfa_verify: 'Enter the 6-digit code from your authenticator app',
  }

  return (
    <div className="min-h-screen flex" style={{ fontFamily: "'Inter',sans-serif" }}>

      {/* LEFT: Branding */}
      <div className="w-1/2 relative flex-col items-center justify-between py-10 overflow-hidden hidden md:flex">
        <div className="absolute inset-0 z-0">
          <img src="/assets/flag.jpg" alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/55" />
        </div>
        <div className="relative z-10 flex flex-col items-center justify-center flex-1 text-white text-center px-10">
          <p className="text-[10px] font-bold text-yellow-300 tracking-[0.22em] uppercase mb-5">
            The United Republic Government of Tanzania
          </p>
          <div className="w-36 h-36 rounded-full border-4 border-white/40 bg-white/10 backdrop-blur-sm flex items-center justify-center mb-5 shadow-2xl">
            <img src="/assets/court_of_arm.png" alt="CoA" className="w-28 h-28 object-contain drop-shadow-xl" />
          </div>
          <div className="w-20 h-0.5 bg-yellow-400 mx-auto mb-4" />
          <h1 className="text-2xl font-extrabold tracking-wide drop-shadow mb-8">TZCRVS</h1>
          <div className="w-20 h-20 rounded-2xl border-2 border-white/30 bg-transparent flex items-center justify-center mb-6">
            <img src="/assets/longo_nbs.png" alt="NBS" className="w-14 h-14 object-contain drop-shadow-xl" />
          </div>
          <p className="text-sm italic text-yellow-200/80">&ldquo;Statistics for Development&rdquo;</p>
        </div>
        <p className="relative z-10 text-[10px] text-white/30">
          © 2026 TzCRVS · All rights reserved
        </p>
      </div>

      {/* RIGHT: Auth panel */}
      <div className="flex-1 md:w-1/2 flex items-center justify-center bg-[#060f1e] overflow-y-auto py-8">
        <div className="w-full max-w-sm px-6">

          <div className="bg-[#0d1f38] border border-[#1e3a5f] rounded-2xl shadow-2xl overflow-hidden">

            {/* Header */}
            <div className="text-center px-8 pt-8 pb-5">
              <div className="w-12 h-12 rounded-xl bg-[#00d4ff]/10 border border-[#00d4ff]/30 flex items-center justify-center mx-auto mb-4">
                {mode === 'mfa_verify'
                  ? <Smartphone size={22} className="text-[#00d4ff]" />
                  : <Shield size={22} className="text-[#00d4ff]" />}
              </div>
              <h2 className="text-white font-bold text-base">{modeTitle[mode]}</h2>
              <p className="text-gray-500 text-xs mt-1">{modeSub[mode]}</p>
            </div>

            <div className="px-8 pb-8 space-y-4">

              {/* ── LOGIN ─────────────────────────────────────────────── */}
              {mode === 'login' && (<>
                <div>
                  <label className={lbl}>Email Address</label>
                  <div className="relative">
                    <Mail size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
                    <input
                      type="email"
                      value={email}
                      placeholder="official@nbs.go.tz"
                      onChange={e => { setEmail(e.target.value); setError('') }}
                      className={inp.replace('px-4', 'pl-9 pr-4')}
                    />
                  </div>
                </div>
                <div>
                  <label className={lbl}>Password</label>
                  <div className="relative">
                    <Lock size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
                    <input
                      type={showPass ? 'text' : 'password'}
                      value={password}
                      placeholder="••••••••"
                      onChange={e => { setPassword(e.target.value); setError('') }}
                      className={inp.replace('px-4', 'pl-9 pr-10')}
                    />
                    <button
                      onClick={() => setShowPass(!showPass)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-300"
                    >
                      {showPass ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                  </div>
                </div>
                {error && (
                  <p className="text-red-400 text-[10px] flex items-center gap-1">
                    <AlertCircle size={10} />{error}
                  </p>
                )}
                <button
                  onClick={handleLogin}
                  className="w-full py-3 rounded-xl font-bold text-sm bg-gradient-to-r from-[#00d4ff] to-[#0088bb] text-[#060f1e] flex items-center justify-center gap-2 hover:opacity-90 transition-all"
                >
                  {loading
                    ? <RefreshCw size={15} className="animate-spin" />
                    : <><span>Sign In</span><ChevronRight size={15} /></>}
                </button>
                <p className="text-center text-[10px] text-gray-600">
                  New accounts are set up by your administrator — you'll be given a default password to sign in with.
                </p>
              </>)}

              {/* ── MFA VERIFY (returning users with MFA enabled) ────── */}
              {mode === 'mfa_verify' && (<>
                <div className="p-3 rounded-lg border border-[#00d4ff]/20 bg-[#00d4ff]/5">
                  <p className="text-[#00d4ff] text-xs">
                    Open Google Authenticator and enter the 6-digit TOTP code for NBS-TzCRVS.
                  </p>
                </div>
                <div>
                  <label className={lbl}>6-Digit TOTP Code</label>
                  <input
                    type="text"
                    value={mfaCode}
                    placeholder="000 000"
                    maxLength={6}
                    onChange={e => { setMfaCode(e.target.value.replace(/\D/g, '')); setError('') }}
                    className={`${inp} tracking-[0.6em] text-center text-lg font-mono`}
                  />
                </div>
                {error && (
                  <p className="text-red-400 text-[10px] flex items-center gap-1">
                    <AlertCircle size={10} />{error}
                  </p>
                )}
                <button
                  onClick={handleMfaVerify}
                  className="w-full py-3 rounded-xl font-bold text-sm bg-gradient-to-r from-[#00d4ff] to-[#0088bb] text-[#060f1e] flex items-center justify-center gap-2 hover:opacity-90 transition-all"
                >
                  {loading
                    ? <RefreshCw size={15} className="animate-spin" />
                    : <><span>Verify &amp; Login</span><ChevronRight size={15} /></>}
                </button>
                <button
                  onClick={() => { setMode('login'); setError('') }}
                  className="w-full text-center text-[11px] text-gray-500 hover:text-white"
                >
                  ← Back
                </button>
              </>)}

            </div>
          </div>

          <div className="text-center mt-5 space-y-1">
            <div className="flex items-center justify-center gap-1.5 text-gray-600">
              <MapPin size={11} />
              <span className="text-[10px]">NBS Head Office · Dodoma, Tanzania</span>
            </div>
            <p className="text-[9px] text-gray-700">Unauthorized access is prohibited and monitored</p>
          </div>
        </div>
      </div>
    </div>
  )
}
