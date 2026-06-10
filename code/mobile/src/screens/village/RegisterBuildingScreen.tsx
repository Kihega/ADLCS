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

import { Home, CheckCircle2 as CC } from 'lucide-react-native'

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

type VStack = { VillageHome:undefined; RegisterBuilding:undefined }
type Props  = { navigation: NativeStackNavigationProp<VStack,'RegisterBuilding'> }

const BUILDING_TYPES = ['Residential','Commercial','Government','Educational','Religious','Healthcare','Industrial','Agricultural','Other']
const MATERIALS      = ['Permanent (Concrete/Brick)','Semi-permanent (Mixed)','Temporary (Wood/Thatch)','Prefabricated']
const CONDITIONS     = ['Good','Fair','Poor','Requires Repair']

export default function RegisterBuildingScreen({ navigation }: Props) {
  const { theme:T } = useTheme()
  const [name,        setName]        = useState('')
  const [buildType,   setBuildType]   = useState('')
  const [floors,      setFloors]      = useState('1')
  const [yearBuilt,   setYearBuilt]   = useState('')
  const [material,    setMaterial]    = useState('')
  const [condition,   setCondition]   = useState('')
  const [occupants,   setOccupants]   = useState('')
  const [ownerName,   setOwnerName]   = useState('')
  const [ownerNid,    setOwnerNid]    = useState('')
  const [notes,       setNotes]       = useState('')
  const [submitting,  setSubmitting]  = useState(false)
  const [refNo,       setRefNo]       = useState('')

  const handleSubmit = async () => {
    if (!name.trim()||!buildType) { Alert.alert('Required','Building name and type are required.'); return }
    setSubmitting(true)
    try {
      const ref = `BLDG-${Date.now().toString().slice(-8)}`; setRefNo(ref)
      if (isOnline()) {
        try {
          await apiPost('/village/building', {
            name:name.trim(), buildingType:buildType, floors:parseInt(floors)||1,
            yearBuilt:yearBuilt?parseInt(yearBuilt):undefined, material, condition,
            occupants:occupants?parseInt(occupants):undefined,
            ownerName:ownerName.trim(), ownerNid:ownerNid.trim(),
            notes:notes.trim(), referenceNo:ref,
          })
        } catch {}
      }
    } catch { Alert.alert('Error','Submission failed.') }
    setSubmitting(false)
  }

  if (refNo) return (
    <SafeAreaView style={{flex:1,backgroundColor:T.bg}} edges={['top']}>
      <ScreenHeader title="Register Building" sub="Village Infrastructure Register"
        icon={<Home size={18} color="#7c3aed"/>} iconBg="#7c3aed18" onBack={()=>navigation.goBack()}/>
      <View style={{flex:1,alignItems:'center',justifyContent:'center',padding:24,gap:14}}>
        <View style={{width:80,height:80,borderRadius:40,backgroundColor:'#7c3aed18',alignItems:'center',justifyContent:'center'}}>
          <CC size={40} color="#7c3aed"/>
        </View>
        <Text style={{fontSize:20,fontWeight:'900',color:T.text}}>Building Registered!</Text>
        <View style={{width:'100%',borderRadius:12,borderWidth:1,borderColor:'#7c3aed50',backgroundColor:'#7c3aed10',padding:14}}>
          <Text style={{fontSize:11,color:T.textDim,marginBottom:4}}>REFERENCE NUMBER</Text>
          <Text style={{fontSize:16,fontWeight:'900',color:'#7c3aed'}}>{refNo}</Text>
          <Text style={{fontSize:12,color:T.textSub,marginTop:8}}>{name} · {buildType}</Text>
        </View>
        <TouchableOpacity style={{backgroundColor:'#7c3aed',borderRadius:12,paddingVertical:14,alignItems:'center',width:'100%'}}
          onPress={()=>navigation.goBack()}>
          <Text style={{color:'#fff',fontWeight:'800',fontSize:14}}>Back to Dashboard</Text>
        </TouchableOpacity>
        <TouchableOpacity style={{borderWidth:1,borderColor:T.border,borderRadius:12,paddingVertical:14,alignItems:'center',width:'100%'}}
          onPress={()=>setRefNo('')}>
          <Text style={{color:T.textSub,fontWeight:'700',fontSize:14}}>Register Another</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )

  return (
    <SafeAreaView style={{flex:1,backgroundColor:T.bg}} edges={['top']}>
      <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}>
        <ScreenHeader title="Register Building" sub="Village Infrastructure Register"
          icon={<Home size={18} color="#7c3aed"/>} iconBg="#7c3aed18" onBack={()=>navigation.goBack()}/>
        <ScrollView contentContainerStyle={{padding:20,paddingBottom:40}} keyboardShouldPersistTaps="handled">
          <Text style={{fontSize:16,fontWeight:'800',color:T.text,marginBottom:16}}>Building Details</Text>
          <SField label="Building Name / Plot No." value={name} onChange={setName}
            placeholder="e.g. Shamba Plot 12B" required bg={T.card2} bc={T.border} tc={T.text} dc={T.textDim}/>

          <View style={{marginBottom:14}}>
            <Text style={{fontSize:12,fontWeight:'600',color:T.textSub,marginBottom:8}}>Building Type *</Text>
            <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>
              {BUILDING_TYPES.map(bt=>(
                <TouchableOpacity key={bt} onPress={()=>setBuildType(bt)}
                  style={{borderWidth:1,borderRadius:20,paddingHorizontal:12,paddingVertical:6,
                          borderColor:buildType===bt?'#7c3aed':T.border,backgroundColor:buildType===bt?'#7c3aed18':T.card}}>
                  <Text style={{fontSize:11,color:buildType===bt?'#7c3aed':T.textSub}}>{bt}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={{flexDirection:'row',gap:10,marginBottom:14}}>
            <View style={{flex:1}}>
              <Text style={{fontSize:12,fontWeight:'600',color:T.textSub,marginBottom:6}}>Number of Floors</Text>
              <TextInput style={{borderWidth:1,borderRadius:10,paddingHorizontal:14,paddingVertical:12,fontSize:14,backgroundColor:T.card2,borderColor:T.border,color:T.text}}
                value={floors} onChangeText={setFloors} keyboardType="numeric" placeholder="1" placeholderTextColor={T.textDim} returnKeyType="next" blurOnSubmit={false}/>
            </View>
            <View style={{flex:1}}>
              <Text style={{fontSize:12,fontWeight:'600',color:T.textSub,marginBottom:6}}>Year Built</Text>
              <TextInput style={{borderWidth:1,borderRadius:10,paddingHorizontal:14,paddingVertical:12,fontSize:14,backgroundColor:T.card2,borderColor:T.border,color:T.text}}
                value={yearBuilt} onChangeText={setYearBuilt} keyboardType="numeric" placeholder="e.g. 2015" placeholderTextColor={T.textDim} returnKeyType="next" blurOnSubmit={false}/>
            </View>
          </View>

          {[{label:'Construction Material', items:MATERIALS, val:material, setVal:setMaterial, color:'#7c3aed'},
            {label:'Condition',             items:CONDITIONS, val:condition, setVal:setCondition, color:'#0891b2'}].map(({label,items,val,setVal,color})=>(
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

          <SField label="Number of Occupants" value={occupants} onChange={setOccupants}
            placeholder="Estimated occupants" bg={T.card2} bc={T.border} tc={T.text} dc={T.textDim}/>
          <SField label="Owner Full Name" value={ownerName} onChange={setOwnerName}
            placeholder="Name of building owner" bg={T.card2} bc={T.border} tc={T.text} dc={T.textDim}/>
          <SField label="Owner National ID" value={ownerNid} onChange={setOwnerNid}
            placeholder="Owner NIN (optional)" bg={T.card2} bc={T.border} tc={T.text} dc={T.textDim}/>
          <SField label="Notes" value={notes} onChange={setNotes}
            placeholder="Any additional information" multiline bg={T.card2} bc={T.border} tc={T.text} dc={T.textDim}/>

          <TouchableOpacity style={{backgroundColor:'#7c3aed',borderRadius:12,paddingVertical:14,alignItems:'center',opacity:submitting?0.7:1}}
            onPress={handleSubmit} disabled={submitting}>
            {submitting ? <ActivityIndicator color="#fff"/> : <Text style={{color:'#fff',fontWeight:'800',fontSize:14}}>Register Building</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}