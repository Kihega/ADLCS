/**
 * VillageHomeScreen.tsx — Village Officer Dashboard  v3.0
 * Tanzania NBS-CENSUS · Government Design System
 *
 * CHANGES v3.0:
 *   • Theme from ThemeContext (global toggle shared with hospital screens)
 *   • Geofence status from GeofenceContext (1 km radius, 3-hr logout)
 *   • Dashboard stats fetched from /api/officer/dashboard (real DB values)
 *   • Recent activity fetched from /api/officer/activity
 *   • Daily Report Card at bottom with real DB counts
 *   • Profile dropdown rendered via Modal (always topmost, fully clickable)
 */

import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator,
  Image, ImageBackground, Dimensions,
  RefreshControl, Modal, TouchableWithoutFeedback, Animated,
} from 'react-native'
import AsyncStorage        from '@react-native-async-storage/async-storage'
import { SafeAreaView }    from 'react-native-safe-area-context'
import { LinearGradient }  from 'expo-linear-gradient'
import {
  Users, Baby, Cross, Navigation, Sun, Moon,
  Bell, LogOut, MapPin, RefreshCw, ChevronRight,
  UserPlus, FileText, Shield, Clock,
  Wifi, WifiOff, AlertTriangle, Settings, BarChart3,
} from 'lucide-react-native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'

import { useTheme, TZ }    from '../../context/ThemeContext'
import { useGeofence }     from '../../context/GeofenceContext'

// ─── Types ────────────────────────────────────────────────────────────────────
type RootStack = {
  Splash: undefined; Login: undefined
  VillageHome: undefined; HospitalHome: undefined
}
type Props = { navigation: NativeStackNavigationProp<RootStack, 'VillageHome'> }

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'https://adlcs-backend.onrender.com/api'
const { width: W } = Dimensions.get('window')

// ─── API Interfaces ───────────────────────────────────────────────────────────
interface VillageDashData {
  officerName:    string
  employeeId:     string
  villageName:    string
  wardName:       string
  totalCitizens:  number
  monthBirths:    number
  monthDeaths:    number
  monthMigrations:number
  pendingCases:   number
  ritaSynced:     boolean
  villageGpsLat:  number | null
  villageGpsLng:  number | null
}

interface ActivityItem {
  id: string; icon: string; label: string; name: string; time: string; color: string
}

async function fetchVillageDashboard(token: string): Promise<VillageDashData | null> {
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

// ─── Profile Dropdown (Modal) ─────────────────────────────────────────────────
function ProfileDropdown({
  visible, anchorY, onClose, onSettings, onLogout, loggingOut,
}: {
  visible: boolean; anchorY: number
  onClose: () => void; onSettings: () => void; onLogout: () => void; loggingOut: boolean
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
              vc.dropdown,
              { backgroundColor: T.card, borderColor: T.border, top: anchorY + 6, right: 14 },
              { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
            ]}>
              <View style={[vc.dropArrow,      { borderBottomColor: T.border }]} />
              <View style={[vc.dropArrowInner, { borderBottomColor: T.card  }]} />

              <TouchableOpacity style={vc.dropItem} onPress={onSettings} activeOpacity={0.7}>
                <View style={[vc.dropIcon, { backgroundColor: '#1eb53a18' }]}>
                  <Settings size={14} color={TZ.green} />
                </View>
                <Text style={[vc.dropLabel, { color: T.text }]}>Settings</Text>
              </TouchableOpacity>

              <View style={[vc.dropDivider, { backgroundColor: T.border }]} />

              <TouchableOpacity style={vc.dropItem} onPress={onLogout} disabled={loggingOut} activeOpacity={0.7}>
                <View style={[vc.dropIcon, { backgroundColor: 'rgba(239,68,68,0.14)' }]}>
                  <LogOut size={14} color="#f87171" />
                </View>
                <Text style={[vc.dropLabel, { color: '#f87171' }]}>
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

// ─── StatCard ─────────────────────────────────────────────────────────────────
function StatCard({ icon, value, label, color }: {
  icon: React.ReactNode; value: string | number; label: string; color: string
}) {
  const { theme: T } = useTheme()
  return (
    <View style={[vc.statCard, { backgroundColor: T.card, borderColor: T.border }]}>
      <View style={[vc.statIcon, { backgroundColor: `${color}18` }]}>{icon}</View>
      <Text style={[vc.statValue, { color }]}>{String(value)}</Text>
      <Text style={[vc.statLabel, { color: T.textSub }]}>{label}</Text>
    </View>
  )
}

// ─── ActionCard ───────────────────────────────────────────────────────────────
type ActionItem = { id: string; icon: React.ReactNode; label: string; sub: string; bg: string }
function ActionCard({ item, onPress }: { item: ActionItem; onPress: () => void }) {
  const { theme: T } = useTheme()
  return (
    <TouchableOpacity
      style={[vc.actionCard, { backgroundColor: T.card, borderColor: T.border }]}
      onPress={onPress} activeOpacity={0.75}
    >
      <View style={[vc.actionIcon, { backgroundColor: item.bg }]}>{item.icon}</View>
      <Text style={[vc.actionLabel, { color: T.text    }]}>{item.label}</Text>
      <Text style={[vc.actionSub,   { color: T.textSub }]}>{item.sub}</Text>
    </TouchableOpacity>
  )
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function VillageHomeScreen({ navigation }: Props) {
  const { theme: T, isDark, toggleTheme } = useTheme()
  const { inZone, distanceKm, setGeofenceConfig } = useGeofence()

  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [dropVisible,setDropVisible]= useState(false)
  const [dropAnchorY,setDropAnchorY]= useState(130)
  const [unread,     setUnread]     = useState(0)
  const [dash,       setDash]       = useState<VillageDashData | null>(null)
  const [activity,   setActivity]   = useState<ActivityItem[]>([])
  const [ritaSynced, setRitaSynced] = useState(true)

  const avatarRef = useRef<TouchableOpacity>(null)

  const loadData = useCallback(async () => {
    const token = await AsyncStorage.getItem('adlcs_access_token')
    if (!token) { navigation.replace('Login'); return }

    const [data, acts] = await Promise.all([
      fetchVillageDashboard(token),
      fetchActivity(token),
    ])

    if (data) {
      setDash(data)
      setRitaSynced(data.ritaSynced)
      setUnread(data.pendingCases > 0 ? 1 : 0)
      if (data.villageGpsLat != null && data.villageGpsLng != null) {
        setGeofenceConfig({
          gps:  { lat: Number(data.villageGpsLat), lng: Number(data.villageGpsLng) },
          role: 'village_officer',
        })
      }
      await AsyncStorage.multiSet([
        ['adlcs_officer_name', data.officerName],
        ['adlcs_facility',     data.villageName],
      ])
    } else {
      const [[, name], [, village]] = await AsyncStorage.multiGet(['adlcs_officer_name', 'adlcs_facility'])
      setDash(prev => prev ?? {
        officerName: name ?? 'Field Officer', employeeId: '—',
        villageName: village ?? 'Village', wardName: '—',
        totalCitizens: 0, monthBirths: 0, monthDeaths: 0,
        monthMigrations: 0, pendingCases: 0, ritaSynced: false,
        villageGpsLat: null, villageGpsLng: null,
      })
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

  const handleLogout = () => {
    setDropVisible(false)
    Alert.alert('Confirm Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out', style: 'destructive',
        onPress: async () => {
          setLoggingOut(true)
          await AsyncStorage.multiRemove(['adlcs_access_token', 'adlcs_refresh_token', 'adlcs_role', 'adlcs_device_activated'])
          navigation.replace('Login')
        },
      },
    ])
  }

  const openDropdown = () => {
    avatarRef.current?.measure((_x, _y, _w, h, _px, py) => {
      setDropAnchorY(py + h)
      setDropVisible(true)
    })
  }

  const actions: ActionItem[] = [
    { id: 'citizen',   icon: <UserPlus   size={20} color="#fff" />, label: 'Register',  sub: 'Citizen',    bg: TZ.blue    },
    { id: 'birth',     icon: <Baby       size={20} color="#fff" />, label: 'Record',    sub: 'Birth',      bg: TZ.green   },
    { id: 'death',     icon: <Cross      size={20} color="#fff" />, label: 'Record',    sub: 'Death',      bg: '#dc2626'  },
    { id: 'migration', icon: <Navigation size={20} color="#fff" />, label: 'Record',    sub: 'Migration',  bg: '#f97316'  },
    { id: 'reports',   icon: <FileText   size={20} color="#fff" />, label: 'View',      sub: 'Reports',    bg: '#7c3aed'  },
    { id: 'sync',      icon: <RefreshCw  size={20} color="#fff" />, label: 'Sync',      sub: 'Data',       bg: '#0e7490'  },
  ]

  const handleAction = (id: string) => {
    const coming = ['citizen', 'migration', 'reports']
    if (coming.includes(id)) {
      Alert.alert('Coming Soon', 'This feature is being built in the next sprint.')
    } else if (id === 'birth') {
      Alert.alert('Birth', 'Village birth recording — next sprint.')
    } else if (id === 'death') {
      Alert.alert('Death', 'Village death recording — next sprint.')
    } else if (id === 'sync') {
      Alert.alert('Sync', 'Triggering data sync…')
    }
  }

  const initials = (dash?.officerName ?? 'VO')
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

      <ProfileDropdown
        visible={dropVisible} anchorY={dropAnchorY}
        onClose={() => setDropVisible(false)}
        onSettings={() => { setDropVisible(false); Alert.alert('Settings', 'Settings — next sprint.') }}
        onLogout={handleLogout} loggingOut={loggingOut}
      />

      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <ImageBackground
        source={require('../../../public/assets/flag.jpg')}
        style={vc.headerBg} blurRadius={2} resizeMode="cover"
      >
        <LinearGradient
          colors={isDark
            ? ['rgba(2,20,60,0.72)', 'rgba(5,40,20,0.70)']
            : ['rgba(0,50,20,0.65)', 'rgba(0,80,30,0.60)']}
          style={StyleSheet.absoluteFill}
        />
        <View style={vc.flagStripe}>
          <View style={{ flex: 3, backgroundColor: TZ.green  }} />
          <View style={{ width: 9, backgroundColor: TZ.yellow }} />
          <View style={{ width: 7, backgroundColor: TZ.black  }} />
          <View style={{ width: 9, backgroundColor: TZ.yellow }} />
          <View style={{ flex: 3, backgroundColor: TZ.blue   }} />
        </View>

        <View style={vc.headerRow}>
          <View style={vc.nbsLogoWrap}>
            <View style={vc.nbsCircle}>
              <Image source={require('../../../public/assets/longo_nbs.png')}
                style={{ width: 32, height: 32 }} resizeMode="contain" />
            </View>
            <Text style={vc.nbsLabel}>NBS</Text>
          </View>
          <View style={vc.headerCenter}>
            <Text style={vc.headerTitle}>NBS-CENSUS</Text>
            <View style={vc.headerLine} />
            <Text style={vc.headerSub}>Census for Development</Text>
          </View>
          <View style={vc.coatWrap}>
            <View style={vc.coatCircle}>
              <Image source={require('../../../public/assets/court_of_arm.png')}
                style={{ width: 42, height: 42 }} resizeMode="contain" />
            </View>
            <Text style={vc.coatLabel}>TANZANIA</Text>
          </View>
        </View>

        <View style={vc.subHeader}>
          <View style={vc.subLeft}>
            <View style={vc.roleBadge}>
              <View style={[vc.roleDot, { backgroundColor: '#34d399' }]} />
              <Text style={[vc.roleText, { color: '#34d399' }]}>VILLAGE OFFICER</Text>
            </View>
            <View style={vc.locationRow}>
              <MapPin size={9} color={TZ.yellow} />
              <Text style={vc.locationText} numberOfLines={1}>{dash?.villageName ?? '—'}</Text>
            </View>
          </View>

          <View style={vc.subRight}>
            <TouchableOpacity style={vc.iconBtn} onPress={toggleTheme}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              {isDark ? <Sun size={14} color={TZ.yellow} /> : <Moon size={14} color={TZ.yellow} />}
            </TouchableOpacity>
            <TouchableOpacity style={vc.iconBtn}>
              <Bell size={15} color="rgba(255,255,255,0.80)" />
              {unread > 0 && <View style={vc.badge}><Text style={vc.badgeText}>{unread}</Text></View>}
            </TouchableOpacity>
            <TouchableOpacity ref={avatarRef} style={vc.avatarTap} onPress={openDropdown} activeOpacity={0.8}>
              <View style={vc.avatarRing}>
                <View style={[vc.avatar, { backgroundColor: '#34d399' }]}>
                  <Text style={vc.avatarText}>{initials}</Text>
                </View>
              </View>
              <View style={vc.caret} />
            </TouchableOpacity>
          </View>
        </View>
      </ImageBackground>

      {/* ── SCROLL BODY ───────────────────────────────────────────────────── */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        style={{ backgroundColor: T.bg }}
        contentContainerStyle={{ paddingBottom: 36 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.primary} />}
      >
        {/* Welcome banner */}
        <View style={[vc.welcomeCard, { backgroundColor: T.card, borderColor: T.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[vc.welcomeHi,   { color: T.textSub }]}>Welcome back,</Text>
            <Text style={[vc.welcomeName, { color: T.text    }]}>{dash?.officerName ?? '—'}</Text>
            <Text style={[vc.welcomeEmp,  { color: T.textDim }]}>
              {dash?.employeeId ?? '—'} · {dash?.villageName ?? '—'}, {dash?.wardName ?? '—'}
            </Text>
            <Text style={[vc.welcomeDate, { color: T.textDim }]}>
              {new Date().toLocaleDateString('en-TZ', {
                weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
              })}
            </Text>
          </View>
          <View style={vc.welcomeRight}>
            <View style={[vc.zoneBadge, {
              borderColor:     inZone ? '#1eb53a60' : 'rgba(239,68,68,0.38)',
              backgroundColor: inZone ? '#1eb53a18' : 'rgba(239,68,68,0.12)',
            }]}>
              {inZone
                ? <MapPin       size={9} color="#34d399" />
                : <AlertTriangle size={9} color="#f87171" />}
              <Text style={[vc.zoneText, { color: inZone ? '#34d399' : '#f87171' }]}>
                {inZone
                  ? `✓ In Zone · ${distanceKm != null ? distanceKm.toFixed(2) : '0.00'} km`
                  : `✗ Out of Zone · ${distanceKm != null ? distanceKm.toFixed(2) : '—'} km`}
              </Text>
            </View>
            <View style={vc.syncRow}>
              {ritaSynced ? <Wifi size={10} color={T.success} /> : <WifiOff size={10} color={T.danger} />}
              <Text style={[vc.syncText, { color: T.textDim }]}>{ritaSynced ? 'NBS Synced' : 'Offline'}</Text>
            </View>
          </View>
        </View>

        {/* Stats — real DB values */}
        <View style={vc.sectionHead}>
          <Text style={[vc.sectionTitle, { color: T.text }]}>This Month's Statistics</Text>
        </View>
        <View style={vc.statsRow}>
          <StatCard icon={<Users      size={18} color={T.primary} />}
            value={dash?.totalCitizens  ?? 0} label="Citizens"   color={T.primary} />
          <StatCard icon={<Baby       size={18} color={TZ.green}  />}
            value={dash?.monthBirths    ?? 0} label="Births"     color={TZ.green}  />
          <StatCard icon={<Cross      size={18} color={T.danger}  />}
            value={dash?.monthDeaths    ?? 0} label="Deaths"     color={T.danger}  />
          <StatCard icon={<Navigation size={18} color="#f97316"   />}
            value={dash?.monthMigrations ?? 0} label="Migrations" color="#f97316"  />
        </View>

        {/* Quick actions */}
        <View style={vc.sectionHead}>
          <Text style={[vc.sectionTitle, { color: T.text }]}>Quick Actions</Text>
        </View>
        <View style={vc.actionsRow}>
          {actions.slice(0, 3).map(a => <ActionCard key={a.id} item={a} onPress={() => handleAction(a.id)} />)}
        </View>
        <View style={[vc.actionsRow, { marginTop: 8 }]}>
          {actions.slice(3).map(a => <ActionCard key={a.id} item={a} onPress={() => handleAction(a.id)} />)}
        </View>

        {/* Recent activity */}
        <View style={vc.sectionHead}>
          <Text style={[vc.sectionTitle, { color: T.text }]}>Recent Activity</Text>
          <TouchableOpacity><Text style={[vc.sectionLink, { color: T.primaryL }]}>All →</Text></TouchableOpacity>
        </View>
        <View style={[vc.activityCard, { backgroundColor: T.card, borderColor: T.border }]}>
          {activity.length === 0
            ? <View style={{ padding: 24, alignItems: 'center' }}>
                <Text style={{ color: T.textDim, fontSize: 12 }}>No recent activity</Text>
              </View>
            : activity.map((item, idx) => (
                <View key={item.id}>
                  <TouchableOpacity style={vc.activityRow} activeOpacity={0.7}>
                    <View style={[vc.activityDot, { backgroundColor: `${item.color}22` }]}>
                      <Text style={{ fontSize: 15 }}>{item.icon}</Text>
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={[vc.activityLabel, { color: T.textSub }]}>{item.label}</Text>
                      <Text style={[vc.activityName,  { color: T.text    }]}>{item.name}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <Text style={[vc.activityTime, { color: T.textDim }]}>{item.time}</Text>
                      <ChevronRight size={13} color={T.textDim} />
                    </View>
                  </TouchableOpacity>
                  {idx < activity.length - 1 && (
                    <View style={[vc.divider, { backgroundColor: T.border, marginLeft: 60 }]} />
                  )}
                </View>
              ))}
        </View>

        {/* Daily Report Card */}
        <View style={vc.sectionHead}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <BarChart3 size={14} color={T.primaryL} />
            <Text style={[vc.sectionTitle, { color: T.text }]}>Monthly Report Card</Text>
          </View>
          <Text style={[vc.sectionLink, { color: T.textDim }]}>
            {new Date().toLocaleDateString('en-TZ', { month: 'long', year: 'numeric' })}
          </Text>
        </View>
        <View style={[vc.reportCard, { backgroundColor: T.card, borderColor: T.border }]}>
          {[
            { label: 'Total registered citizens', value: dash?.totalCitizens   ?? 0, color: T.primary },
            { label: 'Births recorded',            value: dash?.monthBirths     ?? 0, color: TZ.green  },
            { label: 'Deaths recorded',            value: dash?.monthDeaths     ?? 0, color: '#f87171' },
            { label: 'Migrations recorded',        value: dash?.monthMigrations ?? 0, color: '#f97316' },
            { label: 'Pending cases',              value: dash?.pendingCases    ?? 0, color: '#f97316' },
          ].map((row, i, arr) => (
            <View key={row.label} style={[vc.reportRow, {
              borderBottomWidth: i < arr.length - 1 ? 1 : 0,
              borderBottomColor: T.border,
            }]}>
              <Text style={[vc.reportLabel, { color: T.textSub }]}>{row.label}</Text>
              <Text style={[vc.reportValue, { color: row.color }]}>{row.value}</Text>
            </View>
          ))}
          <View style={[vc.reportFooter, { borderTopColor: T.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              {ritaSynced ? <Wifi size={10} color={T.success} /> : <WifiOff size={10} color={T.danger} />}
              <Text style={{ fontSize: 9, color: T.textDim }}>
                {ritaSynced ? 'Data synced with NBS' : 'Sync pending'}
              </Text>
            </View>
          </View>
        </View>

        <View style={vc.footer}>
          <View style={vc.footerFlag}>
            <View style={{ flex: 1, backgroundColor: TZ.green,  height: 3, borderRadius: 1 }} />
            <View style={{ width: 8,  backgroundColor: TZ.yellow, height: 3 }} />
            <View style={{ width: 6,  backgroundColor: TZ.black,  height: 3 }} />
            <View style={{ width: 8,  backgroundColor: TZ.yellow, height: 3 }} />
            <View style={{ flex: 1, backgroundColor: TZ.blue,   height: 3, borderRadius: 1 }} />
          </View>
          <Text style={[vc.footerText, { color: T.textDim }]}>National Bureau of Statistics · Village Officer Reporting</Text>
          <Text style={[vc.footerText, { color: T.textDim }]}>© 2026 The United Republic of Tanzania</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const vc = StyleSheet.create({
  headerBg:     { overflow: 'hidden' },
  flagStripe:   { flexDirection: 'row', height: 5 },
  headerRow:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 10, paddingBottom: 8, gap: 10 },
  nbsLogoWrap:  { alignItems: 'center', width: 56 },
  nbsCircle:    { width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1.5, borderColor: 'rgba(252,209,22,0.55)', alignItems: 'center', justifyContent: 'center' },
  nbsLabel:     { fontSize: 8, fontWeight: '800', color: TZ.yellow, letterSpacing: 1.5, marginTop: 3 },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle:  { fontSize: 17, fontWeight: '900', color: '#fff', letterSpacing: 2, textTransform: 'uppercase' },
  headerLine:   { height: 2, width: 44, backgroundColor: TZ.yellow, borderRadius: 1, marginVertical: 4 },
  headerSub:    { fontSize: 9, color: 'rgba(255,255,255,0.72)', letterSpacing: 1.1, textTransform: 'uppercase' },
  coatWrap:     { alignItems: 'center', width: 56 },
  coatCircle:   { width: 50, height: 50, borderRadius: 25, backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: 1.5, borderColor: 'rgba(252,209,22,0.48)', alignItems: 'center', justifyContent: 'center' },
  coatLabel:    { fontSize: 7, fontWeight: '700', color: 'rgba(255,255,255,0.60)', letterSpacing: 1.2, marginTop: 3 },
  subHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingBottom: 12, paddingTop: 2 },
  subLeft:      { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  subRight:     { flexDirection: 'row', alignItems: 'center', gap: 7 },
  roleBadge:    { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: '#1eb53a60', backgroundColor: '#1eb53a18', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  roleDot:      { width: 5, height: 5, borderRadius: 2.5 },
  roleText:     { fontSize: 8, fontWeight: '700', letterSpacing: 0.7 },
  locationRow:  { flexDirection: 'row', alignItems: 'center', gap: 3, flex: 1 },
  locationText: { fontSize: 9, color: 'rgba(255,255,255,0.55)', flex: 1 },
  iconBtn:      { width: 30, height: 30, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  badge:        { position: 'absolute', top: -4, right: -4, width: 14, height: 14, borderRadius: 7, backgroundColor: '#ef4444', alignItems: 'center', justifyContent: 'center' },
  badgeText:    { fontSize: 8, fontWeight: '800', color: '#fff' },
  avatarTap:    { flexDirection: 'row', alignItems: 'center', gap: 3 },
  avatarRing:   { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: TZ.yellow, padding: 2 },
  avatar:       { flex: 1, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  avatarText:   { fontSize: 11, fontWeight: '900', color: TZ.navy },
  caret:        { width: 0, height: 0, borderLeftWidth: 4, borderRightWidth: 4, borderTopWidth: 5, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: 'rgba(255,255,255,0.60)' },
  dropdown:     { position: 'absolute', width: 152, borderRadius: 12, borderWidth: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.45, shadowRadius: 16, elevation: 20, paddingVertical: 4 },
  dropArrow:    { position: 'absolute', top: -10, right: 16, width: 0, height: 0, borderLeftWidth: 9, borderRightWidth: 9, borderBottomWidth: 10, borderLeftColor: 'transparent', borderRightColor: 'transparent' },
  dropArrowInner:{ position: 'absolute', top: -8, right: 17, width: 0, height: 0, borderLeftWidth: 8, borderRightWidth: 8, borderBottomWidth: 9, borderLeftColor: 'transparent', borderRightColor: 'transparent' },
  dropItem:     { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 14 },
  dropIcon:     { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  dropLabel:    { fontSize: 13, fontWeight: '600' },
  dropDivider:  { height: 1, marginHorizontal: 14 },
  welcomeCard:  { marginHorizontal: 14, marginTop: 12, borderRadius: 14, borderWidth: 1, padding: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  welcomeHi:    { fontSize: 11 },
  welcomeName:  { fontSize: 18, fontWeight: '800', marginTop: 2 },
  welcomeEmp:   { fontSize: 10, marginTop: 2 },
  welcomeDate:  { fontSize: 10, marginTop: 2 },
  welcomeRight: { alignItems: 'flex-end', gap: 6 },
  zoneBadge:    { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  zoneText:     { fontSize: 9, fontWeight: '600' },
  syncRow:      { flexDirection: 'row', alignItems: 'center', gap: 4 },
  syncText:     { fontSize: 9 },
  sectionHead:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, marginTop: 18, marginBottom: 10 },
  sectionTitle: { fontSize: 14, fontWeight: '800' },
  sectionLink:  { fontSize: 11 },
  statsRow:     { flexDirection: 'row', paddingHorizontal: 12, gap: 8 },
  statCard:     { flex: 1, borderRadius: 14, borderWidth: 1, padding: 12, alignItems: 'center', gap: 5 },
  statIcon:     { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  statValue:    { fontSize: 20, fontWeight: '900' },
  statLabel:    { fontSize: 9, textAlign: 'center', fontWeight: '500' },
  actionsRow:   { flexDirection: 'row', paddingHorizontal: 12, gap: 8 },
  actionCard:   { flex: 1, borderRadius: 14, borderWidth: 1, padding: 12, alignItems: 'center', gap: 6 },
  actionIcon:   { width: 46, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  actionLabel:  { fontSize: 11, fontWeight: '700', textAlign: 'center' },
  actionSub:    { fontSize: 9, textAlign: 'center' },
  activityCard: { marginHorizontal: 14, borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  activityRow:  { flexDirection: 'row', alignItems: 'center', padding: 14 },
  activityDot:  { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  activityLabel:{ fontSize: 10, marginBottom: 2 },
  activityName: { fontSize: 12, fontWeight: '600' },
  activityTime: { fontSize: 9 },
  divider:      { height: 1 },
  reportCard:   { marginHorizontal: 14, borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  reportRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 11, paddingHorizontal: 16 },
  reportLabel:  { fontSize: 12 },
  reportValue:  { fontSize: 16, fontWeight: '900' },
  reportFooter: { paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, flexDirection: 'row', justifyContent: 'flex-end' },
  footer:       { alignItems: 'center', paddingTop: 24, gap: 6 },
  footerFlag:   { flexDirection: 'row', width: 80, height: 3, marginBottom: 8 },
  footerText:   { fontSize: 9 },
})
