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

import { Navigation, User, Search, CheckCircle2 as CC } from 'lucide-react-native'

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

type VStack = { VillageHome:undefined; TrackMigration:undefined }
type Props  = { navigation: NativeStackNavigationProp<VStack,'TrackMigration'> }

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'https://adlcs.onrender.com/api'
const REASONS  = ['Employment','Marriage','Education','Family Reunion','Farming','Business','Healthcare','Retirement','Other']
const REGIONS  = ['Arusha','Dar es Salaam','Dodoma','Geita','Iringa','Kagera','Katavi','Kigoma','Kilimanjaro','Lindi','Manyara','Mara','Mbeya','Morogoro','Mtwara','Mwanza','Njombe','Pemba North','Pemba South','Pwani','Rukwa','Ruvuma','Shinyanga','Simiyu','Singida','Songwe','Tabora','Tanga','Unguja North','Unguja South']

export default function TrackMigrationScreen({ navigation }: Props) {
  const { theme:T } = useTheme()
  const [direction,    setDirection]   = useState<'arriving'|'departing'>('arriving')
  const [citizenNid,   setCitizenNid]  = useState('')
  const [citizenData,  setCitizenData] = useState<any>(null)
  const [searching,    setSearching]   = useState(false)
  const [moveDate,     setMoveDate]    = useState('')
  const [showCal,      setShowCal]     = useState(false)
  const [fromRegion,   setFromRegion]  = useState('')
  const [toRegion,     setToRegion]    = useState('')
  const [fromVillage,  setFromVillage] = useState('')
  const [toVillage,    setToVillage]   = useState('')
  const [reason,       setReason]      = useState('')
  const [notes,        setNotes]       = useState('')
  const [submitting,   setSubmitting]  = useState(false)
  const [refNo,        setRefNo]       = useState('')

  const searchCitizen = async () => {
    if (citizenNid.trim().length<3) return
    setSearching(true)
    try {
      const token = await AsyncStorage.getItem('adlcs_access_token')
      if (token && isOnline()) {
        const r = await fetch(`${API_BASE}/officer/citizen-lookup?q=${encodeURIComponent(citizenNid.trim())}`,
          { headers:{ Authorization:`Bearer ${token}` }, signal: (()=>{const __c=new AbortController();setTimeout(()=>__c.abort(),5000);return __c.signal})() })
        const j = await r.json()
        if (j.success && j.data) { setCitizenData(j.data); setSearching(false); return }
      }
    } catch {}
    Alert.alert('Not Found','Citizen not in database. Proceeding with manual entry.')
    setCitizenData({ fullName:citizenNid.trim(), nationalId:citizenNid.trim() })
    setSearching(false)
  }

  const handleSubmit = async () => {
    if (!moveDate) { Alert.alert('Required','Select the date of movement.'); return }
    if (!reason)   { Alert.alert('Required','Select reason for migration.'); return }
    setSubmitting(true)
    try {
      const ref = `MIG-${Date.now().toString().slice(-8)}`; setRefNo(ref)
      if (isOnline()) {
        try {
          await apiPost('/village/migration', {
            citizenName:citizenData?.fullName??citizenNid,
            nationalId:citizenData?.nationalId??citizenNid,
            direction, fromVillage:fromVillage.trim(), fromRegion,
            toVillage:toVillage.trim(), toRegion,
            reason, moveDate, notes:notes.trim(), referenceNo:ref,
          })
        } catch {}
      }
    } catch { Alert.alert('Error','Submission failed.') }
    setSubmitting(false)
  }

  const RegionPicker = ({ label, val, setVal }: any) => (
    <View style={{marginBottom:14}}>
      <Text style={{fontSize:12,fontWeight:'600',color:T.textSub,marginBottom:8}}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginHorizontal:-4}}>
        <View style={{flexDirection:'row',gap:8,paddingHorizontal:4}}>
          {REGIONS.map(r=>(
            <TouchableOpacity key={r} onPress={()=>setVal(r)}
              style={{borderWidth:1,borderRadius:20,paddingHorizontal:12,paddingVertical:6,
                      borderColor:val===r?'#f97316':T.border,backgroundColor:val===r?'#f9731618':T.card}}>
              <Text style={{fontSize:11,color:val===r?'#f97316':T.textSub,whiteSpace:'nowrap'}}>{r}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  )

  if (refNo) return (
    <SafeAreaView style={{flex:1,backgroundColor:T.bg}} edges={['top']}>
      <ScreenHeader title="Track Migration" sub="Citizen Movement Register"
        icon={<Navigation size={18} color="#f97316"/>} iconBg="#f9731618" onBack={()=>navigation.goBack()}/>
      <View style={{flex:1,alignItems:'center',justifyContent:'center',padding:24,gap:14}}>
        <View style={{width:80,height:80,borderRadius:40,backgroundColor:'#f9731618',alignItems:'center',justifyContent:'center'}}>
          <CC size={40} color="#f97316"/>
        </View>
        <Text style={{fontSize:20,fontWeight:'900',color:T.text}}>Migration Recorded!</Text>
        <View style={{width:'100%',borderRadius:12,borderWidth:1,borderColor:'#f9731650',backgroundColor:'#f9731610',padding:14}}>
          <Text style={{fontSize:11,color:T.textDim,marginBottom:4}}>REFERENCE NUMBER</Text>
          <View style={{flexDirection:'row',alignItems:'center'}}>
            <Text style={{fontSize:16,fontWeight:'900',color:'#f97316',flex:1}}>{refNo}</Text>
            <TouchableOpacity onPress={async()=>{await Clipboard.setStringAsync(refNo)}} style={{padding:4}}>
              <Copy size={15} color="#f97316"/>
            </TouchableOpacity>
          </View>
          <Text style={{fontSize:12,color:T.textSub,marginTop:8}}>
            {citizenData?.fullName??citizenNid} · {direction==='arriving'?'Arriving':'Departing'}
          </Text>
        </View>
        <TouchableOpacity style={{backgroundColor:'#f97316',borderRadius:12,paddingVertical:14,alignItems:'center',width:'100%'}}
          onPress={()=>navigation.goBack()}>
          <Text style={{color:'#fff',fontWeight:'800',fontSize:14}}>Back to Dashboard</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )

  return (
    <SafeAreaView style={{flex:1,backgroundColor:T.bg}} edges={['top']}>
      <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}>
        <ScreenHeader title="Track Migration" sub="Citizen Movement Register"
          icon={<Navigation size={18} color="#f97316"/>} iconBg="#f9731618" onBack={()=>navigation.goBack()}/>
        <ScrollView contentContainerStyle={{padding:20,paddingBottom:40}} keyboardShouldPersistTaps="handled">
          {/* Direction */}
          <Text style={{fontSize:16,fontWeight:'800',color:T.text,marginBottom:12}}>Migration Direction</Text>
          <View style={{flexDirection:'row',gap:10,marginBottom:20}}>
            {([['arriving','📥','Arriving to Village','Citizen is moving IN'],[
               'departing','📤','Departing from Village','Citizen is moving OUT']] as const).map(([dir,emoji,lbl,sub])=>(
              <TouchableOpacity key={dir} onPress={()=>setDirection(dir as any)}
                style={{flex:1,alignItems:'center',paddingVertical:14,borderRadius:12,borderWidth:1.5,
                        borderColor:direction===dir?'#f97316':T.border,backgroundColor:direction===dir?'#f9731618':T.card2}}>
                <Text style={{fontSize:24}}>{emoji}</Text>
                <Text style={{fontSize:12,fontWeight:'700',color:direction===dir?'#f97316':T.text,marginTop:4}}>{lbl}</Text>
                <Text style={{fontSize:10,color:T.textDim,marginTop:2,textAlign:'center'}}>{sub}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Citizen search */}
          <Text style={{fontSize:14,fontWeight:'800',color:T.text,marginBottom:12}}>Citizen Details</Text>
          <View style={{flexDirection:'row',gap:8,marginBottom:8}}>
            <TextInput style={{flex:1,borderWidth:1,borderRadius:10,paddingHorizontal:14,paddingVertical:12,fontSize:14,backgroundColor:T.card2,borderColor:T.border,color:T.text}}
              value={citizenNid} onChangeText={setCitizenNid} placeholder="National ID or name"
              placeholderTextColor={T.textDim} returnKeyType="search" blurOnSubmit={false} onSubmitEditing={searchCitizen}/>
            <TouchableOpacity style={{backgroundColor:'#f97316',borderRadius:10,paddingHorizontal:14,alignItems:'center',justifyContent:'center',opacity:citizenNid.trim().length>=3?1:0.4}}
              onPress={searchCitizen} disabled={citizenNid.trim().length<3||searching}>
              {searching ? <ActivityIndicator color="#fff" size="small"/> : <Search size={16} color="#fff"/>}
            </TouchableOpacity>
          </View>
          {citizenData && (
            <View style={{borderWidth:1,borderRadius:10,borderColor:'#f9731640',backgroundColor:'#f9731610',padding:12,flexDirection:'row',gap:8,marginBottom:14}}>
              <User size={14} color="#f97316"/>
              <Text style={{fontSize:13,fontWeight:'700',color:T.text,flex:1}}>{citizenData.fullName??citizenData.firstName}</Text>
              <CC size={14} color={TZ.green}/>
            </View>
          )}

          {/* Origin */}
          <Text style={{fontSize:14,fontWeight:'800',color:T.text,marginBottom:12}}>Movement Details</Text>
          <RegionPicker label="Origin Region" val={fromRegion} setVal={setFromRegion}/>
          <SField label="Origin Village / Ward" value={fromVillage} onChange={setFromVillage}
            placeholder="Village or ward of origin" bg={T.card2} bc={T.border} tc={T.text} dc={T.textDim}/>
          <RegionPicker label="Destination Region" val={toRegion} setVal={setToRegion}/>
          <SField label="Destination Village / Ward" value={toVillage} onChange={setToVillage}
            placeholder="Village or ward of destination" bg={T.card2} bc={T.border} tc={T.text} dc={T.textDim}/>

          {/* Date */}
          <View style={{marginBottom:14}}>
            <Text style={{fontSize:12,fontWeight:'600',color:T.textSub,marginBottom:6}}>Date of Movement *</Text>
            <TouchableOpacity style={{borderWidth:1,borderRadius:10,paddingHorizontal:14,paddingVertical:12,backgroundColor:T.card2,borderColor:T.border,flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}
              onPress={()=>setShowCal(true)}>
              <Text style={{color:moveDate?T.text:T.textDim,fontSize:14}}>{moveDate||'Select date'}</Text>
              <Calendar size={16} color={T.textDim}/>
            </TouchableOpacity>
          </View>

          {/* Reason */}
          <View style={{marginBottom:14}}>
            <Text style={{fontSize:12,fontWeight:'600',color:T.textSub,marginBottom:8}}>Reason for Migration *</Text>
            <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>
              {REASONS.map(r=>(
                <TouchableOpacity key={r} onPress={()=>setReason(r)}
                  style={{borderWidth:1,borderRadius:20,paddingHorizontal:12,paddingVertical:6,
                          borderColor:reason===r?'#f97316':T.border,backgroundColor:reason===r?'#f9731618':T.card}}>
                  <Text style={{fontSize:11,color:reason===r?'#f97316':T.textSub}}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <SField label="Notes" value={notes} onChange={setNotes}
            placeholder="Additional information" multiline bg={T.card2} bc={T.border} tc={T.text} dc={T.textDim}/>

          <TouchableOpacity style={{backgroundColor:'#f97316',borderRadius:12,paddingVertical:14,alignItems:'center',opacity:submitting?0.7:1}}
            onPress={handleSubmit} disabled={submitting}>
            {submitting ? <ActivityIndicator color="#fff"/> : <Text style={{color:'#fff',fontWeight:'800',fontSize:14}}>Record Migration</Text>}
          </TouchableOpacity>
        </ScrollView>
        <CalPicker visible={showCal} title="Date of Movement" maxDate={new Date()}
          onSelect={d=>{setMoveDate(d);setShowCal(false)}} onClose={()=>setShowCal(false)}/>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}