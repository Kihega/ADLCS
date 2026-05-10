/**
 * SyncDataScreen.tsx — Manual Sync & Status  v1.0
 * Hospital Officer · ADLCS Tanzania
 *
 * Shows the current sync state between this device and the RITA backend.
 * Displays counts of unsynced births / deaths and allows manual trigger.
 * Auto-refreshes every 10 seconds while mounted.
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
  Baby, Cross, Clock, Shield,
} from 'lucide-react-native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useTheme, TZ } from '../../context/ThemeContext'

type RootStack = { HospitalHome: undefined; SyncData: undefined }
type Props = { navigation: NativeStackNavigationProp<RootStack, 'SyncData'> }

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'https://adlcs-backend.onrender.com/api'

interface SyncStatus {
  connected:         boolean
  lastSyncAt:        string | null
  unsyncedBirths:    number
  unsyncedDeaths:    number
  totalSynced:       number
  ritaEndpointOk:    boolean
}

export default function SyncDataScreen({ navigation }: Props) {
  const { theme: T } = useTheme()
  const [status,   setStatus]   = useState<SyncStatus | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [syncing,  setSyncing]  = useState(false)
  const spinAnim = useRef(new Animated.Value(0)).current
  const spinLoop = useRef<Animated.CompositeAnimation | null>(null)

  const fetchStatus = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('adlcs_access_token')
      const res = await fetch(`${API_BASE}/officer/sync/status`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const json = await res.json()
      if (json.success) setStatus(json.data)
      else setStatus(s => s ?? {
        connected: false, lastSyncAt: null,
        unsyncedBirths: 0, unsyncedDeaths: 0, totalSynced: 0, ritaEndpointOk: false,
      })
    } catch {
      setStatus(s => s ?? {
        connected: false, lastSyncAt: null,
        unsyncedBirths: 0, unsyncedDeaths: 0, totalSynced: 0, ritaEndpointOk: false,
      })
    }
    setLoading(false)
  }, [])

  // Poll every 10 seconds
  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 10_000)
    return () => clearInterval(interval)
  }, [fetchStatus])

  // Spinning animation while syncing
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
    setSyncing(true)
    try {
      const token = await AsyncStorage.getItem('adlcs_access_token')
      const res = await fetch(`${API_BASE}/officer/sync/trigger`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const json = await res.json()
      if (json.success) {
        Alert.alert('Sync Complete', `${json.data?.synced ?? 0} records pushed to RITA successfully.`)
        await fetchStatus()
      } else {
        Alert.alert('Sync Failed', json.message ?? 'Could not reach RITA endpoint.')
      }
    } catch {
      Alert.alert('Network Error', 'Unable to reach the server. Check your connection.')
    }
    setSyncing(false)
  }

  const spin = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] })

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
      <View style={[s.header, { backgroundColor: T.card, borderBottomColor: T.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <ArrowLeft size={20} color={T.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={[s.headerTitle, { color: T.text }]}>Data Sync</Text>
          <Text style={[s.headerSub,   { color: T.textSub }]}>RITA synchronisation</Text>
        </View>
        <View style={[s.headerIcon, { backgroundColor: '#0e749018' }]}>
          <RefreshCw size={18} color="#0e7490" />
        </View>
      </View>

      {loading
        ? <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="large" color={T.primary} />
          </View>
        : <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>

          {/* Connection status banner */}
          <View style={[s.banner, {
            backgroundColor: status?.connected ? `${TZ.green}15` : '#dc262615',
            borderColor:     status?.connected ? `${TZ.green}40` : '#dc262640',
          }]}>
            {status?.connected
              ? <Wifi    size={18} color={TZ.green}  />
              : <WifiOff size={18} color="#dc2626" />}
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={[s.bannerTitle, { color: status?.connected ? TZ.green : '#dc2626' }]}>
                {status?.connected ? 'Connected to RITA' : 'RITA Unreachable'}
              </Text>
              <Text style={[s.bannerSub, { color: T.textSub }]}>
                {status?.connected
                  ? 'Real-time sync is active'
                  : 'Records queued for next connection'}
              </Text>
            </View>
          </View>

          {/* Sync stats */}
          <View style={[s.statsCard, { backgroundColor: T.card, borderColor: T.border }]}>
            <StatusRow icon={<Baby  size={14} color={TZ.green}  />} label="Unsynced births"
              value={String(status?.unsyncedBirths ?? 0)}
              valueColor={status?.unsyncedBirths ? '#f97316' : T.success} />
            <StatusRow icon={<Cross size={14} color="#dc2626" />} label="Unsynced deaths"
              value={String(status?.unsyncedDeaths ?? 0)}
              valueColor={status?.unsyncedDeaths ? '#f97316' : T.success} />
            <StatusRow icon={<CheckCircle size={14} color={T.success} />} label="Total records synced"
              value={String(status?.totalSynced ?? 0)} />
            <StatusRow icon={<Clock size={14} color={T.primary} />} label="Last sync"
              value={status?.lastSyncAt ? new Date(status.lastSyncAt).toLocaleString('en-TZ') : 'Never'} />
            <View style={[s.statusRow, { borderBottomWidth: 0 }]}>
              <View style={[s.statusIcon, { backgroundColor: T.card2 }]}>
                <Shield size={14} color={status?.ritaEndpointOk ? T.success : T.danger} />
              </View>
              <Text style={[s.statusLabel, { color: T.textSub }]}>RITA endpoint</Text>
              <Text style={[s.statusValue, { color: status?.ritaEndpointOk ? T.success : T.danger }]}>
                {status?.ritaEndpointOk ? 'OK' : 'Unreachable'}
              </Text>
            </View>
          </View>

          {/* Sync trigger */}
          <TouchableOpacity
            style={[s.syncBtn, {
              backgroundColor: syncing ? T.card : '#0e7490',
              borderColor: '#0e7490',
              opacity: (!status?.connected || syncing) ? 0.6 : 1,
            }]}
            onPress={triggerSync}
            disabled={syncing || !status?.connected}
          >
            <Animated.View style={{ transform: [{ rotate: spin }] }}>
              <RefreshCw size={18} color={syncing ? '#0e7490' : '#fff'} />
            </Animated.View>
            <Text style={[s.syncBtnText, { color: syncing ? '#0e7490' : '#fff' }]}>
              {syncing ? 'Syncing with RITA…' : 'Sync Now'}
            </Text>
          </TouchableOpacity>

          {!status?.connected && (
            <Text style={[s.offlineNote, { color: T.textDim }]}>
              Connect to a network to manually trigger synchronisation. Records are queued locally and will sync automatically on reconnection.
            </Text>
          )}

          <View style={[s.secNote, { backgroundColor: T.card2, borderColor: T.border }]}>
            <Shield size={12} color={T.textDim} />
            <Text style={[s.secNoteText, { color: T.textDim }]}>
              All data transmitted over TLS 1.3. Tokens are SHA-256 hashed before storage. Sync events are recorded in the audit log.
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
  banner:       { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 14, padding: 16 },
  bannerTitle:  { fontSize: 14, fontWeight: '800' },
  bannerSub:    { fontSize: 11, marginTop: 3 },
  statsCard:    { borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  statusRow:    { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 16, borderBottomWidth: 1 },
  statusIcon:   { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  statusLabel:  { flex: 1, fontSize: 13 },
  statusValue:  { fontSize: 14, fontWeight: '800' },
  syncBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderWidth: 1.5, borderRadius: 14, paddingVertical: 16 },
  syncBtnText:  { fontSize: 15, fontWeight: '800' },
  offlineNote:  { fontSize: 12, textAlign: 'center', lineHeight: 18 },
  secNote:      { flexDirection: 'row', gap: 8, borderWidth: 1, borderRadius: 12, padding: 12 },
  secNoteText:  { flex: 1, fontSize: 10, lineHeight: 16 },
})
