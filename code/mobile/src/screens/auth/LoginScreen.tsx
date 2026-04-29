/**
 * LoginScreen.tsx — ADLCS Mobile Login
 * Shared by: Village Officer + Hospital Officer
 *
 * Design source: web LoginPage.jsx (adlcs-ui-ux-main)
 * Layout adaptation:
 *   WEB  → LEFT panel  (flag bg + logos stacked vertically) + RIGHT panel (form)
 *   MOBILE → TOP section (flag bg + logos on ONE horizontal row)
 *            BOTTOM section (login/token/MFA/registration form — same logic as web)
 *
 * First-open gate (system design §2.4 / §2.5):
 *   Device Activation modal overlays everything on first install.
 *   Officer enters one-time token from email → background processes run
 *   (device fingerprint, GPS, geo-fence download) → modal dismissed → form accessible.
 *
 * Auth flow:
 *   login mode      → POST /api/auth/login
 *   mfa_verify mode → POST /api/auth/mfa/verify
 *   token mode      → new officer onboarding (one-time token → profile setup)
 *   Role routing:   village_officer → VillageHome
 *                   hospital_officer → HospitalHome
 */

import React, { useState, useEffect, useRef } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Modal, ActivityIndicator, KeyboardAvoidingView,
  Platform, Animated, Alert, ImageBackground,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Location from 'expo-location'
import * as Device from 'expo-device'
import {
  Eye, EyeOff, Lock, Mail, Shield, ChevronRight,
  RefreshCw, MapPin, Smartphone, CheckCircle,
  AlertCircle, Camera, Upload, Phone,
} from 'lucide-react-native'

// ── Config ────────────────────────────────────────────────────────────────────
const API_BASE          = process.env.EXPO_PUBLIC_API_URL || 'https://final-dissertation-s6j8.onrender.com/api'
const DEVICE_ACTIVE_KEY = 'adlcs_device_activated'   // AsyncStorage key
const OTP_TTL           = 10 * 60                    // 10 minutes in seconds

// ── Colour tokens (mirrors web dashboard palette) ─────────────────────────────
const C = {
  pageBg:   '#060f1e',   // dark navy — same as web right panel
  cardBg:   '#0d1f38',   // card background
  border:   '#1e3a5f',   // input border
  inputBg:  '#060f1e',   // input fill
  cyan:     '#00d4ff',   // primary accent
  green:    '#00ff9d',   // success / MFA green
  greenDark:'#00bb6e',
  text:     '#ffffff',
  textSub:  '#94a3b8',
  textDim:  '#4b6080',
  red:      '#f87171',
  redBg:    'rgba(239,68,68,0.1)',
  yellow:   '#fcd116',   // Tanzania flag yellow
  tzGreen:  '#1eb53a',   // Tanzania flag green
  tzBlue:   '#00a3dd',   // Tanzania flag blue
}

// ── Utility ───────────────────────────────────────────────────────────────────
const fmt = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`

// ── Shared input style tokens (mirrors web inp/lbl strings) ───────────────────
// Used inside StyleSheet below — kept as comments for reference
// inp: bg=#060f1e border=#1e3a5f rounded-lg px-4 py-2.5 text-sm text-white
// lbl: text-[10px] text-gray-400 uppercase tracking-widest mb-1.5

// ── Sub-components ────────────────────────────────────────────────────────────

function Lbl({ children }: { children: string }) {
  return <Text style={s.lbl}>{children}</Text>
}

function Inp({
  value, onChangeText, placeholder, secure, keyboard, right, editable = true,
}: {
  value: string; onChangeText: (t: string) => void; placeholder?: string
  secure?: boolean; keyboard?: any; right?: React.ReactNode; editable?: boolean
}) {
  return (
    <View style={[s.inpWrap, !editable && { opacity: 0.5 }]}>
      <TextInput
        style={[s.inp, right ? { paddingRight: 44 } : {}]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={C.textDim}
        secureTextEntry={secure}
        keyboardType={keyboard || 'default'}
        autoCapitalize="none"
        autoCorrect={false}
        editable={editable}
      />
      {right && <View style={s.inpRight}>{right}</View>}
    </View>
  )
}

function ErrMsg({ msg }: { msg: string }) {
  if (!msg) return null
  return (
    <View style={s.errRow}>
      <AlertCircle size={10} color={C.red} />
      <Text style={s.errTxt}>{msg}</Text>
    </View>
  )
}

function PrimaryBtn({
  label, onPress, loading, disabled,
}: {
  label: string; onPress: () => void; loading?: boolean; disabled?: boolean
}) {
  return (
    <TouchableOpacity
      style={[s.btn, (disabled || loading) && s.btnOff]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
    >
      {loading
        ? <ActivityIndicator color={C.pageBg} size="small" />
        : <Text style={s.btnTxt}>{label}</Text>
      }
    </TouchableOpacity>
  )
}

// ── TOP SECTION — horizontal flag + branding strip ────────────────────────────
/**
 * TopBrand
 * Adapts the web LEFT panel into a compact horizontal strip.
 * Web left: coat of arms (large, centred) + title block (stacked vertically)
 * Mobile:   coat of arms (small, left)    + title block (right, horizontal row)
 */
function TopBrand() {
  return (
    <ImageBackground
      source={require('../../assets/flag.jpg')}   // same asset path as web /assets/flag.jpg
      style={s.topBrand}
      imageStyle={{ opacity: 0.45 }}
    >
      {/* Dark overlay — mirrors web's bg-black/55 */}
      <View style={s.topOverlay} />

      {/* Single horizontal row: govt label | coat of arms | text | NBS logo */}
      <View style={s.topRow}>

        {/* Coat of arms circle — mirrors web's w-36 rounded-full */}
        <View style={s.coatCircle}>
          {/* In production: <Image source={require('../../assets/court_of_arm.png')} style={s.coatImg}/> */}
          <Text style={{ fontSize: 26 }}>🦅</Text>
        </View>

        {/* Text block */}
        <View style={s.topTextBlock}>
          <Text style={s.topGovLabel}>THE UNITED REPUBLIC OF TANZANIA</Text>
          <Text style={s.topTitle}>National Bureau of Statistics</Text>
          <Text style={s.topSub}>Automated Digital Live Census</Text>
          <Text style={s.topVersion}>Research Model (V 1.X.X)</Text>
        </View>

        {/* NBS logo square — mirrors web's w-20 rounded-2xl */}
        <View style={s.nbsLogoBox}>
          {/* In production: <Image source={require('../../assets/longo_nbs.png')} style={s.nbsLogoImg}/> */}
          <Text style={{ fontSize: 20 }}>📊</Text>
        </View>

      </View>

      {/* Tanzania flag colour stripe at bottom of strip (mirrors web flag stripe) */}
      <View style={s.flagStripe}>
        <View style={[s.stripeSeg, { flex: 1, backgroundColor: C.tzGreen }]} />
        <View style={[s.stripeSeg, { width: 10, backgroundColor: C.yellow }]} />
        <View style={[s.stripeSeg, { width: 10, backgroundColor: '#000' }]} />
        <View style={[s.stripeSeg, { width: 10, backgroundColor: C.yellow }]} />
        <View style={[s.stripeSeg, { flex: 1, backgroundColor: C.tzBlue }]} />
      </View>

      {/* Italic tagline — mirrors web's "Statistics for Development" */}
      <Text style={s.tagline}>"Statistics for Development"</Text>
    </ImageBackground>
  )
}

// ── DEVICE ACTIVATION MODAL ───────────────────────────────────────────────────
/**
 * DeviceActivationModal — system design §2.4 / §2.5
 * Shown on first install. Blocks access until OTP validated.
 * Runs background processes silently after token accepted:
 *   a) Device fingerprint (model + OS + brand)
 *   b) GPS coordinates
 *   c) Geo-fence polygon download (from internal DB via backend)
 *   d) Persist activation flag to AsyncStorage
 */
function DeviceActivationModal({
  visible, onActivated,
}: { visible: boolean; onActivated: () => void }) {

  const [otp,       setOtp]       = useState('')
  const [countdown, setCountdown] = useState(OTP_TTL)
  const [loading,   setLoading]   = useState(false)
  const [bgLabel,   setBgLabel]   = useState('')
  const [error,     setError]     = useState('')
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!visible) return
    setCountdown(OTP_TTL)
    timer.current = setInterval(() => {
      setCountdown(p => { if (p <= 1) { clearInterval(timer.current!); return 0 } return p - 1 })
    }, 1000)
    return () => { if (timer.current) clearInterval(timer.current) }
  }, [visible])

  const activate = async () => {
    if (otp.trim().length < 6) { setError('Enter the activation token from your email.'); return }
    if (countdown === 0)        { setError('Token expired. Request a new one from your District Administrator.'); return }
    setError(''); setLoading(true)
    try {
      // A — Validate token (real: POST /api/auth/activate-device)
      setBgLabel('Validating activation token…')
      await new Promise(r => setTimeout(r, 700))

      // B — Device fingerprint
      setBgLabel('Capturing device identity…')
      const fingerprint = { model: Device.modelName, os: Device.osVersion, brand: Device.brand }
      await new Promise(r => setTimeout(r, 300))

      // C — GPS
      setBgLabel('Recording GPS location…')
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        setError('Location permission required. Enable it in device settings and try again.')
        setLoading(false); setBgLabel(''); return
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })

      // D — Geo-fence download (real: GET /api/geo-fence/:officerId)
      setBgLabel('Downloading village boundary…')
      await new Promise(r => setTimeout(r, 500))

      // E — Persist
      setBgLabel('Finalising…')
      await AsyncStorage.multiSet([
        [DEVICE_ACTIVE_KEY, 'true'],
        ['adlcs_gps', JSON.stringify({ lat: loc.coords.latitude, lng: loc.coords.longitude })],
        ['adlcs_device', JSON.stringify(fingerprint)],
      ])

      setLoading(false); setBgLabel('')
      onActivated()
    } catch {
      setError('Activation failed. Check your connection and try again.')
      setLoading(false); setBgLabel('')
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={s.modalOverlay}>
        <View style={s.activationCard}>

          {/* Icon — matches Image 2 mobile phone + gear */}
          <View style={s.actIconWrap}>
            <Text style={{ fontSize: 34 }}>📱</Text>
          </View>

          <Text style={s.actTitle}>Device Activation</Text>
          <Text style={s.actSub}>
            Enter the one-time token sent to your official email
            to bind this device to your officer account.
          </Text>

          {/* Token input */}
          <View style={{ width: '100%', marginBottom: 6 }}>
            <Text style={[s.lbl, { color: '#374151' }]}>
              One-Time Activation Token <Text style={{ color: C.red }}>*</Text>
            </Text>
            <View style={s.actInpWrap}>
              <TextInput
                style={s.actInp}
                value={otp}
                onChangeText={t => { setOtp(t); setError('') }}
                placeholder="••••••"
                placeholderTextColor="#9ca3af"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!loading}
              />
              <Text style={{ fontSize: 18, paddingRight: 12 }}>🔑</Text>
            </View>
          </View>

          {/* Countdown — mirrors Image 2 "Verification code expires in 10:00" */}
          <Text style={[s.countdown, countdown < 60 && { color: C.red }]}>
            {countdown > 0
              ? `Verification code expires in ${fmt(countdown)}`
              : '⚠ Token expired — contact your District Administrator'}
          </Text>

          {error ? (
            <View style={[s.errRow, { marginBottom: 10 }]}>
              <AlertCircle size={11} color={C.red} />
              <Text style={s.errTxt}>{error}</Text>
            </View>
          ) : null}

          {/* Background process status */}
          {bgLabel ? (
            <View style={s.bgRow}>
              <ActivityIndicator size="small" color="#16a34a" />
              <Text style={s.bgTxt}>{bgLabel}</Text>
            </View>
          ) : null}

          {/* Activate Device button — green, matches Image 2 */}
          <TouchableOpacity
            style={[s.actBtn, (loading || countdown === 0) && s.btnOff]}
            onPress={activate}
            disabled={loading || countdown === 0}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.actBtnTxt}>🔒  Activate Device</Text>
            }
          </TouchableOpacity>

          {/* Geo-fence notice — matches Image 2 info box */}
          <View style={s.noticeBox}>
            <Text style={s.noticeIcon}>ⓘ</Text>
            <Text style={s.noticeTxt}>
              This device will be geo-fenced to your assigned village or facility boundary.
              Attempting to use the application outside designated zones will result in
              account lockout.
            </Text>
          </View>

        </View>
      </View>
    </Modal>
  )
}

// ── MAIN SCREEN ───────────────────────────────────────────────────────────────
export default function LoginScreen({ navigation }: { navigation: any }) {

  const [activationDone,     setActivationDone]     = useState(false)
  const [checkingActivation, setCheckingActivation] = useState(true)

  // Login form state — mirrors web LoginPage modes exactly
  const [mode,        setMode]        = useState('login')   // login | mfa_verify | token | mfa_setup | mfa_qr | register_form | reg_success
  const [email,       setEmail]       = useState('')
  const [password,    setPassword]    = useState('')
  const [showPass,    setShowPass]    = useState(false)
  const [token,       setToken]       = useState('')
  const [mfaCode,     setMfaCode]     = useState('')
  const [tempToken,   setTempToken]   = useState('')
  const [mfaChoice,   setMfaChoice]   = useState<boolean | null>(null)
  const [roleType,    setRoleType]    = useState<string | null>(null)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')
  const [mfaVerified, setMfaVerified] = useState(false)

  const [regForm, setRegForm] = useState({
    newPwd: '', confirmPwd: '', mobile: '', photo: null as any,
  })
  const [showNewPwd,  setShowNewPwd]  = useState(false)
  const [showConfPwd, setShowConfPwd] = useState(false)
  const reg = (f: string, v: any) => setRegForm(p => ({ ...p, [f]: v }))

  const fadeAnim = useRef(new Animated.Value(0)).current

  // Check activation status on mount
  useEffect(() => {
    AsyncStorage.getItem(DEVICE_ACTIVE_KEY).then(val => {
      setActivationDone(val === 'true')
      setCheckingActivation(false)
      if (val === 'true') {
        Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start()
      }
    })
  }, [])

  const onActivated = () => {
    setActivationDone(true)
    Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start()
  }

  // ── Handlers (mirror web LoginPage handlers) ──────────────────────────────

  const handleLogin = async () => {
    if (!email.includes('@')) { setError('Enter a valid email'); return }
    if (password.length < 4)  { setError('Enter your password'); return }
    setError(''); setLoading(true)
    try {
      const res  = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.message || 'Login failed'); return }
      if (data.mfaRequired) {
        setTempToken(data.tempToken); setMode('mfa_verify')
      } else {
        await AsyncStorage.multiSet([
          ['adlcs_access_token',  data.accessToken],
          ['adlcs_refresh_token', data.refreshToken],
        ])
        goHome(data.profile.role)
      }
    } catch { setError('Connection failed. Check your internet.') }
    finally   { setLoading(false) }
  }

  const handleMfaVerify = async () => {
    if (mfaCode.length < 6) { setError('Enter the 6-digit TOTP code'); return }
    setError(''); setLoading(true)
    try {
      const res  = await fetch(`${API_BASE}/auth/mfa/verify`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tempToken, code: mfaCode }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.message || 'Invalid MFA code'); setMfaCode(''); return }
      await AsyncStorage.multiSet([
        ['adlcs_access_token',  data.accessToken],
        ['adlcs_refresh_token', data.refreshToken],
      ])
      goHome(data.profile.role)
    } catch { setError('Connection failed. Try again.') }
    finally   { setLoading(false) }
  }

  const handleToken = () => {
    if (token.length < 6) { setError('Enter the authorization token'); return }
    setError(''); setLoading(true)
    // Real impl: POST /api/auth/validate-token → returns role + sets up profile
    setTimeout(() => {
      setLoading(false)
      // Token prefix VOF- = village officer, HOF- = hospital officer
      const detected = token.toUpperCase().startsWith('VOF') ? 'village_officer' : 'hospital_officer'
      setRoleType(detected)
      setMode('mfa_setup')
    }, 1200)
  }

  const handleMfaSetup = () => {
    if (mfaChoice === null) { setError('Please choose an MFA option'); return }
    setError('')
    if (mfaChoice) setMode('mfa_qr')
    else setMode('register_form')
  }

  const handleMfaQrConfirm = () => {
    if (mfaCode.length < 6) { setError('Enter the 6-digit code from Google Authenticator'); return }
    setError(''); setLoading(true)
    setTimeout(() => { setLoading(false); setMfaVerified(true); setMode('register_form') }, 1000)
  }

  const handleRegSubmit = () => {
    if (regForm.newPwd.length < 8)            { setError('Password must be at least 8 characters'); return }
    if (regForm.newPwd !== regForm.confirmPwd) { setError('Passwords do not match'); return }
    if (!regForm.mobile.match(/^\+?[0-9]{9,15}$/)) { setError('Enter a valid mobile number'); return }
    setError(''); setLoading(true)
    setTimeout(() => { setLoading(false); setMode('reg_success') }, 1400)
  }

  const goHome = (role: string) => {
    if (role === 'village_officer')  navigation.replace('VillageHome')
    else if (role === 'hospital_officer') navigation.replace('HospitalHome')
    else Alert.alert('Access Denied', 'This app is for field officers only.')
  }

  const resetAll = () => {
    setMode('login'); setEmail(''); setPassword(''); setToken('')
    setMfaCode(''); setTempToken(''); setMfaChoice(null); setRoleType(null)
    setMfaVerified(false); setError('')
    setRegForm({ newPwd:'', confirmPwd:'', mobile:'', photo: null })
  }

  if (checkingActivation) {
    return <View style={[s.screen, { alignItems:'center', justifyContent:'center' }]}>
      <ActivityIndicator size="large" color={C.cyan} />
    </View>
  }

  return (
    <View style={s.screen}>

      {/* Device activation gate */}
      <DeviceActivationModal visible={!activationDone} onActivated={onActivated} />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          <Animated.View style={{ opacity: fadeAnim }}>

            {/* ── TOP: flag + branding (adapted from web left panel) ─────── */}
            <TopBrand />

            {/* ── BOTTOM: auth card (same logic as web right panel) ──────── */}
            <View style={s.cardArea}>
              <View style={s.card}>

                {/* Card header icon + title — mirrors web card header */}
                <View style={s.cardIconWrap}>
                  {mode === 'mfa_verify' || mode === 'mfa_setup' || mode === 'mfa_qr'
                    ? <Smartphone size={22} color={C.cyan} />
                    : mode === 'reg_success'
                      ? <CheckCircle size={22} color={C.green} />
                      : <Shield size={22} color={C.cyan} />
                  }
                </View>

                <Text style={s.cardTitle}>
                  {{ login:'Officer Login', token:'Token Authorization',
                     mfa_verify:'MFA Verification', mfa_setup:'Set Up MFA',
                     mfa_qr:'Google Authenticator Setup',
                     register_form: roleType==='village_officer'
                       ? 'Complete Village Officer Profile'
                       : 'Complete Hospital Officer Profile',
                     reg_success:'Registration Complete',
                  }[mode]}
                </Text>
                <Text style={s.cardSub}>
                  {{ login:'Enter credentials to access your dashboard',
                     token:'Enter the one-time token from your official email',
                     mfa_verify:'Enter the 6-digit code from your authenticator app',
                     mfa_setup:'Choose MFA preference for future logins',
                     mfa_qr:'Scan QR with Google Authenticator, then verify',
                     register_form:'Fill in your profile details to activate your account',
                     reg_success:'Your account is fully activated — proceed to login',
                  }[mode]}
                </Text>

                <ErrMsg msg={error} />

                {/* ── LOGIN ─────────────────────────────────────────────── */}
                {mode === 'login' && (<>
                  <Lbl>EMAIL ADDRESS</Lbl>
                  <Inp value={email} onChangeText={t => { setEmail(t); setError('') }}
                       placeholder="official@nbs.go.tz" keyboard="email-address" />
                  <View style={{ height: 12 }} />
                  <Lbl>PASSWORD</Lbl>
                  <Inp value={password} onChangeText={t => { setPassword(t); setError('') }}
                       placeholder="••••••••" secure={!showPass}
                       right={
                         <TouchableOpacity onPress={() => setShowPass(!showPass)}>
                           {showPass ? <EyeOff size={14} color={C.textDim}/> : <Eye size={14} color={C.textDim}/>}
                         </TouchableOpacity>
                       } />
                  <View style={{ height: 16 }} />
                  <PrimaryBtn label="Sign In" onPress={handleLogin} loading={loading} />
                  <TouchableOpacity onPress={() => { setMode('token'); setError('') }} style={s.linkBtn}>
                    <Text style={s.linkTxt}>New officer? Use Authorization Token →</Text>
                  </TouchableOpacity>
                </>)}

                {/* ── TOKEN ─────────────────────────────────────────────── */}
                {mode === 'token' && (<>
                  <View style={s.infoBox}>
                    <Text style={s.infoTxt}>
                      Enter the one-time token from your email.
                      Prefix: <Text style={{ fontFamily: 'monospace' }}>VOF-</Text> (Village Officer)
                      or <Text style={{ fontFamily: 'monospace' }}>HOF-</Text> (Hospital Officer).
                    </Text>
                  </View>
                  <Lbl>AUTHORIZATION TOKEN</Lbl>
                  <Inp value={token} onChangeText={t => { setToken(t); setError('') }}
                       placeholder="VOF-XXXX-XXXX or HOF-XXXX-XXXX" />
                  <View style={{ height: 16 }} />
                  <PrimaryBtn label="Authorize" onPress={handleToken} loading={loading} />
                  <TouchableOpacity onPress={() => { setMode('login'); setError('') }} style={s.linkBtn}>
                    <Text style={s.linkTxt}>← Back to login</Text>
                  </TouchableOpacity>
                </>)}

                {/* ── MFA VERIFY ────────────────────────────────────────── */}
                {mode === 'mfa_verify' && (<>
                  <View style={s.infoBox}>
                    <Text style={s.infoTxt}>Open Google Authenticator and enter the 6-digit TOTP code for NBS-ADLCS.</Text>
                  </View>
                  <Lbl>6-DIGIT TOTP CODE</Lbl>
                  <Inp value={mfaCode}
                       onChangeText={t => { setMfaCode(t.replace(/\D/g,'').slice(0,6)); setError('') }}
                       placeholder="000 000" keyboard="number-pad" />
                  <View style={{ height: 16 }} />
                  <PrimaryBtn label="Verify & Login" onPress={handleMfaVerify}
                              loading={loading} disabled={mfaCode.length < 6} />
                  <TouchableOpacity onPress={() => { setMode('login'); setError('') }} style={s.linkBtn}>
                    <Text style={s.linkTxt}>← Back</Text>
                  </TouchableOpacity>
                </>)}

                {/* ── MFA SETUP CHOICE ──────────────────────────────────── */}
                {mode === 'mfa_setup' && (<>
                  <Text style={[s.cardSub, { marginBottom: 12, textAlign: 'left' }]}>
                    Choose your login security preference. This is a one-time setup.
                  </Text>
                  {[
                    { val: true,  icon:'🔐', title:'Enable MFA',
                      desc:'Use Google Authenticator — 6-digit code required on every login (recommended)',
                      col: C.green, border: C.green },
                    { val: false, icon:'⚡', title:'Skip MFA',
                      desc:'Login with email & password only (less secure)',
                      col: '#fb923c', border: '#fb923c' },
                  ].map(opt => (
                    <TouchableOpacity
                      key={String(opt.val)}
                      onPress={() => { setMfaChoice(opt.val); setError('') }}
                      style={[s.choiceCard, mfaChoice === opt.val && {
                        borderColor: opt.border, backgroundColor: opt.border + '15'
                      }]}
                    >
                      <Text style={{ fontSize: 20, marginRight: 10 }}>{opt.icon}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.choiceTitle, { color: opt.col }]}>{opt.title}</Text>
                        <Text style={s.choiceDesc}>{opt.desc}</Text>
                      </View>
                      {mfaChoice === opt.val && <CheckCircle size={14} color={opt.col} />}
                    </TouchableOpacity>
                  ))}
                  <View style={{ height: 12 }} />
                  <PrimaryBtn label="Confirm & Continue →" onPress={handleMfaSetup} loading={loading} />
                </>)}

                {/* ── GOOGLE AUTHENTICATOR QR SETUP ─────────────────────── */}
                {mode === 'mfa_qr' && (<>
                  <View style={s.infoBox}>
                    <Text style={s.infoTxt}>
                      1. Install Google Authenticator{'\n'}
                      2. Tap + → Scan a QR code{'\n'}
                      3. Enter the 6-digit code shown
                    </Text>
                  </View>
                  <View style={s.qrWrap}>
                    {/* QR placeholder — real: <Image source={{uri: qrUrl}} /> */}
                    <View style={s.qrPlaceholder}>
                      <Text style={{ fontSize: 60 }}>⬛</Text>
                      <Text style={s.qrPlaceholderTxt}>QR Code{'\n'}(server-generated)</Text>
                    </View>
                  </View>
                  <Lbl>VERIFY — ENTER TOTP CODE FROM APP</Lbl>
                  <Inp value={mfaCode}
                       onChangeText={t => { setMfaCode(t.replace(/\D/g,'').slice(0,6)); setError('') }}
                       placeholder="000 000" keyboard="number-pad" />
                  <View style={{ height: 16 }} />
                  <PrimaryBtn label="Verify & Continue" onPress={handleMfaQrConfirm}
                              loading={loading} disabled={mfaCode.length < 6} />
                </>)}

                {/* ── REGISTRATION FORM ─────────────────────────────────── */}
                {mode === 'register_form' && (<>
                  {mfaVerified && (
                    <View style={[s.infoBox, { borderColor: C.green, backgroundColor: C.green + '15', flexDirection:'row', gap:8 }]}>
                      <CheckCircle size={12} color={C.green} />
                      <Text style={[s.infoTxt, { color: C.green }]}>Google Authenticator verified ✓</Text>
                    </View>
                  )}
                  <Lbl>NEW PASSWORD (MIN. 8 CHARACTERS)</Lbl>
                  <Inp value={regForm.newPwd}
                       onChangeText={t => { reg('newPwd', t); setError('') }}
                       placeholder="Min. 8 characters" secure={!showNewPwd}
                       right={
                         <TouchableOpacity onPress={() => setShowNewPwd(!showNewPwd)}>
                           {showNewPwd ? <EyeOff size={14} color={C.textDim}/> : <Eye size={14} color={C.textDim}/>}
                         </TouchableOpacity>
                       } />
                  <View style={{ height: 12 }} />
                  <Lbl>CONFIRM PASSWORD</Lbl>
                  <Inp value={regForm.confirmPwd}
                       onChangeText={t => { reg('confirmPwd', t); setError('') }}
                       placeholder="Re-enter password" secure={!showConfPwd}
                       right={
                         <TouchableOpacity onPress={() => setShowConfPwd(!showConfPwd)}>
                           {showConfPwd ? <EyeOff size={14} color={C.textDim}/> : <Eye size={14} color={C.textDim}/>}
                         </TouchableOpacity>
                       } />
                  {regForm.confirmPwd.length > 0 && (
                    <Text style={{ fontSize: 10, marginTop: 4,
                      color: regForm.newPwd === regForm.confirmPwd ? C.green : C.red }}>
                      {regForm.newPwd === regForm.confirmPwd ? '✓ Passwords match' : '✗ Passwords do not match'}
                    </Text>
                  )}
                  <View style={{ height: 12 }} />
                  <Lbl>MOBILE NUMBER</Lbl>
                  <Inp value={regForm.mobile}
                       onChangeText={t => { reg('mobile', t); setError('') }}
                       placeholder="+255 7XX XXX XXX" keyboard="phone-pad" />
                  <View style={{ height: 16 }} />
                  <PrimaryBtn label="Submit & Activate Account" onPress={handleRegSubmit} loading={loading} />
                </>)}

                {/* ── REG SUCCESS ───────────────────────────────────────── */}
                {mode === 'reg_success' && (
                  <View style={{ alignItems: 'center', paddingVertical: 12 }}>
                    <View style={[s.cardIconWrap, { backgroundColor: C.green + '20', borderColor: C.green + '40' }]}>
                      <CheckCircle size={32} color={C.green} />
                    </View>
                    <Text style={s.cardTitle}>Account Activated!</Text>
                    <Text style={[s.cardSub, { textAlign:'center', marginBottom: 16 }]}>
                      Your credentials have been saved. You may now log in with your new password.
                    </Text>
                    {mfaVerified && (
                      <Text style={{ color: C.green, fontSize: 11, marginBottom: 16 }}>
                        🔐 Google Authenticator MFA is active on your account.
                      </Text>
                    )}
                    <PrimaryBtn label="Go to Login →" onPress={resetAll} />
                  </View>
                )}

              </View>

              {/* Footer — mirrors web MapPin footer */}
              <View style={s.footer}>
                <MapPin size={11} color={C.textDim} />
                <Text style={s.footerTxt}>NBS Head Office · Dodoma, Tanzania</Text>
              </View>
              <Text style={s.footerTxt2}>Unauthorized access is prohibited and monitored</Text>
            </View>

          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  )
}

// ── StyleSheet ────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  screen:        { flex: 1, backgroundColor: C.pageBg },

  // Top brand (adapted from web left panel)
  topBrand:      { width: '100%', backgroundColor: '#060f1e', paddingBottom: 6 },
  topOverlay:    { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  topRow:        { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 14 },
  coatCircle:    { width: 52, height: 52, borderRadius: 26, borderWidth: 2, borderColor: 'rgba(255,255,255,0.35)', backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  topTextBlock:  { flex: 1 },
  topGovLabel:   { fontSize: 7.5, fontWeight: '800', color: '#fcd116', letterSpacing: 1.5, textTransform: 'uppercase', lineHeight: 12 },
  topTitle:      { fontSize: 13, fontWeight: '900', color: '#fff', lineHeight: 18 },
  topSub:        { fontSize: 8.5, color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase', letterSpacing: 1, lineHeight: 13 },
  topVersion:    { fontSize: 8, color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace' },
  nbsLogoBox:    { width: 44, height: 44, borderRadius: 10, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.25)', backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  flagStripe:    { flexDirection: 'row', height: 5 },
  stripeSeg:     {},
  tagline:       { fontSize: 10, fontStyle: 'italic', color: 'rgba(252,209,22,0.75)', textAlign: 'center', paddingBottom: 10, paddingTop: 4 },

  // Auth card area (bottom — mirrors web right panel bg)
  cardArea:      { backgroundColor: C.pageBg, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 32 },
  card:          { backgroundColor: C.cardBg, borderRadius: 18, borderWidth: 1, borderColor: C.border, padding: 24, overflow: 'hidden' },
  cardIconWrap:  { width: 48, height: 48, borderRadius: 12, backgroundColor: C.cyan + '18', borderWidth: 1, borderColor: C.cyan + '50', alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 12 },
  cardTitle:     { fontSize: 16, fontWeight: '800', color: C.text, textAlign: 'center', marginBottom: 4 },
  cardSub:       { fontSize: 11, color: C.textDim, textAlign: 'center', marginBottom: 16 },

  // Labels + inputs
  lbl:           { fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 6 },
  inpWrap:       { flexDirection: 'row', alignItems: 'center', backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.border, borderRadius: 10 },
  inp:           { flex: 1, color: C.text, fontSize: 13, paddingHorizontal: 14, paddingVertical: 11 },
  inpRight:      { paddingRight: 12 },

  // Info box (mirrors web p-3 border border-[#00d4ff]/20 bg-[#00d4ff]/5)
  infoBox:       { backgroundColor: C.cyan + '0d', borderWidth: 1, borderColor: C.cyan + '35', borderRadius: 10, padding: 12, marginBottom: 14 },
  infoTxt:       { fontSize: 11.5, color: C.cyan, lineHeight: 18 },

  // Buttons
  btn:           { backgroundColor: C.cyan, borderRadius: 12, paddingVertical: 13, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  btnTxt:        { color: C.pageBg, fontWeight: '800', fontSize: 14 },
  btnOff:        { opacity: 0.45 },
  linkBtn:       { alignItems: 'center', marginTop: 14 },
  linkTxt:       { fontSize: 11, color: C.cyan + 'bb' },

  // Error
  errRow:        { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 10 },
  errTxt:        { fontSize: 10, color: C.red },

  // MFA choice cards
  choiceCard:    { borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  choiceTitle:   { fontSize: 13, fontWeight: '700', marginBottom: 2 },
  choiceDesc:    { fontSize: 10, color: C.textSub, lineHeight: 15 },

  // QR
  qrWrap:        { alignItems: 'center', paddingVertical: 12 },
  qrPlaceholder: { backgroundColor: '#fff', borderRadius: 12, padding: 16, alignItems: 'center', width: 160, height: 160, justifyContent: 'center' },
  qrPlaceholderTxt: { fontSize: 9, color: '#555', textAlign: 'center', marginTop: 4 },

  // Footer
  footer:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: 20 },
  footerTxt:     { fontSize: 10, color: C.textDim },
  footerTxt2:    { fontSize: 9, color: C.border, textAlign: 'center', marginTop: 3 },

  // Device activation modal
  modalOverlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  activationCard:{ width: '100%', maxWidth: 380, backgroundColor: '#fff', borderRadius: 22, padding: 26, alignItems: 'center' },
  actIconWrap:   { width: 70, height: 70, borderRadius: 18, backgroundColor: '#dcfce7', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  actTitle:      { fontSize: 22, fontWeight: '800', color: '#111827', marginBottom: 8, textAlign: 'center' },
  actSub:        { fontSize: 13, color: '#6b7280', textAlign: 'center', lineHeight: 20, marginBottom: 18 },
  actInpWrap:    { width: '100%', flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 10, backgroundColor: '#f9fafb' },
  actInp:        { flex: 1, fontSize: 14, color: '#111', paddingHorizontal: 14, paddingVertical: 12 },
  actBtn:        { width: '100%', backgroundColor: '#16a34a', borderRadius: 12, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  actBtnTxt:     { color: '#fff', fontWeight: '800', fontSize: 15 },
  countdown:     { fontSize: 12, color: '#6b7280', marginTop: 6, marginBottom: 10, textAlign: 'center' },
  bgRow:         { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  bgTxt:         { fontSize: 12, color: '#16a34a', fontStyle: 'italic' },
  noticeBox:     { flexDirection: 'row', gap: 10, backgroundColor: '#eff6ff', borderRadius: 12, padding: 14, marginTop: 14, borderWidth: 1, borderColor: '#bfdbfe', alignItems: 'flex-start', width: '100%' },
  noticeIcon:    { fontSize: 16, color: '#2563eb' },
  noticeTxt:     { flex: 1, fontSize: 12, color: '#1d4ed8', lineHeight: 18 },
})
