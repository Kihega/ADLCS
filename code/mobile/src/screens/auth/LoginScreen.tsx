/**
 * LoginScreen.tsx — ADLCS Mobile Authentication  v8.0  ONLINE-ONLY
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
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, KeyboardAvoidingView,
  Platform, Animated, Alert, Dimensions, ImageBackground, Image,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { LinearGradient }  from 'expo-linear-gradient'
import { Eye, EyeOff, Shield, MapPin, Smartphone, AlertCircle } from 'lucide-react-native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { resolveBase } from '../../services/apiResolver'

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

// ─── Config ───────────────────────────────────────────────────────────────────
const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'https://adlcs.onrender.com/api'
const { height: SCREEN_H } = Dimensions.get('window')

// ─── Tanzania colours ─────────────────────────────────────────────────────────
const C = {
  pageBg:  '#060f1e',
  cardBg:  '#0d1f38',
  border:  '#1e3a5f',
  inputBg: '#060f1e',
  green:   '#1eb53a',
  text:    '#ffffff',
  textSub: '#94a3b8',
  textDim: '#4b6080',
  red:     '#f87171',
  yellow:  '#fcd116',
  tzGreen: '#1eb53a',
  tzBlue:  '#00a3dd',
  tzNavy:  '#003087',
  white:   '#ffffff',
} as const

// ─── Small shared components ──────────────────────────────────────────────────
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
        <View style={{ width: 8,  backgroundColor: '#000' }} />
        <View style={{ width: 10, backgroundColor: C.yellow }} />
        <View style={{ flex: 3, backgroundColor: C.tzBlue }} />
      </View>
      {/* Brand row */}
      <View style={s.topRow}>
        <View style={s.nbsBox}>
          <Image
            source={require('../../../public/assets/longo_nbs.png')}
            style={{ width: 36, height: 36 }}
            resizeMode="contain"
            onError={() => {}}
          />
          <Text style={s.nbsLabel}>NBS</Text>
        </View>
        <View style={s.topCenter}>
          <Text style={s.topGov}>THE UNITED REPUBLIC OF TANZANIA</Text>
          <Text style={s.topTitle}>NBS-CENSUS</Text>
          <View style={s.topDivider} />
          <Text style={s.topSub}>Census for Development</Text>
        </View>
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

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function LoginScreen({ navigation }: LoginScreenProps) {

  const [email,     setEmail]     = useState('')
  const [password,  setPassword]  = useState('')
  const [showPass,  setShowPass]  = useState(false)
  const [mfaCode,   setMfaCode]   = useState('')
  const [tempToken, setTempToken] = useState('')
  const [loginMode, setLoginMode] = useState<'login' | 'mfa_verify'>('login')
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')

  const fadeAnim = useRef(new Animated.Value(0)).current

  // Fade in on mount
  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start()
  }, [])

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleLogin = async () => {
    if (!email.includes('@')) { setError('Enter a valid email address'); return }
    if (password.length < 4)  { setError('Enter your password'); return }
    setError(''); setLoading(true)
    try {
      let base: string
      try { base = await resolveBase() }
      catch { setError('No internet connection — check Wi-Fi or mobile data'); return }
      const res  = await fetch(`${base}/auth/login`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, password }),
      })
      const data = await res.json() as {
        success: boolean; message?: string
        mfaRequired?: boolean; tempToken?: string
        accessToken?: string; refreshToken?: string
        profile?: { role: string; full_name?: string; employee_id?: string }
      }
      if (!res.ok) { setError(data.message ?? 'Login failed'); return }
      if (data.mfaRequired) {
        setTempToken(data.tempToken ?? '')
        setLoginMode('mfa_verify')
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
    if (mfaCode.length < 6) { setError('Enter the 6-digit TOTP code'); return }
    setError(''); setLoading(true)
    try {
      let base: string
      try { base = await resolveBase() }
      catch { setError('No internet connection — check Wi-Fi or mobile data'); return }
      const res  = await fetch(`${base}/auth/mfa/verify`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ tempToken, code: mfaCode }),
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
    if (role === 'village_officer')       navigation.replace('VillageHome')
    else if (role === 'hospital_officer') navigation.replace('HospitalHome')
    else Alert.alert('Access Denied', 'This app is for field officers only. Use the web portal.')
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <View style={s.screen}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* Top brand */}
          <View style={{ height: SCREEN_H * 0.27 }}>
            <TopBrand />
          </View>

          {/* Card area */}
          <View style={s.cardArea}>
            <Animated.View style={{ opacity: fadeAnim }}>
              <View style={s.card}>

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

                {/* Login form */}
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
                          {showPass
                            ? <EyeOff size={15} color={C.textDim} />
                            : <Eye    size={15} color={C.textDim} />
                          }
                        </TouchableOpacity>
                      }
                    />
                    <View style={{ height: 16 }} />
                    <PrimaryBtn label="Sign In" onPress={handleLogin} loading={loading} color={C.tzNavy} />
                  </>
                )}

                {/* MFA verify */}
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
                    <TouchableOpacity
                      onPress={() => { setLoginMode('login'); setError('') }}
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
              <Text style={s.footerTxt2}>© 2026 National Bureau of Statistics · ADLCS</Text>
            </Animated.View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  )
}

// ─── StyleSheet ───────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  screen:      { flex: 1, backgroundColor: C.pageBg },
  cardArea:    { backgroundColor: C.pageBg, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 36 },

  topBrand:    { flex: 1, overflow: 'hidden' },
  flagStripe:  { flexDirection: 'row', height: 5 },
  topRow:      { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 8, gap: 8 },
  nbsBox:      { width: 52, alignItems: 'center', gap: 3 },
  nbsLabel:    { fontSize: 8, fontWeight: '800', color: C.yellow, letterSpacing: 1.2 },
  coaBox:      { width: 52, alignItems: 'center', gap: 3 },
  coaLabel:    { fontSize: 8, fontWeight: '700', color: 'rgba(255,255,255,0.5)', letterSpacing: 1 },
  topCenter:   { flex: 1, alignItems: 'center' },
  topGov:      { fontSize: 7, fontWeight: '800', color: C.yellow, letterSpacing: 1, textTransform: 'uppercase', textAlign: 'center' },
  topTitle:    { fontSize: 18, fontWeight: '900', color: C.white, letterSpacing: 2, marginTop: 3 },
  topDivider:  { height: 2, width: 40, backgroundColor: C.yellow, borderRadius: 1, marginVertical: 4 },
  topSub:      { fontSize: 9, color: 'rgba(255,255,255,0.7)', letterSpacing: 1, textTransform: 'uppercase' },
  tagline:     { fontSize: 9, fontStyle: 'italic', color: 'rgba(252,209,22,0.7)', textAlign: 'center', paddingVertical: 6 },

  card:        { backgroundColor: C.cardBg, borderRadius: 18, borderWidth: 1, borderColor: C.border, padding: 22 },
  cardIconWrap:{ width: 50, height: 50, borderRadius: 14, backgroundColor: `${C.tzGreen}18`,
                 borderWidth: 1, borderColor: `${C.tzGreen}50`, alignItems: 'center',
                 justifyContent: 'center', alignSelf: 'center', marginBottom: 12 },
  cardTitle:   { fontSize: 16, fontWeight: '800', color: C.text, textAlign: 'center', marginBottom: 4 },
  cardSub:     { fontSize: 11.5, color: C.textSub, textAlign: 'center', marginBottom: 14, lineHeight: 17 },

  lbl:         { fontSize: 10, color: C.textSub, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 7 },
  inpWrap:     { flexDirection: 'row', alignItems: 'center', backgroundColor: C.inputBg,
                 borderWidth: 1, borderColor: C.border, borderRadius: 10, marginBottom: 0 },
  inp:         { flex: 1, color: C.text, fontSize: 13, paddingHorizontal: 14, paddingVertical: 12 },
  inpRight:    { paddingRight: 12 },

  infoBox:     { borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 14 },
  infoTxt:     { fontSize: 11.5, lineHeight: 18 },

  btn:         { borderRadius: 12, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' },
  btnTxt:      { color: C.white, fontWeight: '800', fontSize: 14 },
  btnOff:      { opacity: 0.45 },
  linkBtn:     { alignItems: 'center', marginTop: 14 },
  linkTxt:     { fontSize: 11.5, color: `${C.tzBlue}cc` },

  errRow:      { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 10 },
  errTxt:      { fontSize: 10.5, color: C.red, flex: 1 },

  footer:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 20 },
  footerTxt:   { fontSize: 10, color: C.textDim },
  footerTxt2:  { fontSize: 9, color: C.border, textAlign: 'center', marginTop: 3 },
})
