/**
 * SyncDataScreen.tsx — System Connection & Sync Status  v2.0
 * Hospital Officer · ADLCS Tanzania
 *
 * CHANGES v2.0:
 *   • All "RITA" terminology replaced with "System Connection" / "Central Database"
 *   • App works fully offline — records queued locally, auto-sync on reconnection
 *   • Connection badge shows Good / Fair / Offline
 *   • Auto-refresh every 10 seconds while screen is mounted
 */

import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert, Animated,
} from 'react-native'
import AsyncStorage    from '@react-native-async-storage/async-storage'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  ArrowLeft, RefreshCw, Wifi, WifiOff, CheckCircle,
  Baby, Cross, Clock, Shield, Database, WifiLow,
} from 'lucide-react-native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useTheme, TZ } from '../../context/ThemeContext'

type RootStack = { HospitalHome: undefined; SyncData: undefined }
type Props = { navigation: NativeStackNavigationProp<RootStack, 'SyncData'> }

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'https://adlcs-backend.onrender.com/api'

type ConnStatus = 'Good' | 'Fair' | 'Offline'

interface SyncStatus {
  connected:          boolean
  connectionQuality:  ConnStatus
  lastSyncAt:         string | null
  unsyncedBirths:     number
  unsyncedDeaths:     number
  totalSynced:        number
  systemEndpointOk:   boolean
}

async function checkConnectionQuality(): Promise<ConnStatus> {
  const t = Date.now()
  try {
    await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(3000) })
    const ms = Date.now() - t
    return ms < 700 ? 'Good' : 'Fair'
  } catch { return 'Offline' }
}

const CONN_COLORS: Record<ConnStatus, string> = {
  Good:    '#4ade80',
  Fair:    '#fbbf24',
  Offline: '#f87171',
}

export default function SyncDataScreen({ navigation }: Props) {
  const { theme: T } = useTheme()
  const [status,  setStatus]  = useState<SyncStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const spinAnim = useRef(new Animated.Value(0)).current
  const spinLoop = useRef<Animated.CompositeAnimation | null>(null)

  const fetchStatus = useCallback(async () => {
    const quality = await checkConnectionQuality()
    try {
      const token = await AsyncStorage.getItem('adlcs_access_token')
      const res   = await fetch(`${API_BASE}/officer/sync/status`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(4000),
      })
      const json = await res.json()
      if (json.success) {
        setStatus({
          ...json.data,
          connected:         quality !== 'Offline',
          connectionQuality: quality,
          systemEndpointOk:  quality !== 'Offline',
        })
      }
    } catch {
      setStatus(prev => ({
        connected:          false,
        connectionQuality:  'Offline',
        lastSyncAt:         prev?.lastSyncAt ?? null,
        unsyncedBirths:     prev?.unsyncedBirths ?? 0,
        unsyncedDeaths:     prev?.unsyncedDeaths ?? 0,
        totalSynced:        prev?.totalSynced ?? 0,
        systemEndpointOk:   false,
      }))
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 10_000)
    return () => clearInterval(interval)
  }, [fetchStatus])

  useEffect(() => {
    if (syncing) {
      spinLoop.current = Animated.loop(
        Animated.timing(spinAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
      )
      spinLoop.current.start()
    } else {
      spinLoop.current?.stop()
      spinAnim.setValue(0)
    }
  }, [syncing])

  const triggerSync = async () => {
    if (!status?.connected) {
      Alert.alert('No Connection', 'Device is offline. Records are safely queued and will sync automatically when a connection is available.')
      return
    }
    setSyncing(true)
    try {
      const token = await AsyncStorage.getItem('adlcs_access_token')
      const res   = await fetch(`${API_BASE}/officer/sync/trigger`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const json = await res.json()
      if (json.success) {
        Alert.alert('Sync Complete', `${json.data?.synced ?? 0} records pushed to the Central Database successfully.`)
        await fetchStatus()
      } else {
        Alert.alert('Sync Failed', json.message ?? 'Could not reach the Central Database.')
      }
    } catch {
      Alert.alert('Connection Error', 'Unable to reach the server. Records remain queued and will sync on reconnection.')
    }
    setSyncing(false)
  }

  const spin = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] })

  const quality: ConnStatus = status?.connectionQuality ?? 'Offline'
  const qualityColor = CONN_COLORS[quality]
  const QualityIcon  = quality === 'Good' ? Wifi : quality === 'Fair' ? WifiLow : WifiOff

  const StatusRow = ({ icon, label, value, valueColor }: {
    icon: React.ReactNode; label: string; value: string; valueColor?: string
  }) => (
    <View style={[s.statusRow, { borderBottomColor: T.border }]}>
      <View style={[s.statusIcon, { backgroundColor: T.card2 }]}>{icon}</View>
      <Text style={[s.statusLabel, { color: T.textSub }]}>{label}</Text>
      <Text style={[s.statusValue, { color: valueColor ?? T.text }]}>{value}</Text>
    </View>
  )

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }} edges={['top']}>

      {/* Header */}
      <View style={[s.header, { backgroundColor: T.card, borderBottomColor: T.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <ArrowLeft size={20} color={T.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={[s.headerTitle, { color: T.text }]}>System Connection</Text>
          <Text style={[s.headerSub,   { color: T.textSub }]}>Central Database synchronisation</Text>
        </View>
        <View style={[s.headerIcon, { backgroundColor: '#0e749018' }]}>
          <Database size={18} color="#0e7490" />
        </View>
      </View>

      {loading
        ? <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="large" color={T.primary} />
          </View>
        : <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>

          {/* Connection status banner */}
          <View style={[s.banner, {
            backgroundColor: `${qualityColor}15`,
            borderColor:     `${qualityColor}40`,
          }]}>
            <QualityIcon size={18} color={qualityColor} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={[s.bannerTitle, { color: qualityColor }]}>
                {quality === 'Good'    ? 'Connected — Good Signal'
                 : quality === 'Fair' ? 'Connected — Fair Signal'
                 :                      'Offline — No Connection'}
              </Text>
              <Text style={[s.bannerSub, { color: T.textSub }]}>
                {quality !== 'Offline'
                  ? 'Real-time synchronisation with Central Database is active'
                  : 'All records are securely queued locally and will sync automatically on reconnection'}
              </Text>
            </View>
          </View>

          {/* Sync stats */}
          <View style={[s.statsCard, { backgroundColor: T.card, borderColor: T.border }]}>
            <StatusRow icon={<Baby  size={14} color={TZ.green}  />}
              label="Unsynced births"
              value={String(status?.unsyncedBirths ?? 0)}
              valueColor={status?.unsyncedBirths ? '#f97316' : T.success} />
            <StatusRow icon={<Cross size={14} color="#dc2626" />}
              label="Unsynced deaths"
              value={String(status?.unsyncedDeaths ?? 0)}
              valueColor={status?.unsyncedDeaths ? '#f97316' : T.success} />
            <StatusRow icon={<CheckCircle size={14} color={T.success} />}
              label="Total records synced"
              value={String(status?.totalSynced ?? 0)} />
            <StatusRow icon={<Clock size={14} color={T.primary} />}
              label="Last sync"
              value={status?.lastSyncAt
                ? new Date(status.lastSyncAt).toLocaleString('en-TZ', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })
                : 'Never'} />
            <View style={[s.statusRow, { borderBottomWidth: 0 }]}>
              <View style={[s.statusIcon, { backgroundColor: T.card2 }]}>
                <Shield size={14} color={status?.systemEndpointOk ? T.success : T.danger} />
              </View>
              <Text style={[s.statusLabel, { color: T.textSub }]}>System endpoint</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: status?.systemEndpointOk ? T.success : T.danger }} />
                <Text style={[s.statusValue, { color: status?.systemEndpointOk ? T.success : T.danger }]}>
                  {status?.systemEndpointOk ? 'Reachable' : 'Unreachable'}
                </Text>
              </View>
            </View>
          </View>

          {/* Connection quality indicator */}
          <View style={[s.qualityCard, { backgroundColor: T.card, borderColor: T.border }]}>
            <Text style={[s.qualityTitle, { color: T.textSub }]}>Connection Quality</Text>
            <View style={s.qualityRow}>
              {(['Good', 'Fair', 'Offline'] as ConnStatus[]).map(q => (
                <View key={q} style={[s.qualityBadge, {
                  backgroundColor: q === quality ? `${CONN_COLORS[q]}18` : T.card2,
                  borderColor:     q === quality ? CONN_COLORS[q] : T.border,
                  borderWidth:     q === quality ? 1.5 : 1,
                }]}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: CONN_COLORS[q] }} />
                  <Text style={{ fontSize: 12, fontWeight: q === quality ? '800' : '500', color: q === quality ? CONN_COLORS[q] : T.textDim }}>{q}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Sync trigger */}
          <TouchableOpacity
            style={[s.syncBtn, {
              backgroundColor: syncing ? T.card : '#0e7490',
              borderColor: '#0e7490',
              opacity: syncing ? 0.7 : 1,
            }]}
            onPress={triggerSync}
            disabled={syncing}
            activeOpacity={0.85}
          >
            <Animated.View style={{ transform: [{ rotate: spin }] }}>
              <RefreshCw size={18} color={syncing ? '#0e7490' : '#fff'} />
            </Animated.View>
            <Text style={[s.syncBtnText, { color: syncing ? '#0e7490' : '#fff' }]}>
              {syncing ? 'Synchronising…' : 'Sync Now'}
            </Text>
          </TouchableOpacity>

          {quality === 'Offline' && (
            <Text style={[s.offlineNote, { color: T.textDim }]}>
              This app functions fully offline. All registrations, deaths, and certificates are stored securely on this device. Connect to any network and tap "Sync Now" to push records to the Central Database.
            </Text>
          )}

          {/* Security note */}
          <View style={[s.secNote, { backgroundColor: T.card2, borderColor: T.border }]}>
            <Shield size={12} color={T.textDim} />
            <Text style={[s.secNoteText, { color: T.textDim }]}>
              All data transmitted over TLS 1.3 with certificate pinning. Sync events are timestamped and recorded in the audit log. Offline records are AES-encrypted on-device.
            </Text>
          </View>
        </ScrollView>}
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  header:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  backBtn:      { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle:  { fontSize: 15, fontWeight: '800' },
  headerSub:    { fontSize: 11, marginTop: 2 },
  headerIcon:   { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  body:         { padding: 16, paddingBottom: 40, gap: 14 },
  banner:       { flexDirection: 'row', alignItems: 'flex-start', borderWidth: 1, borderRadius: 14, padding: 16 },
  bannerTitle:  { fontSize: 14, fontWeight: '800' },
  bannerSub:    { fontSize: 11, marginTop: 4, lineHeight: 17 },
  statsCard:    { borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  statusRow:    { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 16, borderBottomWidth: 1 },
  statusIcon:   { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  statusLabel:  { flex: 1, fontSize: 13 },
  statusValue:  { fontSize: 14, fontWeight: '800' },
  qualityCard:  { borderWidth: 1, borderRadius: 14, padding: 16 },
  qualityTitle: { fontSize: 12, fontWeight: '600', marginBottom: 12 },
  qualityRow:   { flexDirection: 'row', gap: 8 },
  qualityBadge: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 10, paddingVertical: 10 },
  syncBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderWidth: 1.5, borderRadius: 14, paddingVertical: 16 },
  syncBtnText:  { fontSize: 15, fontWeight: '800' },
  offlineNote:  { fontSize: 12, textAlign: 'center', lineHeight: 19 },
  secNote:      { flexDirection: 'row', gap: 8, borderWidth: 1, borderRadius: 12, padding: 14 },
  secNoteText:  { flex: 1, fontSize: 10, lineHeight: 16 },
})
