/**
 * HospitalHomeScreen.tsx — Hospital Officer Dashboard  v4.0
 * Tanzania NBS-CENSUS · Government Design System
 *
 * CHANGES v4.0:
 *   • Profile dropdown REMOVED → replaced with hamburger (≡) sidebar
 *   • Sidebar: View Facility Details, View Profile, Change Password, Logout
 *   • "HEALTH FACILITY OFFICER" replaced with real facility name + region/district from DB
 *   • Welcome card shows real officer name from DB
 *   • Geofence badge shows live distance from facility centre (0.5 km boundary)
 *   • "RITA Synced" replaced with "Good / Fair / Offline Mode" (actual backend ping)
 *   • Stats polled every 60s for real-time updates
 *   • Report Card + download buttons (Daily / Weekly / Monthly / Annual) via Share sheet
 */

import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator,
  Image, ImageBackground, Dimensions,
  RefreshControl, Modal, TouchableWithoutFeedback,
  Animated, Share,
} from 'react-native'
import AsyncStorage        from '@react-native-async-storage/async-storage'
import { SafeAreaView }    from 'react-native-safe-area-context'
import { LinearGradient }  from 'expo-linear-gradient'
import {
  Baby, Cross, FileText, Clock, Sun, Moon, Bell,
  LogOut, MapPin, RefreshCw, ChevronRight, Shield,
  Building2, Wifi, WifiOff, Stethoscope,
  AlertTriangle, BarChart3, User, Lock,
  Menu, X, Download, WifiLow,
} from 'lucide-react-native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'

import { useTheme, TZ }    from '../../context/ThemeContext'
import { useGeofence }     from '../../context/GeofenceContext'

// ─── Types ─────────────────────────────────────────────────────────────────────
type RootStack = {
  Splash: undefined; Login: undefined; VillageHome: undefined
  HospitalHome: undefined; RegisterBirth: undefined; RecordDeath: undefined
  IssueCertificate: undefined; ViewRecords: undefined
  PendingCases: undefined; SyncData: undefined
}
type Props = { navigation: NativeStackNavigationProp<RootStack, 'HospitalHome'> }

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'https://adlcs-backend.onrender.com/api'
const H        = { primary: '#0891b2', primaryL: '#22d3ee', orange: '#f97316' }
const { width: W } = Dimensions.get('window')

// ─── API interfaces ────────────────────────────────────────────────────────────
interface DashboardData {
  officerName:        string
  facilityName:       string
  facilityType:       string
  facilityGrade:      string
  facilityRegion:     string
  facilityDistrict:   string
  todayBirths:        number
  todayDeaths:        number
  pendingCases:       number
  monthBirths:        number
  monthDeaths:        number
  monthCertificates:  number
  facilityDeliveries: number
  facilityCertIssued: number
  ritaSynced:         boolean
  facilityGpsLat:     number | null
  facilityGpsLng:     number | null
}
interface ActivityItem {
  id: string; icon: string; label: string; name: string; time: string; color: string
}

// Connection status type
type ConnStatus = 'Good' | 'Fair' | 'Offline'
const CONN_COLORS: Record<ConnStatus, string> = {
  Good:    '#4ade80',
  Fair:    '#fbbf24',
  Offline: '#f87171',
}

async function fetchDashboard(token: string): Promise<DashboardData | null> {
  try {
    const res = await fetch(`${API_BASE}/officer/dashboard`, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) return null
    const json = await res.json()
    return json.success ? json.data : null
  } catch { return null }
}

async function fetchActivity(token: string): Promise<ActivityItem[]> {
  try {
    const res = await fetch(`${API_BASE}/officer/activity?limit=5`, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) return []
    const json = await res.json()
    return json.success ? json.data : []
  } catch { return [] }
}

async function pingBackend(): Promise<ConnStatus> {
  const t = Date.now()
  try {
    await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(3000) })
    const ms = Date.now() - t
    return ms < 700 ? 'Good' : 'Fair'
  } catch { return 'Offline' }
}

// ─── Sidebar Menu ──────────────────────────────────────────────────────────────
function SidebarMenu({
  visible, onClose, officerName, facilityName,
  onViewFacility, onViewProfile, onChangePassword, onLogout, loggingOut,
}: {
  visible: boolean; onClose: () => void
  officerName: string; facilityName: string
  onViewFacility: () => void; onViewProfile: () => void
  onChangePassword: () => void; onLogout: () => void; loggingOut: boolean
}) {
  const { theme: T } = useTheme()
  const translateX = useRef(new Animated.Value(-W)).current
  const backdropO  = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.parallel([
      Animated.timing(translateX, { toValue: visible ? 0 : -W, duration: 260, useNativeDriver: true }),
      Animated.timing(backdropO,  { toValue: visible ? 1 : 0,  duration: 260, useNativeDriver: true }),
    ]).start()
  }, [visible])

  const initials = officerName.split(' ').filter(Boolean).slice(0, 2).map(n => n[0]).join('').toUpperCase()

  const MenuItem = ({ icon, label, onPress, danger = false }: {
    icon: React.ReactNode; label: string; onPress: () => void; danger?: boolean
  }) => (
    <TouchableOpacity
      style={[sb.menuItem, { borderBottomColor: T.border }]}
      onPress={() => { onClose(); setTimeout(onPress, 200) }}
      activeOpacity={0.7}
    >
      <View style={[sb.menuIcon, { backgroundColor: danger ? 'rgba(239,68,68,0.12)' : `${H.primary}14` }]}>
        {icon}
      </View>
      <Text style={[sb.menuLabel, { color: danger ? '#f87171' : T.text }]}>{label}</Text>
      <ChevronRight size={14} color={danger ? '#f87171' : T.textDim} />
    </TouchableOpacity>
  )

  if (!visible && translateX._value === -W) return null

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      {/* Backdrop */}
      <TouchableWithoutFeedback onPress={onClose}>
        <Animated.View style={[sb.backdrop, { opacity: backdropO }]} />
      </TouchableWithoutFeedback>

      {/* Drawer */}
      <Animated.View style={[sb.drawer, { backgroundColor: T.card, transform: [{ translateX }] }]}>
        {/* Header */}
        <LinearGradient colors={['#02143c', '#083250']} style={sb.drawerHeader}>
          <View style={sb.flagStripe}>
            <View style={{ flex: 3, backgroundColor: TZ.green }} />
            <View style={{ width: 7, backgroundColor: TZ.yellow }} />
            <View style={{ width: 5, backgroundColor: TZ.black }} />
            <View style={{ width: 7, backgroundColor: TZ.yellow }} />
            <View style={{ flex: 3, backgroundColor: TZ.blue }} />
          </View>
          <View style={sb.drawerHeaderContent}>
            <View style={sb.drawerAvatar}>
              <Text style={sb.drawerAvatarText}>{initials}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={sb.drawerName}>{officerName}</Text>
              <Text style={sb.drawerFacility}>{facilityName}</Text>
              <View style={sb.drawerBadge}>
                <View style={[sb.drawerBadgeDot, { backgroundColor: H.primaryL }]} />
                <Text style={[sb.drawerBadgeText, { color: H.primaryL }]}>HEALTH FACILITY OFFICER</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={sb.closeBtn}>
              <X size={18} color="rgba(255,255,255,0.70)" />
            </TouchableOpacity>
          </View>
        </LinearGradient>

        {/* Menu items */}
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
          <View style={[sb.section, { borderBottomColor: T.border }]}>
            <Text style={[sb.sectionLabel, { color: T.textDim }]}>FACILITY</Text>
            <MenuItem icon={<Building2 size={15} color={H.primaryL} />} label="View Facility Details" onPress={onViewFacility} />
          </View>

          <View style={[sb.section, { borderBottomColor: T.border }]}>
            <Text style={[sb.sectionLabel, { color: T.textDim }]}>ACCOUNT</Text>
            <MenuItem icon={<User size={15} color={H.primaryL} />} label="View Your Profile" onPress={onViewProfile} />
            <MenuItem icon={<Lock size={15} color={H.primaryL} />} label="Change Password" onPress={onChangePassword} />
          </View>

          <View style={sb.section}>
            <MenuItem icon={<LogOut size={15} color="#f87171" />} label={loggingOut ? 'Signing out…' : 'Sign Out'} onPress={onLogout} danger />
          </View>
        </ScrollView>

        <View style={[sb.drawerFooter, { borderTopColor: T.border }]}>
          <Text style={[sb.drawerFooterText, { color: T.textDim }]}>ADLCS · NBS Tanzania · © 2026</Text>
        </View>
      </Animated.View>
    </Modal>
  )
}

// ─── StatCard ──────────────────────────────────────────────────────────────────
function StatCard({ icon, value, label, color, sub }: {
  icon: React.ReactNode; value: number; label: string; color: string; sub?: string
}) {
  const { theme: T } = useTheme()
  return (
    <View style={[hc.statCard, { backgroundColor: T.card, borderColor: T.border }]}>
      <View style={[hc.statIcon, { backgroundColor: `${color}18` }]}>{icon}</View>
      <Text style={[hc.statValue, { color }]}>{value}</Text>
      <Text style={[hc.statLabel, { color: T.textSub }]}>{label}</Text>
      {sub ? <Text style={[hc.statSub, { color: T.textDim }]}>{sub}</Text> : null}
    </View>
  )
}

// ─── ActionCard ────────────────────────────────────────────────────────────────
type ActionItem = { id: string; icon: React.ReactNode; label: string; sub: string; bg: string }
function ActionCard({ item, onPress }: { item: ActionItem; onPress: () => void }) {
  const { theme: T } = useTheme()
  return (
    <TouchableOpacity style={[hc.actionCard, { backgroundColor: T.card, borderColor: T.border }]}
      onPress={onPress} activeOpacity={0.75}>
      <View style={[hc.actionIcon, { backgroundColor: item.bg }]}>{item.icon}</View>
      <Text style={[hc.actionLabel, { color: T.text }]}>{item.label}</Text>
      <Text style={[hc.actionSub,   { color: T.textSub }]}>{item.sub}</Text>
    </TouchableOpacity>
  )
}

// ─── Screen ────────────────────────────────────────────────────────────────────
export default function HospitalHomeScreen({ navigation }: Props) {
  const { theme: T, isDark, toggleTheme } = useTheme()
  const { inZone, distanceKm, setGeofenceConfig } = useGeofence()

  const [loading,      setLoading]     = useState(true)
  const [refreshing,   setRefreshing]  = useState(false)
  const [loggingOut,   setLoggingOut]  = useState(false)
  const [sidebarOpen,  setSidebarOpen] = useState(false)
  const [unread,       setUnread]      = useState(0)
  const [dash,         setDash]        = useState<DashboardData | null>(null)
  const [activity,     setActivity]    = useState<ActivityItem[]>([])
  const [connStatus,   setConnStatus]  = useState<ConnStatus>('Offline')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Load data ──────────────────────────────────────────────────────────────
  const loadData = useCallback(async (silent = false) => {
    const token = await AsyncStorage.getItem('adlcs_access_token')
    if (!token) { navigation.replace('Login'); return }

    const [data, acts, conn] = await Promise.all([
      fetchDashboard(token),
      fetchActivity(token),
      pingBackend(),
    ])

    setConnStatus(conn)

    if (data) {
      setDash(data)
      setUnread(data.pendingCases > 0 ? 1 : 0)
      if (data.facilityGpsLat != null && data.facilityGpsLng != null) {
        setGeofenceConfig({
          gps:  { lat: Number(data.facilityGpsLat), lng: Number(data.facilityGpsLng) },
          role: 'hospital_officer',
        })
      }
      await AsyncStorage.multiSet([
        ['adlcs_officer_name', data.officerName],
        ['adlcs_facility',     data.facilityName],
      ])
    } else if (!silent) {
      const [[, name], [, fac]] = await AsyncStorage.multiGet(['adlcs_officer_name', 'adlcs_facility'])
      setDash(prev => prev ?? {
        officerName: name ?? 'Field Officer', facilityName: fac ?? 'Facility',
        facilityType: 'hospital', facilityGrade: '', facilityRegion: '—', facilityDistrict: '—',
        todayBirths: 0, todayDeaths: 0, pendingCases: 0,
        monthBirths: 0, monthDeaths: 0, monthCertificates: 0,
        facilityDeliveries: 0, facilityCertIssued: 0,
        ritaSynced: false, facilityGpsLat: null, facilityGpsLng: null,
      })
    }

    if (acts.length > 0) setActivity(acts)
    if (!silent) setLoading(false)
  }, [navigation, setGeofenceConfig])

  useEffect(() => {
    loadData()
    // Poll every 60 seconds for real-time stat updates
    pollRef.current = setInterval(() => loadData(true), 60_000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [loadData])

  const onRefresh = useCallback(async () => {
    setRefreshing(true); await loadData(); setRefreshing(false)
  }, [loadData])

  // ── Logout ─────────────────────────────────────────────────────────────────
  const handleLogout = () => {
    Alert.alert('Confirm Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: async () => {
        setLoggingOut(true)
        await AsyncStorage.multiRemove(['adlcs_access_token', 'adlcs_refresh_token', 'adlcs_role', 'adlcs_device_activated'])
        navigation.replace('Login')
      }},
    ])
  }

  // ── Report download ────────────────────────────────────────────────────────
  const downloadReport = async (period: 'Daily' | 'Weekly' | 'Monthly' | 'Annual', type: 'births' | 'deaths') => {
    const lines = [
      `ADLCS TANZANIA — ${period.toUpperCase()} ${type.toUpperCase()} REPORT`,
      `Facility: ${dash?.facilityName ?? '—'}`,
      `Region / District: ${dash?.facilityRegion ?? '—'} / ${dash?.facilityDistrict ?? '—'}`,
      `Officer: ${dash?.officerName ?? '—'}`,
      `Generated: ${new Date().toLocaleString('en-TZ')}`,
      `Period: ${period}`,
      `──────────────────────────────────`,
      type === 'births' ? `Births registered:  ${period === 'Daily' ? dash?.todayBirths : dash?.monthBirths}` : `Deaths recorded:   ${period === 'Daily' ? dash?.todayDeaths : dash?.monthDeaths}`,
      `Certificates issued: ${dash?.facilityCertIssued ?? 0}`,
      `Pending cases:       ${dash?.pendingCases ?? 0}`,
      `──────────────────────────────────`,
      `NBS Central Database — Authorised Officer Report`,
      `For PDF format, download from the Admin Web Panel.`,
    ].join('\n')
    await Share.share({ title: `ADLCS ${period} ${type} Report`, message: lines })
  }

  // ── Actions ────────────────────────────────────────────────────────────────
  const actions: ActionItem[] = [
    { id: 'birth',   icon: <Baby     size={20} color="#fff" />, label: 'Register',  sub: 'Birth',       bg: TZ.green  },
    { id: 'death',   icon: <Cross    size={20} color="#fff" />, label: 'Record',    sub: 'Death',       bg: '#dc2626' },
    { id: 'cert',    icon: <FileText size={20} color="#fff" />, label: 'Issue',     sub: 'Certificate', bg: H.primary },
    { id: 'view',    icon: <Stethoscope size={20} color="#fff" />, label: 'View',  sub: 'Records',     bg: '#7c3aed' },
    { id: 'pending', icon: <Clock    size={20} color="#fff" />, label: 'Pending',   sub: 'Cases',       bg: H.orange  },
    { id: 'sync',    icon: <RefreshCw size={20} color="#fff" />, label: 'Sync',    sub: 'Data',        bg: '#0e7490' },
  ]
  const routeMap: Record<string, keyof RootStack> = {
    birth: 'RegisterBirth', death: 'RecordDeath', cert: 'IssueCertificate',
    view: 'ViewRecords', pending: 'PendingCases', sync: 'SyncData',
  }
  const handleAction = (id: string) => {
    if (routeMap[id]) navigation.navigate(routeMap[id])
  }

  const initials = (dash?.officerName ?? 'HO').split(' ').filter(Boolean).slice(0, 2).map(n => n[0]).join('').toUpperCase()

  const connColor = CONN_COLORS[connStatus]
  const ConnIcon  = connStatus === 'Good' ? Wifi : connStatus === 'Fair' ? WifiLow : WifiOff

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: T.bg }}>
        <ActivityIndicator size="large" color={T.primary} />
        <Text style={{ color: T.textSub, marginTop: 12, fontSize: 12 }}>Loading dashboard…</Text>
      </View>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }} edges={['top']}>

      {/* ── SIDEBAR ──────────────────────────────────────────────────────── */}
      <SidebarMenu
        visible={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        officerName={dash?.officerName ?? 'Officer'}
        facilityName={dash?.facilityName ?? 'Facility'}
        onViewFacility={() => Alert.alert('Facility Details', `${dash?.facilityName}\n${dash?.facilityType?.replace(/_/g, ' ')}\n${dash?.facilityDistrict}, ${dash?.facilityRegion}`)}
        onViewProfile={() => Alert.alert('Your Profile', `${dash?.officerName}\nFacility: ${dash?.facilityName}`)}
        onChangePassword={() => Alert.alert('Change Password', 'Password change — available in next sprint.')}
        onLogout={handleLogout}
        loggingOut={loggingOut}
      />

      {/* ══════════════════════════ TOP HEADER ════════════════════════════ */}
      <ImageBackground
        source={require('../../../public/assets/flag.jpg')}
        style={hc.headerBg} blurRadius={2} resizeMode="cover"
      >
        <LinearGradient
          colors={isDark ? ['rgba(2,20,60,0.70)', 'rgba(8,50,80,0.65)'] : ['rgba(0,30,100,0.60)', 'rgba(4,60,80,0.58)']}
          style={StyleSheet.absoluteFill}
        />
        <View style={hc.flagStripe}>
          <View style={{ flex: 3, backgroundColor: TZ.green }} />
          <View style={{ width: 9, backgroundColor: TZ.yellow }} />
          <View style={{ width: 7, backgroundColor: TZ.black }} />
          <View style={{ width: 9, backgroundColor: TZ.yellow }} />
          <View style={{ flex: 3, backgroundColor: TZ.blue }} />
        </View>

        <View style={hc.headerRow}>
          <View style={hc.nbsLogoWrap}>
            <View style={hc.nbsCircle}>
              <Image source={require('../../../public/assets/longo_nbs.png')} style={{ width: 32, height: 32 }} resizeMode="contain" />
            </View>
            <Text style={hc.nbsLabel}>NBS</Text>
          </View>
          <View style={hc.headerCenter}>
            <Text style={hc.headerTitle}>NBS-CENSUS</Text>
            <View style={hc.headerLine} />
            <Text style={hc.headerSub}>Census for Development</Text>
          </View>
          <View style={hc.coatWrap}>
            <View style={hc.coatCircle}>
              <Image source={require('../../../public/assets/court_of_arm.png')} style={{ width: 42, height: 42 }} resizeMode="contain" />
            </View>
            <Text style={hc.coatLabel}>TANZANIA</Text>
          </View>
        </View>

        {/* Sub-header: ≡ | facility name + location | theme · bell · avatar initials */}
        <View style={hc.subHeader}>
          {/* ≡ Hamburger — opens sidebar */}
          <TouchableOpacity style={hc.iconBtn} onPress={() => setSidebarOpen(true)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Menu size={17} color="rgba(255,255,255,0.90)" />
          </TouchableOpacity>

          {/* Facility name + location (from DB) */}
          <View style={hc.subCenter}>
            <Text style={hc.facilityHeaderName} numberOfLines={1}>
              {dash?.facilityName ?? 'Loading…'}
            </Text>
            <Text style={hc.facilityHeaderLoc} numberOfLines={1}>
              <MapPin size={9} color={TZ.yellow} /> {dash?.facilityRegion ?? '—'}, {dash?.facilityDistrict ?? '—'}
            </Text>
          </View>

          <View style={hc.subRight}>
            {/* ☀/🌙 theme toggle */}
            <TouchableOpacity style={hc.iconBtn} onPress={toggleTheme}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              {isDark ? <Sun size={14} color={TZ.yellow} /> : <Moon size={14} color={TZ.yellow} />}
            </TouchableOpacity>
            {/* Bell */}
            <TouchableOpacity style={hc.iconBtn}>
              <Bell size={15} color="rgba(255,255,255,0.80)" />
              {unread > 0 && <View style={hc.badge}><Text style={hc.badgeText}>{unread}</Text></View>}
            </TouchableOpacity>
            {/* Avatar initials (no dropdown — sidebar handles menu) */}
            <View style={hc.avatarRing}>
              <View style={[hc.avatar, { backgroundColor: H.primaryL }]}>
                <Text style={hc.avatarText}>{initials}</Text>
              </View>
            </View>
          </View>
        </View>
      </ImageBackground>

      {/* ══════════════════════════ SCROLL BODY ═════════════════════════════ */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        style={{ backgroundColor: T.bg }}
        contentContainerStyle={{ paddingBottom: 36 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.primary} />}
      >
        {/* ── WELCOME BANNER ─────────────────────────────────────────── */}
        <View style={[hc.welcomeCard, { backgroundColor: T.card, borderColor: T.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[hc.welcomeHi,   { color: T.textSub }]}>Welcome back,</Text>
            {/* Real officer name from DB */}
            <Text style={[hc.welcomeName, { color: T.text }]}>{dash?.officerName ?? '—'}</Text>
            <Text style={[hc.welcomeDate, { color: T.textDim }]}>
              {new Date().toLocaleDateString('en-TZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </Text>
          </View>
          <View style={hc.welcomeRight}>
            {/* Live geofence distance from facility centre */}
            <View style={[hc.zoneBadge, {
              borderColor:     inZone ? `${H.primary}60`        : 'rgba(239,68,68,0.38)',
              backgroundColor: inZone ? `${H.primary}18`        : 'rgba(239,68,68,0.12)',
            }]}>
              {inZone
                ? <MapPin        size={9} color={H.primaryL}  />
                : <AlertTriangle size={9} color="#f87171"     />}
              <Text style={[hc.zoneText, { color: inZone ? H.primaryL : '#f87171' }]}>
                {inZone
                  ? `✓ In Zone · ${distanceKm != null ? distanceKm.toFixed(2) : '0.00'} km`
                  : `⚠ Out of Zone · ${distanceKm != null ? distanceKm.toFixed(2) : '—'} km`}
              </Text>
            </View>
            {/* Connection status: Good / Fair / Offline Mode */}
            <View style={hc.connRow}>
              <ConnIcon size={10} color={connColor} />
              <Text style={[hc.connText, { color: connColor }]}>{connStatus} Mode</Text>
            </View>
          </View>
        </View>

        {/* ── STATISTICS (real DB, polled every 60 s) ─────────────────── */}
        <View style={hc.sectionHead}>
          <Text style={[hc.sectionTitle, { color: T.text }]}>Today's Statistics</Text>
          <TouchableOpacity onPress={() => navigation.navigate('ViewRecords')}>
            <Text style={[hc.sectionLink, { color: T.primaryL }]}>Full report →</Text>
          </TouchableOpacity>
        </View>
        <View style={hc.statsRow}>
          <StatCard icon={<Baby     size={18} color={TZ.green}  />} value={dash?.todayBirths  ?? 0} label="Births"       color={TZ.green}  sub="Today" />
          <StatCard icon={<Cross    size={18} color={T.danger}  />} value={dash?.todayDeaths  ?? 0} label="Deaths"       color={T.danger}  sub="Today" />
          <StatCard icon={<FileText size={18} color={H.primary} />} value={dash?.monthCertificates ?? 0} label="Certificates" color={H.primary} sub="Month" />
          <StatCard icon={<Clock    size={18} color={H.orange}  />} value={dash?.pendingCases ?? 0} label="Pending"      color={H.orange}  sub="Cases" />
        </View>

        {/* ── QUICK ACTIONS ──────────────────────────────────────────── */}
        <View style={hc.sectionHead}>
          <Text style={[hc.sectionTitle, { color: T.text }]}>Quick Actions</Text>
        </View>
        <View style={hc.actionsRow}>
          {actions.slice(0, 3).map(a => <ActionCard key={a.id} item={a} onPress={() => handleAction(a.id)} />)}
        </View>
        <View style={[hc.actionsRow, { marginTop: 8 }]}>
          {actions.slice(3).map(a => <ActionCard key={a.id} item={a} onPress={() => handleAction(a.id)} />)}
        </View>

        {/* ── FACILITY INFO ───────────────────────────────────────────── */}
        <View style={hc.sectionHead}>
          <Text style={[hc.sectionTitle, { color: T.text }]}>Facility Information</Text>
        </View>
        <View style={[hc.facilityCard, { backgroundColor: T.card, borderColor: T.border }]}>
          <LinearGradient colors={[`${H.primary}22`, `${H.primary}08`]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={hc.facilityGradient}>
            <View style={[hc.facilityIcon, { backgroundColor: `${H.primary}25` }]}>
              <Building2 size={22} color={H.primaryL} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[hc.facilityName, { color: T.text }]}>{dash?.facilityName ?? '—'}</Text>
              <Text style={[hc.facilityType, { color: T.textSub }]}>
                {dash?.facilityType ? `${dash.facilityType.replace(/_/g, ' ')} · ${dash.facilityGrade}` : '—'}
              </Text>
              <Text style={[hc.facilityLoc, { color: T.textDim }]}>
                {dash?.facilityDistrict ?? '—'}, {dash?.facilityRegion ?? '—'}
              </Text>
              <View style={hc.facilityRow}>
                <Shield size={10} color={H.primaryL} />
                <Text style={[hc.facilityInfo, { color: T.textDim }]}>Authorised RITA reporting facility</Text>
              </View>
            </View>
          </LinearGradient>
          <View style={[hc.facilityStats, { borderTopColor: T.border }]}>
            {[
              { label: 'Deliveries',   value: dash?.facilityDeliveries ?? 0, color: TZ.green  },
              { label: 'Certs Issued', value: dash?.facilityCertIssued  ?? 0, color: H.primary },
              { label: 'Pending',      value: dash?.pendingCases        ?? 0, color: H.orange  },
            ].map(s => (
              <View key={s.label} style={hc.facilityStatItem}>
                <Text style={[hc.facilityStatVal,   { color: s.color  }]}>{s.value}</Text>
                <Text style={[hc.facilityStatLabel, { color: T.textDim }]}>{s.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── RECENT ACTIVITY ─────────────────────────────────────────── */}
        <View style={hc.sectionHead}>
          <Text style={[hc.sectionTitle, { color: T.text }]}>Recent Activity</Text>
          <TouchableOpacity onPress={() => navigation.navigate('ViewRecords')}>
            <Text style={[hc.sectionLink, { color: T.primaryL }]}>All →</Text>
          </TouchableOpacity>
        </View>
        <View style={[hc.activityCard, { backgroundColor: T.card, borderColor: T.border }]}>
          {activity.length === 0
            ? <View style={{ padding: 24, alignItems: 'center' }}><Text style={{ color: T.textDim, fontSize: 12 }}>No recent activity</Text></View>
            : activity.map((item, idx) => (
                <View key={item.id}>
                  <TouchableOpacity style={hc.activityRow} activeOpacity={0.7}>
                    <View style={[hc.activityDot, { backgroundColor: `${item.color}22` }]}>
                      <Text style={{ fontSize: 15 }}>{item.icon}</Text>
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={[hc.activityLabel, { color: T.textSub }]}>{item.label}</Text>
                      <Text style={[hc.activityName,  { color: T.text    }]}>{item.name}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <Text style={[hc.activityTime, { color: T.textDim }]}>{item.time}</Text>
                      <ChevronRight size={13} color={T.textDim} />
                    </View>
                  </TouchableOpacity>
                  {idx < activity.length - 1 && <View style={[hc.divider, { backgroundColor: T.border, marginLeft: 60 }]} />}
                </View>
              ))}
        </View>

        {/* ── DAILY REPORT CARD + DOWNLOAD ────────────────────────────── */}
        <View style={hc.sectionHead}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <BarChart3 size={14} color={T.primaryL} />
            <Text style={[hc.sectionTitle, { color: T.text }]}>Daily Report Card</Text>
          </View>
          <Text style={[hc.sectionLink, { color: T.textDim }]}>
            {new Date().toLocaleDateString('en-TZ', { day: 'numeric', month: 'short', year: 'numeric' })}
          </Text>
        </View>
        <View style={[hc.reportCard, { backgroundColor: T.card, borderColor: T.border }]}>
          {[
            { label: 'Births registered today',        value: dash?.todayBirths       ?? 0, color: TZ.green  },
            { label: 'Deaths recorded today',          value: dash?.todayDeaths       ?? 0, color: '#f87171' },
            { label: 'Certificates issued this month', value: dash?.monthCertificates ?? 0, color: H.primary },
            { label: 'Monthly births',                 value: dash?.monthBirths       ?? 0, color: TZ.green  },
            { label: 'Monthly deaths',                 value: dash?.monthDeaths       ?? 0, color: '#f87171' },
            { label: 'Pending / unresolved cases',     value: dash?.pendingCases      ?? 0, color: H.orange  },
          ].map((row, i, arr) => (
            <View key={row.label} style={[hc.reportRow, { borderBottomWidth: i < arr.length - 1 ? 1 : 0, borderBottomColor: T.border }]}>
              <Text style={[hc.reportLabel, { color: T.textSub }]}>{row.label}</Text>
              <Text style={[hc.reportValue, { color: row.color }]}>{row.value}</Text>
            </View>
          ))}

          {/* Download buttons */}
          <View style={[hc.downloadSection, { borderTopColor: T.border }]}>
            <Text style={[hc.downloadTitle, { color: T.textSub }]}>Download Report</Text>
            <View style={hc.downloadBtns}>
              {(['Daily', 'Weekly', 'Monthly', 'Annual'] as const).map(period => (
                <View key={period} style={{ gap: 4 }}>
                  <Text style={[hc.downloadPeriodLabel, { color: T.textDim }]}>{period}</Text>
                  <View style={{ gap: 4 }}>
                    <TouchableOpacity
                      style={[hc.dlBtn, { backgroundColor: `${TZ.green}18`, borderColor: `${TZ.green}40` }]}
                      onPress={() => downloadReport(period, 'births')} activeOpacity={0.75}
                    >
                      <Download size={10} color={TZ.green} />
                      <Text style={[hc.dlBtnText, { color: TZ.green }]}>Births</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[hc.dlBtn, { backgroundColor: 'rgba(248,113,113,0.14)', borderColor: 'rgba(248,113,113,0.30)' }]}
                      onPress={() => downloadReport(period, 'deaths')} activeOpacity={0.75}
                    >
                      <Download size={10} color="#f87171" />
                      <Text style={[hc.dlBtnText, { color: '#f87171' }]}>Deaths</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* Footer */}
        <View style={hc.footer}>
          <View style={hc.footerFlag}>
            <View style={{ flex: 1, backgroundColor: TZ.green,  height: 3, borderRadius: 1 }} />
            <View style={{ width: 8,  backgroundColor: TZ.yellow, height: 3 }} />
            <View style={{ width: 6,  backgroundColor: TZ.black,  height: 3 }} />
            <View style={{ width: 8,  backgroundColor: TZ.yellow, height: 3 }} />
            <View style={{ flex: 1, backgroundColor: TZ.blue,   height: 3, borderRadius: 1 }} />
          </View>
          <Text style={[hc.footerText, { color: T.textDim }]}>National Bureau of Statistics · Health Facility Reporting</Text>
          <Text style={[hc.footerText, { color: T.textDim }]}>© 2026 The United Republic of Tanzania</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

// ─── Sidebar Styles ────────────────────────────────────────────────────────────
const sb = StyleSheet.create({
  backdrop:        { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  drawer:          { position: 'absolute', top: 0, bottom: 0, left: 0, width: W * 0.78, shadowColor: '#000', shadowOffset: { width: 6, height: 0 }, shadowOpacity: 0.40, shadowRadius: 20, elevation: 20 },
  drawerHeader:    { paddingBottom: 20 },
  flagStripe:      { flexDirection: 'row', height: 4 },
  drawerHeaderContent:{ flexDirection: 'row', alignItems: 'flex-start', padding: 16, gap: 12 },
  drawerAvatar:    { width: 52, height: 52, borderRadius: 26, backgroundColor: '#22d3ee', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: TZ.yellow },
  drawerAvatarText:{ fontSize: 18, fontWeight: '900', color: '#003087' },
  drawerName:      { fontSize: 14, fontWeight: '800', color: '#fff', marginBottom: 3 },
  drawerFacility:  { fontSize: 11, color: 'rgba(255,255,255,0.65)', marginBottom: 6 },
  drawerBadge:     { flexDirection: 'row', alignItems: 'center', gap: 4 },
  drawerBadgeDot:  { width: 5, height: 5, borderRadius: 2.5 },
  drawerBadgeText: { fontSize: 8, fontWeight: '700', letterSpacing: 0.6 },
  closeBtn:        { padding: 4 },
  section:         { paddingVertical: 8, borderBottomWidth: 1 },
  sectionLabel:    { fontSize: 9, fontWeight: '700', letterSpacing: 1, paddingHorizontal: 16, paddingVertical: 8 },
  menuItem:        { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  menuIcon:        { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  menuLabel:       { flex: 1, fontSize: 14, fontWeight: '600' },
  drawerFooter:    { paddingVertical: 14, paddingHorizontal: 16, borderTopWidth: 1 },
  drawerFooterText:{ fontSize: 9 },
})

// ─── Screen Styles ─────────────────────────────────────────────────────────────
const hc = StyleSheet.create({
  headerBg:         { overflow: 'hidden' },
  flagStripe:       { flexDirection: 'row', height: 5 },
  headerRow:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 10, paddingBottom: 8, gap: 10 },
  nbsLogoWrap:      { alignItems: 'center', width: 56 },
  nbsCircle:        { width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1.5, borderColor: 'rgba(252,209,22,0.55)', alignItems: 'center', justifyContent: 'center' },
  nbsLabel:         { fontSize: 8, fontWeight: '800', color: TZ.yellow, letterSpacing: 1.5, marginTop: 3 },
  headerCenter:     { flex: 1, alignItems: 'center' },
  headerTitle:      { fontSize: 17, fontWeight: '900', color: '#fff', letterSpacing: 2, textTransform: 'uppercase' },
  headerLine:       { height: 2, width: 44, backgroundColor: TZ.yellow, borderRadius: 1, marginVertical: 4 },
  headerSub:        { fontSize: 9, color: 'rgba(255,255,255,0.72)', letterSpacing: 1.1, textTransform: 'uppercase' },
  coatWrap:         { alignItems: 'center', width: 56 },
  coatCircle:       { width: 50, height: 50, borderRadius: 25, backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: 1.5, borderColor: 'rgba(252,209,22,0.48)', alignItems: 'center', justifyContent: 'center' },
  coatLabel:        { fontSize: 7, fontWeight: '700', color: 'rgba(255,255,255,0.60)', letterSpacing: 1.2, marginTop: 3 },
  subHeader:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 12, paddingTop: 2, gap: 8 },
  subCenter:        { flex: 1 },
  facilityHeaderName:{ fontSize: 11, fontWeight: '800', color: '#fff' },
  facilityHeaderLoc: { fontSize: 9,  color: 'rgba(255,255,255,0.55)', marginTop: 2 },
  subRight:         { flexDirection: 'row', alignItems: 'center', gap: 7 },
  iconBtn:          { width: 30, height: 30, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  badge:            { position: 'absolute', top: -4, right: -4, width: 14, height: 14, borderRadius: 7, backgroundColor: '#ef4444', alignItems: 'center', justifyContent: 'center' },
  badgeText:        { fontSize: 8, fontWeight: '800', color: '#fff' },
  avatarRing:       { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: TZ.yellow, padding: 2 },
  avatar:           { flex: 1, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  avatarText:       { fontSize: 11, fontWeight: '900', color: TZ.navy },

  welcomeCard:   { marginHorizontal: 14, marginTop: 12, borderRadius: 14, borderWidth: 1, padding: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  welcomeHi:     { fontSize: 11 },
  welcomeName:   { fontSize: 18, fontWeight: '800', marginTop: 2 },
  welcomeDate:   { fontSize: 10, marginTop: 3 },
  welcomeRight:  { alignItems: 'flex-end', gap: 6 },
  zoneBadge:     { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  zoneText:      { fontSize: 9, fontWeight: '600' },
  connRow:       { flexDirection: 'row', alignItems: 'center', gap: 4 },
  connText:      { fontSize: 10, fontWeight: '700' },

  sectionHead:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, marginTop: 18, marginBottom: 10 },
  sectionTitle:  { fontSize: 14, fontWeight: '800' },
  sectionLink:   { fontSize: 11 },

  statsRow:      { flexDirection: 'row', paddingHorizontal: 12, gap: 8 },
  statCard:      { flex: 1, borderRadius: 14, borderWidth: 1, padding: 10, alignItems: 'center', gap: 3 },
  statIcon:      { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  statValue:     { fontSize: 20, fontWeight: '900' },
  statLabel:     { fontSize: 9, textAlign: 'center', fontWeight: '600' },
  statSub:       { fontSize: 8, textAlign: 'center' },

  actionsRow:    { flexDirection: 'row', paddingHorizontal: 12, gap: 8 },
  actionCard:    { flex: 1, borderRadius: 14, borderWidth: 1, padding: 12, alignItems: 'center', gap: 6 },
  actionIcon:    { width: 46, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  actionLabel:   { fontSize: 11, fontWeight: '700', textAlign: 'center' },
  actionSub:     { fontSize: 9, textAlign: 'center' },

  facilityCard:      { marginHorizontal: 14, borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  facilityGradient:  { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  facilityIcon:      { width: 46, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  facilityName:      { fontSize: 13, fontWeight: '800', marginBottom: 2 },
  facilityType:      { fontSize: 11, marginBottom: 2 },
  facilityLoc:       { fontSize: 10, marginBottom: 4 },
  facilityRow:       { flexDirection: 'row', alignItems: 'center', gap: 4 },
  facilityInfo:      { fontSize: 10 },
  facilityStats:     { flexDirection: 'row', borderTopWidth: 1, paddingVertical: 12, paddingHorizontal: 16 },
  facilityStatItem:  { flex: 1, alignItems: 'center' },
  facilityStatVal:   { fontSize: 18, fontWeight: '900' },
  facilityStatLabel: { fontSize: 9, marginTop: 2 },

  activityCard:  { marginHorizontal: 14, borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  activityRow:   { flexDirection: 'row', alignItems: 'center', padding: 14 },
  activityDot:   { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  activityLabel: { fontSize: 10, marginBottom: 2 },
  activityName:  { fontSize: 12, fontWeight: '600' },
  activityTime:  { fontSize: 9 },
  divider:       { height: 1 },

  reportCard:        { marginHorizontal: 14, borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  reportRow:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 11, paddingHorizontal: 16 },
  reportLabel:       { fontSize: 12 },
  reportValue:       { fontSize: 16, fontWeight: '900' },
  downloadSection:   { borderTopWidth: 1, paddingHorizontal: 16, paddingVertical: 14 },
  downloadTitle:     { fontSize: 11, fontWeight: '700', marginBottom: 12 },
  downloadBtns:      { flexDirection: 'row', gap: 8 },
  downloadPeriodLabel:{ fontSize: 9, fontWeight: '600', textAlign: 'center', marginBottom: 4 },
  dlBtn:             { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, borderWidth: 1, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 4 },
  dlBtnText:         { fontSize: 9, fontWeight: '700' },

  footer:        { alignItems: 'center', paddingTop: 24, gap: 6 },
  footerFlag:    { flexDirection: 'row', width: 80, height: 3, marginBottom: 8 },
  footerText:    { fontSize: 9 },
})
