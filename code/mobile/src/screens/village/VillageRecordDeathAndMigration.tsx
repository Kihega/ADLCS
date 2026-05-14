/**
 * VillageRecordDeathScreen.tsx  v1.0
 */
import React, { useState, useRef } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  Alert, ActivityIndicator, StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native'
import { SafeAreaView }  from 'react-native-safe-area-context'
import { ArrowLeft, Cross, CheckCircle2 } from 'lucide-react-native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useTheme, TZ }  from '../../context/ThemeContext'
import { apiPost, isOnline } from '../../services/syncService'
import { saveDeath, generateDeathCertNo } from '../../services/localDb'

type VS = { VillageHome:undefined; VillageRecordDeath:undefined }
type Props = { navigation: NativeStackNavigationProp<VS,'VillageRecordDeath'> }

// StableField at module level — keyboard stays open
const SField = React.memo(function SField({ label, value, onChange, placeholder, multiline=false, bg, bc, tc, dc }: any) {
  return (
    <View style={{ marginBottom:14 }}>
      <Text style={{ fontSize:12, fontWeight:'600', color:dc, marginBottom:6 }}>{label}</Text>
      <TextInput style={[vd.input, { backgroundColor:bg, borderColor:bc, color:tc }, multiline&&{ height:80, paddingTop:12 }]}
        value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={dc}
        multiline={multiline} textAlignVertical={multiline?'top':'center'} returnKeyType="next" blurOnSubmit={false}/>
    </View>
  )
})

export default function VillageRecordDeathScreen({ navigation }: Props) {
  const { theme:T } = useTheme()
  const [name,       setName]      = useState('')
  const [nid,        setNid]       = useState('')
  const [cause,      setCause]     = useState('')
  const [dod,        setDod]       = useState('')
  const [informant,  setInformant] = useState('')
  const [category,   setCategory]  = useState<'infant'|'child'|'adult'|'maternal'>('adult')
  const [submitting, setSubmitting]= useState(false)
  const [certNo,     setCertNo]    = useState('')

  const CATS = [
    {val:'infant',label:'Infant (<1)'},{val:'child',label:'Child (1–17)'},
    {val:'adult',label:'Adult (18+)'},{val:'maternal',label:'Maternal'},
  ] as const

  const handleSubmit = async () => {
    if (!cause.trim()||!dod.trim()) {
      Alert.alert('Incomplete','Enter cause of death and date of death.')
      return
    }
    setSubmitting(true)
    try {
      const cert = generateDeathCertNo()
      setCertNo(cert)
      await saveDeath({
        certNo:cert, nationalId:nid.trim(), deceasedName:name.trim(),
        causeOfDeath:cause.trim(), dateOfDeath:dod.trim(),
        locationType:'home', category, informantName:informant.trim(),
        facilityName:'Village Registration', officerName:'', rawJson:'{}',
      })
      if (isOnline()) {
        try {
          await apiPost('/village/death', { deceasedName:name.trim(), nationalId:nid.trim(),
            causeOfDeath:cause.trim(), dateOfDeath:dod.trim(), category,
            informantName:informant.trim(), deathCertNo:cert })
        } catch { /* queued */ }
      }
    } catch { Alert.alert('Error','Failed. Try again.') }
    setSubmitting(false)
  }

  return (
    <SafeAreaView style={{ flex:1, backgroundColor:T.bg }} edges={['top']}>
      <KeyboardAvoidingView style={{ flex:1 }} behavior={Platform.OS==='ios'?'padding':undefined}>
        <View style={[vd.header, { backgroundColor:T.card, borderBottomColor:T.border }]}>
          <TouchableOpacity onPress={()=>navigation.goBack()} style={vd.backBtn}><ArrowLeft size={20} color={T.text}/></TouchableOpacity>
          <View style={{ flex:1, alignItems:'center' }}>
            <Text style={[vd.headerTitle, { color:T.text }]}>Record Death</Text>
            <Text style={[vd.headerSub, { color:T.textSub }]}>Village Level Registration</Text>
          </View>
          <View style={[vd.backBtn, { backgroundColor:'#dc262618' }]}><Cross size={18} color="#dc2626"/></View>
        </View>

        {!certNo ? (
          <ScrollView contentContainerStyle={vd.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={[vd.section, { color:T.text }]}>Deceased Details</Text>
            <SField label="Full Name of Deceased" value={name} onChange={setName} placeholder="Full name" bg={T.card2} bc={T.border} tc={T.text} dc={T.textDim}/>
            <SField label="National ID (if known)" value={nid} onChange={setNid} placeholder="YYYYMMDD-LLLLL-SSSSS-CC" bg={T.card2} bc={T.border} tc={T.text} dc={T.textDim}/>
            <SField label="Cause of Death *" value={cause} onChange={setCause} placeholder="e.g. Malaria, Accident…" multiline bg={T.card2} bc={T.border} tc={T.text} dc={T.textDim}/>
            <SField label="Date of Death * (DD/MM/YYYY)" value={dod} onChange={setDod} placeholder="e.g. 10/05/2026" bg={T.card2} bc={T.border} tc={T.text} dc={T.textDim}/>
            <View style={{ marginBottom:14 }}>
              <Text style={{ fontSize:12, fontWeight:'600', color:T.textSub, marginBottom:8 }}>Category *</Text>
              <View style={{ flexDirection:'row', flexWrap:'wrap', gap:8 }}>
                {CATS.map(c=>(
                  <TouchableOpacity key={c.val} onPress={()=>setCategory(c.val)}
                    style={{ borderWidth:1, borderRadius:20, paddingHorizontal:12, paddingVertical:6, borderColor:category===c.val?'#dc2626':T.border, backgroundColor:category===c.val?'#dc262618':T.card }}>
                    <Text style={{ fontSize:11, color:category===c.val?'#dc2626':T.textSub }}>{c.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <SField label="Informant Name *" value={informant} onChange={setInformant} placeholder="Name of reporting person" bg={T.card2} bc={T.border} tc={T.text} dc={T.textDim}/>
            <TouchableOpacity style={[vd.submitBtn, { opacity:submitting?0.7:1 }]} onPress={handleSubmit} disabled={submitting}>
              {submitting ? <ActivityIndicator color="#fff"/> : <Text style={vd.submitBtnTxt}>Submit Death Record</Text>}
            </TouchableOpacity>
          </ScrollView>
        ) : (
          <View style={{ flex:1, alignItems:'center', justifyContent:'center', padding:24, gap:14 }}>
            <View style={{ width:80, height:80, borderRadius:40, backgroundColor:'#dc262618', alignItems:'center', justifyContent:'center' }}>
              <CheckCircle2 size={40} color="#dc2626"/>
            </View>
            <Text style={{ fontSize:20, fontWeight:'900', color:T.text }}>Death Recorded</Text>
            <View style={{ width:'100%', borderRadius:12, borderWidth:1, borderColor:'#dc262650', backgroundColor:'#dc262610', padding:14 }}>
              <Text style={{ fontSize:11, color:T.textDim, marginBottom:4 }}>CERTIFICATE NUMBER</Text>
              <Text style={{ fontSize:16, fontWeight:'900', color:'#dc2626' }}>{certNo}</Text>
            </View>
            <TouchableOpacity style={[vd.submitBtn, { width:'100%' }]} onPress={()=>navigation.goBack()}>
              <Text style={vd.submitBtnTxt}>Back to Dashboard</Text>
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
const vd = StyleSheet.create({
  header:      { flexDirection:'row', alignItems:'center', paddingHorizontal:16, paddingVertical:12, borderBottomWidth:1 },
  backBtn:     { width:36, height:36, borderRadius:10, alignItems:'center', justifyContent:'center' },
  headerTitle: { fontSize:15, fontWeight:'800' },
  headerSub:   { fontSize:11, marginTop:2 },
  body:        { padding:20, paddingBottom:40 },
  section:     { fontSize:14, fontWeight:'800', marginBottom:12 },
  input:       { borderWidth:1, borderRadius:10, paddingHorizontal:14, paddingVertical:12, fontSize:14 },
  submitBtn:   { backgroundColor:'#dc2626', borderRadius:12, paddingVertical:14, alignItems:'center', marginTop:8 },
  submitBtnTxt:{ color:'#fff', fontWeight:'800', fontSize:14 },
})

/* ═══════════════════════════════════════════════════════════════════════════ */

/**
 * RecordMigrationScreen.tsx  v1.0
 * Records citizen migration (in or out of the village).
 */
import React2, { useState as useState2 } from 'react'
import {
  View as View2, Text as Text2, TextInput as TextInput2,
  TouchableOpacity as Tap2, ScrollView as SV2,
  Alert as Alert2, ActivityIndicator as AI2,
  StyleSheet as SS2, KeyboardAvoidingView as KAV2, Platform as Plat2,
} from 'react-native'
import { SafeAreaView as SAV2 } from 'react-native-safe-area-context'
import { ArrowLeft as AL2, Navigation, CheckCircle2 as CC2 } from 'lucide-react-native'
import type { NativeStackNavigationProp as NSNP2 } from '@react-navigation/native-stack'
import { useTheme as useTheme2, TZ as TZ2 } from '../../context/ThemeContext'
import { apiPost as apiPost2, isOnline as isOnline2 } from '../../services/syncService'

type VS2 = { VillageHome:undefined; RecordMigration:undefined }
type Props2 = { navigation: NSNP2<VS2,'RecordMigration'> }

const MField = React2.memo(function MField({ label, value, onChange, placeholder, bg, bc, tc, dc }: any) {
  return (
    <View2 style={{ marginBottom:14 }}>
      <Text2 style={{ fontSize:12, fontWeight:'600', color:dc, marginBottom:6 }}>{label}</Text2>
      <TextInput2 style={[rm.input, { backgroundColor:bg, borderColor:bc, color:tc }]}
        value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={dc}
        returnKeyType="next" blurOnSubmit={false}/>
    </View2>
  )
})

export function RecordMigrationScreen({ navigation }: Props2) {
  const { theme:T } = useTheme2()
  const [direction, setDirection] = useState2<'IN'|'OUT'>('IN')
  const [citizenName, setCitizenName] = useState2('')
  const [nationalId,  setNationalId]  = useState2('')
  const [fromVillage, setFromVillage] = useState2('')
  const [toVillage,   setToVillage]   = useState2('')
  const [reason,      setReason]      = useState2('')
  const [submitting,  setSubmitting]  = useState2(false)
  const [done,        setDone]        = useState2(false)
  const [refNo,       setRefNo]       = useState2('')

  const handleSubmit = async () => {
    if (!citizenName.trim()) { Alert2.alert('Incomplete','Enter citizen name.'); return }
    setSubmitting(true)
    try {
      const ref = `MIG-${Date.now().toString().slice(-8)}`
      setRefNo(ref)
      if (isOnline2()) {
        try {
          await apiPost2('/village/migration', {
            citizenName:citizenName.trim(), nationalId:nationalId.trim(),
            direction, fromVillage:fromVillage.trim(), toVillage:toVillage.trim(),
            reason:reason.trim(), referenceNo:ref,
          })
        } catch { /* offline queue */ }
      }
      setDone(true)
    } catch { Alert2.alert('Error','Failed. Try again.') }
    setSubmitting(false)
  }

  return (
    <SAV2 style={{ flex:1, backgroundColor:T.bg }} edges={['top']}>
      <KAV2 style={{ flex:1 }} behavior={Plat2.OS==='ios'?'padding':undefined}>
        <View2 style={[rm.header, { backgroundColor:T.card, borderBottomColor:T.border }]}>
          <Tap2 onPress={()=>navigation.goBack()} style={rm.backBtn}><AL2 size={20} color={T.text}/></Tap2>
          <View2 style={{ flex:1, alignItems:'center' }}>
            <Text2 style={[rm.headerTitle, { color:T.text }]}>Record Migration</Text2>
            <Text2 style={[rm.headerSub, { color:T.textSub }]}>Citizen Movement Register</Text2>
          </View2>
          <View2 style={[rm.backBtn, { backgroundColor:'#f9731618' }]}><Navigation size={18} color="#f97316"/></View2>
        </View2>

        {!done ? (
          <SV2 contentContainerStyle={rm.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text2 style={[rm.section, { color:T.text }]}>Migration Direction</Text2>
            <View2 style={{ flexDirection:'row', gap:10, marginBottom:16 }}>
              {(['IN','OUT'] as const).map(d=>(
                <Tap2 key={d} onPress={()=>setDirection(d)}
                  style={{ flex:1, alignItems:'center', paddingVertical:14, borderRadius:12, borderWidth:1.5,
                    borderColor:direction===d?'#f97316':T.border, backgroundColor:direction===d?'#f9731618':T.card2 }}>
                  <Text2 style={{ fontSize:22 }}>{d==='IN'?'📥':'📤'}</Text2>
                  <Text2 style={{ fontSize:13, fontWeight:'700', color:direction===d?'#f97316':T.textSub, marginTop:4 }}>
                    Migration {d==='IN'?'In':'Out'}
                  </Text2>
                </Tap2>
              ))}
            </View2>
            <Text2 style={[rm.section, { color:T.text }]}>Citizen Details</Text2>
            <MField label="Full Name *" value={citizenName} onChange={setCitizenName} placeholder="Citizen's full name" bg={T.card2} bc={T.border} tc={T.text} dc={T.textDim}/>
            <MField label="National ID" value={nationalId} onChange={setNationalId} placeholder="NIN (if available)" bg={T.card2} bc={T.border} tc={T.text} dc={T.textDim}/>
            <Text2 style={[rm.section, { color:T.text }]}>Movement Details</Text2>
            <MField label="From Village / Ward" value={fromVillage} onChange={setFromVillage} placeholder="Origin village" bg={T.card2} bc={T.border} tc={T.text} dc={T.textDim}/>
            <MField label="To Village / Ward" value={toVillage} onChange={setToVillage} placeholder="Destination village" bg={T.card2} bc={T.border} tc={T.text} dc={T.textDim}/>
            <MField label="Reason for Migration" value={reason} onChange={setReason} placeholder="e.g. Marriage, Employment, Family" bg={T.card2} bc={T.border} tc={T.text} dc={T.textDim}/>
            <Tap2 style={[rm.submitBtn, { opacity:submitting?0.7:1 }]} onPress={handleSubmit} disabled={submitting}>
              {submitting ? <AI2 color="#fff"/> : <Text2 style={rm.submitBtnTxt}>Record Migration</Text2>}
            </Tap2>
          </SV2>
        ) : (
          <View2 style={{ flex:1, alignItems:'center', justifyContent:'center', padding:24, gap:14 }}>
            <View2 style={{ width:80, height:80, borderRadius:40, backgroundColor:'#f9731618', alignItems:'center', justifyContent:'center' }}>
              <CC2 size={40} color="#f97316"/>
            </View2>
            <Text2 style={{ fontSize:20, fontWeight:'900', color:T.text }}>Migration Recorded</Text2>
            <View2 style={{ width:'100%', borderRadius:12, borderWidth:1, borderColor:'#f9731650', backgroundColor:'#f9731610', padding:14 }}>
              <Text2 style={{ fontSize:11, color:T.textDim, marginBottom:4 }}>REFERENCE NUMBER</Text2>
              <Text2 style={{ fontSize:16, fontWeight:'900', color:'#f97316' }}>{refNo}</Text2>
              <Text2 style={{ fontSize:11, color:T.textDim, marginTop:8 }}>Citizen: {citizenName} · Direction: {direction}</Text2>
            </View2>
            <Tap2 style={[rm.submitBtn, { width:'100%' }]} onPress={()=>navigation.goBack()}>
              <Text2 style={rm.submitBtnTxt}>Back to Dashboard</Text2>
            </Tap2>
          </View2>
        )}
      </KAV2>
    </SAV2>
  )
}
const rm = SS2.create({
  header:      { flexDirection:'row', alignItems:'center', paddingHorizontal:16, paddingVertical:12, borderBottomWidth:1 },
  backBtn:     { width:36, height:36, borderRadius:10, alignItems:'center', justifyContent:'center' },
  headerTitle: { fontSize:15, fontWeight:'800' },
  headerSub:   { fontSize:11, marginTop:2 },
  body:        { padding:20, paddingBottom:40 },
  section:     { fontSize:14, fontWeight:'800', marginBottom:12 },
  input:       { borderWidth:1, borderRadius:10, paddingHorizontal:14, paddingVertical:12, fontSize:14 },
  submitBtn:   { backgroundColor:'#f97316', borderRadius:12, paddingVertical:14, alignItems:'center', marginTop:8 },
  submitBtnTxt:{ color:'#fff', fontWeight:'800', fontSize:14 },
})
