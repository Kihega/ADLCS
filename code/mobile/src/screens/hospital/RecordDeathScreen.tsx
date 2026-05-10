/**
 * RecordDeathScreen.tsx — Death Recording  v1.0
 * Hospital Officer · ADLCS Tanzania
 *
 * Fields: deceased national ID lookup → cause of death → date of death
 *         → location type → informant details → submit to backend
 */

import React, { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native'
import AsyncStorage   from '@react-native-async-storage/async-storage'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ArrowLeft, Cross, Search, User, Calendar, AlertTriangle, CheckCircle } from 'lucide-react-native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useTheme, TZ } from '../../context/ThemeContext'

type RootStack = { HospitalHome: undefined; RecordDeath: undefined }
type Props = { navigation: NativeStackNavigationProp<RootStack, 'RecordDeath'> }

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'https://adlcs-backend.onrender.com/api'

type LocationType = 'health_facility' | 'home' | 'public_place' | 'other'
type DeathCategory = 'infant' | 'child' | 'adult' | 'maternal'

export default function RecordDeathScreen({ navigation }: Props) {
  const { theme: T } = useTheme()

  const [step,          setStep]          = useState<1 | 2 | 3>(1)
  const [lookupId,      setLookupId]      = useState('')
  const [lookupLoading, setLookupLoading] = useState(false)
  const [citizen,       setCitizen]       = useState<any>(null)
  const [cause,         setCause]         = useState('')
  const [dateOfDeath,   setDateOfDeath]   = useState('')
  const [locationType,  setLocationType]  = useState<LocationType>('health_facility')
  const [category,      setCategory]      = useState<DeathCategory>('adult')
  const [informant,     setInformant]     = useState('')
  const [submitting,    setSubmitting]    = useState(false)
  const [certNo,        setCertNo]        = useState('')

  const LOC_TYPES: { val: LocationType; label: string }[] = [
    { val: 'health_facility', label: 'Health Facility' },
    { val: 'home',            label: 'Home'            },
    { val: 'public_place',    label: 'Public Place'    },
    { val: 'other',           label: 'Other'           },
  ]
  const CATEGORIES: { val: DeathCategory; label: string }[] = [
    { val: 'infant', label: 'Infant (< 1 yr)' },
    { val: 'child',  label: 'Child (1–17)'    },
    { val: 'adult',  label: 'Adult (18+)'     },
    { val: 'maternal', label: 'Maternal'      },
  ]

  const lookupCitizen = async () => {
    if (lookupId.trim().length < 5) {
      Alert.alert('Error', 'Enter a valid National ID or name.')
      return
    }
    setLookupLoading(true)
    try {
      const token = await AsyncStorage.getItem('adlcs_access_token')
      const res = await fetch(
        `${API_BASE}/officer/citizen-lookup?q=${encodeURIComponent(lookupId.trim())}`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      const json = await res.json()
      if (json.success && json.data) {
        setCitizen(json.data)
        setStep(2)
      } else {
        Alert.alert('Not Found', 'No citizen found. Proceed with manual entry?', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Manual', onPress: () => { setCitizen({ fullName: lookupId }); setStep(2) } },
        ])
      }
    } catch {
      Alert.alert('Network Error', 'Could not reach server. Check connection.')
    } finally { setLookupLoading(false) }
  }

  const submit = async () => {
    if (!cause.trim() || !dateOfDeath.trim() || !informant.trim()) {
      Alert.alert('Incomplete', 'Please fill in all required fields.')
      return
    }
    setSubmitting(true)
    try {
      const token = await AsyncStorage.getItem('adlcs_access_token')
      const body: any = {
        causeOfDeath:  cause.trim(),
        dateOfDeath:   dateOfDeath.trim(),
        locationType,
        category,
        informantName: informant.trim(),
      }
      if (citizen?.id)         body.citizenId  = citizen.id
      if (citizen?.nationalId) body.nationalId  = citizen.nationalId
      if (!citizen?.id)        body.nationalId  = lookupId.trim()

      const res = await fetch(`${API_BASE}/officer/death`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (json.success) {
        setCertNo(json.data?.deathCertNo ?? 'TZ-DEATH-' + Date.now())
        setStep(3)
      } else {
        Alert.alert('Error', json.message ?? 'Submission failed.')
      }
    } catch {
      Alert.alert('Network Error', 'Could not reach server.')
    } finally { setSubmitting(false) }
  }

  const Field = ({ label, value, onChangeText, placeholder, keyboardType = 'default', multiline = false }: any) => (
    <View style={{ marginBottom: 14 }}>
      <Text style={[s.label, { color: T.textSub }]}>{label}</Text>
      <TextInput
        style={[s.input, { backgroundColor: T.card2, borderColor: T.border, color: T.text, height: multiline ? 80 : 46 }]}
        value={value} onChangeText={onChangeText} placeholder={placeholder}
        placeholderTextColor={T.textDim} keyboardType={keyboardType}
        multiline={multiline} textAlignVertical={multiline ? 'top' : 'center'}
      />
    </View>
  )

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

        {/* Header */}
        <View style={[s.header, { backgroundColor: T.card, borderBottomColor: T.border }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
            <ArrowLeft size={20} color={T.text} />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={[s.headerTitle, { color: T.text }]}>Record Death</Text>
            <Text style={[s.headerSub,   { color: T.textSub }]}>Step {step} of 3</Text>
          </View>
          <View style={[s.headerIcon, { backgroundColor: '#dc262618' }]}>
            <Cross size={18} color="#dc2626" />
          </View>
        </View>

        {/* Step indicator */}
        <View style={[s.stepBar, { backgroundColor: T.card, borderBottomColor: T.border }]}>
          {['Lookup', 'Details', 'Issued'].map((lbl, i) => (
            <View key={lbl} style={{ alignItems: 'center', flex: 1 }}>
              <View style={[s.stepDot, {
                backgroundColor: step > i + 1 ? T.success : step === i + 1 ? '#dc2626' : T.border,
              }]}>
                <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>{i + 1}</Text>
              </View>
              <Text style={[s.stepLabel, { color: step >= i + 1 ? T.text : T.textDim }]}>{lbl}</Text>
            </View>
          ))}
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>

          {/* ── STEP 1: Citizen lookup ─────────────────────────────────── */}
          {step === 1 && (
            <View>
              <Text style={[s.stepTitle, { color: T.text }]}>Search Deceased Citizen</Text>
              <Text style={[s.stepDesc,  { color: T.textSub }]}>
                Enter the National ID or full name to look up the citizen record.
              </Text>
              <Field label="National ID / Full Name" value={lookupId}
                onChangeText={setLookupId} placeholder="e.g. 19800101-12345-00001-5" />
              <TouchableOpacity
                style={[s.btn, { backgroundColor: '#dc2626', opacity: lookupLoading ? 0.7 : 1 }]}
                onPress={lookupCitizen} disabled={lookupLoading}
              >
                {lookupLoading
                  ? <ActivityIndicator color="#fff" />
                  : <><Search size={16} color="#fff" /><Text style={s.btnText}>Search Record</Text></>}
              </TouchableOpacity>
            </View>
          )}

          {/* ── STEP 2: Death details ──────────────────────────────────── */}
          {step === 2 && (
            <View>
              {citizen && (
                <View style={[s.citizenCard, { backgroundColor: T.card, borderColor: T.border }]}>
                  <User size={16} color={T.primary} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={[s.citizenName, { color: T.text }]}>{citizen.fullName ?? citizen.firstName + ' ' + citizen.surname}</Text>
                    {citizen.nationalId && <Text style={[s.citizenId, { color: T.textSub }]}>{citizen.nationalId}</Text>}
                  </View>
                </View>
              )}

              <Field label="Cause of Death *" value={cause} onChangeText={setCause}
                placeholder="e.g. Cardiac arrest" multiline />
              <Field label="Date of Death * (YYYY-MM-DD)" value={dateOfDeath}
                onChangeText={setDateOfDeath} placeholder="2026-05-10" />

              <Text style={[s.label, { color: T.textSub, marginBottom: 8 }]}>Location Type *</Text>
              <View style={s.chipRow}>
                {LOC_TYPES.map(l => (
                  <TouchableOpacity key={l.val}
                    style={[s.chip, { borderColor: locationType === l.val ? '#dc2626' : T.border,
                      backgroundColor: locationType === l.val ? '#dc262618' : T.card }]}
                    onPress={() => setLocationType(l.val)}
                  >
                    <Text style={{ fontSize: 11, color: locationType === l.val ? '#dc2626' : T.textSub }}>{l.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[s.label, { color: T.textSub, marginBottom: 8, marginTop: 12 }]}>Category *</Text>
              <View style={s.chipRow}>
                {CATEGORIES.map(c => (
                  <TouchableOpacity key={c.val}
                    style={[s.chip, { borderColor: category === c.val ? '#dc2626' : T.border,
                      backgroundColor: category === c.val ? '#dc262618' : T.card }]}
                    onPress={() => setCategory(c.val)}
                  >
                    <Text style={{ fontSize: 11, color: category === c.val ? '#dc2626' : T.textSub }}>{c.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={{ marginTop: 12 }}>
                <Field label="Informant Name *" value={informant} onChangeText={setInformant}
                  placeholder="Full name of reporting person" />
              </View>

              <TouchableOpacity
                style={[s.btn, { backgroundColor: '#dc2626', marginTop: 4, opacity: submitting ? 0.7 : 1 }]}
                onPress={submit} disabled={submitting}
              >
                {submitting
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={s.btnText}>Submit Death Record</Text>}
              </TouchableOpacity>
            </View>
          )}

          {/* ── STEP 3: Certificate issued ─────────────────────────────── */}
          {step === 3 && (
            <View style={{ alignItems: 'center', paddingTop: 24 }}>
              <View style={[s.successIcon, { backgroundColor: '#dc262618' }]}>
                <CheckCircle size={40} color="#dc2626" />
              </View>
              <Text style={[s.successTitle, { color: T.text }]}>Death Recorded</Text>
              <Text style={[s.successSub, { color: T.textSub }]}>Death certificate number:</Text>
              <View style={[s.certBox, { backgroundColor: T.card, borderColor: T.border }]}>
                <Text style={[s.certNo, { color: T.text }]}>{certNo}</Text>
              </View>
              <Text style={[s.successNote, { color: T.textDim }]}>
                Record has been submitted and will be synced with RITA on next connection.
              </Text>
              <TouchableOpacity style={[s.btn, { backgroundColor: '#dc2626', width: '100%' }]}
                onPress={() => navigation.goBack()}>
                <Text style={s.btnText}>Back to Dashboard</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  header:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  backBtn:     { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 15, fontWeight: '800' },
  headerSub:   { fontSize: 11, marginTop: 2 },
  headerIcon:  { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  stepBar:     { flexDirection: 'row', paddingVertical: 12, paddingHorizontal: 24, borderBottomWidth: 1 },
  stepDot:     { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  stepLabel:   { fontSize: 10, fontWeight: '600' },
  body:        { padding: 20, paddingBottom: 40 },
  stepTitle:   { fontSize: 16, fontWeight: '800', marginBottom: 6 },
  stepDesc:    { fontSize: 12, marginBottom: 18, lineHeight: 18 },
  label:       { fontSize: 12, fontWeight: '600', marginBottom: 6 },
  input:       { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14 },
  btn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, paddingVertical: 14, marginTop: 8 },
  btnText:     { color: '#fff', fontWeight: '800', fontSize: 14 },
  chipRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:        { borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  citizenCard: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 18 },
  citizenName: { fontSize: 14, fontWeight: '700' },
  citizenId:   { fontSize: 11, marginTop: 2 },
  successIcon: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  successTitle:{ fontSize: 20, fontWeight: '900', marginBottom: 6 },
  successSub:  { fontSize: 13, marginBottom: 12 },
  certBox:     { borderWidth: 2, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 24, marginBottom: 14 },
  certNo:      { fontSize: 18, fontWeight: '900', letterSpacing: 1 },
  successNote: { fontSize: 11, textAlign: 'center', marginBottom: 24, lineHeight: 17 },
})
