/**
 * PendingCasesScreen.tsx — Unsynced Records from Local DB  v2.0
 */

import React, { useState, useCallback } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect } from '@react-navigation/native'
import {
  ArrowLeft,
  Clock,
  Baby,
  Cross,
  FileText,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
} from 'lucide-react-native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'

import { useTheme, TZ } from '../../context/ThemeContext'

type RootStack = { HospitalHome: undefined; PendingCases: undefined; IssueCertificate: undefined }
type Props = { navigation: NativeStackNavigationProp<RootStack, 'PendingCases'> }

interface PendingRow {
  id: string
  type: 'birth' | 'death'
  certNo: string
  name: string
  date: string
  reasons: string[]
}

const REASON_LABELS: Record<string> = {
  no_certificate: 'Certificate PDF not generated',
  rita_unsynced: 'Not synced to Central Database',
}

export default function PendingCasesScreen({ navigation }: Props) {
  const { theme: T } = useTheme()
  const [rows, setRows] = useState<PendingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const json = await apiGet('/officer/records/pending')
      if (json.success && Array.isArray(json.data)) {
        const rows: PendingRow[] = json.data.map((r: any) => ({
          id: r.id,
          type: r.type as 'birth' | 'death',
          certNo: r.certNo ?? '—',
          name: r.name ?? 'Unknown',
          date: r.date ?? '—',
          reasons: Array.isArray(r.reasons) ? r.reasons : ['rita_unsynced'],
        }))
        setRows(rows)
      }
    } catch (e) {
      console.warn('[PendingCases]', e)
    }
    setLoading(false)
    setRefreshing(false)
  }, [])

  useFocusEffect(
    useCallback(() => {
      load()
    }, [load])
  )

  const renderItem = ({ item }: { item: PendingRow }) => {
    const color = item.type === 'birth' ? TZ.green : '#dc2626'
    return (
      <View style={[s.card, { backgroundColor: T.card, borderColor: T.border }]}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
          <View style={[s.icon, { backgroundColor: `${color}18` }]}>
            {item.type === 'birth' ? (
              <Baby size={16} color={color} />
            ) : (
              <Cross size={16} color={color} />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.name, { color: T.text }]}>{item.name}</Text>
            <Text style={[s.cert, { color: color }]}>{item.certNo}</Text>
            <Text style={[s.date, { color: T.textDim }]}>{item.date}</Text>
          </View>
          <ChevronRight size={13} color={T.textDim} />
        </View>
        <View style={{ marginTop: 10, gap: 5 }}>
          {item.reasons.map((r) => (
            <View
              key={r}
              style={[s.reasonRow, { backgroundColor: '#f9731610', borderColor: '#f9731630' }]}
            >
              <AlertTriangle size={11} color="#f97316" />
              <Text style={{ fontSize: 11, color: '#f97316', flex: 1 }}>
                {REASON_LABELS[r] ?? r}
              </Text>
            </View>
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          <TouchableOpacity
            style={[s.actionBtn, { backgroundColor: '#0891b218', borderColor: '#0891b260' }]}
            onPress={() => navigation.navigate('IssueCertificate')}
          >
            <FileText size={12} color="#0891b2" />
            <Text style={{ fontSize: 11, color: '#0891b2', fontWeight: '700' }}>
              Issue Certificate
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }} edges={['top']}>
      <View style={[s.header, { backgroundColor: T.card, borderBottomColor: T.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <ArrowLeft size={20} color={T.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={[s.headerTitle, { color: T.text }]}>Pending Cases</Text>
          <Text style={[s.headerSub, { color: T.textSub }]}>{rows.length} require attention</Text>
        </View>
        <View style={[s.backBtn, { backgroundColor: '#f9731618' }]}>
          <Clock size={18} color="#f97316" />
        </View>
      </View>
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={T.primary} />
        </View>
      ) : (
        <FlatList
          data={rows}
          renderItem={renderItem}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: 14, paddingBottom: 40, gap: 10 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true)
                load(true)
              }}
              tintColor={T.primary}
            />
          }
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingTop: 60, gap: 12 }}>
              <CheckCircle2 size={40} color={T.success} />
              <Text style={{ color: T.textSub, fontSize: 14, fontWeight: '700' }}>All clear!</Text>
              <Text style={{ color: T.textDim, fontSize: 12 }}>No pending cases at this time.</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 15, fontWeight: '800' },
  headerSub: { fontSize: 11, marginTop: 2 },
  card: { borderWidth: 1, borderRadius: 14, padding: 14 },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 13, fontWeight: '700' },
  cert: { fontSize: 11, marginTop: 2, fontWeight: '700' },
  date: { fontSize: 10, marginTop: 2 },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
})
