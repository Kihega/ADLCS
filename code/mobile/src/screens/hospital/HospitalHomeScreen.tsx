/**
 * HospitalHomeScreen.tsx — Hospital Officer Full Dashboard
 * Tanzania NBS-CENSUS · Government Design System
 *
 * Top Bar:
 *   LEFT   — NBS logo (longo_nbs.png in circle)
 *   CENTRE — NBS-CENSUS title + "Census for Development" subtitle
 *   RIGHT  — Officer profile avatar + employee ID + dark/light toggle
 *   BG     — Tanzania flag (ImageBackground, blurRadius) + dark overlay
 *
 * Sections:
 *   1. Welcome banner + geofence status (0.5 km) + sync indicator
 *   2. Today's statistics (Births, Deaths, Certificates, Pending)
 *   3. Quick actions grid (Register Birth, Record Death, Certificates, etc.)
 *   4. Facility info card
 *   5. Recent activity feed
 *   6. Footer
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
  Baby, Cross, FileText, Clock, Sun, Moon,
  Bell, LogOut, MapPin, RefreshCw, ChevronRight,
  UserPlus, Shield, TrendingUp, Building2,
  CheckCircle, Wifi, WifiOff, Stethoscope,
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
  navigation: NativeStackNavigationProp<RootStack, 'HospitalHome'>
}

// ─── Design Tokens ────────────────────────────────────────────────────────────
const TZ = {
  green:  '#1eb53a',
  blue:   '#00a3dd',
  navy:   '#003087',
  yellow: '#fcd116',
  black:  '#000000',
}

// Hospital accent: teal-orange palette (distinct from village green)
const H = {
  primary:  '#0891b2',   // deep teal
  primaryL: '#22d3ee',   // light teal
  orange:   '#f97316',   // hospital warm accent
  orangeL:  '#fdba74',
}

interface Theme {
  bg:        string; card:     string; card2:   string
  text:      string; textSub:  string; textDim: string
  border:    string; primary:  string; primaryL: string
  accent:    string; danger:   string; success:  string
  barStyle:  'light-content' | 'dark-content'
  isDark:    boolean
}

const DARK: Theme = {
  bg:       '#050d1a', card:     '#0d1f38', card2:    '#091628',
  text:     '#f8fafc', textSub:  '#94a3b8', textDim:  '#4b6080',
  border:   '#1e3a5f', primary:  H.primary, primaryL: H.primaryL,
  accent:   TZ.yellow, danger:   '#f87171', success:  '#4ade80',
  barStyle: 'light-content', isDark: true,
}
const LIGHT: Theme = {
  bg:       '#f0f4f8', card:     '#ffffff', card2:    '#f8fafc',
  text:     '#0f1923', textSub:  '#4b5563', textDim:  '#9ca3af',
  border:   '#e1e8f0', primary:  H.primary, primaryL: H.primaryL,
  accent:   '#c8962e', danger:   '#dc2626', success:  '#16a34a',
  barStyle: 'dark-content', isDark: false,
}

// ─── Mock data ─────────────────────────────────────────────────────────────────
const ACTIVITY = [
  { id: '1', icon: '👶', label: 'Birth registered',       name: 'Rahma Said Abdallah — Baby Boy', time: '10:05 AM', color: TZ.green  },
  { id: '2', icon: '📜', label: 'Certificate issued',     name: 'Birth cert #TZ-2026-00441',      time: '09:30 AM', color: H.primary },
  { id: '3', icon: '📋', label: 'Death recorded',         name: 'Mzee Hamisi Chande, 74',         time: '08:45 AM', color: '#ef4444' },
  { id: '4', icon: '🔄', label: 'Record updated',         name: 'Delivery #2026-112 completed',   time: '08:10 AM', color: H.orange  },
  { id: '5', icon: '✅', label: 'Data synced with RITA',  name: 'Auto-sync complete',             time: 'Yesterday', color: TZ.green },
]

const { width: W } = Dimensions.get('window')

// ─── Sub-components ────────────────────────────────────────────────────────────
function StatCard({ icon, value, label, color, sub, T }: {
  icon: React.ReactNode; value: string; label: string;
  color: string; sub?: string; T: Theme
}) {
  return (
    <View style={[hc.statCard, { backgroundColor: T.card, borderColor: T.border }]}>
      <View style={[hc.statIcon, { backgroundColor: `${color}18` }]}>{icon}</View>
      <Text style={[hc.statValue, { color }]}>{value}</Text>
      <Text style={[hc.statLabel, { color: T.textSub }]}>{label}</Text>
      {sub && <Text style={[hc.statSub, { color: T.textDim }]}>{sub}</Text>}
    </View>
  )
}

type ActionItem = {
  id: string; icon: React.ReactNode; label: string; sub: string; bg: string
}
function ActionCard({ item, T, onPress }: { item: ActionItem; T: Theme; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[hc.actionCard, { backgroundColor: T.card, borderColor: T.border }]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={[hc.actionIcon, { backgroundColor: item.bg }]}>{item.icon}</View>
      <Text style={[hc.actionLabel, { color: T.text }]}>{item.label}</Text>
      <Text style={[hc.actionSub, { color: T.textSub }]}>{item.sub}</Text>
    </TouchableOpacity>
  )
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function HospitalHomeScreen({ navigation }: Props) {
  const [isDark,        setIsDark]        = useState(true)
  const [loading,       setLoading]       = useState(true)
  const [refreshing,    setRefreshing]    = useState(false)
  const [loggingOut,    setLoggingOut]    = useState(false)
  const [officerName,   setOfficerName]   = useState('Field Officer')
  const [employeeId,    setEmployeeId]    = useState('EMP-HOS-001')
  const [facilityName,  setFacilityName]  = useState('Dodoma Regional Hospital')
  const [inZone,        setInZone]        = useState(true)
  const [syncOk,        setSyncOk]        = useState(true)
  const [unread,        setUnread]        = useState(1)

  const T = isDark ? DARK : LIGHT

  // ── Load profile ─────────────────────────────────────────────────────────
  useEffect(() => {
    AsyncStorage.multiGet([
      'adlcs_officer_name', 'adlcs_employee_id', 'adlcs_facility'
    ]).then(pairs => {
      if (pairs[0][1]) setOfficerName(pairs[0][1])
      if (pairs[1][1]) setEmployeeId(pairs[1][1])
      if (pairs[2][1]) setFacilityName(pairs[2][1])
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

  const initials = officerName
    .split(' ').filter(Boolean).slice(0, 2)
    .map(n => n[0]).join('').toUpperCase()

  const actions: ActionItem[] = [
    { id: 'birth',    icon: <Baby      size={20} color="#fff" />, label: 'Register',  sub: 'Birth',        bg: TZ.green   },
    { id: 'death',    icon: <Cross     size={20} color="#fff" />, label: 'Record',    sub: 'Death',        bg: '#dc2626'  },
    { id: 'cert',     icon: <FileText  size={20} color="#fff" />, label: 'Issue',     sub: 'Certificate',  bg: H.primary  },
    { id: 'view',     icon: <Stethoscope size={20} color="#fff" />, label: 'View',   sub: 'Records',      bg: '#7c3aed'  },
    { id: 'pending',  icon: <Clock     size={20} color="#fff" />, label: 'Pending',   sub: 'Cases',        bg: H.orange   },
    { id: 'sync',     icon: <RefreshCw size={20} color="#fff" />, label: 'Sync',      sub: 'Data',         bg: '#0e7490'  },
  ]

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: T.bg }}>
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
        style={hc.headerBg}
        blurRadius={T.isDark ? 5 : 6}
        resizeMode="cover"
      >
        {/* Overlay — hospital: deeper navy-teal tint */}
        <LinearGradient
          colors={T.isDark
            ? ['rgba(2,20,60,0.92)', 'rgba(8,50,80,0.90)']
            : ['rgba(0,30,100,0.86)', 'rgba(4,60,80,0.85)']}
          style={StyleSheet.absoluteFill}
        />

        {/* TZ flag mini-stripe */}
        <View style={hc.flagStripe}>
          <View style={{ flex: 3, backgroundColor: TZ.green }} />
          <View style={{ width: 9,  backgroundColor: TZ.yellow }} />
          <View style={{ width: 7,  backgroundColor: TZ.black  }} />
          <View style={{ width: 9,  backgroundColor: TZ.yellow }} />
          <View style={{ flex: 3, backgroundColor: TZ.blue  }} />
        </View>

        {/* ── MAIN HEADER ROW ──────────────────────────────────────────── */}
        <View style={hc.headerRow}>

          {/* LEFT: NBS Logo */}
          <TouchableOpacity style={hc.nbsLogoWrap} activeOpacity={0.8}>
            <View style={hc.nbsCircle}>
              <Image
                source={require('../../../public/assets/longo_nbs.png')}
                style={{ width: 32, height: 32 }}
                resizeMode="contain"
              />
            </View>
            <Text style={hc.nbsLabel}>NBS</Text>
          </TouchableOpacity>

          {/* CENTRE: Brand title */}
          <View style={hc.headerCenter}>
            <Text style={hc.headerTitle}>NBS-CENSUS</Text>
            <View style={hc.headerLine} />
            <Text style={hc.headerSub}>Census for Development</Text>
          </View>

          {/* RIGHT: Profile + toggle */}
          <View style={hc.headerRight}>
            <TouchableOpacity
              onPress={() => setIsDark(!isDark)}
              style={hc.themeBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              {isDark
                ? <Sun  size={13} color={TZ.yellow} />
                : <Moon size={13} color={TZ.yellow} />}
            </TouchableOpacity>
            <View style={hc.profileWrap}>
              <View style={hc.avatarRing}>
                <View style={[hc.avatar, { backgroundColor: H.primaryL }]}>
                  <Text style={hc.avatarText}>{initials || 'HO'}</Text>
                </View>
              </View>
              <Text style={hc.empId} numberOfLines={1}>{employeeId}</Text>
            </View>
          </View>

        </View>

        {/* ── SUB-HEADER ───────────────────────────────────────────────── */}
        <View style={hc.subHeader}>
          <View style={hc.subLeft}>
            <View style={hc.roleBadge}>
              <View style={[hc.roleDot, { backgroundColor: H.primaryL }]} />
              <Text style={[hc.roleText, { color: H.primaryL }]}>HEALTH FACILITY OFFICER</Text>
            </View>
            <View style={hc.locationRow}>
              <MapPin size={9} color={TZ.yellow} />
              <Text style={hc.locationText} numberOfLines={1}>{facilityName}</Text>
            </View>
          </View>
          <View style={hc.subRight}>
            <TouchableOpacity style={hc.iconBtn} onPress={() => {}}>
              <Bell size={15} color="rgba(255,255,255,0.75)" />
              {unread > 0 && (
                <View style={hc.badge}>
                  <Text style={hc.badgeText}>{unread}</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[hc.iconBtn, { backgroundColor: 'rgba(239,68,68,0.15)' }]}
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
        <View style={[hc.welcomeCard, { backgroundColor: T.card, borderColor: T.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[hc.welcomeHi, { color: T.textSub }]}>Welcome back,</Text>
            <Text style={[hc.welcomeName, { color: T.text }]}>{officerName}</Text>
            <Text style={[hc.welcomeDate, { color: T.textDim }]}>
              {new Date().toLocaleDateString('en-TZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </Text>
          </View>
          <View style={hc.welcomeRight}>
            {/* 0.5 km geofence badge */}
            <View style={[hc.zoneBadge, {
              borderColor: inZone ? `${H.primary}60` : `${T.danger}60`,
              backgroundColor: inZone ? `${H.primary}18` : `${T.danger}15`,
            }]}>
              <MapPin size={9} color={inZone ? H.primaryL : T.danger} />
              <Text style={[hc.zoneText, { color: inZone ? H.primaryL : T.danger }]}>
                {inZone ? '✓ In Zone · 0.5km' : '✗ Out of Zone'}
              </Text>
            </View>
            <View style={hc.syncRow}>
              {syncOk
                ? <Wifi    size={10} color={T.success} />
                : <WifiOff size={10} color={T.danger}  />}
              <Text style={[hc.syncText, { color: T.textDim }]}>
                {syncOk ? 'RITA Synced' : 'Offline'}
              </Text>
            </View>
          </View>
        </View>

        {/* ── STATISTICS ──────────────────────────────────────────────── */}
        <View style={hc.sectionHead}>
          <Text style={[hc.sectionTitle, { color: T.text }]}>Today's Statistics</Text>
          <TouchableOpacity>
            <Text style={[hc.sectionLink, { color: T.primaryL }]}>Full report →</Text>
          </TouchableOpacity>
        </View>

        <View style={hc.statsRow}>
          <StatCard icon={<Baby      size={18} color={TZ.green}   />} value="14"  label="Births"       color={TZ.green}   T={T} sub="This month" />
          <StatCard icon={<Cross     size={18} color={T.danger}   />} value="3"   label="Deaths"       color={T.danger}   T={T} sub="This month" />
          <StatCard icon={<FileText  size={18} color={H.primary}  />} value="11"  label="Certificates" color={H.primary}  T={T} sub="Issued"     />
          <StatCard icon={<Clock     size={18} color={H.orange}   />} value="2"   label="Pending"      color={H.orange}   T={T} sub="Cases"      />
        </View>

        {/* ── QUICK ACTIONS ───────────────────────────────────────────── */}
        <View style={hc.sectionHead}>
          <Text style={[hc.sectionTitle, { color: T.text }]}>Quick Actions</Text>
        </View>

        <View style={hc.actionsGrid}>
          {actions.map(a => (
            <ActionCard key={a.id} item={a} T={T} onPress={() => {}} />
          ))}
        </View>

        {/* ── FACILITY INFO CARD ──────────────────────────────────────── */}
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
              <Text style={[hc.facilityName, { color: T.text }]}>{facilityName}</Text>
              <Text style={[hc.facilityType, { color: T.textSub }]}>Regional Hospital · Level 5</Text>
              <View style={hc.facilityRow}>
                <Shield size={10} color={H.primaryL} />
                <Text style={[hc.facilityInfo, { color: T.textDim }]}>Authorized RITA reporting facility</Text>
              </View>
            </View>
          </LinearGradient>

          {/* Stats row */}
          <View style={[hc.facilityStats, { borderTopColor: T.border }]}>
            {[
              { label: 'Deliveries', value: '247', color: TZ.green },
              { label: 'Certs Issued', value: '241', color: H.primary },
              { label: 'Pending', value: '6', color: H.orange },
            ].map(s => (
              <View key={s.label} style={hc.facilityStatItem}>
                <Text style={[hc.facilityStatVal, { color: s.color }]}>{s.value}</Text>
                <Text style={[hc.facilityStatLabel, { color: T.textDim }]}>{s.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── RECENT ACTIVITY ─────────────────────────────────────────── */}
        <View style={hc.sectionHead}>
          <Text style={[hc.sectionTitle, { color: T.text }]}>Recent Activity</Text>
          <TouchableOpacity>
            <Text style={[hc.sectionLink, { color: T.primaryL }]}>All →</Text>
          </TouchableOpacity>
        </View>

        <View style={[hc.activityCard, { backgroundColor: T.card, borderColor: T.border }]}>
          {ACTIVITY.map((item, idx) => (
            <View key={item.id}>
              <TouchableOpacity style={hc.activityRow} activeOpacity={0.7}>
                <View style={[hc.activityDot, { backgroundColor: `${item.color}22` }]}>
                  <Text style={{ fontSize: 15 }}>{item.icon}</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={[hc.activityLabel, { color: T.textSub }]}>{item.label}</Text>
                  <Text style={[hc.activityName, { color: T.text }]}>{item.name}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Text style={[hc.activityTime, { color: T.textDim }]}>{item.time}</Text>
                  <ChevronRight size={13} color={T.textDim} />
                </View>
              </TouchableOpacity>
              {idx < ACTIVITY.length - 1 && (
                <View style={[hc.divider, { backgroundColor: T.border, marginLeft: 60 }]} />
              )}
            </View>
          ))}
        </View>

        {/* ── FOOTER ──────────────────────────────────────────────────── */}
        <View style={hc.footer}>
          <View style={hc.footerFlag}>
            <View style={{ flex: 1, backgroundColor: TZ.green, height: 3, borderRadius: 1 }} />
            <View style={{ width: 8, backgroundColor: TZ.yellow, height: 3 }} />
            <View style={{ width: 6, backgroundColor: TZ.black,  height: 3 }} />
            <View style={{ width: 8, backgroundColor: TZ.yellow, height: 3 }} />
            <View style={{ flex: 1, backgroundColor: TZ.blue,   height: 3, borderRadius: 1 }} />
          </View>
          <Text style={[hc.footerText, { color: T.textDim }]}>
            National Bureau of Statistics · Health Facility Reporting
          </Text>
          <Text style={[hc.footerText, { color: T.textDim }]}>
            © 2026 The United Republic of Tanzania
          </Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const hc = StyleSheet.create({
  // Header
  headerBg:    { overflow: 'hidden' },
  flagStripe:  { flexDirection: 'row', height: 5 },
  headerRow:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14,
                 paddingTop: 10, paddingBottom: 8, gap: 10 },

  // NBS logo
  nbsLogoWrap: { alignItems: 'center', width: 56 },
  nbsCircle:   { width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(255,255,255,0.12)',
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
  avatar:      { flex: 1, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarText:  { fontSize: 13, fontWeight: '900', color: TZ.navy },
  empId:       { fontSize: 7, color: 'rgba(255,255,255,0.55)', marginTop: 3, maxWidth: 58, textAlign: 'center' },

  // Sub-header
  subHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                  paddingHorizontal: 14, paddingBottom: 12, paddingTop: 2 },
  subLeft:      { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  subRight:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  roleBadge:    { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1,
                  borderColor: `${H.primary}60`, backgroundColor: `${H.primary}18`,
                  borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  roleDot:      { width: 5, height: 5, borderRadius: 2.5 },
  roleText:     { fontSize: 8, fontWeight: '700', letterSpacing: 0.7 },
  locationRow:  { flexDirection: 'row', alignItems: 'center', gap: 3, flex: 1 },
  locationText: { fontSize: 9, color: 'rgba(255,255,255,0.55)', flex: 1 },
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
  statCard:     { flex: 1, borderRadius: 14, borderWidth: 1, padding: 10, alignItems: 'center', gap: 3 },
  statIcon:     { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  statValue:    { fontSize: 20, fontWeight: '900' },
  statLabel:    { fontSize: 9, textAlign: 'center', fontWeight: '600' },
  statSub:      { fontSize: 8, textAlign: 'center' },

  // Actions
  actionsGrid:  { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, gap: 8 },
  actionCard:   { width: (W - 40) / 3, borderRadius: 14, borderWidth: 1,
                  padding: 12, alignItems: 'center', gap: 6 },
  actionIcon:   { width: 46, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  actionLabel:  { fontSize: 11, fontWeight: '700', textAlign: 'center' },
  actionSub:    { fontSize: 9, textAlign: 'center' },

  // Facility
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
  footerFlag:  { flexDirection: 'row', width: 80, height: 3, marginBottom: 8 },
  footerText:  { fontSize: 9 },
})
