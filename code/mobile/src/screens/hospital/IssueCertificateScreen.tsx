/**
 * IssueCertificateScreen.tsx — Certificate Issuance  v1.0
 * Hospital Officer · ADLCS Tanzania
 *
 * Looks up a birth or death registration by cert number / name,
 * generates a PDF certificate, and marks the record as issued.
 */

import React, { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native'
import AsyncStorage    from '@react-native-async-storage/async-storage'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  ArrowLeft, FileText, Search, CheckCircle,
  Baby, Cross, Download,
} from 'lucide-react-native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useTheme, TZ } from '../../context/ThemeContext'

type RootStack = { HospitalHome: undefined; IssueCertificate: undefined }
type Props = { navigation: NativeStackNavigationProp<RootStack, 'IssueCertificate'> }

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'https://adlcs-backend.onrender.com/api'

type CertType = 'birth' | 'death'

export default function IssueCertificateScreen({ navigation }: Props) {
  const { theme: T } = useTheme()

  const [certType,    setCertType]    = useState<CertType>('birth')
  const [query,       setQuery]       = useState('')
  const [searching,   setSearching]   = useState(false)
  const [record,      setRecord]      = useState<any>(null)
  const [issuing,     setIssuing]     = useState(false)
  const [issued,      setIssued]      = useState(false)
  const [pdfUrl,      setPdfUrl]      = useState<string | null>(null)

  const searchRecord = async () => {
    if (!query.trim()) { Alert.alert('Error', 'Enter a registration number or name.'); return }
    setSearching(true)
    setRecord(null)
    try {
      const token = await AsyncStorage.getItem('adlcs_access_token')
      const res = await fetch(
        `${API_BASE}/officer/certificate/lookup?type=${certType}&q=${encodeURIComponent(query.trim())}`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      const json = await res.json()
      if (json.success && json.data) setRecord(json.data)
      else Alert.alert('Not Found', 'No matching record found.')
    } catch { Alert.alert('Error', 'Network error — check connection.') }
    finally { setSearching(false) }
  }

  const issueCertificate = async () => {
    if (!record) return
    setIssuing(true)
    try {
      const token = await AsyncStorage.getItem('adlcs_access_token')
      const res = await fetch(`${API_BASE}/officer/certificate/issue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ type: certType, recordId: record.id }),
      })
      const json = await res.json()
      if (json.success) {
        setPdfUrl(json.data?.pdfUrl ?? null)
        setIssued(true)
      } else {
        Alert.alert('Error', json.message ?? 'Certificate generation failed.')
      }
    } catch { Alert.alert('Error', 'Network error.') }
    finally { setIssuing(false) }
  }

  const CERT_TYPES: { val: CertType; label: string; color: string; icon: React.ReactNode }[] = [
    { val: 'birth', label: 'Birth Certificate',  color: TZ.green,  icon: <Baby  size={14} color={TZ.green}  /> },
    { val: 'death', label: 'Death Certificate',  color: '#dc2626', icon: <Cross size={14} color="#dc2626" /> },
  ]

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

        <View style={[s.header, { backgroundColor: T.card, borderBottomColor: T.border }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
            <ArrowLeft size={20} color={T.text} />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={[s.headerTitle, { color: T.text }]}>Issue Certificate</Text>
          </View>
          <View style={[s.headerIcon, { backgroundColor: '#0891b218' }]}>
            <FileText size={18} color="#0891b2" />
          </View>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>

          {!issued ? (
            <>
              <Text style={[s.sectionTitle, { color: T.text }]}>Certificate Type</Text>
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
                {CERT_TYPES.map(ct => (
                  <TouchableOpacity key={ct.val} style={[s.typeCard, {
                    flex: 1, backgroundColor: certType === ct.val ? `${ct.color}18` : T.card,
                    borderColor: certType === ct.val ? ct.color : T.border,
                  }]} onPress={() => { setCertType(ct.val); setRecord(null) }}>
                    {ct.icon}
                    <Text style={{ fontSize: 12, fontWeight: '700', color: certType === ct.val ? ct.color : T.textSub, marginTop: 6 }}>{ct.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[s.sectionTitle, { color: T.text }]}>Search Registration</Text>
              <TextInput
                style={[s.input, { backgroundColor: T.card2, borderColor: T.border, color: T.text }]}
                value={query} onChangeText={setQuery}
                placeholder="Registration number or full name…"
                placeholderTextColor={T.textDim}
              />
              <TouchableOpacity style={[s.btn, { backgroundColor: '#0891b2', opacity: searching ? 0.7 : 1 }]}
                onPress={searchRecord} disabled={searching}>
                {searching
                  ? <ActivityIndicator color="#fff" />
                  : <><Search size={16} color="#fff" /><Text style={s.btnText}>Search</Text></>}
              </TouchableOpacity>

              {record && (
                <View style={[s.recordCard, { backgroundColor: T.card, borderColor: T.border }]}>
                  <Text style={[s.recordTitle, { color: T.text }]}>Record Found</Text>
                  <View style={s.recordRow}>
                    <Text style={[s.recordKey, { color: T.textSub }]}>Reg. No.</Text>
                    <Text style={[s.recordVal, { color: T.text }]}>{record.certNo ?? record.birthCertNo ?? record.deathCertNo ?? '—'}</Text>
                  </View>
                  <View style={s.recordRow}>
                    <Text style={[s.recordKey, { color: T.textSub }]}>Name</Text>
                    <Text style={[s.recordVal, { color: T.text }]}>
                      {record.childFirstName ? `${record.childFirstName} ${record.childSurname}` : '—'}
                    </Text>
                  </View>
                  <View style={s.recordRow}>
                    <Text style={[s.recordKey, { color: T.textSub }]}>Registered</Text>
                    <Text style={[s.recordVal, { color: T.text }]}>{record.registeredAt ? new Date(record.registeredAt).toLocaleDateString() : '—'}</Text>
                  </View>
                  <View style={[s.recordRow, { marginTop: 4 }]}>
                    <Text style={[s.recordKey, { color: T.textSub }]}>Status</Text>
                    <Text style={[s.recordVal, { color: record.certPdfUrl ? TZ.green : '#f97316' }]}>
                      {record.certPdfUrl ? 'Certificate already issued' : 'Pending issuance'}
                    </Text>
                  </View>

                  {!record.certPdfUrl && (
                    <TouchableOpacity style={[s.btn, { backgroundColor: TZ.green, marginTop: 14, opacity: issuing ? 0.7 : 1 }]}
                      onPress={issueCertificate} disabled={issuing}>
                      {issuing
                        ? <ActivityIndicator color="#fff" />
                        : <><FileText size={16} color="#fff" /><Text style={s.btnText}>Generate & Issue</Text></>}
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </>
          ) : (
            <View style={{ alignItems: 'center', paddingTop: 24 }}>
              <View style={[s.successIcon, { backgroundColor: `${TZ.green}18` }]}>
                <CheckCircle size={40} color={TZ.green} />
              </View>
              <Text style={[s.successTitle, { color: T.text }]}>Certificate Issued</Text>
              <Text style={[s.successSub, { color: T.textSub }]}>
                The certificate has been generated and linked to this registration.
              </Text>
              {pdfUrl && (
                <View style={[s.pdfBox, { backgroundColor: T.card, borderColor: T.border }]}>
                  <Download size={14} color={T.primary} />
                  <Text style={[s.pdfUrl, { color: T.primary }]} numberOfLines={2}>{pdfUrl}</Text>
                </View>
              )}
              <TouchableOpacity style={[s.btn, { backgroundColor: TZ.green, width: '100%', marginTop: 16 }]}
                onPress={() => { setIssued(false); setRecord(null); setQuery(''); setPdfUrl(null) }}>
                <Text style={s.btnText}>Issue Another</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.btn, { backgroundColor: T.card, borderWidth: 1, borderColor: T.border, width: '100%' }]}
                onPress={() => navigation.goBack()}>
                <Text style={[s.btnText, { color: T.text }]}>Back to Dashboard</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  header:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  backBtn:      { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle:  { fontSize: 15, fontWeight: '800' },
  headerIcon:   { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  body:         { padding: 20, paddingBottom: 40 },
  sectionTitle: { fontSize: 13, fontWeight: '800', marginBottom: 10 },
  typeCard:     { borderWidth: 1.5, borderRadius: 14, padding: 14, alignItems: 'center' },
  input:        { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, height: 46, fontSize: 14, marginBottom: 12 },
  btn:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, paddingVertical: 14 },
  btnText:      { color: '#fff', fontWeight: '800', fontSize: 14 },
  recordCard:   { borderWidth: 1, borderRadius: 14, padding: 16, marginTop: 16 },
  recordTitle:  { fontSize: 13, fontWeight: '800', marginBottom: 12 },
  recordRow:    { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  recordKey:    { fontSize: 12 },
  recordVal:    { fontSize: 12, fontWeight: '700' },
  successIcon:  { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  successTitle: { fontSize: 20, fontWeight: '900', marginBottom: 8 },
  successSub:   { fontSize: 12, textAlign: 'center', marginBottom: 16, lineHeight: 18 },
  pdfBox:       { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, padding: 12, width: '100%' },
  pdfUrl:       { flex: 1, fontSize: 11 },
})
