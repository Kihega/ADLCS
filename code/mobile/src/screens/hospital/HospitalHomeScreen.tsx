/**
 * HospitalHomeScreen.tsx  v5.0  PRODUCTION
 *
 * Data strategy (offline-first):
 *   1. Load stats instantly from local SQLite DB
 *   2. In background, fetch from backend — merge results if better
 *   3. Stats poll every 60 s for real-time updates
 *
 * Sidebar menu: no setTimeout bug, uses navigation prop directly.
 * Connection: Good / Fair / Offline from backend ping.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator,
  Image, ImageBackground, RefreshControl,
  Animated, Modal, TouchableWithoutFeedback, Share, Dimensions,
} from 'react-native'
import AsyncStorage        from '@react-native-async-storage/async-storage'
import { SafeAreaView }    from 'react-native-safe-area-context'
import { LinearGradient }  from 'expo-linear-gradient'
import {
  Baby, Cross, FileText, Clock,
  Sun, Moon, Bell, LogOut, MapPin,
  RefreshCw, ChevronRight, Shield, Building2,
  Wifi, WifiOff, AlertTriangle, BarChart3,
  User, Lock, Menu, X, Download, WifiLow,
  Stethoscope,
} from 'lucide-react-native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'

import { getLocalStats, getCachedOfficerData, cacheOfficerData } from '../../services/localDb'
import { fetchRemoteDashboard, fetchRemoteActivity, checkConnQuality, triggerSync, ConnQuality } from '../../services/syncService'
import { useTheme, TZ } from '../../context/ThemeContext'
import { useGeofence }  from '../../context/GeofenceContext'

type RootStack = {
  Splash: undefined; Login: undefined; VillageHome: undefined; HospitalHome: undefined
  RegisterBirth: undefined; RecordDeath: undefined; IssueCertificate: undefined
  ViewRecords: undefined; PendingCases: undefined; SyncData: undefined
}
type Props = { navigation: NativeStackNavigationProp<RootStack, 'HospitalHome'> }

const H = { primary: '#0891b2', primaryL: '#22d3ee', orange: '#f97316' }
const W = Dimensions.get('window').width
const CONN_COLORS: Record<ConnQuality, string> = { Good: '#4ade80', Fair: '#fbbf24', Offline: '#f87171' }

// ─── Sidebar ──────────────────────────────────────────────────────────────────
function Sidebar({ open, onClose, officerName, facilityName, facilityType, facilityRegion, facilityDistrict, onLogout, loggingOut, navigation }: {
  open: boolean; onClose: () => void
  officerName: string; facilityName: string; facilityType: string
  facilityRegion: string; facilityDistrict: string
  onLogout: () => void; loggingOut: boolean
  navigation: Props['navigation']
}) {
  const { theme: T } = useTheme()
  const tx = useRef(new Animated.Value(-W)).current
  const bg = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.parallel([
      Animated.timing(tx, { toValue: open ? 0 : -W, duration: 250, useNativeDriver: true }),
      Animated.timing(bg, { toValue: open ? 1 : 0,  duration: 250, useNativeDriver: true }),
    ]).start()
  }, [open])

  const initials = officerName.split(' ').filter(Boolean).slice(0, 2).map(n => n[0]).join('').toUpperCase() || 'HO'

  const items = [
    {
      section: 'FACILITY',
      items: [
        { icon: <Building2 size={15} color={H.primaryL} />, label: 'View Facility Details', onPress: () => {
          onClose()
          setTimeout(() => Alert.alert('Facility Details',
            `${facilityName}\n${facilityType.replace(/_/g,' ')}\n${facilityDistrict}, ${facilityRegion}`
          ), 200)
        }},
      ]
    },
    {
      section: 'ACCOUNT',
      items: [
        { icon: <User size={15} color={H.primaryL} />, label: 'View Your Profile', onPress: () => {
          onClose()
          setTimeout(() => Alert.alert('Your Profile', `Name: ${officerName}\nFacility: ${facilityName}\n${facilityDistrict}, ${facilityRegion}`), 200)
        }},
        { icon: <Lock size={15} color={H.primaryL} />, label: 'Change Password', onPress: () => {
          onClose()
          setTimeout(() => Alert.alert('Change Password', 'Password change — available on the web admin panel at this time.'), 200)
        }},
      ]
    },
    {
      section: 'SESSION',
      items: [
        { icon: <LogOut size={15} color="#f87171" />, label: loggingOut ? 'Signing out…' : 'Sign Out', danger: true, onPress: () => {
          onClose()
          setTimeout(onLogout, 200)
        }},
      ]
    },
  ]

  if (!open && (tx as any)._value === -W) return null

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <TouchableWithoutFeedback onPress={onClose}>
        <Animated.View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.55)', opacity: bg }]} />
      </TouchableWithoutFeedback>
      <Animated.View style={[s.drawer, { backgroundColor: T.card, transform: [{ translateX: tx }] }]}>
        <LinearGradient colors={['#02143c', '#083250']} style={s.drawerHeader}>
          <View style={{ flexDirection: 'row', height: 4 }}>
            <View style={{ flex: 3, backgroundColor: TZ.green }} /><View style={{ width: 7, backgroundColor: TZ.yellow }} />
            <View style={{ width: 5, backgroundColor: TZ.black }} /><View style={{ width: 7, backgroundColor: TZ.yellow }} />
            <View style={{ flex: 3, backgroundColor: TZ.blue }} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', padding: 16, gap: 12 }}>
            <View style={s.drawerAvatar}>
              <Text style={s.drawerAvatarText}>{initials}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.drawerName}>{officerName}</Text>
              <Text style={s.drawerFac}>{facilityName}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: H.primaryL }} />
                <Text style={[s.drawerBadge, { color: H.primaryL }]}>HEALTH FACILITY OFFICER</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
              <X size={18} color="rgba(255,255,255,0.70)" />
            </TouchableOpacity>
          </View>
        </LinearGradient>

        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
          {items.map(section => (
            <View key={section.section} style={[s.drawerSection, { borderBottomColor: T.border }]}>
              <Text style={[s.drawerSectionLabel, { color: T.textDim }]}>{section.section}</Text>
              {section.items.map(item => (
                <TouchableOpacity
                  key={item.label}
                  style={[s.drawerItem, { borderBottomColor: T.border }]}
                  onPress={item.onPress}
                  activeOpacity={0.7}
                >
                  <View style={[s.drawerItemIcon, { backgroundColor: (item as any).danger ? 'rgba(239,68,68,0.12)' : `${H.primary}14` }]}>
                    {item.icon}
                  </View>
                  <Text style={[s.drawerItemLabel, { color: (item as any).danger ? '#f87171' : T.text }]}>{item.label}</Text>
                  <ChevronRight size={14} color={(item as any).danger ? '#f87171' : T.textDim} />
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </ScrollView>
        <View style={[s.drawerFooter, { borderTopColor: T.border }]}>
          <Text style={[s.drawerFooterText, { color: T.textDim }]}>ADLCS · NBS Tanzania · © 2026</Text>
        </View>
      </Animated.View>
    </Modal>
  )
}

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ icon, value, label, color, sub }: { icon: React.ReactNode; value: number; label: string; color: string; sub?: string }) {
  const { theme: T } = useTheme()
  return (
    <View style={[s.statCard, { backgroundColor: T.card, borderColor: T.border }]}>
      <View style={[s.statIcon, { backgroundColor: `${color}18` }]}>{icon}</View>
      <Text style={[s.statValue, { color }]}>{value}</Text>
      <Text style={[s.statLabel, { color: T.textSub }]}>{label}</Text>
      {sub && <Text style={[s.statSub, { color: T.textDim }]}>{sub}</Text>}
    </View>
  )
}

// ─── Action card ──────────────────────────────────────────────────────────────
function ActionCard({ icon, label, sub, bg, onPress }: { icon: React.ReactNode; label: string; sub: string; bg: string; onPress: () => void }) {
  const { theme: T } = useTheme()
  return (
    <TouchableOpacity style={[s.actionCard, { backgroundColor: T.card, borderColor: T.border }]} onPress={onPress} activeOpacity={0.75}>
      <View style={[s.actionIcon, { backgroundColor: bg }]}>{icon}</View>
      <Text style={[s.actionLabel, { color: T.text }]}>{label}</Text>
      <Text style={[s.actionSub,   { color: T.textSub }]}>{sub}</Text>
    </TouchableOpacity>
  )
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function HospitalHomeScreen({ navigation }: Props) {
  const { theme: T, isDark, toggleTheme } = useTheme()
  const { inZone, distanceKm, setGeofenceConfig } = useGeofence()

  const [loading,     setLoading]    = useState(true)
  const [refreshing,  setRefreshing] = useState(false)
  const [loggingOut,  setLoggingOut] = useState(false)
  const [sidebarOpen, setSidebarOpen]= useState(false)
  const [unread,      setUnread]     = useState(0)
  const [connStatus,  setConnStatus] = useState<ConnQuality>('Offline')
  const [activity,    setActivity]   = useState<any[]>([])

  // Dashboard data — start with local DB values
  const [stats, setStats] = useState({ todayBirths:0, todayDeaths:0, monthBirths:0, monthDeaths:0, pendingSync:0, totalBirths:0, totalDeaths:0 })
  const [officer, setOfficer] = useState({ officerName:'Officer', facilityName:'Facility', facilityType:'hospital', facilityGrade:'', facilityRegion:'—', facilityDistrict:'—', facilityGpsLat:'', facilityGpsLng:'', facilityCertIssued:0, facilityDeliveries:0 })

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Load data: local first, then remote ───────────────────────────────────
  const loadData = useCallback(async (silent = false) => {
    const token = await AsyncStorage.getItem('adlcs_access_token')
    if (!token) { navigation.replace('Login'); return }

    // 1. Local DB stats (instant)
    const localStats = await getLocalStats()
    setStats(localStats)
    setUnread(localStats.pendingSync)
    if (!silent) setLoading(false)

    // 2. Cached officer data
    const cached = await getCachedOfficerData()
    if (cached.officerName) setOfficer(prev => ({ ...prev, ...cached as any }))

    // 3. Remote (background, no blocking)
    const [remote, conn, acts] = await Promise.all([
      fetchRemoteDashboard(token),
      checkConnQuality(),
      fetchRemoteActivity(token),
    ])
    setConnStatus(conn)
    if (acts.length > 0) setActivity(acts)

    if (remote) {
      const merged = {
        officerName:      remote.officerName      ?? cached.officerName      ?? 'Officer',
        facilityName:     remote.facilityName     ?? cached.facilityName     ?? 'Facility',
        facilityType:     remote.facilityType     ?? cached.facilityType     ?? 'hospital',
        facilityGrade:    remote.facilityGrade    ?? cached.facilityGrade    ?? '',
        facilityRegion:   remote.facilityRegion   ?? cached.facilityRegion   ?? '—',
        facilityDistrict: remote.facilityDistrict ?? cached.facilityDistrict ?? '—',
        facilityGpsLat:   String(remote.facilityGpsLat   ?? cached.facilityGpsLat  ?? ''),
        facilityGpsLng:   String(remote.facilityGpsLng   ?? cached.facilityGpsLng  ?? ''),
        facilityCertIssued: Number(remote.facilityCertIssued ?? 0),
        facilityDeliveries: Number(remote.facilityDeliveries ?? 0),
      }
      setOfficer(merged)
      await cacheOfficerData(merged)

      if (remote.facilityGpsLat != null && remote.facilityGpsLng != null) {
        setGeofenceConfig({ gps: { lat: Number(remote.facilityGpsLat), lng: Number(remote.facilityGpsLng) }, role: 'hospital_officer' })
      }
      // Merge remote stats with local (take whichever is higher)
      setStats(prev => ({
        todayBirths: Math.max(prev.todayBirths, remote.todayBirths ?? 0),
        todayDeaths: Math.max(prev.todayDeaths, remote.todayDeaths ?? 0),
        monthBirths: Math.max(prev.monthBirths, remote.monthBirths ?? 0),
        monthDeaths: Math.max(prev.monthDeaths, remote.monthDeaths ?? 0),
        pendingSync: prev.pendingSync,
        totalBirths: Math.max(prev.totalBirths, remote.facilityDeliveries ?? 0),
        totalDeaths: prev.totalDeaths,
      }))
    }

    setRefreshing(false)
  }, [navigation, setGeofenceConfig])

  useEffect(() => {
    loadData()
    pollRef.current = setInterval(() => loadData(true), 60_000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [loadData])

  // ── Logout ────────────────────────────────────────────────────────────────
  const handleLogout = useCallback(() => {
    Alert.alert('Confirm Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: async () => {
        setLoggingOut(true)
        await AsyncStorage.multiRemove(['adlcs_access_token','adlcs_refresh_token','adlcs_role','adlcs_device_activated'])
        navigation.replace('Login')
      }},
    ])
  }, [navigation])

  // ── Report share ──────────────────────────────────────────────────────────
  const downloadReport = async (period: string, type: string) => {
    const lines = [
      `ADLCS TANZANIA — ${period.toUpperCase()} ${type.toUpperCase()} REPORT`,
      `Facility:  ${officer.facilityName}`,
      `Location:  ${officer.facilityRegion}, ${officer.facilityDistrict}`,
      `Officer:   ${officer.officerName}`,
      `Generated: ${new Date().toLocaleString('en-TZ')}`,
      `──────────────────────────────`,
      type === 'births' ? `Births today:   ${stats.todayBirths}` : `Deaths today:   ${stats.todayDeaths}`,
      `Month births:   ${stats.monthBirths}`,
      `Month deaths:   ${stats.monthDeaths}`,
      `Pending sync:   ${stats.pendingSync}`,
      `──────────────────────────────`,
      `NBS Central Database — Authorised Officer Report`,
    ].join('\n')
    await Share.share({ title: `ADLCS ${period} ${type}`, message: lines })
  }

  const ConnIcon = connStatus === 'Good' ? Wifi : connStatus === 'Fair' ? WifiLow : WifiOff
  const initials = officer.officerName.split(' ').filter(Boolean).slice(0,2).map(n=>n[0]).join('').toUpperCase() || 'HO'

  type ActionDef = { id: string; icon: React.ReactNode; label: string; sub: string; bg: string }
  const actions: ActionDef[] = [
    { id:'birth',   icon:<Baby        size={20} color="#fff"/>, label:'Register',  sub:'Birth',       bg:TZ.green  },
    { id:'death',   icon:<Cross       size={20} color="#fff"/>, label:'Record',    sub:'Death',       bg:'#dc2626' },
    { id:'cert',    icon:<FileText    size={20} color="#fff"/>, label:'Issue',     sub:'Certificate', bg:H.primary },
    { id:'view',    icon:<Stethoscope size={20} color="#fff"/>, label:'View',      sub:'Records',     bg:'#7c3aed' },
    { id:'pending', icon:<Clock       size={20} color="#fff"/>, label:'Pending',   sub:'Cases',       bg:H.orange  },
    { id:'sync',    icon:<RefreshCw   size={20} color="#fff"/>, label:'Sync',      sub:'Data',        bg:'#0e7490' },
  ]

  const navigate = (id: string) => {
    const map: Record<string, keyof RootStack> = {
      birth:'RegisterBirth', death:'RecordDeath', cert:'IssueCertificate',
      view:'ViewRecords', pending:'PendingCases', sync:'SyncData',
    }
    if (map[id]) navigation.navigate(map[id])
  }

  if (loading) {
    return (
      <View style={{ flex:1, alignItems:'center', justifyContent:'center', backgroundColor:T.bg }}>
        <ActivityIndicator size="large" color={T.primary} />
        <Text style={{ color:T.textSub, marginTop:12, fontSize:12 }}>Loading dashboard…</Text>
      </View>
    )
  }

  return (
    <SafeAreaView style={{ flex:1, backgroundColor:T.bg }} edges={['top']}>
      <Sidebar
        open={sidebarOpen} onClose={()=>setSidebarOpen(false)}
        officerName={officer.officerName} facilityName={officer.facilityName}
        facilityType={officer.facilityType} facilityRegion={officer.facilityRegion}
        facilityDistrict={officer.facilityDistrict}
        onLogout={handleLogout} loggingOut={loggingOut} navigation={navigation}
      />

      {/* ── HEADER ────────────────────────────────────────────────────────── */}
      <ImageBackground source={require('../../../public/assets/flag.jpg')} style={{ overflow:'hidden' }} blurRadius={2} resizeMode="cover">
        <LinearGradient colors={isDark?['rgba(2,20,60,0.70)','rgba(8,50,80,0.65)']:['rgba(0,30,100,0.60)','rgba(4,60,80,0.58)']} style={StyleSheet.absoluteFill} />
        <View style={{ flexDirection:'row', height:5 }}>
          <View style={{ flex:3, backgroundColor:TZ.green }} /><View style={{ width:9, backgroundColor:TZ.yellow }} />
          <View style={{ width:7, backgroundColor:TZ.black }} /><View style={{ width:9, backgroundColor:TZ.yellow }} />
          <View style={{ flex:3, backgroundColor:TZ.blue }} />
        </View>
        <View style={{ flexDirection:'row', alignItems:'center', paddingHorizontal:14, paddingTop:10, paddingBottom:8, gap:10 }}>
          <View style={{ alignItems:'center', width:56 }}>
            <View style={s.logoCircle}><Image source={require('../../../public/assets/longo_nbs.png')} style={{ width:32, height:32 }} resizeMode="contain" /></View>
            <Text style={{ fontSize:8, fontWeight:'800', color:TZ.yellow, letterSpacing:1.5, marginTop:3 }}>NBS</Text>
          </View>
          <View style={{ flex:1, alignItems:'center' }}>
            <Text style={{ fontSize:17, fontWeight:'900', color:'#fff', letterSpacing:2, textTransform:'uppercase' }}>NBS-CENSUS</Text>
            <View style={{ height:2, width:44, backgroundColor:TZ.yellow, borderRadius:1, marginVertical:4 }} />
            <Text style={{ fontSize:9, color:'rgba(255,255,255,0.72)', letterSpacing:1.1, textTransform:'uppercase' }}>Census for Development</Text>
          </View>
          <View style={{ alignItems:'center', width:56 }}>
            <View style={s.coatCircle}><Image source={require('../../../public/assets/court_of_arm.png')} style={{ width:42, height:42 }} resizeMode="contain" /></View>
            <Text style={{ fontSize:7, fontWeight:'700', color:'rgba(255,255,255,0.60)', letterSpacing:1.2, marginTop:3 }}>TANZANIA</Text>
          </View>
        </View>
        {/* Sub-header */}
        <View style={{ flexDirection:'row', alignItems:'center', paddingHorizontal:12, paddingBottom:12, paddingTop:2, gap:8 }}>
          <TouchableOpacity style={s.iconBtn} onPress={()=>setSidebarOpen(true)} hitSlop={{ top:8,bottom:8,left:8,right:8 }}>
            <Menu size={17} color="rgba(255,255,255,0.90)" />
          </TouchableOpacity>
          <View style={{ flex:1 }}>
            <Text style={{ fontSize:11, fontWeight:'800', color:'#fff' }} numberOfLines={1}>{officer.facilityName}</Text>
            <Text style={{ fontSize:9, color:'rgba(255,255,255,0.55)', marginTop:2 }} numberOfLines={1}>
              📍 {officer.facilityRegion}, {officer.facilityDistrict}
            </Text>
          </View>
          <TouchableOpacity style={s.iconBtn} onPress={toggleTheme} hitSlop={{ top:8,bottom:8,left:8,right:8 }}>
            {isDark ? <Sun size={14} color={TZ.yellow} /> : <Moon size={14} color={TZ.yellow} />}
          </TouchableOpacity>
          <TouchableOpacity style={s.iconBtn} onPress={()=>navigation.navigate('PendingCases')}>
            <Bell size={15} color="rgba(255,255,255,0.80)" />
            {unread > 0 && <View style={s.badge}><Text style={{ fontSize:8, fontWeight:'800', color:'#fff' }}>{unread}</Text></View>}
          </TouchableOpacity>
          <View style={s.avatarRing}>
            <View style={[s.avatar, { backgroundColor:H.primaryL }]}>
              <Text style={{ fontSize:11, fontWeight:'900', color:TZ.navy }}>{initials}</Text>
            </View>
          </View>
        </View>
      </ImageBackground>

      {/* ── BODY ──────────────────────────────────────────────────────────── */}
      <ScrollView showsVerticalScrollIndicator={false} style={{ backgroundColor:T.bg }} contentContainerStyle={{ paddingBottom:36 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);loadData()}} tintColor={T.primary} />}>

        {/* Welcome card */}
        <View style={[s.welcomeCard, { backgroundColor:T.card, borderColor:T.border }]}>
          <View style={{ flex:1 }}>
            <Text style={{ fontSize:11, color:T.textSub }}>Welcome back,</Text>
            <Text style={{ fontSize:18, fontWeight:'800', color:T.text, marginTop:2 }}>{officer.officerName}</Text>
            <Text style={{ fontSize:10, color:T.textDim, marginTop:3 }}>{new Date().toLocaleDateString('en-TZ',{ weekday:'long', day:'numeric', month:'long', year:'numeric' })}</Text>
          </View>
          <View style={{ alignItems:'flex-end', gap:6 }}>
            <View style={[s.zoneBadge, { borderColor:inZone?`${H.primary}60`:'rgba(239,68,68,0.38)', backgroundColor:inZone?`${H.primary}18`:'rgba(239,68,68,0.12)' }]}>
              {inZone ? <MapPin size={9} color={H.primaryL} /> : <AlertTriangle size={9} color="#f87171" />}
              <Text style={[s.zoneTxt, { color:inZone?H.primaryL:'#f87171' }]}>
                {inZone ? `✓ In Zone · ${distanceKm!=null?distanceKm.toFixed(2):'0.00'} km` : `⚠ Out of Zone · ${distanceKm!=null?distanceKm.toFixed(2):'—'} km`}
              </Text>
            </View>
            <View style={{ flexDirection:'row', alignItems:'center', gap:4 }}>
              <ConnIcon size={10} color={CONN_COLORS[connStatus]} />
              <Text style={{ fontSize:10, fontWeight:'700', color:CONN_COLORS[connStatus] }}>{connStatus} Mode</Text>
            </View>
          </View>
        </View>

        {/* Stats from local DB */}
        <View style={s.sectionHead}>
          <Text style={[s.sectionTitle, { color:T.text }]}>Today's Statistics</Text>
          <TouchableOpacity onPress={()=>navigation.navigate('ViewRecords')}>
            <Text style={[s.sectionLink, { color:T.primaryL }]}>Full report →</Text>
          </TouchableOpacity>
        </View>
        <View style={{ flexDirection:'row', paddingHorizontal:12, gap:8 }}>
          <StatCard icon={<Baby     size={18} color={TZ.green}  />} value={stats.todayBirths}    label="Births"       color={TZ.green}  sub="Today"  />
          <StatCard icon={<Cross    size={18} color={T.danger}  />} value={stats.todayDeaths}    label="Deaths"       color={T.danger}  sub="Today"  />
          <StatCard icon={<FileText size={18} color={H.primary} />} value={officer.facilityCertIssued} label="Certs"   color={H.primary} sub="Total"  />
          <StatCard icon={<Clock    size={18} color={H.orange}  />} value={stats.pendingSync}    label="Pending"      color={H.orange}  sub="Sync"   />
        </View>

        {/* Quick actions */}
        <View style={s.sectionHead}>
          <Text style={[s.sectionTitle, { color:T.text }]}>Quick Actions</Text>
        </View>
        <View style={{ flexDirection:'row', paddingHorizontal:12, gap:8 }}>
          {actions.slice(0,3).map(a=><ActionCard key={a.id} {...a} onPress={()=>navigate(a.id)} />)}
        </View>
        <View style={{ flexDirection:'row', paddingHorizontal:12, gap:8, marginTop:8 }}>
          {actions.slice(3).map(a=><ActionCard key={a.id} {...a} onPress={()=>navigate(a.id)} />)}
        </View>

        {/* Facility info */}
        <View style={s.sectionHead}>
          <Text style={[s.sectionTitle, { color:T.text }]}>Facility Information</Text>
        </View>
        <View style={[s.facilityCard, { backgroundColor:T.card, borderColor:T.border }]}>
          <LinearGradient colors={[`${H.primary}22`,`${H.primary}08`]} start={{ x:0,y:0 }} end={{ x:1,y:0 }} style={{ flexDirection:'row', alignItems:'center', gap:12, padding:16 }}>
            <View style={[s.facilityIcon, { backgroundColor:`${H.primary}25` }]}><Building2 size={22} color={H.primaryL} /></View>
            <View style={{ flex:1 }}>
              <Text style={[s.facilityName, { color:T.text }]}>{officer.facilityName}</Text>
              <Text style={{ fontSize:11, color:T.textSub, marginBottom:2 }}>{officer.facilityType?.replace(/_/g,' ')} · {officer.facilityGrade}</Text>
              <Text style={{ fontSize:10, color:T.textDim, marginBottom:4 }}>{officer.facilityDistrict}, {officer.facilityRegion}</Text>
              <View style={{ flexDirection:'row', alignItems:'center', gap:4 }}>
                <Shield size={10} color={H.primaryL} />
                <Text style={{ fontSize:10, color:T.textDim }}>Authorised RITA reporting facility</Text>
              </View>
            </View>
          </LinearGradient>
          <View style={[s.facilityStats, { borderTopColor:T.border }]}>
            {[
              { label:'Deliveries',   value:officer.facilityDeliveries, color:TZ.green  },
              { label:'Certs Issued', value:officer.facilityCertIssued, color:H.primary },
              { label:'Pending Sync', value:stats.pendingSync,          color:H.orange  },
            ].map(stat=>(
              <View key={stat.label} style={{ flex:1, alignItems:'center' }}>
                <Text style={{ fontSize:18, fontWeight:'900', color:stat.color }}>{stat.value}</Text>
                <Text style={{ fontSize:9, color:T.textDim, marginTop:2 }}>{stat.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Recent activity */}
        {activity.length > 0 && (
          <>
            <View style={s.sectionHead}>
              <Text style={[s.sectionTitle, { color:T.text }]}>Recent Activity</Text>
              <TouchableOpacity onPress={()=>navigation.navigate('ViewRecords')}>
                <Text style={[s.sectionLink, { color:T.primaryL }]}>All →</Text>
              </TouchableOpacity>
            </View>
            <View style={[s.actCard, { backgroundColor:T.card, borderColor:T.border }]}>
              {activity.map((item, idx) => (
                <View key={item.id}>
                  <View style={{ flexDirection:'row', alignItems:'center', padding:14 }}>
                    <View style={[s.actDot, { backgroundColor:`${item.color}22` }]}>
                      <Text style={{ fontSize:15 }}>{item.icon}</Text>
                    </View>
                    <View style={{ flex:1, marginLeft:12 }}>
                      <Text style={{ fontSize:10, color:T.textSub, marginBottom:2 }}>{item.label}</Text>
                      <Text style={{ fontSize:12, fontWeight:'600', color:T.text }}>{item.name}</Text>
                    </View>
                    <Text style={{ fontSize:9, color:T.textDim }}>{item.time}</Text>
                  </View>
                  {idx < activity.length-1 && <View style={{ height:1, backgroundColor:T.border, marginLeft:60 }} />}
                </View>
              ))}
            </View>
          </>
        )}

        {/* Report card */}
        <View style={s.sectionHead}>
          <View style={{ flexDirection:'row', alignItems:'center', gap:6 }}>
            <BarChart3 size={14} color={T.primaryL} />
            <Text style={[s.sectionTitle, { color:T.text }]}>Daily Report Card</Text>
          </View>
          <Text style={{ fontSize:11, color:T.textDim }}>{new Date().toLocaleDateString('en-TZ',{day:'numeric',month:'short',year:'numeric'})}</Text>
        </View>
        <View style={[s.reportCard, { backgroundColor:T.card, borderColor:T.border }]}>
          {[
            { label:'Births registered today',        value:stats.todayBirths,    color:TZ.green  },
            { label:'Deaths recorded today',          value:stats.todayDeaths,    color:'#f87171' },
            { label:'Total births this month',        value:stats.monthBirths,    color:TZ.green  },
            { label:'Total deaths this month',        value:stats.monthDeaths,    color:'#f87171' },
            { label:'Records pending sync',           value:stats.pendingSync,    color:H.orange  },
          ].map((row,i,arr)=>(
            <View key={row.label} style={[s.reportRow, { borderBottomWidth:i<arr.length-1?1:0, borderBottomColor:T.border }]}>
              <Text style={{ fontSize:12, color:T.textSub }}>{row.label}</Text>
              <Text style={{ fontSize:16, fontWeight:'900', color:row.color }}>{row.value}</Text>
            </View>
          ))}
          <View style={[s.downloadSection, { borderTopColor:T.border }]}>
            <Text style={{ fontSize:11, fontWeight:'700', color:T.textSub, marginBottom:12 }}>Download Report</Text>
            <View style={{ flexDirection:'row', gap:8 }}>
              {(['Daily','Weekly','Monthly','Annual'] as const).map(period=>(
                <View key={period} style={{ flex:1, gap:4 }}>
                  <Text style={{ fontSize:9, fontWeight:'600', color:T.textDim, textAlign:'center' }}>{period}</Text>
                  <TouchableOpacity style={[s.dlBtn, { backgroundColor:`${TZ.green}18`, borderColor:`${TZ.green}40` }]} onPress={()=>downloadReport(period,'births')}>
                    <Download size={10} color={TZ.green} /><Text style={{ fontSize:9, fontWeight:'700', color:TZ.green }}>Births</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.dlBtn, { backgroundColor:'rgba(248,113,113,0.14)', borderColor:'rgba(248,113,113,0.30)' }]} onPress={()=>downloadReport(period,'deaths')}>
                    <Download size={10} color="#f87171" /><Text style={{ fontSize:9, fontWeight:'700', color:'#f87171' }}>Deaths</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* Footer */}
        <View style={{ alignItems:'center', paddingTop:24, gap:6 }}>
          <View style={{ flexDirection:'row', width:80, height:3, marginBottom:8 }}>
            <View style={{ flex:1, backgroundColor:TZ.green,  height:3, borderRadius:1 }} />
            <View style={{ width:8, backgroundColor:TZ.yellow, height:3 }} />
            <View style={{ width:6, backgroundColor:TZ.black,  height:3 }} />
            <View style={{ width:8, backgroundColor:TZ.yellow, height:3 }} />
            <View style={{ flex:1, backgroundColor:TZ.blue,   height:3, borderRadius:1 }} />
          </View>
          <Text style={{ fontSize:9, color:T.textDim }}>National Bureau of Statistics · Health Facility Reporting</Text>
          <Text style={{ fontSize:9, color:T.textDim }}>© 2026 The United Republic of Tanzania</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  drawer:          { position:'absolute', top:0, bottom:0, left:0, width:W*0.78, shadowColor:'#000', shadowOffset:{width:6,height:0}, shadowOpacity:0.40, shadowRadius:20, elevation:20 },
  drawerHeader:    { paddingBottom:4 },
  drawerAvatar:    { width:52, height:52, borderRadius:26, backgroundColor:'#22d3ee', alignItems:'center', justifyContent:'center', borderWidth:2, borderColor:TZ.yellow },
  drawerAvatarText:{ fontSize:18, fontWeight:'900', color:'#003087' },
  drawerName:      { fontSize:14, fontWeight:'800', color:'#fff', marginBottom:3 },
  drawerFac:       { fontSize:11, color:'rgba(255,255,255,0.65)' },
  drawerBadge:     { fontSize:8, fontWeight:'700', letterSpacing:0.6 },
  drawerSection:   { paddingVertical:8, borderBottomWidth:1 },
  drawerSectionLabel:{ fontSize:9, fontWeight:'700', letterSpacing:1, paddingHorizontal:16, paddingVertical:8 },
  drawerItem:      { flexDirection:'row', alignItems:'center', gap:12, paddingHorizontal:16, paddingVertical:14, borderBottomWidth:StyleSheet.hairlineWidth },
  drawerItemIcon:  { width:32, height:32, borderRadius:8, alignItems:'center', justifyContent:'center' },
  drawerItemLabel: { flex:1, fontSize:14, fontWeight:'600' },
  drawerFooter:    { paddingVertical:14, paddingHorizontal:16, borderTopWidth:1 },
  drawerFooterText:{ fontSize:9 },
  logoCircle:      { width:46, height:46, borderRadius:23, backgroundColor:'rgba(255,255,255,0.12)', borderWidth:1.5, borderColor:'rgba(252,209,22,0.55)', alignItems:'center', justifyContent:'center' },
  coatCircle:      { width:50, height:50, borderRadius:25, backgroundColor:'rgba(255,255,255,0.10)', borderWidth:1.5, borderColor:'rgba(252,209,22,0.48)', alignItems:'center', justifyContent:'center' },
  iconBtn:         { width:30, height:30, borderRadius:8, backgroundColor:'rgba(255,255,255,0.08)', alignItems:'center', justifyContent:'center' },
  badge:           { position:'absolute', top:-4, right:-4, width:14, height:14, borderRadius:7, backgroundColor:'#ef4444', alignItems:'center', justifyContent:'center' },
  avatarRing:      { width:34, height:34, borderRadius:17, borderWidth:2, borderColor:TZ.yellow, padding:2 },
  avatar:          { flex:1, borderRadius:15, alignItems:'center', justifyContent:'center' },
  welcomeCard:     { marginHorizontal:14, marginTop:12, borderRadius:14, borderWidth:1, padding:14, flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start' },
  zoneBadge:       { flexDirection:'row', alignItems:'center', gap:4, borderWidth:1, borderRadius:20, paddingHorizontal:8, paddingVertical:3 },
  zoneTxt:         { fontSize:9, fontWeight:'600' },
  sectionHead:     { flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingHorizontal:16, marginTop:18, marginBottom:10 },
  sectionTitle:    { fontSize:14, fontWeight:'800' },
  sectionLink:     { fontSize:11 },
  statCard:        { flex:1, borderRadius:14, borderWidth:1, padding:10, alignItems:'center', gap:3 },
  statIcon:        { width:34, height:34, borderRadius:17, alignItems:'center', justifyContent:'center' },
  statValue:       { fontSize:20, fontWeight:'900' },
  statLabel:       { fontSize:9, textAlign:'center', fontWeight:'600' },
  statSub:         { fontSize:8, textAlign:'center' },
  actionCard:      { flex:1, borderRadius:14, borderWidth:1, padding:12, alignItems:'center', gap:6 },
  actionIcon:      { width:46, height:46, borderRadius:12, alignItems:'center', justifyContent:'center' },
  actionLabel:     { fontSize:11, fontWeight:'700', textAlign:'center' },
  actionSub:       { fontSize:9, textAlign:'center' },
  facilityCard:    { marginHorizontal:14, borderRadius:14, borderWidth:1, overflow:'hidden' },
  facilityIcon:    { width:46, height:46, borderRadius:12, alignItems:'center', justifyContent:'center' },
  facilityName:    { fontSize:13, fontWeight:'800', marginBottom:2 },
  facilityStats:   { flexDirection:'row', borderTopWidth:1, paddingVertical:12, paddingHorizontal:16 },
  actCard:         { marginHorizontal:14, borderRadius:14, borderWidth:1, overflow:'hidden' },
  actDot:          { width:38, height:38, borderRadius:19, alignItems:'center', justifyContent:'center' },
  reportCard:      { marginHorizontal:14, borderRadius:14, borderWidth:1, overflow:'hidden' },
  reportRow:       { flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingVertical:11, paddingHorizontal:16 },
  downloadSection: { borderTopWidth:1, paddingHorizontal:16, paddingVertical:14 },
  dlBtn:           { flexDirection:'row', alignItems:'center', justifyContent:'center', gap:3, borderWidth:1, borderRadius:8, paddingVertical:6 },
})
