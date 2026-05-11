/**
 * RecordDeathScreen.tsx — Death Recording  v2.0
 * Hospital Officer · ADLCS Tanzania
 *
 * FIXES v2.0:
 *   • TextInput components extracted to module-level component (no re-mount on
 *     parent re-render → keyboard no longer dismisses on single-letter input)
 *   • Calendar date picker modal for Date of Death (no external package required)
 *   • All inputs use blurOnSubmit={false} and returnKeyType for smooth flow
 *   • Multi-line cause-of-death field is stable across re-renders
 */

import React, { useState, useRef, useCallback } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform, Modal,
} from 'react-native'
import AsyncStorage    from '@react-native-async-storage/async-storage'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  ArrowLeft, Cross, Search, User,
  Calendar, CheckCircle, X,
} from 'lucide-react-native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useTheme, TZ } from '../../context/ThemeContext'

type RootStack = { HospitalHome: undefined; RecordDeath: undefined }
type Props = { navigation: NativeStackNavigationProp<RootStack, 'RecordDeath'> }

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'https://adlcs-backend.onrender.com/api'

type LocationType  = 'health_facility' | 'home' | 'public_place' | 'other'
type DeathCategory = 'infant' | 'child' | 'adult' | 'maternal'

// ─── Calendar Picker (no external package) ────────────────────────────────────
interface CalPickerProps {
  visible: boolean; title: string; maxDate?: Date
  onSelect: (val: string) => void; onClose: () => void
}
function CalendarPicker({ visible, title, maxDate, onSelect, onClose }: CalPickerProps) {
  const now  = maxDate ?? new Date()
  const curY = now.getFullYear()
  const MONTHS = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December']
  const [yr,  setYr]  = useState(curY)
  const [mo,  setMo]  = useState(now.getMonth() + 1)
  const [day, setDay] = useState(now.getDate())
  const daysIn = new Date(yr, mo, 0).getDate()
  const days   = Array.from({ length: daysIn }, (_, i) => i + 1)
  const years  = Array.from({ length: 120 }, (_, i) => curY - i)

  if (!visible) return null
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={cp.overlay}>
        <View style={cp.sheet}>
          <View style={cp.handle} />
          <View style={cp.header}>
            <Calendar size={15} color="#22d3ee" />
            <Text style={cp.title}>{title}</Text>
            <TouchableOpacity onPress={onClose}><X size={17} color="#94a3b8" /></TouchableOpacity>
          </View>
          <View style={cp.row}>
            <View style={{ flex: 1 }}>
              <Text style={cp.colLabel}>Day</Text>
              <ScrollView style={cp.scroll} showsVerticalScrollIndicator={false}>
                {days.map(d => (
                  <TouchableOpacity key={d} style={[cp.cell, d === day && cp.activeCell]} onPress={() => setDay(d)}>
                    <Text style={[cp.cellTxt, d === day && cp.activeTxt]}>{String(d).padStart(2,'0')}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
            <View style={{ flex: 2 }}>
              <Text style={cp.colLabel}>Month</Text>
              <ScrollView style={cp.scroll} showsVerticalScrollIndicator={false}>
                {MONTHS.map((name, i) => (
                  <TouchableOpacity key={name} style={[cp.cell, i+1===mo && cp.activeCell]} onPress={() => setMo(i+1)}>
                    <Text style={[cp.cellTxt, i+1===mo && cp.activeTxt]}>{name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
            <View style={{ flex: 1.5 }}>
              <Text style={cp.colLabel}>Year</Text>
              <ScrollView style={cp.scroll} showsVerticalScrollIndicator={false}>
                {years.map(y => (
                  <TouchableOpacity key={y} style={[cp.cell, y===yr && cp.activeCell]} onPress={() => setYr(y)}>
                    <Text style={[cp.cellTxt, y===yr && cp.activeTxt]}>{y}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
          <View style={cp.btnRow}>
            <TouchableOpacity style={cp.cancelBtn} onPress={onClose}>
              <Text style={{ color: '#94a3b8', fontWeight: '600' }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={cp.confirmBtn} onPress={() => {
              onSelect(`${String(day).padStart(2,'0')}/${String(mo).padStart(2,'0')}/${yr}`)
            }}>
              <Text style={{ color: '#fff', fontWeight: '800' }}>Confirm Date</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )
}
const cp = StyleSheet.create({
  overlay:    { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.65)' },
  sheet:      { backgroundColor: '#0d1f38', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36 },
  handle:     { width: 40, height: 4, backgroundColor: '#1e3a5f', borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  header:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  title:      { flex: 1, fontSize: 15, fontWeight: '800', color: '#f8fafc' },
  row:        { flexDirection: 'row', gap: 6, height: 200 },
  colLabel:   { fontSize: 10, color: '#4b6080', fontWeight: '600', textAlign: 'center', marginBottom: 4 },
  scroll:     { flex: 1 },
  cell:       { paddingVertical: 9, alignItems: 'center', borderRadius: 8, marginVertical: 2 },
  activeCell: { backgroundColor: '#0891b230' },
  cellTxt:    { fontSize: 13, color: '#94a3b8' },
  activeTxt:  { color: '#22d3ee', fontWeight: '800' },
  btnRow:     { flexDirection: 'row', gap: 10, marginTop: 16 },
  cancelBtn:  { flex: 1, borderWidth: 1, borderColor: '#1e3a5f', borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  confirmBtn: { flex: 2, backgroundColor: '#0891b2', borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
})

// ─── Stable Field component (defined OUTSIDE Screen to prevent remount) ────────
interface FieldProps {
  label: string; value: string
  onChangeText: (v: string) => void
  placeholder?: string; multiline?: boolean
  returnKeyType?: 'next' | 'done' | 'search'
  onSubmitEditing?: () => void
  inputRef?: React.RefObject<TextInput>
  bgColor: string; borderColor: string; textColor: string; dimColor: string
}
const StableField = React.memo(({
  label, value, onChangeText, placeholder, multiline = false,
  returnKeyType = 'next', onSubmitEditing, inputRef,
  bgColor, borderColor, textColor, dimColor,
}: FieldProps) => (
  <View style={df.field}>
    <Text style={[df.label, { color: dimColor }]}>{label}</Text>
    <TextInput
      ref={inputRef}
      style={[df.input, { backgroundColor: bgColor, borderColor, color: textColor }, multiline && df.multiline]}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder ?? ''}
      placeholderTextColor={dimColor}
      multiline={multiline}
      textAlignVertical={multiline ? 'top' : 'center'}
      returnKeyType={returnKeyType}
      blurOnSubmit={false}
      onSubmitEditing={onSubmitEditing}
    />
  </View>
))
const df = StyleSheet.create({
  field:     { marginBottom: 14 },
  label:     { fontSize: 12, fontWeight: '600', marginBottom: 6 },
  input:     { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14 },
  multiline: { height: 90, paddingTop: 12 },
})

// ─── Screen ────────────────────────────────────────────────────────────────────
export default function RecordDeathScreen({ navigation }: Props) {
  const { theme: T } = useTheme()

  const [step,         setStep]         = useState<1 | 2 | 3>(1)
  const [lookupId,     setLookupId]     = useState('')
  const [lookupLoad,   setLookupLoad]   = useState(false)
  const [citizen,      setCitizen]      = useState<any>(null)
  const [cause,        setCause]        = useState('')
  const [dateOfDeath,  setDateOfDeath]  = useState('')
  const [showCal,      setShowCal]      = useState(false)
  const [locationType, setLocType]      = useState<LocationType>('health_facility')
  const [category,     setCategory]     = useState<DeathCategory>('adult')
  const [informant,    setInformant]    = useState('')
  const [submitting,   setSubmitting]   = useState(false)
  const [certNo,       setCertNo]       = useState('')

  // Stable refs for focus chain — keyboard will NOT dismiss between fields
  const lookupRef   = useRef<TextInput>(null)
  const causeRef    = useRef<TextInput>(null)
  const informantRef = useRef<TextInput>(null)

  const LOC_TYPES: { val: LocationType; label: string }[] = [
    { val: 'health_facility', label: 'Health Facility' },
    { val: 'home',            label: 'Home'            },
    { val: 'public_place',    label: 'Public Place'    },
    { val: 'other',           label: 'Other'           },
  ]
  const CATEGORIES: { val: DeathCategory; label: string }[] = [
    { val: 'infant',   label: 'Infant (< 1 yr)' },
    { val: 'child',    label: 'Child (1–17)'     },
    { val: 'adult',    label: 'Adult (18+)'      },
    { val: 'maternal', label: 'Maternal'         },
  ]

  const lookupCitizen = useCallback(async () => {
    if (lookupId.trim().length < 5) {
      Alert.alert('Error', 'Enter a valid National ID or name.')
      return
    }
    setLookupLoad(true)
    try {
      const token = await AsyncStorage.getItem('adlcs_access_token')
      const res = await fetch(
        `${API_BASE}/officer/citizen-lookup?q=${encodeURIComponent(lookupId.trim())}`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      const json = await res.json()
      if (json.success && json.data) {
        setCitizen(json.data); setStep(2)
      } else {
        Alert.alert('Not Found', 'No citizen found. Proceed with manual entry?', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Manual Entry', onPress: () => { setCitizen({ fullName: lookupId }); setStep(2) } },
        ])
      }
    } catch {
      Alert.alert('Network Error', 'Could not reach server. Check connection.')
    } finally { setLookupLoad(false) }
  }, [lookupId])

  const submit = useCallback(async () => {
    if (!cause.trim()) { Alert.alert('Incomplete', 'Enter the cause of death.'); return }
    if (!dateOfDeath.trim()) { Alert.alert('Incomplete', 'Select the date of death.'); return }
    if (!informant.trim()) { Alert.alert('Incomplete', 'Enter the informant name.'); return }
    setSubmitting(true)
    try {
      const token = await AsyncStorage.getItem('adlcs_access_token')
      const body: Record<string, unknown> = {
        causeOfDeath: cause.trim(), dateOfDeath: dateOfDeath.trim(),
        locationType, category, informantName: informant.trim(),
      }
      if (citizen?.id)         body.citizenId  = citizen.id
      if (citizen?.nationalId) body.nationalId = citizen.nationalId
      else                     body.nationalId = lookupId.trim()

      const res = await fetch(`${API_BASE}/officer/death`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (json.success) { setCertNo(json.data?.deathCertNo ?? `TZ-DEATH-${Date.now()}`); setStep(3) }
      else Alert.alert('Error', json.message ?? 'Submission failed.')
    } catch {
      Alert.alert('Network Error', 'Could not reach server.')
    } finally { setSubmitting(false) }
  }, [cause, dateOfDeath, informant, locationType, category, citizen, lookupId])

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

        {/* Step bar */}
        <View style={[s.stepBar, { backgroundColor: T.card, borderBottomColor: T.border }]}>
          {['Lookup', 'Details', 'Issued'].map((lbl, i) => (
            <View key={lbl} style={{ alignItems: 'center', flex: 1 }}>
              <View style={[s.stepDot, {
                backgroundColor: step > i+1 ? T.success : step === i+1 ? '#dc2626' : T.border,
              }]}>
                <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>{i+1}</Text>
              </View>
              <Text style={[s.stepLabel, { color: step >= i+1 ? T.text : T.textDim }]}>{lbl}</Text>
            </View>
          ))}
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={s.body}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"   // ← tapping chips/buttons won't dismiss keyboard
        >
          {/* ── STEP 1: Citizen lookup ──────────────────────────────────── */}
          {step === 1 && (
            <View>
              <Text style={[s.stepTitle, { color: T.text }]}>Search Deceased Citizen</Text>
              <Text style={[s.stepDesc,  { color: T.textSub }]}>
                Enter the National ID or full name to look up the citizen record.
              </Text>

              <View style={df.field}>
                <Text style={[df.label, { color: T.textSub }]}>National ID / Full Name *</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TextInput
                    ref={lookupRef}
                    style={[df.input, { flex: 1, backgroundColor: T.card2, borderColor: T.border, color: T.text }]}
                    value={lookupId}
                    onChangeText={setLookupId}
                    placeholder="National ID or full name"
                    placeholderTextColor={T.textDim}
                    returnKeyType="search"
                    blurOnSubmit={false}
                    onSubmitEditing={lookupCitizen}
                  />
                  <TouchableOpacity
                    style={[s.searchBtn, { opacity: lookupId.trim().length >= 5 ? 1 : 0.45 }]}
                    onPress={lookupCitizen}
                    disabled={lookupId.trim().length < 5 || lookupLoad}
                    activeOpacity={0.8}
                  >
                    {lookupLoad
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <><Search size={14} color="#fff" /><Text style={s.searchBtnText}>Search</Text></>}
                  </TouchableOpacity>
                </View>
              </View>

              {citizen && (
                <View style={[s.citizenCard, { backgroundColor: T.card, borderColor: T.border }]}>
                  <User size={15} color={T.primary} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={[s.citizenName, { color: T.text }]}>
                      {citizen.fullName ?? `${citizen.firstName ?? ''} ${citizen.surname ?? ''}`.trim()}
                    </Text>
                    {citizen.nationalId && <Text style={[s.citizenId, { color: T.textSub }]}>{citizen.nationalId}</Text>}
                  </View>
                </View>
              )}

              <TouchableOpacity
                style={[s.proceedBtn, { backgroundColor: '#dc2626', opacity: citizen ? 1 : 0.45 }]}
                onPress={() => setStep(2)}
                disabled={!citizen}
              >
                <Text style={s.proceedBtnText}>Proceed to Details</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── STEP 2: Death details ──────────────────────────────────── */}
          {step === 2 && (
            <View>
              {citizen && (
                <View style={[s.citizenCard, { backgroundColor: T.card, borderColor: T.border, marginBottom: 16 }]}>
                  <User size={15} color={T.primary} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={[s.citizenName, { color: T.text }]}>
                      {citizen.fullName ?? `${citizen.firstName ?? ''} ${citizen.surname ?? ''}`.trim()}
                    </Text>
                    {citizen.nationalId && <Text style={[s.citizenId, { color: T.textSub }]}>{citizen.nationalId}</Text>}
                  </View>
                </View>
              )}

              {/* Cause — stable component, keyboard persists between renders */}
              <StableField
                label="Cause of Death *"
                value={cause}
                onChangeText={setCause}
                placeholder="e.g. Cardiac arrest, Malaria complications"
                multiline
                returnKeyType="next"
                onSubmitEditing={() => informantRef.current?.focus()}
                inputRef={causeRef}
                bgColor={T.card2} borderColor={T.border}
                textColor={T.text} dimColor={T.textDim}
              />

              {/* Date of death — calendar trigger */}
              <View style={df.field}>
                <Text style={[df.label, { color: T.textSub }]}>Date of Death *</Text>
                <TouchableOpacity
                  style={[df.input, { backgroundColor: T.card2, borderColor: T.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
                  onPress={() => setShowCal(true)}
                  activeOpacity={0.8}
                >
                  <Text style={{ color: dateOfDeath ? T.text : T.textDim, fontSize: 14 }}>
                    {dateOfDeath || 'Select date of death'}
                  </Text>
                  <Calendar size={16} color={T.textDim} />
                </TouchableOpacity>
              </View>

              {/* Location type */}
              <View style={df.field}>
                <Text style={[df.label, { color: T.textSub }]}>Location Type *</Text>
                <View style={s.chipRow}>
                  {LOC_TYPES.map(l => (
                    <TouchableOpacity key={l.val}
                      style={[s.chip, {
                        borderColor: locationType === l.val ? '#dc2626' : T.border,
                        backgroundColor: locationType === l.val ? '#dc262618' : T.card,
                      }]}
                      onPress={() => setLocType(l.val)}
                    >
                      <Text style={{ fontSize: 11, color: locationType === l.val ? '#dc2626' : T.textSub }}>{l.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Category */}
              <View style={df.field}>
                <Text style={[df.label, { color: T.textSub }]}>Category *</Text>
                <View style={s.chipRow}>
                  {CATEGORIES.map(c => (
                    <TouchableOpacity key={c.val}
                      style={[s.chip, {
                        borderColor: category === c.val ? '#dc2626' : T.border,
                        backgroundColor: category === c.val ? '#dc262618' : T.card,
                      }]}
                      onPress={() => setCategory(c.val)}
                    >
                      <Text style={{ fontSize: 11, color: category === c.val ? '#dc2626' : T.textSub }}>{c.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Informant — stable component */}
              <StableField
                label="Informant Name *"
                value={informant}
                onChangeText={setInformant}
                placeholder="Full name of the reporting person"
                returnKeyType="done"
                onSubmitEditing={submit}
                inputRef={informantRef}
                bgColor={T.card2} borderColor={T.border}
                textColor={T.text} dimColor={T.textDim}
              />

              <TouchableOpacity
                style={[s.submitBtn, { opacity: submitting ? 0.7 : 1 }]}
                onPress={submit}
                disabled={submitting}
                activeOpacity={0.85}
              >
                {submitting
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={s.submitBtnText}>Submit Death Record</Text>}
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
                Record submitted successfully. It will be synchronised with the central database on next connection.
              </Text>
              <TouchableOpacity
                style={[s.submitBtn, { width: '100%' }]}
                onPress={() => navigation.goBack()}
              >
                <Text style={s.submitBtnText}>Back to Dashboard</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>

        {/* Calendar modal */}
        <CalendarPicker
          visible={showCal}
          title="Select Date of Death"
          maxDate={new Date()}
          onSelect={d => { setDateOfDeath(d); setShowCal(false) }}
          onClose={() => setShowCal(false)}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  header:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  backBtn:      { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle:  { fontSize: 15, fontWeight: '800' },
  headerSub:    { fontSize: 11, marginTop: 2 },
  headerIcon:   { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  stepBar:      { flexDirection: 'row', paddingVertical: 12, paddingHorizontal: 24, borderBottomWidth: 1 },
  stepDot:      { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  stepLabel:    { fontSize: 10, fontWeight: '600' },
  body:         { padding: 20, paddingBottom: 40 },
  stepTitle:    { fontSize: 16, fontWeight: '800', marginBottom: 6 },
  stepDesc:     { fontSize: 12, marginBottom: 18, lineHeight: 18 },
  searchBtn:    { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#dc2626', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12 },
  searchBtnText:{ color: '#fff', fontWeight: '700', fontSize: 13 },
  chipRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:         { borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  citizenCard:  { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 6 },
  citizenName:  { fontSize: 14, fontWeight: '700' },
  citizenId:    { fontSize: 11, marginTop: 2 },
  proceedBtn:   { borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 12 },
  proceedBtnText:{ color: '#fff', fontWeight: '800', fontSize: 14 },
  submitBtn:    { backgroundColor: '#dc2626', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  submitBtnText:{ color: '#fff', fontWeight: '800', fontSize: 14 },
  successIcon:  { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  successTitle: { fontSize: 20, fontWeight: '900', marginBottom: 6 },
  successSub:   { fontSize: 13, marginBottom: 12 },
  certBox:      { borderWidth: 2, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 24, marginBottom: 14 },
  certNo:       { fontSize: 18, fontWeight: '900', letterSpacing: 1 },
  successNote:  { fontSize: 11, textAlign: 'center', marginBottom: 24, lineHeight: 17 },
})
