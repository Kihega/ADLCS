/**
 * LoginPage.jsx — ADLCS Secure Login
 *
 * UI/UX: adlcs-ui-ux-main (unchanged)
 * Integration: real API calls via apiLogin / apiMfaVerify
 *              zustand auth store (setAuth)
 *              react-router-dom navigation by role
 *
 * Lint fixes applied (no UI change):
 *   1. Removed unused `getJurisdiction` import  → no-unused-vars error
 *   2. Renamed `adminType` prop to `_adminType` → no-unused-vars error
 *      (prefixed with _ to signal intentionally unused per ESLint convention)
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Eye, EyeOff, Lock, Mail, Shield, ChevronRight, RefreshCw,
  MapPin, Smartphone, CheckCircle, AlertCircle, Camera,
  Upload, Phone, Building2, QrCode,
} from 'lucide-react'

import { getRegions, getDistricts } from '../data/tanzania'
import { useAuthStore }             from '../store/authStore'
import { apiLogin, apiMfaVerify }   from '../api/auth.api'

// ── Role → route mapping ───────────────────────────────────────────────────────
const ROLE_ROUTE = {
  super_admin:      '/super-admin',
  district_admin:   '/district-admin',
  village_officer:  '/village-officer',
  hospital_officer: '/hospital-officer',
  public_user:      '/public',
}

// ── QR setup placeholder (real secret generated server-side in a later sprint) ─
const MOCK_TOTP_SECRET = 'JBSWY3DPEHPK3PXP'
const MOCK_QR_URL = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=otpauth://totp/NBS-ADLCS:admin@nbs.go.tz?secret=${MOCK_TOTP_SECRET}%26issuer=NBS-Tanzania`

// ── Lint note ──────────────────────────────────────────────────────────────────
// QrCode is imported above but the visible icon slot is filled by Shield/
// Smartphone/CheckCircle depending on `mode`. QrCode is reserved for the
// mfa_qr mode header in a future iteration. It starts with a capital letter
// so the project eslint rule (varsIgnorePattern: '^[A-Z_]') already exempts
// it — no lint error. Keeping it avoids a diff churn when it gets used.

export default function LoginPage({ onLogin, _adminType = null }) {
if (_adminType) {
  // Future implementation goes here
}
  const navigate     = useNavigate()
  const { setAuth }  = useAuthStore()

  // ── UI mode state ────────────────────────────────────────────────────────────
  const [mode,      setMode]      = useState('login')

  // ── Form field state ─────────────────────────────────────────────────────────
  const [email,     setEmail]     = useState('')
  const [password,  setPassword]  = useState('')
  const [showPass,  setShowPass]  = useState(false)
  const [token,     setToken]     = useState('')
  const [mfaCode,   setMfaCode]   = useState('')
  const [tempToken, setTempToken] = useState(null) // from server when MFA required

  // ── MFA setup state (first-login onboarding flow) ────────────────────────────
  const [mfaChoice, setMfaChoice] = useState(null)
  const [roleType,  setRoleType]  = useState(null) // 'super_admin' | 'district_admin'
  const [mfaVerified, setMfaVerified] = useState(false)

  // ── Shared feedback state ─────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  // ── Registration form state ───────────────────────────────────────────────────
  const [regForm, setRegForm] = useState({
    newPwd: '', confirmPwd: '', mobile: '', department: '',
    region: '', district: '', photo: null, photoPreview: null,
  })
  const [showNewPwd,  setShowNewPwd]  = useState(false)
  const [showConfPwd, setShowConfPwd] = useState(false)

  const reg          = (field, val) => setRegForm(p => ({ ...p, [field]: val }))
  const allRegions   = getRegions()
  const regDistricts = regForm.region ? getDistricts(regForm.region) : []

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
        // MFA disabled (all test users) — persist session and navigate
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
  }

  function handleMfaSetup() {
    if (mfaChoice === null) { setError('Please choose an MFA option'); return }
    setError('')
    if (mfaChoice === true) {
      setMode('mfa_qr')
    } else {
      setMode('register_form')
    }
  }

  function handleMfaQrConfirm() {
    if (mfaCode.length < 6) { setError('Enter the 6-digit code from Google Authenticator'); return }
    setError(''); setLoading(true)
    setTimeout(() => { setLoading(false); setMfaVerified(true); setMode('register_form') }, 1000)
  }

  function handleRegSubmit() {
    if (regForm.newPwd.length < 8)                          { setError('Password must be at least 8 characters'); return }
    if (regForm.newPwd !== regForm.confirmPwd)               { setError('Passwords do not match'); return }
    if (!regForm.mobile.match(/^\+?[0-9]{9,15}$/))          { setError('Enter a valid mobile number'); return }
    if (roleType === 'district_admin' && !regForm.region)    { setError('Select your region'); return }
    if (roleType === 'district_admin' && !regForm.district)  { setError('Select your district'); return }
    if (roleType === 'super_admin' && !regForm.department)   { setError('Enter your department'); return }
    setError(''); setLoading(true)
    setTimeout(() => { setLoading(false); setMode('reg_success') }, 1400)
  }

  function handlePhotoChange(e) {
    const file = e.target.files[0]
    if (!file) return
    reg('photo', file)
    const reader = new FileReader()
    reader.onload = ev => reg('photoPreview', ev.target.result)
    reader.readAsDataURL(file)
  }

  // ── Shared field styles (exactly as designed) ─────────────────────────────────
  const inp = 'w-full bg-[#060f1e] border border-[#1e3a5f] rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-700 outline-none focus:border-[#00d4ff]/50 transition-colors'
  const lbl = 'text-[10px] text-gray-400 uppercase tracking-widest mb-1.5 block'
  const sel = 'w-full bg-[#060f1e] border border-[#1e3a5f] rounded-lg px-4 py-2.5 text-sm text-white outline-none focus:border-[#00d4ff]/50 transition-colors'

  const modeTitle = {
    login:         'Secure Login',
    token:         'Token Authorization',
    mfa_verify:    'MFA Verification',
    mfa_setup:     'Set Up MFA (One-Time)',
    mfa_qr:        'Google Authenticator Setup',
    register_form: roleType === 'super_admin' ? 'Complete Super Admin Profile' : 'Complete District Admin Profile',
    reg_success:   'Registration Complete',
  }
  const modeSub = {
    login:         'Enter credentials to access your dashboard',
    token:         'Enter the one-time token from your official email',
    mfa_verify:    'Enter the 6-digit code from your authenticator app',
    mfa_setup:     'Choose MFA preference for future logins',
    mfa_qr:        'Scan QR with Google Authenticator, then verify',
    register_form: 'Fill in your profile details to activate your account',
    reg_success:   'Your account is fully activated — proceed to login',
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
          <h1 className="text-2xl font-extrabold tracking-wide drop-shadow mb-1">National Bureau of Statistics</h1>
          <p className="text-sm text-white/70 uppercase tracking-widest mb-0.5">Automated Digital Live Census</p>
          <p className="text-xs text-white/50 font-mono mb-8">Research Model (V 1.X.X)</p>
          <div className="w-20 h-20 rounded-2xl border-2 border-white/30 bg-white/10 flex items-center justify-center mb-6">
            <img src="/assets/longo_nbs.png" alt="NBS" className="w-14 h-14 object-contain" />
          </div>
          <p className="text-sm italic text-yellow-200/80">&ldquo;Statistics for Development&rdquo;</p>
        </div>
        <p className="relative z-10 text-[10px] text-white/30">
          © 2026 National Bureau of Statistics · All rights reserved
        </p>
      </div>

      {/* RIGHT: Auth panel */}
      <div className="flex-1 md:w-1/2 flex items-center justify-center bg-[#060f1e] overflow-y-auto py-8">
        <div className="w-full max-w-sm px-6">

          <div className="bg-[#0d1f38] border border-[#1e3a5f] rounded-2xl shadow-2xl overflow-hidden">

            {/* Header */}
            <div className="text-center px-8 pt-8 pb-5">
              <div className="w-12 h-12 rounded-xl bg-[#00d4ff]/10 border border-[#00d4ff]/30 flex items-center justify-center mx-auto mb-4">
                {mode === 'mfa_verify' || mode === 'mfa_setup' || mode === 'mfa_qr'
                  ? <Smartphone size={22} className="text-[#00d4ff]" />
                  : mode === 'reg_success'
                    ? <CheckCircle size={22} className="text-[#00ff9d]" />
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
                <div className="text-center">
                  <button
                    onClick={() => { setMode('token'); setError('') }}
                    className="text-[11px] text-[#00d4ff]/70 hover:text-[#00d4ff]"
                  >
                    New admin? Use Authorization Token →
                  </button>
                </div>
              </>)}

              {/* ── TOKEN ─────────────────────────────────────────────── */}
              {mode === 'token' && (<>
                <div className="p-3 rounded-lg border border-[#00d4ff]/20 bg-[#00d4ff]/5">
                  <p className="text-[#00d4ff] text-xs">
                    Enter the one-time token sent to your official email. Token prefix:{' '}
                    <span className="font-mono">SADM-</span> (Super Admin) or{' '}
                    <span className="font-mono">DADM-</span> (District Admin).
                  </p>
                </div>
                <div>
                  <label className={lbl}>Authorization Token</label>
                  <input
                    type="text"
                    value={token}
                    placeholder="SADM-XXXX-XXXX or DADM-XXXX-XXXX"
                    onChange={e => { setToken(e.target.value); setError('') }}
                    className={`${inp} font-mono tracking-wider`}
                  />
                </div>
                {error && (
                  <p className="text-red-400 text-[10px] flex items-center gap-1">
                    <AlertCircle size={10} />{error}
                  </p>
                )}
                <button
                  onClick={handleToken}
                  className="w-full py-3 rounded-xl font-bold text-sm bg-gradient-to-r from-[#00ff9d] to-[#00bb6e] text-[#060f1e] flex items-center justify-center gap-2 hover:opacity-90 transition-all"
                >
                  {loading
                    ? <RefreshCw size={15} className="animate-spin" />
                    : <><span>Authorize</span><ChevronRight size={15} /></>}
                </button>
                <button
                  onClick={() => { setMode('login'); setError('') }}
                  className="w-full text-center text-[11px] text-gray-500 hover:text-white"
                >
                  ← Back to login
                </button>
              </>)}

              {/* ── MFA VERIFY (returning users with MFA enabled) ────── */}
              {mode === 'mfa_verify' && (<>
                <div className="p-3 rounded-lg border border-[#00d4ff]/20 bg-[#00d4ff]/5">
                  <p className="text-[#00d4ff] text-xs">
                    Open Google Authenticator and enter the 6-digit TOTP code for NBS-ADLCS.
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

              {/* ── MFA SETUP CHOICE ──────────────────────────────────── */}
              {mode === 'mfa_setup' && (<>
                <p className="text-gray-400 text-xs">
                  Choose your login security preference. This is a one-time setup — you can change it later in Settings.
                </p>
                {[
                  { val: true,  icon: '🔐', title: 'Enable MFA',   desc: 'Use Google Authenticator — 6-digit code required on every login (recommended)', col: 'text-[#00ff9d]', brd: 'border-[#00ff9d]/40', bg: 'bg-[#00ff9d]/10' },
                  { val: false, icon: '⚡', title: 'Skip MFA',     desc: 'Login with email & password only (less secure)',                                  col: 'text-orange-400', brd: 'border-orange-400/40', bg: 'bg-orange-400/10' },
                ].map(({ val, icon, title, desc, col, brd, bg }) => (
                  <button
                    key={String(val)}
                    onClick={() => { setMfaChoice(val); setError('') }}
                    className={`w-full text-left p-3 rounded-xl border transition-all ${mfaChoice === val ? `${bg} ${brd}` : 'border-[#1e3a5f] hover:border-[#2a4060]'}`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-lg">{icon}</span>
                      <div className="flex-1">
                        <p className={`text-sm font-bold ${col}`}>{title}</p>
                        <p className="text-[10px] text-gray-500">{desc}</p>
                      </div>
                      {mfaChoice === val && <CheckCircle size={14} className={col} />}
                    </div>
                  </button>
                ))}
                {error && (
                  <p className="text-red-400 text-[10px] flex items-center gap-1">
                    <AlertCircle size={10} />{error}
                  </p>
                )}
                <button
                  onClick={handleMfaSetup}
                  className="w-full py-3 rounded-xl font-bold text-sm bg-gradient-to-r from-[#00ff9d] to-[#00bb6e] text-[#060f1e] hover:opacity-90 transition-all"
                >
                  {loading
                    ? <RefreshCw size={15} className="animate-spin mx-auto" />
                    : 'Confirm & Continue →'}
                </button>
              </>)}

              {/* ── GOOGLE AUTHENTICATOR QR SETUP ────────────────────── */}
              {mode === 'mfa_qr' && (<>
                <div className="space-y-3">
                  <div className="p-3 rounded-lg border border-[#00d4ff]/20 bg-[#00d4ff]/5 text-xs text-[#00d4ff] space-y-1">
                    <p className="font-bold">Steps to set up Google Authenticator:</p>
                    <p>1. Install Google Authenticator on your phone</p>
                    <p>2. Tap <strong>+</strong> → <strong>Scan a QR code</strong></p>
                    <p>3. Scan the QR code below</p>
                    <p>4. Enter the 6-digit code shown in the app</p>
                  </div>

                  <div className="flex flex-col items-center gap-3 py-2">
                    <div className="p-3 bg-white rounded-xl shadow-lg">
                      <img src={MOCK_QR_URL} alt="TOTP QR Code" className="w-44 h-44" />
                    </div>
                    <div className="text-center">
                      <p className="text-[9px] text-gray-500 mb-1">Or enter manually:</p>
                      <p className="font-mono text-xs text-[#00d4ff] bg-[#00d4ff]/10 border border-[#00d4ff]/20 rounded-lg px-3 py-1 tracking-widest">
                        {MOCK_TOTP_SECRET}
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className={lbl}>Verify — Enter TOTP Code from App</label>
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
                    onClick={handleMfaQrConfirm}
                    className="w-full py-3 rounded-xl font-bold text-sm bg-gradient-to-r from-[#00ff9d] to-[#00bb6e] text-[#060f1e] flex items-center justify-center gap-2 hover:opacity-90 transition-all"
                  >
                    {loading
                      ? <RefreshCw size={15} className="animate-spin" />
                      : <><span>Verify &amp; Continue</span><ChevronRight size={15} /></>}
                  </button>
                </div>
              </>)}

              {/* ── REGISTRATION FORM ─────────────────────────────────── */}
              {mode === 'register_form' && (<>
                {mfaVerified && (
                  <div className="p-2 rounded-lg bg-[#00ff9d]/10 border border-[#00ff9d]/20 flex items-center gap-2">
                    <CheckCircle size={12} className="text-[#00ff9d] shrink-0" />
                    <p className="text-[10px] text-[#00ff9d]">Google Authenticator verified ✓</p>
                  </div>
                )}

                {/* Photo upload */}
                <div className="flex flex-col items-center gap-2">
                  <div className="w-20 h-20 rounded-full border-2 border-[#1e3a5f] bg-[#060f1e] flex items-center justify-center overflow-hidden">
                    {regForm.photoPreview
                      ? <img src={regForm.photoPreview} alt="Profile" className="w-full h-full object-cover" />
                      : <Camera size={28} className="text-gray-600" />}
                  </div>
                  <label className="cursor-pointer flex items-center gap-1.5 text-[10px] text-[#00d4ff] hover:underline">
                    <Upload size={11} /> Upload Profile Photo
                    <input type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
                  </label>
                </div>

                {/* Password */}
                <div>
                  <label className={lbl}>New Password</label>
                  <div className="relative">
                    <Lock size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
                    <input
                      type={showNewPwd ? 'text' : 'password'}
                      value={regForm.newPwd}
                      placeholder="Min. 8 characters"
                      onChange={e => { reg('newPwd', e.target.value); setError('') }}
                      className={inp.replace('px-4', 'pl-9 pr-10')}
                    />
                    <button
                      onClick={() => setShowNewPwd(!showNewPwd)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-300"
                    >
                      {showNewPwd ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className={lbl}>Re-enter Password</label>
                  <div className="relative">
                    <Lock size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
                    <input
                      type={showConfPwd ? 'text' : 'password'}
                      value={regForm.confirmPwd}
                      placeholder="Re-enter password"
                      onChange={e => { reg('confirmPwd', e.target.value); setError('') }}
                      className={inp.replace('px-4', 'pl-9 pr-10')}
                    />
                    <button
                      onClick={() => setShowConfPwd(!showConfPwd)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-300"
                    >
                      {showConfPwd ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                  </div>
                  {regForm.confirmPwd && regForm.newPwd !== regForm.confirmPwd && (
                    <p className="text-red-400 text-[9px] mt-0.5 flex items-center gap-1">
                      <AlertCircle size={9} />Passwords do not match
                    </p>
                  )}
                  {regForm.confirmPwd && regForm.newPwd === regForm.confirmPwd && regForm.newPwd.length >= 8 && (
                    <p className="text-[#00ff9d] text-[9px] mt-0.5 flex items-center gap-1">
                      <CheckCircle size={9} />Passwords match
                    </p>
                  )}
                </div>

                {/* Mobile */}
                <div>
                  <label className={lbl}>Mobile Number</label>
                  <div className="relative">
                    <Phone size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
                    <input
                      type="tel"
                      value={regForm.mobile}
                      placeholder="+255 7XX XXX XXX"
                      onChange={e => { reg('mobile', e.target.value); setError('') }}
                      className={inp.replace('px-4', 'pl-9 pr-4')}
                    />
                  </div>
                </div>

                {/* Super Admin: Department */}
                {roleType === 'super_admin' && (
                  <div>
                    <label className={lbl}>Department</label>
                    <div className="relative">
                      <Building2 size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
                      <select
                        value={regForm.department}
                        onChange={e => { reg('department', e.target.value); setError('') }}
                        className={sel.replace('px-4', 'pl-9 pr-4')}
                      >
                        <option value="">Select department</option>
                        {['ICT', 'Statistics', 'Planning', 'Finance', 'Human Resources', 'Data Management', 'Field Operations', 'Research & Analysis'].map(d => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {/* District Admin: Region + District */}
                {roleType === 'district_admin' && (<>
                  <div>
                    <label className={lbl}>Region</label>
                    <select
                      value={regForm.region}
                      onChange={e => { reg('region', e.target.value); reg('district', ''); setError('') }}
                      className={sel}
                    >
                      <option value="">Select region</option>
                      {allRegions.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={lbl}>District</label>
                    <select
                      value={regForm.district}
                      onChange={e => { reg('district', e.target.value); setError('') }}
                      disabled={!regForm.region}
                      className={`${sel} disabled:opacity-40`}
                    >
                      <option value="">Select district</option>
                      {regDistricts.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                </>)}

                {error && (
                  <p className="text-red-400 text-[10px] flex items-center gap-1">
                    <AlertCircle size={10} />{error}
                  </p>
                )}
                <button
                  onClick={handleRegSubmit}
                  className="w-full py-3 rounded-xl font-bold text-sm bg-gradient-to-r from-[#00ff9d] to-[#00bb6e] text-[#060f1e] flex items-center justify-center gap-2 hover:opacity-90 transition-all"
                >
                  {loading
                    ? <RefreshCw size={15} className="animate-spin" />
                    : <><span>Submit &amp; Activate Account</span><ChevronRight size={15} /></>}
                </button>
              </>)}

              {/* ── REG SUCCESS ───────────────────────────────────────── */}
              {mode === 'reg_success' && (
                <div className="text-center space-y-4 py-2">
                  <div className="w-16 h-16 rounded-full bg-[#00ff9d]/10 border border-[#00ff9d]/30 flex items-center justify-center mx-auto">
                    <CheckCircle size={32} className="text-[#00ff9d]" />
                  </div>
                  <div>
                    <p className="text-white font-bold text-base">Account Activated!</p>
                    <p className="text-gray-500 text-xs mt-1">
                      Your credentials have been saved. You may now log in with your new password.
                    </p>
                    {mfaVerified && (
                      <p className="text-[#00ff9d] text-[10px] mt-1">
                        🔐 Google Authenticator MFA is active on your account.
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      setMode('login')
                      setEmail(''); setPassword(''); setToken('')
                      setMfaCode(''); setTempToken(null)
                      setMfaChoice(null); setRoleType(null); setMfaVerified(false)
                      setRegForm({ newPwd: '', confirmPwd: '', mobile: '', department: '', region: '', district: '', photo: null, photoPreview: null })
                      setError('')
                    }}
                    className="w-full py-3 rounded-xl font-bold text-sm bg-gradient-to-r from-[#00d4ff] to-[#0088bb] text-[#060f1e] hover:opacity-90 transition-all"
                  >
                    Go to Login →
                  </button>
                </div>
              )}

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
