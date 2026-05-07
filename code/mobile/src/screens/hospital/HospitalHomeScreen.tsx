/**
 * HospitalHomeScreen.tsx — Health Facility Officer Placeholder Dashboard
 * Sprint 1 placeholder — real features built in Sprint 2+.
 * Confirms JWT auth is working for hospital_officer role.
 */

import React, { useState, useEffect } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { MapPin, Baby, Cross, FileText, Clock } from 'lucide-react-native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'

// ── Types ─────────────────────────────────────────────────────────────────────
type RootStack = {
  Splash:       undefined
  Login:        undefined
  VillageHome:  undefined
  HospitalHome: undefined
}

type Props = {
  navigation: NativeStackNavigationProp<RootStack, 'HospitalHome'>
}

// ── Colours (orange theme — matches web PlaceholderDashboard hospital accent) ──
const O = {
  bg:     '#050d1a',
  card:   '#0d1f38',
  border: '#1e3a5f',
  orange: '#fb923c',
  text:   '#ffffff',
  dim:    '#94a3b8',
  faint:  '#1e3a5f',
} as const

// ── Stat card ─────────────────────────────────────────────────────────────────
type StatCardProps = {
  icon:  React.ReactNode
  label: string
  value: string
}

function StatCard({ icon, label, value }: StatCardProps) {
  return (
    <View style={s.statCard}>
      <View style={s.statIcon}>{icon}</View>
      <Text style={s.statVal}>{value}</Text>
      <Text style={s.statLbl}>{label}</Text>
    </View>
  )
}

// ── Screen ────────────────────────────────────────────────────────────────────
export default function HospitalHomeScreen({ navigation }: Props) {

  const [email,       setEmail]       = useState('')
  const [token,       setToken]       = useState('')
  const [loggingOut,  setLoggingOut]  = useState(false)
  const [loadingUser, setLoadingUser] = useState(true)

  useEffect(() => {
    AsyncStorage.multiGet(['adlcs_access_token', 'adlcs_role']).then(pairs => {
      const tok = pairs[0][1] ?? ''
      setToken(tok)
      setEmail('hospital@adlcs.tz')   // real impl: GET /api/auth/me with token
      setLoadingUser(false)
    })
  }, [])

  const handleLogout = async () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout', style: 'destructive',
        onPress: async () => {
          setLoggingOut(true)
          await AsyncStorage.multiRemove([
            'adlcs_access_token', 'adlcs_refresh_token', 'adlcs_role',
          ])
          setLoggingOut(false)
          navigation.replace('Login')
        },
      },
    ])
  }

  if (loadingUser) {
    return (
      <View style={[s.screen, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={O.orange} />
      </View>
    )
  }

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* ── Header gradient ──────────────────────────────────────────── */}
        <LinearGradient
          colors={[`${O.orange}18`, `${O.bg}`]}
          style={s.header}
        >
          <View style={s.headerRow}>
            <View>
              <Text style={s.roleTag}>HEALTH FACILITY OFFICER</Text>
              <Text style={s.greeting}>Good day 👋</Text>
              <Text style={s.emailTxt}>{email}</Text>
            </View>
            <TouchableOpacity
              style={s.logoutBtn}
              onPress={handleLogout}
              disabled={loggingOut}
            >
              <Text style={s.logoutTxt}>
                {loggingOut ? 'Logging out…' : 'Logout'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Role badge */}
          <View style={[s.badge, { borderColor: `${O.orange}50`, backgroundColor: `${O.orange}15` }]}>
            <View style={s.badgeDot} />
            <Text style={[s.badgeTxt, { color: O.orange }]}>Authenticated · MFA Disabled (test)</Text>
          </View>
        </LinearGradient>

        {/* ── Stats grid ───────────────────────────────────────────────── */}
        <View style={s.statsGrid}>
          <StatCard icon={<Baby     size={20} color={O.orange} />} label="Births"       value="—" />
          <StatCard icon={<Cross    size={20} color={O.orange} />} label="Deaths"        value="—" />
          <StatCard icon={<FileText size={20} color={O.orange} />} label="Certificates"  value="—" />
          <StatCard icon={<Clock    size={20} color={O.orange} />} label="Pending"        value="—" />
        </View>

        {/* ── Sprint notice ────────────────────────────────────────────── */}
        <View style={s.sprintCard}>
          <Text style={s.sprintTitle}>🚧 Sprint 1 Complete</Text>
          <Text style={s.sprintBody}>
            JWT authentication confirmed for Health Facility Officer role.
            Real dashboard features arrive in Sprint 2.
          </Text>
          <Text style={[s.sprintNext, { color: O.orange }]}>
            📌 Next: Birth/death registration, certificate generation, facility stats
          </Text>
        </View>

        {/* ── JWT debug panel ──────────────────────────────────────────── */}
        <View style={s.debugCard}>
          <Text style={s.debugTitle}>🔐 Active Session</Text>
          <Text style={s.debugRow}>
            <Text style={s.debugKey}>Role: </Text>
            <Text style={s.debugVal}>hospital_officer</Text>
          </Text>
          <Text style={s.debugRow}>
            <Text style={s.debugKey}>Token: </Text>
            <Text style={[s.debugVal, { color: O.orange }]}>
              {token.length > 0 ? `${token.slice(0, 24)}…` : '—'}
            </Text>
          </Text>
        </View>

        {/* ── Location badge ───────────────────────────────────────────── */}
        <View style={s.locationRow}>
          <MapPin size={12} color={O.dim} />
          <Text style={s.locationTxt}>NBS Health Reporting · Tanzania</Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  screen:      { flex: 1, backgroundColor: O.bg },

  header:      { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16 },
  headerRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  roleTag:     { fontSize: 9, color: O.orange, letterSpacing: 2, fontWeight: '700', textTransform: 'uppercase' },
  greeting:    { fontSize: 20, fontWeight: '800', color: O.text, marginTop: 2 },
  emailTxt:    { fontSize: 11, color: O.dim, marginTop: 2 },
  logoutBtn:   { backgroundColor: O.card, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: O.faint },
  logoutTxt:   { fontSize: 12, color: O.dim, fontWeight: '600' },
  badge:       { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  badgeDot:    { width: 6, height: 6, borderRadius: 3, backgroundColor: O.orange },
  badgeTxt:    { fontSize: 10, fontWeight: '600' },

  statsGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 16, paddingVertical: 12 },
  statCard:    { flex: 1, minWidth: '44%', backgroundColor: O.card, borderRadius: 14, borderWidth: 1, borderColor: `${O.orange}30`, padding: 14, alignItems: 'center', gap: 6 },
  statIcon:    { width: 40, height: 40, borderRadius: 20, backgroundColor: `${O.orange}15`, alignItems: 'center', justifyContent: 'center' },
  statVal:     { fontSize: 22, fontWeight: '800', color: O.orange },
  statLbl:     { fontSize: 10, color: O.dim, textAlign: 'center' },

  sprintCard:  { marginHorizontal: 16, backgroundColor: O.card, borderRadius: 14, borderWidth: 1, borderColor: O.faint, padding: 16, marginBottom: 12 },
  sprintTitle: { fontSize: 13, fontWeight: '700', color: '#fbbf24', marginBottom: 6 },
  sprintBody:  { fontSize: 12, color: O.dim, lineHeight: 18, marginBottom: 6 },
  sprintNext:  { fontSize: 11 },

  debugCard:   { marginHorizontal: 16, backgroundColor: O.card, borderRadius: 14, borderWidth: 1, borderColor: O.faint, padding: 14, marginBottom: 20 },
  debugTitle:  { fontSize: 10, color: O.dim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  debugRow:    { fontSize: 11, color: O.dim, marginBottom: 4 },
  debugKey:    { color: O.dim },
  debugVal:    { color: O.text, fontFamily: 'monospace' },

  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 5, justifyContent: 'center', paddingBottom: 24 },
  locationTxt: { fontSize: 10, color: O.dim },
})
