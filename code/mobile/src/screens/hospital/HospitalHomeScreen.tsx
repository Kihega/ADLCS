/**
 * HospitalHomeScreen.tsx — Hospital Officer Dashboard  v3.0
 * Tanzania NBS-CENSUS · Government Design System
 *
 * CHANGES v3.0:
 *   • Theme now from ThemeContext (global toggle affects ALL screens)
 *   • Dropdown rendered in a transparent Modal → always top-most, fully clickable
 *   • Dashboard stats fetched from /api/officer/dashboard (real DB values)
 *   • Geofence status from GeofenceContext (green ≤ 0.5 km, red + ⚠ > 0.5 km)
 *   • 3-hour out-of-zone → auto logout handled by GeofenceContext
 *   • Daily Report Card section at bottom with real birth / death / cert counts
 *   • Facility name, type and grade pulled from API response (real DB values)
 *   • Recent Activity fetched from /api/officer/activity (latest 5 records)
 */

import React, {
  useState, useEffect, useCallback, useRef,
} from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator,
  Image, ImageBackground, Dimensions,
  RefreshControl, Modal, TouchableWithoutFeedback,
  Animated,
} from 'react-native'
import AsyncStorage        from '@react-native-async-storage/async-storage'
import { SafeAreaView }    from 'react-native-safe-area-context'
import { LinearGradient }  from 'expo-linear-gradient'
import {
  Baby, Cross, FileText, Clock, Sun, Moon, Bell,
  LogOut, MapPin, RefreshCw, ChevronRight, Shield,
  Building2, Wifi, WifiOff, Stethoscope, Settings,
  AlertTriangle, BarChart3,
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

// ─── API ────────────────────────────────────────────────────────────────────────
const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'https://adlcs-backend.onrender.com/api'

interface DashboardData {
  officerName:      string
  facilityName:     string
  facilityType:     string
  facilityGrade:    string
  todayBirths:      number
  todayDeaths:      number
  pendingCases:     number
  monthBirths:      number
  monthDeaths:      number
  monthCertificates:number
  facilityDeliveries:number
  facilityCertIssued:number
  ritaSynced:       boolean
  facilityGpsLat:   number | null
  facilityGpsLng:   number | null
}

interface ActivityItem {
  id:    string
  icon:  string
  label: string
  name:  string
  time:  string
  color: string
}

async function fetchDashboard(token: string): Promise<DashboardData | null> {
  try {
    const res = await fetch(`${API_BASE}/officer/dashboard`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return null
    const json = await res.json()
    return json.success ? json.data : null
  } catch { return null }
}

async function fetchActivity(token: string): Promise<ActivityItem[]> {
  try {
    const res = await fetch(`${API_BASE}/officer/activity?limit=5`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return []
    const json = await res.json()
    return json.success ? json.data : []
  } catch { return [] }
}

// ─── Constants ─────────────────────────────────────────────────────────────────
const H   = { primary: '#0891b2', primaryL: '#22d3ee', orange: '#f97316' }
const { width: W } = Dimensions.get('window')

// ─── Profile Dropdown (Modal-based — always topmost) ──────────────────────────
function ProfileDropdown({
  visible, anchorY, onClose, onSettings, onLogout, loggingOut,
}: {
  visible: boolean; anchorY: number
  onClose: () => void; onSettings: () => void; onLogout: () => void
  loggingOut: boolean
}) {
  const { theme: T } = useTheme()
  const fadeAnim  = useRef(new Animated.Value(0)).current
  const slideAnim = useRef(new Animated.Value(-8)).current

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: visible ? 1 : 0, duration: visible ? 150 : 100, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: visible ? 0 : -8, duration: visible ? 150 : 100, useNativeDriver: true }),
    ]).start()
  }, [visible])

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={{ flex: 1 }}>
          <TouchableWithoutFeedback>
            <Animated.View style={[
              hc.dropdown,
              { backgroundColor: T.card, borderColor: T.border, top: anchorY + 6, right: 14 },
              { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
            ]}>
              {/* Arrow tip */}
              <View style={[hc.dropArrow,      { borderBottomColor: T.border }]} />
              <View style={[hc.dropArrowInner, { borderBottomColor: T.card  }]} />

              <TouchableOpacity style={hc.dropItem} onPress={onSettings} activeOpacity={0.7}>
                <View style={[hc.dropIcon, { backgroundColor: `${H.primary}18` }]}>
                  <Settings size={14} color={H.primaryL} />
                </View>
                <Text style={[hc.dropLabel, { color: T.text }]}>Settings</Text>
              </TouchableOpacity>

              <View style={[hc.dropDivider, { backgroundColor: T.border }]} />

              <TouchableOpacity style={hc.dropItem} onPress={onLogout} disabled={loggingOut} activeOpacity={0.7}>
                <View style={[hc.dropIcon, { backgroundColor: 'rgba(239,68,68,0.14)' }]}>
                  <LogOut size={14} color="#f87171" />
                </View>
                <Text style={[hc.dropLabel, { color: '#f87171' }]}>
                  {loggingOut ? 'Signing out…' : 'Sign Out'}
                </Text>
              </TouchableOpacity>
            </Animated.View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  )
}

// ─── StatCard ──────────────────────────────────────────────────────────────────
function StatCard({ icon, value, label, color, sub }: {
  icon: React.ReactNode; value: string | number; label: string; color: string; sub?: string
}) {
  const { theme: T } = useTheme()
  return (
    <View style={[hc.statCard, { backgroundColor: T.card, borderColor: T.border }]}>
      <View style={[hc.statIcon, { backgroundColor: `${color}18` }]}>{icon}</View>
      <Text style={[hc.statValue, { color }]}>{String(value)}</Text>
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
    <TouchableOpacity
      style={[hc.actionCard, { backgroundColor: T.card, borderColor: T.border }]}
      onPress={onPress} activeOpacity={0.75}
    >
      <View style={[hc.actionIcon, { backgroundColor: item.bg }]}>{item.icon}</View>
      <Text style={[hc.actionLabel, { color: T.text    }]}>{item.label}</Text>
      <Text style={[hc.actionSub,   { color: T.textSub }]}>{item.sub}</Text>
    </TouchableOpacity>
  )
}

// ─── Screen ────────────────────────────────────────────────────────────────────
export default function HospitalHomeScreen({ navigation }: Props) {
  const { theme: T, isDark, toggleTheme } = useTheme()
  const { inZone, distanceKm, setGeofenceConfig } = useGeofence()

  const [loading,      setLoading]      = useState(true)
  const [refreshing,   setRefreshing]   = useState(false)
  const [loggingOut,   setLoggingOut]   = useState(false)
  const [dropVisible,  setDropVisible]  = useState(false)
  const [dropAnchorY,  setDropAnchorY]  = useState(130)
  const [unread,       setUnread]       = useState(0)
  const [dash,         setDash]         = useState<DashboardData | null>(null)
  const [activity,     setActivity]     = useState<ActivityItem[]>([])
  const [ritaSynced,   setRitaSynced]   = useState(true)

  const avatarRef = useRef<TouchableOpacity>(null)

  // ── Load dashboard data ────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    const token = await AsyncStorage.getItem('adlcs_access_token')
    if (!token) { navigation.replace('Login'); return }

    const [data, acts] = await Promise.all([
      fetchDashboard(token),
      fetchActivity(token),
    ])

    if (data) {
      setDash(data)
      setRitaSynced(data.ritaSynced)
      setUnread(data.pendingCases > 0 ? 1 : 0)

      // Provide GPS coords to geofence monitor
      if (data.facilityGpsLat != null && data.facilityGpsLng != null) {
        setGeofenceConfig({
          gps:  { lat: Number(data.facilityGpsLat), lng: Number(data.facilityGpsLng) },
          role: 'hospital_officer',
        })
      }

      // Cache for offline display
      await AsyncStorage.multiSet([
        ['adlcs_officer_name', data.officerName],
        ['adlcs_facility',     data.facilityName],
      ])
    } else {
      // Fall back to cached values
      const [[, name], [, fac]] = await AsyncStorage.multiGet([
        'adlcs_officer_name', 'adlcs_facility',
      ])
      if (name || fac) {
        setDash(prev => prev ?? {
          officerName: name ?? 'Field Officer',
          facilityName: fac ?? 'Facility',
          facilityType: 'hospital', facilityGrade: '',
          todayBirths: 0, todayDeaths: 0, pendingCases: 0,
          monthBirths: 0, monthDeaths: 0, monthCertificates: 0,
          facilityDeliveries: 0, facilityCertIssued: 0,
          ritaSynced: false, facilityGpsLat: null, facilityGpsLng: null,
        })
      }
    }

    if (acts.length > 0) setActivity(acts)
    setLoading(false)
  }, [navigation, setGeofenceConfig])

  useEffect(() => { loadData() }, [loadData])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await loadData()
    setRefreshing(false)
  }, [loadData])

  // ── Logout ─────────────────────────────────────────────────────────────
  const handleLogout = () => {
    setDropVisible(false)
    Alert.alert('Confirm Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out', style: 'destructive',
        onPress: async () => {
          setLoggingOut(true)
          await AsyncStorage.multiRemove([
            'adlcs_access_token', 'adlcs_refresh_token',
            'adlcs_role', 'adlcs_device_activated',
          ])
          setLoggingOut(false)
          navigation.replace('Login')
        },
      },
    ])
  }

  // ── Measure avatar position for dropdown anchor ─────────────────────────
  const openDropdown = () => {
    avatarRef.current?.measure((_x, _y, _w, h, _px, py) => {
      setDropAnchorY(py + h)
      setDropVisible(true)
    })
  }

  // ── Actions ────────────────────────────────────────────────────────────
  const actions: ActionItem[] = [
    { id: 'birth',   icon: <Baby        size={20} color="#fff" />, label: 'Register',  sub: 'Birth',       bg: TZ.green  },
    { id: 'death',   icon: <Cross       size={20} color="#fff" />, label: 'Record',    sub: 'Death',       bg: '#dc2626' },
    { id: 'cert',    icon: <FileText    size={20} color="#fff" />, label: 'Issue',     sub: 'Certificate', bg: H.primary },
    { id: 'view',    icon: <Stethoscope size={20} color="#fff" />, label: 'View',      sub: 'Records',     bg: '#7c3aed' },
    { id: 'pending', icon: <Clock       size={20} color="#fff" />, label: 'Pending',   sub: 'Cases',       bg: H.orange  },
    { id: 'sync',    icon: <RefreshCw   size={20} color="#fff" />, label: 'Sync',      sub: 'Data',        bg: '#0e7490' },
  ]

  const handleAction = (id: string) => {
    const routes: Record<string, keyof RootStack> = {
      birth:   'RegisterBirth',
      death:   'RecordDeath',
      cert:    'IssueCertificate',
      view:    'ViewRecords',
      pending: 'PendingCases',
      sync:    'SyncData',
    }
    if (routes[id]) navigation.navigate(routes[id])
  }

  const initials = (dash?.officerName ?? 'HO')
    .split(' ').filter(Boolean).slice(0, 2).map(n => n[0]).join('').toUpperCase()

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

      {/* ── MODAL DROPDOWN (topmost layer) ─────────────────────────────── */}
      <ProfileDropdown
        visible={dropVisible}
        anchorY={dropAnchorY}
        onClose={() => setDropVisible(false)}
        onSettings={() => {
          setDropVisible(false)
          Alert.alert('Settings', 'Settings screen — coming in next sprint.')
        }}
        onLogout={handleLogout}
        loggingOut={loggingOut}
      />

      {/* ══════════════════════════ TOP HEADER ════════════════════════════ */}
      <ImageBackground
        source={require('../../../public/assets/flag.jpg')}
        style={hc.headerBg} blurRadius={2} resizeMode="cover"
      >
        <LinearGradient
          colors={isDark
            ? ['rgba(2,20,60,0.70)', 'rgba(8,50,80,0.65)']
            : ['rgba(0,30,100,0.60)', 'rgba(4,60,80,0.58)']}
          style={StyleSheet.absoluteFill}
        />

        {/* TZ flag stripe */}
        <View style={hc.flagStripe}>
          <View style={{ flex: 3, backgroundColor: TZ.green  }} />
          <View style={{ width: 9, backgroundColor: TZ.yellow }} />
          <View style={{ width: 7, backgroundColor: TZ.black  }} />
          <View style={{ width: 9, backgroundColor: TZ.yellow }} />
          <View style={{ flex: 3, backgroundColor: TZ.blue   }} />
        </View>

        {/* Main header row */}
        <View style={hc.headerRow}>
          <View style={hc.nbsLogoWrap}>
            <View style={hc.nbsCircle}>
              <Image source={require('../../../public/assets/longo_nbs.png')}
                style={{ width: 32, height: 32 }} resizeMode="contain" />
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
              <Image source={require('../../../public/assets/court_of_arm.png')}
                style={{ width: 42, height: 42 }} resizeMode="contain" />
            </View>
            <Text style={hc.coatLabel}>TANZANIA</Text>
          </View>
        </View>

        {/* Sub-header row: role badge | theme toggle · bell · avatar */}
        <View style={hc.subHeader}>
          <View style={hc.subLeft}>
            <View style={hc.roleBadge}>
              <View style={[hc.roleDot, { backgroundColor: H.primaryL }]} />
              <Text style={[hc.roleText, { color: H.primaryL }]}>HEALTH FACILITY OFFICER</Text>
            </View>
            <View style={hc.locationRow}>
              <MapPin size={9} color={TZ.yellow} />
              <Text style={hc.locationText} numberOfLines={1}>
                {dash?.facilityName ?? '—'}
              </Text>
            </View>
          </View>

          <View style={hc.subRight}>
            {/* ☀/🌙 toggle — changes theme for ALL screens */}
            <TouchableOpacity style={hc.iconBtn} onPress={toggleTheme}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              {isDark
                ? <Sun  size={14} color={TZ.yellow} />
                : <Moon size={14} color={TZ.yellow} />}
            </TouchableOpacity>

            {/* 🔔 Bell */}
            <TouchableOpacity style={hc.iconBtn}>
              <Bell size={15} color="rgba(255,255,255,0.80)" />
              {unread > 0 && (
                <View style={hc.badge}><Text style={hc.badgeText}>{unread}</Text></View>
              )}
            </TouchableOpacity>

            {/* Avatar → measures its screen position, then opens Modal dropdown */}
            <TouchableOpacity
              ref={avatarRef}
              style={hc.avatarTap}
              onPress={openDropdown}
              activeOpacity={0.8}
            >
              <View style={hc.avatarRing}>
                <View style={[hc.avatar, { backgroundColor: H.primaryL }]}>
                  <Text style={hc.avatarText}>{initials}</Text>
                </View>
              </View>
              <View style={hc.caret} />
            </TouchableOpacity>
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
            <Text style={[hc.welcomeName, { color: T.text    }]}>{dash?.officerName ?? '—'}</Text>
            <Text style={[hc.welcomeDate, { color: T.textDim }]}>
              {new Date().toLocaleDateString('en-TZ', {
                weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
              })}
            </Text>
          </View>

          <View style={hc.welcomeRight}>
            {/* Real geofence status */}
            <View style={[hc.zoneBadge, {
              borderColor:     inZone ? `${H.primary}60`        : 'rgba(239,68,68,0.38)',
              backgroundColor: inZone ? `${H.primary}18`        : 'rgba(239,68,68,0.12)',
            }]}>
              {inZone
                ? <MapPin       size={9} color={H.primaryL} />
                : <AlertTriangle size={9} color="#f87171"  />}
              <Text style={[hc.zoneText, { color: inZone ? H.primaryL : '#f87171' }]}>
                {inZone
                  ? `✓ In Zone · ${distanceKm != null ? distanceKm.toFixed(2) : '0.00'} km`
                  : `✗ Out of Zone · ${distanceKm != null ? distanceKm.toFixed(2) : '—'} km`}
              </Text>
            </View>

            <View style={hc.syncRow}>
              {ritaSynced
                ? <Wifi    size={10} color={T.success} />
                : <WifiOff size={10} color={T.danger}  />}
              <Text style={[hc.syncText, { color: T.textDim }]}>
                {ritaSynced ? 'RITA Synced' : 'Offline'}
              </Text>
            </View>
          </View>
        </View>

        {/* ── STATISTICS (real DB values) ─────────────────────────────── */}
        <View style={hc.sectionHead}>
          <Text style={[hc.sectionTitle, { color: T.text }]}>Today's Statistics</Text>
          <TouchableOpacity onPress={() => navigation.navigate('ViewRecords')}>
            <Text style={[hc.sectionLink, { color: T.primaryL }]}>Full report →</Text>
          </TouchableOpacity>
        </View>
        <View style={hc.statsRow}>
          <StatCard icon={<Baby     size={18} color={TZ.green}  />}
            value={dash?.todayBirths  ?? 0} label="Births"       color={TZ.green}  sub="Today" />
          <StatCard icon={<Cross    size={18} color={T.danger}  />}
            value={dash?.todayDeaths  ?? 0} label="Deaths"       color={T.danger}  sub="Today" />
          <StatCard icon={<FileText size={18} color={H.primary} />}
            value={dash?.monthCertificates ?? 0} label="Certificates" color={H.primary} sub="This month" />
          <StatCard icon={<Clock    size={18} color={H.orange}  />}
            value={dash?.pendingCases ?? 0} label="Pending"      color={H.orange}  sub="Cases" />
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

        {/* ── FACILITY INFO (real DB values) ──────────────────────────── */}
        <View style={hc.sectionHead}>
          <Text style={[hc.sectionTitle, { color: T.text }]}>Facility Information</Text>
        </View>
        <View style={[hc.facilityCard, { backgroundColor: T.card, borderColor: T.border }]}>
          <LinearGradient
            colors={[`${H.primary}22`, `${H.primary}08`]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={hc.facilityGradient}
          >
            <View style={[hc.facilityIcon, { backgroundColor: `${H.primary}25` }]}>
              <Building2 size={22} color={H.primaryL} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[hc.facilityName, { color: T.text    }]}>{dash?.facilityName ?? '—'}</Text>
              <Text style={[hc.facilityType, { color: T.textSub }]}>
                {dash?.facilityType ? `${dash.facilityType.replace(/_/g, ' ')} · ${dash.facilityGrade}` : '—'}
              </Text>
              <View style={hc.facilityRow}>
                <Shield size={10} color={H.primaryL} />
                <Text style={[hc.facilityInfo, { color: T.textDim }]}>Authorized RITA reporting facility</Text>
              </View>
            </View>
          </LinearGradient>

          {/* Real facility-level lifetime stats */}
          <View style={[hc.facilityStats, { borderTopColor: T.border }]}>
            {[
              { label: 'Deliveries',   value: dash?.facilityDeliveries ?? 0, color: TZ.green  },
              { label: 'Certs Issued', value: dash?.facilityCertIssued  ?? 0, color: H.primary },
              { label: 'Pending',      value: dash?.pendingCases        ?? 0, color: H.orange  },
            ].map(s => (
              <View key={s.label} style={hc.facilityStatItem}>
                <Text style={[hc.facilityStatVal,   { color: s.color   }]}>{s.value}</Text>
                <Text style={[hc.facilityStatLabel, { color: T.textDim }]}>{s.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── RECENT ACTIVITY (real DB feed) ──────────────────────────── */}
        <View style={hc.sectionHead}>
          <Text style={[hc.sectionTitle, { color: T.text }]}>Recent Activity</Text>
          <TouchableOpacity onPress={() => navigation.navigate('ViewRecords')}>
            <Text style={[hc.sectionLink, { color: T.primaryL }]}>All →</Text>
          </TouchableOpacity>
        </View>
        <View style={[hc.activityCard, { backgroundColor: T.card, borderColor: T.border }]}>
          {activity.length === 0 ? (
            <View style={{ padding: 24, alignItems: 'center' }}>
              <Text style={{ color: T.textDim, fontSize: 12 }}>No recent activity</Text>
            </View>
          ) : activity.map((item, idx) => (
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
              {idx < activity.length - 1 && (
                <View style={[hc.divider, { backgroundColor: T.border, marginLeft: 60 }]} />
              )}
            </View>
          ))}
        </View>

        {/* ── DAILY REPORT CARD (real DB values) ─────────────────────── */}
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
            { label: 'Births registered today',       value: dash?.todayBirths      ?? 0, color: TZ.green  },
            { label: 'Deaths recorded today',         value: dash?.todayDeaths      ?? 0, color: '#f87171' },
            { label: 'Certificates issued this month',value: dash?.monthCertificates ?? 0, color: H.primary },
            { label: 'Monthly births',                value: dash?.monthBirths       ?? 0, color: TZ.green  },
            { label: 'Monthly deaths',                value: dash?.monthDeaths       ?? 0, color: '#f87171' },
            { label: 'Pending / unresolved cases',    value: dash?.pendingCases      ?? 0, color: H.orange  },
          ].map((row, i, arr) => (
            <View key={row.label} style={[
              hc.reportRow,
              { borderBottomWidth: i < arr.length - 1 ? 1 : 0, borderBottomColor: T.border },
            ]}>
              <Text style={[hc.reportLabel, { color: T.textSub }]}>{row.label}</Text>
              <Text style={[hc.reportValue, { color: row.color }]}>{row.value}</Text>
            </View>
          ))}
          <View style={[hc.reportFooter, { borderTopColor: T.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              {ritaSynced
                ? <Wifi  size={10} color={T.success} />
                : <WifiOff size={10} color={T.danger} />}
              <Text style={{ fontSize: 9, color: T.textDim }}>
                {ritaSynced ? 'Data synced with RITA' : 'Sync pending — connect to internet'}
              </Text>
            </View>
          </View>
        </View>

        {/* ── FOOTER ──────────────────────────────────────────────────── */}
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

// ─── Styles ────────────────────────────────────────────────────────────────────
const hc = StyleSheet.create({
  headerBg:   { overflow: 'hidden' },
  flagStripe: { flexDirection: 'row', height: 5 },
  headerRow:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 10, paddingBottom: 8, gap: 10 },
  nbsLogoWrap:{ alignItems: 'center', width: 56 },
  nbsCircle:  { width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1.5, borderColor: 'rgba(252,209,22,0.55)', alignItems: 'center', justifyContent: 'center' },
  nbsLabel:   { fontSize: 8, fontWeight: '800', color: TZ.yellow, letterSpacing: 1.5, marginTop: 3 },
  headerCenter:{ flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '900', color: '#fff', letterSpacing: 2, textTransform: 'uppercase' },
  headerLine:  { height: 2, width: 44, backgroundColor: TZ.yellow, borderRadius: 1, marginVertical: 4 },
  headerSub:   { fontSize: 9, color: 'rgba(255,255,255,0.72)', letterSpacing: 1.1, textTransform: 'uppercase' },
  coatWrap:   { alignItems: 'center', width: 56 },
  coatCircle: { width: 50, height: 50, borderRadius: 25, backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: 1.5, borderColor: 'rgba(252,209,22,0.48)', alignItems: 'center', justifyContent: 'center' },
  coatLabel:  { fontSize: 7, fontWeight: '700', color: 'rgba(255,255,255,0.60)', letterSpacing: 1.2, marginTop: 3 },
  subHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingBottom: 12, paddingTop: 2 },
  subLeft:    { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  subRight:   { flexDirection: 'row', alignItems: 'center', gap: 7 },
  roleBadge:  { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: '#0891b260', backgroundColor: '#0891b218', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  roleDot:    { width: 5, height: 5, borderRadius: 2.5 },
  roleText:   { fontSize: 8, fontWeight: '700', letterSpacing: 0.7 },
  locationRow:{ flexDirection: 'row', alignItems: 'center', gap: 3, flex: 1 },
  locationText:{ fontSize: 9, color: 'rgba(255,255,255,0.55)', flex: 1 },
  iconBtn:    { width: 30, height: 30, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  badge:      { position: 'absolute', top: -4, right: -4, width: 14, height: 14, borderRadius: 7, backgroundColor: '#ef4444', alignItems: 'center', justifyContent: 'center' },
  badgeText:  { fontSize: 8, fontWeight: '800', color: '#fff' },
  avatarTap:  { flexDirection: 'row', alignItems: 'center', gap: 3 },
  avatarRing: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: TZ.yellow, padding: 2 },
  avatar:     { flex: 1, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 11, fontWeight: '900', color: TZ.navy },
  caret:      { width: 0, height: 0, borderLeftWidth: 4, borderRightWidth: 4, borderTopWidth: 5, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: 'rgba(255,255,255,0.60)' },

  // Dropdown (positioned via Modal)
  dropdown:      { position: 'absolute', width: 152, borderRadius: 12, borderWidth: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.45, shadowRadius: 16, elevation: 20, paddingVertical: 4, zIndex: 9999 },
  dropArrow:     { position: 'absolute', top: -10, right: 16, width: 0, height: 0, borderLeftWidth: 9, borderRightWidth: 9, borderBottomWidth: 10, borderLeftColor: 'transparent', borderRightColor: 'transparent' },
  dropArrowInner:{ position: 'absolute', top: -8,  right: 17, width: 0, height: 0, borderLeftWidth: 8, borderRightWidth: 8, borderBottomWidth: 9, borderLeftColor: 'transparent', borderRightColor: 'transparent' },
  dropItem:      { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 14 },
  dropIcon:      { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  dropLabel:     { fontSize: 13, fontWeight: '600' },
  dropDivider:   { height: 1, marginHorizontal: 14 },

  welcomeCard:  { marginHorizontal: 14, marginTop: 12, borderRadius: 14, borderWidth: 1, padding: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  welcomeHi:    { fontSize: 11 },
  welcomeName:  { fontSize: 18, fontWeight: '800', marginTop: 2 },
  welcomeDate:  { fontSize: 10, marginTop: 3 },
  welcomeRight: { alignItems: 'flex-end', gap: 6 },
  zoneBadge:    { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  zoneText:     { fontSize: 9, fontWeight: '600' },
  syncRow:      { flexDirection: 'row', alignItems: 'center', gap: 4 },
  syncText:     { fontSize: 9 },

  sectionHead:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, marginTop: 18, marginBottom: 10 },
  sectionTitle: { fontSize: 14, fontWeight: '800' },
  sectionLink:  { fontSize: 11 },

  statsRow:     { flexDirection: 'row', paddingHorizontal: 12, gap: 8 },
  statCard:     { flex: 1, borderRadius: 14, borderWidth: 1, padding: 10, alignItems: 'center', gap: 3 },
  statIcon:     { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  statValue:    { fontSize: 20, fontWeight: '900' },
  statLabel:    { fontSize: 9, textAlign: 'center', fontWeight: '600' },
  statSub:      { fontSize: 8, textAlign: 'center' },

  actionsRow:   { flexDirection: 'row', paddingHorizontal: 12, gap: 8 },
  actionCard:   { flex: 1, borderRadius: 14, borderWidth: 1, padding: 12, alignItems: 'center', gap: 6 },
  actionIcon:   { width: 46, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  actionLabel:  { fontSize: 11, fontWeight: '700', textAlign: 'center' },
  actionSub:    { fontSize: 9,  textAlign: 'center' },

  facilityCard:     { marginHorizontal: 14, borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  facilityGradient: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  facilityIcon:     { width: 46, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  facilityName:     { fontSize: 13, fontWeight: '800', marginBottom: 2 },
  facilityType:     { fontSize: 11, marginBottom: 4 },
  facilityRow:      { flexDirection: 'row', alignItems: 'center', gap: 4 },
  facilityInfo:     { fontSize: 10 },
  facilityStats:    { flexDirection: 'row', borderTopWidth: 1, paddingVertical: 12, paddingHorizontal: 16 },
  facilityStatItem: { flex: 1, alignItems: 'center' },
  facilityStatVal:  { fontSize: 18, fontWeight: '900' },
  facilityStatLabel:{ fontSize: 9, marginTop: 2 },

  activityCard:  { marginHorizontal: 14, borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  activityRow:   { flexDirection: 'row', alignItems: 'center', padding: 14 },
  activityDot:   { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  activityLabel: { fontSize: 10, marginBottom: 2 },
  activityName:  { fontSize: 12, fontWeight: '600' },
  activityTime:  { fontSize: 9 },
  divider:       { height: 1 },

  // Daily report card
  reportCard:    { marginHorizontal: 14, borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  reportRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 11, paddingHorizontal: 16 },
  reportLabel:   { fontSize: 12 },
  reportValue:   { fontSize: 16, fontWeight: '900' },
  reportFooter:  { paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, flexDirection: 'row', justifyContent: 'flex-end' },

  footer:     { alignItems: 'center', paddingTop: 24, gap: 6 },
  footerFlag: { flexDirection: 'row', width: 80, height: 3, marginBottom: 8 },
  footerText: { fontSize: 9 },
})
