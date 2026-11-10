/**
 * LoginScreen.tsx — TzCRVS Mobile Authentication  v8.0  ONLINE-ONLY
 *
 * Onboarding removed for faster dev/test:
 *   • No OTP device activation
 *   • No GPS geofence capture
 *   • No device-activation register modal
 *
 * Flow (all users):
 *   Login form (email + password) → MFA verify (if enabled) → Dashboard
 *
 * To restore onboarding: revert to LoginScreen v7.
 */

import React, { useState, useEffect, useRef } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Animated,
  useWindowDimensions,
  ImageBackground,
  Image,
} from 'react-native'
import { Alert, useErrorDialog } from '../../components/AppDialog'
import { KeyboardAwareScrollView, KeyboardSafeView } from '../../components/KeyboardAware'
import { LinearGradient } from 'expo-linear-gradient'
import { Eye, EyeOff, Shield, MapPin, Smartphone, AlertCircle } from 'lucide-react-native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { resolveBase } from '../../services/apiResolver'
import { startSession } from '../../services/session'

// ─── Types ────────────────────────────────────────────────────────────────────
type RootStack = {
  Splash: undefined
  Login: undefined
  VillageHome: undefined
  HospitalHome: undefined
}
type LoginScreenProps = {
  navigation: NativeStackNavigationProp<RootStack, 'Login'>
}

// ─── Config ───────────────────────────────────────────────────────────────────

// ─── Tanzania colours ─────────────────────────────────────────────────────────
const C = {
  pageBg: '#060f1e',
  cardBg: '#0d1f38',
  border: '#3d6ca3', // was #1e3a5f — input outlines were almost invisible
  inputBg: '#060f1e',
  green: '#1eb53a',
  text: '#ffffff',
  textSub: '#94a3b8',
  textDim: '#8ea4c0', // was #4b6080 (≈3:1 on the input bg → unreadable placeholders)
  red: '#f87171',
  yellow: '#fcd116',
  tzGreen: '#1eb53a',
  tzBlue: '#00a3dd',
  tzNavy: '#00a3dd', // was #003087 (near-invisible on dark navy page); now matches tzBlue for legibility
  white: '#ffffff',
} as const

// ─── Small shared components ──────────────────────────────────────────────────
function Lbl({ children }: { children: string }) {
  return <Text style={s.lbl}>{children}</Text>
}

type InpProps = {
  value: string
  onChangeText: (t: string) => void
  placeholder?: string
  secure?: boolean
  keyboard?: 'default' | 'email-address' | 'number-pad' | 'phone-pad'
  right?: React.ReactNode
  editable?: boolean
}
function Inp({ value, onChangeText, placeholder, secure, keyboard, right, editable }: InpProps) {
  return (
    <View style={s.inpWrap}>
      <TextInput
        style={s.inp}
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
  label: string
  onPress: () => void
  loading?: boolean
  disabled?: boolean
  color?: string
}
function PrimaryBtn({ label, onPress, loading, disabled, color }: PrimaryBtnProps) {
  return (
    <TouchableOpacity
      style={[s.btn, { backgroundColor: color ?? C.tzGreen }, (disabled || loading) && s.btnOff]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
    >
      {loading ? (
        <ActivityIndicator color="#fff" size="small" />
      ) : (
        <Text style={s.btnTxt}>{label}</Text>
      )}
    </TouchableOpacity>
  )
}

// ─── Top Brand Strip ──────────────────────────────────────────────────────────
function TopBrand() {
  return (
    <ImageBackground
      source={require('../../../public/assets/flag.jpg')}
      style={s.topBrand}
      blurRadius={4}
      resizeMode="cover"
    >
      <LinearGradient
        colors={['rgba(0,30,80,0.88)', 'rgba(3,50,100,0.82)']}
        style={StyleSheet.absoluteFill}
      />
      {/* Tanzania flag stripe */}
      <View style={s.flagStripe}>
        <View style={{ flex: 3, backgroundColor: C.tzGreen }} />
        <View style={{ width: 10, backgroundColor: C.yellow }} />
        <View style={{ width: 8, backgroundColor: '#000' }} />
        <View style={{ width: 10, backgroundColor: C.yellow }} />
        <View style={{ flex: 3, backgroundColor: C.tzBlue }} />
      </View>
      {/* Brand row */}
      <View style={s.topRow}>
        <View style={s.coaBox}>
          <Image
            source={require('../../../public/assets/court_of_arm.png')}
            style={{ width: 36, height: 36 }}
            resizeMode="contain"
            onError={() => {}}
          />
          <Text style={s.coaLabel}>GoT</Text>
        </View>
        <View style={s.topCenter}>
          <Text style={s.topGov}>THE UNITED REPUBLIC OF TANZANIA</Text>
          <Text style={s.topTitle}>NBS-CRVS</Text>
          <View style={s.topDivider} />
          <Text style={s.topSub}>Census for Development</Text>
        </View>
        <View style={s.nbsBox}>
          <Image
            source={require('../../../public/assets/longo_nbs.png')}
            style={{ width: 36, height: 36 }}
            resizeMode="contain"
            onError={() => {}}
          />
          <Text style={s.nbsLabel}>NBS</Text>
        </View>
      </View>
      <Text style={s.tagline}>&ldquo;Hali ya Watanzania kwa Takwimu&rdquo;</Text>
    </ImageBackground>
  )
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function LoginScreen({ navigation }: LoginScreenProps) {
  const { height: SCREEN_H } = useWindowDimensions()
  // Banner is ~27% of the screen but clamped so it is neither cramped on short
  // phones nor huge on tablets / landscape.
  const bannerH = Math.min(Math.max(SCREEN_H * 0.27, 190), 280)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [mfaCode, setMfaCode] = useState('')
  const [tempToken, setTempToken] = useState('')
  const [loginMode, setLoginMode] = useState<'login' | 'mfa_verify'>('login')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  useErrorDialog(error, () => setError(''), 'Sign-in error')

  const fadeAnim = useRef(new Animated.Value(0)).current

  // Fade in on mount
  // LINTFIX-5: the disable comment must sit directly above the dependency
  // array line (the warning attaches there, not to the `useEffect(` line).
  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleLogin = async () => {
    if (!email.includes('@')) {
      setError('Enter a valid email address')
      return
    }
    if (password.length < 4) {
      setError('Enter your password')
      return
    }
    setError('')
    setLoading(true)
    try {
      let base: string
      try {
        base = await resolveBase()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Cannot reach the server. Please try again.')
        return
      }
      const res = await fetch(`${base}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = (await res.json()) as {
        success: boolean
        message?: string
        mfaRequired?: boolean
        tempToken?: string
        accessToken?: string
        refreshToken?: string
        profile?: { id?: string | number; role: string; full_name?: string; employee_id?: string }
      }
      if (!res.ok) {
        setError(data.message ?? 'Login failed')
        return
      }
      if (data.mfaRequired) {
        setTempToken(data.tempToken ?? '')
        setLoginMode('mfa_verify')
      } else {
        await startSession({
          accessToken: data.accessToken ?? '',
          refreshToken: data.refreshToken ?? '',
          role: data.profile?.role ?? '',
          fullName: data.profile?.full_name ?? 'Officer',
          // unique per officer — never a shared fallback, so themes can't collide
          employeeId: String(data.profile?.employee_id ?? data.profile?.id ?? 'EMP-000'),
        })
        goHome(data.profile?.role ?? '')
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ''
      if (msg === 'No internet connection' || msg.includes('Network request failed')) {
        setError('No internet connection — check Wi-Fi or mobile data')
      } else {
        setError('Login failed. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleMfaVerify = async () => {
    if (mfaCode.length < 6) {
      setError('Enter the 6-digit TOTP code')
      return
    }
    setError('')
    setLoading(true)
    try {
      let base: string
      try {
        base = await resolveBase()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Cannot reach the server. Please try again.')
        return
      }
      const res = await fetch(`${base}/auth/mfa/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tempToken, code: mfaCode }),
      })
      const data = (await res.json()) as {
        success: boolean
        message?: string
        accessToken?: string
        refreshToken?: string
        profile?: { id?: string | number; role: string; full_name?: string; employee_id?: string }
      }
      if (!res.ok) {
        setError(data.message ?? 'Invalid MFA code')
        setMfaCode('')
        return
      }
      await startSession({
          accessToken: data.accessToken ?? '',
          refreshToken: data.refreshToken ?? '',
          role: data.profile?.role ?? '',
          fullName: data.profile?.full_name ?? 'Officer',
          // unique per officer — never a shared fallback, so themes can't collide
          employeeId: String(data.profile?.employee_id ?? data.profile?.id ?? 'EMP-000'),
        })
      goHome(data.profile?.role ?? '')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ''
      if (msg === 'No internet connection' || msg.includes('Network request failed')) {
        setError('No internet connection — check Wi-Fi or mobile data')
      } else {
        setError('MFA verification failed. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  const goHome = (role: string) => {
    // startSession() already announced the new user to the theme.
    if (role === 'village_officer') navigation.replace('VillageHome')
    else if (role === 'hospital_officer') navigation.replace('HospitalHome')
    else Alert.alert('Access Denied', 'This app is for field officers only. Use the web portal.')
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <View style={s.screen}>
      <KeyboardSafeView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <KeyboardAwareScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* Top brand */}
          <View style={{ height: bannerH }}>
            <TopBrand />
          </View>

          {/* Card area */}
          <View style={s.cardArea}>
            <Animated.View style={{ opacity: fadeAnim }}>
              <View style={s.card}>
                <View style={s.cardIconWrap}>
                  {loginMode === 'mfa_verify' ? (
                    <Smartphone size={22} color={C.tzBlue} />
                  ) : (
                    <Shield size={22} color={C.tzGreen} />
                  )}
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

                {/* Login form */}
                {loginMode === 'login' && (
                  <>
                    <Lbl>EMAIL ADDRESS</Lbl>
                    <Inp
                      value={email}
                      onChangeText={(t) => {
                        setEmail(t)
                        setError('')
                      }}
                      placeholder="official@nbs.go.tz"
                      keyboard="email-address"
                    />
                    <View style={{ height: 12 }} />
                    <Lbl>PASSWORD</Lbl>
                    <Inp
                      value={password}
                      onChangeText={(t) => {
                        setPassword(t)
                        setError('')
                      }}
                      placeholder="••••••••"
                      secure={!showPass}
                      right={
                        <TouchableOpacity onPress={() => setShowPass(!showPass)}>
                          {showPass ? (
                            <EyeOff size={15} color={C.textDim} />
                          ) : (
                            <Eye size={15} color={C.textDim} />
                          )}
                        </TouchableOpacity>
                      }
                    />
                    <View style={{ height: 16 }} />
                    <PrimaryBtn
                      label="Sign In"
                      onPress={handleLogin}
                      loading={loading}
                      color={C.tzNavy}
                    />
                  </>
                )}

                {/* MFA verify */}
                {loginMode === 'mfa_verify' && (
                  <>
                    <View
                      style={[
                        s.infoBox,
                        { borderColor: `${C.tzBlue}40`, backgroundColor: `${C.tzBlue}10` },
                      ]}
                    >
                      <Text style={[s.infoTxt, { color: C.tzBlue }]}>
                        Open Google Authenticator → NBS-CRVS → enter the 6-digit code.
                      </Text>
                    </View>
                    <Lbl>6-DIGIT TOTP CODE</Lbl>
                    <Inp
                      value={mfaCode}
                      onChangeText={(t) => {
                        setMfaCode(t.replace(/\D/g, '').slice(0, 6))
                        setError('')
                      }}
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
                    <TouchableOpacity
                      onPress={() => {
                        setLoginMode('login')
                        setError('')
                      }}
                      style={s.linkBtn}
                    >
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
              <Text style={s.footerTxt2}>© 2026 National Bureau of Statistics · TzCRVS</Text>
            </Animated.View>
          </View>
        </KeyboardAwareScrollView>
      </KeyboardSafeView>
    </View>
  )
}

// ─── StyleSheet ───────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.pageBg },
  cardArea: { backgroundColor: C.pageBg, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 36 },

  topBrand: { flex: 1, overflow: 'hidden' },
  flagStripe: { flexDirection: 'row', height: 5 },
  topRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 8,
    gap: 8,
  },
  nbsBox: { width: 52, alignItems: 'center', gap: 3 },
  nbsLabel: { fontSize: 8, fontWeight: '800', color: C.yellow, letterSpacing: 1.2 },
  coaBox: { width: 52, alignItems: 'center', gap: 3 },
  coaLabel: { fontSize: 9, fontWeight: '700', color: 'rgba(255,255,255,0.9)', letterSpacing: 1 },
  topCenter: { flex: 1, alignItems: 'center' },
  topGov: {
    fontSize: 7,
    fontWeight: '800',
    color: C.yellow,
    letterSpacing: 1,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  topTitle: { fontSize: 18, fontWeight: '900', color: C.white, letterSpacing: 2, marginTop: 3 },
  topDivider: {
    height: 2,
    width: 40,
    backgroundColor: C.yellow,
    borderRadius: 1,
    marginVertical: 4,
  },
  topSub: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.92)',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  tagline: {
    fontSize: 10,
    fontStyle: 'italic',
    color: '#fcd116',
    textAlign: 'center',
    paddingVertical: 6,
  },

  card: {
    backgroundColor: C.cardBg,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    padding: 22,
  },
  cardIconWrap: {
    width: 50,
    height: 50,
    borderRadius: 14,
    backgroundColor: `${C.tzGreen}18`,
    borderWidth: 1,
    borderColor: `${C.tzGreen}50`,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: C.text,
    textAlign: 'center',
    marginBottom: 4,
  },
  cardSub: {
    fontSize: 11.5,
    color: C.textSub,
    textAlign: 'center',
    marginBottom: 14,
    lineHeight: 17,
  },

  lbl: {
    fontSize: 11,
    color: C.textSub,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 7,
  },
  inpWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.inputBg,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    marginBottom: 0,
  },
  inp: { flex: 1, color: C.text, fontSize: 13, paddingHorizontal: 14, paddingVertical: 12 },
  inpRight: { paddingRight: 12 },

  infoBox: { borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 14 },
  infoTxt: { fontSize: 11.5, lineHeight: 18 },

  btn: { borderRadius: 12, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' },
  btnTxt: { color: '#02143c', fontWeight: '800', fontSize: 15 }, // navy on sky-blue/green ≥6:1 (white was 2.8:1)
  btnOff: { opacity: 0.45 },
  linkBtn: { alignItems: 'center', marginTop: 14 },
  linkTxt: { fontSize: 12.5, color: '#38bdf8' },

  errRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 10 },
  errTxt: { fontSize: 10.5, color: C.red, flex: 1 },

  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 20,
  },
  footerTxt: { fontSize: 10, color: C.textDim },
  footerTxt2: { fontSize: 10, color: C.textDim, textAlign: 'center', marginTop: 3 },
})
