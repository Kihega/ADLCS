/**
 * PendingCasesScreen.tsx — Pending / Incomplete Registrations  v1.0
 * Hospital Officer · ADLCS Tanzania
 *
 * Lists births and deaths that are registered but have outstanding issues:
 *   • Missing certificate PDF
 *   • RITA sync not yet confirmed
 *   • Incomplete parent / informant details
 *
 * Officer can tap any record to complete or dismiss the pending action.
 */

import React, { useState, useEffect, useCallback } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  FlatList, ActivityIndicator, RefreshControl, Alert,
} from 'react-native'
import AsyncStorage    from '@react-native-async-storage/async-storage'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  ArrowLeft, Clock, Baby, Cross, FileText,
  ChevronRight, AlertTriangle, CheckCircle,
} from 'lucide-react-native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useTheme, TZ } from '../../context/ThemeContext'

type RootStack = {
  HospitalHome: undefined; PendingCases: undefined
  IssueCertificate: undefined
}
type Props = { navigation: NativeStackNavigationProp<RootStack, 'PendingCases'> }

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'https://adlcs-backend.onrender.com/api'

type PendingReason = 'no_certificate' | 'rita_unsynced' | 'incomplete_data'

interface PendingRecord {
  id:         string
  type:       'birth' | 'death'
  certNo:     string
  name:       string
  date:       string
  reasons:    PendingReason[]
}

const REASON_LABELS: Record<PendingReason, string> = {
  no_certificate: 'Certificate not issued',
  rita_unsynced:  'Not synced with RITA',
  incomplete_data: 'Incomplete record data',
}

export default function PendingCasesScreen({ navigation }: Props) {
  const { theme: T } = useTheme()
  const [records,    setRecords]    = useState<PendingRecord[]>([])
  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchPending = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const token = await AsyncStorage.getItem('adlcs_access_token')
      const res = await fetch(`${API_BASE}/officer/records/pending`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const json = await res.json()
      if (json.success) setRecords(json.data)
    } catch { /* offline */ }
    finally { setLoading(false); setRefreshing(false) }
  }, [])

  useEffect(() => { fetchPending() }, [fetchPending])

  const dismiss = (id: string) => {
    Alert.alert('Dismiss', 'Mark this case as resolved?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Yes', onPress: () => setRecords(prev => prev.filter(r => r.id !== id)) },
    ])
  }

  const renderItem = ({ item }: { item: PendingRecord }) => (
    <View style={[s.card, { backgroundColor: T.card, borderColor: T.border }]}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <View style={[s.cardIcon, {
          backgroundColor: item.type === 'birth' ? `${TZ.green}18` : '#dc262618',
        }]}>
          {item.type === 'birth'
            ? <Baby  size={16} color={TZ.green}  />
            : <Cross size={16} color="#dc2626" />}
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={[s.cardName, { color: T.text }]}>{item.name}</Text>
          <Text style={[s.cardCert, { color: T.textSub }]}>{item.certNo}</Text>
          <Text style={[s.cardDate, { color: T.textDim }]}>{item.date}</Text>
        </View>
        <TouchableOpacity onPress={() => dismiss(item.id)} style={s.dismissBtn}>
          <CheckCircle size={16} color={T.textDim} />
        </TouchableOpacity>
      </View>

      {/* Pending reasons */}
      <View style={{ marginTop: 10, gap: 6 }}>
        {item.reasons.map(r => (
          <View key={r} style={[s.reasonRow, { backgroundColor: '#f9731610', borderColor: '#f9731630' }]}>
            <AlertTriangle size={11} color="#f97316" />
            <Text style={{ fontSize: 11, color: '#f97316', flex: 1 }}>{REASON_LABELS[r]}</Text>
          </View>
        ))}
      </View>

      {/* Actions */}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
        {item.reasons.includes('no_certificate') && (
          <TouchableOpacity
            style={[s.actionBtn, { backgroundColor: '#0891b218', borderColor: '#0891b260' }]}
            onPress={() => navigation.navigate('IssueCertificate')}
          >
            <FileText size={12} color="#0891b2" />
            <Text style={{ fontSize: 11, color: '#0891b2', fontWeight: '700' }}>Issue Cert</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[s.actionBtn, { backgroundColor: T.card2, borderColor: T.border }]}
          onPress={() => Alert.alert('Detail', 'Full record view — coming in next sprint.')}
        >
          <ChevronRight size={12} color={T.textSub} />
          <Text style={{ fontSize: 11, color: T.textSub, fontWeight: '700' }}>View Record</Text>
        </TouchableOpacity>
      </View>
    </View>
  )

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }} edges={['top']}>
      <View style={[s.header, { backgroundColor: T.card, borderBottomColor: T.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <ArrowLeft size={20} color={T.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={[s.headerTitle, { color: T.text }]}>Pending Cases</Text>
          <Text style={[s.headerSub,   { color: T.textSub }]}>{records.length} require attention</Text>
        </View>
        <View style={[s.headerIcon, { backgroundColor: '#f9731618' }]}>
          <Clock size={18} color="#f97316" />
        </View>
      </View>

      {loading
        ? <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="large" color={T.primary} />
          </View>
        : <FlatList
            data={records}
            renderItem={renderItem}
            keyExtractor={i => i.id}
            contentContainerStyle={{ padding: 14, paddingBottom: 40, gap: 10 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchPending(true) }} tintColor={T.primary} />}
            ListEmptyComponent={
              <View style={{ alignItems: 'center', paddingTop: 60 }}>
                <CheckCircle size={40} color={T.success} />
                <Text style={{ color: T.textSub, marginTop: 12, fontSize: 14, fontWeight: '700' }}>All clear!</Text>
                <Text style={{ color: T.textDim, marginTop: 6, fontSize: 12 }}>No pending cases at this time.</Text>
              </View>
            }
          />}
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  header:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  backBtn:     { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 15, fontWeight: '800' },
  headerSub:   { fontSize: 11, marginTop: 2 },
  headerIcon:  { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  card:        { borderWidth: 1, borderRadius: 14, padding: 14 },
  cardIcon:    { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  cardName:    { fontSize: 13, fontWeight: '700' },
  cardCert:    { fontSize: 11, marginTop: 2 },
  cardDate:    { fontSize: 10, marginTop: 2 },
  dismissBtn:  { padding: 4 },
  reasonRow:   { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  actionBtn:   { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
})
