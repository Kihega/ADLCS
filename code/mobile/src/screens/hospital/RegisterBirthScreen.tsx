/**
 * RegisterBirthScreen.tsx — Birth Registration  v4.0
 * Hospital Officer · ADLCS Tanzania · NBS-CENSUS
 *
 * STEP ORDER (matches civil registration practice):
 *   Step 1 — Father NID lookup  → confirm parent identity first
 *   Step 2 — Mother NID lookup
 *   Step 3 — Child details       (surname & middle name auto-filled from father)
 *   Step 4 — Review & submit
 *   Modal  — Success: NID + certificate number with copy-to-clipboard icons
 *
 * CHANGES v4.0:
 *   • Steps reordered: Father → Mother → Child → Review
 *   • NIN input auto-formats as user types (YYYYMMDD-LLLLL-SSSSS-CC)
 *   • Removed hint/shield text below NIN input (clean UI)
 *   • Child middle name auto-filled from father's middle name
 *   • Child surname auto-filled from father's surname
 *   • Calendar date-picker modal for DOB (no external package)
 *   • Copy icons on NID + cert number in success modal with toast
 */

import React, { useState, useRef, useCallback, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Modal, Alert, ActivityIndicator,
  Animated, Dimensions, KeyboardAvoidingView, Platform,
  Image, ImageBackground, Share,
} from 'react-native'
import { SafeAreaView }    from 'react-native-safe-area-context'
import { LinearGradient }  from 'expo-linear-gradient'
import * as Clipboard      from 'expo-clipboard'
import {
  Baby, ChevronLeft, ChevronRight, Check, X,
  User, Shield, FileText, AlertCircle,
  CheckCircle2, Copy, Calendar,
} from 'lucide-react-native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'

// ─── Types ─────────────────────────────────────────────────────────────────────
type RootStack = { HospitalHome: undefined; RegisterBirth: undefined }
type Props = { navigation: NativeStackNavigationProp<RootStack, 'RegisterBirth'> }

// ─── Tokens ────────────────────────────────────────────────────────────────────
const TZ   = { green: '#1eb53a', blue: '#00a3dd', navy: '#003087', yellow: '#fcd116', black: '#000000' }
const H    = { primary: '#0891b2', primaryL: '#22d3ee', orange: '#f97316' }
const DARK = {
  bg: '#050d1a', card: '#0d1f38', card2: '#091628',
  text: '#f8fafc', textSub: '#94a3b8', textDim: '#4b6080',
  border: '#1e3a5f', input: '#0a1a30', inputBorder: '#1e3a5f',
  primary: H.primary, primaryL: H.primaryL,
  success: '#4ade80', danger: '#f87171', accent: TZ.yellow,
}
const { width: W } = Dimensions.get('window')

// ─── NIN Auto-formatter ────────────────────────────────────────────────────────
// Format: YYYYMMDD-LLLLL-SSSSS-CC  (8-5-5-2, total 23 chars with dashes)
function formatNIN(raw: string): string {
  const clean = raw.replace(/[^0-9]/g, '')
  let out = clean.slice(0, 8)
  if (clean.length > 8)  out += '-' + clean.slice(8,  13)
  if (clean.length > 13) out += '-' + clean.slice(13, 18)
  if (clean.length > 18) out += '-' + clean.slice(18, 20)
  return out
}
function isNINComplete(nin: string): boolean {
  return /^\d{8}-\d{5}-\d{5}-\d{2}$/.test(nin)
}

// ─── Mock Citizens (test parents) ─────────────────────────────────────────────
interface MockCitizen {
  nationalId: string; firstName: string; middleName: string; surname: string
  gender: string; dateOfBirth: string; age: number; vitalStatus: string
  village: string; ward: string; district: string; region: string
  maritalStatus: string; occupation: string; bloodGroup: string
}
const MOCK_CITIZENS: Record<string, MockCitizen> = {
  '19850315-07031-00001-24': {
    nationalId: '19850315-07031-00001-24', firstName: 'John', middleName: 'Michael',
    surname: 'Makonde', gender: 'MALE', dateOfBirth: '15 March 1985', age: 41,
    vitalStatus: 'ALIVE', village: 'Kinondoni', ward: 'Mwananyamala',
    district: 'Kinondoni', region: 'Dar es Salaam', maritalStatus: 'MARRIED',
    occupation: 'Civil Engineer', bloodGroup: 'O+',
  },
  '19880622-07031-00002-13': {
    nationalId: '19880622-07031-00002-13', firstName: 'Grace', middleName: 'Rose',
    surname: 'Mwamba', gender: 'FEMALE', dateOfBirth: '22 June 1988', age: 37,
    vitalStatus: 'ALIVE', village: 'Kinondoni', ward: 'Mwananyamala',
    district: 'Kinondoni', region: 'Dar es Salaam', maritalStatus: 'MARRIED',
    occupation: 'Registered Nurse', bloodGroup: 'A+',
  },
}

// ─── Calendar Picker Modal ─────────────────────────────────────────────────────
interface CalendarPickerProps {
  visible:   boolean
  title:     string
  maxDate?:  Date
  onSelect:  (display: string) => void
  onClose:   () => void
}
function CalendarPicker({ visible, title, maxDate, onSelect, onClose }: CalendarPickerProps) {
  const now    = maxDate ?? new Date()
  const curY   = now.getFullYear()
  const [yr,   setYr]   = useState(curY)
  const [mo,   setMo]   = useState(now.getMonth() + 1) // 1-12
  const [day,  setDay]  = useState(now.getDate())
  const MONTHS = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December']
  const years  = Array.from({ length: 120 }, (_, i) => curY - i)
  const daysIn = new Date(yr, mo, 0).getDate()
  const days   = Array.from({ length: daysIn }, (_, i) => i + 1)

  // Clamp day when month changes
  useEffect(() => { if (day > daysIn) setDay(daysIn) }, [mo, yr])

  const confirm = () => {
    const d = String(day).padStart(2, '0')
    const m = String(mo).padStart(2, '0')
    onSelect(`${d}/${m}/${yr}`)
  }

  if (!visible) return null
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={cal.overlay}>
        <View style={cal.sheet}>
          <View style={cal.sheetHandle} />
          <View style={cal.sheetHeader}>
            <Calendar size={16} color={H.primaryL} />
            <Text style={cal.sheetTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose}><X size={18} color={DARK.textSub} /></TouchableOpacity>
          </View>

          <View style={cal.pickersRow}>
            {/* Day */}
            <View style={{ flex: 1 }}>
              <Text style={cal.colLabel}>Day</Text>
              <ScrollView style={cal.scroll} showsVerticalScrollIndicator={false}>
                {days.map(d => (
                  <TouchableOpacity key={d} style={[cal.cell, d === day && cal.cellActive]} onPress={() => setDay(d)}>
                    <Text style={[cal.cellText, d === day && cal.cellTextActive]}>{String(d).padStart(2, '0')}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
            {/* Month */}
            <View style={{ flex: 2 }}>
              <Text style={cal.colLabel}>Month</Text>
              <ScrollView style={cal.scroll} showsVerticalScrollIndicator={false}>
                {MONTHS.map((name, i) => (
                  <TouchableOpacity key={name} style={[cal.cell, i + 1 === mo && cal.cellActive]} onPress={() => setMo(i + 1)}>
                    <Text style={[cal.cellText, i + 1 === mo && cal.cellTextActive]}>{name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
            {/* Year */}
            <View style={{ flex: 1.5 }}>
              <Text style={cal.colLabel}>Year</Text>
              <ScrollView style={cal.scroll} showsVerticalScrollIndicator={false}>
                {years.map(y => (
                  <TouchableOpacity key={y} style={[cal.cell, y === yr && cal.cellActive]} onPress={() => setYr(y)}>
                    <Text style={[cal.cellText, y === yr && cal.cellTextActive]}>{y}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>

          <View style={cal.btnRow}>
            <TouchableOpacity style={cal.cancelBtn} onPress={onClose}>
              <Text style={{ color: DARK.textSub, fontWeight: '600' }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={cal.confirmBtn} onPress={confirm}>
              <Text style={{ color: '#fff', fontWeight: '800' }}>Confirm Date</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )
}
const cal = StyleSheet.create({
  overlay:       { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.65)' },
  sheet:         { backgroundColor: DARK.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36 },
  sheetHandle:   { width: 40, height: 4, backgroundColor: DARK.border, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  sheetHeader:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  sheetTitle:    { flex: 1, fontSize: 15, fontWeight: '800', color: DARK.text },
  pickersRow:    { flexDirection: 'row', gap: 6, height: 200 },
  colLabel:      { fontSize: 10, color: DARK.textDim, fontWeight: '600', textAlign: 'center', marginBottom: 4 },
  scroll:        { flex: 1 },
  cell:          { paddingVertical: 9, alignItems: 'center', borderRadius: 8, marginVertical: 2 },
  cellActive:    { backgroundColor: `${H.primary}30` },
  cellText:      { fontSize: 13, color: DARK.textSub },
  cellTextActive:{ color: H.primaryL, fontWeight: '800' },
  btnRow:        { flexDirection: 'row', gap: 10, marginTop: 16 },
  cancelBtn:     { flex: 1, borderWidth: 1, borderColor: DARK.border, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  confirmBtn:    { flex: 2, backgroundColor: H.primary, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
})

// ─── Toast notification ────────────────────────────────────────────────────────
function Toast({ message, visible }: { message: string; visible: boolean }) {
  const opacity = useRef(new Animated.Value(0)).current
  useEffect(() => {
    if (visible) {
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.delay(1600),
        Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start()
    }
  }, [visible])
  return (
    <Animated.View style={[rb.toast, { opacity }]} pointerEvents="none">
      <CheckCircle2 size={14} color="#fff" />
      <Text style={rb.toastText}>{message}</Text>
    </Animated.View>
  )
}

// ─── Step dot ─────────────────────────────────────────────────────────────────
function StepDot({ n, current, done }: { n: number; current: number; done: boolean }) {
  const bg   = done ? TZ.green : n === current ? H.primary : 'rgba(255,255,255,0.12)'
  const col  = done || n === current ? '#fff' : 'rgba(255,255,255,0.40)'
  return (
    <View style={[rb.dot, { backgroundColor: bg, borderColor: n === current ? H.primaryL : 'transparent' }]}>
      {done ? <Check size={10} color="#fff" /> : <Text style={[rb.dotText, { color: col }]}>{n}</Text>}
    </View>
  )
}

// ─── Citizen card ──────────────────────────────────────────────────────────────
function CitizenCard({ citizen, role }: { citizen: MockCitizen; role: 'Father' | 'Mother' }) {
  const color = role === 'Father' ? H.primary : '#8b5cf6'
  return (
    <View style={[rb.citizenCard, { borderColor: `${color}50`, backgroundColor: `${color}10` }]}>
      <View style={[rb.citizenTop, { borderBottomColor: `${color}30` }]}>
        <View style={[rb.citizenAvatar, { backgroundColor: `${color}25` }]}>
          <User size={20} color={color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={rb.citizenName}>{citizen.firstName} {citizen.middleName} {citizen.surname}</Text>
          <Text style={rb.citizenNid}>{citizen.nationalId}</Text>
          <View style={[rb.vitalBadge, { backgroundColor: `${TZ.green}20`, borderColor: `${TZ.green}50` }]}>
            <View style={[rb.vitalDot, { backgroundColor: TZ.green }]} />
            <Text style={[rb.vitalText, { color: TZ.green }]}>ALIVE · VERIFIED</Text>
          </View>
        </View>
        <View style={[rb.rolePill, { backgroundColor: `${color}20`, borderColor: `${color}50` }]}>
          <Text style={[rb.rolePillText, { color }]}>{role.toUpperCase()}</Text>
        </View>
      </View>
      <View style={rb.citizenGrid}>
        {([
          ['Gender', citizen.gender],       ['Date of Birth', citizen.dateOfBirth],
          ['Age',    `${citizen.age} yrs`], ['Region',  citizen.region],
          ['District', citizen.district],   ['Occupation', citizen.occupation],
        ] as [string, string][]).map(([k, v]) => (
          <View key={k} style={rb.citizenRow}>
            <Text style={rb.citizenKey}>{k}</Text>
            <Text style={rb.citizenVal}>{v}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}

// ─── Success Modal ─────────────────────────────────────────────────────────────
function SuccessModal({
  visible, onClose, certNo, childNid, childName,
}: {
  visible: boolean; onClose: () => void
  certNo: string; childNid: string; childName: string
}) {
  const scale = useRef(new Animated.Value(0.6)).current
  const fade  = useRef(new Animated.Value(0)).current
  const [toast,     setToast]     = useState('')
  const [toastVis,  setToastVis]  = useState(false)

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }),
        Animated.timing(fade,  { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start()
    } else { scale.setValue(0.6); fade.setValue(0) }
  }, [visible])

  const copy = async (text: string, label: string) => {
    await Clipboard.setStringAsync(text)
    setToast(`${label} copied to clipboard`)
    setToastVis(true)
    setTimeout(() => setToastVis(false), 2200)
  }

  return (
    <Modal visible={visible} transparent animationType="none">
      <Animated.View style={[rb.modalBg, { opacity: fade }]}>
        <Animated.View style={[rb.successCard, { transform: [{ scale }] }]}>
          <LinearGradient colors={['#064e3b', '#065f46']} style={rb.successHeader}>
            <View style={rb.successIconWrap}>
              <CheckCircle2 size={36} color="#4ade80" />
            </View>
            <Text style={rb.successTitle}>Birth Registered!</Text>
            <Text style={rb.successSub}>Record successfully added to NBS Central Database</Text>
          </LinearGradient>

          <View style={rb.successBody}>
            <Text style={rb.successChildName}>{childName}</Text>
            <Text style={rb.successChildSub}>New Citizen of Tanzania</Text>
            <View style={rb.successDivider} />

            {/* National ID with copy */}
            <View style={rb.successItem}>
              <Text style={rb.successItemLabel}>Generated National ID</Text>
              <View style={[rb.successBox, { borderColor: `${H.primary}50`, backgroundColor: `${H.primary}10` }]}>
                <Text style={[rb.successBoxVal, { color: H.primaryL, flex: 1 }]}>{childNid}</Text>
                <TouchableOpacity onPress={() => copy(childNid, 'National ID')} style={rb.copyBtn}>
                  <Copy size={15} color={H.primaryL} />
                </TouchableOpacity>
              </View>
              <Text style={rb.successItemNote}>
                Child will collect physical ID card at age 18 from Village Officer
              </Text>
            </View>

            {/* Certificate with copy */}
            <View style={rb.successItem}>
              <Text style={rb.successItemLabel}>Birth Certificate Number</Text>
              <View style={[rb.successBox, { borderColor: `${TZ.green}50`, backgroundColor: `${TZ.green}10` }]}>
                <Text style={[rb.successBoxVal, { color: TZ.green, flex: 1 }]}>{certNo}</Text>
                <TouchableOpacity onPress={() => copy(certNo, 'Certificate number')} style={rb.copyBtn}>
                  <Copy size={15} color={TZ.green} />
                </TouchableOpacity>
              </View>
            </View>

            <View style={rb.successRita}>
              <Shield size={13} color={H.primaryL} />
              <Text style={rb.successRitaText}>Certificate synced to internal registry · QR signed by Govt PKI</Text>
            </View>

            <TouchableOpacity style={rb.successBtn} onPress={onClose} activeOpacity={0.85}>
              <Text style={rb.successBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* Toast inside modal overlay */}
        <Toast message={toast} visible={toastVis} />
      </Animated.View>
    </Modal>
  )
}

// ─── Screen ────────────────────────────────────────────────────────────────────
export default function RegisterBirthScreen({ navigation }: Props) {
  const [step, setStep] = useState(1)   // 1=Father, 2=Mother, 3=Child, 4=Review

  // Step 1 — Father
  const [fatherNid,     setFatherNid]     = useState('')
  const [fatherLookup,  setFatherLookup]  = useState<MockCitizen | null>(null)
  const [fatherLoading, setFatherLoading] = useState(false)
  const [fatherError,   setFatherError]   = useState('')

  // Step 2 — Mother
  const [motherNid,     setMotherNid]     = useState('')
  const [motherLookup,  setMotherLookup]  = useState<MockCitizen | null>(null)
  const [motherLoading, setMotherLoading] = useState(false)
  const [motherError,   setMotherError]   = useState('')

  // Step 3 — Child (surname & middleName pre-filled from father)
  const [childFirstName,  setChildFirstName]  = useState('')
  const [childMiddleName, setChildMiddleName] = useState('')
  const [childSurname,    setChildSurname]    = useState('')
  const [childGender,     setChildGender]     = useState<'MALE' | 'FEMALE' | ''>('')
  const [childDOB,        setChildDOB]        = useState('')
  const [showCalendar,    setShowCalendar]     = useState(false)

  // Submit
  const [submitting,  setSubmitting]  = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [genNid,      setGenNid]      = useState('')
  const [certNo,      setCertNo]      = useState('')

  // Auto-fill child names when father is confirmed
  useEffect(() => {
    if (fatherLookup) {
      setChildMiddleName(fatherLookup.middleName ?? '')
      setChildSurname(fatherLookup.surname ?? '')
    }
  }, [fatherLookup])

  // ── NID lookup ─────────────────────────────────────────────────────────────
  const lookupParent = useCallback(async (nid: string, role: 'father' | 'mother') => {
    const isFather = role === 'father'
    const setLoading = isFather ? setFatherLoading : setMotherLoading
    const setError   = isFather ? setFatherError   : setMotherError
    const setResult  = isFather ? setFatherLookup  : setMotherLookup

    setLoading(true); setError(''); setResult(null)
    await new Promise<void>(r => setTimeout(r, 800))

    const found = MOCK_CITIZENS[nid.trim()]
    if (!found) { setError('National ID not found in NBS Central Database.'); setLoading(false); return }
    if (found.vitalStatus !== 'ALIVE') { setError('Citizen record shows DECEASED. Cannot register as parent.'); setLoading(false); return }
    if (found.age < 18) { setError('Citizen is under 18 years old.'); setLoading(false); return }
    if (isFather && found.gender !== 'MALE') { setError('This NID belongs to a female citizen. Enter the father\'s NID.'); setLoading(false); return }
    if (!isFather && found.gender !== 'FEMALE') { setError('This NID belongs to a male citizen. Enter the mother\'s NID.'); setLoading(false); return }

    setResult(found); setLoading(false)
  }, [])

  // ── NIN input handler ───────────────────────────────────────────────────────
  const handleNINInput = (raw: string, role: 'father' | 'mother') => {
    const formatted = formatNIN(raw)
    if (role === 'father') setFatherNid(formatted)
    else setMotherNid(formatted)
  }

  // ── Generate IDs ───────────────────────────────────────────────────────────
  const generateChildNid = (): string => {
    const parts = childDOB.replace(/-/g, '/').split('/')
    const d = (parts[0] ?? '01').padStart(2, '0')
    const m = (parts[1] ?? '01').padStart(2, '0')
    const y = parts[2] ?? '2026'
    const seq = Math.floor(Math.random() * 90000 + 10000)
    const cc  = Math.floor(Math.random() * 90 + 10)
    return `${y}${m}${d}-07031-${String(seq).padStart(5, '0')}-${cc}`
  }
  const generateCertNo = (): string => `${Math.floor(Math.random() * 90000000 + 10000000)} A`

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setSubmitting(true)
    await new Promise<void>(r => setTimeout(r, 1400))
    setGenNid(generateChildNid())
    setCertNo(generateCertNo())
    setSubmitting(false)
    setShowSuccess(true)
  }

  const step1Valid = isNINComplete(fatherNid) && !!fatherLookup
  const step2Valid = isNINComplete(motherNid) && !!motherLookup
  const step3Valid = !!childFirstName.trim() && !!childSurname.trim() && !!childGender && childDOB.length >= 8
  const canNext    = [step1Valid, step2Valid, step3Valid, true][step - 1]

  const childFullName = [childFirstName, childMiddleName, childSurname].filter(Boolean).join(' ').toUpperCase()

  // ── NID step render ────────────────────────────────────────────────────────
  const renderNIDStep = (role: 'father' | 'mother') => {
    const isFather  = role === 'father'
    const nid       = isFather ? fatherNid    : motherNid
    const lookup    = isFather ? fatherLookup : motherLookup
    const loading   = isFather ? fatherLoading : motherLoading
    const error     = isFather ? fatherError   : motherError
    const testNid   = isFather ? '19850315-07031-00001-24' : '19880622-07031-00002-13'
    const accent    = isFather ? H.primary : '#8b5cf6'
    const label     = isFather ? 'Father' : 'Mother'

    return (
      <View style={rb.stepContent}>
        <Text style={rb.stepTitle}>{label} Identification</Text>
        <Text style={rb.stepDesc}>
          Enter the {label.toLowerCase()}'s National ID. The system validates the record in the NBS Central Database.
        </Text>

        <View style={rb.field}>
          <Text style={rb.fieldLabel}>National ID Number *</Text>
          <View style={rb.nidRow}>
            <TextInput
              style={[rb.input, { flex: 1, letterSpacing: 1 }]}
              value={nid}
              onChangeText={raw => handleNINInput(raw, role)}
              placeholder="YYYYMMDD-LLLLL-SSSSS-CC"
              placeholderTextColor={DARK.textDim}
              keyboardType="numeric"
              maxLength={23}
              returnKeyType="search"
              blurOnSubmit={false}
            />
            <TouchableOpacity
              style={[rb.lookupBtn, { backgroundColor: accent, opacity: isNINComplete(nid) ? 1 : 0.4 }]}
              onPress={() => lookupParent(nid, role)}
              disabled={!isNINComplete(nid) || loading}
              activeOpacity={0.8}
            >
              {loading
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={rb.lookupBtnText}>Search</Text>}
            </TouchableOpacity>
          </View>

          {/* Quick-fill for dev/testing */}
          <TouchableOpacity
            style={rb.autofill}
            onPress={() => { handleNINInput(testNid.replace(/-/g, ''), role); lookupParent(testNid, role) }}
          >
            <Text style={[rb.autofillText, { color: accent }]}>
              ⚡ Auto-fill test {label.toLowerCase()} ID
            </Text>
          </TouchableOpacity>
        </View>

        {!!error && (
          <View style={rb.errorBox}>
            <AlertCircle size={14} color="#f87171" />
            <Text style={rb.errorText}>{error}</Text>
          </View>
        )}
        {loading && (
          <View style={rb.loadingCard}>
            <ActivityIndicator color={accent} />
            <Text style={[rb.loadingText, { color: accent }]}>Querying NBS Central Database…</Text>
          </View>
        )}
        {lookup && <CitizenCard citizen={lookup} role={isFather ? 'Father' : 'Mother'} />}
      </View>
    )
  }

  // ── Child info step ────────────────────────────────────────────────────────
  const renderChildStep = () => (
    <View style={rb.stepContent}>
      <Text style={rb.stepTitle}>Child Information</Text>
      <Text style={rb.stepDesc}>
        Enter the newborn's details. Surname and middle name are pre-filled from the father's record.
      </Text>

      <View style={rb.field}>
        <Text style={rb.fieldLabel}>First Name *</Text>
        <TextInput style={rb.input} value={childFirstName} onChangeText={setChildFirstName}
          placeholder="e.g. Amani" placeholderTextColor={DARK.textDim} autoCapitalize="words"
          returnKeyType="next" blurOnSubmit={false} />
      </View>

      <View style={rb.field}>
        <Text style={rb.fieldLabel}>
          Middle Name
          <Text style={{ color: DARK.textDim, fontSize: 10 }}> (auto-filled from father)</Text>
        </Text>
        <TextInput style={rb.input} value={childMiddleName} onChangeText={setChildMiddleName}
          placeholder={fatherLookup?.middleName ?? 'Optional'} placeholderTextColor={DARK.textDim}
          autoCapitalize="words" returnKeyType="next" blurOnSubmit={false} />
      </View>

      <View style={rb.field}>
        <Text style={rb.fieldLabel}>
          Surname *
          <Text style={{ color: DARK.textDim, fontSize: 10 }}> (auto-filled from father)</Text>
        </Text>
        <TextInput style={rb.input} value={childSurname} onChangeText={setChildSurname}
          placeholder={fatherLookup?.surname ?? 'e.g. Makonde'} placeholderTextColor={DARK.textDim}
          autoCapitalize="words" returnKeyType="next" blurOnSubmit={false} />
      </View>

      {/* Gender */}
      <View style={rb.field}>
        <Text style={rb.fieldLabel}>Gender *</Text>
        <View style={rb.genderRow}>
          {(['MALE', 'FEMALE'] as const).map(g => (
            <TouchableOpacity key={g}
              style={[rb.genderBtn, childGender === g && {
                backgroundColor: g === 'MALE' ? `${H.primary}25` : '#8b5cf620',
                borderColor:     g === 'MALE' ? H.primaryL : '#a78bfa',
              }]}
              onPress={() => setChildGender(g)} activeOpacity={0.7}>
              <Text style={{ fontSize: 18 }}>{g === 'MALE' ? '👦' : '👧'}</Text>
              <Text style={[rb.genderText, childGender === g && {
                color: g === 'MALE' ? H.primaryL : '#c4b5fd',
              }]}>{g}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Date of birth — calendar trigger */}
      <View style={rb.field}>
        <Text style={rb.fieldLabel}>Date of Birth *</Text>
        <TouchableOpacity
          style={[rb.input, rb.dateBtn]}
          onPress={() => setShowCalendar(true)}
          activeOpacity={0.8}
        >
          <Text style={childDOB ? { color: DARK.text, fontSize: 14 } : { color: DARK.textDim, fontSize: 14 }}>
            {childDOB || 'Select date of birth'}
          </Text>
          <Calendar size={16} color={DARK.textDim} />
        </TouchableOpacity>
      </View>

      <View style={rb.infoBox}>
        <AlertCircle size={13} color={H.primaryL} />
        <Text style={rb.infoText}>
          A unique National ID will be auto-generated upon registration. The child collects their physical ID card at age 18 from the Village Officer.
        </Text>
      </View>

      <CalendarPicker
        visible={showCalendar}
        title="Select Date of Birth"
        maxDate={new Date()}
        onSelect={d => { setChildDOB(d); setShowCalendar(false) }}
        onClose={() => setShowCalendar(false)}
      />
    </View>
  )

  // ── Review step ────────────────────────────────────────────────────────────
  const renderReview = () => (
    <View style={rb.stepContent}>
      <Text style={rb.stepTitle}>Review & Confirm</Text>
      <Text style={rb.stepDesc}>
        Verify all details before submitting. This record will be permanently stored in the NBS Central Database.
      </Text>

      {/* Father */}
      {fatherLookup && (
        <View style={[rb.reviewSection, { borderColor: `${H.primary}40`, backgroundColor: `${H.primary}08` }]}>
          <View style={rb.reviewSectionHead}>
            <User size={15} color={H.primaryL} />
            <Text style={[rb.reviewSectionTitle, { color: H.primaryL }]}>Father</Text>
          </View>
          <View style={rb.reviewRow}><Text style={rb.reviewKey}>Full Name</Text><Text style={rb.reviewVal}>{fatherLookup.firstName} {fatherLookup.middleName} {fatherLookup.surname}</Text></View>
          <View style={rb.reviewRow}><Text style={rb.reviewKey}>National ID</Text><Text style={rb.reviewVal}>{fatherLookup.nationalId}</Text></View>
        </View>
      )}

      {/* Mother */}
      {motherLookup && (
        <View style={[rb.reviewSection, { borderColor: '#8b5cf640', backgroundColor: '#8b5cf608' }]}>
          <View style={rb.reviewSectionHead}>
            <User size={15} color="#c4b5fd" />
            <Text style={[rb.reviewSectionTitle, { color: '#c4b5fd' }]}>Mother</Text>
          </View>
          <View style={rb.reviewRow}><Text style={rb.reviewKey}>Full Name</Text><Text style={rb.reviewVal}>{motherLookup.firstName} {motherLookup.middleName} {motherLookup.surname}</Text></View>
          <View style={rb.reviewRow}><Text style={rb.reviewKey}>National ID</Text><Text style={rb.reviewVal}>{motherLookup.nationalId}</Text></View>
        </View>
      )}

      {/* Child */}
      <View style={[rb.reviewSection, { borderColor: `${TZ.green}40`, backgroundColor: `${TZ.green}08` }]}>
        <View style={rb.reviewSectionHead}>
          <Baby size={15} color={TZ.green} />
          <Text style={[rb.reviewSectionTitle, { color: TZ.green }]}>Newborn</Text>
        </View>
        {([
          ['Full Name',     childFullName],
          ['Gender',        childGender],
          ['Date of Birth', childDOB],
        ] as [string, string][]).map(([k, v]) => (
          <View key={k} style={rb.reviewRow}>
            <Text style={rb.reviewKey}>{k}</Text>
            <Text style={rb.reviewVal}>{v}</Text>
          </View>
        ))}
      </View>

      <View style={rb.declarationBox}>
        <FileText size={13} color={DARK.textSub} />
        <Text style={rb.declarationText}>
          I, the registering officer, certify that the information provided is accurate and complete to the best
          of my knowledge, as required under the Births and Deaths Registration Act (Cap 108 R.E. 2002) of the
          United Republic of Tanzania.
        </Text>
      </View>
    </View>
  )

  const STEP_LABELS = ['Father', 'Mother', 'Child Info', 'Review']

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: DARK.bg }} edges={['top']}>
      {/* ── HEADER ──────────────────────────────────────────────────────── */}
      <ImageBackground
        source={require('../../../public/assets/flag.jpg')}
        style={rb.headerBg} blurRadius={2} resizeMode="cover"
      >
        <LinearGradient colors={['rgba(2,20,60,0.70)', 'rgba(8,50,80,0.65)']} style={StyleSheet.absoluteFill} />
        <View style={rb.flagStripe}>
          <View style={{ flex: 3, backgroundColor: TZ.green }} />
          <View style={{ width: 9, backgroundColor: TZ.yellow }} />
          <View style={{ width: 7, backgroundColor: TZ.black }} />
          <View style={{ width: 9, backgroundColor: TZ.yellow }} />
          <View style={{ flex: 3, backgroundColor: TZ.blue }} />
        </View>
        <View style={rb.headerRow}>
          <TouchableOpacity style={rb.backBtn}
            onPress={() => step > 1 ? setStep(s => s - 1) : navigation.goBack()}>
            <ChevronLeft size={20} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <View style={rb.headerIconWrap}><Baby size={18} color={TZ.green} /></View>
            <Text style={rb.headerTitle}>Register Birth</Text>
            <Text style={rb.headerSub}>NBS · Births &amp; Deaths Registration Act</Text>
          </View>
          <View style={rb.coatSmall}>
            <Image source={require('../../../public/assets/court_of_arm.png')} style={{ width: 32, height: 32 }} resizeMode="contain" />
          </View>
        </View>
        <View style={rb.stepsRow}>
          {[1, 2, 3, 4].map(n => (
            <React.Fragment key={n}>
              <StepDot n={n} current={step} done={n < step} />
              {n < 4 && <View style={[rb.stepLine, { backgroundColor: n < step ? TZ.green : 'rgba(255,255,255,0.15)' }]} />}
            </React.Fragment>
          ))}
        </View>
        <View style={rb.stepsLabels}>
          {STEP_LABELS.map((l, i) => (
            <Text key={l} style={[rb.stepLabel, i + 1 === step && { color: H.primaryL }]}>{l}</Text>
          ))}
        </View>
      </ImageBackground>

      {/* ── BODY ────────────────────────────────────────────────────────── */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={rb.body}>
            {step === 1 && renderNIDStep('father')}
            {step === 2 && renderNIDStep('mother')}
            {step === 3 && renderChildStep()}
            {step === 4 && renderReview()}
          </View>
        </ScrollView>

        {/* ── NAV FOOTER ────────────────────────────────────────────────── */}
        <View style={rb.navFooter}>
          <View style={rb.progressTrack}>
            <View style={[rb.progressFill, { width: `${(step / 4) * 100}%` }]} />
          </View>
          <Text style={rb.progressText}>Step {step} of 4</Text>
          <View style={rb.navBtns}>
            {step > 1 && (
              <TouchableOpacity style={rb.prevBtn} onPress={() => setStep(s => s - 1)} activeOpacity={0.8}>
                <ChevronLeft size={18} color={DARK.textSub} />
                <Text style={rb.prevBtnText}>Back</Text>
              </TouchableOpacity>
            )}
            {step < 4 ? (
              <TouchableOpacity
                style={[rb.nextBtn, !canNext && rb.nextBtnDisabled]}
                onPress={() => setStep(s => s + 1)}
                disabled={!canNext}
                activeOpacity={0.85}
              >
                <Text style={rb.nextBtnText}>Continue</Text>
                <ChevronRight size={18} color="#fff" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[rb.submitBtn, submitting && { opacity: 0.7 }]}
                onPress={handleSubmit}
                disabled={submitting}
                activeOpacity={0.85}
              >
                {submitting
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <><Check size={18} color="#fff" /><Text style={rb.submitBtnText}>Register Birth</Text></>}
              </TouchableOpacity>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* ── SUCCESS MODAL ──────────────────────────────────────────────── */}
      <SuccessModal
        visible={showSuccess}
        childName={childFullName}
        childNid={genNid}
        certNo={certNo}
        onClose={() => { setShowSuccess(false); navigation.goBack() }}
      />
    </SafeAreaView>
  )
}

// ─── Styles ────────────────────────────────────────────────────────────────────
const rb = StyleSheet.create({
  headerBg:        { overflow: 'hidden' },
  flagStripe:      { flexDirection: 'row', height: 4 },
  headerRow:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, gap: 10 },
  backBtn:         { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  headerIconWrap:  { width: 32, height: 32, borderRadius: 10, backgroundColor: `${TZ.green}20`, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  headerTitle:     { fontSize: 16, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
  headerSub:       { fontSize: 9, color: 'rgba(255,255,255,0.60)', marginTop: 2 },
  coatSmall:       { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.10)', alignItems: 'center', justifyContent: 'center' },
  stepsRow:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 28, paddingBottom: 8, paddingTop: 4 },
  dot:             { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  dotText:         { fontSize: 10, fontWeight: '700' },
  stepLine:        { flex: 1, height: 2, borderRadius: 1 },
  stepsLabels:     { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12 },
  stepLabel:       { fontSize: 9, color: 'rgba(255,255,255,0.45)', width: (W - 32) / 4, textAlign: 'center' },
  body:            { padding: 16 },
  stepContent:     { gap: 14 },
  stepTitle:       { fontSize: 18, fontWeight: '800', color: DARK.text, marginBottom: 2 },
  stepDesc:        { fontSize: 12, color: DARK.textSub, lineHeight: 18, marginBottom: 4 },
  field:           { gap: 6 },
  fieldLabel:      { fontSize: 12, fontWeight: '600', color: DARK.textSub },
  input:           { backgroundColor: DARK.input, borderWidth: 1, borderColor: DARK.inputBorder, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, color: DARK.text, fontSize: 14 },
  dateBtn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  nidRow:          { flexDirection: 'row', gap: 8 },
  lookupBtn:       { borderRadius: 10, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', minWidth: 76 },
  lookupBtnText:   { fontSize: 13, fontWeight: '700', color: '#fff' },
  autofill:        { paddingTop: 4 },
  autofillText:    { fontSize: 11, fontWeight: '600' },
  infoBox:         { flexDirection: 'row', gap: 8, backgroundColor: `${H.primary}10`, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: `${H.primary}30`, alignItems: 'flex-start' },
  infoText:        { fontSize: 11, color: DARK.textSub, flex: 1, lineHeight: 17 },
  errorBox:        { flexDirection: 'row', gap: 8, backgroundColor: 'rgba(239,68,68,0.12)', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: 'rgba(239,68,68,0.35)', alignItems: 'flex-start' },
  errorText:       { fontSize: 12, color: '#f87171', flex: 1, lineHeight: 17 },
  loadingCard:     { flexDirection: 'row', gap: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: DARK.card, borderRadius: 12, padding: 18, borderWidth: 1, borderColor: DARK.border },
  loadingText:     { fontSize: 13, fontWeight: '600' },
  genderRow:       { flexDirection: 'row', gap: 10 },
  genderBtn:       { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 10, borderWidth: 1.5, borderColor: DARK.inputBorder, backgroundColor: DARK.input, paddingVertical: 12 },
  genderText:      { fontSize: 13, fontWeight: '600', color: DARK.textSub },
  citizenCard:     { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  citizenTop:      { flexDirection: 'row', gap: 12, padding: 14, borderBottomWidth: 1, alignItems: 'flex-start' },
  citizenAvatar:   { width: 42, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  citizenName:     { fontSize: 14, fontWeight: '800', color: DARK.text, marginBottom: 3 },
  citizenNid:      { fontSize: 10, color: DARK.textDim, marginBottom: 6 },
  vitalBadge:      { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', borderRadius: 20, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  vitalDot:        { width: 5, height: 5, borderRadius: 2.5 },
  vitalText:       { fontSize: 8, fontWeight: '700', letterSpacing: 0.5 },
  rolePill:        { borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4, alignSelf: 'flex-start' },
  rolePillText:    { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  citizenGrid:     { padding: 14, gap: 6 },
  citizenRow:      { flexDirection: 'row', justifyContent: 'space-between' },
  citizenKey:      { fontSize: 11, color: DARK.textDim, width: '40%' },
  citizenVal:      { fontSize: 11, color: DARK.text, fontWeight: '600', flex: 1, textAlign: 'right' },
  reviewSection:   { borderRadius: 12, borderWidth: 1, overflow: 'hidden', marginBottom: 4 },
  reviewSectionHead:{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, paddingBottom: 10 },
  reviewSectionTitle:{ fontSize: 12, fontWeight: '800', letterSpacing: 0.5 },
  reviewRow:       { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 6 },
  reviewKey:       { fontSize: 11, color: DARK.textDim, width: '40%' },
  reviewVal:       { fontSize: 11, color: DARK.text, fontWeight: '600', flex: 1, textAlign: 'right' },
  declarationBox:  { flexDirection: 'row', gap: 8, backgroundColor: DARK.card, borderRadius: 10, padding: 14, borderWidth: 1, borderColor: DARK.border },
  declarationText: { fontSize: 10, color: DARK.textDim, flex: 1, lineHeight: 16, fontStyle: 'italic' },
  navFooter:       { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: DARK.card, borderTopWidth: 1, borderTopColor: DARK.border, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 28 },
  progressTrack:   { height: 3, backgroundColor: DARK.border, borderRadius: 2, marginBottom: 6 },
  progressFill:    { height: 3, backgroundColor: H.primary, borderRadius: 2 },
  progressText:    { fontSize: 10, color: DARK.textDim, marginBottom: 10 },
  navBtns:         { flexDirection: 'row', gap: 10 },
  prevBtn:         { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 12, borderWidth: 1, borderColor: DARK.border, paddingHorizontal: 16, paddingVertical: 12 },
  prevBtnText:     { fontSize: 14, color: DARK.textSub, fontWeight: '600' },
  nextBtn:         { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: H.primary, borderRadius: 12, paddingVertical: 13 },
  nextBtnDisabled: { opacity: 0.38 },
  nextBtnText:     { fontSize: 14, fontWeight: '700', color: '#fff' },
  submitBtn:       { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: TZ.green, borderRadius: 12, paddingVertical: 13 },
  submitBtnText:   { fontSize: 14, fontWeight: '700', color: '#fff' },
  modalBg:         { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  successCard:     { width: '100%', borderRadius: 20, overflow: 'hidden', backgroundColor: DARK.card, shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.60, shadowRadius: 24, elevation: 24 },
  successHeader:   { alignItems: 'center', padding: 24, gap: 10 },
  successIconWrap: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(74,222,128,0.15)', alignItems: 'center', justifyContent: 'center' },
  successTitle:    { fontSize: 22, fontWeight: '900', color: '#fff' },
  successSub:      { fontSize: 12, color: 'rgba(255,255,255,0.65)', textAlign: 'center' },
  successBody:     { padding: 20, gap: 12 },
  successChildName:{ fontSize: 18, fontWeight: '900', color: DARK.text, textAlign: 'center' },
  successChildSub: { fontSize: 12, color: DARK.textSub, textAlign: 'center', marginTop: -6 },
  successDivider:  { height: 1, backgroundColor: DARK.border },
  successItem:     { gap: 6 },
  successItemLabel:{ fontSize: 11, color: DARK.textDim, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  successBox:      { borderRadius: 10, borderWidth: 1, padding: 12, flexDirection: 'row', alignItems: 'center' },
  successBoxVal:   { fontSize: 14, fontWeight: '800', letterSpacing: 0.5 },
  copyBtn:         { padding: 4 },
  successItemNote: { fontSize: 10, color: DARK.textDim, fontStyle: 'italic' },
  successRita:     { flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: `${H.primary}12`, borderRadius: 8, padding: 10 },
  successRitaText: { fontSize: 10, color: DARK.textSub, flex: 1 },
  successBtn:      { backgroundColor: H.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  successBtnText:  { fontSize: 15, fontWeight: '800', color: '#fff' },
  toast:           { position: 'absolute', bottom: 100, alignSelf: 'center', backgroundColor: TZ.green, borderRadius: 20, paddingHorizontal: 18, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.30, shadowRadius: 8, elevation: 8 },
  toastText:       { color: '#fff', fontWeight: '700', fontSize: 13 },
})
