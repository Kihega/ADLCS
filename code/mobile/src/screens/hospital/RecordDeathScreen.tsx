/**
 * RecordDeathScreen.tsx — Death Recording  v3.0  PRODUCTION
 *
 * Keyboard fix: StableField defined at module level (never remounts).
 * Calendar picker: custom scroll modal, no external packages.
 * Saves to local SQLite first, generates PDF cert, auto-syncs online.
 */

import React, { useState, useRef, useCallback, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, Modal,
  KeyboardAvoidingView, Platform, Animated,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import AsyncStorage      from '@react-native-async-storage/async-storage'
import * as Clipboard    from 'expo-clipboard'
import {
  ArrowLeft, Cross, Search, User, Calendar, CheckCircle2, X, Copy, Shield, Download,
} from 'lucide-react-native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'

import { generateDeathCertNo, updateDeathCertPath } from '../../services/localDb'
import { sharePdf } from '../../services/certificateService'
import { triggerSync, saveAndSyncDeath } from '../../services/syncService'
import { useTheme, TZ } from '../../context/ThemeContext'

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? process.env.EXPO_PUBLIC_API_URL_PRIMARY
type RootStack = { HospitalHome: undefined; RecordDeath: undefined }
type Props = { navigation: NativeStackNavigationProp<RootStack, 'RecordDeath'> }
type LocationType  = 'health_facility'|'home'|'public_place'|'other'
type DeathCategory = 'infant'|'child'|'adult'|'maternal'

// ─── Calendar picker (module-level, no remount) ───────────────────────────────
function CalPicker({ visible, title, onSelect, onClose }: {
  visible: boolean; title: string; onSelect:(v:string)=>void; onClose:()=>void
}) {
  const curY   = new Date().getFullYear()
  const MONTHS = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December']
  const [yr,  setYr]  = useState(curY)
  const [mo,  setMo]  = useState(new Date().getMonth()+1)
  const [day, setDay] = useState(new Date().getDate())
  const daysIn = new Date(yr, mo, 0).getDate()
  if (!visible) return null
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex:1, justifyContent:'flex-end', backgroundColor:'rgba(0,0,0,0.65)' }}>
        <View style={{ backgroundColor:'#0d1f38', borderTopLeftRadius:24, borderTopRightRadius:24, padding:20, paddingBottom:36 }}>
          <View style={{ width:40, height:4, backgroundColor:'#1e3a5f', borderRadius:2, alignSelf:'center', marginBottom:16 }} />
          <View style={{ flexDirection:'row', alignItems:'center', gap:8, marginBottom:14 }}>
            <Calendar size={15} color="#22d3ee" />
            <Text style={{ flex:1, fontSize:15, fontWeight:'800', color:'#f8fafc' }}>{title}</Text>
            <TouchableOpacity onPress={onClose}><X size={17} color="#94a3b8" /></TouchableOpacity>
          </View>
          <View style={{ flexDirection:'row', gap:6, height:200 }}>
            {/* Day */}
            <View style={{ flex:1 }}>
              <Text style={{ fontSize:10, color:'#4b6080', textAlign:'center', marginBottom:4 }}>Day</Text>
              <ScrollView showsVerticalScrollIndicator={false}>
                {Array.from({length:daysIn},(_,i)=>i+1).map(d=>(
                  <TouchableOpacity key={d} onPress={()=>setDay(d)} style={{ paddingVertical:9, alignItems:'center', borderRadius:8, marginVertical:2, backgroundColor:d===day?'#0891b230':'transparent' }}>
                    <Text style={{ fontSize:13, color:d===day?'#22d3ee':'#94a3b8', fontWeight:d===day?'800':'400' }}>{String(d).padStart(2,'0')}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
            {/* Month */}
            <View style={{ flex:2 }}>
              <Text style={{ fontSize:10, color:'#4b6080', textAlign:'center', marginBottom:4 }}>Month</Text>
              <ScrollView showsVerticalScrollIndicator={false}>
                {MONTHS.map((name,i)=>(
                  <TouchableOpacity key={name} onPress={()=>setMo(i+1)} style={{ paddingVertical:9, alignItems:'center', borderRadius:8, marginVertical:2, backgroundColor:i+1===mo?'#0891b230':'transparent' }}>
                    <Text style={{ fontSize:13, color:i+1===mo?'#22d3ee':'#94a3b8', fontWeight:i+1===mo?'800':'400' }}>{name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
            {/* Year */}
            <View style={{ flex:1.5 }}>
              <Text style={{ fontSize:10, color:'#4b6080', textAlign:'center', marginBottom:4 }}>Year</Text>
              <ScrollView showsVerticalScrollIndicator={false}>
                {Array.from({length:120},(_,i)=>curY-i).map(y=>(
                  <TouchableOpacity key={y} onPress={()=>setYr(y)} style={{ paddingVertical:9, alignItems:'center', borderRadius:8, marginVertical:2, backgroundColor:y===yr?'#0891b230':'transparent' }}>
                    <Text style={{ fontSize:13, color:y===yr?'#22d3ee':'#94a3b8', fontWeight:y===yr?'800':'400' }}>{y}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
          <View style={{ flexDirection:'row', gap:10, marginTop:16 }}>
            <TouchableOpacity onPress={onClose} style={{ flex:1, borderWidth:1, borderColor:'#1e3a5f', borderRadius:12, paddingVertical:13, alignItems:'center' }}>
              <Text style={{ color:'#94a3b8', fontWeight:'600' }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={()=>onSelect(`${String(day).padStart(2,'0')}/${String(mo).padStart(2,'0')}/${yr}`)}
              style={{ flex:2, backgroundColor:'#0891b2', borderRadius:12, paddingVertical:13, alignItems:'center' }}
            >
              <Text style={{ color:'#fff', fontWeight:'800' }}>Confirm Date</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )
}

// ─── StableField: defined at MODULE level — never remounts on parent re-render ─
interface FieldProps {
  label:string; value:string; onChangeText:(v:string)=>void
  placeholder?:string; multiline?:boolean
  returnKeyType?:'next'|'done'; onSubmitEditing?:()=>void
  inputRef?: React.RefObject<TextInput>
  bg:string; bc:string; tc:string; dc:string
}
const StableField = React.memo(function StableField({
  label, value, onChangeText, placeholder, multiline=false,
  returnKeyType='next', onSubmitEditing, inputRef, bg, bc, tc, dc,
}: FieldProps) {
  return (
    <View style={{ marginBottom:14 }}>
      <Text style={{ fontSize:12, fontWeight:'600', color:dc, marginBottom:6 }}>{label}</Text>
      <TextInput
        ref={inputRef}
        style={[sf.input, { backgroundColor:bg, borderColor:bc, color:tc }, multiline&&sf.multi]}
        value={value} onChangeText={onChangeText}
        placeholder={placeholder??''} placeholderTextColor={dc}
        multiline={multiline} textAlignVertical={multiline?'top':'center'}
        autoCapitalize="characters"
        returnKeyType={returnKeyType} blurOnSubmit={false}
        onSubmitEditing={onSubmitEditing}
      />
    </View>
  )
})
const sf = StyleSheet.create({
  input: { borderWidth:1, borderRadius:10, paddingHorizontal:14, paddingVertical:12, fontSize:14 },
  multi: { height:90, paddingTop:12 },
})

// ─── Toast ─────────────────────────────────────────────────────────────────────
function Toast({ message, visible }: { message:string; visible:boolean }) {
  const op = useRef(new Animated.Value(0)).current
  useEffect(()=>{
    if (visible) Animated.sequence([
      Animated.timing(op,{toValue:1,duration:200,useNativeDriver:true}),
      Animated.delay(1600),
      Animated.timing(op,{toValue:0,duration:300,useNativeDriver:true}),
    ]).start()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[visible])
  return (
    <Animated.View style={{ position:'absolute', bottom:120, alignSelf:'center', backgroundColor:TZ.green, borderRadius:20, paddingHorizontal:18, paddingVertical:10, flexDirection:'row', alignItems:'center', gap:8, opacity:op, elevation:9 }} pointerEvents="none">
      <CheckCircle2 size={14} color="#fff" />
      <Text style={{ color:'#fff', fontWeight:'700', fontSize:13 }}>{message}</Text>
    </Animated.View>
  )
}

// ─── Screen ────────────────────────────────────────────────────────────────────
export default function RecordDeathScreen({ navigation }: Props) {
  const { theme: T } = useTheme()

  // ── Step state (1=Type, 2=Lookup, 3=Details, 4=Issued) ───────────────────
  const [step,        setStep]        = useState<1|2|3|4>(1)

  // Step 1: INFANT or ADULT selection (Spec §2.8 Case B)
  const [deathType,   setDeathType]   = useState<'infant'|'adult'|''>('')

  // Step 2 — ADULT: citizen lookup
  const [lookupId,    setLookupId]    = useState('')
  const [lookupLoad,  setLookupLoad]  = useState(false)
  const [citizen,     setCitizen]     = useState<any>(null)

  // Step 2 — INFANT: parent NID lookup (no citizen NIN — infant died before registration)
  const [fatherNid,   setFatherNid]   = useState('')
  const [fatherData,  setFatherData]  = useState<any>(null)
  const [fatherLoad,  setFatherLoad]  = useState(false)
  const [fatherError, setFatherError] = useState('')
  const [motherNid,   setMotherNid]   = useState('')
  const [motherData,  setMotherData]  = useState<any>(null)
  const [motherLoad,  setMotherLoad]  = useState(false)
  const [motherError, setMotherError] = useState('')

  // Step 3: Death details
  const [cause,       setCause]       = useState('')
  const [dod,         setDod]         = useState('')
  const [showCal,     setShowCal]     = useState(false)
  const [locType,     setLocType]     = useState<LocationType>('health_facility')
  const [category,    setCategory]    = useState<DeathCategory>('adult')
  const [informant,   setInformant]   = useState('')

  // Step 4: outcome
  const [submitting,  setSubmitting]  = useState(false)
  const [savedCertNo, setSavedCertNo] = useState('')
  const [savedId,     setSavedId]     = useState('')
  const [pdfPath,     setPdfPath]     = useState('')
  const [downloading, setDownloading] = useState(false)
  const [toast,       setToast]       = useState('')
  const [toastVis,    setToastVis]    = useState(false)

  const causeRef     = useRef<TextInput>(null)
  const informantRef = useRef<TextInput>(null)

  const LOC_TYPES: {val:LocationType;label:string}[] = [
    {val:'health_facility',label:'Health Facility'},{val:'home',label:'Home'},
    {val:'public_place',label:'Public Place'},{val:'other',label:'Other'},
  ]
  // For ADULT: allow sub-category; for INFANT: category is locked to 'infant'
  const ADULT_CATEGORIES: {val:DeathCategory;label:string}[] = [
    {val:'child',label:'Child (1–17)'},{val:'adult',label:'Adult (18+)'},{val:'maternal',label:'Maternal'},
  ]

  // NIN formatter (for parent lookup in INFANT case)
  const formatNIN = (raw: string) => {
    const clean = raw.replace(/[^0-9]/g, '')
    let out = clean.slice(0, 8)
    if (clean.length > 8)  out += '-' + clean.slice(8,  13)
    if (clean.length > 13) out += '-' + clean.slice(13, 18)
    if (clean.length > 18) out += '-' + clean.slice(18, 20)
    return out
  }
  const isNINComplete = (nin: string) => /^\d{8}-\d{5}-\d{5}-\d{2}$/.test(nin)

  // ── ADULT: Citizen lookup ─────────────────────────────────────────────────
  const lookupCitizen = useCallback(async () => {
    if (!lookupId.trim()) { Alert.alert('Error','Enter a National ID or name.'); return }
    setLookupLoad(true)
    try {
      const token = await AsyncStorage.getItem('adlcs_access_token')
      if (token) {
        const _c1 = new AbortController(); const _t1 = setTimeout(() => _c1.abort(), 5000)
        const res  = await fetch(`${API_BASE}/officer/citizen-lookup?q=${encodeURIComponent(lookupId.trim())}`,
          { headers:{ Authorization:`Bearer ${token}` }, signal: _c1.signal })
        clearTimeout(_t1)
        const json = await res.json()
        if (json.success && json.data) { setCitizen(json.data); setLookupLoad(false); return }
      }
    } catch { /* offline fallback */ }
    Alert.alert('Not Found in DB', 'No record found online. Proceed with manual name entry?', [
      { text:'Cancel', style:'cancel' },
      { text:'Manual Entry', onPress:()=>{ setCitizen({ fullName:lookupId.trim(), nationalId:lookupId.trim() }) } },
    ])
    setLookupLoad(false)
  }, [lookupId])

  // ── INFANT: Parent NID lookup ─────────────────────────────────────────────
  const lookupParent = useCallback(async (nid: string, role: 'father'|'mother') => {
    const isFather = role === 'father'
    const setLoad  = isFather ? setFatherLoad  : setMotherLoad
    const setErr   = isFather ? setFatherError : setMotherError
    const setData  = isFather ? setFatherData  : setMotherData
    setLoad(true); setErr(''); setData(null)
    try {
      const token = await AsyncStorage.getItem('adlcs_access_token')
      if (token) {
        const _c2 = new AbortController(); const _t2 = setTimeout(() => _c2.abort(), 5000)
        const res  = await fetch(`${API_BASE}/officer/citizen-lookup?q=${encodeURIComponent(nid.trim())}`,
          { headers:{ Authorization:`Bearer ${token}` }, signal: _c2.signal })
        clearTimeout(_t2)
        const json = await res.json()
        if (json.success && json.data) {
          const d = json.data
          if (isFather && d.gender?.toUpperCase() !== 'MALE')   { setErr('This NID belongs to a female citizen.'); setLoad(false); return }
          if (!isFather && d.gender?.toUpperCase() !== 'FEMALE'){ setErr('This NID belongs to a male citizen.');   setLoad(false); return }
          setData(d); setLoad(false); return
        }
      }
    } catch { /* fall through */ }
    setErr('National ID not found in NBS Central Database (device may be offline).')
    setLoad(false)
  }, [])

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (!cause.trim())     { Alert.alert('Required','Enter cause of death.'); return }
    if (!dod.trim())       { Alert.alert('Required','Select date of death.'); return }
    if (!informant.trim()) { Alert.alert('Required','Enter informant name.'); return }
    setSubmitting(true)

    try {
      const token = await AsyncStorage.getItem('adlcs_access_token')
      let officerName = '', facilityName = ''
      if (token) {
        try {
          const _dc = new AbortController(); const _dt = setTimeout(() => _dc.abort(), 5000)
          const r = await fetch(`${API_BASE}/officer/dashboard`, { headers:{ Authorization:`Bearer ${token}` }, signal: _dc.signal })
          clearTimeout(_dt)
          const j = await r.json()
          if (j.success) { officerName=j.data.officerName; facilityName=j.data.facilityName }
        } catch {}
      }

      const certNo = generateDeathCertNo()

      let nationalId   = ''
      let deceasedName = ''
      let finalCategory: DeathCategory = category

      if (deathType === 'infant') {
        // Spec §2.8 Case B — INFANT: no citizen NIN exists yet
        // Link parents; category is always 'infant'
        finalCategory = 'infant'
        nationalId   = `INFANT-${fatherData?.nationalId ?? 'UNK'}`
        deceasedName = `INFANT OF ${
          fatherData ? `${fatherData.firstName ?? ''} ${fatherData.surname ?? ''}`.trim() : 'UNKNOWN FATHER'
        } & ${
          motherData ? `${motherData.firstName ?? ''} ${motherData.surname ?? ''}`.trim() : 'UNKNOWN MOTHER'
        }`.toUpperCase()
      } else {
        // Spec §2.8 Case B — ADULT: fetch citizen, mark DECEASED
        nationalId   = citizen?.nationalId ?? lookupId.trim()
        deceasedName = citizen?.fullName
          ?? (citizen?.firstName ? `${citizen.firstName} ${citizen.surname ?? ''}`.trim() : lookupId.trim())
      }

      // Spec §2.8: if online → push directly to remote DB
      //             if offline → store locally, auto-sync when device reconnects
      const { death, syncedRemote } = await saveAndSyncDeath({
        certNo,
        nationalId,
        deceasedName,
        causeOfDeath:  cause.trim(),
        dateOfDeath:   dod.trim(),
        locationType:  locType,
        category:      finalCategory,
        informantName: informant.trim(),
        facilityName,
        officerName,
        rawJson: JSON.stringify({
          deathType,
          nationalId,
          fatherNid: deathType === 'infant' ? fatherData?.nationalId : undefined,
          motherNid: deathType === 'infant' ? motherData?.nationalId : undefined,
          causeOfDeath: cause.trim(),
          dateOfDeath:  dod.trim(),
          locationType: locType,
          category:     finalCategory,
          informantName: informant.trim(),
        }),
      })

      setSavedId(death.id)
      setSavedCertNo(certNo)
      setStep(4)

      // Background: generate PDF; skip duplicate sync if already pushed
      ;(async () => {
        try {
          const { generateDeathPdf } = await import('../../services/certificateService')
          const pdf = await generateDeathPdf(death)
          await updateDeathCertPath(death.id, pdf)
          setPdfPath(pdf)
        } catch (e) { console.warn('PDF gen:', e) }
        if (!syncedRemote) await triggerSync()
      })()
    } catch (e) {
      Alert.alert('Error','Failed to save record. Please try again.')
      console.error(e)
    } finally { setSubmitting(false) }
  }, [cause, dod, locType, category, informant, citizen, lookupId, deathType, fatherData, motherData])

  // ── Download cert ─────────────────────────────────────────────────────────
  const handleDownload = async () => {
    setDownloading(true)
    try {
      if (pdfPath) { await sharePdf(pdfPath); setDownloading(false); return }
      const { getAllDeaths } = await import('../../services/localDb')
      const deaths = await getAllDeaths()
      const death  = deaths.find(d=>d.id===savedId)
      if (!death) { Alert.alert('Error','Record not found.'); setDownloading(false); return }
      const { generateDeathPdf } = await import('../../services/certificateService')
      const pdf = await generateDeathPdf(death)
      await updateDeathCertPath(savedId, pdf)
      setPdfPath(pdf)
      await sharePdf(pdf)
    } catch (e) { Alert.alert('Error','Could not generate PDF. Try again.') }
    setDownloading(false)
  }

  const copy = async (text:string, label:string) => {
    await Clipboard.setStringAsync(text)
    setToast(`${label} copied to clipboard`)
    setToastVis(true)
    setTimeout(()=>setToastVis(false), 2400)
  }

  // Helper: can we proceed from step 2 to step 3?
  const step2Ready = deathType === 'adult'
    ? !!citizen
    : !!(fatherData && motherData)

  const STEP_LABELS = ['Type','Lookup','Details','Issued']

  return (
    <SafeAreaView style={{ flex:1, backgroundColor:T.bg }} edges={['top']}>
      <KeyboardAvoidingView style={{ flex:1 }} behavior={Platform.OS==='ios'?'padding':undefined}>

        {/* Header */}
        <View style={[s.header, { backgroundColor:T.card, borderBottomColor:T.border }]}>
          <TouchableOpacity
            onPress={()=>{ if (step > 1 && step < 4) setStep(s=>(s-1) as any); else navigation.goBack() }}
            style={s.backBtn}
          >
            <ArrowLeft size={20} color={T.text} />
          </TouchableOpacity>
          <View style={{ flex:1, alignItems:'center' }}>
            <Text style={[s.headerTitle, { color:T.text }]}>Record Death</Text>
            <Text style={[s.headerSub, { color:T.textSub }]}>Step {step} of 4</Text>
          </View>
          <View style={[s.backBtn, { backgroundColor:'#dc262618' }]}><Cross size={18} color="#dc2626" /></View>
        </View>

        {/* Step bar — 4 steps */}
        <View style={[s.stepBar, { backgroundColor:T.card, borderBottomColor:T.border }]}>
          {STEP_LABELS.map((lbl,i)=>(
            <View key={lbl} style={{ alignItems:'center', flex:1 }}>
              <View style={[s.stepDot, { backgroundColor:step>i+1?T.success:step===i+1?'#dc2626':T.border }]}>
                {step>i+1 ? <CheckCircle2 size={12} color="#fff" /> : <Text style={{ color:'#fff', fontSize:10, fontWeight:'800' }}>{i+1}</Text>}
              </View>
              <Text style={[s.stepLabel, { color:step>=i+1?T.text:T.textDim }]}>{lbl}</Text>
            </View>
          ))}
        </View>

        <ScrollView
          style={{ flex:1 }} contentContainerStyle={{ padding:20, paddingBottom:40 }}
          showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
        >

          {/* ── STEP 1: INFANT or ADULT (Spec §2.8 Case B) ─────────────── */}
          {step===1 && (
            <View style={{ gap:18 }}>
              <Text style={[s.stepTitle, { color:T.text }]}>Select Death Category</Text>
              <Text style={{ fontSize:13, color:T.textSub, lineHeight:20 }}>
                Choose the category of the deceased. This determines the registration path.
              </Text>

              {/* INFANT tile */}
              <TouchableOpacity
                onPress={()=>{ setDeathType('infant'); setCategory('infant') }}
                style={[s.typeTile, {
                  borderColor: deathType==='infant' ? '#dc2626' : T.border,
                  backgroundColor: deathType==='infant' ? '#dc262612' : T.card,
                }]}
                activeOpacity={0.75}
              >
                <View style={[s.typeTileIcon, { backgroundColor:'#dc262620' }]}>
                  <Text style={{ fontSize:28 }}>👶</Text>
                </View>
                <View style={{ flex:1, gap:3 }}>
                  <Text style={{ fontSize:16, fontWeight:'800', color:deathType==='infant'?'#dc2626':T.text }}>INFANT</Text>
                  <Text style={{ fontSize:12, color:T.textSub, lineHeight:17 }}>
                    Death before or shortly after birth. Father + Mother NIDs required.
                    No citizen NIN exists yet.
                  </Text>
                </View>
                {deathType==='infant' && <CheckCircle2 size={22} color="#dc2626" />}
              </TouchableOpacity>

              {/* ADULT tile */}
              <TouchableOpacity
                onPress={()=>{ setDeathType('adult'); setCategory('adult') }}
                style={[s.typeTile, {
                  borderColor: deathType==='adult' ? '#dc2626' : T.border,
                  backgroundColor: deathType==='adult' ? '#dc262612' : T.card,
                }]}
                activeOpacity={0.75}
              >
                <View style={[s.typeTileIcon, { backgroundColor:'#dc262620' }]}>
                  <Text style={{ fontSize:28 }}>🏥</Text>
                </View>
                <View style={{ flex:1, gap:3 }}>
                  <Text style={{ fontSize:16, fontWeight:'800', color:deathType==='adult'?'#dc2626':T.text }}>ADULT</Text>
                  <Text style={{ fontSize:12, color:T.textSub, lineHeight:17 }}>
                    Registered citizen with a National ID. Vital status updated to DECEASED.
                  </Text>
                </View>
                {deathType==='adult' && <CheckCircle2 size={22} color="#dc2626" />}
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.proceedBtn, { opacity:deathType?1:0.4 }]}
                onPress={()=>setStep(2)} disabled={!deathType}
              >
                <Text style={{ color:'#fff', fontWeight:'800', fontSize:14 }}>
                  Continue →
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── STEP 2: Lookup — conditional on INFANT or ADULT ─────────── */}
          {step===2 && deathType==='adult' && (
            <View style={{ gap:14 }}>
              <Text style={[s.stepTitle, { color:T.text }]}>Search Deceased Citizen</Text>
              <Text style={{ fontSize:12, color:T.textSub, lineHeight:18 }}>
                Enter the National ID or full name. Vital status will be updated to DECEASED
                upon submission.
              </Text>
              <View>
                <Text style={{ fontSize:12, fontWeight:'600', color:T.textSub, marginBottom:6 }}>National ID / Full Name *</Text>
                <View style={{ flexDirection:'row', gap:8 }}>
                  <TextInput
                    style={[sf.input, { flex:1, backgroundColor:T.card2, borderColor:T.border, color:T.text }]}
                    value={lookupId} onChangeText={t=>setLookupId(t.toUpperCase())}
                    placeholder="National ID or full name" placeholderTextColor={T.textDim}
                    returnKeyType="search" blurOnSubmit={false} onSubmitEditing={lookupCitizen}
                  />
                  <TouchableOpacity
                    style={[s.searchBtn, { opacity:lookupId.trim().length>=3?1:0.45 }]}
                    onPress={lookupCitizen} disabled={lookupId.trim().length<3||lookupLoad}
                  >
                    {lookupLoad ? <ActivityIndicator color="#fff" size="small" /> : <><Search size={14} color="#fff" /><Text style={{ color:'#fff', fontWeight:'700', fontSize:13 }}>Search</Text></>}
                  </TouchableOpacity>
                </View>
              </View>
              {citizen && (
                <View style={[s.citizenCard, { backgroundColor:T.card, borderColor:T.border }]}>
                  <User size={15} color={T.primary} />
                  <View style={{ flex:1, marginLeft:10 }}>
                    <Text style={{ fontSize:14, fontWeight:'700', color:T.text }}>
                      {citizen.fullName ?? `${citizen.firstName??''} ${citizen.surname??''}`.trim()}
                    </Text>
                    {citizen.nationalId && <Text style={{ fontSize:11, color:T.textSub, marginTop:2 }}>{citizen.nationalId}</Text>}
                  </View>
                  <CheckCircle2 size={16} color={T.success ?? '#22c55e'} />
                </View>
              )}
              <TouchableOpacity
                style={[s.proceedBtn, { opacity:citizen?1:0.45 }]}
                onPress={()=>setStep(3)} disabled={!citizen}
              >
                <Text style={{ color:'#fff', fontWeight:'800', fontSize:14 }}>Proceed to Death Details</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* STEP 2 — INFANT: Father + Mother NID lookup ─────────────────── */}
          {step===2 && deathType==='infant' && (
            <View style={{ gap:18 }}>
              <Text style={[s.stepTitle, { color:T.text }]}>Infant — Parent Identification</Text>
              <Text style={{ fontSize:12, color:T.textSub, lineHeight:18 }}>
                The infant has no National ID yet. Enter Father and Mother NIDs to link
                this death record to their lineage.
              </Text>

              {/* Father NID */}
              {(['father','mother'] as const).map(role => {
                const isFather = role === 'father'
                const nid      = isFather ? fatherNid    : motherNid
                const setNid   = isFather ? setFatherNid : setMotherNid
                const data     = isFather ? fatherData   : motherData
                const loading  = isFather ? fatherLoad   : motherLoad
                const error    = isFather ? fatherError  : motherError
                const accent   = isFather ? '#0891b2' : '#8b5cf6'
                const label    = isFather ? 'Father' : 'Mother'
                return (
                  <View key={role} style={{ gap:8, borderWidth:1, borderColor:`${accent}40`, borderRadius:14, padding:14, backgroundColor:`${accent}08` }}>
                    <Text style={{ fontSize:13, fontWeight:'800', color:accent }}>{label} National ID</Text>
                    <View style={{ flexDirection:'row', gap:8 }}>
                      <TextInput
                        style={[sf.input, { flex:1, backgroundColor:T.card2, borderColor:T.border, color:T.text, letterSpacing:1 }]}
                        value={nid}
                        onChangeText={raw => setNid(formatNIN(raw))}
                        placeholder="YYYYMMDD-LLLLL-SSSSS-CC"
                        placeholderTextColor={T.textDim}
                        keyboardType="numeric" maxLength={23}
                      />
                      <TouchableOpacity
                        style={[s.searchBtn, { backgroundColor:accent, opacity:isNINComplete(nid)?1:0.4 }]}
                        onPress={()=>lookupParent(nid, role)}
                        disabled={!isNINComplete(nid)||loading}
                      >
                        {loading ? <ActivityIndicator color="#fff" size="small" /> : <><Search size={14} color="#fff" /><Text style={{ color:'#fff', fontWeight:'700', fontSize:13 }}>Find</Text></>}
                      </TouchableOpacity>
                    </View>
                    {!!error && (
                      <Text style={{ fontSize:11, color:'#f87171', lineHeight:17 }}>⚠ {error}</Text>
                    )}
                    {data && (
                      <View style={[s.citizenCard, { backgroundColor:`${accent}12`, borderColor:`${accent}40` }]}>
                        <User size={15} color={accent} />
                        <View style={{ flex:1, marginLeft:10 }}>
                          <Text style={{ fontSize:13, fontWeight:'700', color:T.text }}>
                            {data.firstName ?? ''} {data.middleName ?? ''} {data.surname ?? ''}
                          </Text>
                          <Text style={{ fontSize:10, color:T.textSub, marginTop:2 }}>{data.nationalId}</Text>
                        </View>
                        <CheckCircle2 size={15} color={accent} />
                      </View>
                    )}
                  </View>
                )
              })}

              <TouchableOpacity
                style={[s.proceedBtn, { opacity:step2Ready?1:0.45 }]}
                onPress={()=>setStep(3)} disabled={!step2Ready}
              >
                <Text style={{ color:'#fff', fontWeight:'800', fontSize:14 }}>Proceed to Death Details</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── STEP 3: Death details ───────────────────────────────────── */}
          {step===3 && (
            <View>
              {/* Summary of who died */}
              <View style={[s.citizenCard, { backgroundColor:T.card, borderColor:T.border, marginBottom:16, gap:4 }]}>
                <Cross size={14} color="#dc2626" />
                <View style={{ flex:1, marginLeft:10 }}>
                  {deathType==='adult' && (
                    <Text style={{ fontSize:14, fontWeight:'700', color:T.text }}>
                      {citizen?.fullName ?? `${citizen?.firstName??''} ${citizen?.surname??''}`.trim()}
                    </Text>
                  )}
                  {deathType==='infant' && (
                    <>
                      <Text style={{ fontSize:13, fontWeight:'700', color:'#dc2626' }}>INFANT DEATH</Text>
                      <Text style={{ fontSize:11, color:T.textSub, marginTop:2 }}>
                        Father: {fatherData?.firstName} {fatherData?.surname} · Mother: {motherData?.firstName} {motherData?.surname}
                      </Text>
                    </>
                  )}
                </View>
              </View>

              {/* Cause of death */}
              <StableField
                label="Cause of Death *" value={cause} onChangeText={setCause}
                placeholder="e.g. Cardiac arrest, Malaria complications"
                multiline returnKeyType="next"
                onSubmitEditing={()=>informantRef.current?.focus()}
                inputRef={causeRef}
                bg={T.card2} bc={T.border} tc={T.text} dc={T.textDim}
              />

              {/* Date of death */}
              <View style={{ marginBottom:14 }}>
                <Text style={{ fontSize:12, fontWeight:'600', color:T.textSub, marginBottom:6 }}>Date of Death *</Text>
                <TouchableOpacity
                  style={[sf.input, { backgroundColor:T.card2, borderColor:T.border, flexDirection:'row', alignItems:'center', justifyContent:'space-between' }]}
                  onPress={()=>setShowCal(true)} activeOpacity={0.8}
                >
                  <Text style={{ color:dod?T.text:T.textDim, fontSize:14 }}>{dod||'Select date of death'}</Text>
                  <Calendar size={16} color={T.textDim} />
                </TouchableOpacity>
              </View>

              {/* Location type chips */}
              <View style={{ marginBottom:14 }}>
                <Text style={{ fontSize:12, fontWeight:'600', color:T.textSub, marginBottom:8 }}>Location Type *</Text>
                <View style={{ flexDirection:'row', flexWrap:'wrap', gap:8 }}>
                  {LOC_TYPES.map(l=>(
                    <TouchableOpacity key={l.val} onPress={()=>setLocType(l.val)}
                      style={[s.chip, { borderColor:locType===l.val?'#dc2626':T.border, backgroundColor:locType===l.val?'#dc262618':T.card }]}>
                      <Text style={{ fontSize:11, color:locType===l.val?'#dc2626':T.textSub }}>{l.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Category — only for ADULT; for INFANT it is locked */}
              {deathType==='adult' && (
                <View style={{ marginBottom:14 }}>
                  <Text style={{ fontSize:12, fontWeight:'600', color:T.textSub, marginBottom:8 }}>Sub-Category *</Text>
                  <View style={{ flexDirection:'row', flexWrap:'wrap', gap:8 }}>
                    {ADULT_CATEGORIES.map(c=>(
                      <TouchableOpacity key={c.val} onPress={()=>setCategory(c.val)}
                        style={[s.chip, { borderColor:category===c.val?'#dc2626':T.border, backgroundColor:category===c.val?'#dc262618':T.card }]}>
                        <Text style={{ fontSize:11, color:category===c.val?'#dc2626':T.textSub }}>{c.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {/* Informant */}
              <StableField
                label="Informant Name *" value={informant} onChangeText={setInformant}
                placeholder="Full name of the reporting person"
                returnKeyType="done" onSubmitEditing={handleSubmit}
                inputRef={informantRef}
                bg={T.card2} bc={T.border} tc={T.text} dc={T.textDim}
              />

              <TouchableOpacity
                style={[s.submitBtn, { opacity:submitting?0.7:1 }]}
                onPress={handleSubmit} disabled={submitting} activeOpacity={0.85}
              >
                {submitting ? <ActivityIndicator color="#fff" /> : <Text style={{ color:'#fff', fontWeight:'800', fontSize:14 }}>Submit Death Record</Text>}
              </TouchableOpacity>
            </View>
          )}

          {/* ── STEP 4: Certificate issued ──────────────────────────────── */}
          {step===4 && (
            <View style={{ alignItems:'center', paddingTop:24, gap:14 }}>
              <View style={{ width:80, height:80, borderRadius:40, backgroundColor:'#dc262618', alignItems:'center', justifyContent:'center' }}>
                <CheckCircle2 size={40} color="#dc2626" />
              </View>
              <Text style={{ fontSize:20, fontWeight:'900', color:T.text }}>Death Recorded</Text>
              <Text style={{ fontSize:13, color:T.textSub }}>
                {deathType==='infant' ? 'Infant death record saved' : 'Citizen status → DECEASED'} · syncing in background
              </Text>

              <View style={{ width:'100%', gap:6 }}>
                <Text style={{ fontSize:11, color:T.textDim, fontWeight:'600', textTransform:'uppercase', letterSpacing:0.5 }}>Death Certificate Number</Text>
                <View style={{ borderRadius:10, borderWidth:1, borderColor:'#dc262650', backgroundColor:'#dc262610', padding:12, flexDirection:'row', alignItems:'center' }}>
                  <Text style={{ fontSize:14, fontWeight:'900', color:'#dc2626', flex:1, letterSpacing:1 }}>{savedCertNo}</Text>
                  <TouchableOpacity onPress={()=>copy(savedCertNo,'Certificate number')} style={{ padding:4 }}>
                    <Copy size={15} color="#dc2626" />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={{ flexDirection:'row', gap:8, alignItems:'center', backgroundColor:'#0891b212', borderRadius:8, padding:10, width:'100%' }}>
                <Shield size={13} color="#22d3ee" />
                <Text style={{ fontSize:10, color:T.textSub, flex:1 }}>
                  Record stored locally · will sync to Central Database on next connection · QR signed by Govt PKI
                </Text>
              </View>

              <TouchableOpacity
                style={{ flexDirection:'row', alignItems:'center', justifyContent:'center', gap:8, backgroundColor:downloading?T.card2:'#dc2626', borderRadius:12, paddingVertical:14, width:'100%', borderWidth:downloading?1:0, borderColor:'#dc2626' }}
                onPress={handleDownload} disabled={downloading} activeOpacity={0.85}
              >
                {downloading ? <ActivityIndicator color="#dc2626" size="small" /> : <Download size={16} color="#fff" />}
                <Text style={{ fontSize:14, fontWeight:'800', color:downloading?'#dc2626':'#fff' }}>
                  {downloading?'Generating PDF…':'Download Certificate PDF'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{ borderWidth:1, borderColor:T.border, borderRadius:12, paddingVertical:14, alignItems:'center', width:'100%' }}
                onPress={()=>navigation.goBack()}
              >
                <Text style={{ fontSize:14, fontWeight:'700', color:T.textSub }}>Back to Dashboard</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>

        <CalPicker visible={showCal} title="Select Date of Death" onSelect={d=>{setDod(d);setShowCal(false)}} onClose={()=>setShowCal(false)} />
      </KeyboardAvoidingView>
      <Toast message={toast} visible={toastVis} />
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  header:      { flexDirection:'row', alignItems:'center', paddingHorizontal:16, paddingVertical:12, borderBottomWidth:1 },
  backBtn:     { width:36, height:36, borderRadius:10, alignItems:'center', justifyContent:'center' },
  headerTitle: { fontSize:15, fontWeight:'800' },
  headerSub:   { fontSize:11, marginTop:2 },
  stepBar:     { flexDirection:'row', paddingVertical:12, paddingHorizontal:24, borderBottomWidth:1 },
  stepDot:     { width:22, height:22, borderRadius:11, alignItems:'center', justifyContent:'center', marginBottom:4 },
  stepLabel:   { fontSize:10, fontWeight:'600' },
  stepTitle:   { fontSize:16, fontWeight:'800' },
  searchBtn:   { flexDirection:'row', alignItems:'center', gap:6, backgroundColor:'#dc2626', borderRadius:10, paddingHorizontal:14, paddingVertical:12 },
  chip:        { borderWidth:1, borderRadius:20, paddingHorizontal:12, paddingVertical:6 },
  citizenCard: { flexDirection:'row', alignItems:'center', borderWidth:1, borderRadius:12, padding:14 },
  proceedBtn:  { backgroundColor:'#dc2626', borderRadius:12, paddingVertical:14, alignItems:'center' },
  submitBtn:   { backgroundColor:'#dc2626', borderRadius:12, paddingVertical:14, alignItems:'center', marginTop:8 },
  typeTile:    { flexDirection:'row', alignItems:'flex-start', gap:12, borderWidth:2, borderRadius:16, padding:16 },
  typeTileIcon:{ width:52, height:52, borderRadius:14, alignItems:'center', justifyContent:'center' },
})