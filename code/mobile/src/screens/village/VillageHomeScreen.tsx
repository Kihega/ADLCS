/**
 * VillageHomeScreen.tsx  v7.0  PRODUCTION
 *
 * Inherits EXACT layout from HospitalHomeScreen:
 *  - Same NBS header (flag, logos, coat of arms)
 *  - Same stable sidebar (InteractionManager, no freeze)
 *  - Same Officer ID card modal
 *  - Same geofence badge + connection status
 *  - Green accent (#1eb53a) instead of Hospital blue
 *
 * Village actions (NO birth registration — handled by Hospital Officer):
 *  Row 1: Register Citizen | Register Marriage | Record Death | Register Building
 *  Row 2: Register Infrastructure | Track Migration | View Records  | Sync Data
 */

import React, {



 useState, useEffect, useCallback, useRef } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Image,
  ImageBackground,
  RefreshControl,
  Animated,
  Modal,
  TouchableWithoutFeedback,
  Share,
  Dimensions,
  InteractionManager,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import {
  Cross,
  Sun,
  Moon,
  Bell,
  LogOut,
  MapPin,
  ChevronRight,
  Shield,
  Building2,
  Heart,
  Wifi,
  WifiOff,
  BarChart3,
  User,
  Lock,
  Menu,
  X,
  Download,
  WifiLow,
  IdCard,
} from 'lucide-react-native'
import { useFocusEffect } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'

import {
  fetchRemoteDashboard,
  fetchRemoteActivity,
  checkConnQuality,
  ConnQuality,
} from '../../services/syncService'
import { useTheme, TZ } from '../../context/ThemeContext'

type VStack = {
  Splash: undefined
  Login: undefined
  VillageHome: undefined
  HospitalHome: undefined
  RegisterCitizen: undefined
  RegisterMarriage: undefined
  VillageRecordDeath: undefined
  NINRegistration: undefined
  SyncData: undefined
}
type Props = { navigation: NativeStackNavigationProp<VStack, 'VillageHome'> }

const G = '#1eb53a' // TZ green accent for village
const W = Dimensions.get('window').width
const CONN_COLORS: Record<ConnQuality, string> = {
  Good: '#4ade80',
  Fair: '#fbbf24',
  Offline: '#f87171',
}

// ─── Officer ID Card (same as Hospital but with green accent) ─────────────────
function OfficerIdCard({
  visible,
  onClose,
  officer,
}: {
  visible: boolean
  onClose: () => void
  officer: Record<string, any>
}) {
  const { theme: T } = useTheme()
  const initials = (officer.officerName ?? 'VO')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n: string) => n[0])
    .join('')
    .toUpperCase()
  const yr = new Date().getFullYear()
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={ic.overlay}>
        <View style={ic.sheet}>
          <View style={[ic.handle, { backgroundColor: T.border }]} />
          <View style={ic.card}>
            <LinearGradient colors={['#02143c', '#064e2e', '#1eb53a']} style={ic.cardHeader}>
              <View style={ic.flag}>
                <View style={{ flex: 3, backgroundColor: TZ.green }} />
                <View style={{ width: 6, backgroundColor: TZ.yellow }} />
                <View style={{ width: 5, backgroundColor: TZ.black }} />
                <View style={{ width: 6, backgroundColor: TZ.yellow }} />
                <View style={{ flex: 3, backgroundColor: TZ.blue }} />
              </View>
              <View style={ic.headerRow}>
                <Image
                  source={require('../../../public/assets/court_of_arm.png')}
                  style={{ width: 36, height: 36 }}
                  resizeMode="contain"
                />
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={ic.hTitle}>UNITED REPUBLIC OF TANZANIA</Text>
                  <Text style={ic.hSub}>NATIONAL BUREAU OF STATISTICS</Text>
                  <Text style={ic.hRole}>VILLAGE EXECUTIVE OFFICER CARD</Text>
                </View>
                <Image
                  source={require('../../../public/assets/longo_nbs.png')}
                  style={{ width: 36, height: 36 }}
                  resizeMode="contain"
                />
              </View>
            </LinearGradient>
            <View style={ic.body}>
              <View style={ic.photoCol}>
                <View style={[ic.photo, { borderColor: G }]}>
                  <Text style={[ic.photoTxt, { color: G }]}>{initials}</Text>
                </View>
                <View style={ic.activePill}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: G }} />
                  <Text style={[ic.activeText, { color: G }]}>ACTIVE</Text>
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={ic.name}>{officer.officerName ?? '—'}</Text>
                <Text style={[ic.roleText, { color: G }]}>Village Executive Officer</Text>
                <View
                  style={{ height: 1, backgroundColor: 'rgba(0,0,0,0.08)', marginVertical: 8 }}
                />
                {[
                  [
                    'Employee ID',
                    officer.employeeId ?? `NBS-VO-${Date.now().toString().slice(-6)}`,
                  ],
                  ['Village', officer.villageName ?? '—'],
                  ['Ward', officer.wardName ?? '—'],
                  ['Issued', `${yr}`],
                  ['Expires', `${yr + 2}`],
                ].map(([k, v]) => (
                  <View key={k} style={{ flexDirection: 'row', marginBottom: 3 }}>
                    <Text style={ic.dk}>{k}:</Text>
                    <Text style={ic.dv} numberOfLines={1}>
                      {v}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
            <View style={ic.footer}>
              <View style={ic.barcode}>
                {Array.from({ length: 28 }, (_, i) => (
                  <View
                    key={i}
                    style={{
                      width: i % 3 === 0 ? 3 : 1.5,
                      height: i % 5 === 0 ? 28 : 22,
                      backgroundColor: '#1a1a1a',
                      marginHorizontal: 0.5,
                    }}
                  />
                ))}
              </View>
              <Text style={ic.footNote}>NBS Tanzania · Village Officer ID · © {yr}</Text>
            </View>
          </View>
          <TouchableOpacity style={[ic.closeBtn, { backgroundColor: G }]} onPress={onClose}>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

const ic = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#f8fafc',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 36,
  },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  card: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 16,
  },
  cardHeader: { paddingBottom: 12 },
  flag: { flexDirection: 'row', height: 5 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 10,
  },
  hTitle: {
    fontSize: 8,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 1.5,
    textAlign: 'center',
  },
  hSub: { fontSize: 7, color: 'rgba(255,255,255,0.75)', textAlign: 'center', marginTop: 2 },
  hRole: {
    fontSize: 10,
    fontWeight: '900',
    color: TZ.yellow,
    letterSpacing: 2,
    textAlign: 'center',
    marginTop: 4,
  },
  body: { flexDirection: 'row', backgroundColor: '#fff', padding: 14, gap: 12 },
  photoCol: { alignItems: 'center', gap: 8 },
  photo: {
    width: 80,
    height: 90,
    borderRadius: 8,
    backgroundColor: '#e6f7ee',
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoTxt: { fontSize: 28, fontWeight: '900' },
  activePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: '#1eb53a50',
    borderRadius: 20,
    backgroundColor: '#1eb53a20',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  activeText: { fontSize: 8, fontWeight: '700' },
  name: { fontSize: 15, fontWeight: '900', color: '#0f172a' },
  roleText: { fontSize: 10, fontWeight: '600', marginTop: 2 },
  dk: { fontSize: 9, color: '#64748b', width: 72 },
  dv: { fontSize: 9, fontWeight: '700', color: '#0f172a', flex: 1 },
  footer: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
    gap: 6,
  },
  barcode: { flexDirection: 'row', alignItems: 'center', height: 32 },
  footNote: { fontSize: 7, color: 'rgba(255,255,255,0.50)', textAlign: 'center' },
  closeBtn: { borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 14 },
})

// ─── Sidebar (identical pattern to Hospital — stable, no freeze) ──────────────
// LINTFIX-4: removed unused 'navigation' prop (destructured/typed but
// never referenced in the component body).
function Sidebar({
  open,
  onClose,
  officer,
  onLogout,
  loggingOut,
  onShowProfile,
}: {
  open: boolean
  onClose: () => void
  officer: Record<string, any>
  onLogout: () => void
  loggingOut: boolean
  onShowProfile: () => void
}) {
  const { theme: T } = useTheme()
  const [mounted, setMounted] = useState(false)
  const tx = useRef(new Animated.Value(-W)).current
  const bg = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (open) {
      setMounted(true)
      Animated.parallel([
        Animated.timing(tx, { toValue: 0, duration: 260, useNativeDriver: true }),
        Animated.timing(bg, { toValue: 1, duration: 260, useNativeDriver: true }),
      ]).start()
    } else {
      Animated.parallel([
        Animated.timing(tx, { toValue: -W, duration: 220, useNativeDriver: true }),
        Animated.timing(bg, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]).start(() => setMounted(false))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!mounted) return null

  const closeAndDo = (fn: () => void) => {
    Animated.parallel([
      Animated.timing(tx, { toValue: -W, duration: 200, useNativeDriver: true }),
      Animated.timing(bg, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => {
      setMounted(false)
      onClose()
      InteractionManager.runAfterInteractions(() => fn())
    })
  }

  const initials = (officer.officerName ?? 'VO')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n: string) => n[0])
    .join('')
    .toUpperCase()

  const MENU = [
    {
      section: 'VILLAGE',
      items: [
        {
          icon: <Building2 size={15} color={G} />,
          label: 'Village Details',
          onPress: () =>
            closeAndDo(() =>
              Alert.alert(
                'Village Details',
                `${officer.villageName ?? '—'}\n${officer.wardName ?? '—'}`
              )
            ),
        },
      ],
    },
    {
      section: 'ACCOUNT',
      items: [
        {
          icon: <IdCard size={15} color={G} />,
          label: 'View ID Card',
          onPress: () => closeAndDo(() => onShowProfile()),
        },
        {
          icon: <User size={15} color={G} />,
          label: 'View Profile',
          onPress: () => closeAndDo(() => onShowProfile()),
        },
        {
          icon: <Lock size={15} color={G} />,
          label: 'Change Password',
          onPress: () =>
            closeAndDo(() => Alert.alert('Change Password', 'Use the NBS web admin panel.')),
        },
      ],
    },
    {
      section: 'SESSION',
      items: [
        {
          icon: <LogOut size={15} color="#f87171" />,
          label: loggingOut ? 'Signing out…' : 'Sign Out',
          danger: true,
          onPress: () => closeAndDo(() => onLogout()),
        },
      ],
    },
  ]

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={() => closeAndDo(() => {})}>
        <Animated.View
          style={[
            StyleSheet.absoluteFillObject,
            { backgroundColor: 'rgba(0,0,0,0.55)', opacity: bg },
          ]}
        />
      </TouchableWithoutFeedback>
      <Animated.View
        style={[s.drawer, { backgroundColor: T.card, transform: [{ translateX: tx }] }]}
      >
        <LinearGradient colors={['#02143c', '#064e2e']} style={{ paddingBottom: 4 }}>
          <View style={{ flexDirection: 'row', height: 4 }}>
            <View style={{ flex: 3, backgroundColor: TZ.green }} />
            <View style={{ width: 7, backgroundColor: TZ.yellow }} />
            <View style={{ width: 5, backgroundColor: TZ.black }} />
            <View style={{ width: 7, backgroundColor: TZ.yellow }} />
            <View style={{ flex: 3, backgroundColor: TZ.blue }} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', padding: 16, gap: 12 }}>
            <View style={[s.drawerAvatar, { backgroundColor: G, borderColor: TZ.yellow }]}>
              <Text style={s.drawerAvatarTxt}>{initials}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.drawerName}>{officer.officerName ?? 'Village Officer'}</Text>
              <Text style={s.drawerSub}>{officer.villageName ?? 'My Village'}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                <View
                  style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#34d399' }}
                />
                <Text
                  style={{ fontSize: 8, fontWeight: '700', letterSpacing: 0.6, color: '#34d399' }}
                >
                  VILLAGE EXECUTIVE OFFICER
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={() => closeAndDo(() => {})} style={{ padding: 4 }}>
              <X size={18} color="rgba(255,255,255,0.70)" />
            </TouchableOpacity>
          </View>
        </LinearGradient>
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
          {MENU.map((sec) => (
            <View key={sec.section} style={[s.drawerSection, { borderBottomColor: T.border }]}>
              <Text style={[s.drawerSectionLabel, { color: T.textDim }]}>{sec.section}</Text>
              {sec.items.map((item) => (
                <TouchableOpacity
                  key={item.label}
                  style={[s.drawerItem, { borderBottomColor: T.border }]}
                  onPress={item.onPress}
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      s.drawerItemIcon,
                      { backgroundColor: (item as any).danger ? 'rgba(239,68,68,0.12)' : `${G}14` },
                    ]}
                  >
                    {item.icon}
                  </View>
                  <Text
                    style={[
                      s.drawerItemLabel,
                      { color: (item as any).danger ? '#f87171' : T.text },
                    ]}
                  >
                    {item.label}
                  </Text>
                  <ChevronRight size={14} color={(item as any).danger ? '#f87171' : T.textDim} />
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </ScrollView>
        <View style={[s.drawerFooter, { borderTopColor: T.border }]}>
          <Text style={[s.drawerFooterTxt, { color: T.textDim }]}>
            TzCRVS · NBS Tanzania · © {new Date().getFullYear()}
          </Text>
        </View>
      </Animated.View>
    </Modal>
  )
}

// ─── StatCard ─────────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function StatCard({
  icon,
  value,
  label,
  color,
  sub,
}: {
  icon: React.ReactNode
  value: number
  label: string
  color: string
  sub?: string
}) {
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

// ─── ActionCard (4 per row for village) ──────────────────────────────────────
function ActionCard({
  icon,
  label,
  sub,
  bg,
  onPress,
}: {
  icon: React.ReactNode
  label: string
  sub: string
  bg: string
  onPress: () => void
}) {
  const { theme: T } = useTheme()
  return (
    <TouchableOpacity
      style={[s.actionCard, { backgroundColor: T.card, borderColor: T.border }]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={[s.actionIcon, { backgroundColor: bg }]}>{icon}</View>
      <Text style={[s.actionLabel, { color: T.text }]}>{label}</Text>
      <Text style={[s.actionSub, { color: T.textSub }]}>{sub}</Text>
    </TouchableOpacity>
  )
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function VillageHomeScreen({ navigation: _navigation }: Props) {
  const { theme: T, isDark, toggleTheme } = useTheme()

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const [_bellDismissed, _setBellDismissed] = useState(false)
  const _todayKey = () => {
    const d = new Date()
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
  }
  const _dismissBell = () => {
    _setBellDismissed(true)
    AsyncStorage.setItem('tzcrvs_bell_dismissed_date', _todayKey()).catch(() => {})
  }
  const [connQuality, setConnQuality] = useState<ConnQuality>('Offline')
  const [activity, setActivity] = useState<any[]>([])
  const [stats, setStats] = useState({
    todayBirths: 0,
    todayDeaths: 0,
    monthBirths: 0,
    monthDeaths: 0,
    pendingSync: 0,
    totalBirths: 0,
    totalDeaths: 0,
  })
  const [officer, setOfficer] = useState<Record<string, any>>({
    officerName: 'Village Officer',
    villageName: 'My Village',
    wardName: '—',
    totalCitizens: 0,
    employeeId: '',
  })
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadData = useCallback(
    async (silent = false) => {
      const token = await AsyncStorage.getItem('tzcrvs_access_token')
      if (!token) {
        _navigation.replace('Login')
        return
      }

      if (!silent) setLoading(true)

      // Real connection quality ping
      checkConnQuality().then(setConnQuality)

      // Fetch live data from Supabase (via backend)
      const [remote, acts] = await Promise.all([fetchRemoteDashboard(), fetchRemoteActivity()])

      if (acts.length > 0) {
      const _now = new Date()
      const _isSameLocalDay = (iso: string) => {
        const d = new Date(iso)
        return (
          d.getFullYear() === _now.getFullYear() &&
          d.getMonth() === _now.getMonth() &&
          d.getDate() === _now.getDate()
        )
      }
      setActivity(acts.filter((a) => !a.registeredAt || _isSameLocalDay(a.registeredAt)))
    } else {
      setActivity([])
    }
      if (remote) {
        setOfficer({
          officerName: remote.officerName ?? 'Village Officer',
          villageName: remote.villageName ?? 'My Village',
          wardName: remote.wardName ?? '—',
          totalCitizens: remote.totalCitizens ?? 0,
          employeeId: remote.employeeId ?? '',
        })
        // Stats directly from PostgreSQL
        setStats({
          todayBirths: remote.todayBirths ?? 0,
          todayDeaths: remote.todayDeaths ?? 0,
          monthBirths: remote.monthBirths ?? 0,
          monthDeaths: remote.monthDeaths ?? 0,
          pendingSync: remote.pendingCases ?? 0,
          totalBirths: 0,
          totalDeaths: 0,
        })
        setUnread(remote.pendingCases ?? 0)
      AsyncStorage.getItem('tzcrvs_bell_dismissed_date')
        .then((d) => _setBellDismissed(d === _todayKey()))
        .catch(() => {})
      }
      setLoading(false)
      setRefreshing(false)
    },
    [_navigation]
  )

  // Refresh on focus (picks up new citizen/death registrations immediately)
  useFocusEffect(
    useCallback(() => {
      loadData()
    }, [loadData])
  )

  // Background poll every 60s
  useEffect(() => {
    pollRef.current = setInterval(() => loadData(true), 60_000)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [loadData])

  const handleLogout = useCallback(() => {
    Alert.alert('Confirm Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          setLoggingOut(true)
          await AsyncStorage.multiRemove([
            'tzcrvs_access_token',
            'tzcrvs_refresh_token',
            'tzcrvs_role',
            'tzcrvs_device_activated',
          ])
          _navigation.replace('Login')
        },
      },
    ])
  }, [_navigation])

  const downloadReport = async (period: string) => {
    const lines = [
      `TzCRVS — ${period.toUpperCase()} VILLAGE REPORT`,
      `Village:   ${officer.villageName}`,
      `Ward:      ${officer.wardName}`,
      `Officer:   ${officer.officerName}`,
      `Generated: ${new Date().toLocaleString('en-TZ')}`,
      `──────────────────────────────`,
      `Citizens:        ${officer.totalCitizens ?? 0}`,
      `Births (month):  ${stats.monthBirths}`,
      `Deaths (month):  ${stats.monthDeaths}`,
      `Pending sync:    ${stats.pendingSync}`,
    ].join('\n')
    await Share.share({ title: `Village ${period} Report`, message: lines })
  }

  const ConnIcon = connQuality === 'Good' ? Wifi : connQuality === 'Fair' ? WifiLow : WifiOff
  const initials = (officer.officerName ?? 'VO')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n: string) => n[0])
    .join('')
    .toUpperCase()

  // PATCH-5: Village Officer has only 3 core actions per notes (NIN, Marriage, Death)
  // All records are posted/retrieved from the database via backend API.
  type AD = { id: string; icon: React.ReactNode; label: string; sub: string; bg: string }
  const ACTIONS: AD[] = [
    {
      id: 'nin',
      icon: <IdCard size={18} color="#fff" />,
      label: 'NIN',
      sub: 'Registration',
      bg: '#0f766e',
    },
    {
      id: 'citizen',
      icon: <User size={18} color="#fff" />,
      label: 'Citizen',
      sub: 'Profile',
      bg: '#1d4ed8',
    },
    {
      id: 'death',
      icon: <Cross size={18} color="#fff" />,
      label: 'Record',
      sub: 'Death',
      bg: '#dc2626',
    },
    {
      id: 'marriage',
      icon: <Heart size={18} color="#fff" />,
      label: 'Register',
      sub: 'Marriage',
      bg: '#e11d48',
    },
  ]

  const navigate = (id: string) => {
    const m: Record<string, string> = {
      nin: 'NINRegistration',
      citizen: 'CitizenProfile',
      death: 'VillageRecordDeath',
      marriage: 'RegisterMarriage',
      records: 'VillageViewRecords',
    }

    if (m[id]) {
      _navigation.navigate(m[id] as never)
    }
  }

  if (loading)
    return (
      <View
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: T.bg }}
      >
        <ActivityIndicator size="large" color={G} />
        <Text style={{ color: T.textSub, marginTop: 12, fontSize: 12 }}>Loading dashboard…</Text>
      </View>
    )

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }} edges={['top']}>
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        officer={officer}
        onLogout={handleLogout}
        loggingOut={loggingOut}
        onShowProfile={() => setProfileOpen(true)}
      />
      <OfficerIdCard
        visible={profileOpen}
        onClose={() => setProfileOpen(false)}
        officer={officer}
      />

      {/* ── HEADER (identical structure to Hospital) ── */}
      <ImageBackground
        source={require('../../../public/assets/flag.jpg')}
        style={{ overflow: 'hidden' }}
        blurRadius={2}
        resizeMode="cover"
      >
        <LinearGradient
          colors={
            isDark
              ? ['rgba(2,20,60,0.70)', 'rgba(5,40,20,0.70)']
              : ['rgba(0,50,20,0.65)', 'rgba(0,80,30,0.60)']
          }
          style={StyleSheet.absoluteFill}
        />
        <View style={{ flexDirection: 'row', height: 5 }}>
          <View style={{ flex: 3, backgroundColor: TZ.green }} />
          <View style={{ width: 9, backgroundColor: TZ.yellow }} />
          <View style={{ width: 7, backgroundColor: TZ.black }} />
          <View style={{ width: 9, backgroundColor: TZ.yellow }} />
          <View style={{ flex: 3, backgroundColor: TZ.blue }} />
        </View>
        {/* Main title row */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 14,
            paddingTop: 10,
            paddingBottom: 8,
            gap: 10,
          }}
        >
          <View style={{ alignItems: 'center', width: 56 }}>
            <View style={s.logoCircle}>
              <Image
                source={require('../../../public/assets/longo_nbs.png')}
                style={{ width: 32, height: 32 }}
                resizeMode="contain"
              />
            </View>
            <Text
              style={{
                fontSize: 8,
                fontWeight: '800',
                color: TZ.yellow,
                letterSpacing: 1.5,
                marginTop: 3,
              }}
            >
              NBS
            </Text>
          </View>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text
              style={{
                fontSize: 17,
                fontWeight: '900',
                color: '#fff',
                letterSpacing: 2,
                textTransform: 'uppercase',
              }}
            >
              NBS-CENSUS
            </Text>
            <View
              style={{
                height: 2,
                width: 44,
                backgroundColor: TZ.yellow,
                borderRadius: 1,
                marginVertical: 4,
              }}
            />
            <Text
              style={{
                fontSize: 9,
                color: 'rgba(255,255,255,0.72)',
                letterSpacing: 1.1,
                textTransform: 'uppercase',
              }}
            >
              Census for Development
            </Text>
          </View>
          <View style={{ alignItems: 'center', width: 56 }}>
            <View style={s.coatCircle}>
              <Image
                source={require('../../../public/assets/court_of_arm.png')}
                style={{ width: 42, height: 42 }}
                resizeMode="contain"
              />
            </View>
            <Text
              style={{
                fontSize: 7,
                fontWeight: '700',
                color: 'rgba(255,255,255,0.60)',
                letterSpacing: 1.2,
                marginTop: 3,
              }}
            >
              TANZANIA
            </Text>
          </View>
        </View>
        {/* Sub-header: hamburger | village name | theme | bell | avatar */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 12,
            paddingBottom: 12,
            paddingTop: 2,
            gap: 8,
          }}
        >
          <TouchableOpacity
            style={s.iconBtn}
            onPress={() => setSidebarOpen(true)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Menu size={17} color="rgba(255,255,255,0.90)" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, fontWeight: '800', color: '#fff' }} numberOfLines={1}>
              {officer.villageName}
            </Text>
            <Text
              style={{ fontSize: 9, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}
              numberOfLines={1}
            >
              📍 {officer.wardName} · Village Executive Officer
            </Text>
          </View>
          <TouchableOpacity style={s.iconBtn} onPress={toggleTheme}>
            {isDark ? <Sun size={14} color={TZ.yellow} /> : <Moon size={14} color={TZ.yellow} />}
          </TouchableOpacity>
          <TouchableOpacity style={s.iconBtn} onPress={() => { _navigation.navigate('SyncData'); _dismissBell() }}>
            <Bell size={15} color="rgba(255,255,255,0.80)" />
            {unread > 0 && !_bellDismissed && (
              <View style={s.badge}>
                <Text style={{ fontSize: 8, fontWeight: '800', color: '#fff' }}>{unread}</Text>
              </View>
            )}
          </TouchableOpacity>
          <View style={s.avatarRing}>
            <View style={[s.avatar, { backgroundColor: '#34d399' }]}>
              <Text style={{ fontSize: 11, fontWeight: '900', color: '#003087' }}>{initials}</Text>
            </View>
          </View>
        </View>
      </ImageBackground>

      {/* ── SCROLL BODY ── */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        style={{ backgroundColor: T.bg }}
        contentContainerStyle={{ paddingBottom: 36 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true)
              loadData()
            }}
            tintColor={G}
          />
        }
      >
        {/* Welcome card */}
        <View style={[s.welcomeCard, { backgroundColor: T.card, borderColor: T.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, color: T.textSub }}>Welcome back,</Text>
            <Text style={{ fontSize: 18, fontWeight: '800', color: T.text, marginTop: 2 }}>
              {officer.officerName}
            </Text>
            <Text style={{ fontSize: 10, color: T.textDim, marginTop: 2 }}>
              {officer.villageName} · {officer.wardName}
            </Text>
            <Text style={{ fontSize: 10, color: T.textDim, marginTop: 2 }}>
              {new Date().toLocaleDateString('en-TZ', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 6 }}>
            <View
              style={[
                s.zoneBadge,
                { borderColor: 'rgba(34,197,94,0.4)', backgroundColor: 'rgba(34,197,94,0.12)' },
              ]}
            >
              <MapPin size={9} color="#4ade80" />
              <Text style={[s.zoneTxt, { color: '#4ade80' }]}>{'✓ Active'}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <ConnIcon size={10} color={CONN_COLORS[connQuality]} />
              <Text style={{ fontSize: 10, fontWeight: '700', color: CONN_COLORS[connQuality] }}>
                {connQuality} Mode
              </Text>
            </View>
          </View>
        </View>

        {/* Quick Actions */}
        <View style={s.sectionHead}>
          <Text style={[s.sectionTitle, { color: T.text }]}>Quick Actions</Text>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, gap: 8 }}>
          {ACTIONS.map((a) => (
            <ActionCard
              key={a.id}
              icon={a.icon}
              label={a.label}
              sub={a.sub}
              bg={a.bg}
              onPress={() => navigate(a.id)}
            />
          ))}
        </View>

        {/* Village info card */}
        <View style={s.sectionHead}>
          <Text style={[s.sectionTitle, { color: T.text }]}>Village Information</Text>
        </View>
        <View style={[s.facilityCard, { backgroundColor: T.card, borderColor: T.border }]}>
          <LinearGradient
            colors={[`${G}22`, `${G}08`]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 }}
          >
            <View style={[s.facilityIcon, { backgroundColor: `${G}25` }]}>
              <Building2 size={22} color={G} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: T.text, marginBottom: 2 }}>
                {officer.villageName}
              </Text>
              <Text style={{ fontSize: 11, color: T.textSub, marginBottom: 2 }}>
                Ward: {officer.wardName}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Shield size={10} color={G} />
                <Text style={{ fontSize: 10, color: T.textDim }}>
                  NBS Authorised Village Registration Unit
                </Text>
              </View>
            </View>
          </LinearGradient>
          <View style={[s.facilityStats, { borderTopColor: T.border }]}>
            {[
              { label: 'Citizens', value: officer.totalCitizens ?? 0, color: TZ.blue },
              { label: 'Total Deaths', value: stats.totalDeaths, color: T.danger },
              { label: 'Pending Sync', value: stats.pendingSync, color: '#f97316' },
            ].map((st) => (
              <View key={st.label} style={{ flex: 1, alignItems: 'center' }}>
                <Text style={{ fontSize: 18, fontWeight: '900', color: st.color }}>{st.value}</Text>
                <Text style={{ fontSize: 9, color: T.textDim, marginTop: 2 }}>{st.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Recent activity */}
        {activity.length > 0 && (
          <>
            <View style={s.sectionHead}>
              <Text style={[s.sectionTitle, { color: T.text }]}>Recent Activity</Text>
              <TouchableOpacity onPress={() => navigate('records')}>
                <Text style={{ fontSize: 11, color: G }}>All →</Text>
              </TouchableOpacity>
            </View>
            <View style={[s.actCard, { backgroundColor: T.card, borderColor: T.border }]}>
              {activity.map((item, idx) => (
                <View key={item.id}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', padding: 14 }}>
                    <View
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 19,
                        backgroundColor: `${item.color}22`,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text style={{ fontSize: 15 }}>{item.icon}</Text>
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={{ fontSize: 10, color: T.textSub, marginBottom: 2 }}>
                        {item.label}
                      </Text>
                      <Text style={{ fontSize: 12, fontWeight: '600', color: T.text }}>
                        {item.name}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 9, color: T.textDim }}>{item.time}</Text>
                  </View>
                  {idx < activity.length - 1 && (
                    <View style={{ height: 1, backgroundColor: T.border, marginLeft: 60 }} />
                  )}
                </View>
              ))}
            </View>
          </>
        )}

        {/* Report card */}
        <View style={s.sectionHead}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <BarChart3 size={14} color={G} />
            <Text style={[s.sectionTitle, { color: T.text }]}>Monthly Report Card</Text>
          </View>
          <Text style={{ fontSize: 11, color: T.textDim }}>
            {new Date().toLocaleDateString('en-TZ', { month: 'long', year: 'numeric' })}
          </Text>
        </View>
        <View style={[s.reportCard, { backgroundColor: T.card, borderColor: T.border }]}>
          {[
            {
              label: 'Total citizens registered',
              value: officer.totalCitizens ?? 0,
              color: TZ.blue,
            },
            { label: 'Deaths recorded this month', value: stats.monthDeaths, color: '#f87171' },
            { label: 'Records pending sync', value: stats.pendingSync, color: '#f97316' },
          ].map((row, i, arr) => (
            <View
              key={row.label}
              style={[
                s.reportRow,
                { borderBottomWidth: i < arr.length - 1 ? 1 : 0, borderBottomColor: T.border },
              ]}
            >
              <Text style={{ fontSize: 12, color: T.textSub }}>{row.label}</Text>
              <Text style={{ fontSize: 16, fontWeight: '900', color: row.color }}>{row.value}</Text>
            </View>
          ))}
          <View style={[s.downloadSection, { borderTopColor: T.border }]}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: T.textSub, marginBottom: 10 }}>
              Download Report
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {(['Daily', 'Weekly', 'Monthly', 'Annual'] as const).map((p) => (
                <TouchableOpacity
                  key={p}
                  style={{
                    flex: 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 3,
                    borderWidth: 1,
                    borderRadius: 8,
                    paddingVertical: 6,
                    backgroundColor: `${G}18`,
                    borderColor: `${G}40`,
                  }}
                  onPress={() => downloadReport(p)}
                >
                  <Download size={10} color={G} />
                  <Text style={{ fontSize: 9, fontWeight: '700', color: G }}>{p}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* Footer */}
        <View style={{ alignItems: 'center', paddingTop: 24, gap: 6 }}>
          <View style={{ flexDirection: 'row', width: 80, height: 3, marginBottom: 8 }}>
            <View style={{ flex: 1, backgroundColor: TZ.green, height: 3, borderRadius: 1 }} />
            <View style={{ width: 8, backgroundColor: TZ.yellow, height: 3 }} />
            <View style={{ width: 6, backgroundColor: TZ.black, height: 3 }} />
            <View style={{ width: 8, backgroundColor: TZ.yellow, height: 3 }} />
            <View style={{ flex: 1, backgroundColor: TZ.blue, height: 3, borderRadius: 1 }} />
          </View>
          <Text style={{ fontSize: 9, color: T.textDim }}>
            TzCRVS · Village Officer Civil Registration System
          </Text>
          <Text style={{ fontSize: 9, color: T.textDim }}>
            © {new Date().getFullYear()} The United Republic of Tanzania
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  drawer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: W * 0.78,
    shadowColor: '#000',
    shadowOffset: { width: 6, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 20,
  },
  drawerAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  drawerAvatarTxt: { fontSize: 18, fontWeight: '900', color: '#003087' },
  drawerName: { fontSize: 14, fontWeight: '800', color: '#fff', marginBottom: 3 },
  drawerSub: { fontSize: 11, color: 'rgba(255,255,255,0.65)' },
  drawerSection: { paddingVertical: 8, borderBottomWidth: 1 },
  drawerSectionLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  drawerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  drawerItemIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawerItemLabel: { flex: 1, fontSize: 14, fontWeight: '600' },
  drawerFooter: { paddingVertical: 14, paddingHorizontal: 16, borderTopWidth: 1 },
  drawerFooterTxt: { fontSize: 9 },
  logoCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: 'rgba(252,209,22,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coatCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: 'rgba(252,209,22,0.48)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarRing: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: TZ.yellow,
    padding: 2,
  },
  avatar: { flex: 1, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  welcomeCard: {
    marginHorizontal: 14,
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  zoneBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  zoneTxt: { fontSize: 9, fontWeight: '600' },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginTop: 18,
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 14, fontWeight: '800' },
  statCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    padding: 10,
    alignItems: 'center',
    gap: 3,
  },
  statIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: { fontSize: 20, fontWeight: '900' },
  statLabel: { fontSize: 9, textAlign: 'center', fontWeight: '600' },
  statSub: { fontSize: 8, textAlign: 'center' },
  actionCard: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
    alignItems: 'center',
    gap: 5,
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: { fontSize: 10, fontWeight: '700', textAlign: 'center' },
  actionSub: { fontSize: 8, textAlign: 'center' },
  facilityCard: { marginHorizontal: 14, borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  facilityIcon: {
    width: 46,
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  facilityStats: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  actCard: { marginHorizontal: 14, borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  reportCard: { marginHorizontal: 14, borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  reportRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 16,
  },
  downloadSection: { borderTopWidth: 1, paddingHorizontal: 16, paddingVertical: 14 },
})