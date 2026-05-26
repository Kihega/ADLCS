import React, { useState, useRef, useCallback, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  Alert, ActivityIndicator, Modal, KeyboardAvoidingView, Platform,
  Animated,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ArrowLeft, Calendar, X, CheckCircle2, Copy } from 'lucide-react-native'
import * as Clipboard from 'expo-clipboard'
import AsyncStorage   from '@react-native-async-storage/async-storage'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useTheme, TZ } from '../../context/ThemeContext'
import { apiPost, isOnline } from '../../services/syncService'

import { saveDeath, generateDeathCertNo } from '../../services/localDb'

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
      <View style={{flex:1,justifyContent:'flex-end',backgroundColor:'rgba(0,0.65)'}}>
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
  useEffect(()=>{
    if (vis) Animated.sequence([
      Animated.timing(op,{toValue:1,duration:200,useNativeDriver:true}),
      Animated.delay(1600),
      Animated.timing(op,{toValue:0,duration:300,useNativeDriver:true}),
    ]).start()
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

type VStack = { VillageHome:undefined; VillageRecordDeath:undefined }
type Props  = { navigation: NativeStackNavigationProp<VStack,'VillageRecordDeath'> }

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'https://adlcs.onrender.com/api'

export default function VillageRecordDeathScreen({ navigation }: Props) {
  const { theme:T } = useTheme()
  const [lookupId,   setLookupId]   = useState('')
  const [lookupLoad, setLookupLoad] = useState(false)
  const [citizen,    setCitizen]    = useState<any>(null)
  const [cause,      setCause]      = useState('')
  const [dod,        setDod]        = useState('')
  const [showCal,    setShowCal]    = useState(false)
  const [locationType, setLocType]  = useState<'home'|'public_place'|'other'>('home')
  const [category,   setCategory]   = useState<'infant'|'child'|'adult'|'maternal'>('adult')
  const [informant,  setInformant]  = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [certNo,     setCertNo]     = useState('')
  const [step,       setStep]       = useState<1|2|3>(1)
  const [toast,      setToast]      = useState('')
  const [toastVis,   setToastVis]   = useState(false)

  const LOC_TYPES  = [{val:'home',label:'Home'},{val:'public_place',label:'Public Place'},{val:'other',label:'Other'}] as const
  const CATEGORIES = [{val:'infant',label:'Infant (<1yr)'},{val:'child',label:'Child (1–17)'},{val:'adult',label:'Adult (18+)'},{val:'maternal',label:'Maternal'}] as const

  const searchCitizen = async () => {
    if (lookupId.trim().length<3) return
    setLookupLoad(true)
    try {
      const token = await AsyncStorage.getItem('adlcs_access_token')
      if (token && isOnline()) {
        const r = await fetch(`${API_BASE}/officer/citizen-lookup?q=${encodeURIComponent(lookupId.trim())}`,
          { headers:{ Authorization:`Bearer ${token}` }, signal: (()=>{const __c=new AbortController();setTimeout(()=>__c.abort(),5000);return __c.signal})() })
        const j = await r.json()
        if (j.success && j.data) { setCitizen(j.data); setStep(2); setLookupLoad(false); return }
      }
    } catch {}
    Alert.alert('Not Found Online','Proceed with manual entry?',[
      {text:'Cancel',style:'cancel'},
      {text:'Manual Entry',onPress:()=>{ setCitizen({fullName:lookupId.trim(),nationalId:lookupId.trim()}); setStep(2) }},
    ])
    setLookupLoad(false)
  }

  const handleSubmit = async () => {
    if (!cause.trim()||!dod.trim()||!informant.trim()) {
      Alert.alert('Incomplete','Cause of death, date of death, and informant name are required.')
      return
    }
    setSubmitting(true)
    try {
      const cert = generateDeathCertNo(); setCertNo(cert)
      const token = await AsyncStorage.getItem('adlcs_access_token')
      let officerName='', facilityName=''
      if (token && isOnline()) {
        try {
          const r = await fetch(`${API_BASE}/officer/dashboard`,{ headers:{ Authorization:`Bearer ${token}` }, signal: (()=>{const __c=new AbortController();setTimeout(()=>__c.abort(),5000);return __c.signal})() })
          const j = await r.json()
          if (j.success) { officerName=j.data.officerName; facilityName=j.data.villageName??j.data.facilityName }
        } catch {}
      }
      await saveDeath({
        certNo:cert, nationalId:citizen?.nationalId??lookupId.trim(),
        deceasedName:citizen?.fullName??citizen?.firstName?`${citizen.firstName} ${citizen.surname??''}`.trim():lookupId.trim(),
        causeOfDeath:cause.trim(), dateOfDeath:dod.trim(),
        locationType:locationType as any, category:category as any,
        informantName:informant.trim(), facilityName:facilityName||'Village',
        officerName, rawJson:JSON.stringify({ nationalId:citizen?.nationalId, causeOfDeath:cause.trim() }),
      })
      if (token && isOnline()) {
        try {
          await apiPost('/village/death', {
            deceasedName:citizen?.fullName??lookupId.trim(), nationalId:citizen?.nationalId??lookupId.trim(),
            causeOfDeath:cause.trim(), dateOfDeath:dod.trim(), category:category,
            informantName:informant.trim(), deathCertNo:cert, locationType:locationType,
          })
        } catch {}
      }
      setStep(3)
    } catch { Alert.alert('Error','Submission failed. Please try again.') }
    setSubmitting(false)
  }

  const copy = async (text:string, label:string) => {
    await Clipboard.setStringAsync(text)
    setToast(`${label} copied`); setToastVis(true)
    setTimeout(()=>setToastVis(false), 2400)
  }

  return (
    <SafeAreaView style={{flex:1,backgroundColor:T.bg}} edges={['top']}>
      <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}>
        <ScreenHeader title="Record Death" sub="Outside Health Facility"
          icon={<Cross size={18} color="#dc2626"/>} iconBg="#dc262618"
          onBack={()=>step>1&&step<3?setStep(s=>(s-1) as any):navigation.goBack()}/>

        {/* Step dots */}
        <View style={{flexDirection:'row',backgroundColor:T.card,borderBottomWidth:1,borderBottomColor:T.border,paddingVertical:10,paddingHorizontal:20,gap:8,justifyContent:'center'}}>
          {['Lookup','Details','Recorded'].map((lbl,i)=>(
            <View key={lbl} style={{alignItems:'center',flex:1}}>
              <View style={{width:22,height:22,borderRadius:11,alignItems:'center',justifyContent:'center',marginBottom:3,
                            backgroundColor:step>i+1?TZ.green:step===i+1?'#dc2626':T.border}}>
                <Text style={{color:'#fff',fontSize:10,fontWeight:'800'}}>{i+1}</Text>
              </View>
              <Text style={{fontSize:9,fontWeight:'600',color:step>=i+1?T.text:T.textDim}}>{lbl}</Text>
            </View>
          ))}
        </View>

        <ScrollView contentContainerStyle={{padding:20,paddingBottom:40}} keyboardShouldPersistTaps="handled">
          {/* Hospital warning */}
          <View style={{backgroundColor:'#f9731612',borderWidth:1,borderColor:'#f9731640',borderRadius:12,padding:14,marginBottom:16,flexDirection:'row',gap:10}}>
            <AlertTriangle size={16} color="#f97316"/>
            <Text style={{fontSize:12,color:T.textSub,flex:1,lineHeight:18}}>
              Record deaths that occurred <Text style={{fontWeight:'800',color:'#f97316'}}>OUTSIDE health facilities</Text>. Deaths at hospitals or dispensaries are recorded by the Hospital Officer.
            </Text>
          </View>

          {step===1 && (
            <View style={{gap:14}}>
              <Text style={{fontSize:16,fontWeight:'800',color:T.text}}>Search Deceased Citizen</Text>
              <View style={{flexDirection:'row',gap:8}}>
                <TextInput style={{flex:1,borderWidth:1,borderRadius:10,paddingHorizontal:14,paddingVertical:12,fontSize:14,backgroundColor:T.card2,borderColor:T.border,color:T.text}}
                  value={lookupId} onChangeText={setLookupId} placeholder="National ID or full name"
                  placeholderTextColor={T.textDim} returnKeyType="search" blurOnSubmit={false}
                  onSubmitEditing={searchCitizen}/>
                <TouchableOpacity style={{backgroundColor:'#dc2626',borderRadius:10,paddingHorizontal:14,alignItems:'center',justifyContent:'center',opacity:lookupId.trim().length>=3?1:0.4}}
                  onPress={searchCitizen} disabled={lookupId.trim().length<3||lookupLoad}>
                  {lookupLoad ? <ActivityIndicator color="#fff" size="small"/> : <Search size={16} color="#fff"/>}
                </TouchableOpacity>
              </View>
              {citizen && (
                <View style={{borderWidth:1,borderRadius:12,borderColor:`${TZ.green}40`,backgroundColor:`${TZ.green}10`,padding:12,flexDirection:'row',gap:10}}>
                  <User size={15} color={TZ.green}/>
                  <View style={{flex:1}}>
                    <Text style={{fontSize:14,fontWeight:'700',color:T.text}}>{citizen.fullName??`${citizen.firstName??''} ${citizen.surname??''}`.trim()}</Text>
                    {citizen.nationalId && <Text style={{fontSize:11,color:T.textSub,marginTop:2}}>{citizen.nationalId}</Text>}
                  </View>
                </View>
              )}
              <TouchableOpacity style={{backgroundColor:'#dc2626',borderRadius:12,paddingVertical:14,alignItems:'center',opacity:citizen?1:0.4}}
                onPress={()=>setStep(2)} disabled={!citizen}>
                <Text style={{color:'#fff',fontWeight:'800',fontSize:14}}>Proceed to Details</Text>
              </TouchableOpacity>
            </View>
          )}

          {step===2 && (
            <View style={{gap:0}}>
              {citizen && (
                <View style={{borderWidth:1,borderRadius:12,borderColor:`${TZ.green}40`,backgroundColor:`${TZ.green}10`,padding:12,flexDirection:'row',gap:10,marginBottom:14}}>
                  <User size={15} color={TZ.green}/>
                  <Text style={{fontSize:14,fontWeight:'700',color:T.text,flex:1}}>{citizen.fullName??`${citizen.firstName??''} ${citizen.surname??''}`.trim()}</Text>
                </View>
              )}
              <SField label="Cause of Death" value={cause} onChange={setCause}
                placeholder="e.g. Malaria, Accident, Cardiac arrest" required multiline
                bg={T.card2} bc={T.border} tc={T.text} dc={T.textDim}/>
              <View style={{marginBottom:14}}>
                <Text style={{fontSize:12,fontWeight:'600',color:T.textSub,marginBottom:6}}>Date of Death *</Text>
                <TouchableOpacity style={{borderWidth:1,borderRadius:10,paddingHorizontal:14,paddingVertical:12,backgroundColor:T.card2,borderColor:T.border,flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}
                  onPress={()=>setShowCal(true)}>
                  <Text style={{color:dod?T.text:T.textDim,fontSize:14}}>{dod||'Select date'}</Text>
                  <Calendar size={16} color={T.textDim}/>
                </TouchableOpacity>
              </View>
              <View style={{marginBottom:14}}>
                <Text style={{fontSize:12,fontWeight:'600',color:T.textSub,marginBottom:8}}>Place of Death</Text>
                <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>
                  {LOC_TYPES.map(l=>(
                    <TouchableOpacity key={l.val} onPress={()=>setLocType(l.val)}
                      style={{borderWidth:1,borderRadius:20,paddingHorizontal:12,paddingVertical:6,
                              borderColor:locationType===l.val?'#dc2626':T.border,backgroundColor:locationType===l.val?'#dc262618':T.card}}>
                      <Text style={{fontSize:11,color:locationType===l.val?'#dc2626':T.textSub}}>{l.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <View style={{marginBottom:14}}>
                <Text style={{fontSize:12,fontWeight:'600',color:T.textSub,marginBottom:8}}>Category</Text>
                <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>
                  {CATEGORIES.map(c=>(
                    <TouchableOpacity key={c.val} onPress={()=>setCategory(c.val)}
                      style={{borderWidth:1,borderRadius:20,paddingHorizontal:12,paddingVertical:6,
                              borderColor:category===c.val?'#dc2626':T.border,backgroundColor:category===c.val?'#dc262618':T.card}}>
                      <Text style={{fontSize:11,color:category===c.val?'#dc2626':T.textSub}}>{c.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <SField label="Informant Name" value={informant} onChange={setInformant}
                placeholder="Full name of reporting person" required
                bg={T.card2} bc={T.border} tc={T.text} dc={T.textDim}/>
              <TouchableOpacity style={{backgroundColor:'#dc2626',borderRadius:12,paddingVertical:14,alignItems:'center',marginTop:4,opacity:submitting?0.7:1}}
                onPress={handleSubmit} disabled={submitting}>
                {submitting ? <ActivityIndicator color="#fff"/> : <Text style={{color:'#fff',fontWeight:'800',fontSize:14}}>Submit Death Record</Text>}
              </TouchableOpacity>
            </View>
          )}

          {step===3 && (
            <View style={{alignItems:'center',gap:14}}>
              <View style={{width:80,height:80,borderRadius:40,backgroundColor:'#dc262618',alignItems:'center',justifyContent:'center'}}>
                <CC size={40} color="#dc2626"/>
              </View>
              <Text style={{fontSize:20,fontWeight:'900',color:T.text}}>Death Recorded</Text>
              <Text style={{fontSize:12,color:T.textSub,textAlign:'center'}}>Saved locally · will sync to Central Database on reconnection</Text>
              <View style={{width:'100%',borderRadius:12,borderWidth:1,borderColor:'#dc262650',backgroundColor:'#dc262610',padding:14}}>
                <Text style={{fontSize:11,color:T.textDim,marginBottom:4}}>CERTIFICATE NUMBER</Text>
                <View style={{flexDirection:'row',alignItems:'center'}}>
                  <Text style={{fontSize:16,fontWeight:'900',color:'#dc2626',flex:1,letterSpacing:1}}>{certNo}</Text>
                  <TouchableOpacity onPress={()=>copy(certNo,'Certificate number')} style={{padding:4}}>
                    <Copy size={15} color="#dc2626"/>
                  </TouchableOpacity>
                </View>
              </View>
              <TouchableOpacity style={{backgroundColor:'#dc2626',borderRadius:12,paddingVertical:14,alignItems:'center',width:'100%'}}
                onPress={()=>navigation.goBack()}>
                <Text style={{color:'#fff',fontWeight:'800',fontSize:14}}>Back to Dashboard</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
        <CalPicker visible={showCal} title="Date of Death" maxDate={new Date()}
          onSelect={d=>{setDod(d);setShowCal(false)}} onClose={()=>setShowCal(false)}/>
      </KeyboardAvoidingView>
      <Toast msg={toast} vis={toastVis}/>
    </SafeAreaView>
  )
}