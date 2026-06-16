/**
 * SyncDataScreen.tsx — System Connection & Sync  v3.0 PRODUCTION
 * Uses localDb + syncService for all real data.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert, Animated } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect } from '@react-navigation/native'
import { ArrowLeft, RefreshCw, Wifi, WifiOff, Baby, Cross, Clock, Shield, Database, WifiLow } from 'lucide-react-native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'

// localDb imported when needed
import { triggerSync, getSyncStatus, checkConnQuality, ConnQuality } from '../../services/syncService'
import { useTheme, TZ } from '../../context/ThemeContext'
import AsyncStorage from '@react-native-async-storage/async-storage'

type RootStack = { HospitalHome: undefined; SyncData: undefined }
type Props = { navigation: NativeStackNavigationProp<RootStack,'SyncData'> }

const CONN_COLORS: Record<ConnQuality,string> = { Good:'#4ade80', Fair:'#fbbf24', Offline:'#f87171' }

export default function SyncDataScreen({ navigation }: Props) {
  const { theme: T } = useTheme()
  const [loading,  setLoading]  = useState(true)
  const [syncing,  setSyncing]  = useState(false)
  const [quality,  setQuality]  = useState<ConnQuality>('Offline')
  const [syncData, setSyncData] = useState({ unsyncedBirths:0, unsyncedDeaths:0, lastSyncAt:null as string|null })
  const spinAnim = useRef(new Animated.Value(0)).current
  const spinLoop = useRef<Animated.CompositeAnimation|null>(null)

  const loadStatus = useCallback(async () => {
    const [q, s] = await Promise.all([checkConnQuality(), getSyncStatus()])
    setQuality(q); setSyncData(s); setLoading(false)
  }, [])

  useFocusEffect(useCallback(() => { loadStatus(); const t = setInterval(loadStatus, 10_000); return () => clearInterval(t) }, [loadStatus]))

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (syncing) { spinLoop.current = Animated.loop(Animated.timing(spinAnim,{toValue:1,duration:900,useNativeDriver:true})); spinLoop.current.start() }
    else { spinLoop.current?.stop(); spinAnim.setValue(0) }
  }, [syncing])

  const doSync = async () => {
    setSyncing(true)
    const result = await triggerSync()
    setSyncing(false)
    await loadStatus()
    if (result.offline) Alert.alert('Offline', 'Device is offline. Records queued for next connection.')
    else if (result.synced > 0) Alert.alert('Sync Complete', `${result.synced} records pushed to Central Database.`)
    else if (result.failed > 0) Alert.alert('Partial Sync', `${result.failed} records failed. Will retry automatically.`)
    else Alert.alert('Already Synced', 'All records are up to date.')
  }

  const spin = spinAnim.interpolate({ inputRange:[0,1], outputRange:['0deg','360deg'] })
  const color = CONN_COLORS[quality]
  const QIcon = quality==='Good' ? Wifi : quality==='Fair' ? WifiLow : WifiOff

  const Row = ({ icon, label, value, vc }: { icon:React.ReactNode; label:string; value:string; vc?:string }) => (
    <View style={[ss.row, { borderBottomColor:T.border }]}>
      <View style={[ss.rowIcon, { backgroundColor:T.card2 }]}>{icon}</View>
      <Text style={[ss.rowLabel, { color:T.textSub }]}>{label}</Text>
      <Text style={[ss.rowVal, { color:vc??T.text }]}>{value}</Text>
    </View>
  )

  return (
    <SafeAreaView style={{ flex:1, backgroundColor:T.bg }} edges={['top']}>
      <View style={[ss.header, { backgroundColor:T.card, borderBottomColor:T.border }]}>
        <TouchableOpacity onPress={()=>navigation.goBack()} style={ss.backBtn}><ArrowLeft size={20} color={T.text} /></TouchableOpacity>
        <View style={{ flex:1, alignItems:'center' }}>
          <Text style={[ss.headerTitle, { color:T.text }]}>System Connection</Text>
          <Text style={[ss.headerSub, { color:T.textSub }]}>Central Database synchronisation</Text>
        </View>
        <View style={[ss.backBtn, { backgroundColor:'#0e749018' }]}><Database size={18} color="#0e7490" /></View>
      </View>
      {loading ? <View style={{ flex:1, alignItems:'center', justifyContent:'center' }}><ActivityIndicator size="large" color={T.primary} /></View>
      : <ScrollView contentContainerStyle={{ padding:16, paddingBottom:40, gap:14 }} showsVerticalScrollIndicator={false}>
          {/* Banner */}
          <View style={[ss.banner, { backgroundColor:`${color}15`, borderColor:`${color}40` }]}>
            <QIcon size={18} color={color} />
            <View style={{ flex:1, marginLeft:12 }}>
              <Text style={[ss.bannerTitle, { color }]}>{quality==='Good'?'Connected — Good Signal':quality==='Fair'?'Connected — Fair Signal':'Offline — No Connection'}</Text>
              <Text style={[ss.bannerSub, { color:T.textSub }]}>{quality!=='Offline'?'Real-time sync with Central Database is active':'All records safely queued locally. Will sync automatically on reconnection.'}</Text>
            </View>
          </View>
          {/* Stats */}
          <View style={[ss.statsCard, { backgroundColor:T.card, borderColor:T.border }]}>
            <Row icon={<Baby  size={14} color={TZ.green}  />} label="Unsynced births" value={String(syncData.unsyncedBirths)} vc={syncData.unsyncedBirths?'#f97316':T.success} />
            <Row icon={<Cross size={14} color="#dc2626" />} label="Unsynced deaths" value={String(syncData.unsyncedDeaths)} vc={syncData.unsyncedDeaths?'#f97316':T.success} />
            <Row icon={<Clock size={14} color={T.primary} />} label="Last sync" value={syncData.lastSyncAt?new Date(syncData.lastSyncAt).toLocaleString('en-TZ',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'Never'} />
            <View style={[ss.row, { borderBottomWidth:0 }]}>
              <View style={[ss.rowIcon, { backgroundColor:T.card2 }]}><Shield size={14} color={quality!=='Offline'?T.success:T.danger} /></View>
              <Text style={[ss.rowLabel, { color:T.textSub }]}>System endpoint</Text>
              <View style={{ flexDirection:'row', alignItems:'center', gap:5 }}>
                <View style={{ width:7, height:7, borderRadius:3.5, backgroundColor:quality!=='Offline'?T.success:T.danger }} />
                <Text style={[ss.rowVal, { color:quality!=='Offline'?T.success:T.danger }]}>{quality!=='Offline'?'Reachable':'Unreachable'}</Text>
              </View>
            </View>
          </View>
          {/* Quality badges */}
          <View style={[ss.qualCard, { backgroundColor:T.card, borderColor:T.border }]}>
            <Text style={[ss.qualTitle, { color:T.textSub }]}>Connection Quality</Text>
            <View style={{ flexDirection:'row', gap:8 }}>
              {(['Good','Fair','Offline'] as ConnQuality[]).map(q=>(
                <View key={q} style={[ss.qualBadge, { backgroundColor:q===quality?`${CONN_COLORS[q]}18`:T.card2, borderColor:q===quality?CONN_COLORS[q]:T.border, borderWidth:q===quality?1.5:1 }]}>
                  <View style={{ width:8, height:8, borderRadius:4, backgroundColor:CONN_COLORS[q] }} />
                  <Text style={{ fontSize:12, fontWeight:q===quality?'800':'500', color:q===quality?CONN_COLORS[q]:T.textDim }}>{q}</Text>
                </View>
              ))}
            </View>
          </View>
          {/* Sync button */}
          <TouchableOpacity style={[ss.syncBtn, { backgroundColor:syncing?T.card:'#0e7490', borderColor:'#0e7490', opacity:syncing?0.7:1 }]} onPress={doSync} disabled={syncing} activeOpacity={0.85}>
            <Animated.View style={{ transform:[{rotate:spin}] }}><RefreshCw size={18} color={syncing?'#0e7490':'#fff'} /></Animated.View>
            <Text style={[ss.syncBtnTxt, { color:syncing?'#0e7490':'#fff' }]}>{syncing?'Synchronising…':'Sync Now'}</Text>
          </TouchableOpacity>
          <View style={[ss.secNote, { backgroundColor:T.card2, borderColor:T.border }]}>
            <Shield size={12} color={T.textDim} />
            <Text style={{ flex:1, fontSize:10, color:T.textDim, lineHeight:16 }}>All data transmitted over TLS 1.3. Offline records AES-encrypted on-device. Sync events timestamped in audit log.</Text>
          </View>
        </ScrollView>}
    </SafeAreaView>
  )
}

const ss = StyleSheet.create({
  header:      { flexDirection:'row', alignItems:'center', paddingHorizontal:16, paddingVertical:12, borderBottomWidth:1 },
  backBtn:     { width:36, height:36, borderRadius:10, alignItems:'center', justifyContent:'center' },
  headerTitle: { fontSize:15, fontWeight:'800' },
  headerSub:   { fontSize:11, marginTop:2 },
  banner:      { flexDirection:'row', alignItems:'flex-start', borderWidth:1, borderRadius:14, padding:16 },
  bannerTitle: { fontSize:14, fontWeight:'800' },
  bannerSub:   { fontSize:11, marginTop:4, lineHeight:17 },
  statsCard:   { borderWidth:1, borderRadius:14, overflow:'hidden' },
  row:         { flexDirection:'row', alignItems:'center', gap:12, paddingVertical:13, paddingHorizontal:16, borderBottomWidth:1 },
  rowIcon:     { width:28, height:28, borderRadius:8, alignItems:'center', justifyContent:'center' },
  rowLabel:    { flex:1, fontSize:13 },
  rowVal:      { fontSize:14, fontWeight:'800' },
  qualCard:    { borderWidth:1, borderRadius:14, padding:16 },
  qualTitle:   { fontSize:12, fontWeight:'600', marginBottom:12 },
  qualBadge:   { flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:6, borderRadius:10, paddingVertical:10 },
  syncBtn:     { flexDirection:'row', alignItems:'center', justifyContent:'center', gap:10, borderWidth:1.5, borderRadius:14, paddingVertical:16 },
  syncBtnTxt:  { fontSize:15, fontWeight:'800' },
  secNote:     { flexDirection:'row', gap:8, borderWidth:1, borderRadius:12, padding:14 },
})