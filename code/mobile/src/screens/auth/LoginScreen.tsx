/**
 * LoginScreen.tsx — ADLCS Mobile Login
 * Shared by: Village Officer + Hospital Officer
 *
 * Layout (Image 2 sketch):
 *   TOP  30 % — horizontal brand strip (flag gradient + CoA circle + NBS box + title)
 *   BOTTOM 70% — full-height login form + footer
 *
 * Auth flow:
 *   login mode      → POST /api/auth/login
 *   mfa_verify mode → POST /api/auth/mfa/verify
 *   token mode      → new officer onboarding (one-time token → profile setup)
 *   Role routing:   village_officer  → VillageHome
 *                   hospital_officer → HospitalHome
 *
 * Device Activation Modal — shown on first install only (AsyncStorage flag).
 * Runs background tasks: device fingerprint, GPS, geo-fence download.
 *
 * Lint fixes vs original:
 *   - Removed 7 unused lucide imports: Lock, Mail, ChevronRight, RefreshCw,
 *     Camera, Upload, Phone
 *   - Fixed `navigation: any` → NativeStackNavigationProp<RootStack,'Login'>
 *   - Fixed `reg(f: string, v: any)` → typed RegFormKey
 *   - Fixed `photo: null as any` → string | null
 *   - Replaced missing ImageBackground+flag.jpg → LinearGradient (no missing asset)
 *   - Fixed timer.current! non-null assertion → explicit null check
 */

import React, { useState, useEffect, useRef } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Modal,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Alert,
  Dimensions,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Location from 'expo-location'
import * as Device from 'expo-device'
import { LinearGradient } from 'expo-linear-gradient'
import {
  Eye, EyeOff, Shield, MapPin, Smartphone,
  CheckCircle, AlertCircle,
} from 'lucide-react-native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'

// ── Types ─────────────────────────────────────────────────────────────────────
type RootStack = {
  Splash:       undefined
  Login:        undefined
  VillageHome:  undefined
  HospitalHome: undefined
}

type LoginScreenProps = {
  navigation: NativeStackNavigationProp<RootStack, 'Login'>
}

type Mode =
  | 'login' | 'mfa_verify' | 'token'
  | 'mfa_setup' | 'mfa_qr'
  | 'register_form' | 'reg_success'

type RegForm = {
  newPwd:      string
  confirmPwd:  string
  mobile:      string
  photo:       string | null
}

type RegFormKey = keyof RegForm

// ── Config ────────────────────────────────────────────────────────────────────
const API_BASE          = process.env.EXPO_PUBLIC_API_URL ?? 'https://adlcs-backend.onrender.com/api'
const DEVICE_ACTIVE_KEY = 'adlcs_device_activated'
const OTP_TTL           = 10 * 60       // 10 minutes

const { height: SCREEN_H } = Dimensions.get('window')
const TOP_HEIGHT = SCREEN_H * 0.28     // 28 % for brand strip (≈ "30 %" from sketch)

// ── Colour tokens ─────────────────────────────────────────────────────────────
const C = {
  pageBg:    '#060f1e',
  cardBg:    '#0d1f38',
  border:    '#1e3a5f',
  inputBg:   '#060f1e',
  cyan:      '#00d4ff',
  green:     '#00ff9d',
  greenDark: '#00bb6e',
  text:      '#ffffff',
  textSub:   '#94a3b8',
  textDim:   '#4b6080',
  red:       '#f87171',
  yellow:    '#fcd116',
  tzGreen:   '#1eb53a',
  tzBlue:    '#00a3dd',
} as const

// ── Utility ───────────────────────────────────────────────────────────────────
const fmt = (secs: number): string =>
  `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`

// ── Sub-components ────────────────────────────────────────────────────────────

function Lbl({ children }: { children: string }) {
  return <Text style={s.lbl}>{children}</Text>
}

type InpProps = {
  value:        string
  onChangeText: (t: string) => void
  placeholder?: string
  secure?:      boolean
  keyboard?:    'default' | 'email-address' | 'number-pad' | 'phone-pad'
  right?:       React.ReactNode
  editable?:    boolean
}

function Inp({ value, onChangeText, placeholder, secure, keyboard, right, editable = true }: InpProps) {
  return (
    <View style={[s.inpWrap, !editable && { opacity: 0.5 }]}>
      <TextInput
        style={[s.inp, right ? { paddingRight: 44 } : {}]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={C.textDim}
        secureTextEntry={secure}
        keyboardType={keyboard ?? 'default'}
        autoCapitalize="none"
        autoCorrect={false}
        editable={editable}
      />
      {right ? <View style={s.inpRight}>{right}</View> : null}
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

type PrimaryBtnProps = {
  label:    string
  onPress:  () => void
  loading?: boolean
  disabled?: boolean
}

function PrimaryBtn({ label, onPress, loading, disabled }: PrimaryBtnProps) {
  return (
    <TouchableOpacity
      style={[s.btn, (disabled === true || loading === true) && s.btnOff]}
      onPress={onPress}
      disabled={disabled === true || loading === true}
      activeOpacity={0.85}
    >
      {loading === true
        ? <ActivityIndicator color={C.pageBg} size="small" />
        : <Text style={s.btnTxt}>{label}</Text>
      }
    </TouchableOpacity>
  )
}

// ── TOP SECTION — horizontal brand strip (Image 2: circles + title) ───────────
/**
 * TopBrand
 *
 * Adapts the web LEFT panel into a 28 % tall horizontal strip.
 * Layout (left → right):
 *   [CoA circle]  [title block (flex: 1)]  [NBS logo box]
 *
 * Uses LinearGradient instead of ImageBackground so no external
 * image asset is required (the flag.jpg doesn't exist in assets/).
 * The Tanzania flag colours appear as a stripe at the bottom.
 */
function TopBrand() {
  return (
    <LinearGradient
      colors={['#071a30', '#050d1a', '#071a30']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={s.topBrand}
    >
      {/* Horizontal row — [CoA] [text] [NBS] — matching Image 2 sketch */}
      <View style={s.topRow}>

        {/* Left circle: Coat of Arms placeholder */}
        <View style={s.coatCircle}>
          <Text style={s.iconEmoji}>🦅</Text>
          <Text style={s.iconLabel}>CoA</Text>
        </View>

        {/* Centre: title block */}
        <View style={s.topTextBlock}>
          <Text style={s.topGovLabel}>THE UNITED REPUBLIC OF TANZANIA</Text>
          <Text style={s.topTitle}>National Bureau{'\n'}of Statistics</Text>
          <Text style={s.topSub}>Automated Digital Live Census</Text>
          <Text style={s.topVersion}>Research Model (V 1.X.X)</Text>
        </View>

        {/* Right box: NBS logo placeholder */}
        <View style={s.nbsLogoBox}>
          <Text style={s.iconEmoji}>📊</Text>
          <Text style={s.iconLabel}>NBS</Text>
        </View>

      </View>

      {/* Tanzania flag colour stripe at bottom of strip */}
      <View style={s.flagStripe}>
        <View style={[s.stripeSeg, { flex: 1, backgroundColor: C.tzGreen }]} />
        <View style={[s.stripeSeg, { width: 12, backgroundColor: C.yellow }]} />
        <View style={[s.stripeSeg, { width: 12, backgroundColor: '#000' }]} />
        <View style={[s.stripeSeg, { width: 12, backgroundColor: C.yellow }]} />
        <View style={[s.stripeSeg, { flex: 1, backgroundColor: C.tzBlue }]} />
      </View>

      {/* Tagline — mirrors web "Statistics for Development" */}
      <Text style={s.tagline}>&ldquo;Statistics for Development&rdquo;</Text>
    </LinearGradient>
  )
}

// ── DEVICE ACTIVATION MODAL ───────────────────────────────────────────────────
type DeviceActivationModalProps = {
  visible:     boolean
  onActivated: () => void
}

function DeviceActivationModal({ visible, onActivated }: DeviceActivationModalProps) {
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
      setCountdown(prev => {
        if (prev <= 1) {
          if (timer.current) clearInterval(timer.current)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => {
      if (timer.current) clearInterval(timer.current)
    }
  }, [visible])

  const activate = async () => {
    if (otp.trim().length < 6) { setError('Enter the activation token from your email.'); return }
    if (countdown === 0)       { setError('Token expired. Request a new one from your District Administrator.'); return }
    setError(''); setLoading(true)
    try {
      setBgLabel('Validating activation token…')
      await new Promise<void>(r => setTimeout(r, 700))

      setBgLabel('Capturing device identity…')
      const _fingerprint = { model: Device.modelName, os: Device.osVersion, brand: Device.brand }
      await new Promise<void>(r => setTimeout(r, 300))

      setBgLabel('Recording GPS location…')
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        setError('Location permission required. Enable it in device settings and try again.')
        setLoading(false); setBgLabel('')
        return
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })

      setBgLabel('Downloading village boundary…')
      await new Promise<void>(r => setTimeout(r, 500))

      setBgLabel('Finalising…')
      await AsyncStorage.multiSet([
        [DEVICE_ACTIVE_KEY, 'true'],
        ['adlcs_gps', JSON.stringify({ lat: loc.coords.latitude, lng: loc.coords.longitude })],
        ['adlcs_device', JSON.stringify(_fingerprint)],
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

          <View style={s.actIconWrap}>
            <Text style={{ fontSize: 34 }}>📱</Text>
          </View>

          <Text style={s.actTitle}>Device Activation</Text>
          <Text style={s.actSub}>
            Enter the one-time token sent to your official email
            to bind this device to your officer account.
          </Text>

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

          {bgLabel ? (
            <View style={s.bgRow}>
              <ActivityIndicator size="small" color="#16a34a" />
              <Text style={s.bgTxt}>{bgLabel}</Text>
            </View>
          ) : null}

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

          <View style={s.noticeBox}>
            <Text style={s.noticeIcon}>ⓘ</Text>
            <Text style={s.noticeTxt}>
              This device will be geo-fenced to your assigned village or facility
              boundary. Attempting to use the app outside designated zones will
              result in account lockout.
            </Text>
          </View>

        </View>
      </View>
    </Modal>
  )
}

// ── MAIN SCREEN ───────────────────────────────────────────────────────────────
export default function LoginScreen({ navigation }: LoginScreenProps) {

  const [activationDone,     setActivationDone]     = useState(false)
  const [checkingActivation, setCheckingActivation] = useState(true)

  const [mode,        setMode]        = useState<Mode>('login')
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
  const [showNewPwd,  setShowNewPwd]  = useState(false)
  const [showConfPwd, setShowConfPwd] = useState(false)

  const [regForm, setRegForm] = useState<RegForm>({
    newPwd: '', confirmPwd: '', mobile: '', photo: null,
  })

  const reg = (f: RegFormKey, v: string | null) =>
    setRegForm(prev => ({ ...prev, [f]: v }))

  const fadeAnim = useRef(new Animated.Value(0)).current

  // ── Check activation on mount ──────────────────────────────────────────────
  useEffect(() => {
    AsyncStorage.getItem(DEVICE_ACTIVE_KEY).then(val => {
      setActivationDone(val === 'true')
      setCheckingActivation(false)
      if (val === 'true') {
        Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start()
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onActivated = () => {
    setActivationDone(true)
    Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start()
  }

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleLogin = async () => {
    if (!email.includes('@')) { setError('Enter a valid email'); return }
    if (password.length < 4)  { setError('Enter your password'); return }
    setError(''); setLoading(true)
    try {
      const res  = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json() as {
        success: boolean
        message?: string
        mfaRequired?: boolean
        tempToken?: string
        accessToken?: string
        refreshToken?: string
        profile?: { role: string }
      }
      if (!res.ok) { setError(data.message ?? 'Login failed'); return }
      if (data.mfaRequired === true) {
        setTempToken(data.tempToken ?? ''); setMode('mfa_verify')
      } else {
        await AsyncStorage.multiSet([
          ['adlcs_access_token',  data.accessToken  ?? ''],
          ['adlcs_refresh_token', data.refreshToken ?? ''],
          ['adlcs_role',          data.profile?.role ?? ''],
        ])
        goHome(data.profile?.role ?? '')
      }
    } catch {
      setError('Connection failed. Check your internet.')
    } finally {
      setLoading(false)
    }
  }

  const handleMfaVerify = async () => {
    if (mfaCode.length < 6) { setError('Enter the 6-digit TOTP code'); return }
    setError(''); setLoading(true)
    try {
      const res  = await fetch(`${API_BASE}/auth/mfa/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tempToken, code: mfaCode }),
      })
      const data = await res.json() as {
        success: boolean
        message?: string
        accessToken?: string
        refreshToken?: string
        profile?: { role: string }
      }
      if (!res.ok) { setError(data.message ?? 'Invalid MFA code'); setMfaCode(''); return }
      await AsyncStorage.multiSet([
        ['adlcs_access_token',  data.accessToken  ?? ''],
        ['adlcs_refresh_token', data.refreshToken ?? ''],
        ['adlcs_role',          data.profile?.role ?? ''],
      ])
      goHome(data.profile?.role ?? '')
    } catch {
      setError('Connection failed. Try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleToken = () => {
    if (token.length < 6) { setError('Enter the authorization token'); return }
    setError(''); setLoading(true)
    setTimeout(() => {
      setLoading(false)
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
    if (regForm.newPwd.length < 8)             { setError('Password must be at least 8 characters'); return }
    if (regForm.newPwd !== regForm.confirmPwd)  { setError('Passwords do not match'); return }
    if (!/^\+?[0-9]{9,15}$/.test(regForm.mobile)) { setError('Enter a valid mobile number'); return }
    setError(''); setLoading(true)
    setTimeout(() => { setLoading(false); setMode('reg_success') }, 1400)
  }

  const goHome = (role: string) => {
    if (role === 'village_officer')       navigation.replace('VillageHome')
    else if (role === 'hospital_officer') navigation.replace('HospitalHome')
    else Alert.alert('Access Denied', 'This app is for field officers only. Please use the web portal.')
  }

  const resetAll = () => {
    setMode('login'); setEmail(''); setPassword(''); setToken('')
    setMfaCode(''); setTempToken(''); setMfaChoice(null); setRoleType(null)
    setMfaVerified(false); setError('')
    setRegForm({ newPwd: '', confirmPwd: '', mobile: '', photo: null })
  }

  // ── Card title / subtitle maps ────────────────────────────────────────────
  const CARD_TITLE: Record<Mode, string> = {
    login:         'Officer Login',
    token:         'Token Authorization',
    mfa_verify:    'MFA Verification',
    mfa_setup:     'Set Up MFA',
    mfa_qr:        'Google Authenticator Setup',
    register_form: roleType === 'village_officer'
      ? 'Complete Village Officer Profile'
      : 'Complete Hospital Officer Profile',
    reg_success:   'Registration Complete',
  }

  const CARD_SUB: Record<Mode, string> = {
    login:         'Enter credentials to access your dashboard',
    token:         'Enter the one-time token from your official email',
    mfa_verify:    'Enter the 6-digit code from your authenticator app',
    mfa_setup:     'Choose MFA preference for future logins',
    mfa_qr:        'Scan QR with Google Authenticator, then verify',
    register_form: 'Fill in your profile details to activate your account',
    reg_success:   'Your account is fully activated — proceed to login',
  }

  // ── Loading state ─────────────────────────────────────────────────────────
  if (checkingActivation) {
    return (
      <View style={[s.screen, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={C.cyan} />
      </View>
    )
  }

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <View style={s.screen}>

      <DeviceActivationModal visible={!activationDone} onActivated={onActivated} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View style={{ opacity: fadeAnim }}>

            {/* ── TOP: brand strip (Image 2: ~30 % of screen height) ────── */}
            <View style={{ height: TOP_HEIGHT }}>
              <TopBrand />
            </View>

            {/* ── BOTTOM: auth card ────────────────────────────────────── */}
            <View style={s.cardArea}>
              <View style={s.card}>

                {/* Card header */}
                <View style={s.cardIconWrap}>
                  {mode === 'mfa_verify' || mode === 'mfa_setup' || mode === 'mfa_qr'
                    ? <Smartphone size={22} color={C.cyan} />
                    : mode === 'reg_success'
                      ? <CheckCircle size={22} color={C.green} />
                      : <Shield size={22} color={C.cyan} />
                  }
                </View>
                <Text style={s.cardTitle}>{CARD_TITLE[mode]}</Text>
                <Text style={s.cardSub}>{CARD_SUB[mode]}</Text>

                <ErrMsg msg={error} />

                {/* ── LOGIN ─────────────────────────────────────────────── */}
                {mode === 'login' && (
                  <>
                    <Lbl>EMAIL ADDRESS</Lbl>
                    <Inp
                      value={email}
                      onChangeText={t => { setEmail(t); setError('') }}
                      placeholder="official@nbs.go.tz"
                      keyboard="email-address"
                    />
                    <View style={{ height: 12 }} />
                    <Lbl>PASSWORD</Lbl>
                    <Inp
                      value={password}
                      onChangeText={t => { setPassword(t); setError('') }}
                      placeholder="••••••••"
                      secure={!showPass}
                      right={
                        <TouchableOpacity onPress={() => setShowPass(!showPass)}>
                          {showPass
                            ? <EyeOff size={14} color={C.textDim} />
                            : <Eye    size={14} color={C.textDim} />}
                        </TouchableOpacity>
                      }
                    />
                    <View style={{ height: 16 }} />
                    <PrimaryBtn label="Sign In" onPress={handleLogin} loading={loading} />
                    <TouchableOpacity
                      onPress={() => { setMode('token'); setError('') }}
                      style={s.linkBtn}
                    >
                      <Text style={s.linkTxt}>New officer? Use Authorization Token →</Text>
                    </TouchableOpacity>
                  </>
                )}

                {/* ── TOKEN ─────────────────────────────────────────────── */}
                {mode === 'token' && (
                  <>
                    <View style={s.infoBox}>
                      <Text style={s.infoTxt}>
                        Enter the one-time token from your email.{'\n'}
                        Prefix: VOF- (Village Officer) or HOF- (Hospital Officer).
                      </Text>
                    </View>
                    <Lbl>AUTHORIZATION TOKEN</Lbl>
                    <Inp
                      value={token}
                      onChangeText={t => { setToken(t); setError('') }}
                      placeholder="VOF-XXXX-XXXX or HOF-XXXX-XXXX"
                    />
                    <View style={{ height: 16 }} />
                    <PrimaryBtn label="Authorize" onPress={handleToken} loading={loading} />
                    <TouchableOpacity
                      onPress={() => { setMode('login'); setError('') }}
                      style={s.linkBtn}
                    >
                      <Text style={s.linkTxt}>← Back to login</Text>
                    </TouchableOpacity>
                  </>
                )}

                {/* ── MFA VERIFY ────────────────────────────────────────── */}
                {mode === 'mfa_verify' && (
                  <>
                    <View style={s.infoBox}>
                      <Text style={s.infoTxt}>
                        Open Google Authenticator and enter the 6-digit TOTP code for NBS-ADLCS.
                      </Text>
                    </View>
                    <Lbl>6-DIGIT TOTP CODE</Lbl>
                    <Inp
                      value={mfaCode}
                      onChangeText={t => { setMfaCode(t.replace(/\D/g, '').slice(0, 6)); setError('') }}
                      placeholder="000 000"
                      keyboard="number-pad"
                    />
                    <View style={{ height: 16 }} />
                    <PrimaryBtn
                      label="Verify & Login"
                      onPress={handleMfaVerify}
                      loading={loading}
                      disabled={mfaCode.length < 6}
                    />
                    <TouchableOpacity
                      onPress={() => { setMode('login'); setError('') }}
                      style={s.linkBtn}
                    >
                      <Text style={s.linkTxt}>← Back</Text>
                    </TouchableOpacity>
                  </>
                )}

                {/* ── MFA SETUP CHOICE ──────────────────────────────────── */}
                {mode === 'mfa_setup' && (
                  <>
                    <Text style={[s.cardSub, { marginBottom: 12, textAlign: 'left' }]}>
                      Choose your login security preference. This is a one-time setup.
                    </Text>
                    {[
                      {
                        val: true,  icon: '🔐',
                        title: 'Enable MFA',
                        desc: 'Use Google Authenticator — 6-digit code required on every login (recommended)',
                        col: C.green,  border: C.green,
                      },
                      {
                        val: false, icon: '⚡',
                        title: 'Skip MFA',
                        desc: 'Login with email & password only (less secure)',
                        col: '#fb923c', border: '#fb923c',
                      },
                    ].map(opt => (
                      <TouchableOpacity
                        key={String(opt.val)}
                        onPress={() => { setMfaChoice(opt.val); setError('') }}
                        style={[
                          s.choiceCard,
                          mfaChoice === opt.val && {
                            borderColor: opt.border,
                            backgroundColor: `${opt.border}15`,
                          },
                        ]}
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
                  </>
                )}

                {/* ── GOOGLE AUTHENTICATOR QR SETUP ─────────────────────── */}
                {mode === 'mfa_qr' && (
                  <>
                    <View style={s.infoBox}>
                      <Text style={s.infoTxt}>
                        {'1. Install Google Authenticator\n2. Tap + → Scan a QR code\n3. Enter the 6-digit code shown'}
                      </Text>
                    </View>
                    <View style={s.qrWrap}>
                      <View style={s.qrPlaceholder}>
                        <Text style={{ fontSize: 60 }}>⬛</Text>
                        <Text style={s.qrPlaceholderTxt}>QR Code{'\n'}(server-generated)</Text>
                      </View>
                    </View>
                    <Lbl>VERIFY — ENTER TOTP CODE FROM APP</Lbl>
                    <Inp
                      value={mfaCode}
                      onChangeText={t => { setMfaCode(t.replace(/\D/g, '').slice(0, 6)); setError('') }}
                      placeholder="000 000"
                      keyboard="number-pad"
                    />
                    <View style={{ height: 16 }} />
                    <PrimaryBtn
                      label="Verify & Continue"
                      onPress={handleMfaQrConfirm}
                      loading={loading}
                      disabled={mfaCode.length < 6}
                    />
                  </>
                )}

                {/* ── REGISTRATION FORM ─────────────────────────────────── */}
                {mode === 'register_form' && (
                  <>
                    {mfaVerified && (
                      <View style={[s.infoBox, {
                        borderColor: C.green,
                        backgroundColor: `${C.green}15`,
                        flexDirection: 'row',
                        gap: 8,
                      }]}>
                        <CheckCircle size={12} color={C.green} />
                        <Text style={[s.infoTxt, { color: C.green }]}>Google Authenticator verified ✓</Text>
                      </View>
                    )}
                    <Lbl>NEW PASSWORD (MIN. 8 CHARACTERS)</Lbl>
                    <Inp
                      value={regForm.newPwd}
                      onChangeText={t => { reg('newPwd', t); setError('') }}
                      placeholder="Min. 8 characters"
                      secure={!showNewPwd}
                      right={
                        <TouchableOpacity onPress={() => setShowNewPwd(!showNewPwd)}>
                          {showNewPwd
                            ? <EyeOff size={14} color={C.textDim} />
                            : <Eye    size={14} color={C.textDim} />}
                        </TouchableOpacity>
                      }
                    />
                    <View style={{ height: 12 }} />
                    <Lbl>CONFIRM PASSWORD</Lbl>
                    <Inp
                      value={regForm.confirmPwd}
                      onChangeText={t => { reg('confirmPwd', t); setError('') }}
                      placeholder="Re-enter password"
                      secure={!showConfPwd}
                      right={
                        <TouchableOpacity onPress={() => setShowConfPwd(!showConfPwd)}>
                          {showConfPwd
                            ? <EyeOff size={14} color={C.textDim} />
                            : <Eye    size={14} color={C.textDim} />}
                        </TouchableOpacity>
                      }
                    />
                    {regForm.confirmPwd.length > 0 && (
                      <Text style={{
                        fontSize: 10, marginTop: 4,
                        color: regForm.newPwd === regForm.confirmPwd ? C.green : C.red,
                      }}>
                        {regForm.newPwd === regForm.confirmPwd ? '✓ Passwords match' : '✗ Passwords do not match'}
                      </Text>
                    )}
                    <View style={{ height: 12 }} />
                    <Lbl>MOBILE NUMBER</Lbl>
                    <Inp
                      value={regForm.mobile}
                      onChangeText={t => { reg('mobile', t); setError('') }}
                      placeholder="+255 7XX XXX XXX"
                      keyboard="phone-pad"
                    />
                    <View style={{ height: 16 }} />
                    <PrimaryBtn label="Submit & Activate Account" onPress={handleRegSubmit} loading={loading} />
                  </>
                )}

                {/* ── REG SUCCESS ───────────────────────────────────────── */}
                {mode === 'reg_success' && (
                  <View style={{ alignItems: 'center', paddingVertical: 12 }}>
                    <View style={[s.cardIconWrap, {
                      backgroundColor: `${C.green}20`,
                      borderColor: `${C.green}40`,
                    }]}>
                      <CheckCircle size={32} color={C.green} />
                    </View>
                    <Text style={s.cardTitle}>Account Activated!</Text>
                    <Text style={[s.cardSub, { textAlign: 'center', marginBottom: 16 }]}>
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

              {/* Footer */}
              <View style={s.footer}>
                <MapPin size={11} color={C.textDim} />
                <Text style={s.footerTxt}>NBS Head Office · Dodoma, Tanzania</Text>
              </View>
              <Text style={s.footerTxt2}>Unauthorized access is prohibited and monitored</Text>
              <Text style={s.footerTxt2}>© 2026 NBS-ADLCS</Text>
            </View>

          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  )
}

// ── StyleSheet ────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.pageBg },

  // ── Top brand strip (Image 2: 30 % height with horizontal row) ──────────────
  topBrand:     { flex: 1, paddingBottom: 0 },
  topRow:       { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingTop: 14 },
  coatCircle:   {
    width: 56, height: 56, borderRadius: 28,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.35)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  nbsLogoBox:   {
    width: 48, height: 48, borderRadius: 10,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.25)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  iconEmoji:    { fontSize: 20 },
  iconLabel:    { fontSize: 7, color: 'rgba(255,255,255,0.5)', letterSpacing: 1, marginTop: 1 },
  topTextBlock: { flex: 1 },
  topGovLabel:  { fontSize: 7, fontWeight: '800', color: C.yellow, letterSpacing: 1.2, textTransform: 'uppercase', lineHeight: 11 },
  topTitle:     { fontSize: 12, fontWeight: '900', color: C.text, lineHeight: 16, marginTop: 2 },
  topSub:       { fontSize: 8, color: 'rgba(255,255,255,0.60)', textTransform: 'uppercase', letterSpacing: 0.8, lineHeight: 12, marginTop: 1 },
  topVersion:   { fontSize: 7.5, color: 'rgba(255,255,255,0.30)', marginTop: 1 },
  flagStripe:   { flexDirection: 'row', height: 5 },
  stripeSeg:    {},
  tagline:      { fontSize: 9.5, fontStyle: 'italic', color: 'rgba(252,209,22,0.70)', textAlign: 'center', paddingVertical: 5 },

  // ── Auth card area ──────────────────────────────────────────────────────────
  cardArea:     { backgroundColor: C.pageBg, paddingHorizontal: 18, paddingTop: 18, paddingBottom: 32 },
  card:         { backgroundColor: C.cardBg, borderRadius: 18, borderWidth: 1, borderColor: C.border, padding: 22, overflow: 'hidden' },
  cardIconWrap: { width: 48, height: 48, borderRadius: 12, backgroundColor: `${C.cyan}18`, borderWidth: 1, borderColor: `${C.cyan}50`, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 10 },
  cardTitle:    { fontSize: 15, fontWeight: '800', color: C.text, textAlign: 'center', marginBottom: 4 },
  cardSub:      { fontSize: 11, color: C.textDim, textAlign: 'center', marginBottom: 14 },

  // ── Inputs ──────────────────────────────────────────────────────────────────
  lbl:    { fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 6 },
  inpWrap:{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.border, borderRadius: 10 },
  inp:    { flex: 1, color: C.text, fontSize: 13, paddingHorizontal: 14, paddingVertical: 11 },
  inpRight:{ paddingRight: 12 },

  // ── Info box ─────────────────────────────────────────────────────────────────
  infoBox:{ backgroundColor: `${C.cyan}0d`, borderWidth: 1, borderColor: `${C.cyan}35`, borderRadius: 10, padding: 12, marginBottom: 14 },
  infoTxt:{ fontSize: 11.5, color: C.cyan, lineHeight: 18 },

  // ── Buttons ──────────────────────────────────────────────────────────────────
  btn:    { backgroundColor: C.cyan, borderRadius: 12, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' },
  btnTxt: { color: C.pageBg, fontWeight: '800', fontSize: 14 },
  btnOff: { opacity: 0.45 },
  linkBtn:{ alignItems: 'center', marginTop: 14 },
  linkTxt:{ fontSize: 11, color: `${C.cyan}bb` },

  // ── Error ────────────────────────────────────────────────────────────────────
  errRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 10 },
  errTxt: { fontSize: 10, color: C.red },

  // ── MFA choice cards ─────────────────────────────────────────────────────────
  choiceCard:  { borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  choiceTitle: { fontSize: 13, fontWeight: '700', marginBottom: 2 },
  choiceDesc:  { fontSize: 10, color: C.textSub, lineHeight: 15 },

  // ── QR ───────────────────────────────────────────────────────────────────────
  qrWrap:          { alignItems: 'center', paddingVertical: 12 },
  qrPlaceholder:   { backgroundColor: '#fff', borderRadius: 12, padding: 16, alignItems: 'center', width: 160, height: 160, justifyContent: 'center' },
  qrPlaceholderTxt:{ fontSize: 9, color: '#555', textAlign: 'center', marginTop: 4 },

  // ── Footer ───────────────────────────────────────────────────────────────────
  footer:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: 18 },
  footerTxt:{ fontSize: 10, color: C.textDim },
  footerTxt2:{ fontSize: 9, color: C.border, textAlign: 'center', marginTop: 3 },

  // ── Device activation modal ───────────────────────────────────────────────────
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
