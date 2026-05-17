/**
 * ViewRecordsScreen.tsx  v3.0  PRODUCTION
 *
 * Data strategy (hybrid):
 *   ONLINE  → fetch from remote API, display with sync badges
 *   OFFLINE → read from local SQLite, display with offline indicator
 *   MERGE   → local records not yet on server are shown alongside remote ones
 */

import React, { useState, useCallback } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  FlatList, ActivityIndicator, RefreshControl, Modal, ScrollView,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect } from '@react-navigation/native'
import {
  ArrowLeft, Search, Baby, Cross, FileText,
  ChevronRight, X, WifiOff, CheckCircle2, Clock,
} from 'lucide-react-native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'

import { getAllBirths, getAllDeaths } from '../../services/localDb'
import { fetchRemoteRecords, isOnline } from '../../services/syncService'
import { useTheme, TZ } from '../../context/ThemeContext'

type RootStack = { HospitalHome: undefined; ViewRecords: undefined }
type Props = { navigation: NativeStackNavigationProp<RootStack, 'ViewRecords'> }
type FilterType = 'all' | 'birth' | 'death'

interface DisplayRecord {
  id: string; type: 'birth'|'death'; certNo: string
  name: string; date: string; synced: boolean
  certIssued: boolean; source: 'local'|'remote'
}

export default function ViewRecordsScreen({ navigation }: Props) {
  const { theme: T } = useTheme()
  const [filter,     setFilter]    = useState<FilterType>('all')
  const [query,      setQuery]     = useState('')
  const [records,    setRecords]   = useState<DisplayRecord[]>([])
  const [loading,    setLoading]   = useState(true)
  const [refreshing, setRefreshing]= useState(false)
  const [offline,    setOffline]   = useState(false)
  const [selected,   setSelected]  = useState<DisplayRecord|null>(null)

  const loadRecords = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)

    const q = query.trim().toLowerCase()

    // 1. Always load from local SQLite
    const [localBirths, localDeaths] = await Promise.all([getAllBirths(), getAllDeaths()])
    const localRows: DisplayRecord[] = [
      ...localBirths.map(b => ({
        id:    `local-birth-${b.id}`, type: 'birth' as const,
        certNo: b.certNo,
        name:  [b.childFirstName, b.childMiddleName, b.childSurname].filter(Boolean).join(' ').toUpperCase(),
        date:  new Date(b.registeredAt).toLocaleDateString('en-TZ', { day:'2-digit', month:'short', year:'numeric' }),
        synced: b.synced === 1, certIssued: !!b.certPdfPath, source: 'local' as const,
      })),
      ...localDeaths.map(d => ({
        id:    `local-death-${d.id}`, type: 'death' as const,
        certNo: d.certNo,
        name:  d.deceasedName.toUpperCase() || d.nationalId || '—',
        date:  new Date(d.registeredAt).toLocaleDateString('en-TZ', { day:'2-digit', month:'short', year:'numeric' }),
        synced: d.synced === 1, certIssued: !!d.certPdfPath, source: 'local' as const,
      })),
    ]

    // 2. Try remote if online
    if (isOnline()) {
      setOffline(false)
      const remote = await fetchRemoteRecords(filter, 1, q)
      if (remote && remote.data.length > 0) {
        const remoteRows: DisplayRecord[] = remote.data.map((r: any) => ({
          id:    `remote-${r.id}`, type: r.type,
          certNo: r.certNo, name: r.name, date: r.date,
          synced: true, certIssued: r.certIssued, source: 'remote' as const,
        }))
        // Merge: remote first, then any local records NOT in remote (cert numbers differ)
        const remoteCerts = new Set(remoteRows.map(r => r.certNo))
        const localOnly   = localRows.filter(r => !remoteCerts.has(r.certNo))
        const merged      = [...remoteRows, ...localOnly]
        const filtered    = applyFilter(merged, filter, q)
        setRecords(filtered)
        setLoading(false); setRefreshing(false)
        return
      }
    } else {
      setOffline(true)
    }

    // 3. Offline fallback — use local only
    const filtered = applyFilter(localRows, filter, q)
    setRecords(filtered)
    setLoading(false); setRefreshing(false)
  }, [filter, query])

  useFocusEffect(useCallback(() => { loadRecords() }, [loadRecords]))

  function applyFilter(rows: DisplayRecord[], f: FilterType, q: string): DisplayRecord[] {
    return rows
      .filter(r => f === 'all' || r.type === f)
      .filter(r => !q || r.name.toLowerCase().includes(q) || r.certNo.toLowerCase().includes(q))
      .sort((a, b) => b.date.localeCompare(a.date))
  }

  const births = records.filter(r => r.type === 'birth').length
  const deaths = records.filter(r => r.type === 'death').length

  const renderItem = ({ item }: { item: DisplayRecord }) => {
    const color = item.type === 'birth' ? TZ.green : '#dc2626'
    return (
      <TouchableOpacity
        style={[s.card, { backgroundColor:T.card, borderColor:T.border }]}
        onPress={() => setSelected(item)} activeOpacity={0.8}
      >
        <View style={{ flexDirection:'row', alignItems:'center', gap:12 }}>
          <View style={[s.typeIcon, { backgroundColor:`${color}18` }]}>
            {item.type==='birth' ? <Baby size={18} color={color}/> : <Cross size={18} color={color}/>}
          </View>
          <View style={{ flex:1 }}>
            <Text style={[s.cardName, { color:T.text }]} numberOfLines={1}>{item.name}</Text>
            <Text style={[s.cardCert, { color:color }]}>{item.certNo}</Text>
            <View style={{ flexDirection:'row', gap:5, marginTop:4, flexWrap:'wrap' }}>
              <View style={[s.tag, { backgroundColor:`${color}18`, borderColor:`${color}40` }]}>
                <Text style={[s.tagTxt, { color }]}>{item.type.toUpperCase()}</Text>
              </View>
              <View style={[s.tag, {
                backgroundColor: item.synced ? `${TZ.green}18` : '#f9731618',
                borderColor:     item.synced ? `${TZ.green}40` : '#f9731640',
              }]}>
                {item.synced
                  ? <CheckCircle2 size={9} color={TZ.green}/>
                  : <Clock        size={9} color="#f97316"/>}
                <Text style={[s.tagTxt, { color: item.synced ? TZ.green : '#f97316' }]}>
                  {item.synced ? 'Synced' : 'Pending'}
                </Text>
              </View>
              {item.source === 'local' && !item.synced && (
                <View style={[s.tag, { backgroundColor:'#7c3aed18', borderColor:'#7c3aed40' }]}>
                  <Text style={[s.tagTxt, { color:'#a78bfa' }]}>Local</Text>
                </View>
              )}
            </View>
          </View>
          <View style={{ alignItems:'flex-end', gap:4 }}>
            <Text style={[s.cardDate, { color:T.textDim }]}>{item.date}</Text>
            <ChevronRight size={13} color={T.textDim}/>
          </View>
        </View>
      </TouchableOpacity>
    )
  }

  return (
    <SafeAreaView style={{ flex:1, backgroundColor:T.bg }} edges={['top']}>
      {/* Header */}
      <View style={[s.header, { backgroundColor:T.card, borderBottomColor:T.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <ArrowLeft size={20} color={T.text}/>
        </TouchableOpacity>
        <View style={{ flex:1, alignItems:'center' }}>
          <Text style={[s.headerTitle, { color:T.text }]}>Records</Text>
          <Text style={[s.headerSub, { color:T.textSub }]}>{records.length} total</Text>
        </View>
        <View style={{ width:36 }}/>
      </View>

      {/* Offline banner */}
      {offline && (
        <View style={[s.offlineBanner, { backgroundColor:'#f9731618', borderBottomColor:'#f9731640' }]}>
          <WifiOff size={13} color="#f97316"/>
          <Text style={{ fontSize:11, color:'#f97316', flex:1 }}>
            Offline — showing locally stored records. Connect to sync.
          </Text>
        </View>
      )}

      {/* Search */}
      <View style={[s.searchBar, { backgroundColor:T.card, borderBottomColor:T.border }]}>
        <View style={[s.searchInput, { backgroundColor:T.card2, borderColor:T.border }]}>
          <Search size={14} color={T.textDim}/>
          <TextInput style={{ flex:1, color:T.text, marginLeft:8, fontSize:13 }}
            value={query} onChangeText={setQuery}
            placeholder="Search name or certificate number…"
            placeholderTextColor={T.textDim} returnKeyType="search" blurOnSubmit={false}/>
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')}><X size={14} color={T.textDim}/></TouchableOpacity>
          )}
        </View>
      </View>

      {/* Filter tabs */}
      <View style={[s.filterBar, { backgroundColor:T.card, borderBottomColor:T.border }]}>
        {([
          ['all',   `All (${records.length})`],
          ['birth', `Births (${births})`],
          ['death', `Deaths (${deaths})`],
        ] as [FilterType, string][]).map(([f, label]) => (
          <TouchableOpacity key={f} style={[s.filterTab, filter===f && { borderBottomWidth:2, borderBottomColor:T.primary }]} onPress={() => setFilter(f)}>
            <Text style={[s.filterLabel, { color:filter===f?T.primary:T.textSub }]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading
        ? <View style={{ flex:1, alignItems:'center', justifyContent:'center' }}><ActivityIndicator size="large" color={T.primary}/></View>
        : <FlatList
            data={records} renderItem={renderItem} keyExtractor={i => i.id}
            contentContainerStyle={{ padding:12, paddingBottom:40, gap:8 }}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadRecords(true) }} tintColor={T.primary}/>}
            ListEmptyComponent={
              <View style={{ alignItems:'center', paddingTop:60, gap:12 }}>
                <FileText size={40} color={T.textDim}/>
                <Text style={{ color:T.textSub, fontSize:14, fontWeight:'700' }}>No records found</Text>
                <Text style={{ color:T.textDim, fontSize:12, textAlign:'center' }}>
                  {offline ? 'No local records. Register a birth or death to get started.' : 'No records match your search.'}
                </Text>
              </View>
            }
          />
      }

      {/* Detail Modal */}
      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
        <View style={{ flex:1, justifyContent:'flex-end', backgroundColor:'rgba(0,0.55)' }}>
          <View style={[s.modalSheet, { backgroundColor:T.card }]}>
            <View style={[s.sheetHandle, { backgroundColor:T.border }]}/>
            <View style={{ flexDirection:'row', alignItems:'center', marginBottom:16 }}>
              <Text style={[s.modalTitle, { color:T.text, flex:1 }]}>Record Details</Text>
              <TouchableOpacity onPress={() => setSelected(null)}><X size={20} color={T.textSub}/></TouchableOpacity>
            </View>
            {selected && (
              <ScrollView showsVerticalScrollIndicator={false}>
                {[
                  ['Type',           selected.type.toUpperCase()],
                  ['Certificate No', selected.certNo],
                  ['Name',           selected.name],
                  ['Date',           selected.date],
                  ['Sync Status',    selected.synced ? 'Synced to Central DB ✓' : 'Pending sync'],
                  ['Source',         selected.source === 'remote' ? 'Central Database' : 'Local Device'],
                ].map(([k, v]) => (
                  <View key={k} style={[s.detailRow, { borderBottomColor:T.border }]}>
                    <Text style={[s.detailKey, { color:T.textSub }]}>{k}</Text>
                    <Text style={[s.detailVal, { color:T.text }]}>{v}</Text>
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
  header:       { flexDirection:'row', alignItems:'center', paddingHorizontal:16, paddingVertical:12, borderBottomWidth:1 },
  backBtn:      { width:36, height:36, alignItems:'center', justifyContent:'center' },
  headerTitle:  { fontSize:15, fontWeight:'800' },
  headerSub:    { fontSize:11, marginTop:2 },
  offlineBanner:{ flexDirection:'row', alignItems:'center', gap:8, paddingHorizontal:14, paddingVertical:8, borderBottomWidth:1 },
  searchBar:    { paddingHorizontal:14, paddingVertical:8, borderBottomWidth:1 },
  searchInput:  { flexDirection:'row', alignItems:'center', borderWidth:1, borderRadius:10, paddingHorizontal:12, height:40 },
  filterBar:    { flexDirection:'row', borderBottomWidth:1 },
  filterTab:    { flex:1, alignItems:'center', paddingVertical:10 },
  filterLabel:  { fontSize:12, fontWeight:'700' },
  card:         { borderWidth:1, borderRadius:12, padding:12 },
  typeIcon:     { width:42, height:42, borderRadius:21, alignItems:'center', justifyContent:'center' },
  cardName:     { fontSize:13, fontWeight:'700' },
  cardCert:     { fontSize:11, fontWeight:'800', marginTop:2, letterSpacing:0.5 },
  cardDate:     { fontSize:10 },
  tag:          { flexDirection:'row', alignItems:'center', gap:4, borderWidth:1, borderRadius:8, paddingHorizontal:7, paddingVertical:3 },
  tagTxt:       { fontSize:9, fontWeight:'700' },
  modalSheet:   { borderTopLeftRadius:24, borderTopRightRadius:24, padding:24, paddingBottom:36, maxHeight:'70%' },
  sheetHandle:  { width:40, height:4, borderRadius:2, alignSelf:'center', marginBottom:16 },
  modalTitle:   { fontSize:16, fontWeight:'800' },
  detailRow:    { flexDirection:'row', justifyContent:'space-between', paddingVertical:12, borderBottomWidth:1 },
  detailKey:    { fontSize:12, width:'40%' },
  detailVal:    { fontSize:12, fontWeight:'700', flex:1, textAlign:'right' },
})