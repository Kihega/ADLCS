/**
 * VillageReportsScreen.tsx  v1.0
 * Aggregated statistics and downloadable reports for village officers.
 */
import React, { useState, useCallback } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Share,
} from 'react-native'
import { SafeAreaView }   from 'react-native-safe-area-context'
import { useFocusEffect } from '@react-navigation/native'
import {
  ArrowLeft, BarChart3, Baby, Cross, Navigation,
  Users, Download, RefreshCw, Wifi, WifiOff,
} from 'lucide-react-native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useTheme, TZ } from '../../context/ThemeContext'
import { getAllBirths, getAllDeaths } from '../../services/localDb'
import { apiGet, isOnline } from '../../services/syncService'

type VS = { VillageHome:undefined; VillageReports:undefined }
type Props = { navigation: NativeStackNavigationProp<VS,'VillageReports'> }

interface VillageStats {
  totalCitizens: number
  monthBirths:   number
  monthDeaths:   number
  totalBirths:   number
  totalDeaths:   number
  pendingSync:   number
  villageName:   string
  officerName:   string
}

export default function VillageReportsScreen({ navigation }: Props) {
  const { theme:T } = useTheme()
  const [stats,    setStats]   = useState<VillageStats|null>(null)
  const [loading,  setLoading] = useState(true)
  const [online,   setOnline]  = useState(false)

  const loadStats = useCallback(async () => {
    setLoading(true)
    setOnline(isOnline())

    // Local counts always available
    const [births, deaths] = await Promise.all([getAllBirths(), getAllDeaths()])
    const now       = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    const monthBirths = births.filter(b => new Date(b.registeredAt) >= monthStart).length
    const monthDeaths = deaths.filter(d => new Date(d.registeredAt) >= monthStart).length
    const pendingSync = births.filter(b => b.synced === 0).length + deaths.filter(d => d.synced === 0).length

    let totalCitizens = 0
    let villageName   = 'My Village'
    let officerName   = 'Village Officer'

    // Try remote if online
    if (isOnline()) {
      try {
        const json = await apiGet('/village/dashboard')
        if (json.success) {
          totalCitizens = json.data.totalCitizens ?? 0
          villageName   = json.data.villageName   ?? villageName
          officerName   = json.data.officerName   ?? officerName
        }
      } catch {}
    }

    // Cache officer name
    const cached = await AsyncStorage.getItem('adlcs_officer_name')
    if (cached) officerName = cached

    setStats({
      totalCitizens, monthBirths, monthDeaths,
      totalBirths: births.length, totalDeaths: deaths.length,
      pendingSync, villageName, officerName,
    })
    setLoading(false)
  }, [])

  useFocusEffect(useCallback(() => { loadStats() }, [loadStats]))

  const shareReport = async (period: string) => {
    if (!stats) return
    const lines = [
      `ADLCS — ${period.toUpperCase()} VILLAGE REPORT`,
      `Village:  ${stats.villageName}`,
      `Officer:  ${stats.officerName}`,
      `Generated:${new Date().toLocaleString('en-TZ')}`,
      `──────────────────────────`,
      `Citizens:        ${stats.totalCitizens}`,
      `Births (month):  ${stats.monthBirths}`,
      `Deaths (month):  ${stats.monthDeaths}`,
      `Total births:    ${stats.totalBirths}`,
      `Total deaths:    ${stats.totalDeaths}`,
      `Pending sync:    ${stats.pendingSync}`,
      `──────────────────────────`,
      `NBS Tanzania · Civil Registration Report`,
    ].join('\n')
    await Share.share({ title:`Village ${period} Report`, message:lines })
  }

  const StatRow = ({ icon, label, value, color }: {
    icon: React.ReactNode; label: string; value: number; color: string
  }) => (
    <View style={[vr.statRow, { borderBottomColor:T.border }]}>
      <View style={[vr.statRowIcon, { backgroundColor:`${color}18` }]}>{icon}</View>
      <Text style={[vr.statRowLabel, { color:T.textSub }]}>{label}</Text>
      <Text style={[vr.statRowValue, { color }]}>{value}</Text>
    </View>
  )

  return (
    <SafeAreaView style={{ flex:1, backgroundColor:T.bg }} edges={['top']}>
      {/* Header */}
      <View style={[vr.header, { backgroundColor:T.card, borderBottomColor:T.border }]}>
        <TouchableOpacity onPress={()=>navigation.goBack()} style={vr.backBtn}>
          <ArrowLeft size={20} color={T.text}/>
        </TouchableOpacity>
        <View style={{ flex:1, alignItems:'center' }}>
          <Text style={[vr.headerTitle, { color:T.text }]}>Village Reports</Text>
          <Text style={[vr.headerSub, { color:T.textSub }]}>{stats?.villageName ?? '…'}</Text>
        </View>
        <TouchableOpacity style={vr.backBtn} onPress={loadStats}>
          <RefreshCw size={16} color={T.textSub}/>
        </TouchableOpacity>
      </View>

      {/* Connection indicator */}
      <View style={[vr.connBar, {
        backgroundColor: online ? `${TZ.green}15` : '#f9731615',
        borderBottomColor: online ? `${TZ.green}30` : '#f9731630',
      }]}>
        {online ? <Wifi size={12} color={TZ.green}/> : <WifiOff size={12} color="#f97316"/>}
        <Text style={{ fontSize:11, color: online ? TZ.green : '#f97316' }}>
          {online ? 'Connected — data from Central Database' : 'Offline — showing local records'}
        </Text>
      </View>

      {loading
        ? <View style={{ flex:1, alignItems:'center', justifyContent:'center' }}>
            <ActivityIndicator size="large" color={T.primary}/>
          </View>
        : <ScrollView contentContainerStyle={vr.body} showsVerticalScrollIndicator={false}>

          {/* Summary cards */}
          <View style={{ flexDirection:'row', gap:10, marginBottom:8 }}>
            {[
              { icon:<Users   size={20} color={TZ.blue}  />, label:'Citizens',  value:stats!.totalCitizens, color:TZ.blue  },
              { icon:<Baby    size={20} color={TZ.green} />, label:'Births',    value:stats!.totalBirths,   color:TZ.green },
              { icon:<Cross   size={20} color="#dc2626" />, label:'Deaths',    value:stats!.totalDeaths,   color:'#dc2626'},
            ].map(s => (
              <View key={s.label} style={[vr.summaryCard, { backgroundColor:T.card, borderColor:T.border }]}>
                <View style={[vr.summaryIcon, { backgroundColor:`${s.color}18` }]}>{s.icon}</View>
                <Text style={[vr.summaryValue, { color:s.color }]}>{s.value}</Text>
                <Text style={[vr.summaryLabel, { color:T.textSub }]}>{s.label}</Text>
              </View>
            ))}
          </View>

          {/* Detailed stats */}
          <Text style={[vr.sectionTitle, { color:T.text }]}>This Month</Text>
          <View style={[vr.statsCard, { backgroundColor:T.card, borderColor:T.border }]}>
            <StatRow icon={<Baby       size={14} color={TZ.green} />} label="Births registered"  value={stats!.monthBirths}   color={TZ.green} />
            <StatRow icon={<Cross      size={14} color="#dc2626"  />} label="Deaths recorded"     value={stats!.monthDeaths}   color="#dc2626"  />
            <StatRow icon={<Navigation size={14} color="#f97316"  />} label="Pending sync"        value={stats!.pendingSync}   color="#f97316"  />
          </View>

          {/* All time */}
          <Text style={[vr.sectionTitle, { color:T.text }]}>All Time</Text>
          <View style={[vr.statsCard, { backgroundColor:T.card, borderColor:T.border }]}>
            <StatRow icon={<Users  size={14} color={TZ.blue}  />} label="Total citizens"      value={stats!.totalCitizens} color={TZ.blue}  />
            <StatRow icon={<Baby   size={14} color={TZ.green} />} label="Total births"        value={stats!.totalBirths}   color={TZ.green} />
            <StatRow icon={<Cross  size={14} color="#dc2626"  />} label="Total deaths"        value={stats!.totalDeaths}   color="#dc2626"  />
          </View>

          {/* Download buttons */}
          <Text style={[vr.sectionTitle, { color:T.text }]}>Download Report</Text>
          <View style={[vr.downloadCard, { backgroundColor:T.card, borderColor:T.border }]}>
            <View style={{ flexDirection:'row', flexWrap:'wrap', gap:10 }}>
              {(['Daily','Weekly','Monthly','Annual'] as const).map(p => (
                <TouchableOpacity key={p}
                  style={[vr.dlBtn, { backgroundColor:`${TZ.green}18`, borderColor:`${TZ.green}40` }]}
                  onPress={() => shareReport(p)}
                >
                  <Download size={13} color={TZ.green}/>
                  <Text style={{ fontSize:12, fontWeight:'700', color:TZ.green }}>{p} Report</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={{ fontSize:10, color:T.textDim, marginTop:10, lineHeight:15 }}>
              Reports are shared as formatted text. PDF export available from the NBS Web Admin Panel.
            </Text>
          </View>
        </ScrollView>
      }
    </SafeAreaView>
  )
}

const vr = StyleSheet.create({
  header:       { flexDirection:'row', alignItems:'center', paddingHorizontal:16, paddingVertical:12, borderBottomWidth:1 },
  backBtn:      { width:36, height:36, borderRadius:10, alignItems:'center', justifyContent:'center' },
  headerTitle:  { fontSize:15, fontWeight:'800' },
  headerSub:    { fontSize:11, marginTop:2 },
  connBar:      { flexDirection:'row', alignItems:'center', gap:8, paddingHorizontal:14, paddingVertical:7, borderBottomWidth:1 },
  body:         { padding:16, paddingBottom:40 },
  summaryCard:  { flex:1, borderRadius:14, borderWidth:1, padding:12, alignItems:'center', gap:6 },
  summaryIcon:  { width:42, height:42, borderRadius:21, alignItems:'center', justifyContent:'center' },
  summaryValue: { fontSize:22, fontWeight:'900' },
  summaryLabel: { fontSize:10, fontWeight:'600' },
  sectionTitle: { fontSize:14, fontWeight:'800', marginTop:16, marginBottom:10 },
  statsCard:    { borderWidth:1, borderRadius:14, overflow:'hidden', marginBottom:4 },
  statRow:      { flexDirection:'row', alignItems:'center', gap:12, paddingVertical:13, paddingHorizontal:16, borderBottomWidth:1 },
  statRowIcon:  { width:30, height:30, borderRadius:8, alignItems:'center', justifyContent:'center' },
  statRowLabel: { flex:1, fontSize:13 },
  statRowValue: { fontSize:18, fontWeight:'900' },
  downloadCard: { borderWidth:1, borderRadius:14, padding:16 },
  dlBtn:        { flexDirection:'row', alignItems:'center', gap:6, borderWidth:1, borderRadius:10, paddingHorizontal:14, paddingVertical:10 },
})
