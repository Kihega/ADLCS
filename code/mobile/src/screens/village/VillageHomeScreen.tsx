/**
 * VillageHomeScreen.tsx — Village Officer Full Dashboard
 * Tanzania NBS-CENSUS · Government Design System
 *
 * Top Bar:
 *   LEFT   — NBS logo (longo_nbs.png in circle)
 *   CENTRE — NBS-CENSUS title + "Census for Development" subtitle
 *   RIGHT  — Officer profile avatar + employee ID + dark/light toggle
 *   BG     — Tanzania flag (ImageBackground, blurRadius) + dark overlay
 *
 * Sections:
 *   1. Welcome banner + geofence status + sync indicator
 *   2. Today's statistics (Citizens, Births, Deaths, Migrations)
 *   3. Quick actions grid (Register, Birth, Death, Migration, Reports, Sync)
 *   4. Recent activity feed
 *   5. Footer
 */

import React, { useState, useEffect, useCallback } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator,
  Image, ImageBackground, Dimensions,
  RefreshControl, StatusBar,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import {
  Users, Baby, Cross, Navigation, Sun, Moon,
  Bell, LogOut, MapPin, RefreshCw, ChevronRight,
  UserPlus, FileText, Shield, TrendingUp, Clock,
  CheckCircle, AlertTriangle, Wifi, WifiOff,
} from 'lucide-react-native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'

// ─── Types ────────────────────────────────────────────────────────────────────
type RootStack = {
  Splash:       undefined
  Login:        undefined
  VillageHome:  undefined
  HospitalHome: undefined
}
type Props = {
  navigation: NativeStackNavigationProp<RootStack, 'VillageHome'>
}

// ─── Design Tokens ────────────────────────────────────────────────────────────
const TZ = {
  green:  '#1eb53a',
  blue:   '#00a3dd',
  navy:   '#003087',
  yellow: '#fcd116',
  black:  '#000000',
}

interface Theme {
  bg:        string; card:     string; card2:   string
  text:      string; textSub:  string; textDim: string
  border:    string; primary:  string; primaryL: string
  accent:    string; blue:     string; blueL:    string
  danger:    string; success:  string
  barStyle:  'light-content' | 'dark-content'
  isDark:    boolean
}

const DARK: Theme = {
  bg:       '#050d1a', card:     '#0d1f38', card2:    '#091628',
  text:     '#f8fafc', textSub:  '#94a3b8', textDim:  '#4b6080',
  border:   '#1e3a5f', primary:  '#1eb53a', primaryL: '#34d399',
  accent:   '#fcd116', blue:     '#00a3dd', blueL:    '#38bdf8',
  danger:   '#f87171', success:  '#4ade80',
  barStyle: 'light-content', isDark: true,
}
const LIGHT: Theme = {
  bg:       '#f0f4f8', card:     '#ffffff', card2:    '#f8fafc',
  text:     '#0f1923', textSub:  '#4b5563', textDim:  '#9ca3af',
  border:   '#e1e8f0', primary:  '#006400', primaryL: '#1eb53a',
  accent:   '#c8962e', blue:     '#003087', blueL:    '#00a3dd',
  danger:   '#dc2626', success:  '#16a34a',
  barStyle: 'dark-content', isDark: false,
}

// ─── Mock data ─────────────────────────────────────────────────────────────────
const ACTIVITY = [
  { id: '1', icon: '👤', label: 'Citizen registered',  name: 'Amina Juma Hassan',    time: '09:41 AM', color: TZ.blue   },
  { id: '2', icon: '👶', label: 'Birth recorded',       name: 'Fatuma Ibrahim Khamis', time: '08:53 AM', color: TZ.green  },
  { id: '3', icon: '📋', label: 'Death recorded',       name: 'Salim Mwangi Saidi',   time: '08:20 AM', color: '#ef4444' },
  { id: '4', icon: '🧭', label: 'Migration recorded',   name: 'Omar Abdallah Juma',   time: 'Yesterday', color: TZ.yellow },
  { id: '5', icon: '✅', label: 'Data synced with NBS', name: 'Auto-sync complete',   time: 'Yesterday', color: TZ.green  },
]

const { width: W } = Dimensions.get('window')

// ─── Sub-components ────────────────────────────────────────────────────────────
function StatCard({ icon, value, label, color, T }: {
  icon: React.ReactNode; value: string; label: string; color: string; T: Theme
}) {
  return (
    <View style={[sc.statCard, { backgroundColor: T.card, borderColor: T.border }]}>
      <View style={[sc.statIcon, { backgroundColor: `${color}18` }]}>{icon}</View>
      <Text style={[sc.statValue, { color }]}>{value}</Text>
      <Text style={[sc.statLabel, { color: T.textSub }]}>{label}</Text>
    </View>
  )
}

type ActionItem = {
  id: string; icon: React.ReactNode; label: string; sub: string; bg: string
}

function ActionCard({ item, T, onPress }: { item: ActionItem; T: Theme; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[sc.actionCard, { backgroundColor: T.card, borderColor: T.border }]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={[sc.actionIcon, { backgroundColor: item.bg }]}>{item.icon}</View>
      <Text style={[sc.actionLabel, { color: T.text }]}>{item.label}</Text>
      <Text style={[sc.actionSub, { color: T.textSub }]}>{item.sub}</Text>
    </TouchableOpacity>
  )
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function VillageHomeScreen({ navigation }: Props) {
  const [isDark,      setIsDark]      = useState(true)
  const [loading,     setLoading]     = useState(true)
  const [refreshing,  setRefreshing]  = useState(false)
  const [loggingOut,  setLoggingOut]  = useState(false)
  const [officerName, setOfficerName] = useState('Field Officer')
  const [employeeId,  setEmployeeId]  = useState('EMP-VIL-001')
  const [villageName, setVillageName] = useState('Chamwino Village')
  const [inZone,      setInZone]      = useState(true)
  const [syncOk,      setSyncOk]      = useState(true)
  const [unread,      setUnread]      = useState(2)

  const T = isDark ? DARK : LIGHT

  // ── Load officer profile ──────────────────────────────────────────────────
  useEffect(() => {
    AsyncStorage.multiGet([
      'adlcs_officer_name', 'adlcs_employee_id', 'adlcs_village'
    ]).then(pairs => {
      if (pairs[0][1]) setOfficerName(pairs[0][1])
      if (pairs[1][1]) setEmployeeId(pairs[1][1])
      if (pairs[2][1]) setVillageName(pairs[2][1])
      setLoading(false)
    })
  }, [])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await new Promise<void>(r => setTimeout(r, 1200))
    setRefreshing(false)
  }, [])

  const handleLogout = () => {
    Alert.alert('Confirm Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out', style: 'destructive',
        onPress: async () => {
          setLoggingOut(true)
          await AsyncStorage.multiRemove([
            'adlcs_access_token', 'adlcs_refresh_token', 'adlcs_role'
          ])
          setLoggingOut(false)
          navigation.replace('Login')
        },
      },
    ])
  }

  // ── Derived ──────────────────────────────────────────────────────────────
  const initials = officerName
    .split(' ').filter(Boolean).slice(0, 2)
    .map(n => n[0]).join('').toUpperCase()

  const actions: ActionItem[] = [
    { id: 'register',  icon: <UserPlus size={20} color="#fff" />,    label: 'Register',  sub: 'Citizen',    bg: TZ.navy   },
    { id: 'birth',     icon: <Baby     size={20} color="#fff" />,    label: 'Record',    sub: 'Birth',      bg: TZ.green  },
    { id: 'death',     icon: <Cross    size={20} color="#fff" />,    label: 'Record',    sub: 'Death',      bg: '#dc2626' },
    { id: 'migration', icon: <Navigation size={20} color="#fff" />,  label: 'Record',    sub: 'Migration',  bg: '#d97706' },
    { id: 'reports',   icon: <FileText size={20} color="#fff" />,    label: 'View',      sub: 'Reports',    bg: '#7c3aed' },
    { id: 'sync',      icon: <RefreshCw size={20} color="#fff" />,   label: 'Sync',      sub: 'Data',       bg: '#0e7490' },
  ]

  if (loading) {
    return (
      <View style={[{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: T.bg }]}>
        <ActivityIndicator size="large" color={T.primary} />
      </View>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }} edges={['top']}>
      <StatusBar barStyle={T.barStyle} />

      {/* ══════════════════════════════════════ TOP HEADER ════════════════ */}
      <ImageBackground
        source={require('../../../public/assets/flag.jpg')}
        style={sc.headerBg}
        blurRadius={T.isDark ? 5 : 6}
        resizeMode="cover"
      >
        {/* Overlay */}
        <LinearGradient
          colors={T.isDark
            ? ['rgba(1,15,50,0.90)', 'rgba(0,30,80,0.88)']
            : ['rgba(0,30,100,0.84)', 'rgba(0,60,40,0.84)']}
          style={StyleSheet.absoluteFill}
        />

        {/* TZ flag mini-stripe at top edge */}
        <View style={sc.flagStripe}>
          <View style={{ flex: 3, backgroundColor: TZ.green }} />
          <View style={{ width: 9,  backgroundColor: TZ.yellow }} />
          <View style={{ width: 7,  backgroundColor: TZ.black }} />
          <View style={{ width: 9,  backgroundColor: TZ.yellow }} />
          <View style={{ flex: 3, backgroundColor: TZ.blue }} />
        </View>

        {/* ── MAIN HEADER ROW ──────────────────────────────────────────── */}
        <View style={sc.headerRow}>

          {/* LEFT: NBS Logo */}
          <TouchableOpacity style={sc.nbsLogoWrap} activeOpacity={0.8}>
            <View style={sc.nbsCircle}>
              <Image
                source={require('../../../public/assets/longo_nbs.png')}
                style={{ width: 32, height: 32 }}
                resizeMode="contain"
              />
            </View>
            <Text style={sc.nbsLabel}>NBS</Text>
          </TouchableOpacity>

          {/* CENTRE: Brand title */}
          <View style={sc.headerCenter}>
            <Text style={sc.headerTitle}>NBS-CENSUS</Text>
            <View style={sc.headerLine} />
            <Text style={sc.headerSub}>Census for Development</Text>
          </View>

          {/* RIGHT: Profile + toggle */}
          <View style={sc.headerRight}>
            {/* Theme toggle */}
            <TouchableOpacity
              onPress={() => setIsDark(!isDark)}
              style={sc.themeBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              {isDark
                ? <Sun  size={13} color={TZ.yellow} />
                : <Moon size={13} color={TZ.yellow} />
              }
            </TouchableOpacity>
            {/* Profile avatar */}
            <View style={sc.profileWrap}>
              <View style={sc.avatarRing}>
                <View style={sc.avatar}>
                  <Text style={sc.avatarText}>{initials || 'VO'}</Text>
                </View>
              </View>
              <Text style={sc.empId} numberOfLines={1}>{employeeId}</Text>
            </View>
          </View>

        </View>

        {/* ── SUB-HEADER: Role badge + location + actions ───────────────── */}
        <View style={sc.subHeader}>
          <View style={sc.subLeft}>
            {/* Role badge */}
            <View style={sc.roleBadge}>
              <View style={[sc.roleDot, { backgroundColor: TZ.green }]} />
              <Text style={[sc.roleText, { color: TZ.green }]}>VILLAGE OFFICER</Text>
            </View>
            {/* Location */}
            <View style={sc.locationRow}>
              <MapPin size={9} color={TZ.yellow} />
              <Text style={sc.locationText}>{villageName}</Text>
            </View>
          </View>
          <View style={sc.subRight}>
            {/* Notification bell */}
            <TouchableOpacity style={sc.iconBtn} onPress={() => {}}>
              <Bell size={15} color="rgba(255,255,255,0.75)" />
              {unread > 0 && (
                <View style={sc.badge}>
                  <Text style={sc.badgeText}>{unread}</Text>
                </View>
              )}
            </TouchableOpacity>
            {/* Logout */}
            <TouchableOpacity
              style={[sc.iconBtn, { backgroundColor: 'rgba(239,68,68,0.15)' }]}
              onPress={handleLogout}
              disabled={loggingOut}
            >
              <LogOut size={14} color="#f87171" />
            </TouchableOpacity>
          </View>
        </View>

      </ImageBackground>

      {/* ══════════════════════════════════════ SCROLL BODY ══════════════ */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        style={{ backgroundColor: T.bg }}
        contentContainerStyle={{ paddingBottom: 36 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.primary} />
        }
      >

        {/* ── WELCOME BANNER ──────────────────────────────────────────── */}
        <View style={[sc.welcomeCard, { backgroundColor: T.card, borderColor: T.border }]}>
          <View>
            <Text style={[sc.welcomeHi, { color: T.textSub }]}>Welcome back,</Text>
            <Text style={[sc.welcomeName, { color: T.text }]}>{officerName}</Text>
            <Text style={[sc.welcomeDate, { color: T.textDim }]}>
              {new Date().toLocaleDateString('en-TZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </Text>
          </View>
          <View style={sc.welcomeRight}>
            {/* Geofence status */}
            <View style={[sc.zoneBadge, {
              borderColor: inZone ? `${T.primary}60` : `${T.danger}60`,
              backgroundColor: inZone ? `${T.primary}15` : `${T.danger}15`,
            }]}>
              <MapPin size={9} color={inZone ? T.primary : T.danger} />
              <Text style={[sc.zoneText, { color: inZone ? T.primary : T.danger }]}>
                {inZone ? '✓ In Zone · 1km' : '✗ Out of Zone'}
              </Text>
            </View>
            {/* Sync status */}
            <View style={sc.syncRow}>
              {syncOk
                ? <Wifi     size={10} color={T.success} />
                : <WifiOff  size={10} color={T.danger}  />}
              <Text style={[sc.syncText, { color: T.textDim }]}>
                {syncOk ? 'Synced' : 'Offline'}
              </Text>
            </View>
          </View>
        </View>

        {/* ── STATISTICS ──────────────────────────────────────────────── */}
        <View style={sc.sectionHead}>
          <Text style={[sc.sectionTitle, { color: T.text }]}>Village Statistics</Text>
          <TouchableOpacity>
            <Text style={[sc.sectionLink, { color: T.blueL }]}>View all →</Text>
          </TouchableOpacity>
        </View>

        <View style={sc.statsRow}>
          <StatCard icon={<Users      size={18} color={T.blueL}    />} value="2,847" label="Citizens"   color={T.blueL}   T={T} />
          <StatCard icon={<Baby       size={18} color={T.primary}  />} value="142"   label="Births"     color={T.primary} T={T} />
          <StatCard icon={<Cross      size={18} color={T.danger}   />} value="38"    label="Deaths"     color={T.danger}  T={T} />
          <StatCard icon={<Navigation size={18} color={T.accent}   />} value="24"    label="Migrations" color={T.accent}  T={T} />
        </View>

        {/* ── QUICK ACTIONS ───────────────────────────────────────────── */}
        <View style={sc.sectionHead}>
          <Text style={[sc.sectionTitle, { color: T.text }]}>Quick Actions</Text>
        </View>

        <View style={sc.actionsGrid}>
          {actions.map(a => (
            <ActionCard key={a.id} item={a} T={T} onPress={() => {}} />
          ))}
        </View>

        {/* ── PROGRESS CARD ───────────────────────────────────────────── */}
        <View style={[sc.progressCard, { backgroundColor: T.card, borderColor: T.border }]}>
          <View style={sc.progressHeader}>
            <TrendingUp size={16} color={T.primary} />
            <Text style={[sc.progressTitle, { color: T.text }]}>Monthly Progress</Text>
            <Text style={[sc.progressPct, { color: T.primary }]}>67%</Text>
          </View>
          <View style={[sc.progressBar, { backgroundColor: T.border }]}>
            <LinearGradient
              colors={[TZ.green, TZ.blue]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={[sc.progressFill, { width: '67%' }]}
            />
          </View>
          <Text style={[sc.progressSub, { color: T.textDim }]}>
            1,903 of 2,847 citizens verified this month
          </Text>
        </View>

        {/* ── RECENT ACTIVITY ─────────────────────────────────────────── */}
        <View style={sc.sectionHead}>
          <Text style={[sc.sectionTitle, { color: T.text }]}>Recent Activity</Text>
          <TouchableOpacity>
            <Text style={[sc.sectionLink, { color: T.blueL }]}>All →</Text>
          </TouchableOpacity>
        </View>

        <View style={[sc.activityCard, { backgroundColor: T.card, borderColor: T.border }]}>
          {ACTIVITY.map((item, idx) => (
            <View key={item.id}>
              <TouchableOpacity style={sc.activityRow} activeOpacity={0.7}>
                <View style={[sc.activityDot, { backgroundColor: `${item.color}22` }]}>
                  <Text style={{ fontSize: 15 }}>{item.icon}</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={[sc.activityLabel, { color: T.textSub }]}>{item.label}</Text>
                  <Text style={[sc.activityName, { color: T.text }]}>{item.name}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Text style={[sc.activityTime, { color: T.textDim }]}>{item.time}</Text>
                  <ChevronRight size={13} color={T.textDim} />
                </View>
              </TouchableOpacity>
              {idx < ACTIVITY.length - 1 && (
                <View style={[sc.divider, { backgroundColor: T.border, marginLeft: 60 }]} />
              )}
            </View>
          ))}
        </View>

        {/* ── FOOTER ──────────────────────────────────────────────────── */}
        <View style={sc.footer}>
          <View style={sc.footerFlag}>
            <View style={{ flex: 1, backgroundColor: TZ.green, height: 3, borderRadius: 1 }} />
            <View style={{ width: 8, backgroundColor: TZ.yellow, height: 3 }} />
            <View style={{ width: 6, backgroundColor: TZ.black,  height: 3 }} />
            <View style={{ width: 8, backgroundColor: TZ.yellow, height: 3 }} />
            <View style={{ flex: 1, backgroundColor: TZ.blue,   height: 3, borderRadius: 1 }} />
          </View>
          <Text style={[sc.footerText, { color: T.textDim }]}>
            National Bureau of Statistics · Field Operations
          </Text>
          <Text style={[sc.footerText, { color: T.textDim }]}>
            © 2026 The United Republic of Tanzania
          </Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const sc = StyleSheet.create({
  // Header
  headerBg:    { overflow: 'hidden' },
  flagStripe:  { flexDirection: 'row', height: 5 },
  headerRow:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14,
                 paddingTop: 10, paddingBottom: 8, gap: 10 },

  // NBS logo
  nbsLogoWrap: { alignItems: 'center', width: 56 },
  nbsCircle:   { width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(255,255,255,0.14)',
                 borderWidth: 1.5, borderColor: 'rgba(252,209,22,0.55)',
                 alignItems: 'center', justifyContent: 'center' },
  nbsLabel:    { fontSize: 8, fontWeight: '800', color: TZ.yellow, letterSpacing: 1.5, marginTop: 3 },

  // Centre
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle:  { fontSize: 17, fontWeight: '900', color: '#ffffff', letterSpacing: 2, textTransform: 'uppercase' },
  headerLine:   { height: 2, width: 44, backgroundColor: TZ.yellow, borderRadius: 1, marginVertical: 4 },
  headerSub:    { fontSize: 9, color: 'rgba(255,255,255,0.72)', letterSpacing: 1.1, textTransform: 'uppercase' },

  // Right
  headerRight: { alignItems: 'center', gap: 6, width: 58 },
  themeBtn:    { width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.12)',
                 borderWidth: 1, borderColor: 'rgba(252,209,22,0.35)',
                 alignItems: 'center', justifyContent: 'center' },
  profileWrap: { alignItems: 'center' },
  avatarRing:  { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: TZ.yellow, padding: 2 },
  avatar:      { flex: 1, borderRadius: 18, backgroundColor: TZ.yellow, alignItems: 'center', justifyContent: 'center' },
  avatarText:  { fontSize: 13, fontWeight: '900', color: TZ.navy },
  empId:       { fontSize: 7, color: 'rgba(255,255,255,0.55)', marginTop: 3, maxWidth: 58, textAlign: 'center' },

  // Sub-header
  subHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                  paddingHorizontal: 14, paddingBottom: 12, paddingTop: 2 },
  subLeft:      { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  subRight:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  roleBadge:    { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1,
                  borderColor: `${TZ.green}55`, backgroundColor: `${TZ.green}18`,
                  borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  roleDot:      { width: 5, height: 5, borderRadius: 2.5 },
  roleText:     { fontSize: 8, fontWeight: '700', letterSpacing: 0.7 },
  locationRow:  { flexDirection: 'row', alignItems: 'center', gap: 3 },
  locationText: { fontSize: 9, color: 'rgba(255,255,255,0.55)' },
  iconBtn:      { width: 30, height: 30, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.08)',
                  alignItems: 'center', justifyContent: 'center' },
  badge:        { position: 'absolute', top: -4, right: -4, width: 14, height: 14, borderRadius: 7,
                  backgroundColor: '#ef4444', alignItems: 'center', justifyContent: 'center' },
  badgeText:    { fontSize: 8, fontWeight: '800', color: '#fff' },

  // Welcome
  welcomeCard:  { marginHorizontal: 14, marginTop: 12, borderRadius: 14, borderWidth: 1,
                  padding: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  welcomeHi:    { fontSize: 11 },
  welcomeName:  { fontSize: 18, fontWeight: '800', marginTop: 2 },
  welcomeDate:  { fontSize: 10, marginTop: 3 },
  welcomeRight: { alignItems: 'flex-end', gap: 6 },
  zoneBadge:    { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1,
                  borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  zoneText:     { fontSize: 9, fontWeight: '600' },
  syncRow:      { flexDirection: 'row', alignItems: 'center', gap: 4 },
  syncText:     { fontSize: 9 },

  // Sections
  sectionHead:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                  paddingHorizontal: 16, marginTop: 18, marginBottom: 10 },
  sectionTitle: { fontSize: 14, fontWeight: '800' },
  sectionLink:  { fontSize: 11 },

  // Stats
  statsRow:     { flexDirection: 'row', paddingHorizontal: 12, gap: 8 },
  statCard:     { flex: 1, borderRadius: 14, borderWidth: 1, padding: 12, alignItems: 'center', gap: 5 },
  statIcon:     { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  statValue:    { fontSize: 20, fontWeight: '900' },
  statLabel:    { fontSize: 9, textAlign: 'center', fontWeight: '500' },

  // Actions
  actionsGrid:  { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, gap: 8 },
  actionCard:   { width: (W - 40) / 3, borderRadius: 14, borderWidth: 1,
                  padding: 12, alignItems: 'center', gap: 6 },
  actionIcon:   { width: 46, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  actionLabel:  { fontSize: 11, fontWeight: '700', textAlign: 'center' },
  actionSub:    { fontSize: 9, textAlign: 'center' },

  // Progress
  progressCard:   { marginHorizontal: 14, marginTop: 16, borderRadius: 14, borderWidth: 1, padding: 16 },
  progressHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  progressTitle:  { flex: 1, fontSize: 13, fontWeight: '700' },
  progressPct:    { fontSize: 15, fontWeight: '900' },
  progressBar:    { height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 8 },
  progressFill:   { height: '100%', borderRadius: 4 },
  progressSub:    { fontSize: 10 },

  // Activity
  activityCard:  { marginHorizontal: 14, borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  activityRow:   { flexDirection: 'row', alignItems: 'center', padding: 14 },
  activityDot:   { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  activityLabel: { fontSize: 10, marginBottom: 2 },
  activityName:  { fontSize: 12, fontWeight: '600' },
  activityTime:  { fontSize: 9 },
  divider:       { height: 1 },

  // Footer
  footer:      { alignItems: 'center', paddingTop: 24, gap: 6 },
  footerFlag:  { flexDirection: 'row', width: 80, gap: 0, height: 3, marginBottom: 8 },
  footerText:  { fontSize: 9 },
})
