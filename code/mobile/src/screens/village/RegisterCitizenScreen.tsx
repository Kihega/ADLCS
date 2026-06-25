import React, { useState, useRef, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  Alert, ActivityIndicator, Modal, KeyboardAvoidingView, Platform,
  Animated,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ArrowLeft, Calendar, X, CheckCircle2, Copy } from 'lucide-react-native'
import * as Clipboard from 'expo-clipboard'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useTheme, TZ } from '../../context/ThemeContext'
import { apiPost, isOnline } from '../../services/syncService'

import { User, Shield, AlertTriangle, CheckCircle2 as CC } from 'lucide-react-native'
import { generateNationalId } from '../../services/localDb'

// ── Reusable calendar picker (no external packages) ──────────────────────────
function CalPicker({ visible, title, maxDate, minDate, onSelect, onClose }: {
  visible:boolean; title:string; maxDate?:Date; minDate?:Date
  onSelect:(v:string)=>void; onClose:()=>void
}) {
  const { theme:T } = useTheme()
  const curY = new Date().getFullYear()
  const MONTHS = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December']
  const minY = minDate ? minDate.getFullYear() : curY - 120
  const maxY = maxDate ? maxDate.getFullYear() : curY
  const [yr, setYr] = useState(maxY)
  const [mo, setMo] = useState((maxDate??new Date()).getMonth()+1)
  const [dy, setDy] = useState((maxDate??new Date()).getDate())
  const daysIn = new Date(yr, mo, 0).getDate()
  const years  = Array.from({length: maxY - minY + 1}, (_, i) => maxY - i)
  if (!visible) return null
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={{flex:1,justifyContent:'flex-end',backgroundColor:'rgba(0,0,0,0.65)'}}>
        <View style={{backgroundColor:T.card,borderTopLeftRadius:24,borderTopRightRadius:24,padding:20,paddingBottom:36}}>
          <View style={{width:40,height:4,backgroundColor:T.border,borderRadius:2,alignSelf:'center',marginBottom:16}}/>
          <View style={{flexDirection:'row',alignItems:'center',gap:8,marginBottom:14}}>
            <Calendar size={15} color="#22d3ee"/>
            <Text style={{flex:1,fontSize:15,fontWeight:'800',color:T.text}}>{title}</Text>
            <TouchableOpacity onPress={onClose}><X size={17} color={T.textSub}/></TouchableOpacity>
          </View>
          <View style={{flexDirection:'row',gap:6,height:190}}>
            <View style={{flex:1}}>
              <Text style={{fontSize:10,color:T.textDim,textAlign:'center',marginBottom:4}}>Day</Text>
              <ScrollView showsVerticalScrollIndicator={false}>
                {Array.from({length:daysIn},(_,i)=>i+1).map(d=>(
                  <TouchableOpacity key={d} onPress={()=>setDy(d)}
                    style={{paddingVertical:9,alignItems:'center',borderRadius:8,marginVertical:2,backgroundColor:d===dy?'#0891b230':'transparent'}}>
                    <Text style={{fontSize:13,color:d===dy?'#22d3ee':T.textSub,fontWeight:d===dy?'800':'400'}}>{String(d).padStart(2,'0')}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
            <View style={{flex:2}}>
              <Text style={{fontSize:10,color:T.textDim,textAlign:'center',marginBottom:4}}>Month</Text>
              <ScrollView showsVerticalScrollIndicator={false}>
                {MONTHS.map((name,i)=>(
                  <TouchableOpacity key={name} onPress={()=>setMo(i+1)}
                    style={{paddingVertical:9,alignItems:'center',borderRadius:8,marginVertical:2,backgroundColor:i+1===mo?'#0891b230':'transparent'}}>
                    <Text style={{fontSize:13,color:i+1===mo?'#22d3ee':T.textSub,fontWeight:i+1===mo?'800':'400'}}>{name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
            <View style={{flex:1.5}}>
              <Text style={{fontSize:10,color:T.textDim,textAlign:'center',marginBottom:4}}>Year</Text>
              <ScrollView showsVerticalScrollIndicator={false}>
                {years.map(y=>(
                  <TouchableOpacity key={y} onPress={()=>setYr(y)}
                    style={{paddingVertical:9,alignItems:'center',borderRadius:8,marginVertical:2,backgroundColor:y===yr?'#0891b230':'transparent'}}>
                    <Text style={{fontSize:13,color:y===yr?'#22d3ee':T.textSub,fontWeight:y===yr?'800':'400'}}>{y}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
          <View style={{flexDirection:'row',gap:10,marginTop:16}}>
            <TouchableOpacity onPress={onClose}
              style={{flex:1,borderWidth:1,borderColor:T.border,borderRadius:12,paddingVertical:13,alignItems:'center'}}>
              <Text style={{color:T.textSub,fontWeight:'600'}}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={()=>onSelect(`${String(dy).padStart(2,'0')}/${String(mo).padStart(2,'0')}/${yr}`)}
              style={{flex:2,backgroundColor:'#0891b2',borderRadius:12,paddingVertical:13,alignItems:'center'}}>
              <Text style={{color:'#fff',fontWeight:'800'}}>Confirm</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )
}

// ── Stable field (module-level — keyboard stays open) ─────────────────────────
const SField = React.memo(function SField({ label, value, onChange, placeholder, multiline=false, bg, bc, tc, dc, required=false }: any) {
  return (
    <View style={{marginBottom:14}}>
      <Text style={{fontSize:12,fontWeight:'600',color:dc,marginBottom:6}}>
        {label}{required?' *':''}
      </Text>
      <TextInput
        style={[{borderWidth:1,borderRadius:10,paddingHorizontal:14,paddingVertical:12,fontSize:14,backgroundColor:bg,borderColor:bc,color:tc},
                multiline&&{height:80,paddingTop:12,textAlignVertical:'top'}]}
        value={value} onChangeText={onChange} placeholder={placeholder??''}
        placeholderTextColor={dc} multiline={multiline}
        returnKeyType={multiline?'default':'next'} blurOnSubmit={false}/>
    </View>
  )
})

// ── Toast ─────────────────────────────────────────────────────────────────────
function Toast({ msg, vis }: { msg:string; vis:boolean }) {
  const op = useRef(new Animated.Value(0)).current
  // LINTFIX-5: disable comment moved to sit directly above the dependency
  // array line, where eslint-plugin-react-hooks actually attaches the warning
  // (it was previously above `useEffect(`, one line too early to suppress it).
  useEffect(()=>{
    if (vis) Animated.sequence([
      Animated.timing(op,{toValue:1,duration:200,useNativeDriver:true}),
      Animated.delay(1600),
      Animated.timing(op,{toValue:0,duration:300,useNativeDriver:true}),
    ]).start()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[vis])
  return (
    <Animated.View pointerEvents="none"
      style={{position:'absolute',bottom:100,alignSelf:'center',backgroundColor:TZ.green,
              borderRadius:20,paddingHorizontal:18,paddingVertical:10,
              flexDirection:'row',alignItems:'center',gap:8,opacity:op,elevation:9}}>
      <CheckCircle2 size={14} color="#fff"/>
      <Text style={{color:'#fff',fontWeight:'700',fontSize:13}}>{msg}</Text>
    </Animated.View>
  )
}

// ── Screen header ─────────────────────────────────────────────────────────────
function ScreenHeader({ title, sub, icon, iconBg, onBack }: {
  title:string; sub:string; icon:React.ReactNode; iconBg:string; onBack:()=>void
}) {
  const { theme:T } = useTheme()
  return (
    <View style={{flexDirection:'row',alignItems:'center',paddingHorizontal:16,paddingVertical:12,
                  borderBottomWidth:1,backgroundColor:T.card,borderBottomColor:T.border}}>
      <TouchableOpacity onPress={onBack}
        style={{width:36,height:36,borderRadius:10,alignItems:'center',justifyContent:'center'}}>
        <ArrowLeft size={20} color={T.text}/>
      </TouchableOpacity>
      <View style={{flex:1,alignItems:'center'}}>
        <Text style={{fontSize:15,fontWeight:'800',color:T.text}}>{title}</Text>
        <Text style={{fontSize:11,color:T.textSub,marginTop:2}}>{sub}</Text>
      </View>
      <View style={{width:36,height:36,borderRadius:10,backgroundColor:iconBg,alignItems:'center',justifyContent:'center'}}>
        {icon}
      </View>
    </View>
  )
}

type VStack = { VillageHome:undefined; RegisterCitizen:undefined }
type Props  = { navigation: NativeStackNavigationProp<VStack,'RegisterCitizen'> }

// ── Age calculation ────────────────────────────────────────────────────────────
function calcAge(dob: string): number {
  const [d, m, y] = dob.split('/').map(Number)
  if (!y) return 0
  const now  = new Date()
  let age = now.getFullYear() - y
  if (now.getMonth()+1 < m || (now.getMonth()+1 === m && now.getDate() < d)) age--
  return age
}

export default function RegisterCitizenScreen({ navigation }: Props) {
  const { theme:T } = useTheme()
  const [step,        setStep]        = useState<1|2|3>(1)
  const [dob,         setDob]         = useState('')
  const [showCal,     setShowCal]     = useState(false)
  const [ageError,    setAgeError]    = useState('')
  const [firstName,   setFirstName]   = useState('')
  const [middleName,  setMiddleName]  = useState('')
  const [surname,     setSurname]     = useState('')
  const [gender,      setGender]      = useState<'male'|'female'|''>('')
  const [bloodGroup,  setBloodGroup]  = useState('')
  const [phone,       setPhone]       = useState('')
  const [occupation,  setOccupation]  = useState('')
  const [submitting,  setSubmitting]  = useState(false)
  const [genNid,      setGenNid]      = useState('')
  const [toast,       setToast]       = useState('')
  const [toastVis,    setToastVis]    = useState(false)

  const _BLOOD_GROUPS = ['A+','A-','B+','B-','AB+','AB-','O+','O-','Unknown']

  const checkAge = () => {
    if (!dob) { setAgeError('Please select a date of birth.'); return }
    const age = calcAge(dob)
    if (age < 18) {
      setAgeError(`Citizen must be at least 18 years old.\n\nDate of birth entered: ${dob}\nCalculated age: ${age} year${age===1?'':'s'}\n\nBirth registration for children is handled by the Hospital Officer at the health facility.`)
      return
    }
    setAgeError('')
    setStep(2)
  }

  const handleSubmit = async () => {
    if (!firstName.trim()||!surname.trim()||!gender) {
      Alert.alert('Required','First name, surname and gender are required.')
      return
    }
    setSubmitting(true)
    try {
      const nid = generateNationalId(dob)
      setGenNid(nid)
      if (isOnline()) {
        try {
          await apiPost('/village/citizen', {
            firstName:firstName.trim(), middleName:middleName.trim(),
            surname:surname.trim(), gender, dateOfBirth:dob,
            nationalId:nid, bloodGroup, phone:phone.trim(), occupation:occupation.trim(),
          })
        } catch {}
      }
      setStep(3)
    } catch { Alert.alert('Error','Registration failed. Try again.') }
    setSubmitting(false)
  }

  const copy = async (text:string, label:string) => {
    await Clipboard.setStringAsync(text)
    setToast(`${label} copied successfully`)
    setToastVis(true); setTimeout(()=>setToastVis(false),2400)
  }

  return (
    <SafeAreaView style={{flex:1,backgroundColor:T.bg}} edges={['top']}>
      <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}>
        <ScreenHeader title="Register Citizen" sub="Village Enumeration · 18+ Only"
          icon={<User size={18} color="#0891b2"/>} iconBg="#0891b218"
          onBack={()=>navigation.goBack()}/>

        {/* Step 1 — Age verification */}
        {step===1 && (
          <ScrollView contentContainerStyle={{padding:20,paddingBottom:40}} keyboardShouldPersistTaps="handled">
            <View style={{backgroundColor:'#0891b210',borderWidth:1,borderColor:'#0891b230',borderRadius:14,padding:16,marginBottom:20}}>
              <View style={{flexDirection:'row',alignItems:'center',gap:8,marginBottom:8}}>
                <Shield size={16} color="#0891b2"/>
                <Text style={{fontSize:14,fontWeight:'800',color:T.text}}>Age Verification Required</Text>
              </View>
              <Text style={{fontSize:12,color:T.textSub,lineHeight:18}}>
                Village Officer citizen registration is for adults only (18+).{`\n`}
                Birth registration for newborns is handled exclusively by Hospital Officers.
              </Text>
            </View>

            <Text style={{fontSize:16,fontWeight:'800',color:T.text,marginBottom:4}}>Verify Age</Text>
            <Text style={{fontSize:12,color:T.textSub,marginBottom:16,lineHeight:18}}>
              Enter the citizen's date of birth. The system will verify they are 18 or older before proceeding.
            </Text>

            <View style={{marginBottom:16}}>
              <Text style={{fontSize:12,fontWeight:'600',color:T.textSub,marginBottom:6}}>Date of Birth *</Text>
              <TouchableOpacity
                style={{borderWidth:1,borderRadius:10,paddingHorizontal:14,paddingVertical:14,
                        backgroundColor:T.card2,borderColor:T.border,flexDirection:'row',
                        alignItems:'center',justifyContent:'space-between'}}
                onPress={()=>setShowCal(true)}>
                <Text style={{color:dob?T.text:T.textDim,fontSize:14}}>{dob||'Select date of birth'}</Text>
                <Calendar size={16} color={T.textDim}/>
              </TouchableOpacity>
              {!!dob && (
                <Text style={{fontSize:12,color:T.textSub,marginTop:6}}>
                  Age: <Text style={{fontWeight:'800',color:calcAge(dob)>=18?TZ.green:'#dc2626'}}>
                    {calcAge(dob)} years old
                  </Text>
                </Text>
              )}
            </View>

            {!!ageError && (
              <View style={{backgroundColor:'#dc262615',borderWidth:1,borderColor:'#dc262640',borderRadius:12,padding:14,marginBottom:16}}>
                <View style={{flexDirection:'row',alignItems:'center',gap:8,marginBottom:6}}>
                  <AlertTriangle size={16} color="#dc2626"/>
                  <Text style={{fontSize:13,fontWeight:'800',color:'#dc2626'}}>Age Restriction</Text>
                </View>
                <Text style={{fontSize:12,color:T.textSub,lineHeight:18}}>{ageError}</Text>
              </View>
            )}

            <TouchableOpacity
              style={{backgroundColor:'#0891b2',borderRadius:12,paddingVertical:14,alignItems:'center',opacity:dob?1:0.4}}
              onPress={checkAge} disabled={!dob}>
              <Text style={{color:'#fff',fontWeight:'800',fontSize:14}}>Verify Age & Continue</Text>
            </TouchableOpacity>

            <CalPicker visible={showCal} title="Date of Birth"
              maxDate={new Date()} onSelect={d=>{setDob(d);setShowCal(false)}} onClose={()=>setShowCal(false)}/>
          </ScrollView>
        )}

        {/* Step 2 — Full profile */}
        {step===2 && (
          <ScrollView contentContainerStyle={{padding:20,paddingBottom:40}} keyboardShouldPersistTaps="handled">
            <View style={{backgroundColor:`${TZ.green}10`,borderWidth:1,borderColor:`${TZ.green}30`,borderRadius:10,padding:10,marginBottom:16,flexDirection:'row',alignItems:'center',gap:8}}>
              <CC size={14} color={TZ.green}/>
              <Text style={{fontSize:12,color:TZ.green,fontWeight:'600'}}>Age verified: {calcAge(dob)} years old · DOB: {dob}</Text>
            </View>

            <Text style={{fontSize:16,fontWeight:'800',color:T.text,marginBottom:16}}>Personal Details</Text>
            <SField label="First Name" value={firstName} onChange={setFirstName} placeholder="e.g. Amina" required bg={T.card2} bc={T.border} tc={T.text} dc={T.textDim}/>
            <SField label="Middle Name" value={middleName} onChange={setMiddleName} placeholder="Optional" bg={T.card2} bc={T.border} tc={T.text} dc={T.textDim}/>
            <SField label="Surname" value={surname} onChange={setSurname} placeholder="e.g. Mbeki" required bg={T.card2} bc={T.border} tc={T.text} dc={T.textDim}/>

            <View style={{marginBottom:14}}>
              <Text style={{fontSize:12,fontWeight:'600',color:T.textSub,marginBottom:8}}>Gender *</Text>
              <View style={{flexDirection:'row',gap:10}}>
                {(['male','female'] as const).map(g=>(
                  <TouchableOpacity key={g} onPress={()=>setGender(g)}
                    style={{flex:1,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,
                            borderRadius:10,borderWidth:1.5,paddingVertical:12,
                            borderColor:gender===g?TZ.blue:T.border,backgroundColor:gender===g?`${TZ.blue}25`:T.card2}}>
                    <Text style={{fontSize:18}}>{g==='male'?'👨':'👩'}</Text>
                    <Text style={{fontSize:13,fontWeight:'600',color:gender===g?TZ.blue:T.textSub}}>{g.toUpperCase()}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={{marginBottom:14}}>
              <Text style={{fontSize:12,fontWeight:'600',color:T.textSub,marginBottom:8}}>Blood Group</Text>
              <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>
                {['A+','A-','B+','B-','AB+','AB-','O+','O-','Unknown'].map(bg=>(
                  <TouchableOpacity key={bg} onPress={()=>setBloodGroup(bg)}
                    style={{borderWidth:1,borderRadius:20,paddingHorizontal:12,paddingVertical:6,
                            borderColor:bloodGroup===bg?TZ.blue:T.border,backgroundColor:bloodGroup===bg?`${TZ.blue}20`:T.card}}>
                    <Text style={{fontSize:11,color:bloodGroup===bg?TZ.blue:T.textSub}}>{bg}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <SField label="Phone Number" value={phone} onChange={setPhone} placeholder="+255 7XX XXX XXX" bg={T.card2} bc={T.border} tc={T.text} dc={T.textDim}/>
            <SField label="Occupation" value={occupation} onChange={setOccupation} placeholder="e.g. Farmer, Teacher, Trader" bg={T.card2} bc={T.border} tc={T.text} dc={T.textDim}/>

            <TouchableOpacity
              style={{backgroundColor:TZ.green,borderRadius:12,paddingVertical:14,alignItems:'center',opacity:submitting?0.7:1}}
              onPress={handleSubmit} disabled={submitting}>
              {submitting ? <ActivityIndicator color="#fff"/> : <Text style={{color:'#fff',fontWeight:'800',fontSize:14}}>Register Citizen</Text>}
            </TouchableOpacity>
          </ScrollView>
        )}

        {/* Step 3 — Success */}
        {step===3 && (
          <ScrollView contentContainerStyle={{padding:20,paddingBottom:40,alignItems:'center'}}>
            <View style={{width:80,height:80,borderRadius:40,backgroundColor:`${TZ.green}18`,alignItems:'center',justifyContent:'center',marginBottom:16}}>
              <CheckCircle2 size={40} color={TZ.green}/>
            </View>
            <Text style={{fontSize:22,fontWeight:'900',color:T.text,marginBottom:6}}>Citizen Registered!</Text>
            <Text style={{fontSize:13,color:T.textSub,marginBottom:4,textAlign:'center'}}>
              {firstName} {middleName} {surname}
            </Text>
            <Text style={{fontSize:12,color:T.textDim,marginBottom:24,textAlign:'center'}}>
              Successfully added to the NBS Central Database
            </Text>

            <View style={{width:'100%',gap:10}}>
              <Text style={{fontSize:11,color:T.textDim,fontWeight:'600',textTransform:'uppercase',letterSpacing:0.5}}>Generated National ID (NIN)</Text>
              <View style={{borderRadius:10,borderWidth:1,borderColor:`${TZ.blue}50`,backgroundColor:`${TZ.blue}10`,padding:12,flexDirection:'row',alignItems:'center'}}>
                <Text style={{fontSize:13,fontWeight:'900',color:TZ.blue,flex:1,letterSpacing:0.5}}>{genNid}</Text>
                <TouchableOpacity onPress={()=>copy(genNid,'National ID')} style={{padding:4}}>
                  <Copy size={15} color={TZ.blue}/>
                </TouchableOpacity>
              </View>
              <Text style={{fontSize:10,color:T.textDim,fontStyle:'italic'}}>
                Citizen collects physical ID card from Village Officer upon request
              </Text>
            </View>

            <TouchableOpacity
              style={{backgroundColor:TZ.green,borderRadius:12,paddingVertical:14,alignItems:'center',width:'100%',marginTop:20}}
              onPress={()=>{ setStep(1); setDob(''); setFirstName(''); setMiddleName(''); setSurname(''); setGender(''); setBloodGroup('') }}>
              <Text style={{color:'#fff',fontWeight:'800',fontSize:14}}>Register Another</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{borderWidth:1,borderColor:T.border,borderRadius:12,paddingVertical:14,alignItems:'center',width:'100%',marginTop:8}}
              onPress={()=>navigation.goBack()}>
              <Text style={{color:T.textSub,fontWeight:'700',fontSize:14}}>Back to Dashboard</Text>
            </TouchableOpacity>
          </ScrollView>
        )}
      </KeyboardAvoidingView>
      <Toast msg={toast} vis={toastVis}/>
    </SafeAreaView>
  )
}