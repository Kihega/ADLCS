/**
 * VillageRecordBirthScreen.tsx  v1.0
 * Records a birth at village level (simpler than hospital — no NID lookup required)
 */
import React, { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Modal, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ArrowLeft, Baby, Calendar, CheckCircle2, X } from 'lucide-react-native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useTheme, TZ } from '../../context/ThemeContext'
import { apiPost, isOnline } from '../../services/syncService'
import { saveBirth, generateBirthCertNo, generateNationalId } from '../../services/localDb'

type VS = { VillageHome:undefined; VillageRecordBirth:undefined }
type Props = { navigation: NativeStackNavigationProp<VS, 'VillageRecordBirth'> }
const H = { primary:'#0891b2', primaryL:'#22d3ee' }

export default function VillageRecordBirthScreen({ navigation }: Props) {
  const { theme:T } = useTheme()
  const [childFirst, setChildFirst] = useState('')
  const [childMid,   setChildMid]   = useState('')
  const [childSur,   setChildSur]   = useState('')
  const [gender,     setGender]     = useState<'MALE'|'FEMALE'|''>('')
  const [dob,        setDob]        = useState('')
  const [showCal,    setShowCal]    = useState(false)
  const [fatherName, setFatherName] = useState('')
  const [motherName, setMotherName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [certNo,     setCertNo]     = useState('')
  const [nid,        setNid]        = useState('')

  const curY = new Date().getFullYear()
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const [calYr, setCalYr] = useState(curY)
  const [calMo, setCalMo] = useState(1)
  const [calDy, setCalDy] = useState(1)

  const handleSubmit = async () => {
    if (!childFirst.trim()||!childSur.trim()||!gender||!dob) {
      Alert.alert('Incomplete','Fill in child name, gender and date of birth.')
      return
    }
    setSubmitting(true)
    try {
      const cert = generateBirthCertNo()
      const nin  = generateNationalId(dob)
      setCertNo(cert); setNid(nin)

      await saveBirth({
        certNo:cert, nationalId:nin,
        childFirstName:childFirst.trim(), childMiddleName:childMid.trim(),
        childSurname:childSur.trim(), gender, dateOfBirth:dob,
        fatherName:fatherName.trim(), fatherNid:'',
        motherName:motherName.trim(), motherNid:'',
        facilityName:'Village Registration', facilityDistrict:'', facilityRegion:'',
        officerName:'', rawJson:'{}',
      })

      if (isOnline()) {
        try {
          await apiPost('/village/birth', { childFirstName:childFirst.trim(), childMiddleName:childMid.trim(),
            childSurname:childSur.trim(), gender:gender.toLowerCase(), dateOfBirth:dob,
            fatherName:fatherName.trim(), motherName:motherName.trim(),
            birthCertNo:cert, nationalId:nin })
        } catch { /* queued locally */ }
      }
    } catch { Alert.alert('Error','Failed. Try again.') }
    setSubmitting(false)
  }

  const Field = ({ label, value, onChange, placeholder }: any) => (
    <View style={{ marginBottom:14 }}>
      <Text style={{ fontSize:12, fontWeight:'600', color:T.textSub, marginBottom:6 }}>{label}</Text>
      <TextInput style={[vb.input, { backgroundColor:T.card2, borderColor:T.border, color:T.text }]}
        value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={T.textDim} returnKeyType="next" blurOnSubmit={false}/>
    </View>
  )

  return (
    <SafeAreaView style={{ flex:1, backgroundColor:T.bg }} edges={['top']}>
      <KeyboardAvoidingView style={{ flex:1 }} behavior={Platform.OS==='ios'?'padding':undefined}>
        <View style={[vb.header, { backgroundColor:T.card, borderBottomColor:T.border }]}>
          <TouchableOpacity onPress={()=>navigation.goBack()} style={vb.backBtn}><ArrowLeft size={20} color={T.text}/></TouchableOpacity>
          <View style={{ flex:1, alignItems:'center' }}>
            <Text style={[vb.headerTitle, { color:T.text }]}>Record Birth</Text>
            <Text style={[vb.headerSub, { color:T.textSub }]}>Village Level Registration</Text>
          </View>
          <View style={[vb.backBtn, { backgroundColor:`${TZ.green}18` }]}><Baby size={18} color={TZ.green}/></View>
        </View>

        {!certNo ? (
          <ScrollView contentContainerStyle={vb.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={[vb.section, { color:T.text }]}>Child Details</Text>
            <Field label="First Name *" value={childFirst} onChange={setChildFirst} placeholder="e.g. Amani"/>
            <Field label="Middle Name"  value={childMid}   onChange={setChildMid}   placeholder="Optional"/>
            <Field label="Surname *"    value={childSur}   onChange={setChildSur}   placeholder="e.g. Makonde"/>
            <View style={{ marginBottom:14 }}>
              <Text style={{ fontSize:12, fontWeight:'600', color:T.textSub, marginBottom:8 }}>Gender *</Text>
              <View style={{ flexDirection:'row', gap:10 }}>
                {(['MALE','FEMALE'] as const).map(g=>(
                  <TouchableOpacity key={g} onPress={()=>setGender(g)} style={{ flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:8, borderRadius:10, borderWidth:1.5, paddingVertical:12, borderColor:gender===g?TZ.green:T.border, backgroundColor:gender===g?`${TZ.green}25`:T.card2 }}>
                    <Text style={{ fontSize:18 }}>{g==='MALE'?'👦':'👧'}</Text>
                    <Text style={{ fontSize:13, fontWeight:'600', color:gender===g?TZ.green:T.textSub }}>{g}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={{ marginBottom:14 }}>
              <Text style={{ fontSize:12, fontWeight:'600', color:T.textSub, marginBottom:6 }}>Date of Birth *</Text>
              <TouchableOpacity style={[vb.input, { backgroundColor:T.card2, borderColor:T.border, flexDirection:'row', alignItems:'center', justifyContent:'space-between' }]} onPress={()=>setShowCal(true)}>
                <Text style={{ color:dob?T.text:T.textDim, fontSize:14 }}>{dob||'Select date'}</Text>
                <Calendar size={16} color={T.textDim}/>
              </TouchableOpacity>
            </View>
            <Text style={[vb.section, { color:T.text, marginTop:8 }]}>Parent Details</Text>
            <Field label="Father's Full Name" value={fatherName} onChange={setFatherName} placeholder="Father's name"/>
            <Field label="Mother's Full Name" value={motherName} onChange={setMotherName} placeholder="Mother's name"/>
            <TouchableOpacity style={[vb.submitBtn, { opacity:submitting?0.7:1 }]} onPress={handleSubmit} disabled={submitting}>
              {submitting ? <ActivityIndicator color="#fff"/> : <Text style={vb.submitBtnTxt}>Register Birth</Text>}
            </TouchableOpacity>
          </ScrollView>
        ) : (
          <View style={{ flex:1, alignItems:'center', justifyContent:'center', padding:24, gap:14 }}>
            <View style={{ width:80, height:80, borderRadius:40, backgroundColor:`${TZ.green}18`, alignItems:'center', justifyContent:'center' }}>
              <CheckCircle2 size={40} color={TZ.green}/>
            </View>
            <Text style={{ fontSize:20, fontWeight:'900', color:T.text }}>Birth Recorded!</Text>
            <View style={{ width:'100%', borderRadius:12, borderWidth:1, borderColor:`${TZ.green}50`, backgroundColor:`${TZ.green}10`, padding:14 }}>
              <Text style={{ fontSize:11, color:T.textDim, marginBottom:4 }}>CERTIFICATE NUMBER</Text>
              <Text style={{ fontSize:16, fontWeight:'900', color:TZ.green }}>{certNo}</Text>
              <Text style={{ fontSize:11, color:T.textDim, marginTop:10, marginBottom:4 }}>NATIONAL ID (NIN)</Text>
              <Text style={{ fontSize:13, fontWeight:'800', color:H.primaryL }}>{nid}</Text>
            </View>
            <TouchableOpacity style={[vb.submitBtn, { width:'100%' }]} onPress={()=>navigation.goBack()}>
              <Text style={vb.submitBtnTxt}>Back to Dashboard</Text>
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>

      <Modal visible={showCal} transparent animationType="slide" onRequestClose={()=>setShowCal(false)}>
        <View style={{ flex:1, justifyContent:'flex-end', backgroundColor:'rgba(0,0,0,0.65)' }}>
          <View style={{ backgroundColor:T.card, borderTopLeftRadius:24, borderTopRightRadius:24, padding:20, paddingBottom:36 }}>
            <View style={{ flexDirection:'row', gap:6, height:180 }}>
              {/* Day */}
              <View style={{ flex:1 }}>
                <Text style={{ fontSize:10, color:T.textDim, textAlign:'center', marginBottom:4 }}>Day</Text>
                <ScrollView showsVerticalScrollIndicator={false}>
                  {Array.from({length:new Date(calYr,calMo,0).getDate()},(_,i)=>i+1).map(d=>(
                    <TouchableOpacity key={d} onPress={()=>setCalDy(d)} style={{ paddingVertical:9, alignItems:'center', borderRadius:8, marginVertical:2, backgroundColor:d===calDy?`${H.primary}30`:'transparent' }}>
                      <Text style={{ fontSize:13, color:d===calDy?H.primaryL:T.textSub, fontWeight:d===calDy?'800':'400' }}>{String(d).padStart(2,'0')}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
              {/* Month */}
              <View style={{ flex:2 }}>
                <Text style={{ fontSize:10, color:T.textDim, textAlign:'center', marginBottom:4 }}>Month</Text>
                <ScrollView showsVerticalScrollIndicator={false}>
                  {MONTHS.map((name,i)=>(
                    <TouchableOpacity key={name} onPress={()=>setCalMo(i+1)} style={{ paddingVertical:9, alignItems:'center', borderRadius:8, marginVertical:2, backgroundColor:i+1===calMo?`${H.primary}30`:'transparent' }}>
                      <Text style={{ fontSize:13, color:i+1===calMo?H.primaryL:T.textSub, fontWeight:i+1===calMo?'800':'400' }}>{name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
              {/* Year */}
              <View style={{ flex:1.5 }}>
                <Text style={{ fontSize:10, color:T.textDim, textAlign:'center', marginBottom:4 }}>Year</Text>
                <ScrollView showsVerticalScrollIndicator={false}>
                  {Array.from({length:120},(_,i)=>curY-i).map(y=>(
                    <TouchableOpacity key={y} onPress={()=>setCalYr(y)} style={{ paddingVertical:9, alignItems:'center', borderRadius:8, marginVertical:2, backgroundColor:y===calYr?`${H.primary}30`:'transparent' }}>
                      <Text style={{ fontSize:13, color:y===calYr?H.primaryL:T.textSub, fontWeight:y===calYr?'800':'400' }}>{y}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>
            <View style={{ flexDirection:'row', gap:10, marginTop:16 }}>
              <TouchableOpacity onPress={()=>setShowCal(false)} style={{ flex:1, borderWidth:1, borderColor:T.border, borderRadius:12, paddingVertical:13, alignItems:'center' }}>
                <Text style={{ color:T.textSub, fontWeight:'600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={()=>{setDob(`${String(calDy).padStart(2,'0')}/${String(calMo).padStart(2,'0')}/${calYr}`);setShowCal(false)}} style={{ flex:2, backgroundColor:H.primary, borderRadius:12, paddingVertical:13, alignItems:'center' }}>
                <Text style={{ color:'#fff', fontWeight:'800' }}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

const vb = StyleSheet.create({
  header:      { flexDirection:'row', alignItems:'center', paddingHorizontal:16, paddingVertical:12, borderBottomWidth:1 },
  backBtn:     { width:36, height:36, borderRadius:10, alignItems:'center', justifyContent:'center' },
  headerTitle: { fontSize:15, fontWeight:'800' },
  headerSub:   { fontSize:11, marginTop:2 },
  body:        { padding:20, paddingBottom:40 },
  section:     { fontSize:14, fontWeight:'800', marginBottom:12 },
  input:       { borderWidth:1, borderRadius:10, paddingHorizontal:14, paddingVertical:12, fontSize:14 },
  submitBtn:   { backgroundColor:TZ.green, borderRadius:12, paddingVertical:14, alignItems:'center', marginTop:8 },
  submitBtnTxt:{ color:'#fff', fontWeight:'800', fontSize:14 },
})
