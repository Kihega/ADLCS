/**
 * ViewRecordsScreen.tsx — Record Browser  v1.0
 * Hospital Officer · ADLCS Tanzania
 *
 * Paginated list of births and deaths associated with this officer's facility.
 * Supports search by name / cert number and filter by type (birth/death/all).
 * Tapping a record shows a detail sheet.
 */

import React, { useState, useEffect, useCallback } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  FlatList, ActivityIndicator, RefreshControl, Modal,
  ScrollView,
} from 'react-native'
import AsyncStorage    from '@react-native-async-storage/async-storage'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  ArrowLeft, Search, Baby, Cross, FileText,
  ChevronRight, X, Calendar, User,
} from 'lucide-react-native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useTheme, TZ } from '../../context/ThemeContext'

type RootStack = { HospitalHome: undefined; ViewRecords: undefined }
type Props = { navigation: NativeStackNavigationProp<RootStack, 'ViewRecords'> }

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'https://adlcs-backend.onrender.com/api'

type FilterType = 'all' | 'birth' | 'death'

interface Record {
  id:         string
  type:       'birth' | 'death'
  certNo:     string
  name:       string
  date:       string
  ritaSynced: boolean
  certIssued: boolean
}

export default function ViewRecordsScreen({ navigation }: Props) {
  const { theme: T } = useTheme()

  const [filter,     setFilter]     = useState<FilterType>('all')
  const [query,      setQuery]      = useState('')
  const [records,    setRecords]    = useState<Record[]>([])
  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [page,       setPage]       = useState(1)
  const [total,      setTotal]      = useState(0)
  const [selected,   setSelected]   = useState<Record | null>(null)

  const fetchRecords = useCallback(async (pageNum = 1, fresh = false) => {
    try {
      const token = await AsyncStorage.getItem('adlcs_access_token')
      const params = new URLSearchParams({
        type: filter, page: String(pageNum), limit: '20',
        ...(query.trim() ? { q: query.trim() } : {}),
      })
      const res = await fetch(`${API_BASE}/officer/records?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const json = await res.json()
      if (json.success) {
        setRecords(prev => fresh || pageNum === 1 ? json.data : [...prev, ...json.data])
        setTotal(json.total ?? json.data.length)
        setPage(pageNum)
      }
    } catch { /* offline — keep stale data */ }
    finally { setLoading(false); setRefreshing(false) }
  }, [filter, query])

  useEffect(() => {
    setLoading(true)
    setRecords([])
    fetchRecords(1, true)
  }, [filter, query])

  const onRefresh = () => { setRefreshing(true); fetchRecords(1, true) }
  const loadMore  = () => { if (records.length < total) fetchRecords(page + 1) }

  const renderItem = ({ item }: { item: Record }) => (
    <TouchableOpacity
      style={[s.row, { backgroundColor: T.card, borderColor: T.border }]}
      onPress={() => setSelected(item)} activeOpacity={0.75}
    >
      <View style={[s.rowIcon, {
        backgroundColor: item.type === 'birth' ? `${TZ.green}18` : '#dc262618',
      }]}>
        {item.type === 'birth'
          ? <Baby  size={16} color={TZ.green}  />
          : <Cross size={16} color="#dc2626" />}
      </View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={[s.rowName, { color: T.text }]}>{item.name}</Text>
        <Text style={[s.rowCert, { color: T.textSub }]}>{item.certNo}</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
          <Text style={[s.rowTag, { backgroundColor: item.ritaSynced ? `${TZ.green}18` : '#f9731618',
            color: item.ritaSynced ? TZ.green : '#f97316' }]}>
            {item.ritaSynced ? 'RITA ✓' : 'Pending sync'}
          </Text>
          {item.certIssued && (
            <Text style={[s.rowTag, { backgroundColor: '#0891b218', color: '#0891b2' }]}>Cert issued</Text>
          )}
        </View>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Text style={[s.rowDate, { color: T.textDim }]}>{item.date}</Text>
        <ChevronRight size={13} color={T.textDim} />
      </View>
    </TouchableOpacity>
  )

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }} edges={['top']}>

      {/* Header */}
      <View style={[s.header, { backgroundColor: T.card, borderBottomColor: T.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <ArrowLeft size={20} color={T.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={[s.headerTitle, { color: T.text }]}>Records</Text>
          <Text style={[s.headerSub, { color: T.textSub }]}>{total} total</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {/* Search */}
      <View style={[s.searchBar, { backgroundColor: T.card, borderBottomColor: T.border }]}>
        <View style={[s.searchInput, { backgroundColor: T.card2, borderColor: T.border }]}>
          <Search size={14} color={T.textDim} />
          <TextInput style={{ flex: 1, color: T.text, marginLeft: 8, fontSize: 13 }}
            value={query} onChangeText={setQuery}
            placeholder="Search name or cert number…" placeholderTextColor={T.textDim} />
        </View>
      </View>

      {/* Filter tabs */}
      <View style={[s.filterBar, { backgroundColor: T.card, borderBottomColor: T.border }]}>
        {(['all', 'birth', 'death'] as FilterType[]).map(f => (
          <TouchableOpacity key={f} style={[s.filterTab, {
            borderBottomWidth: filter === f ? 2 : 0,
            borderBottomColor: filter === f ? T.primary : 'transparent',
          }]} onPress={() => setFilter(f)}>
            <Text style={[s.filterLabel, { color: filter === f ? T.primary : T.textSub }]}>
              {f === 'all' ? 'All' : f === 'birth' ? 'Births' : 'Deaths'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading
        ? <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="large" color={T.primary} />
          </View>
        : <FlatList
            data={records}
            renderItem={renderItem}
            keyExtractor={i => i.id}
            contentContainerStyle={{ padding: 12, paddingBottom: 40, gap: 8 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.primary} />}
            onEndReached={loadMore}
            onEndReachedThreshold={0.3}
            ListEmptyComponent={
              <View style={{ alignItems: 'center', paddingTop: 60 }}>
                <FileText size={32} color={T.textDim} />
                <Text style={{ color: T.textDim, marginTop: 12, fontSize: 13 }}>No records found</Text>
              </View>
            }
          />}

      {/* Detail Modal */}
      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalSheet, { backgroundColor: T.card }]}>
            <View style={s.modalHandle} />
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
              <Text style={[s.modalTitle, { color: T.text, flex: 1 }]}>Record Detail</Text>
              <TouchableOpacity onPress={() => setSelected(null)}>
                <X size={20} color={T.textSub} />
              </TouchableOpacity>
            </View>
            {selected && (
              <ScrollView showsVerticalScrollIndicator={false}>
                {[
                  { icon: <FileText size={14} color={T.primary} />, label: 'Certificate No.', value: selected.certNo },
                  { icon: <User     size={14} color={T.primary} />, label: 'Name',            value: selected.name },
                  { icon: <Calendar size={14} color={T.primary} />, label: 'Date',            value: selected.date },
                  { icon: (selected.type === 'birth' ? <Baby size={14} color={TZ.green} /> : <Cross size={14} color="#dc2626" />),
                    label: 'Type', value: selected.type.toUpperCase() },
                ].map(row => (
                  <View key={row.label} style={[s.detailRow, { borderBottomColor: T.border }]}>
                    {row.icon}
                    <Text style={[s.detailLabel, { color: T.textSub }]}>{row.label}</Text>
                    <Text style={[s.detailVal, { color: T.text }]}>{row.value}</Text>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  header:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  backBtn:      { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle:  { fontSize: 15, fontWeight: '800' },
  headerSub:    { fontSize: 11, marginTop: 2 },
  searchBar:    { paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: 1 },
  searchInput:  { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, height: 40 },
  filterBar:    { flexDirection: 'row', borderBottomWidth: 1 },
  filterTab:    { flex: 1, alignItems: 'center', paddingVertical: 10 },
  filterLabel:  { fontSize: 12, fontWeight: '700' },
  row:          { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, padding: 12 },
  rowIcon:      { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  rowName:      { fontSize: 13, fontWeight: '700' },
  rowCert:      { fontSize: 11, marginTop: 2 },
  rowTag:       { fontSize: 9, fontWeight: '700', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  rowDate:      { fontSize: 10 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalSheet:   { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, minHeight: 300 },
  modalHandle:  { width: 36, height: 4, borderRadius: 2, backgroundColor: '#ccc', alignSelf: 'center', marginBottom: 16 },
  modalTitle:   { fontSize: 16, fontWeight: '800' },
  detailRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1 },
  detailLabel:  { flex: 1, fontSize: 12 },
  detailVal:    { fontSize: 13, fontWeight: '700' },
})
