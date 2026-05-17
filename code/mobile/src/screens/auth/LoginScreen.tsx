/**
 * LoginScreen.tsx — ADLCS Mobile Authentication
 * Shared by: Village Officer + Hospital Officer
 *
 * ONBOARDING FLOW (new device / first install):
 *   1. OTP Authorization page  → officer enters one-time PIN from email
 *   2. Background tasks        → device fingerprint + GPS capture
 *      • village_officer  geofence radius = 1 km
 *      • hospital_officer geofence radius = 0.5 km
 *   3. Registration modal      → set password, confirm password, phone (+255)
 *   4. Submit → save to backend → redirect to login form
 *
 * RETURNING OFFICER FLOW:
 *   Login form (email + password) → MFA verify (if enabled) → Dashboard
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
  ImageBackground,
  Image,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Location from 'expo-location'
import * as Device from 'expo-device'
import { LinearGradient } from 'expo-linear-gradient'
import {
  Eye, EyeOff, Shield, MapPin, Smartphone,
  CheckCircle, AlertCircle, Lock, Key,
} from 'lucide-react-native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'

// ─── Types ────────────────────────────────────────────────────────────────────
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
  | 'otp_auth'        // NEW: step 1 for new device — OTP authorization
  | 'geo_processing'  // NEW: step 2 — fingerprint + GPS capture
  | 'register_form'   // step 3 — set password + phone
  | 'reg_success'     // registration done
  | 'login'           // returning officers
  | 'mfa_verify'      // MFA step

type RegForm = {
  newPwd:     string
  confirmPwd: string
  mobile:     string
}
type RegFormKey = keyof RegForm

// ─── Config ───────────────────────────────────────────────────────────────────
const API_BASE          = process.env.EXPO_PUBLIC_API_URL ?? 'https://adlcs-backend.onrender.com/api'
const DEVICE_ACTIVE_KEY = 'adlcs_device_activated'
const OTP_TTL           = 10 * 60   // 10 minutes

// Village = 1000 m, Hospital = 500 m geofence radius
const GEOFENCE_RADIUS: Record<string, number> = {
  village_officer:  1000,
  hospital_officer: 500,
}

const { height: SCREEN_H, width: SCREEN_W } = Dimensions.get('window')

// ─── Tanzania colours ─────────────────────────────────────────────────────────
const C = {
  pageBg:    '#060f1e',
  cardBg:    '#0d1f38',
  border:    '#1e3a5f',
  inputBg:   '#060f1e',
  cyan:      '#00d4ff',
  green:     '#1eb53a',
  greenDk:   '#0d8f2a',
  text:      '#ffffff',
  textSub:   '#94a3b8',
  textDim:   '#4b6080',
  red:       '#f87171',
  yellow:    '#fcd116',
  tzGreen:   '#1eb53a',
  tzBlue:    '#00a3dd',
  tzNavy:    '#003087',
  white:     '#ffffff',
} as const

const fmt = (secs: number) =>
  `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`

// ─── Small shared components ─────────────────────────────────────────────────
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
  left?:        React.ReactNode
  editable?:    boolean
}
function Inp({ value, onChangeText, placeholder, secure, keyboard, right, left, editable = true }: InpProps) {
  return (
    <View style={[s.inpWrap, !editable && { opacity: 0.5 }]}>
      {left ? <View style={s.inpLeft}>{left}</View> : null}
      <TextInput
        style={[s.inp, left ? { paddingLeft: 4 } : {}, right ? { paddingRight: 44 } : {}]}
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
      <AlertCircle size={11} color={C.red} />
      <Text style={s.errTxt}>{msg}</Text>
    </View>
  )
}

type PrimaryBtnProps = {
  label:     string
  onPress:   () => void
  loading?:  boolean
  disabled?: boolean
  color?:    string
}
function PrimaryBtn({ label, onPress, loading, disabled, color }: PrimaryBtnProps) {
  return (
    <TouchableOpacity
      style={[s.btn, { backgroundColor: color ?? C.tzGreen }, (disabled || loading) && s.btnOff]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
    >
      {loading
        ? <ActivityIndicator color="#fff" size="small" />
        : <Text style={s.btnTxt}>{label}</Text>
      }
    </TouchableOpacity>
  )
}

// ─── TOP BRAND STRIP ──────────────────────────────────────────────────────────
function TopBrand() {
  return (
    <ImageBackground
      source={require('../../../public/assets/flag.jpg')}
      style={s.topBrand}
      blurRadius={4}
      resizeMode="cover"
    >
      {/* Dark overlay for readability */}
      <LinearGradient
        colors={['rgba(0,30,80,0.88)', 'rgba(3,50,100,0.82)']}
        style={StyleSheet.absoluteFill}
      />

      {/* Flag stripe at very top */}
      <View style={s.flagStripe}>
        <View style={{ flex: 3, backgroundColor: C.tzGreen }} />
        <View style={{ width: 10, backgroundColor: C.yellow }} />
        <View style={{ width: 8,  backgroundColor: '#000' }} />
        <View style={{ width: 10, backgroundColor: C.yellow }} />
        <View style={{ flex: 3, backgroundColor: C.tzBlue }} />
      </View>

      {/* Brand row */}
      <View style={s.topRow}>
        {/* NBS Logo */}
        <View style={s.nbsBox}>
          <Image
            source={require('../../../public/assets/longo_nbs.png')}
            style={{ width: 36, height: 36 }}
            resizeMode="contain"
            onError={() => {}}
          />
          <Text style={s.nbsLabel}>NBS</Text>
        </View>

        {/* Centre text */}
        <View style={s.topCenter}>
          <Text style={s.topGov}>THE UNITED REPUBLIC OF TANZANIA</Text>
          <Text style={s.topTitle}>NBS-CENSUS</Text>
          <View style={s.topDivider} />
          <Text style={s.topSub}>Census for Development</Text>
        </View>

        {/* Coat of arms placeholder */}
        <View style={s.coaBox}>
          <Image
            source={require('../../../public/assets/court_of_arm.png')}
            style={{ width: 36, height: 36 }}
            resizeMode="contain"
            onError={() => {}}
          />
          <Text style={s.coaLabel}>GoT</Text>
        </View>
      </View>

      <Text style={s.tagline}>&ldquo;Hali ya Watanzania kwa Takwimu&rdquo;</Text>
    </ImageBackground>
  )
}

// ─── STEP 1: OTP AUTHORIZATION (full-page, shown on new device) ───────────────
type OtpAuthProps = {
  onAuthorized: (role: string) => void
}

function OtpAuthPage({ onAuthorized }: OtpAuthProps) {
  const [otp,       setOtp]       = useState('')
  const [countdown, setCountdown] = useState(OTP_TTL)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    timer.current = setInterval(() => {
      setCountdown(p => {
        if (p <= 1) { if (timer.current) clearInterval(timer.current); return 0 }
        return p - 1
      })
    }, 1000)
    return () => { if (timer.current) clearInterval(timer.current) }
  }, [])

  const handleSubmit = async () => {
    if (otp.trim().length < 6) { setError('Enter the 6-character OTP from your email.'); return }
    if (countdown === 0)       { setError('OTP expired. Request a new one from your District Administrator.'); return }
    setError(''); setLoading(true)

    try {
      // Detect officer role from OTP prefix
      const upper = otp.trim().toUpperCase()
      const role  = upper.startsWith('HOF') ? 'hospital_officer' : 'village_officer'

      // Real implementation: POST /api/auth/validate-otp → { valid, role, officerId }
      await new Promise<void>(r => setTimeout(r, 900)) // simulate API call

      await AsyncStorage.setItem('adlcs_pending_role', role)
      setLoading(false)
      onAuthorized(role)
    } catch {
      setError('Validation failed. Check your connection.')
      setLoading(false)
    }
  }

  return (
    <View style={s.card}>
      {/* Icon */}
      <View style={[s.cardIconWrap, { borderColor: `${C.yellow}50`, backgroundColor: `${C.yellow}15` }]}>
        <Key size={22} color={C.yellow} />
      </View>

      <Text style={s.cardTitle}>Officer Authorization</Text>
      <Text style={s.cardSub}>
        Enter the one-time PIN sent to your official email to activate this device.
      </Text>

      <View style={[s.infoBox, { borderColor: `${C.tzBlue}40`, backgroundColor: `${C.tzBlue}10` }]}>
        <Text style={[s.infoTxt, { color: C.tzBlue }]}>
          Token prefix: <Text style={{ fontWeight: '800' }}>VOF-</Text> Village Officer {'\n'}
          Token prefix: <Text style={{ fontWeight: '800' }}>HOF-</Text> Hospital Officer
        </Text>
      </View>

      <ErrMsg msg={error} />

      <Lbl>ONE-TIME PIN (OTP)</Lbl>
      <Inp
        value={otp}
        onChangeText={t => { setOtp(t.toUpperCase()); setError('') }}
        placeholder="VOF-XXXX or HOF-XXXX"
        keyboard="default"
      />

      <Text style={[s.countdown < 120 && { color: C.red }]}>
        {countdown > 0
          ? `⏱ OTP expires in ${fmt(countdown)}`
          : '⚠ OTP expired — contact your District Administrator'}
      </Text>

      <View style={{ height: 14 }} />
      <PrimaryBtn
        label="Authorize Device →"
        onPress={handleSubmit}
        loading={loading}
        disabled={countdown === 0}
        color={C.tzNavy}
      />

      <View style={[s.noticeBox, { marginTop: 16 }]}>
        <Shield size={13} color={C.tzBlue} />
        <Text style={s.noticeTxt}>
          Your device will be geo-fenced to your assigned zone. Village officers:
          1 km radius. Hospital officers: 0.5 km radius. Operating outside this
          zone will lock your account.
        </Text>
      </View>
    </View>
  )
}

// ─── STEP 2: FINGERPRINT + GPS PROCESSING ────────────────────────────────────
type GeoProcessProps = {
  role:        string
  onComplete:  () => void
}

function GeoProcessingPage({ role, onComplete }: GeoProcessProps) {
  const [steps,   setSteps]   = useState<{ label: string; done: boolean }[]>([
    { label: 'Capturing device identity…',               done: false },
    { label: 'Requesting location permission…',          done: false },
    { label: `Setting geofence (${role === 'hospital_officer' ? '0.5 km' : '1 km'} radius)…`, done: false },
    { label: 'Registering device on server…',            done: false },
  ])
  const [error, setError] = useState('')

  const markDone = (i: number) =>
    setSteps(prev => prev.map((s, idx) => idx === i ? { ...s, done: true } : s))

  useEffect(() => { runActivation() }, [])

  const runActivation = async () => {
    try {
      // Step 0: device fingerprint
      await new Promise<void>(r => setTimeout(r, 600))
      const fingerprint = {
        model: Device.modelName,
        os:    Device.osVersion,
        brand: Device.brand,
        osName: Device.osName,
      }
      markDone(0)

      // Step 1: location permission
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        setError('Location permission is required. Enable it in Settings.')
        return
      }
      markDone(1)

      // Step 2: get GPS and set geofence radius
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
      const radius = GEOFENCE_RADIUS[role] ?? 1000
      markDone(2)

      // Step 3: save to AsyncStorage (real impl: POST to server)
      await new Promise<void>(r => setTimeout(r, 500))
      await AsyncStorage.multiSet([
        [DEVICE_ACTIVE_KEY,          'true'],
        ['adlcs_gps',                JSON.stringify({ lat: loc.coords.latitude, lng: loc.coords.longitude })],
        ['adlcs_device',             JSON.stringify(fingerprint)],
        ['adlcs_geofence_radius_m',  String(radius)],
        ['adlcs_pending_role',       role],
      ])
      markDone(3)

      setTimeout(onComplete, 400)
    } catch {
      setError('Device registration failed. Check your connection and try again.')
    }
  }

  return (
    <View style={s.card}>
      <View style={[s.cardIconWrap, { borderColor: `${C.tzGreen}50`, backgroundColor: `${C.tzGreen}15` }]}>
        <MapPin size={22} color={C.tzGreen} />
      </View>
      <Text style={s.cardTitle}>Device Registration</Text>
      <Text style={s.cardSub}>Binding this device to your officer account. Please wait…</Text>

      <View style={{ width: '100%', gap: 10, marginTop: 8 }}>
        {steps.map((step, i) => (
          <View key={i} style={s.stepRow}>
            {step.done
              ? <CheckCircle size={16} color={C.tzGreen} />
              : <ActivityIndicator size="small" color={C.cyan} />
            }
            <Text style={[s.stepTxt, step.done && { color: C.tzGreen }]}>{step.label}</Text>
          </View>
        ))}
      </View>

      {error ? (
        <View style={[s.errRow, { marginTop: 16 }]}>
          <AlertCircle size={11} color={C.red} />
          <Text style={s.errTxt}>{error}</Text>
        </View>
      ) : null}
    </View>
  )
}

// ─── STEP 3: REGISTRATION FORM MODAL ─────────────────────────────────────────
type RegModalProps = {
  visible:  boolean
  role:     string
  onDone:   () => void
}

function RegistrationModal({ visible, role, onDone }: RegModalProps) {
  const [form,       setForm]       = useState<RegForm>({ newPwd: '', confirmPwd: '', mobile: '' })
  const [showPwd,    setShowPwd]    = useState(false)
  const [showCPwd,   setShowCPwd]   = useState(false)
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState('')

  const reg = (f: RegFormKey, v: string) => setForm(p => ({ ...p, [f]: v }))

  const handleSubmit = async () => {
    if (form.newPwd.length < 8)                          { setError('Password must be at least 8 characters.'); return }
    if (form.newPwd !== form.confirmPwd)                 { setError('Passwords do not match.'); return }
    const rawMobile = form.mobile.trim().replace(/\s/g, '')
    if (!/^\d{9}$/.test(rawMobile))                     { setError('Enter a valid 9-digit mobile number (after +255).'); return }

    setError(''); setLoading(true)
    try {
      // Real impl: POST /api/auth/complete-registration
      // Body: { password: form.newPwd, mobile: '+255' + rawMobile, role }
      await new Promise<void>(r => setTimeout(r, 1400))
      setLoading(false)
      onDone()
    } catch {
      setError('Registration failed. Check your connection.')
      setLoading(false)
    }
  }

  const isHospital = role === 'hospital_officer'

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={s.modalOverlay}>
          <View style={s.regCard}>

            {/* Top colour bar */}
            <LinearGradient
              colors={isHospital
                ? ['#003087', '#fb923c']
                : ['#003087', '#1eb53a']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={s.regTopBar}
            />

            {/* Header */}
            <View style={s.regHeader}>
              <Text style={s.regTitle}>
                {isHospital ? '🏥 Hospital Officer' : '🌿 Village Officer'}
              </Text>
              <Text style={s.regSubtitle}>Complete your profile to activate your account</Text>
            </View>

            <ErrMsg msg={error} />

            {/* Password */}
            <Text style={s.regLbl}>NEW PASSWORD <Text style={{ color: C.red }}>*</Text></Text>
            <View style={s.regInpWrap}>
              <Lock size={14} color="#9ca3af" style={{ marginLeft: 12 }} />
              <TextInput
                style={s.regInp}
                value={form.newPwd}
                onChangeText={t => { reg('newPwd', t); setError('') }}
                placeholder="Minimum 8 characters"
                placeholderTextColor="#9ca3af"
                secureTextEntry={!showPwd}
                autoCapitalize="none"
              />
              <TouchableOpacity onPress={() => setShowPwd(!showPwd)} style={{ paddingRight: 12 }}>
                {showPwd ? <EyeOff size={15} color="#9ca3af" /> : <Eye size={15} color="#9ca3af" />}
              </TouchableOpacity>
            </View>

            {/* Confirm Password */}
            <Text style={[s.regLbl, { marginTop: 12 }]}>CONFIRM PASSWORD <Text style={{ color: C.red }}>*</Text></Text>
            <View style={s.regInpWrap}>
              <Lock size={14} color="#9ca3af" style={{ marginLeft: 12 }} />
              <TextInput
                style={s.regInp}
                value={form.confirmPwd}
                onChangeText={t => { reg('confirmPwd', t); setError('') }}
                placeholder="Re-enter password"
                placeholderTextColor="#9ca3af"
                secureTextEntry={!showCPwd}
                autoCapitalize="none"
              />
              <TouchableOpacity onPress={() => setShowCPwd(!showCPwd)} style={{ paddingRight: 12 }}>
                {showCPwd ? <EyeOff size={15} color="#9ca3af" /> : <Eye size={15} color="#9ca3af" />}
              </TouchableOpacity>
            </View>
            {form.confirmPwd.length > 0 && (
              <Text style={{ fontSize: 10, marginTop: 4,
                color: form.newPwd === form.confirmPwd ? '#16a34a' : '#ef4444' }}>
                {form.newPwd === form.confirmPwd ? '✓ Passwords match' : '✗ Passwords do not match'}
              </Text>
            )}

            {/* Phone Number with +255 prefix */}
            <Text style={[s.regLbl, { marginTop: 12 }]}>MOBILE NUMBER <Text style={{ color: C.red }}>*</Text></Text>
            <View style={s.regInpWrap}>
              {/* Fixed +255 prefix */}
              <View style={s.phonePrefixBox}>
                <Text style={s.phonePrefixText}>🇹🇿 +255</Text>
              </View>
              <View style={s.phoneDivider} />
              <TextInput
                style={[s.regInp, { flex: 1 }]}
                value={form.mobile}
                onChangeText={t => { reg('mobile', t.replace(/\D/g, '').slice(0, 9)); setError('') }}
                placeholder="7XX XXX XXX"
                placeholderTextColor="#9ca3af"
                keyboardType="number-pad"
                maxLength={9}
              />
            </View>
            <Text style={{ fontSize: 9, color: '#9ca3af', marginTop: 3 }}>
              Enter the 9 digits after the country code (+255)
            </Text>

            {/* Submit */}
            <TouchableOpacity
              style={[s.regBtn,
                { backgroundColor: isHospital ? '#fb923c' : '#1eb53a' },
                (loading) && { opacity: 0.6 }
              ]}
              onPress={handleSubmit}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.regBtnTxt}>Save & Activate Account</Text>
              }
            </TouchableOpacity>

            <Text style={s.regFooter}>
              Your credentials are encrypted and stored securely on NBS servers.
            </Text>

          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

// ─── MAIN SCREEN ──────────────────────────────────────────────────────────────
export default function LoginScreen({ navigation }: LoginScreenProps) {

  // Onboarding state (new device)
  const [onboardingStep,  setOnboardingStep]  = useState<
    'checking' | 'otp' | 'geo' | 'reg' | 'done'
  >('checking')
  const [pendingRole,     setPendingRole]     = useState('')
  const [showRegModal,    setShowRegModal]    = useState(false)

  // Login state (returning officers)
  const [email,       setEmail]       = useState('')
  const [password,    setPassword]    = useState('')
  const [showPass,    setShowPass]    = useState(false)
  const [mfaCode,     setMfaCode]     = useState('')
  const [tempToken,   setTempToken]   = useState('')
  const [loginMode,   setLoginMode]   = useState<'login' | 'mfa_verify'>('login')
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')

  const fadeAnim = useRef(new Animated.Value(0)).current

  // ── Check if device already activated ──────────────────────────────────────
  useEffect(() => {
    AsyncStorage.getItem(DEVICE_ACTIVE_KEY).then(val => {
      if (val === 'true') {
        setOnboardingStep('done')
        Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start()
      } else {
        setOnboardingStep('otp')
      }
    })
  }, [])

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleOtpAuthorized = (role: string) => {
    setPendingRole(role)
    setOnboardingStep('geo')
  }

  const handleGeoComplete = () => {
    setShowRegModal(true)
    setOnboardingStep('reg')
  }

  const handleRegDone = () => {
    setShowRegModal(false)
    setOnboardingStep('done')
    Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start()
  }

  const handleLogin = async () => {
    if (!email.includes('@')) { setError('Enter a valid email address'); return }
    if (password.length < 4)  { setError('Enter your password'); return }
    setError(''); setLoading(true)
    try {
      const res  = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json() as {
        success: boolean; message?: string
        mfaRequired?: boolean; tempToken?: string
        accessToken?: string; refreshToken?: string
        profile?: { role: string; full_name?: string; employee_id?: string }
      }
      if (!res.ok) { setError(data.message ?? 'Login failed'); return }
      if (data.mfaRequired) {
        setTempToken(data.tempToken ?? ''); setLoginMode('mfa_verify')
      } else {
        await AsyncStorage.multiSet([
          ['adlcs_access_token',  data.accessToken  ?? ''],
          ['adlcs_refresh_token', data.refreshToken ?? ''],
          ['adlcs_role',          data.profile?.role ?? ''],
          ['adlcs_officer_name',  data.profile?.full_name ?? 'Officer'],
          ['adlcs_employee_id',   data.profile?.employee_id ?? 'EMP-000'],
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
        success: boolean; message?: string
        accessToken?: string; refreshToken?: string
        profile?: { role: string; full_name?: string; employee_id?: string }
      }
      if (!res.ok) { setError(data.message ?? 'Invalid MFA code'); setMfaCode(''); return }
      await AsyncStorage.multiSet([
        ['adlcs_access_token',  data.accessToken  ?? ''],
        ['adlcs_refresh_token', data.refreshToken ?? ''],
        ['adlcs_role',          data.profile?.role ?? ''],
        ['adlcs_officer_name',  data.profile?.full_name ?? 'Officer'],
        ['adlcs_employee_id',   data.profile?.employee_id ?? 'EMP-000'],
      ])
      goHome(data.profile?.role ?? '')
    } catch {
      setError('Connection failed. Try again.')
    } finally {
      setLoading(false)
    }
  }

  const goHome = (role: string) => {
    if (role === 'village_officer')       navigation.replace('VillageHome')
    else if (role === 'hospital_officer') navigation.replace('HospitalHome')
    else Alert.alert('Access Denied', 'This app is for field officers only. Use the web portal.')
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER — LOADING CHECK
  if (onboardingStep === 'checking') {
    return (
      <View style={[s.screen, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={C.tzGreen} />
      </View>
    )
  }

  return (
    <View style={s.screen}>

      {/* Registration modal — Step 3 */}
      <RegistrationModal
        visible={showRegModal}
        role={pendingRole}
        onDone={handleRegDone}
      />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* ── TOP BRAND ─────────────────────────────────────────────── */}
          <View style={{ height: SCREEN_H * 0.27 }}>
            <TopBrand />
          </View>

          {/* ── CONTENT AREA ──────────────────────────────────────────── */}
          <View style={s.cardArea}>

            {/* ═══════ NEW DEVICE: STEP 1 — OTP ═══════ */}
            {onboardingStep === 'otp' && (
              <OtpAuthPage onAuthorized={handleOtpAuthorized} />
            )}

            {/* ═══════ NEW DEVICE: STEP 2 — GEO/FINGERPRINT ═══════ */}
            {(onboardingStep === 'geo' || onboardingStep === 'reg') && (
              <GeoProcessingPage
                role={pendingRole}
                onComplete={handleGeoComplete}
              />
            )}

            {/* ═══════ RETURNING OFFICER — LOGIN FORM ═══════ */}
            {onboardingStep === 'done' && (
              <Animated.View style={{ opacity: fadeAnim }}>
                <View style={s.card}>

                  {/* Card icon */}
                  <View style={s.cardIconWrap}>
                    {loginMode === 'mfa_verify'
                      ? <Smartphone size={22} color={C.tzBlue} />
                      : <Shield     size={22} color={C.tzGreen} />
                    }
                  </View>

                  <Text style={s.cardTitle}>
                    {loginMode === 'mfa_verify' ? 'MFA Verification' : 'Officer Login'}
                  </Text>
                  <Text style={s.cardSub}>
                    {loginMode === 'mfa_verify'
                      ? 'Enter the 6-digit code from your authenticator app'
                      : 'Sign in to your NBS field officer account'}
                  </Text>

                  <ErrMsg msg={error} />

                  {/* ── LOGIN ──────────────────────────────────────────── */}
                  {loginMode === 'login' && (
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
                            {showPass ? <EyeOff size={15} color={C.textDim} /> : <Eye size={15} color={C.textDim} />}
                          </TouchableOpacity>
                        }
                      />
                      <View style={{ height: 16 }} />
                      <PrimaryBtn label="Sign In" onPress={handleLogin} loading={loading} color={C.tzNavy} />
                    </>
                  )}

                  {/* ── MFA ────────────────────────────────────────────── */}
                  {loginMode === 'mfa_verify' && (
                    <>
                      <View style={[s.infoBox, { borderColor: `${C.tzBlue}40`, backgroundColor: `${C.tzBlue}10` }]}>
                        <Text style={[s.infoTxt, { color: C.tzBlue }]}>
                          Open Google Authenticator → NBS-ADLCS → enter the 6-digit code.
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
                        label="Verify & Sign In"
                        onPress={handleMfaVerify}
                        loading={loading}
                        disabled={mfaCode.length < 6}
                        color={C.tzNavy}
                      />
                      <TouchableOpacity onPress={() => { setLoginMode('login'); setError('') }} style={s.linkBtn}>
                        <Text style={s.linkTxt}>← Back to login</Text>
                      </TouchableOpacity>
                    </>
                  )}

                </View>

                {/* Footer */}
                <View style={s.footer}>
                  <MapPin size={11} color={C.textDim} />
                  <Text style={s.footerTxt}>NBS Head Office · Dodoma, Tanzania</Text>
                </View>
                <Text style={s.footerTxt2}>Unauthorized access is prohibited and monitored</Text>
                <Text style={s.footerTxt2}>© 2026 National Bureau of Statistics · ADLCS</Text>
              </Animated.View>
            )}

          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  )
}

// ─── StyleSheet ───────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  screen:    { flex: 1, backgroundColor: C.pageBg },
  cardArea:  { backgroundColor: C.pageBg, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 36 },

  // ── Top brand ─────────────────────────────────────────────────────────────
  topBrand:  { flex: 1, overflow: 'hidden' },
  flagStripe:{ flexDirection: 'row', height: 5 },
  topRow:    { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 8, gap: 8 },
  nbsBox:    { width: 52, alignItems: 'center', gap: 3 },
  nbsLabel:  { fontSize: 8, fontWeight: '800', color: C.yellow, letterSpacing: 1.2 },
  coaBox:    { width: 52, alignItems: 'center', gap: 3 },
  coaLabel:  { fontSize: 8, fontWeight: '700', color: 'rgba(255,255,0.5)', letterSpacing: 1 },
  topCenter: { flex: 1, alignItems: 'center' },
  topGov:    { fontSize: 7, fontWeight: '800', color: C.yellow, letterSpacing: 1, textTransform: 'uppercase', textAlign: 'center' },
  topTitle:  { fontSize: 18, fontWeight: '900', color: C.white, letterSpacing: 2, marginTop: 3 },
  topDivider:{ height: 2, width: 40, backgroundColor: C.yellow, borderRadius: 1, marginVertical: 4 },
  topSub:    { fontSize: 9, color: 'rgba(255,255,0.7)', letterSpacing: 1, textTransform: 'uppercase' },
  tagline:   { fontSize: 9, fontStyle: 'italic', color: 'rgba(252,209,22,0.7)', textAlign: 'center', paddingVertical: 6 },

  // ── Auth cards ─────────────────────────────────────────────────────────────
  card:        { backgroundColor: C.cardBg, borderRadius: 18, borderWidth: 1, borderColor: C.border, padding: 22 },
  cardIconWrap:{ width: 50, height: 50, borderRadius: 14, backgroundColor: `${C.tzGreen}18`,
                 borderWidth: 1, borderColor: `${C.tzGreen}50`, alignItems: 'center',
                 justifyContent: 'center', alignSelf: 'center', marginBottom: 12 },
  cardTitle:   { fontSize: 16, fontWeight: '800', color: C.text, textAlign: 'center', marginBottom: 4 },
  cardSub:     { fontSize: 11.5, color: C.textSub, textAlign: 'center', marginBottom: 14, lineHeight: 17 },

  // ── Inputs ─────────────────────────────────────────────────────────────────
  lbl:        { fontSize: 10, color: C.textSub, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 7 },
  inpWrap:    { flexDirection: 'row', alignItems: 'center', backgroundColor: C.inputBg,
                borderWidth: 1, borderColor: C.border, borderRadius: 10, marginBottom: 0 },
  inp:        { flex: 1, color: C.text, fontSize: 13, paddingHorizontal: 14, paddingVertical: 12 },
  inpLeft:    { paddingLeft: 12 },
  inpRight:   { paddingRight: 12 },

  // ── Info / notice ──────────────────────────────────────────────────────────
  infoBox:    { borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 14 },
  infoTxt:    { fontSize: 11.5, lineHeight: 18 },
  noticeBox:  { flexDirection: 'row', gap: 10, backgroundColor: `${C.tzBlue}12`,
                borderRadius: 12, padding: 14, borderWidth: 1, borderColor: `${C.tzBlue}30`,
                alignItems: 'flex-start' },
  noticeTxt:  { flex: 1, fontSize: 11, color: C.tzBlue, lineHeight: 17 },

  // ── Buttons ────────────────────────────────────────────────────────────────
  btn:        { borderRadius: 12, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' },
  btnTxt:     { color: C.white, fontWeight: '800', fontSize: 14 },
  btnOff:     { opacity: 0.45 },
  linkBtn:    { alignItems: 'center', marginTop: 14 },
  linkTxt:    { fontSize: 11.5, color: `${C.tzBlue}cc` },

  // ── Error ──────────────────────────────────────────────────────────────────
  errRow:     { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 10 },
  errTxt:     { fontSize: 10.5, color: C.red, flex: 1 },

  // ── Countdown ─────────────────────────────────────────────────────────────
  countdown:  { fontSize: 11.5, color: C.textDim, textAlign: 'center', marginTop: 8, marginBottom: 4 },

  // ── Geo processing steps ───────────────────────────────────────────────────
  stepRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6,
                backgroundColor: `${C.tzGreen}08`, borderRadius: 8, paddingHorizontal: 10 },
  stepTxt:    { fontSize: 12, color: C.textSub, flex: 1 },

  // ── Footer ─────────────────────────────────────────────────────────────────
  footer:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 20 },
  footerTxt:  { fontSize: 10, color: C.textDim },
  footerTxt2: { fontSize: 9, color: C.border, textAlign: 'center', marginTop: 3 },

  // ── Registration modal ─────────────────────────────────────────────────────
  modalOverlay:  { flex: 1, backgroundColor: 'rgba(0,0.80)', justifyContent: 'flex-end' },
  regCard:       { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
                   paddingBottom: 40, overflow: 'hidden' },
  regTopBar:     { height: 6 },
  regHeader:     { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 16 },
  regTitle:      { fontSize: 18, fontWeight: '800', color: '#111827' },
  regSubtitle:   { fontSize: 12, color: '#6b7280', marginTop: 4 },
  regLbl:        { fontSize: 10, fontWeight: '700', color: '#374151', letterSpacing: 1,
                   textTransform: 'uppercase', marginBottom: 6, paddingHorizontal: 24 },
  regInpWrap:    { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: '#e5e7eb',
                   borderRadius: 10, backgroundColor: '#f9fafb', marginHorizontal: 20, marginBottom: 4, overflow: 'hidden' },
  regInp:        { flex: 1, fontSize: 14, color: '#111', paddingHorizontal: 12, paddingVertical: 12 },
  phonePrefixBox:{ paddingHorizontal: 12, paddingVertical: 12, backgroundColor: '#f3f4f6' },
  phonePrefixText:{ fontSize: 13, fontWeight: '700', color: '#374151' },
  phoneDivider:  { width: 1, height: '100%', backgroundColor: '#e5e7eb' },
  regBtn:        { marginHorizontal: 20, marginTop: 20, borderRadius: 12,
                   paddingVertical: 15, alignItems: 'center' },
  regBtnTxt:     { color: '#fff', fontWeight: '800', fontSize: 15 },
  regFooter:     { fontSize: 10, color: '#9ca3af', textAlign: 'center', marginTop: 14, paddingHorizontal: 24 },
})