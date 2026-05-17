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

import { Landmark, CheckCircle2 as CC } from 'lucide-react-native'

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

type VStack = { VillageHome:undefined; RegisterInfrastructure:undefined }
type Props  = { navigation: NativeStackNavigationProp<VStack,'RegisterInfrastructure'> }

const INFRA_TYPES  = ['Road','Bridge','School','Primary School','Secondary School','Dispensary','Health Centre','Water Source','Borehole','Power Line','Market','Bus Stand','Mosque','Church','Other']
const STATUSES     = ['Operational','Under Construction','Damaged','Under Repair','Planned']
const CONDITIONS   = ['Excellent','Good','Fair','Poor','Critical']

export default function RegisterInfrastructureScreen({ navigation }: Props) {
  const { theme:T } = useTheme()
  const [name,      setName]      = useState('')
  const [infraType, setInfraType] = useState('')
  const [status,    setStatus]    = useState('Operational')
  const [condition, setCondition] = useState('')
  const [capacity,  setCapacity]  = useState('')
  const [yearBuilt, setYearBuilt] = useState('')
  const [manager,   setManager]   = useState('')
  const [notes,     setNotes]     = useState('')
  const [submitting,setSubmitting]= useState(false)
  const [refNo,     setRefNo]     = useState('')

  const handleSubmit = async () => {
    if (!name.trim()||!infraType) { Alert.alert('Required','Name and type are required.'); return }
    setSubmitting(true)
    try {
      const ref = `INFRA-${Date.now().toString().slice(-8)}`; setRefNo(ref)
      if (isOnline()) {
        try {
          await apiPost('/village/infrastructure', {
            name:name.trim(), infraType, status, condition,
            capacity:capacity?parseInt(capacity):undefined,
            yearBuilt:yearBuilt?parseInt(yearBuilt):undefined,
            manager:manager.trim(), notes:notes.trim(), referenceNo:ref,
          })
        } catch {}
      }
    } catch { Alert.alert('Error','Submission failed.') }
    setSubmitting(false)
  }

  if (refNo) return (
    <SafeAreaView style={{flex:1,backgroundColor:T.bg}} edges={['top']}>
      <ScreenHeader title="Register Infrastructure" sub="Village Public Infrastructure"
        icon={<Landmark size={18} color="#0e7490"/>} iconBg="#0e749018" onBack={()=>navigation.goBack()}/>
      <View style={{flex:1,alignItems:'center',justifyContent:'center',padding:24,gap:14}}>
        <View style={{width:80,height:80,borderRadius:40,backgroundColor:'#0e749018',alignItems:'center',justifyContent:'center'}}>
          <CC size={40} color="#0e7490"/>
        </View>
        <Text style={{fontSize:20,fontWeight:'900',color:T.text}}>Infrastructure Registered!</Text>
        <View style={{width:'100%',borderRadius:12,borderWidth:1,borderColor:'#0e749050',backgroundColor:'#0e749010',padding:14}}>
          <Text style={{fontSize:11,color:T.textDim,marginBottom:4}}>REFERENCE NUMBER</Text>
          <Text style={{fontSize:16,fontWeight:'900',color:'#0e7490'}}>{refNo}</Text>
          <Text style={{fontSize:12,color:T.textSub,marginTop:8}}>{name} · {infraType}</Text>
        </View>
        <TouchableOpacity style={{backgroundColor:'#0e7490',borderRadius:12,paddingVertical:14,alignItems:'center',width:'100%'}}
          onPress={()=>navigation.goBack()}>
          <Text style={{color:'#fff',fontWeight:'800',fontSize:14}}>Back to Dashboard</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )

  return (
    <SafeAreaView style={{flex:1,backgroundColor:T.bg}} edges={['top']}>
      <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}>
        <ScreenHeader title="Register Infrastructure" sub="Village Public Infrastructure"
          icon={<Landmark size={18} color="#0e7490"/>} iconBg="#0e749018" onBack={()=>navigation.goBack()}/>
        <ScrollView contentContainerStyle={{padding:20,paddingBottom:40}} keyboardShouldPersistTaps="handled">
          <Text style={{fontSize:16,fontWeight:'800',color:T.text,marginBottom:16}}>Infrastructure Details</Text>
          <SField label="Name / Description" value={name} onChange={setName}
            placeholder="e.g. Kijiji Primary School, Borehole B4" required bg={T.card2} bc={T.border} tc={T.text} dc={T.textDim}/>

          <View style={{marginBottom:14}}>
            <Text style={{fontSize:12,fontWeight:'600',color:T.textSub,marginBottom:8}}>Infrastructure Type *</Text>
            <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>
              {INFRA_TYPES.map(it=>(
                <TouchableOpacity key={it} onPress={()=>setInfraType(it)}
                  style={{borderWidth:1,borderRadius:20,paddingHorizontal:12,paddingVertical:6,
                          borderColor:infraType===it?'#0e7490':T.border,backgroundColor:infraType===it?'#0e749018':T.card}}>
                  <Text style={{fontSize:11,color:infraType===it?'#0e7490':T.textSub}}>{it}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {[{label:'Operational Status', items:STATUSES, val:status, setVal:setStatus, color:'#0e7490'},
            {label:'Current Condition', items:CONDITIONS, val:condition, setVal:setCondition, color:'#0891b2'}].map(({label,items,val,setVal,color})=>(
            <View key={label} style={{marginBottom:14}}>
              <Text style={{fontSize:12,fontWeight:'600',color:T.textSub,marginBottom:8}}>{label}</Text>
              <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>
                {items.map(it=>(
                  <TouchableOpacity key={it} onPress={()=>setVal(it)}
                    style={{borderWidth:1,borderRadius:20,paddingHorizontal:12,paddingVertical:6,
                            borderColor:val===it?color:T.border,backgroundColor:val===it?`${color}18`:T.card}}>
                    <Text style={{fontSize:11,color:val===it?color:T.textSub}}>{it}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ))}

          <View style={{flexDirection:'row',gap:10,marginBottom:14}}>
            <View style={{flex:1}}>
              <Text style={{fontSize:12,fontWeight:'600',color:T.textSub,marginBottom:6}}>Capacity (users)</Text>
              <TextInput style={{borderWidth:1,borderRadius:10,paddingHorizontal:14,paddingVertical:12,fontSize:14,backgroundColor:T.card2,borderColor:T.border,color:T.text}}
                value={capacity} onChangeText={setCapacity} keyboardType="numeric" placeholder="e.g. 500" placeholderTextColor={T.textDim} returnKeyType="next" blurOnSubmit={false}/>
            </View>
            <View style={{flex:1}}>
              <Text style={{fontSize:12,fontWeight:'600',color:T.textSub,marginBottom:6}}>Year Established</Text>
              <TextInput style={{borderWidth:1,borderRadius:10,paddingHorizontal:14,paddingVertical:12,fontSize:14,backgroundColor:T.card2,borderColor:T.border,color:T.text}}
                value={yearBuilt} onChangeText={setYearBuilt} keyboardType="numeric" placeholder="e.g. 2010" placeholderTextColor={T.textDim} returnKeyType="next" blurOnSubmit={false}/>
            </View>
          </View>

          <SField label="Manager / In Charge" value={manager} onChange={setManager}
            placeholder="Name of person responsible" bg={T.card2} bc={T.border} tc={T.text} dc={T.textDim}/>
          <SField label="Notes / Remarks" value={notes} onChange={setNotes}
            placeholder="Additional information, GPS description, access road..." multiline
            bg={T.card2} bc={T.border} tc={T.text} dc={T.textDim}/>

          <TouchableOpacity style={{backgroundColor:'#0e7490',borderRadius:12,paddingVertical:14,alignItems:'center',opacity:submitting?0.7:1}}
            onPress={handleSubmit} disabled={submitting}>
            {submitting ? <ActivityIndicator color="#fff"/> : <Text style={{color:'#fff',fontWeight:'800',fontSize:14}}>Register Infrastructure</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}