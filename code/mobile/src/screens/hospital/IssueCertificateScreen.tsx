/**
 * IssueCertificateScreen.tsx — Certificate Issuance & Management  v3.0
 *
 * Lists ALL registered births and deaths from local SQLite DB.
 * Each row has Download PDF and Print buttons.
 * After registration the new record appears here automatically.
 * Works fully offline — PDFs generated on-device with expo-print.
 */

import React, { useState, useEffect, useCallback } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  FlatList, ActivityIndicator, RefreshControl,
  Alert, Modal, ScrollView,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  ArrowLeft, FileText, Baby, Cross,
  Download, Printer, ChevronRight,
  CheckCircle2, Clock, RefreshCw,
} from 'lucide-react-native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'

import { getAllBirths, getAllDeaths, LocalBirth, LocalDeath } from '../../services/localDb'
import {
  generateBirthPdf, generateDeathPdf,
  sharePdf, printHtml,
  buildBirthCertHtml, buildDeathCertHtml,
  updateBirthCertPath, updateDeathCertPath,
} from '../../services/certificateService'
import { useTheme, TZ } from '../../context/ThemeContext'

// re-export updateDeathCertPath from localDb
import { updateDeathCertPath as _updateDeathCertPath } from '../../services/localDb'

type RootStack = { HospitalHome: undefined; IssueCertificate: undefined }
type Props = { navigation: NativeStackNavigationProp<RootStack, 'IssueCertificate'> }

type FilterTab = 'all' | 'birth' | 'death'

interface CertRow {
  id:           string
  type:         'birth' | 'death'
  certNo:       string
  name:         string
  date:         string
  synced:       boolean
  certPdfPath:  string
  raw:          LocalBirth | LocalDeath
}

export default function IssueCertificateScreen({ navigation }: Props) {
  const { theme: T } = useTheme()
  const [tab,        setTab]       = useState<FilterTab>('all')
  const [rows,       setRows]      = useState<CertRow[]>([])
  const [loading,    setLoading]   = useState(true)
  const [refreshing, setRefreshing]= useState(false)
  const [actionId,   setActionId]  = useState<string | null>(null) // cert ID being processed
  const [selected,   setSelected]  = useState<CertRow | null>(null)

  // ── Load from local DB ────────────────────────────────────────────────────
  const loadCerts = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const [births, deaths] = await Promise.all([getAllBirths(), getAllDeaths()])
      const birthRows: CertRow[] = births.map(b => ({
        id: b.id, type: 'birth', certNo: b.certNo,
        name: [b.childFirstName, b.childMiddleName, b.childSurname].filter(Boolean).join(' ').toUpperCase(),
        date: new Date(b.registeredAt).toLocaleDateString('en-TZ', { day: '2-digit', month: 'short', year: 'numeric' }),
        synced: b.synced === 1, certPdfPath: b.certPdfPath, raw: b,
      }))
      const deathRows: CertRow[] = deaths.map(d => ({
        id: d.id, type: 'death', certNo: d.certNo,
        name: d.deceasedName.toUpperCase() || d.nationalId || '—',
        date: new Date(d.registeredAt).toLocaleDateString('en-TZ', { day: '2-digit', month: 'short', year: 'numeric' }),
        synced: d.synced === 1, certPdfPath: d.certPdfPath, raw: d,
      }))
      const all = [...birthRows, ...deathRows].sort((a, b) =>
        new Date((b.raw as any).registeredAt).getTime() - new Date((a.raw as any).registeredAt).getTime()
      )
      setRows(all)
    } catch (e) { console.warn('loadCerts error', e) }
    finally { setLoading(false); setRefreshing(false) }
  }, [])

  useEffect(() => { loadCerts() }, [loadCerts])

  const filtered = tab === 'all' ? rows : rows.filter(r => r.type === tab)

  // ── Download PDF ──────────────────────────────────────────────────────────
  const handleDownload = async (row: CertRow) => {
    setActionId(row.id)
    try {
      let path = row.certPdfPath
      if (!path) {
        if (row.type === 'birth') {
          path = await generateBirthPdf(row.raw as LocalBirth)
          await updateBirthCertPath(row.id, path)
        } else {
          path = await generateDeathPdf(row.raw as LocalDeath)
          await _updateDeathCertPath(row.id, path)
        }
        setRows(prev => prev.map(r => r.id === row.id ? { ...r, certPdfPath: path } : r))
      }
      await sharePdf(path)
    } catch (e) {
      Alert.alert('Error', 'Could not generate PDF. Please try again.')
      console.warn('download error', e)
    }
    setActionId(null)
  }

  // ── Print ─────────────────────────────────────────────────────────────────
  const handlePrint = async (row: CertRow) => {
    setActionId(`print-${row.id}`)
    try {
      const html = row.type === 'birth'
        ? buildBirthCertHtml(row.raw as LocalBirth)
        : buildDeathCertHtml(row.raw as LocalDeath)
      await printHtml(html)
    } catch (e) {
      Alert.alert('Print Error', 'Could not send to printer.')
    }
    setActionId(null)
  }

  // ── Detail Modal ──────────────────────────────────────────────────────────
  const DetailModal = () => {
    if (!selected) return null
    const isBirth = selected.type === 'birth'
    const b = selected.raw as LocalBirth
    const d = selected.raw as LocalDeath
    const color = isBirth ? TZ.green : '#dc2626'

    return (
      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalSheet, { backgroundColor: T.card }]}>
            <View style={s.sheetHandle} />
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
              <View style={[s.sheetTypeIcon, { backgroundColor: `${color}18` }]}>
                {isBirth ? <Baby size={18} color={color} /> : <Cross size={18} color={color} />}
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={[s.sheetTitle, { color: T.text }]}>{selected.name}</Text>
                <Text style={[s.sheetCertNo, { color: color }]}>{selected.certNo}</Text>
              </View>
              <TouchableOpacity onPress={() => setSelected(null)} style={s.sheetClose}>
                <Text style={{ color: T.textSub, fontSize: 18 }}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {isBirth ? (
                <>
                  {[
                    ['Child', [b.childFirstName, b.childMiddleName, b.childSurname].filter(Boolean).join(' ')],
                    ['Date of Birth', b.dateOfBirth],
                    ['Gender', b.gender],
                    ['Father', b.fatherName || '—'],
                    ['Mother', b.motherName || '—'],
                    ['Facility', b.facilityName || '—'],
                    ['District', b.facilityDistrict || '—'],
                    ['Region', b.facilityRegion || '—'],
                    ['Officer', b.officerName || '—'],
                    ['NIN', b.nationalId || 'Pending'],
                    ['Registered', new Date(b.registeredAt).toLocaleString('en-TZ')],
                    ['Synced', b.synced === 1 ? 'Yes ✓' : 'Pending'],
                  ].map(([k, v]) => (
                    <View key={k} style={[s.detailRow, { borderBottomColor: T.border }]}>
                      <Text style={[s.detailKey, { color: T.textSub }]}>{k}</Text>
                      <Text style={[s.detailVal, { color: T.text }]}>{v}</Text>
                    </View>
                  ))}
                </>
              ) : (
                <>
                  {[
                    ['Deceased', d.deceasedName || d.nationalId || '—'],
                    ['National ID', d.nationalId || '—'],
                    ['Cause', d.causeOfDeath],
                    ['Date of Death', d.dateOfDeath],
                    ['Location', d.locationType.replace(/_/g, ' ')],
                    ['Category', d.category],
                    ['Informant', d.informantName || '—'],
                    ['Facility', d.facilityName || '—'],
                    ['Officer', d.officerName || '—'],
                    ['Registered', new Date(d.registeredAt).toLocaleString('en-TZ')],
                    ['Synced', d.synced === 1 ? 'Yes ✓' : 'Pending'],
                  ].map(([k, v]) => (
                    <View key={k} style={[s.detailRow, { borderBottomColor: T.border }]}>
                      <Text style={[s.detailKey, { color: T.textSub }]}>{k}</Text>
                      <Text style={[s.detailVal, { color: T.text }]}>{v}</Text>
                    </View>
                  ))}
                </>
              )}
            </ScrollView>

            {/* Action buttons inside modal */}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <TouchableOpacity
                style={[s.modalBtn, { backgroundColor: `${color}18`, borderColor: `${color}50` }]}
                onPress={() => { setSelected(null); setTimeout(() => handlePrint(selected), 300) }}
              >
                <Printer size={14} color={color} />
                <Text style={[s.modalBtnText, { color }]}>Print</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modalBtn, { flex: 2, backgroundColor: color, borderColor: color }]}
                onPress={() => { setSelected(null); setTimeout(() => handleDownload(selected), 300) }}
              >
                <Download size={14} color="#fff" />
                <Text style={[s.modalBtnText, { color: '#fff' }]}>Download PDF</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    )
  }

  // ── Row item ──────────────────────────────────────────────────────────────
  const renderItem = ({ item }: { item: CertRow }) => {
    const isBirth    = item.type === 'birth'
    const color      = isBirth ? TZ.green : '#dc2626'
    const isWorking  = actionId === item.id
    const isPrinting = actionId === `print-${item.id}`

    return (
      <TouchableOpacity
        style={[s.card, { backgroundColor: T.card, borderColor: T.border }]}
        onPress={() => setSelected(item)}
        activeOpacity={0.8}
      >
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
          <View style={[s.typeIcon, { backgroundColor: `${color}18` }]}>
            {isBirth ? <Baby size={18} color={color} /> : <Cross size={18} color={color} />}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.cardName, { color: T.text }]} numberOfLines={1}>{item.name}</Text>
            <Text style={[s.cardCert, { color: color }]}>{item.certNo}</Text>
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
              <View style={[s.tag, { backgroundColor: `${color}18`, borderColor: `${color}40` }]}>
                <Text style={[s.tagText, { color }]}>{isBirth ? 'BIRTH' : 'DEATH'}</Text>
              </View>
              <View style={[s.tag, {
                backgroundColor: item.synced ? `${TZ.green}18` : '#f9731618',
                borderColor:     item.synced ? `${TZ.green}40` : '#f9731640',
              }]}>
                {item.synced
                  ? <CheckCircle2 size={9} color={TZ.green} />
                  : <Clock        size={9} color="#f97316"  />}
                <Text style={[s.tagText, { color: item.synced ? TZ.green : '#f97316' }]}>
                  {item.synced ? 'Synced' : 'Pending sync'}
                </Text>
              </View>
              {!!item.certPdfPath && (
                <View style={[s.tag, { backgroundColor: '#0891b218', borderColor: '#0891b240' }]}>
                  <FileText size={9} color="#0891b2" />
                  <Text style={[s.tagText, { color: '#0891b2' }]}>PDF ready</Text>
                </View>
              )}
            </View>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            <Text style={[s.cardDate, { color: T.textDim }]}>{item.date}</Text>
            <ChevronRight size={13} color={T.textDim} />
          </View>
        </View>

        {/* Download + Print inline buttons */}
        <View style={[s.cardActions, { borderTopColor: T.border }]}>
          <TouchableOpacity
            style={[s.cardBtn, { borderColor: T.border }]}
            onPress={() => handlePrint(item)}
            disabled={!!actionId}
          >
            {isPrinting
              ? <ActivityIndicator size="small" color={color} />
              : <Printer size={13} color={T.textSub} />}
            <Text style={[s.cardBtnText, { color: T.textSub }]}>Print</Text>
          </TouchableOpacity>
          <View style={{ width: 1, backgroundColor: T.border }} />
          <TouchableOpacity
            style={[s.cardBtn, { backgroundColor: `${color}10` }]}
            onPress={() => handleDownload(item)}
            disabled={!!actionId}
          >
            {isWorking
              ? <ActivityIndicator size="small" color={color} />
              : <Download size={13} color={color} />}
            <Text style={[s.cardBtnText, { color }]}>
              {item.certPdfPath ? 'Download PDF' : 'Generate & Download'}
            </Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }} edges={['top']}>
      {/* Header */}
      <View style={[s.header, { backgroundColor: T.card, borderBottomColor: T.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <ArrowLeft size={20} color={T.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={[s.headerTitle, { color: T.text }]}>Certificates</Text>
          <Text style={[s.headerSub, { color: T.textSub }]}>{rows.length} issued</Text>
        </View>
        <TouchableOpacity
          style={[s.backBtn, { backgroundColor: T.card2 }]}
          onPress={() => loadCerts()}
        >
          <RefreshCw size={16} color={T.textSub} />
        </TouchableOpacity>
      </View>

      {/* Filter tabs */}
      <View style={[s.tabs, { backgroundColor: T.card, borderBottomColor: T.border }]}>
        {(['all', 'birth', 'death'] as FilterTab[]).map(t => (
          <TouchableOpacity
            key={t}
            style={[s.tab === t && { borderBottomWidth: 2, borderBottomColor: T.primary }]}
            onPress={() => setTab(t)}
          >
            <Text style={[s.tabText, { color: tab === t ? T.primary : T.textSub }]}>
              {t === 'all' ? `All (${rows.length})` : t === 'birth' ? `Births (${rows.filter(r=>r.type==='birth').length})` : `Deaths (${rows.filter(r=>r.type==='death').length})`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={T.primary} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={i => i.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 12, paddingBottom: 40, gap: 10 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); loadCerts(true) }}
              tintColor={T.primary}
            />
          }
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingTop: 60, gap: 12 }}>
              <FileText size={40} color={T.textDim} />
              <Text style={{ color: T.textSub, fontSize: 14, fontWeight: '700' }}>
                No certificates yet
              </Text>
              <Text style={{ color: T.textDim, fontSize: 12, textAlign: 'center' }}>
                Complete a birth or death registration to see certificates here.
              </Text>
            </View>
          }
        />
      )}

      <DetailModal />
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  header:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  backBtn:      { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  headerTitle:  { fontSize: 15, fontWeight: '800' },
  headerSub:    { fontSize: 11, marginTop: 2 },
  tabs:         { flexDirection: 'row', borderBottomWidth: 1 },
  tab:          { flex: 1, alignItems: 'center', paddingVertical: 11 },
  tabText:      { fontSize: 12, fontWeight: '700' },
  card:         { borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  typeIcon:     { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  cardName:     { fontSize: 13, fontWeight: '700' },
  cardCert:     { fontSize: 12, fontWeight: '800', marginTop: 2, letterSpacing: 0.5 },
  cardDate:     { fontSize: 10 },
  tag:          { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  tagText:      { fontSize: 9, fontWeight: '700' },
  cardActions:  { flexDirection: 'row', borderTopWidth: 1, marginTop: 10 },
  cardBtn:      { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10 },
  cardBtnText:  { fontSize: 12, fontWeight: '700' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0.55)' },
  modalSheet:   { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36, maxHeight: '80%' },
  sheetHandle:  { width: 40, height: 4, borderRadius: 2, backgroundColor: '#ccc', alignSelf: 'center', marginBottom: 16 },
  sheetTypeIcon:{ width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  sheetTitle:   { fontSize: 14, fontWeight: '800' },
  sheetCertNo:  { fontSize: 12, fontWeight: '700', marginTop: 2 },
  sheetClose:   { padding: 8 },
  detailRow:    { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1 },
  detailKey:    { fontSize: 12, width: '40%' },
  detailVal:    { fontSize: 12, fontWeight: '600', flex: 1, textAlign: 'right' },
  modalBtn:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderRadius: 12, paddingVertical: 13 },
  modalBtnText: { fontSize: 13, fontWeight: '800' },
})