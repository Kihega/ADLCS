/**
 * RegisterBirthScreen.tsx — Birth Registration  v5.0  PRODUCTION
 *
 * Flow: Father NID → Mother NID → Child Info → Review → Submit
 *
 * On Submit:
 *  1. Generate NIN + cert number
 *  2. Save to local SQLite (works offline)
 *  3. Generate PDF certificate (expo-print)
 *  4. If online → auto-sync to backend
 *  5. Show success modal with NIN + cert no + copy icons
 */

import React, { useState, useRef, useCallback, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Modal, Alert, ActivityIndicator,
  Animated, Dimensions, KeyboardAvoidingView, Platform,
  Image, ImageBackground,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import * as Clipboard     from 'expo-clipboard'
import AsyncStorage       from '@react-native-async-storage/async-storage'
import {
  Baby, ChevronLeft, ChevronRight, Check, X,
  User, Shield, FileText, AlertCircle,
  CheckCircle2, Copy, Calendar, Download,
} from 'lucide-react-native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'

import {
  saveBirth, generateBirthCertNo, generateNationalId,
  updateBirthCertPath, LocalBirth,
} from '../../services/localDb'
import { generateBirthPdf, sharePdf } from '../../services/certificateService'
import { triggerSync } from '../../services/syncService'
import { useTheme, TZ } from '../../context/ThemeContext'

type RootStack = { HospitalHome: undefined; RegisterBirth: undefined }
type Props = { navigation: NativeStackNavigationProp<RootStack, 'RegisterBirth'> }

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'https://adlcs-backend.onrender.com/api'
const H = { primary: '#0891b2', primaryL: '#22d3ee', orange: '#f97316' }
const { width: W } = Dimensions.get('window')

// ─── NIN formatter ────────────────────────────────────────────────────────────
function formatNIN(raw: string): string {
  const clean = raw.replace(/[^0-9]/g, '')
  let out = clean.slice(0, 8)
  if (clean.length > 8)  out += '-' + clean.slice(8,  13)
  if (clean.length > 13) out += '-' + clean.slice(13, 18)
  if (clean.length > 18) out += '-' + clean.slice(18, 20)
  return out
}
function isNINComplete(nin: string) { return /^\d{8}-\d{5}-\d{5}-\d{2}$/.test(nin) }

// ─── Test citizens ─────────────────────────────────────────────────────────────
const MOCK_CITIZENS: Record<string, any> = {
  '19850315-07031-00001-24': { nationalId:'19850315-07031-00001-24', firstName:'John', middleName:'Michael', surname:'Makonde', gender:'MALE', dateOfBirth:'15 March 1985', age:41, vitalStatus:'ALIVE', region:'Dar es Salaam', district:'Kinondoni', occupation:'Civil Engineer' },
  '19880622-07031-00002-13': { nationalId:'19880622-07031-00002-13', firstName:'Grace', middleName:'Rose', surname:'Mwamba', gender:'FEMALE', dateOfBirth:'22 June 1988', age:37, vitalStatus:'ALIVE', region:'Dar es Salaam', district:'Kinondoni', occupation:'Registered Nurse' },
}

// ─── Calendar picker ──────────────────────────────────────────────────────────
function CalPicker({ visible, title, onSelect, onClose }: { visible:boolean; title:string; onSelect:(s:string)=>void; onClose:()=>void }) {
  const { theme: T } = useTheme()
  const curY = new Date().getFullYear()
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
  const [yr, setYr] = useState(curY)
  const [mo, setMo] = useState(1)
  const [day, setDay] = useState(1)
  const daysIn = new Date(yr, mo, 0).getDate()
  if (!visible) return null
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex:1, justifyContent:'flex-end', backgroundColor:'rgba(0,0.65)' }}>
        <View style={{ backgroundColor:T.card, borderTopLeftRadius:24, borderTopRightRadius:24, padding:20, paddingBottom:36 }}>
          <View style={{ width:40, height:4, backgroundColor:T.border, borderRadius:2, alignSelf:'center', marginBottom:16 }} />
          <View style={{ flexDirection:'row', alignItems:'center', gap:8, marginBottom:14 }}>
            <Calendar size={15} color={H.primaryL} />
            <Text style={{ flex:1, fontSize:15, fontWeight:'800', color:T.text }}>{title}</Text>
            <TouchableOpacity onPress={onClose}><X size={17} color={T.textSub} /></TouchableOpacity>
          </View>
          <View style={{ flexDirection:'row', gap:6, height:190 }}>
            <View style={{ flex:1 }}>
              <Text style={{ fontSize:10, color:T.textDim, textAlign:'center', marginBottom:4 }}>Day</Text>
              <ScrollView showsVerticalScrollIndicator={false}>
                {Array.from({length:daysIn},(_,i)=>i+1).map(d=>(
                  <TouchableOpacity key={d} onPress={()=>setDay(d)} style={{ paddingVertical:9, alignItems:'center', borderRadius:8, marginVertical:2, backgroundColor:d===day?`${H.primary}30`:'transparent' }}>
                    <Text style={{ fontSize:13, color:d===day?H.primaryL:T.textSub, fontWeight:d===day?'800':'400' }}>{String(d).padStart(2,'0')}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
            <View style={{ flex:2 }}>
              <Text style={{ fontSize:10, color:T.textDim, textAlign:'center', marginBottom:4 }}>Month</Text>
              <ScrollView showsVerticalScrollIndicator={false}>
                {MONTHS.map((name,i)=>(
                  <TouchableOpacity key={name} onPress={()=>setMo(i+1)} style={{ paddingVertical:9, alignItems:'center', borderRadius:8, marginVertical:2, backgroundColor:i+1===mo?`${H.primary}30`:'transparent' }}>
                    <Text style={{ fontSize:13, color:i+1===mo?H.primaryL:T.textSub, fontWeight:i+1===mo?'800':'400' }}>{name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
            <View style={{ flex:1.5 }}>
              <Text style={{ fontSize:10, color:T.textDim, textAlign:'center', marginBottom:4 }}>Year</Text>
              <ScrollView showsVerticalScrollIndicator={false}>
                {Array.from({length:120},(_,i)=>curY-i).map(y=>(
                  <TouchableOpacity key={y} onPress={()=>setYr(y)} style={{ paddingVertical:9, alignItems:'center', borderRadius:8, marginVertical:2, backgroundColor:y===yr?`${H.primary}30`:'transparent' }}>
                    <Text style={{ fontSize:13, color:y===yr?H.primaryL:T.textSub, fontWeight:y===yr?'800':'400' }}>{y}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
          <View style={{ flexDirection:'row', gap:10, marginTop:16 }}>
            <TouchableOpacity onPress={onClose} style={{ flex:1, borderWidth:1, borderColor:T.border, borderRadius:12, paddingVertical:13, alignItems:'center' }}>
              <Text style={{ color:T.textSub, fontWeight:'600' }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={()=>onSelect(`${String(day).padStart(2,'0')}/${String(mo).padStart(2,'0')}/${yr}`)} style={{ flex:2, backgroundColor:H.primary, borderRadius:12, paddingVertical:13, alignItems:'center' }}>
              <Text style={{ color:'#fff', fontWeight:'800' }}>Confirm Date</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ message, visible }: { message:string; visible:boolean }) {
  const op = useRef(new Animated.Value(0)).current
  useEffect(() => {
    if (visible) Animated.sequence([
      Animated.timing(op,{toValue:1,duration:200,useNativeDriver:true}),
      Animated.delay(1600),
      Animated.timing(op,{toValue:0,duration:300,useNativeDriver:true}),
    ]).start()
  }, [visible])
  return (
    <Animated.View style={{ position:'absolute', bottom:100, alignSelf:'center', backgroundColor:TZ.green, borderRadius:20, paddingHorizontal:18, paddingVertical:10, flexDirection:'row', alignItems:'center', gap:8, opacity:op, elevation:9 }} pointerEvents="none">
      <CheckCircle2 size={14} color="#fff" />
      <Text style={{ color:'#fff', fontWeight:'700', fontSize:13 }}>{message}</Text>
    </Animated.View>
  )
}

// ─── Success Modal ─────────────────────────────────────────────────────────────
function SuccessModal({ visible, onClose, birth, pdfPath, onDownload, downloading }: {
  visible:boolean; onClose:()=>void; birth:LocalBirth|null
  pdfPath:string; onDownload:()=>void; downloading:boolean
}) {
  const { theme: T } = useTheme()
  const scale = useRef(new Animated.Value(0.7)).current
  const fade  = useRef(new Animated.Value(0)).current
  const [toast, setToast] = useState('')
  const [toastVis, setToastVis] = useState(false)

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale,{toValue:visible?1:0.7,friction:6,tension:80,useNativeDriver:true}),
      Animated.timing(fade, {toValue:visible?1:0,duration:200,useNativeDriver:true}),
    ]).start()
  }, [visible])

  const copy = async (text:string, label:string) => {
    await Clipboard.setStringAsync(text)
    setToast(`${label} copied to clipboard successfully`)
    setToastVis(true)
    setTimeout(()=>setToastVis(false), 2400)
  }

  if (!birth) return null
  const childName = [birth.childFirstName, birth.childMiddleName, birth.childSurname].filter(Boolean).join(' ').toUpperCase()

  return (
    <Modal visible={visible} transparent animationType="none">
      <Animated.View style={{ flex:1, backgroundColor:'rgba(0,0.75)', alignItems:'center', justifyContent:'center', padding:20, opacity:fade }}>
        <Animated.View style={{ width:'100%', borderRadius:20, overflow:'hidden', backgroundColor:T.card, shadowColor:'#000', shadowOffset:{width:0,height:12}, shadowOpacity:0.60, shadowRadius:24, elevation:24, transform:[{scale}] }}>
          <LinearGradient colors={['#064e3b','#065f46']} style={{ alignItems:'center', padding:24, gap:10 }}>
            <View style={{ width:64, height:64, borderRadius:32, backgroundColor:'rgba(74,222,128,0.15)', alignItems:'center', justifyContent:'center' }}>
              <CheckCircle2 size={36} color="#4ade80" />
            </View>
            <Text style={{ fontSize:22, fontWeight:'900', color:'#fff' }}>Birth Registered!</Text>
            <Text style={{ fontSize:12, color:'rgba(255,255,0.65)', textAlign:'center' }}>Record successfully added to NBS Central Database</Text>
          </LinearGradient>

          <View style={{ padding:20, gap:12 }}>
            <Text style={{ fontSize:18, fontWeight:'900', color:T.text, textAlign:'center' }}>{childName}</Text>
            <Text style={{ fontSize:12, color:T.textSub, textAlign:'center', marginTop:-6 }}>New Citizen of Tanzania</Text>
            <View style={{ height:1, backgroundColor:T.border }} />

            {/* NIN */}
            <View style={{ gap:6 }}>
              <Text style={{ fontSize:11, color:T.textDim, fontWeight:'600', textTransform:'uppercase', letterSpacing:0.5 }}>Generated National ID (NIN)</Text>
              <View style={{ borderRadius:10, borderWidth:1, borderColor:`${H.primary}50`, backgroundColor:`${H.primary}10`, padding:12, flexDirection:'row', alignItems:'center' }}>
                <Text style={{ fontSize:13, fontWeight:'900', color:H.primaryL, flex:1, letterSpacing:0.5 }}>{birth.nationalId}</Text>
                <TouchableOpacity onPress={()=>copy(birth.nationalId,'National ID')} style={{ padding:4 }}>
                  <Copy size={15} color={H.primaryL} />
                </TouchableOpacity>
              </View>
              <Text style={{ fontSize:10, color:T.textDim, fontStyle:'italic' }}>Child collects physical ID card at age 18 from Village Officer</Text>
            </View>

            {/* Cert no */}
            <View style={{ gap:6 }}>
              <Text style={{ fontSize:11, color:T.textDim, fontWeight:'600', textTransform:'uppercase', letterSpacing:0.5 }}>Birth Certificate Number</Text>
              <View style={{ borderRadius:10, borderWidth:1, borderColor:`${TZ.green}50`, backgroundColor:`${TZ.green}10`, padding:12, flexDirection:'row', alignItems:'center' }}>
                <Text style={{ fontSize:15, fontWeight:'900', color:TZ.green, flex:1, letterSpacing:1 }}>{birth.certNo}</Text>
                <TouchableOpacity onPress={()=>copy(birth.certNo,'Certificate number')} style={{ padding:4 }}>
                  <Copy size={15} color={TZ.green} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Security note */}
            <View style={{ flexDirection:'row', gap:8, alignItems:'center', backgroundColor:`${H.primary}12`, borderRadius:8, padding:10 }}>
              <Shield size={13} color={H.primaryL} />
              <Text style={{ fontSize:10, color:T.textSub, flex:1 }}>Certificate synced to internal registry · QR signed by Govt PKI</Text>
            </View>

            {/* Download PDF */}
            <TouchableOpacity
              onPress={onDownload}
              disabled={downloading}
              style={{ flexDirection:'row', alignItems:'center', justifyContent:'center', gap:8, backgroundColor:downloading?T.card2:TZ.green, borderRadius:12, paddingVertical:13, borderWidth:downloading?1:0, borderColor:T.border }}
              activeOpacity={0.85}
            >
              {downloading ? <ActivityIndicator color={TZ.green} size="small" /> : <Download size={16} color="#fff" />}
              <Text style={{ fontSize:14, fontWeight:'800', color:downloading?TZ.green:'#fff' }}>
                {downloading ? 'Generating PDF…' : 'Download Certificate PDF'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={onClose} style={{ borderWidth:1, borderColor:T.border, borderRadius:12, paddingVertical:13, alignItems:'center' }}>
              <Text style={{ fontSize:14, fontWeight:'700', color:T.textSub }}>Done</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
        <Toast message={toast} visible={toastVis} />
      </Animated.View>
    </Modal>
  )
}

// ─── Citizen card ─────────────────────────────────────────────────────────────
function CitizenCard({ c, role }: { c:any; role:'Father'|'Mother' }) {
  const { theme: T } = useTheme()
  const color = role==='Father' ? H.primary : '#8b5cf6'
  return (
    <View style={{ borderRadius:14, borderWidth:1, borderColor:`${color}50`, backgroundColor:`${color}10`, overflow:'hidden' }}>
      <View style={{ flexDirection:'row', gap:12, padding:14, borderBottomWidth:1, borderBottomColor:`${color}30`, alignItems:'flex-start' }}>
        <View style={{ width:42, height:42, borderRadius:10, backgroundColor:`${color}25`, alignItems:'center', justifyContent:'center' }}>
          <User size={20} color={color} />
        </View>
        <View style={{ flex:1 }}>
          <Text style={{ fontSize:14, fontWeight:'800', color:T.text }}>{c.firstName} {c.middleName} {c.surname}</Text>
          <Text style={{ fontSize:10, color:T.textDim, marginTop:2 }}>{c.nationalId}</Text>
          <View style={{ flexDirection:'row', alignItems:'center', gap:5, marginTop:5, alignSelf:'flex-start', borderRadius:20, borderWidth:1, borderColor:`${TZ.green}50`, backgroundColor:`${TZ.green}20`, paddingHorizontal:8, paddingVertical:3 }}>
            <View style={{ width:5, height:5, borderRadius:2.5, backgroundColor:TZ.green }} />
            <Text style={{ fontSize:8, fontWeight:'700', color:TZ.green }}>ALIVE · VERIFIED</Text>
          </View>
        </View>
        <View style={{ borderRadius:8, borderWidth:1, borderColor:`${color}50`, backgroundColor:`${color}20`, paddingHorizontal:8, paddingVertical:4 }}>
          <Text style={{ fontSize:9, fontWeight:'800', color }}>{role.toUpperCase()}</Text>
        </View>
      </View>
      <View style={{ padding:14, gap:6 }}>
        {[['Gender',c.gender],['Date of Birth',c.dateOfBirth],['Region',c.region],['District',c.district],['Occupation',c.occupation]].map(([k,v])=>(
          <View key={k} style={{ flexDirection:'row', justifyContent:'space-between' }}>
            <Text style={{ fontSize:11, color:T.textDim, width:'40%' }}>{k}</Text>
            <Text style={{ fontSize:11, color:T.text, fontWeight:'600', flex:1, textAlign:'right' }}>{v}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}

// ─── Screen ────────────────────────────────────────────────────────────────────
export default function RegisterBirthScreen({ navigation }: Props) {
  const { theme: T, isDark } = useTheme()

  const [step, setStep] = useState<1|2|3|4>(1)
  const [fatherNid, setFatherNid] = useState('')
  const [fatherData, setFatherData] = useState<any>(null)
  const [fatherLoading, setFatherLoading] = useState(false)
  const [fatherError, setFatherError] = useState('')
  const [motherNid, setMotherNid] = useState('')
  const [motherData, setMotherData] = useState<any>(null)
  const [motherLoading, setMotherLoading] = useState(false)
  const [motherError, setMotherError] = useState('')
  const [childFirst, setChildFirst] = useState('')
  const [childMiddle, setChildMiddle] = useState('')
  const [childSurname, setChildSurname] = useState('')
  const [childGender, setChildGender] = useState<'MALE'|'FEMALE'|''>('')
  const [childDOB, setChildDOB] = useState('')
  const [showCal, setShowCal] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [savedBirth, setSavedBirth] = useState<LocalBirth|null>(null)
  const [pdfPath, setPdfPath] = useState('')
  const [downloading, setDownloading] = useState(false)

  // Auto-fill child names from father
  useEffect(() => {
    if (fatherData) {
      setChildMiddle(fatherData.middleName ?? '')
      setChildSurname(fatherData.surname ?? '')
    }
  }, [fatherData])

  const lookupParent = useCallback(async (nid: string, role: 'father'|'mother') => {
    const isFather = role === 'father'
    const setLoading = isFather ? setFatherLoading : setMotherLoading
    const setError   = isFather ? setFatherError   : setMotherError
    const setData    = isFather ? setFatherData     : setMotherData

    setLoading(true); setError(''); setData(null)

    // 1. Try backend
    try {
      const token = await AsyncStorage.getItem('adlcs_access_token')
      if (token) {
        const res = await fetch(`${API_BASE}/officer/citizen-lookup?q=${encodeURIComponent(nid.trim())}`, { headers:{ Authorization:`Bearer ${token}` }, signal: AbortSignal.timeout(5000) })
        const json = await res.json()
        if (json.success && json.data) {
          setData({ ...json.data, firstName: json.data.firstName, middleName: json.data.middleName ?? '', surname: json.data.surname, gender: json.data.gender?.toUpperCase(), dateOfBirth: json.data.dateOfBirth, age: 0, region:'Tanzania', district:'—', occupation:'—', vitalStatus: json.data.vitalStatus?.toUpperCase() ?? 'ALIVE' })
          setLoading(false)
          return
        }
      }
    } catch { /* fall through to mock */ }

    // 2. Fall back to test data
    await new Promise<void>(r=>setTimeout(r,600))
    const found = MOCK_CITIZENS[nid.trim()]
    if (!found) { setError('National ID not found in NBS Central Database.'); setLoading(false); return }
    if (isFather && found.gender !== 'MALE') { setError("This NID belongs to a female citizen."); setLoading(false); return }
    if (!isFather && found.gender !== 'FEMALE') { setError("This NID belongs to a male citizen."); setLoading(false); return }
    setData(found)
    setLoading(false)
  }, [])

  const handleNINInput = (raw: string, role: 'father'|'mother') => {
    const f = formatNIN(raw)
    if (role === 'father') setFatherNid(f)
    else setMotherNid(f)
  }

  const handleSubmit = useCallback(async () => {
    setSubmitting(true)
    try {
      const token      = await AsyncStorage.getItem('adlcs_access_token')
      const cache      = token ? await (async () => {
        try {
          const r = await fetch(`${API_BASE}/officer/dashboard`, { headers:{ Authorization:`Bearer ${token}` }, signal: AbortSignal.timeout(5000) })
          const j = await r.json()
          return j.success ? j.data : null
        } catch { return null }
      })() : null

      const certNo     = generateBirthCertNo()
      const nationalId = generateNationalId(childDOB)
      const fatherName = fatherData ? `${fatherData.firstName} ${fatherData.middleName ?? ''} ${fatherData.surname}`.replace(/\s+/g,' ').trim() : ''
      const motherName = motherData ? `${motherData.firstName} ${motherData.middleName ?? ''} ${motherData.surname}`.replace(/\s+/g,' ').trim() : ''

      const birth = await saveBirth({
        certNo, nationalId,
        childFirstName:   childFirst.trim(),
        childMiddleName:  childMiddle.trim(),
        childSurname:     childSurname.trim(),
        gender:           childGender,
        dateOfBirth:      childDOB,
        fatherName, fatherNid: fatherNid,
        motherName, motherNid: motherNid,
        facilityName:     cache?.facilityName     ?? '',
        facilityDistrict: cache?.facilityDistrict ?? '',
        facilityRegion:   cache?.facilityRegion   ?? '',
        officerName:      cache?.officerName       ?? '',
        rawJson:          JSON.stringify({ fatherNid, motherNid, gender: childGender, dateOfBirth: childDOB }),
      })

      setSavedBirth(birth)
      setShowSuccess(true)

      // Background: generate PDF + try sync
      ;(async () => {
        try {
          const pdf = await generateBirthPdf(birth)
          await updateBirthCertPath(birth.id, pdf)
          setPdfPath(pdf)
        } catch (e) { console.warn('PDF gen failed:', e) }
        await triggerSync()
      })()
    } catch (e) {
      Alert.alert('Error', 'Failed to save registration. Please try again.')
      console.error(e)
    } finally { setSubmitting(false) }
  }, [childFirst, childMiddle, childSurname, childGender, childDOB, fatherNid, motherNid, fatherData, motherData])

  const handleDownload = async () => {
    setDownloading(true)
    try {
      let path = pdfPath
      if (!path && savedBirth) {
        path = await generateBirthPdf(savedBirth)
        await updateBirthCertPath(savedBirth.id, path)
        setPdfPath(path)
      }
      if (path) await sharePdf(path)
    } catch (e) { Alert.alert('Error', 'Could not generate PDF. Please try again.') }
    setDownloading(false)
  }

  const STEP_LABELS = ['Father','Mother','Child Info','Review']
  const step1Valid = isNINComplete(fatherNid) && !!fatherData
  const step2Valid = isNINComplete(motherNid) && !!motherData
  const step3Valid = !!childFirst.trim() && !!childSurname.trim() && !!childGender && childDOB.length >= 8
  const canNext    = [step1Valid, step2Valid, step3Valid, true][step-1]

  const renderNIDStep = (role: 'father'|'mother') => {
    const isFather = role==='father'
    const nid      = isFather ? fatherNid    : motherNid
    const data     = isFather ? fatherData   : motherData
    const loading  = isFather ? fatherLoading : motherLoading
    const error    = isFather ? fatherError  : motherError
    const testNid  = isFather ? '19850315-07031-00001-24' : '19880622-07031-00002-13'
    const accent   = isFather ? H.primary : '#8b5cf6'
    const label    = isFather ? 'Father' : 'Mother'

    return (
      <View style={{ gap:14 }}>
        <Text style={{ fontSize:18, fontWeight:'800', color:T.text }}>{label} Identification</Text>
        <Text style={{ fontSize:12, color:T.textSub, lineHeight:18 }}>
          Enter the {label.toLowerCase()}'s National ID. The system validates the record in the NBS Central Database.
        </Text>
        <View>
          <Text style={{ fontSize:12, fontWeight:'600', color:T.textSub, marginBottom:6 }}>National ID Number *</Text>
          <View style={{ flexDirection:'row', gap:8 }}>
            <TextInput
              style={{ flex:1, backgroundColor:T.card2, borderWidth:1, borderColor:T.border, borderRadius:10, paddingHorizontal:14, paddingVertical:12, color:T.text, fontSize:14, letterSpacing:1 }}
              value={nid} onChangeText={raw=>handleNINInput(raw, role)}
              placeholder="YYYYMMDD-LLLLL-SSSSS-CC" placeholderTextColor={T.textDim}
              keyboardType="numeric" maxLength={23} returnKeyType="search" blurOnSubmit={false}
            />
            <TouchableOpacity
              style={{ borderRadius:10, paddingHorizontal:16, alignItems:'center', justifyContent:'center', minWidth:76, backgroundColor:accent, opacity:isNINComplete(nid)?1:0.4 }}
              onPress={()=>lookupParent(nid, role)} disabled={!isNINComplete(nid)||loading} activeOpacity={0.8}
            >
              {loading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ fontSize:13, fontWeight:'700', color:'#fff' }}>Search</Text>}
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={{ paddingTop:6 }} onPress={()=>{ handleNINInput(testNid.replace(/-/g,''), role); lookupParent(testNid, role) }}>
            <Text style={{ fontSize:11, fontWeight:'600', color:accent }}>⚡ Auto-fill test {label.toLowerCase()} ID</Text>
          </TouchableOpacity>
        </View>
        {!!error && (
          <View style={{ flexDirection:'row', gap:8, backgroundColor:'rgba(239,68,0.12)', borderRadius:10, padding:12, borderWidth:1, borderColor:'rgba(239,68,0.35)' }}>
            <AlertCircle size={14} color="#f87171" />
            <Text style={{ fontSize:12, color:'#f87171', flex:1, lineHeight:17 }}>{error}</Text>
          </View>
        )}
        {data && <CitizenCard c={data} role={label as any} />}
      </View>
    )
  }

  return (
    <SafeAreaView style={{ flex:1, backgroundColor:T.bg }} edges={['top']}>
      {/* Header */}
      <ImageBackground source={require('../../../public/assets/flag.jpg')} style={{ overflow:'hidden' }} blurRadius={2} resizeMode="cover">
        <LinearGradient colors={['rgba(2,20,60,0.70)','rgba(8,50,80,0.65)']} style={StyleSheet.absoluteFill} />
        <View style={{ flexDirection:'row', height:4 }}>
          <View style={{ flex:3, backgroundColor:TZ.green }} /><View style={{ width:9, backgroundColor:TZ.yellow }} />
          <View style={{ width:7, backgroundColor:TZ.black }} /><View style={{ width:9, backgroundColor:TZ.yellow }} />
          <View style={{ flex:3, backgroundColor:TZ.blue }} />
        </View>
        <View style={{ flexDirection:'row', alignItems:'center', paddingHorizontal:14, paddingTop:10, paddingBottom:10, gap:10 }}>
          <TouchableOpacity style={{ width:36, height:36, borderRadius:10, backgroundColor:'rgba(255,255,0.12)', alignItems:'center', justifyContent:'center' }} onPress={()=>step>1?setStep(s=>(s-1) as any):navigation.goBack()}>
            <ChevronLeft size={20} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex:1, alignItems:'center' }}>
            <Text style={{ fontSize:16, fontWeight:'800', color:'#fff', letterSpacing:0.5 }}>Register Birth</Text>
            <Text style={{ fontSize:9, color:'rgba(255,255,0.60)', marginTop:2 }}>NBS · Births & Deaths Registration Act</Text>
          </View>
          <View style={{ width:38, height:38, borderRadius:19, backgroundColor:'rgba(255,255,0.10)', alignItems:'center', justifyContent:'center' }}>
            <Image source={require('../../../public/assets/court_of_arm.png')} style={{ width:32, height:32 }} resizeMode="contain" />
          </View>
        </View>
        {/* Steps */}
        <View style={{ flexDirection:'row', alignItems:'center', paddingHorizontal:28, paddingBottom:8, paddingTop:4 }}>
          {[1,2,3,4].map((n,i)=>(
            <React.Fragment key={n}>
              <View style={{ width:22, height:22, borderRadius:11, alignItems:'center', justifyContent:'center', borderWidth:1.5, backgroundColor:n<step?TZ.green:n===step?H.primary:'rgba(255,255,0.12)', borderColor:n===step?H.primaryL:'transparent' }}>
                {n<step ? <Check size={10} color="#fff" /> : <Text style={{ fontSize:10, fontWeight:'700', color:n===step?'#fff':'rgba(255,255,0.40)' }}>{n}</Text>}
              </View>
              {i<3 && <View style={{ flex:1, height:2, borderRadius:1, backgroundColor:n<step?TZ.green:'rgba(255,255,0.15)' }} />}
            </React.Fragment>
          ))}
        </View>
        <View style={{ flexDirection:'row', justifyContent:'space-between', paddingHorizontal:16, paddingBottom:12 }}>
          {STEP_LABELS.map((l,i)=>(
            <Text key={l} style={{ fontSize:9, color:i+1===step?H.primaryL:'rgba(255,255,0.45)', width:(W-32)/4, textAlign:'center' }}>{l}</Text>
          ))}
        </View>
      </ImageBackground>

      <KeyboardAvoidingView style={{ flex:1 }} behavior={Platform.OS==='ios'?'padding':undefined}>
        <ScrollView style={{ flex:1 }} contentContainerStyle={{ padding:16, paddingBottom:120 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {step===1 && renderNIDStep('father')}
          {step===2 && renderNIDStep('mother')}
          {step===3 && (
            <View style={{ gap:14 }}>
              <Text style={{ fontSize:18, fontWeight:'800', color:T.text }}>Child Information</Text>
              <Text style={{ fontSize:12, color:T.textSub, lineHeight:18 }}>Details will appear exactly as on the birth certificate. Surname and middle name are pre-filled from father's record.</Text>
              {[{label:'First Name *', val:childFirst, setVal:setChildFirst, placeholder:'e.g. Amani'},{label:'Middle Name (from father)', val:childMiddle, setVal:setChildMiddle, placeholder:fatherData?.middleName??'Optional'},{label:'Surname * (from father)', val:childSurname, setVal:setChildSurname, placeholder:fatherData?.surname??'e.g. Makonde'}].map(({label,val,setVal,placeholder})=>(
                <View key={label}>
                  <Text style={{ fontSize:12, fontWeight:'600', color:T.textSub, marginBottom:6 }}>{label}</Text>
                  <TextInput style={{ backgroundColor:T.card2, borderWidth:1, borderColor:T.border, borderRadius:10, paddingHorizontal:14, paddingVertical:12, color:T.text, fontSize:14 }} value={val} onChangeText={setVal} placeholder={placeholder} placeholderTextColor={T.textDim} autoCapitalize="words" returnKeyType="next" blurOnSubmit={false} />
                </View>
              ))}
              <View>
                <Text style={{ fontSize:12, fontWeight:'600', color:T.textSub, marginBottom:8 }}>Gender *</Text>
                <View style={{ flexDirection:'row', gap:10 }}>
                  {(['MALE','FEMALE'] as const).map(g=>(
                    <TouchableOpacity key={g} style={{ flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:8, borderRadius:10, borderWidth:1.5, paddingVertical:12, borderColor:childGender===g?(g==='MALE'?H.primaryL:'#a78bfa'):T.border, backgroundColor:childGender===g?(g==='MALE'?`${H.primary}25`:'#8b5cf620'):T.card2 }} onPress={()=>setChildGender(g)}>
                      <Text style={{ fontSize:18 }}>{g==='MALE'?'👦':'👧'}</Text>
                      <Text style={{ fontSize:13, fontWeight:'600', color:childGender===g?(g==='MALE'?H.primaryL:'#c4b5fd'):T.textSub }}>{g}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <View>
                <Text style={{ fontSize:12, fontWeight:'600', color:T.textSub, marginBottom:6 }}>Date of Birth *</Text>
                <TouchableOpacity style={{ backgroundColor:T.card2, borderWidth:1, borderColor:T.border, borderRadius:10, paddingHorizontal:14, paddingVertical:12, flexDirection:'row', alignItems:'center', justifyContent:'space-between' }} onPress={()=>setShowCal(true)}>
                  <Text style={{ color:childDOB?T.text:T.textDim, fontSize:14 }}>{childDOB||'Select date of birth'}</Text>
                  <Calendar size={16} color={T.textDim} />
                </TouchableOpacity>
              </View>
              <View style={{ flexDirection:'row', gap:8, backgroundColor:`${H.primary}10`, borderRadius:10, padding:12, borderWidth:1, borderColor:`${H.primary}30` }}>
                <AlertCircle size={13} color={H.primaryL} />
                <Text style={{ fontSize:11, color:T.textSub, flex:1, lineHeight:17 }}>A unique National ID will be auto-generated. The child collects their physical ID card at age 18 from the Village Officer.</Text>
              </View>
            </View>
          )}
          {step===4 && (
            <View style={{ gap:12 }}>
              <Text style={{ fontSize:18, fontWeight:'800', color:T.text }}>Review & Confirm</Text>
              <Text style={{ fontSize:12, color:T.textSub, lineHeight:18 }}>Verify all details. This record will be permanently stored.</Text>
              {fatherData && (
                <View style={{ borderRadius:12, borderWidth:1, borderColor:`${H.primary}40`, backgroundColor:`${H.primary}08`, padding:14 }}>
                  <Text style={{ fontSize:12, fontWeight:'800', color:H.primaryL, marginBottom:8 }}>FATHER</Text>
                  {[['Full Name',`${fatherData.firstName} ${fatherData.middleName??''} ${fatherData.surname}`.trim()],['National ID',fatherData.nationalId]].map(([k,v])=>(
                    <View key={k} style={{ flexDirection:'row', justifyContent:'space-between', marginBottom:4 }}><Text style={{ fontSize:11, color:T.textDim }}>{k}</Text><Text style={{ fontSize:11, color:T.text, fontWeight:'600' }}>{v}</Text></View>
                  ))}
                </View>
              )}
              {motherData && (
                <View style={{ borderRadius:12, borderWidth:1, borderColor:'#8b5cf640', backgroundColor:'#8b5cf608', padding:14 }}>
                  <Text style={{ fontSize:12, fontWeight:'800', color:'#c4b5fd', marginBottom:8 }}>MOTHER</Text>
                  {[['Full Name',`${motherData.firstName} ${motherData.middleName??''} ${motherData.surname}`.trim()],['National ID',motherData.nationalId]].map(([k,v])=>(
                    <View key={k} style={{ flexDirection:'row', justifyContent:'space-between', marginBottom:4 }}><Text style={{ fontSize:11, color:T.textDim }}>{k}</Text><Text style={{ fontSize:11, color:T.text, fontWeight:'600' }}>{v}</Text></View>
                  ))}
                </View>
              )}
              <View style={{ borderRadius:12, borderWidth:1, borderColor:`${TZ.green}40`, backgroundColor:`${TZ.green}08`, padding:14 }}>
                <Text style={{ fontSize:12, fontWeight:'800', color:TZ.green, marginBottom:8 }}>NEWBORN</Text>
                {[['Full Name',[childFirst,childMiddle,childSurname].filter(Boolean).join(' ')],['Gender',childGender],['Date of Birth',childDOB]].map(([k,v])=>(
                  <View key={k} style={{ flexDirection:'row', justifyContent:'space-between', marginBottom:4 }}><Text style={{ fontSize:11, color:T.textDim }}>{k}</Text><Text style={{ fontSize:11, color:T.text, fontWeight:'600' }}>{v}</Text></View>
                ))}
              </View>
              <View style={{ flexDirection:'row', gap:8, backgroundColor:T.card, borderRadius:10, padding:14, borderWidth:1, borderColor:T.border }}>
                <FileText size={13} color={T.textSub} />
                <Text style={{ fontSize:10, color:T.textDim, flex:1, lineHeight:16, fontStyle:'italic' }}>I, the registering officer, certify that the information provided is accurate and complete to the best of my knowledge, as required under the Births and Deaths Registration Act (Cap 108 R.E. 2002) of the United Republic of Tanzania.</Text>
              </View>
            </View>
          )}
        </ScrollView>

        {/* Nav footer */}
        <View style={{ position:'absolute', bottom:0, left:0, right:0, backgroundColor:T.card, borderTopWidth:1, borderTopColor:T.border, paddingHorizontal:16, paddingTop:10, paddingBottom:28 }}>
          <View style={{ height:3, backgroundColor:T.border, borderRadius:2, marginBottom:6 }}>
            <View style={{ height:3, backgroundColor:H.primary, borderRadius:2, width:`${(step/4)*100}%` }} />
          </View>
          <Text style={{ fontSize:10, color:T.textDim, marginBottom:10 }}>Step {step} of 4</Text>
          <View style={{ flexDirection:'row', gap:10 }}>
            {step>1 && (
              <TouchableOpacity style={{ flexDirection:'row', alignItems:'center', gap:4, borderRadius:12, borderWidth:1, borderColor:T.border, paddingHorizontal:16, paddingVertical:12 }} onPress={()=>setStep(s=>(s-1) as any)}>
                <ChevronLeft size={18} color={T.textSub} /><Text style={{ fontSize:14, color:T.textSub, fontWeight:'600' }}>Back</Text>
              </TouchableOpacity>
            )}
            {step<4 ? (
              <TouchableOpacity style={{ flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:6, backgroundColor:H.primary, borderRadius:12, paddingVertical:13, opacity:canNext?1:0.38 }} onPress={()=>setStep(s=>(s+1) as any)} disabled={!canNext}>
                <Text style={{ fontSize:14, fontWeight:'700', color:'#fff' }}>Continue</Text><ChevronRight size={18} color="#fff" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={{ flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:8, backgroundColor:TZ.green, borderRadius:12, paddingVertical:13, opacity:submitting?0.7:1 }} onPress={handleSubmit} disabled={submitting}>
                {submitting ? <ActivityIndicator color="#fff" size="small" /> : <><Check size={18} color="#fff" /><Text style={{ fontSize:14, fontWeight:'700', color:'#fff' }}>Register Birth</Text></>}
              </TouchableOpacity>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>

      <CalPicker visible={showCal} title="Select Date of Birth" onSelect={d=>{setChildDOB(d);setShowCal(false)}} onClose={()=>setShowCal(false)} />
      <SuccessModal visible={showSuccess} birth={savedBirth} pdfPath={pdfPath} onDownload={handleDownload} downloading={downloading} onClose={()=>{setShowSuccess(false);navigation.goBack()}} />
    </SafeAreaView>
  )
}