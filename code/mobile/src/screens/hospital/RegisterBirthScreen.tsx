/**
 * RegisterBirthScreen.tsx — Hospital Officer · Birth Registration
 * Tanzania NBS-CENSUS  |  System Design §2.7
 *
 * FLOW (matches system_design_V2.txt §2.7):
 *   Step 1 — Child details   (name, gender, date of birth)
 *   Step 2 — Father lookup   (enter NID → system validates → confirm)
 *   Step 3 — Mother lookup   (enter NID → system validates → confirm)
 *   Step 4 — Review & submit
 *   Modal  — Success: shows generated NID + certificate number
 *
 * TEST PARENTS (pre-seeded in mock DB):
 *   Father: John Michael Makonde  · NID: 19850315-07031-00001-24  · Age 41
 *   Mother: Grace Rose Mwamba     · NID: 19880622-07031-00002-13  · Age 37
 *
 * To test quickly, tap "Auto-fill test ID" under each NID field.
 */

import React, { useState, useRef, useCallback } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Modal, Alert, ActivityIndicator,
  Animated, Dimensions, KeyboardAvoidingView, Platform,
  Image, ImageBackground, StatusBar,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import {
  Baby, ChevronLeft, ChevronRight, Check, X,
  User, Calendar, MapPin, Shield, FileText,
  AlertCircle, CheckCircle2, Loader, Copy,
} from 'lucide-react-native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'

// ─── Types ─────────────────────────────────────────────────────────────────────
type RootStack = {
  HospitalHome:  undefined
  RegisterBirth: undefined
}
type Props = { navigation: NativeStackNavigationProp<RootStack, 'RegisterBirth'> }

// ─── Tokens ────────────────────────────────────────────────────────────────────
const TZ = { green: '#1eb53a', blue: '#00a3dd', navy: '#003087', yellow: '#fcd116', black: '#000000' }
const H  = { primary: '#0891b2', primaryL: '#22d3ee', orange: '#f97316' }
const DARK = {
  bg: '#050d1a', card: '#0d1f38', card2: '#091628',
  text: '#f8fafc', textSub: '#94a3b8', textDim: '#4b6080',
  border: '#1e3a5f', input: '#0a1a30', inputBorder: '#1e3a5f',
  primary: H.primary, primaryL: H.primaryL,
  success: '#4ade80', danger: '#f87171', accent: TZ.yellow,
}

const { width: W } = Dimensions.get('window')

// ─── Mock DB — Test Parents ────────────────────────────────────────────────────
/**
 * These records simulate what the system would return when the officer
 * enters a parent's National ID. In the real app, this comes from
 * GET /api/citizens/:nationalId (internal DB, no NIDA external call).
 *
 * Both parents are registered citizens: vital_status = ALIVE, age ≥ 18.
 */
const MOCK_CITIZENS: Record<string, MockCitizen> = {
  '19850315-07031-00001-24': {
    nationalId:  '19850315-07031-00001-24',
    firstName:   'John',
    middleName:  'Michael',
    surname:     'Makonde',
    gender:      'MALE',
    dateOfBirth: '15 March 1985',
    age:          41,
    vitalStatus: 'ALIVE',
    village:     'Kinondoni',
    ward:        'Mwananyamala',
    district:    'Kinondoni',
    region:      'Dar es Salaam',
    maritalStatus: 'MARRIED',
    occupation:  'Civil Engineer',
    bloodGroup:  'O+',
  },
  '19880622-07031-00002-13': {
    nationalId:  '19880622-07031-00002-13',
    firstName:   'Grace',
    middleName:  'Rose',
    surname:     'Mwamba',
    gender:      'FEMALE',
    dateOfBirth: '22 June 1988',
    age:          37,
    vitalStatus: 'ALIVE',
    village:     'Kinondoni',
    ward:        'Mwananyamala',
    district:    'Kinondoni',
    region:      'Dar es Salaam',
    maritalStatus: 'MARRIED',
    occupation:  'Registered Nurse',
    bloodGroup:  'A+',
  },
}

interface MockCitizen {
  nationalId: string; firstName: string; middleName: string; surname: string
  gender: string; dateOfBirth: string; age: number; vitalStatus: string
  village: string; ward: string; district: string; region: string
  maritalStatus: string; occupation: string; bloodGroup: string
}

// ─── Step indicator ────────────────────────────────────────────────────────────
function StepDot({ n, current, done }: { n: number; current: number; done: boolean }) {
  const active = n === current
  const bg   = done ? TZ.green : active ? H.primary : 'rgba(255,255,255,0.12)'
  const text = done ? '#fff'   : active ? '#fff'     : 'rgba(255,255,255,0.40)'
  return (
    <View style={{ alignItems: 'center', gap: 4 }}>
      <View style={[rb.dot, { backgroundColor: bg, borderColor: active ? H.primaryL : 'transparent' }]}>
        {done
          ? <Check size={10} color="#fff" />
          : <Text style={[rb.dotText, { color: text }]}>{n}</Text>
        }
      </View>
    </View>
  )
}

// ─── Field component ───────────────────────────────────────────────────────────
function Field({
  label, value, onChange, placeholder, keyboardType, maxLength, editable = true,
}: {
  label: string; value: string; onChange: (v: string) => void
  placeholder?: string; keyboardType?: any; maxLength?: number; editable?: boolean
}) {
  return (
    <View style={rb.field}>
      <Text style={rb.fieldLabel}>{label}</Text>
      <TextInput
        style={[rb.input, !editable && rb.inputDisabled]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder ?? ''}
        placeholderTextColor={DARK.textDim}
        keyboardType={keyboardType}
        maxLength={maxLength}
        editable={editable}
        autoCapitalize="words"
      />
    </View>
  )
}

// ─── Citizen card (shown after NID lookup) ─────────────────────────────────────
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
        {[
          ['Gender',      citizen.gender],
          ['Date of Birth', citizen.dateOfBirth],
          ['Age',         `${citizen.age} years`],
          ['Blood Group', citizen.bloodGroup],
          ['Occupation',  citizen.occupation],
          ['Region',      citizen.region],
          ['District',    citizen.district],
          ['Ward',        citizen.ward],
          ['Village',     citizen.village],
          ['Marital Status', citizen.maritalStatus],
        ].map(([k, v]) => (
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

  React.useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }),
        Animated.timing(fade,  { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start()
    } else {
      scale.setValue(0.6)
      fade.setValue(0)
    }
  }, [visible])

  return (
    <Modal visible={visible} transparent animationType="none">
      <Animated.View style={[rb.modalBg, { opacity: fade }]}>
        <Animated.View style={[rb.successCard, { transform: [{ scale }] }]}>
          {/* Header */}
          <LinearGradient
            colors={['#064e3b', '#065f46']}
            style={rb.successHeader}
          >
            <View style={rb.successIconWrap}>
              <CheckCircle2 size={36} color="#4ade80" />
            </View>
            <Text style={rb.successTitle}>Birth Registered!</Text>
            <Text style={rb.successSub}>Record successfully added to NBS Central Database</Text>
          </LinearGradient>

          {/* Body */}
          <View style={rb.successBody}>
            <Text style={rb.successChildName}>{childName}</Text>
            <Text style={rb.successChildSub}>New Citizen of Tanzania</Text>

            <View style={rb.successDivider} />

            {/* Generated National ID */}
            <View style={rb.successItem}>
              <Text style={rb.successItemLabel}>Generated National ID</Text>
              <View style={[rb.successBox, { borderColor: `${H.primary}50`, backgroundColor: `${H.primary}10` }]}>
                <Text style={[rb.successBoxVal, { color: H.primaryL }]}>{childNid}</Text>
              </View>
              <Text style={rb.successItemNote}>
                Child will collect physical ID card at age 18 from Village Officer
              </Text>
            </View>

            {/* Certificate number */}
            <View style={rb.successItem}>
              <Text style={rb.successItemLabel}>Birth Certificate Number</Text>
              <View style={[rb.successBox, { borderColor: `${TZ.green}50`, backgroundColor: `${TZ.green}10` }]}>
                <Text style={[rb.successBoxVal, { color: TZ.green }]}>{certNo}</Text>
              </View>
            </View>

            {/* RITA sync note */}
            <View style={rb.successRita}>
              <Shield size={13} color={H.primaryL} />
              <Text style={rb.successRitaText}>Certificate synced to internal RITA registry · QR signed by Govt PKI</Text>
            </View>

            <TouchableOpacity style={rb.successBtn} onPress={onClose} activeOpacity={0.85}>
              <Text style={rb.successBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  )
}

// ─── Screen ────────────────────────────────────────────────────────────────────
export default function RegisterBirthScreen({ navigation }: Props) {
  const [step, setStep] = useState(1)   // 1-4

  // Step 1 — child info
  const [childFirstName,  setChildFirstName]  = useState('')
  const [childMiddleName, setChildMiddleName] = useState('')
  const [childSurname,    setChildSurname]    = useState('')
  const [childGender,     setChildGender]     = useState<'MALE' | 'FEMALE' | ''>('')
  const [childDOB,        setChildDOB]        = useState('')   // DD/MM/YYYY

  // Step 2 — father
  const [fatherNid,      setFatherNid]      = useState('')
  const [fatherLookup,   setFatherLookup]   = useState<MockCitizen | null>(null)
  const [fatherLoading,  setFatherLoading]  = useState(false)
  const [fatherError,    setFatherError]    = useState('')

  // Step 3 — mother
  const [motherNid,      setMotherNid]      = useState('')
  const [motherLookup,   setMotherLookup]   = useState<MockCitizen | null>(null)
  const [motherLoading,  setMotherLoading]  = useState(false)
  const [motherError,    setMotherError]    = useState('')

  // Step 4 / submit
  const [submitting,     setSubmitting]     = useState(false)
  const [showSuccess,    setShowSuccess]    = useState(false)
  const [generatedNid,   setGeneratedNid]   = useState('')
  const [certNo,         setCertNo]         = useState('')

  // ── NID lookup simulation ─────────────────────────────────────────────────
  const lookupParent = useCallback(async (
    nid: string,
    role: 'father' | 'mother',
  ) => {
    const setLoading = role === 'father' ? setFatherLoading : setMotherLoading
    const setError   = role === 'father' ? setFatherError   : setMotherError
    const setResult  = role === 'father' ? setFatherLookup  : setMotherLookup

    setLoading(true)
    setError('')
    setResult(null)

    // Simulate network latency
    await new Promise<void>(r => setTimeout(r, 900))

    const found = MOCK_CITIZENS[nid.trim()]
    if (!found) {
      setError('National ID not found in NBS Central Database. Verify and try again.')
      setLoading(false)
      return
    }
    if (found.vitalStatus !== 'ALIVE') {
      setError('Citizen record shows DECEASED. Cannot link as parent.')
      setLoading(false)
      return
    }
    if (found.age < 18) {
      setError('Citizen is under 18 years old. Cannot register as parent.')
      setLoading(false)
      return
    }
    if (role === 'father' && found.gender !== 'MALE') {
      setError('NID belongs to a female citizen. Enter the father\'s NID.')
      setLoading(false)
      return
    }
    if (role === 'mother' && found.gender !== 'FEMALE') {
      setError('NID belongs to a male citizen. Enter the mother\'s NID.')
      setLoading(false)
      return
    }

    setResult(found)
    setLoading(false)
  }, [])

  // ── Generate NID for newborn ──────────────────────────────────────────────
  const generateChildNid = (): string => {
    // Format: YYYYMMDD-LLLLL-SSSSS-CC
    // DOB comes from childDOB: DD/MM/YYYY
    const parts = childDOB.replace(/-/g, '/').split('/')
    const d = parts[0]?.padStart(2, '0') ?? '00'
    const m = parts[1]?.padStart(2, '0') ?? '00'
    const y = parts[2] ?? '2026'
    const dob8 = `${y}${m}${d}`
    const seq  = Math.floor(Math.random() * 90000 + 10000)
    const cc   = Math.floor(Math.random() * 90 + 10)
    return `${dob8}-07031-${String(seq).padStart(5, '0')}-${cc}`
  }

  const generateCertNo = (): string => {
    const seq = Math.floor(Math.random() * 90000000 + 10000000)
    return `${seq} A`
  }

  // ── Submit ───────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setSubmitting(true)
    await new Promise<void>(r => setTimeout(r, 1400))
    const nid  = generateChildNid()
    const cert = generateCertNo()
    setGeneratedNid(nid)
    setCertNo(cert)
    setSubmitting(false)
    setShowSuccess(true)
  }

  // ── Validation helpers ────────────────────────────────────────────────────
  const step1Valid = childFirstName.trim() && childSurname.trim() && childGender && childDOB.length >= 8
  const step2Valid = !!fatherLookup
  const step3Valid = !!motherLookup

  const childFullName = [childFirstName, childMiddleName, childSurname].filter(Boolean).join(' ').toUpperCase()

  // ── Step renders ──────────────────────────────────────────────────────────
  const renderStep1 = () => (
    <View style={rb.stepContent}>
      <Text style={rb.stepTitle}>Child Information</Text>
      <Text style={rb.stepDesc}>
        Enter the newborn's details exactly as they will appear on the birth certificate.
      </Text>

      <Field label="First Name *" value={childFirstName} onChange={setChildFirstName} placeholder="e.g. Amani" />
      <Field label="Middle Name" value={childMiddleName} onChange={setChildMiddleName} placeholder="Optional" />
      <Field label="Surname *" value={childSurname} onChange={setChildSurname} placeholder="e.g. Makonde" />

      {/* Gender selector */}
      <View style={rb.field}>
        <Text style={rb.fieldLabel}>Gender *</Text>
        <View style={rb.genderRow}>
          {(['MALE', 'FEMALE'] as const).map(g => (
            <TouchableOpacity
              key={g}
              style={[
                rb.genderBtn,
                childGender === g && { backgroundColor: g === 'MALE' ? `${H.primary}25` : '#8b5cf620', borderColor: g === 'MALE' ? H.primaryL : '#a78bfa' },
              ]}
              onPress={() => setChildGender(g)}
              activeOpacity={0.7}
            >
              <Text style={{ fontSize: 18 }}>{g === 'MALE' ? '👦' : '👧'}</Text>
              <Text style={[rb.genderText, childGender === g && { color: g === 'MALE' ? H.primaryL : '#c4b5fd' }]}>{g}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Date of birth */}
      <View style={rb.field}>
        <Text style={rb.fieldLabel}>Date of Birth * (DD/MM/YYYY)</Text>
        <TextInput
          style={rb.input}
          value={childDOB}
          onChangeText={setChildDOB}
          placeholder="e.g. 08/05/2026"
          placeholderTextColor={DARK.textDim}
          keyboardType="numeric"
          maxLength={10}
        />
      </View>

      <View style={rb.infoBox}>
        <AlertCircle size={13} color={H.primaryL} />
        <Text style={rb.infoText}>
          A unique National ID will be auto-generated by the system upon registration. The child will collect
          their physical ID card at age 18 from the Village Officer.
        </Text>
      </View>
    </View>
  )

  const renderParentStep = (role: 'father' | 'mother') => {
    const isFather  = role === 'father'
    const nid       = isFather ? fatherNid      : motherNid
    const setNid    = isFather ? setFatherNid    : setMotherNid
    const lookup    = isFather ? fatherLookup    : motherLookup
    const loading   = isFather ? fatherLoading   : motherLoading
    const error     = isFather ? fatherError     : motherError
    const testNid   = isFather ? '19850315-07031-00001-24' : '19880622-07031-00002-13'
    const accentCol = isFather ? H.primary : '#8b5cf6'

    return (
      <View style={rb.stepContent}>
        <Text style={rb.stepTitle}>{isFather ? 'Father' : 'Mother'} Identification</Text>
        <Text style={rb.stepDesc}>
          Enter the {isFather ? "father's" : "mother's"} National ID. The system will validate
          the record in the NBS Central Database and confirm eligibility.
        </Text>

        {/* NID input */}
        <View style={rb.field}>
          <Text style={rb.fieldLabel}>National ID Number *</Text>
          <View style={rb.nidRow}>
            <TextInput
              style={[rb.input, { flex: 1 }]}
              value={nid}
              onChangeText={v => { setNid(v); }}
              placeholder="YYYYMMDD-LLLLL-SSSSS-CC"
              placeholderTextColor={DARK.textDim}
              autoCapitalize="characters"
              maxLength={23}
            />
            <TouchableOpacity
              style={[rb.lookupBtn, { backgroundColor: accentCol, opacity: nid.length >= 20 ? 1 : 0.45 }]}
              onPress={() => lookupParent(nid, role)}
              disabled={nid.length < 20 || loading}
              activeOpacity={0.8}
            >
              {loading
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={rb.lookupBtnText}>Search</Text>
              }
            </TouchableOpacity>
          </View>

          {/* Quick-fill for testing */}
          <TouchableOpacity
            style={rb.autofill}
            onPress={() => {
              setNid(testNid)
              lookupParent(testNid, role)
            }}
          >
            <Text style={[rb.autofillText, { color: accentCol }]}>
              ⚡ Auto-fill test {isFather ? 'father' : 'mother'} ID
            </Text>
          </TouchableOpacity>
        </View>

        {/* Error */}
        {!!error && (
          <View style={rb.errorBox}>
            <AlertCircle size={14} color="#f87171" />
            <Text style={rb.errorText}>{error}</Text>
          </View>
        )}

        {/* Loading skeleton */}
        {loading && (
          <View style={rb.loadingCard}>
            <ActivityIndicator color={accentCol} />
            <Text style={[rb.loadingText, { color: accentCol }]}>Querying NBS Central Database…</Text>
          </View>
        )}

        {/* Confirmed citizen card */}
        {lookup && <CitizenCard citizen={lookup} role={isFather ? 'Father' : 'Mother'} />}

        {/* Format hint */}
        <View style={rb.infoBox}>
          <Shield size={12} color={H.primaryL} />
          <Text style={rb.infoText}>
            Format: YYYYMMDD-LLLLL-SSSSS-CC · All lookups are internal — no external API calls.
          </Text>
        </View>
      </View>
    )
  }

  const renderStep4 = () => (
    <View style={rb.stepContent}>
      <Text style={rb.stepTitle}>Review & Confirm</Text>
      <Text style={rb.stepDesc}>
        Verify all details before submitting. This record will be permanently stored
        in the NBS Central Database.
      </Text>

      {/* Child summary */}
      <View style={[rb.reviewSection, { borderColor: `${TZ.green}40`, backgroundColor: `${TZ.green}08` }]}>
        <View style={rb.reviewSectionHead}>
          <Baby size={15} color={TZ.green} />
          <Text style={[rb.reviewSectionTitle, { color: TZ.green }]}>Newborn</Text>
        </View>
        {[
          ['Full Name', childFullName],
          ['Gender',    childGender],
          ['Date of Birth', childDOB],
          ['Facility',  'Dodoma Regional Hospital'],
        ].map(([k, v]) => (
          <View key={k} style={rb.reviewRow}>
            <Text style={rb.reviewKey}>{k}</Text>
            <Text style={rb.reviewVal}>{v}</Text>
          </View>
        ))}
      </View>

      {/* Father summary */}
      {fatherLookup && (
        <View style={[rb.reviewSection, { borderColor: `${H.primary}40`, backgroundColor: `${H.primary}08` }]}>
          <View style={rb.reviewSectionHead}>
            <User size={15} color={H.primaryL} />
            <Text style={[rb.reviewSectionTitle, { color: H.primaryL }]}>Father</Text>
          </View>
          <View style={rb.reviewRow}>
            <Text style={rb.reviewKey}>Full Name</Text>
            <Text style={rb.reviewVal}>{fatherLookup.firstName} {fatherLookup.middleName} {fatherLookup.surname}</Text>
          </View>
          <View style={rb.reviewRow}>
            <Text style={rb.reviewKey}>National ID</Text>
            <Text style={rb.reviewVal}>{fatherLookup.nationalId}</Text>
          </View>
        </View>
      )}

      {/* Mother summary */}
      {motherLookup && (
        <View style={[rb.reviewSection, { borderColor: '#8b5cf640', backgroundColor: '#8b5cf608' }]}>
          <View style={rb.reviewSectionHead}>
            <User size={15} color="#c4b5fd" />
            <Text style={[rb.reviewSectionTitle, { color: '#c4b5fd' }]}>Mother</Text>
          </View>
          <View style={rb.reviewRow}>
            <Text style={rb.reviewKey}>Full Name</Text>
            <Text style={rb.reviewVal}>{motherLookup.firstName} {motherLookup.middleName} {motherLookup.surname}</Text>
          </View>
          <View style={rb.reviewRow}>
            <Text style={rb.reviewKey}>National ID</Text>
            <Text style={rb.reviewVal}>{motherLookup.nationalId}</Text>
          </View>
        </View>
      )}

      {/* Declaration */}
      <View style={rb.declarationBox}>
        <FileText size={13} color={DARK.textSub} />
        <Text style={rb.declarationText}>
          I, the registering officer, certify that the information provided is accurate
          and complete to the best of my knowledge, as required under the Births and Deaths
          Registration Act (Cap 108 R.E. 2002) of the United Republic of Tanzania.
        </Text>
      </View>
    </View>
  )

  // ── Nav helpers ───────────────────────────────────────────────────────────
  const canNext = () => {
    if (step === 1) return !!step1Valid
    if (step === 2) return !!step2Valid
    if (step === 3) return !!step3Valid
    return true
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: DARK.bg }} edges={['top']}>
      <StatusBar barStyle="light-content" />

      {/* ── HEADER ──────────────────────────────────────────────────────── */}
      <ImageBackground
        source={require('../../../public/assets/flag.jpg')}
        style={rb.headerBg}
        blurRadius={2}
        resizeMode="cover"
      >
        <LinearGradient
          colors={['rgba(2,20,60,0.70)', 'rgba(8,50,80,0.65)']}
          style={StyleSheet.absoluteFill}
        />
        <View style={rb.flagStripe}>
          <View style={{ flex: 3, backgroundColor: TZ.green }} />
          <View style={{ width: 9, backgroundColor: TZ.yellow }} />
          <View style={{ width: 7, backgroundColor: TZ.black  }} />
          <View style={{ width: 9, backgroundColor: TZ.yellow }} />
          <View style={{ flex: 3, backgroundColor: TZ.blue   }} />
        </View>

        <View style={rb.headerRow}>
          <TouchableOpacity
            style={rb.backBtn}
            onPress={() => step > 1 ? setStep(s => s - 1) : navigation.goBack()}
          >
            <ChevronLeft size={20} color="#fff" />
          </TouchableOpacity>

          <View style={{ flex: 1, alignItems: 'center' }}>
            <View style={rb.headerIconWrap}>
              <Baby size={18} color={TZ.green} />
            </View>
            <Text style={rb.headerTitle}>Register Birth</Text>
            <Text style={rb.headerSub}>NBS · Births & Deaths Registration Act</Text>
          </View>

          {/* Coat of arms */}
          <View style={rb.coatSmall}>
            <Image
              source={require('../../../public/assets/court_of_arm.png')}
              style={{ width: 32, height: 32 }}
              resizeMode="contain"
            />
          </View>
        </View>

        {/* Step indicator */}
        <View style={rb.stepsRow}>
          {[1, 2, 3, 4].map(n => (
            <React.Fragment key={n}>
              <StepDot n={n} current={step} done={n < step} />
              {n < 4 && (
                <View style={[rb.stepLine, { backgroundColor: n < step ? TZ.green : 'rgba(255,255,255,0.15)' }]} />
              )}
            </React.Fragment>
          ))}
        </View>
        <View style={rb.stepsLabels}>
          {['Child Info', 'Father', 'Mother', 'Review'].map((l, i) => (
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
            {step === 1 && renderStep1()}
            {step === 2 && renderParentStep('father')}
            {step === 3 && renderParentStep('mother')}
            {step === 4 && renderStep4()}
          </View>
        </ScrollView>

        {/* ── NAV FOOTER ────────────────────────────────────────────────── */}
        <View style={rb.navFooter}>
          {/* Progress bar */}
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
                style={[rb.nextBtn, !canNext() && rb.nextBtnDisabled]}
                onPress={() => setStep(s => s + 1)}
                disabled={!canNext()}
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
                  : <><Check size={18} color="#fff" /><Text style={rb.submitBtnText}>Register Birth</Text></>
                }
              </TouchableOpacity>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* ── SUCCESS MODAL ──────────────────────────────────────────────── */}
      <SuccessModal
        visible={showSuccess}
        childName={childFullName}
        childNid={generatedNid}
        certNo={certNo}
        onClose={() => {
          setShowSuccess(false)
          navigation.goBack()
        }}
      />
    </SafeAreaView>
  )
}

// ─── Styles ────────────────────────────────────────────────────────────────────
const rb = StyleSheet.create({
  // Header
  headerBg:     { overflow: 'hidden' },
  flagStripe:   { flexDirection: 'row', height: 4 },
  headerRow:    {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, gap: 10,
  },
  backBtn:      {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerIconWrap:{ width: 32, height: 32, borderRadius: 10, backgroundColor: `${TZ.green}20`, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  headerTitle:  { fontSize: 16, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
  headerSub:    { fontSize: 9, color: 'rgba(255,255,255,0.60)', marginTop: 2 },
  coatSmall:    {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center', justifyContent: 'center',
  },

  // Steps
  stepsRow:    {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 28, paddingBottom: 8, paddingTop: 4, gap: 0,
  },
  dot:         {
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5,
  },
  dotText:     { fontSize: 10, fontWeight: '700' },
  stepLine:    { flex: 1, height: 2, borderRadius: 1 },
  stepsLabels: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12,
  },
  stepLabel:   { fontSize: 9, color: 'rgba(255,255,255,0.45)', width: (W - 32) / 4, textAlign: 'center' },

  // Body
  body: { padding: 16 },

  // Step content
  stepContent: { gap: 14 },
  stepTitle:   { fontSize: 18, fontWeight: '800', color: DARK.text, marginBottom: 2 },
  stepDesc:    { fontSize: 12, color: DARK.textSub, lineHeight: 18, marginBottom: 4 },

  // Fields
  field:        { gap: 6 },
  fieldLabel:   { fontSize: 12, fontWeight: '600', color: DARK.textSub },
  input:        {
    backgroundColor: DARK.input, borderWidth: 1, borderColor: DARK.inputBorder,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    color: DARK.text, fontSize: 14,
  },
  inputDisabled:{ opacity: 0.5 },

  // Gender
  genderRow: { flexDirection: 'row', gap: 10 },
  genderBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 10, borderWidth: 1.5, borderColor: DARK.inputBorder,
    backgroundColor: DARK.input, paddingVertical: 12,
  },
  genderText: { fontSize: 13, fontWeight: '600', color: DARK.textSub },

  // NID row
  nidRow:        { flexDirection: 'row', gap: 8 },
  lookupBtn:     { borderRadius: 10, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', minWidth: 76 },
  lookupBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  // Autofill hint
  autofill:     { paddingTop: 4 },
  autofillText: { fontSize: 11, fontWeight: '600' },

  // Info / error boxes
  infoBox:   {
    flexDirection: 'row', gap: 8, backgroundColor: `${H.primary}10`,
    borderRadius: 10, padding: 12, borderWidth: 1, borderColor: `${H.primary}30`,
    alignItems: 'flex-start',
  },
  infoText:  { fontSize: 11, color: DARK.textSub, flex: 1, lineHeight: 17 },
  errorBox:  {
    flexDirection: 'row', gap: 8, backgroundColor: 'rgba(239,68,68,0.12)',
    borderRadius: 10, padding: 12, borderWidth: 1, borderColor: 'rgba(239,68,68,0.35)',
    alignItems: 'flex-start',
  },
  errorText: { fontSize: 12, color: '#f87171', flex: 1, lineHeight: 17 },

  // Loading card
  loadingCard: {
    flexDirection: 'row', gap: 12, alignItems: 'center', justifyContent: 'center',
    backgroundColor: DARK.card, borderRadius: 12, padding: 18,
    borderWidth: 1, borderColor: DARK.border,
  },
  loadingText: { fontSize: 13, fontWeight: '600' },

  // Citizen card
  citizenCard: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  citizenTop:  { flexDirection: 'row', gap: 12, padding: 14, borderBottomWidth: 1, alignItems: 'flex-start' },
  citizenAvatar:{ width: 42, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  citizenName: { fontSize: 14, fontWeight: '800', color: DARK.text, marginBottom: 3 },
  citizenNid:  { fontSize: 10, color: DARK.textDim, fontFamily: 'monospace', marginBottom: 6 },
  vitalBadge:  {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    alignSelf: 'flex-start', borderRadius: 20, borderWidth: 1,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  vitalDot:    { width: 5, height: 5, borderRadius: 2.5 },
  vitalText:   { fontSize: 8, fontWeight: '700', letterSpacing: 0.5 },
  rolePill:    {
    borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  rolePillText:{ fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  citizenGrid: { padding: 14, gap: 8 },
  citizenRow:  { flexDirection: 'row', justifyContent: 'space-between' },
  citizenKey:  { fontSize: 11, color: DARK.textDim, width: '40%' },
  citizenVal:  { fontSize: 11, color: DARK.text, fontWeight: '600', flex: 1, textAlign: 'right' },

  // Review step
  reviewSection:    { borderRadius: 12, borderWidth: 1, overflow: 'hidden', marginBottom: 4 },
  reviewSectionHead:{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, paddingBottom: 10 },
  reviewSectionTitle:{ fontSize: 12, fontWeight: '800', letterSpacing: 0.5 },
  reviewRow:        { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 6 },
  reviewKey:        { fontSize: 11, color: DARK.textDim, width: '40%' },
  reviewVal:        { fontSize: 11, color: DARK.text, fontWeight: '600', flex: 1, textAlign: 'right' },
  declarationBox:   {
    flexDirection: 'row', gap: 8, backgroundColor: DARK.card,
    borderRadius: 10, padding: 14, borderWidth: 1, borderColor: DARK.border,
  },
  declarationText:  { fontSize: 10, color: DARK.textDim, flex: 1, lineHeight: 16, fontStyle: 'italic' },

  // Nav footer
  navFooter:    {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: DARK.card, borderTopWidth: 1, borderTopColor: DARK.border,
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 28,
  },
  progressTrack:{ height: 3, backgroundColor: DARK.border, borderRadius: 2, marginBottom: 6 },
  progressFill: { height: 3, backgroundColor: H.primary, borderRadius: 2 },
  progressText: { fontSize: 10, color: DARK.textDim, marginBottom: 10 },
  navBtns:      { flexDirection: 'row', gap: 10 },
  prevBtn:      {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 12, borderWidth: 1, borderColor: DARK.border,
    paddingHorizontal: 16, paddingVertical: 12,
  },
  prevBtnText:  { fontSize: 14, color: DARK.textSub, fontWeight: '600' },
  nextBtn:      {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: H.primary, borderRadius: 12, paddingVertical: 13,
  },
  nextBtnDisabled:{ opacity: 0.38 },
  nextBtnText:  { fontSize: 14, fontWeight: '700', color: '#fff' },
  submitBtn:    {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: TZ.green, borderRadius: 12, paddingVertical: 13,
  },
  submitBtnText:{ fontSize: 14, fontWeight: '700', color: '#fff' },

  // Success modal
  modalBg:        {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center', justifyContent: 'center', padding: 20,
  },
  successCard:    {
    width: '100%', borderRadius: 20, overflow: 'hidden',
    backgroundColor: DARK.card,
    shadowColor: '#000', shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.60, shadowRadius: 24, elevation: 24,
  },
  successHeader:  { alignItems: 'center', padding: 24, gap: 10 },
  successIconWrap:{ width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(74,222,128,0.15)', alignItems: 'center', justifyContent: 'center' },
  successTitle:   { fontSize: 22, fontWeight: '900', color: '#fff' },
  successSub:     { fontSize: 12, color: 'rgba(255,255,255,0.65)', textAlign: 'center' },
  successBody:    { padding: 20, gap: 12 },
  successChildName:{ fontSize: 18, fontWeight: '900', color: DARK.text, textAlign: 'center' },
  successChildSub: { fontSize: 12, color: DARK.textSub, textAlign: 'center', marginTop: -6 },
  successDivider: { height: 1, backgroundColor: DARK.border },
  successItem:    { gap: 6 },
  successItemLabel:{ fontSize: 11, color: DARK.textDim, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  successBox:     { borderRadius: 10, borderWidth: 1, padding: 12 },
  successBoxVal:  { fontSize: 14, fontWeight: '800', fontFamily: 'monospace', letterSpacing: 0.5 },
  successItemNote:{ fontSize: 10, color: DARK.textDim, fontStyle: 'italic' },
  successRita:    {
    flexDirection: 'row', gap: 8, alignItems: 'center',
    backgroundColor: `${H.primary}12`, borderRadius: 8, padding: 10,
  },
  successRitaText: { fontSize: 10, color: DARK.textSub, flex: 1 },
  successBtn:     { backgroundColor: H.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  successBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },
})
