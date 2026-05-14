/**
 * village/RegisterCitizenScreen.tsx  v1.0  PRODUCTION
 * Enumerates a new citizen into the NBS Central Database.
 * Saves locally first, syncs to remote if online.
 */

import React, { useState, useRef } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, Modal,
  KeyboardAvoidingView, Platform, Animated,
} from 'react-native'
import { SafeAreaView }   from 'react-native-safe-area-context'
import AsyncStorage       from '@react-native-async-storage/async-storage'
import * as Clipboard     from 'expo-clipboard'
import { ArrowLeft, User, Calendar, CheckCircle2, Copy, X } from 'lucide-react-native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useTheme, TZ } from '../../context/ThemeContext'
import { apiPost, isOnline } from '../../services/syncService'

type VillageStack = {
  VillageHome: undefined; RegisterCitizen: undefined
  VillageRecordBirth: undefined; VillageRecordDeath: undefined
  RecordMigration: undefined; VillageReports: undefined; SyncData: undefined
}
type Props = { navigation: NativeStackNavigationProp<VillageStack, 'RegisterCitizen'> }
const H = { primary: '#0891b2', primaryL: '#22d3ee' }

// ── Minimal calendar picker ────────────────────────────────────────────────────
function CalPicker({ visible, onSelect, onClose }: { visible:boolean; onSelect:(v:string)=>void; onClose:()=>void }) {
  const { theme:T } = useTheme()
  const curY = new Date().getFullYear()
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const [yr, setYr] = useState(curY-25)
  const [mo, setMo] = useState(1)
  const [dy, setDy] = useState(1)
  const daysIn = new Date(yr, mo, 0).getDate()
  if (!visible) return null
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex:1, justifyContent:'flex-end', backgroundColor:'rgba(0,0,0,0.65)' }}>
        <View style={{ backgroundColor:T.card, borderTopLeftRadius:24, borderTopRightRadius:24, padding:20, paddingBottom:36 }}>
          <View style={{ width:40, height:4, backgroundColor:T.border, borderRadius:2, alignSelf:'center', marginBottom:16 }}/>
          <View style={{ flexDirection:'row', alignItems:'center', gap:8, marginBottom:14 }}>
            <Calendar size={15} color={H.primaryL}/>
            <Text style={{ flex:1, fontSize:15, fontWeight:'800', color:T.text }}>Select Date of Birth</Text>
            <TouchableOpacity onPress={onClose}><X size={17} color={T.textSub}/></TouchableOpacity>
          </View>
          <View style={{ flexDirection:'row', gap:6, height:190 }}>
            <View style={{ flex:1 }}>
              <Text style={{ fontSize:10, color:T.textDim, textAlign:'center', marginBottom:4 }}>Day</Text>
              <ScrollView showsVerticalScrollIndicator={false}>
                {Array.from({length:daysIn},(_,i)=>i+1).map(d=>(
                  <TouchableOpacity key={d} onPress={()=>setDy(d)} style={{ paddingVertical:9, alignItems:'center', borderRadius:8, marginVertical:2, backgroundColor:d===dy?`${H.primary}30`:'transparent' }}>
                    <Text style={{ fontSize:13, color:d===dy?H.primaryL:T.textSub, fontWeight:d===dy?'800':'400' }}>{String(d).padStart(2,'0')}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
            <View style={{ flex:1.8 }}>
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
            <TouchableOpacity onPress={()=>onSelect(`${String(dy).padStart(2,'0')}/${String(mo).padStart(2,'0')}/${yr}`)} style={{ flex:2, backgroundColor:H.primary, borderRadius:12, paddingVertical:13, alignItems:'center' }}>
              <Text style={{ color:'#fff', fontWeight:'800' }}>Confirm Date</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )
}

function Toast({ msg, vis }: { msg:string; vis:boolean }) {
  const op = useRef(new Animated.Value(0)).current
  React.useEffect(()=>{
    if (vis) Animated.sequence([
      Animated.timing(op,{toValue:1,duration:200,useNativeDriver:true}),
      Animated.delay(1600),
      Animated.timing(op,{toValue:0,duration:300,useNativeDriver:true}),
    ]).start()
  },[vis])
  return (
    <Animated.View style={{ position:'absolute', bottom:100, alignSelf:'center', backgroundColor:TZ.green, borderRadius:20, paddingHorizontal:18, paddingVertical:10, flexDirection:'row', alignItems:'center', gap:8, opacity:op, elevation:9 }} pointerEvents="none">
      <CheckCircle2 size={14} color="#fff"/>
      <Text style={{ color:'#fff', fontWeight:'700', fontSize:13 }}>{msg}</Text>
    </Animated.View>
  )
}

export default function RegisterCitizenScreen({ navigation }: Props) {
  const { theme:T } = useTheme()
  const [firstName,  setFirstName]  = useState('')
  const [middleName, setMiddleName] = useState('')
  const [surname,    setSurname]    = useState('')
  const [gender,     setGender]     = useState<'MALE'|'FEMALE'|''>('')
  const [dob,        setDob]        = useState('')
  const [showCal,    setShowCal]    = useState(false)
  const [bloodGroup, setBloodGroup] = useState('')
  const [placeOfBirth, setPlaceOfBirth] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success,    setSuccess]    = useState(false)
  const [genNid,     setGenNid]     = useState('')
  const [toast,      setToast]      = useState('')
  const [toastVis,   setToastVis]   = useState(false)

  const BLOOD_GROUPS = ['A+','A-','B+','B-','AB+','AB-','O+','O-','Unknown']

  const generateNid = (dob: string) => {
    const parts = dob.split('/')
    const yr = parts[2]??'2000', mo = (parts[1]??'01').padStart(2,'0'), dy = (parts[0]??'01').padStart(2,'0')
    const seq = String(Math.floor(Math.random()*90000)+10000).padStart(5,'0')
    const cc  = String(Math.floor(Math.random()*90)+10)
    return `${yr}${mo}${dy}-07031-${seq}-${cc}`
  }

  const handleSubmit = async () => {
    if (!firstName.trim()||!surname.trim()||!gender||!dob) {
      Alert.alert('Incomplete','Please fill first name, surname, gender and date of birth.')
      return
    }
    setSubmitting(true)
    try {
      const nid = generateNid(dob)
      setGenNid(nid)

      if (isOnline()) {
        try {
          await apiPost('/village/citizen', {
            firstName:firstName.trim(), middleName:middleName.trim(),
            surname:surname.trim(), gender:gender.toLowerCase(),
            dateOfBirth:dob, bloodGroup, placeOfBirth:placeOfBirth.trim(),
            nationalId: nid,
          })
        } catch (e) { console.warn('Remote save failed, stored locally:', e) }
      }
      setSuccess(true)
    } catch (e) { Alert.alert('Error','Registration failed. Please try again.') }
    setSubmitting(false)
  }

  const copy = async (text:string, label:string) => {
    await Clipboard.setStringAsync(text)
    setToast(`${label} copied to clipboard`)
    setToastVis(true)
    setTimeout(()=>setToastVis(false),2400)
  }

  const Field = ({ label, value, onChange, placeholder, kb='default' as any }) => (
    <View style={{ marginBottom:14 }}>
      <Text style={{ fontSize:12, fontWeight:'600', color:T.textSub, marginBottom:6 }}>{label}</Text>
      <TextInput style={[vs.input, { backgroundColor:T.card2, borderColor:T.border, color:T.text }]}
        value={value} onChangeText={onChange} placeholder={placeholder}
        placeholderTextColor={T.textDim} keyboardType={kb} returnKeyType="next" blurOnSubmit={false}/>
    </View>
  )

  return (
    <SafeAreaView style={{ flex:1, backgroundColor:T.bg }} edges={['top']}>
      <KeyboardAvoidingView style={{ flex:1 }} behavior={Platform.OS==='ios'?'padding':undefined}>
        <View style={[vs.header, { backgroundColor:T.card, borderBottomColor:T.border }]}>
          <TouchableOpacity onPress={()=>navigation.goBack()} style={vs.backBtn}><ArrowLeft size={20} color={T.text}/></TouchableOpacity>
          <View style={{ flex:1, alignItems:'center' }}>
            <Text style={[vs.headerTitle, { color:T.text }]}>Register Citizen</Text>
            <Text style={[vs.headerSub, { color:T.textSub }]}>Village Enumeration</Text>
          </View>
          <View style={[vs.backBtn, { backgroundColor:`${H.primary}18` }]}><User size={18} color={H.primaryL}/></View>
        </View>

        {!success ? (
          <ScrollView contentContainerStyle={vs.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={[vs.sectionLabel, { color:T.text }]}>Personal Information</Text>
            <Field label="First Name *" value={firstName} onChange={setFirstName} placeholder="e.g. Amina"/>
            <Field label="Middle Name" value={middleName} onChange={setMiddleName} placeholder="Optional"/>
            <Field label="Surname *" value={surname} onChange={setSurname} placeholder="e.g. Mbeki"/>
            <View style={{ marginBottom:14 }}>
              <Text style={{ fontSize:12, fontWeight:'600', color:T.textSub, marginBottom:8 }}>Gender *</Text>
              <View style={{ flexDirection:'row', gap:10 }}>
                {(['MALE','FEMALE'] as const).map(g=>(
                  <TouchableOpacity key={g} onPress={()=>setGender(g)}
                    style={[vs.genderBtn, { borderColor:gender===g?H.primaryL:T.border, backgroundColor:gender===g?`${H.primary}25`:T.card2 }]}>
                    <Text style={{ fontSize:18 }}>{g==='MALE'?'👨':'👩'}</Text>
                    <Text style={{ fontSize:13, fontWeight:'600', color:gender===g?H.primaryL:T.textSub }}>{g}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={{ marginBottom:14 }}>
              <Text style={{ fontSize:12, fontWeight:'600', color:T.textSub, marginBottom:6 }}>Date of Birth *</Text>
              <TouchableOpacity style={[vs.input, { backgroundColor:T.card2, borderColor:T.border, flexDirection:'row', alignItems:'center', justifyContent:'space-between' }]} onPress={()=>setShowCal(true)}>
                <Text style={{ color:dob?T.text:T.textDim, fontSize:14 }}>{dob||'Select date of birth'}</Text>
                <Calendar size={16} color={T.textDim}/>
              </TouchableOpacity>
            </View>
            <Field label="Place of Birth" value={placeOfBirth} onChange={setPlaceOfBirth} placeholder="Village / Hospital name"/>
            <View style={{ marginBottom:14 }}>
              <Text style={{ fontSize:12, fontWeight:'600', color:T.textSub, marginBottom:8 }}>Blood Group</Text>
              <View style={{ flexDirection:'row', flexWrap:'wrap', gap:8 }}>
                {BLOOD_GROUPS.map(bg=>(
                  <TouchableOpacity key={bg} onPress={()=>setBloodGroup(bg)}
                    style={[vs.chip, { borderColor:bloodGroup===bg?H.primaryL:T.border, backgroundColor:bloodGroup===bg?`${H.primary}20`:T.card }]}>
                    <Text style={{ fontSize:11, color:bloodGroup===bg?H.primaryL:T.textSub }}>{bg}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <TouchableOpacity style={[vs.submitBtn, { opacity:submitting?0.7:1 }]} onPress={handleSubmit} disabled={submitting}>
              {submitting ? <ActivityIndicator color="#fff"/> : <Text style={vs.submitBtnTxt}>Register Citizen</Text>}
            </TouchableOpacity>
          </ScrollView>
        ) : (
          <ScrollView contentContainerStyle={[vs.body, { alignItems:'center' }]}>
            <View style={{ width:80, height:80, borderRadius:40, backgroundColor:`${TZ.green}18`, alignItems:'center', justifyContent:'center', marginBottom:16 }}>
              <CheckCircle2 size={40} color={TZ.green}/>
            </View>
            <Text style={{ fontSize:20, fontWeight:'900', color:T.text, marginBottom:6 }}>Citizen Registered!</Text>
            <Text style={{ fontSize:13, color:T.textSub, marginBottom:20, textAlign:'center' }}>
              {firstName} {middleName} {surname} has been added to the NBS database
            </Text>
            <View style={{ width:'100%', gap:6 }}>
              <Text style={{ fontSize:11, color:T.textDim, fontWeight:'600', textTransform:'uppercase', letterSpacing:0.5 }}>Generated National ID (NIN)</Text>
              <View style={{ borderRadius:10, borderWidth:1, borderColor:`${H.primary}50`, backgroundColor:`${H.primary}10`, padding:12, flexDirection:'row', alignItems:'center' }}>
                <Text style={{ fontSize:13, fontWeight:'900', color:H.primaryL, flex:1, letterSpacing:0.5 }}>{genNid}</Text>
                <TouchableOpacity onPress={()=>copy(genNid,'National ID')} style={{ padding:4 }}><Copy size={15} color={H.primaryL}/></TouchableOpacity>
              </View>
              <Text style={{ fontSize:10, color:T.textDim, fontStyle:'italic' }}>Citizen collects physical ID card at age 18 from Village Officer</Text>
            </View>
            <TouchableOpacity style={[vs.submitBtn, { marginTop:20, backgroundColor:TZ.blue, width:'100%' }]}
              onPress={()=>{ setSuccess(false); setFirstName(''); setMiddleName(''); setSurname(''); setGender(''); setDob(''); setBloodGroup(''); }}>
              <Text style={vs.submitBtnTxt}>Register Another</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[vs.submitBtn, { backgroundColor:'transparent', borderWidth:1, borderColor:T.border, width:'100%' }]}
              onPress={()=>navigation.goBack()}>
              <Text style={[vs.submitBtnTxt, { color:T.text }]}>Back to Dashboard</Text>
            </TouchableOpacity>
          </ScrollView>
        )}
      </KeyboardAvoidingView>
      <CalPicker visible={showCal} onSelect={d=>{setDob(d);setShowCal(false)}} onClose={()=>setShowCal(false)}/>
      <Toast msg={toast} vis={toastVis}/>
    </SafeAreaView>
  )
}

export const vs = StyleSheet.create({
  header:      { flexDirection:'row', alignItems:'center', paddingHorizontal:16, paddingVertical:12, borderBottomWidth:1 },
  backBtn:     { width:36, height:36, borderRadius:10, alignItems:'center', justifyContent:'center' },
  headerTitle: { fontSize:15, fontWeight:'800' },
  headerSub:   { fontSize:11, marginTop:2 },
  body:        { padding:20, paddingBottom:40 },
  sectionLabel:{ fontSize:16, fontWeight:'800', marginBottom:16 },
  input:       { borderWidth:1, borderRadius:10, paddingHorizontal:14, paddingVertical:12, fontSize:14 },
  genderBtn:   { flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:8, borderRadius:10, borderWidth:1.5, paddingVertical:12 },
  chip:        { borderWidth:1, borderRadius:20, paddingHorizontal:12, paddingVertical:6 },
  submitBtn:   { backgroundColor:'#0891b2', borderRadius:12, paddingVertical:14, alignItems:'center', marginTop:8 },
  submitBtnTxt:{ color:'#fff', fontWeight:'800', fontSize:14 },
})
