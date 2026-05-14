/**
 * VillageHomeScreen.tsx  v4.0  PRODUCTION
 *
 * All quick-action buttons now navigate to their real screens.
 * Sidebar uses the same stable mount/unmount pattern as HospitalHomeScreen.
 * Stats from local SQLite (instant) + remote merge in background.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator,
  Image, ImageBackground, RefreshControl,
  Animated, Modal, TouchableWithoutFeedback,
  Dimensions, InteractionManager,
} from 'react-native'
import AsyncStorage        from '@react-native-async-storage/async-storage'
import { SafeAreaView }    from 'react-native-safe-area-context'
import { LinearGradient }  from 'expo-linear-gradient'
import {
  Users, Baby, Cross, Navigation, Sun, Moon,
  Bell, LogOut, MapPin, RefreshCw, ChevronRight,
  UserPlus, FileText, Shield, Clock,
  Wifi, WifiOff, AlertTriangle, BarChart3,
  User, Lock, Menu, X, WifiLow,
} from 'lucide-react-native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'

import { getLocalStats, getCachedOfficerData, cacheOfficerData } from '../../services/localDb'
import {
  fetchRemoteDashboard, fetchRemoteActivity,
  isOnline, getConnQuality, ConnQuality,
} from '../../services/syncService'
import { useTheme, TZ } from '../../context/ThemeContext'
import { useGeofence }  from '../../context/GeofenceContext'

type VillageStack = {
  Splash:undefined; Login:undefined; VillageHome:undefined; HospitalHome:undefined
  RegisterCitizen:undefined; VillageRecordBirth:undefined; VillageRecordDeath:undefined
  RecordMigration:undefined; VillageReports:undefined; SyncData:undefined
  PendingCases:undefined; ViewRecords:undefined
}
type Props = { navigation: NativeStackNavigationProp<VillageStack,'VillageHome'> }

const H  = { primary:'#0891b2', primaryL:'#22d3ee', orange:'#f97316' }
const W  = Dimensions.get('window').width
const CONN_COLORS: Record<ConnQuality,string> = { Good:'#4ade80', Fair:'#fbbf24', Offline:'#f87171' }

// ─── Sidebar (same stable pattern as Hospital) ────────────────────────────────
function Sidebar({ open, onClose, officer, onLogout, loggingOut, navigation }: {
  open:boolean; onClose:()=>void; officer:Record<string,any>
  onLogout:()=>void; loggingOut:boolean; navigation:Props['navigation']
}) {
  const { theme:T } = useTheme()
  const [mounted, setMounted] = useState(false)
  const tx = useRef(new Animated.Value(-W)).current
  const bg = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (open) {
      setMounted(true)
      Animated.parallel([
        Animated.timing(tx, { toValue:0,   duration:260, useNativeDriver:true }),
        Animated.timing(bg, { toValue:1,   duration:260, useNativeDriver:true }),
      ]).start()
    } else {
      Animated.parallel([
        Animated.timing(tx, { toValue:-W,  duration:220, useNativeDriver:true }),
        Animated.timing(bg, { toValue:0,   duration:220, useNativeDriver:true }),
      ]).start(() => setMounted(false))
    }
  }, [open])

  if (!mounted) return null

  const closeAndDo = (action:()=>void) => {
    Animated.parallel([
      Animated.timing(tx, { toValue:-W, duration:200, useNativeDriver:true }),
      Animated.timing(bg, { toValue:0,  duration:200, useNativeDriver:true }),
    ]).start(() => {
      setMounted(false); onClose()
      InteractionManager.runAfterInteractions(() => action())
    })
  }

  const initials = (officer.officerName??'VO').split(' ').filter(Boolean)
    .slice(0,2).map((n:string)=>n[0]).join('').toUpperCase()

  const MENU = [
    { section:'ACCOUNT', items:[
      { icon:<User size={15} color={H.primaryL}/>,  label:'View Profile',
        onPress:()=>closeAndDo(()=>Alert.alert('Profile',`${officer.officerName}\nVillage Officer`)) },
      { icon:<Lock size={15} color={H.primaryL}/>,  label:'Change Password',
        onPress:()=>closeAndDo(()=>Alert.alert('Change Password','Use the NBS web admin panel to change your password.')) },
    ]},
    { section:'SESSION', items:[
      { icon:<LogOut size={15} color="#f87171"/>, label:loggingOut?'Signing out…':'Sign Out', danger:true,
        onPress:()=>closeAndDo(()=>onLogout()) },
    ]},
  ]

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <TouchableWithoutFeedback onPress={()=>closeAndDo(()=>{})}>
        <Animated.View style={[StyleSheet.absoluteFillObject, { backgroundColor:'rgba(0,0,0,0.55)', opacity:bg }]}/>
      </TouchableWithoutFeedback>
      <Animated.View style={[vs.drawer, { backgroundColor:T.card, transform:[{translateX:tx}] }]}>
        <LinearGradient colors={['#02143c','#083250']} style={{ paddingBottom:4 }}>
          <View style={{ flexDirection:'row', height:4 }}>
            <View style={{flex:3,backgroundColor:TZ.green}}/><View style={{width:7,backgroundColor:TZ.yellow}}/>
            <View style={{width:5,backgroundColor:TZ.black}}/><View style={{width:7,backgroundColor:TZ.yellow}}/>
            <View style={{flex:3,backgroundColor:TZ.blue}}/>
          </View>
          <View style={{ flexDirection:'row', alignItems:'flex-start', padding:16, gap:12 }}>
            <View style={vs.drawerAvatar}><Text style={vs.drawerAvatarText}>{initials}</Text></View>
            <View style={{ flex:1 }}>
              <Text style={vs.drawerName}>{officer.officerName??'Village Officer'}</Text>
              <Text style={vs.drawerFac}>{officer.villageName??'Village'}</Text>
              <View style={{ flexDirection:'row', alignItems:'center', gap:4, marginTop:4 }}>
                <View style={{ width:5, height:5, borderRadius:2.5, backgroundColor:'#34d399' }}/>
                <Text style={{ fontSize:8, fontWeight:'700', letterSpacing:0.6, color:'#34d399' }}>VILLAGE EXECUTIVE OFFICER</Text>
              </View>
            </View>
            <TouchableOpacity onPress={()=>closeAndDo(()=>{})} style={{ padding:4 }}>
              <X size={18} color="rgba(255,255,255,0.70)"/>
            </TouchableOpacity>
          </View>
        </LinearGradient>
        <ScrollView style={{ flex:1 }} showsVerticalScrollIndicator={false}>
          {MENU.map(section=>(
            <View key={section.section} style={[vs.drawerSection, { borderBottomColor:T.border }]}>
              <Text style={[vs.drawerSectionLabel, { color:T.textDim }]}>{section.section}</Text>
              {section.items.map(item=>(
                <TouchableOpacity key={item.label} style={[vs.drawerItem, { borderBottomColor:T.border }]}
                  onPress={item.onPress} activeOpacity={0.7}>
                  <View style={[vs.drawerItemIcon, { backgroundColor:(item as any).danger?'rgba(239,68,68,0.12)':`${H.primary}14` }]}>
                    {item.icon}
                  </View>
                  <Text style={[vs.drawerItemLabel, { color:(item as any).danger?'#f87171':T.text }]}>{item.label}</Text>
                  <ChevronRight size={14} color={(item as any).danger?'#f87171':T.textDim}/>
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </ScrollView>
        <View style={[vs.drawerFooter, { borderTopColor:T.border }]}>
          <Text style={[vs.drawerFooterText, { color:T.textDim }]}>ADLCS · NBS Tanzania · © {new Date().getFullYear()}</Text>
        </View>
      </Animated.View>
    </Modal>
  )
}

// ─── StatCard / ActionCard ─────────────────────────────────────────────────────
function StatCard({ icon, value, label, color }: { icon:React.ReactNode; value:number; label:string; color:string }) {
  const { theme:T } = useTheme()
  return (
    <View style={[vs.statCard, { backgroundColor:T.card, borderColor:T.border }]}>
      <View style={[vs.statIcon, { backgroundColor:`${color}18` }]}>{icon}</View>
      <Text style={[vs.statValue, { color }]}>{value}</Text>
      <Text style={[vs.statLabel, { color:T.textSub }]}>{label}</Text>
    </View>
  )
}
function ActionCard({ icon, label, sub, bg, onPress }: { icon:React.ReactNode; label:string; sub:string; bg:string; onPress:()=>void }) {
  const { theme:T } = useTheme()
  return (
    <TouchableOpacity style={[vs.actionCard, { backgroundColor:T.card, borderColor:T.border }]} onPress={onPress} activeOpacity={0.75}>
      <View style={[vs.actionIcon, { backgroundColor:bg }]}>{icon}</View>
      <Text style={[vs.actionLabel, { color:T.text }]}>{label}</Text>
      <Text style={[vs.actionSub,   { color:T.textSub }]}>{sub}</Text>
    </TouchableOpacity>
  )
}

// ─── Screen ────────────────────────────────────────────────────────────────────
export default function VillageHomeScreen({ navigation }: Props) {
  const { theme:T, isDark, toggleTheme } = useTheme()
  const { inZone, distanceKm, setGeofenceConfig } = useGeofence()

  const [loading,     setLoading]    = useState(true)
  const [refreshing,  setRefreshing] = useState(false)
  const [loggingOut,  setLoggingOut] = useState(false)
  const [sidebarOpen, setSidebarOpen]= useState(false)
  const [unread,      setUnread]     = useState(0)
  const [connQuality, setConnQuality]= useState<ConnQuality>('Offline')
  const [activity,    setActivity]   = useState<any[]>([])
  const [stats, setStats] = useState({ todayBirths:0, todayDeaths:0, monthBirths:0, monthDeaths:0, pendingSync:0, totalBirths:0, totalDeaths:0 })
  const [officer, setOfficer] = useState<Record<string,any>>({ officerName:'Village Officer', villageName:'My Village', wardName:'—', totalCitizens:0 })
  const pollRef = useRef<ReturnType<typeof setInterval>|null>(null)

  const loadData = useCallback(async (silent=false) => {
    const token = await AsyncStorage.getItem('adlcs_access_token')
    if (!token) { navigation.replace('Login'); return }

    const localStats = await getLocalStats()
    setStats(localStats)
    setUnread(localStats.pendingSync)
    if (!silent) setLoading(false)

    const cached = await getCachedOfficerData()
    if (cached.officerName) setOfficer(prev => ({ ...prev, ...cached as any, villageName: cached.facilityName ?? prev.villageName }))

    setConnQuality(getConnQuality())
    const [remote, acts] = await Promise.all([fetchRemoteDashboard(), fetchRemoteActivity()])
    setConnQuality(getConnQuality())

    if (acts.length > 0) setActivity(acts)
    if (remote) {
      const merged = {
        officerName:  remote.officerName  ?? cached.officerName  ?? 'Village Officer',
        villageName:  remote.villageName  ?? cached.facilityName ?? 'My Village',
        wardName:     remote.wardName     ?? '—',
        totalCitizens:remote.totalCitizens ?? 0,
      }
      setOfficer(merged)
      await cacheOfficerData({ ...merged, facilityName: merged.villageName })
      setStats(prev => ({
        ...prev,
        monthBirths: Math.max(prev.monthBirths, remote.monthBirths ?? 0),
        monthDeaths: Math.max(prev.monthDeaths, remote.monthDeaths ?? 0),
      }))
    }
    setRefreshing(false)
  }, [navigation])

  useEffect(() => {
    loadData()
    pollRef.current = setInterval(() => { setConnQuality(getConnQuality()); loadData(true) }, 30_000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [loadData])

  const handleLogout = useCallback(() => {
    Alert.alert('Confirm Sign Out', 'Are you sure you want to sign out?', [
      { text:'Cancel', style:'cancel' },
      { text:'Sign Out', style:'destructive', onPress: async () => {
        setLoggingOut(true)
        await AsyncStorage.multiRemove(['adlcs_access_token','adlcs_refresh_token','adlcs_role','adlcs_device_activated'])
        navigation.replace('Login')
      }},
    ])
  }, [navigation])

  const ConnIcon = connQuality==='Good' ? Wifi : connQuality==='Fair' ? WifiLow : WifiOff
  const initials = officer.officerName.split(' ').filter(Boolean).slice(0,2).map((n:string)=>n[0]).join('').toUpperCase() || 'VO'

  type AD = { id:string; icon:React.ReactNode; label:string; sub:string; bg:string }
  const actions: AD[] = [
    { id:'citizen',   icon:<UserPlus    size={20} color="#fff"/>, label:'Register',  sub:'Citizen',   bg:TZ.blue    },
    { id:'birth',     icon:<Baby        size={20} color="#fff"/>, label:'Record',    sub:'Birth',     bg:TZ.green   },
    { id:'death',     icon:<Cross       size={20} color="#fff"/>, label:'Record',    sub:'Death',     bg:'#dc2626'  },
    { id:'migration', icon:<Navigation  size={20} color="#fff"/>, label:'Record',    sub:'Migration', bg:'#f97316'  },
    { id:'reports',   icon:<BarChart3   size={20} color="#fff"/>, label:'View',      sub:'Reports',   bg:'#7c3aed'  },
    { id:'sync',      icon:<RefreshCw   size={20} color="#fff"/>, label:'Sync',      sub:'Data',      bg:'#0e7490'  },
  ]

  const navigate = (id: string) => {
    const m: Record<string, keyof VillageStack> = {
      citizen:   'RegisterCitizen',
      birth:     'VillageRecordBirth',
      death:     'VillageRecordDeath',
      migration: 'RecordMigration',
      reports:   'VillageReports',
      sync:      'SyncData',
    }
    if (m[id]) navigation.navigate(m[id])
  }

  if (loading) return (
    <View style={{ flex:1, alignItems:'center', justifyContent:'center', backgroundColor:T.bg }}>
      <ActivityIndicator size="large" color={T.primary}/>
      <Text style={{ color:T.textSub, marginTop:12, fontSize:12 }}>Loading dashboard…</Text>
    </View>
  )

  return (
    <SafeAreaView style={{ flex:1, backgroundColor:T.bg }} edges={['top']}>
      <Sidebar open={sidebarOpen} onClose={()=>setSidebarOpen(false)} officer={officer}
        onLogout={handleLogout} loggingOut={loggingOut} navigation={navigation}/>

      {/* Header */}
      <ImageBackground source={require('../../../public/assets/flag.jpg')} style={{ overflow:'hidden' }} blurRadius={2} resizeMode="cover">
        <LinearGradient colors={isDark?['rgba(2,20,60,0.70)','rgba(5,40,20,0.70)']:['rgba(0,50,20,0.65)','rgba(0,80,30,0.60)']} style={StyleSheet.absoluteFill}/>
        <View style={{ flexDirection:'row', height:5 }}>
          <View style={{flex:3,backgroundColor:TZ.green}}/><View style={{width:9,backgroundColor:TZ.yellow}}/>
          <View style={{width:7,backgroundColor:TZ.black}}/><View style={{width:9,backgroundColor:TZ.yellow}}/>
          <View style={{flex:3,backgroundColor:TZ.blue}}/>
        </View>
        <View style={{ flexDirection:'row', alignItems:'center', paddingHorizontal:14, paddingTop:10, paddingBottom:8, gap:10 }}>
          <View style={{ alignItems:'center', width:56 }}>
            <View style={vs.logoCircle}><Image source={require('../../../public/assets/longo_nbs.png')} style={{ width:32, height:32 }} resizeMode="contain"/></View>
            <Text style={{ fontSize:8, fontWeight:'800', color:TZ.yellow, letterSpacing:1.5, marginTop:3 }}>NBS</Text>
          </View>
          <View style={{ flex:1, alignItems:'center' }}>
            <Text style={{ fontSize:17, fontWeight:'900', color:'#fff', letterSpacing:2, textTransform:'uppercase' }}>NBS-CENSUS</Text>
            <View style={{ height:2, width:44, backgroundColor:TZ.yellow, borderRadius:1, marginVertical:4 }}/>
            <Text style={{ fontSize:9, color:'rgba(255,255,255,0.72)', letterSpacing:1.1, textTransform:'uppercase' }}>Census for Development</Text>
          </View>
          <View style={{ alignItems:'center', width:56 }}>
            <View style={vs.coatCircle}><Image source={require('../../../public/assets/court_of_arm.png')} style={{ width:42, height:42 }} resizeMode="contain"/></View>
            <Text style={{ fontSize:7, fontWeight:'700', color:'rgba(255,255,255,0.60)', letterSpacing:1.2, marginTop:3 }}>TANZANIA</Text>
          </View>
        </View>
        <View style={{ flexDirection:'row', alignItems:'center', paddingHorizontal:12, paddingBottom:12, paddingTop:2, gap:8 }}>
          <TouchableOpacity style={vs.iconBtn} onPress={()=>setSidebarOpen(true)} hitSlop={{ top:8,bottom:8,left:8,right:8 }}>
            <Menu size={17} color="rgba(255,255,255,0.90)"/>
          </TouchableOpacity>
          <View style={{ flex:1 }}>
            <Text style={{ fontSize:11, fontWeight:'800', color:'#fff' }} numberOfLines={1}>{officer.villageName}</Text>
            <Text style={{ fontSize:9, color:'rgba(255,255,255,0.55)', marginTop:2 }} numberOfLines={1}>
              📍 Village Officer · {officer.wardName}
            </Text>
          </View>
          <TouchableOpacity style={vs.iconBtn} onPress={toggleTheme}>
            {isDark ? <Sun size={14} color={TZ.yellow}/> : <Moon size={14} color={TZ.yellow}/>}
          </TouchableOpacity>
          <TouchableOpacity style={vs.iconBtn}>
            <Bell size={15} color="rgba(255,255,255,0.80)"/>
            {unread>0 && <View style={vs.badge}><Text style={{ fontSize:8, fontWeight:'800', color:'#fff' }}>{unread}</Text></View>}
          </TouchableOpacity>
          <View style={vs.avatarRing}>
            <View style={[vs.avatar, { backgroundColor:'#34d399' }]}>
              <Text style={{ fontSize:11, fontWeight:'900', color:'#003087' }}>{initials}</Text>
            </View>
          </View>
        </View>
      </ImageBackground>

      {/* Body */}
      <ScrollView showsVerticalScrollIndicator={false} style={{ backgroundColor:T.bg }} contentContainerStyle={{ paddingBottom:36 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);loadData()}} tintColor={T.primary}/>}>

        {/* Welcome */}
        <View style={[vs.welcomeCard, { backgroundColor:T.card, borderColor:T.border }]}>
          <View style={{ flex:1 }}>
            <Text style={{ fontSize:11, color:T.textSub }}>Welcome back,</Text>
            <Text style={{ fontSize:18, fontWeight:'800', color:T.text, marginTop:2 }}>{officer.officerName}</Text>
            <Text style={{ fontSize:10, color:T.textDim, marginTop:2 }}>{officer.villageName} · {officer.wardName}</Text>
            <Text style={{ fontSize:10, color:T.textDim, marginTop:2 }}>{new Date().toLocaleDateString('en-TZ',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</Text>
          </View>
          <View style={{ alignItems:'flex-end', gap:6 }}>
            <View style={[vs.zoneBadge, { borderColor:inZone?`${H.primary}60`:'rgba(239,68,68,0.38)', backgroundColor:inZone?`${H.primary}18`:'rgba(239,68,68,0.12)' }]}>
              {inZone ? <MapPin size={9} color={H.primaryL}/> : <AlertTriangle size={9} color="#f87171"/>}
              <Text style={[vs.zoneTxt, { color:inZone?H.primaryL:'#f87171' }]}>
                {inZone?`✓ In Zone · ${distanceKm!=null?distanceKm.toFixed(2):'0.00'} km`:`⚠ Out · ${distanceKm!=null?distanceKm.toFixed(2):'—'} km`}
              </Text>
            </View>
            <View style={{ flexDirection:'row', alignItems:'center', gap:4 }}>
              <ConnIcon size={10} color={CONN_COLORS[connQuality]}/>
              <Text style={{ fontSize:10, fontWeight:'700', color:CONN_COLORS[connQuality] }}>{connQuality} Mode</Text>
            </View>
          </View>
        </View>

        {/* Stats */}
        <View style={vs.sectionHead}>
          <Text style={[vs.sectionTitle, { color:T.text }]}>This Month's Statistics</Text>
          <TouchableOpacity onPress={()=>navigation.navigate('VillageReports')}>
            <Text style={{ fontSize:11, color:T.primaryL }}>Full report →</Text>
          </TouchableOpacity>
        </View>
        <View style={{ flexDirection:'row', paddingHorizontal:12, gap:8 }}>
          <StatCard icon={<Users      size={18} color={T.primary}/>} value={officer.totalCitizens??0}  label="Citizens"   color={T.primary}/>
          <StatCard icon={<Baby       size={18} color={TZ.green} />} value={stats.monthBirths}          label="Births"     color={TZ.green}/>
          <StatCard icon={<Cross      size={18} color={T.danger} />} value={stats.monthDeaths}          label="Deaths"     color={T.danger}/>
          <StatCard icon={<Navigation size={18} color="#f97316"  />} value={stats.pendingSync}          label="Pending"    color="#f97316"/>
        </View>

        {/* Quick Actions */}
        <View style={vs.sectionHead}><Text style={[vs.sectionTitle, { color:T.text }]}>Quick Actions</Text></View>
        <View style={{ flexDirection:'row', paddingHorizontal:12, gap:8 }}>
          {actions.slice(0,3).map(a=><ActionCard key={a.id} icon={a.icon} label={a.label} sub={a.sub} bg={a.bg} onPress={()=>navigate(a.id)}/>)}
        </View>
        <View style={{ flexDirection:'row', paddingHorizontal:12, gap:8, marginTop:8 }}>
          {actions.slice(3).map(a=><ActionCard key={a.id} icon={a.icon} label={a.label} sub={a.sub} bg={a.bg} onPress={()=>navigate(a.id)}/>)}
        </View>

        {/* Activity */}
        {activity.length > 0 && (
          <>
            <View style={vs.sectionHead}>
              <Text style={[vs.sectionTitle, { color:T.text }]}>Recent Activity</Text>
            </View>
            <View style={[vs.actCard, { backgroundColor:T.card, borderColor:T.border }]}>
              {activity.map((item,idx)=>(
                <View key={item.id}>
                  <View style={{ flexDirection:'row', alignItems:'center', padding:14 }}>
                    <View style={{ width:38, height:38, borderRadius:19, backgroundColor:`${item.color}22`, alignItems:'center', justifyContent:'center' }}>
                      <Text style={{ fontSize:15 }}>{item.icon}</Text>
                    </View>
                    <View style={{ flex:1, marginLeft:12 }}>
                      <Text style={{ fontSize:10, color:T.textSub, marginBottom:2 }}>{item.label}</Text>
                      <Text style={{ fontSize:12, fontWeight:'600', color:T.text }}>{item.name}</Text>
                    </View>
                    <Text style={{ fontSize:9, color:T.textDim }}>{item.time}</Text>
                  </View>
                  {idx<activity.length-1&&<View style={{ height:1, backgroundColor:T.border, marginLeft:60 }}/>}
                </View>
              ))}
            </View>
          </>
        )}

        {/* Footer */}
        <View style={{ alignItems:'center', paddingTop:24, gap:6 }}>
          <View style={{ flexDirection:'row', width:80, height:3, marginBottom:8 }}>
            <View style={{flex:1,backgroundColor:TZ.green,height:3,borderRadius:1}}/>
            <View style={{width:8,backgroundColor:TZ.yellow,height:3}}/><View style={{width:6,backgroundColor:TZ.black,height:3}}/>
            <View style={{width:8,backgroundColor:TZ.yellow,height:3}}/><View style={{flex:1,backgroundColor:TZ.blue,height:3,borderRadius:1}}/>
          </View>
          <Text style={{ fontSize:9, color:T.textDim }}>National Bureau of Statistics · Village Officer Reporting</Text>
          <Text style={{ fontSize:9, color:T.textDim }}>© {new Date().getFullYear()} The United Republic of Tanzania</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const vs = StyleSheet.create({
  drawer:           { position:'absolute', top:0, bottom:0, left:0, width:W*0.78, shadowColor:'#000', shadowOffset:{width:6,height:0}, shadowOpacity:0.40, shadowRadius:20, elevation:20 },
  drawerAvatar:     { width:52, height:52, borderRadius:26, backgroundColor:'#34d399', alignItems:'center', justifyContent:'center', borderWidth:2, borderColor:TZ.yellow },
  drawerAvatarText: { fontSize:18, fontWeight:'900', color:'#003087' },
  drawerName:       { fontSize:14, fontWeight:'800', color:'#fff', marginBottom:3 },
  drawerFac:        { fontSize:11, color:'rgba(255,255,255,0.65)' },
  drawerSection:    { paddingVertical:8, borderBottomWidth:1 },
  drawerSectionLabel:{ fontSize:9, fontWeight:'700', letterSpacing:1, paddingHorizontal:16, paddingVertical:8 },
  drawerItem:       { flexDirection:'row', alignItems:'center', gap:12, paddingHorizontal:16, paddingVertical:14, borderBottomWidth:StyleSheet.hairlineWidth },
  drawerItemIcon:   { width:32, height:32, borderRadius:8, alignItems:'center', justifyContent:'center' },
  drawerItemLabel:  { flex:1, fontSize:14, fontWeight:'600' },
  drawerFooter:     { paddingVertical:14, paddingHorizontal:16, borderTopWidth:1 },
  drawerFooterText: { fontSize:9 },
  logoCircle:  { width:46, height:46, borderRadius:23, backgroundColor:'rgba(255,255,255,0.12)', borderWidth:1.5, borderColor:'rgba(252,209,22,0.55)', alignItems:'center', justifyContent:'center' },
  coatCircle:  { width:50, height:50, borderRadius:25, backgroundColor:'rgba(255,255,255,0.10)', borderWidth:1.5, borderColor:'rgba(252,209,22,0.48)', alignItems:'center', justifyContent:'center' },
  iconBtn:     { width:30, height:30, borderRadius:8, backgroundColor:'rgba(255,255,255,0.08)', alignItems:'center', justifyContent:'center' },
  badge:       { position:'absolute', top:-4, right:-4, width:14, height:14, borderRadius:7, backgroundColor:'#ef4444', alignItems:'center', justifyContent:'center' },
  avatarRing:  { width:34, height:34, borderRadius:17, borderWidth:2, borderColor:TZ.yellow, padding:2 },
  avatar:      { flex:1, borderRadius:15, alignItems:'center', justifyContent:'center' },
  welcomeCard: { marginHorizontal:14, marginTop:12, borderRadius:14, borderWidth:1, padding:14, flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start' },
  zoneBadge:   { flexDirection:'row', alignItems:'center', gap:4, borderWidth:1, borderRadius:20, paddingHorizontal:8, paddingVertical:3 },
  zoneTxt:     { fontSize:9, fontWeight:'600' },
  sectionHead: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingHorizontal:16, marginTop:18, marginBottom:10 },
  sectionTitle:{ fontSize:14, fontWeight:'800' },
  statCard:    { flex:1, borderRadius:14, borderWidth:1, padding:12, alignItems:'center', gap:5 },
  statIcon:    { width:36, height:36, borderRadius:18, alignItems:'center', justifyContent:'center' },
  statValue:   { fontSize:20, fontWeight:'900' },
  statLabel:   { fontSize:9, textAlign:'center', fontWeight:'500' },
  actionCard:  { flex:1, borderRadius:14, borderWidth:1, padding:12, alignItems:'center', gap:6 },
  actionIcon:  { width:46, height:46, borderRadius:12, alignItems:'center', justifyContent:'center' },
  actionLabel: { fontSize:11, fontWeight:'700', textAlign:'center' },
  actionSub:   { fontSize:9, textAlign:'center' },
  actCard:     { marginHorizontal:14, borderRadius:14, borderWidth:1, overflow:'hidden' },
})
