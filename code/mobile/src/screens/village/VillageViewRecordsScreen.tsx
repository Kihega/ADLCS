/**
 * VillageViewRecordsScreen.tsx — Village Officer · Records  v2.0
 *
 * Same look as the Hospital Officer's Records screen (search, filter tabs, tap a
 * record for its details) backed by GET /village/records.
 * The village side lists only DEATH and MIGRATION records, newest first.
 */
import React, { useState, useCallback, useRef } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Modal,
  ScrollView,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect } from '@react-navigation/native'
import {
  ArrowLeft,
  Search,
  Cross,
  Repeat,
  FileText,
  ChevronRight,
  X,
  Download,
  WifiOff,
} from 'lucide-react-native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useTheme } from '../../context/ThemeContext'
import { useResponsive } from '../../utils/responsive'
import { apiGet } from '../../services/syncService'
import { Alert } from '../../components/AppDialog'
import { downloadCertificateById, describeError } from '../../services/certificateService'
import BidCopy from '../../components/BidCopy'

type VStack = { VillageHome: undefined; VillageViewRecords: undefined }
type Props = { navigation: NativeStackNavigationProp<VStack, 'VillageViewRecords'> }
type FilterType = 'all' | 'deaths' | 'migrations'

interface RecordRow {
  id: string
  recordId: string
  type: 'deaths' | 'migrations'
  color: string
  label: string
  sub: string
  date: string
  ts: number
  birthId?: string | null
  // deaths
  certNo?: string
  cause?: string
  // migrations
  status?: string
  direction?: 'outgoing' | 'incoming'
  fromVillage?: string
  toVillage?: string
  reason?: string
  migrationToken?: string | null
  requestDate?: string | null
  confirmedDate?: string | null
  expiryDate?: string | null
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
  expired: 'Expired',
}
const STATUS_COLOR: Record<string, string> = {
  pending: '#f97316',
  confirmed: '#1eb53a',
  cancelled: '#dc2626',
  expired: '#8ea4c0',
}

function fmtDate(d?: string | null): string {
  if (!d) return '—'
  try {
    return new Date(d).toLocaleDateString('en-TZ', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return d
  }
}

export default function VillageViewRecordsScreen({ navigation }: Props) {
  const { theme: T } = useTheme()
  const { contentMaxWidth } = useResponsive()

  const [filter, setFilter] = useState<FilterType>('all')
  const [query, setQuery] = useState('')
  const [records, setRecords] = useState<RecordRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [failed, setFailed] = useState(false)
  const [selected, setSelected] = useState<RecordRow | null>(null)
  const [busy, setBusy] = useState(false)

  const loadRecords = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const json = await apiGet('/village/records')
      if (json.success && Array.isArray(json.data)) {
        const rows: RecordRow[] = json.data
          .map((r: any) => ({ ...r, ts: r.ts ? new Date(r.ts).getTime() : 0 }))
          .sort((a: RecordRow, b: RecordRow) => b.ts - a.ts) // newest first
        setRecords(rows)
        setFailed(false)
      } else {
        setRecords([])
        setFailed(true)
      }
    } catch {
      setRecords([])
      setFailed(true)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  // Spinner only on first mount; later focus events refresh silently in the background.
  const hasLoadedOnceRef = useRef(false)
  useFocusEffect(
    useCallback(() => {
      loadRecords(hasLoadedOnceRef.current)
      hasLoadedOnceRef.current = true
    }, [loadRecords])
  )

  const downloadDeath = async (recordId: string) => {
    setBusy(true)
    try {
      await downloadCertificateById('death', recordId)
    } catch (e) {
      console.warn('[certificate] download failed', e)
      Alert.alert('Error', `Could not generate PDF. ${describeError(e)}`)
    }
    setBusy(false)
  }

  const q = query.trim().toLowerCase()
  const visible = records.filter((r) => {
    if (filter !== 'all' && r.type !== filter) return false
    if (!q) return true
    return [r.label, r.sub, r.certNo, r.birthId, r.migrationToken]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q))
  })

  const deathCount = records.filter((r) => r.type === 'deaths').length
  const migrationCount = records.filter((r) => r.type === 'migrations').length

  const renderItem = ({ item }: { item: RecordRow }) => {
    const isDeath = item.type === 'deaths'
    const statusColor = STATUS_COLOR[item.status ?? ''] ?? T.textSub
    return (
      <TouchableOpacity
        style={[s.card, { backgroundColor: T.card, borderColor: T.border }]}
        onPress={() => setSelected(item)}
        activeOpacity={0.8}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={[s.typeIcon, { backgroundColor: `${item.color}18` }]}>
            {isDeath ? <Cross size={18} color={item.color} /> : <Repeat size={18} color={item.color} />}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.cardName, { color: T.text }]} numberOfLines={1}>
              {item.label}
            </Text>
            <Text style={[s.cardSub, { color: isDeath ? item.color : T.textSub }]} numberOfLines={1}>
              {item.sub}
            </Text>
            <View style={{ flexDirection: 'row', gap: 5, marginTop: 4, flexWrap: 'wrap' }}>
              <View style={[s.tag, { backgroundColor: `${item.color}18`, borderColor: `${item.color}40` }]}>
                <Text style={[s.tagTxt, { color: item.color }]}>{isDeath ? 'DEATH' : 'MIGRATION'}</Text>
              </View>
              {!isDeath && !!item.direction && (
                <View style={[s.tag, { backgroundColor: `${T.primary}18`, borderColor: `${T.primary}40` }]}>
                  <Text style={[s.tagTxt, { color: T.primary }]}>{item.direction.toUpperCase()}</Text>
                </View>
              )}
              {!isDeath && !!item.status && (
                <View style={[s.tag, { backgroundColor: `${statusColor}18`, borderColor: `${statusColor}40` }]}>
                  <Text style={[s.tagTxt, { color: statusColor }]}>
                    {(STATUS_LABEL[item.status] ?? item.status).toUpperCase()}
                  </Text>
                </View>
              )}
            </View>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            <Text style={[s.cardDate, { color: T.textDim }]}>{item.date}</Text>
            <BidCopy bid={item.birthId} />
            <ChevronRight size={13} color={T.textDim} />
          </View>
        </View>
      </TouchableOpacity>
    )
  }

  const detailRows = (r: RecordRow): [string, string][] =>
    r.type === 'deaths'
      ? [
          ['Type', 'DEATH'],
          ['Certificate No', r.certNo || '—'],
          ['Name', r.label],
          ['Birth ID', r.birthId || '—'],
          ['Cause of death', r.cause || '—'],
          ['Registered', r.date],
        ]
      : [
          ['Type', 'MIGRATION'],
          ['Citizen', r.label],
          ['Birth ID', r.birthId || '—'],
          ['Direction', r.direction === 'incoming' ? 'Incoming' : 'Outgoing'],
          ['Status', STATUS_LABEL[r.status ?? ''] ?? r.status ?? '—'],
          ['From', r.fromVillage || '—'],
          ['To', r.toVillage || '—'],
          ['Reason', r.reason || '—'],
          ['Migration token', r.migrationToken || '—'],
          ['Requested', fmtDate(r.requestDate)],
          ['Confirmed', fmtDate(r.confirmedDate)],
          ['Valid until', fmtDate(r.expiryDate)],
        ]

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }} edges={['top']}>
      {/* Header */}
      <View style={[s.header, { backgroundColor: T.card, borderBottomColor: T.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <ArrowLeft size={20} color={T.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={[s.headerTitle, { color: T.text }]}>Records</Text>
          <Text style={[s.headerSub, { color: T.textSub }]}>{records.length} total</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {failed && (
        <View style={[s.banner, { backgroundColor: '#f9731618', borderBottomColor: '#f9731640' }]}>
          <WifiOff size={13} color={T.warning} />
          <Text style={{ fontSize: 11, color: T.warning, flex: 1 }}>
            Could not load records. Check your connection and pull down to retry.
          </Text>
        </View>
      )}

      {/* Search */}
      <View style={[s.searchBar, { backgroundColor: T.card, borderBottomColor: T.border }]}>
        <View style={[s.searchInput, { backgroundColor: T.card2, borderColor: T.border }]}>
          <Search size={14} color={T.textDim} />
          <TextInput
            style={{ flex: 1, color: T.text, marginLeft: 8, fontSize: 13 }}
            value={query}
            onChangeText={setQuery}
            placeholder="Search name, certificate no. or Birth ID…"
            placeholderTextColor={T.textDim}
            returnKeyType="search"
            blurOnSubmit={false}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')}>
              <X size={14} color={T.textDim} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Filter tabs */}
      <View style={[s.filterBar, { backgroundColor: T.card, borderBottomColor: T.border }]}>
        {(
          [
            ['all', `All (${records.length})`],
            ['deaths', `Deaths (${deathCount})`],
            ['migrations', `Migrations (${migrationCount})`],
          ] as [FilterType, string][]
        ).map(([f, label]) => (
          <TouchableOpacity
            key={f}
            style={[s.filterTab, filter === f && { borderBottomWidth: 2, borderBottomColor: T.primary }]}
            onPress={() => setFilter(f)}
          >
            <Text style={[s.filterLabel, { color: filter === f ? T.primary : T.textSub }]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={T.primary} />
        </View>
      ) : (
        <FlatList
          data={visible}
          renderItem={renderItem}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{
            padding: 12,
            paddingBottom: 40,
            gap: 8,
            width: '100%',
            maxWidth: contentMaxWidth,
            alignSelf: 'center',
          }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true)
                loadRecords(true)
              }}
              tintColor={T.primary}
            />
          }
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingTop: 60, gap: 12 }}>
              <FileText size={40} color={T.textDim} />
              <Text style={{ color: T.textSub, fontSize: 14, fontWeight: '700' }}>No records found</Text>
              <Text style={{ color: T.textDim, fontSize: 12, textAlign: 'center' }}>
                Recorded deaths and migrations will appear here.
              </Text>
            </View>
          }
        />
      )}

      {/* Detail sheet */}
      <Modal
        visible={!!selected}
        transparent
        animationType="slide"
        onRequestClose={() => setSelected(null)}
      >
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' }}>
          <View style={[s.modalSheet, { backgroundColor: T.card }]}>
            <View style={[s.sheetHandle, { backgroundColor: T.border }]} />
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
              <Text style={[s.modalTitle, { color: T.text, flex: 1 }]}>Record Details</Text>
              <TouchableOpacity onPress={() => setSelected(null)}>
                <X size={20} color={T.textSub} />
              </TouchableOpacity>
            </View>
            {selected && (
              <>
                <ScrollView showsVerticalScrollIndicator={false}>
                  {detailRows(selected).map(([k, v]) => (
                    <View key={k} style={[s.detailRow, { borderBottomColor: T.border }]}>
                      <Text style={[s.detailKey, { color: T.textSub }]}>{k}</Text>
                      <Text style={[s.detailVal, { color: T.text }]}>{v}</Text>
                    </View>
                  ))}
                </ScrollView>
                {selected.type === 'deaths' && (
                  <TouchableOpacity
                    onPress={() => downloadDeath(selected.recordId)}
                    disabled={busy}
                    style={[s.dlBtn, { backgroundColor: selected.color, opacity: busy ? 0.7 : 1 }]}
                  >
                    {busy ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Download size={15} color="#fff" />
                    )}
                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>
                      {busy ? 'Generating PDF…' : 'Download Death Certificate'}
                    </Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>
        </View>
      </Modal>
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
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 15, fontWeight: '800' },
  headerSub: { fontSize: 11, marginTop: 2 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  searchBar: { paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: 1 },
  searchInput: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 40,
  },
  filterBar: { flexDirection: 'row', borderBottomWidth: 1 },
  filterTab: { flex: 1, alignItems: 'center', paddingVertical: 10 },
  filterLabel: { fontSize: 12, fontWeight: '700' },
  card: { borderWidth: 1, borderRadius: 12, padding: 12 },
  typeIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardName: { fontSize: 13, fontWeight: '700' },
  cardSub: { fontSize: 11, fontWeight: '700', marginTop: 2, letterSpacing: 0.3 },
  cardDate: { fontSize: 10 },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  tagTxt: { fontSize: 9, fontWeight: '700' },
  modalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 36,
    maxHeight: '75%',
  },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 16, fontWeight: '800' },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  detailKey: { fontSize: 12, width: '40%' },
  detailVal: { fontSize: 12, fontWeight: '700', flex: 1, textAlign: 'right' },
  dlBtn: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 12,
  },
})
