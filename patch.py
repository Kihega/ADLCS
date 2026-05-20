#!/usr/bin/env python3
"""
ADLCS — patch_online_only.py
==============================
Removes offline/SQLite capability, disables geofencing, removes multi-token
onboarding. App opens directly to Login and communicates exclusively with
https://adlcs-backend.onrender.com — all data persists to Supabase via backend.

Place this file at the project root (same folder as `code/`), then run:
    python3 patch_online_only.py
"""

import os, sys, re

ROOT    = os.path.dirname(os.path.abspath(__file__))
MOBILE  = os.path.join(ROOT, 'code', 'mobile')
BACKEND = os.path.join(ROOT, 'code', 'backend')

ok = []; fail = []

# ─── helpers ──────────────────────────────────────────────────────────────────
def write(rel, content):
    path = os.path.join(ROOT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    ok.append(rel)
    print(f'  ✓ {rel}')

def patch(rel, replacements):
    """Apply list of (old, new) string replacements to a file."""
    path = os.path.join(ROOT, rel)
    try:
        with open(path, 'r', encoding='utf-8') as f:
            src = f.read()
        for old, new in replacements:
            if old not in src:
                print(f'  ⚠  [{rel}] pattern not found — skipping one replacement')
                continue
            src = src.replace(old, new, 1)
        with open(path, 'w', encoding='utf-8') as f:
            f.write(src)
        ok.append(rel)
        print(f'  ✓ {rel}  (patched)')
    except FileNotFoundError:
        fail.append(rel)
        print(f'  ✗ {rel}  FILE NOT FOUND')

# ── Inline AbortSignal polyfill helper ──────────────────────────────────────
def _abort(ms_str):
    """Return an inline IIFE that replaces AbortSignal.timeout(ms)."""
    return f"(()=>{{const __c=new AbortController();setTimeout(()=>__c.abort(),{ms_str});return __c.signal}})()"

# =============================================================================
# 1. App.js — instant boot, no GeofenceProvider, no localDb/SyncService
# =============================================================================
print('\n[1] App.js')
write('code/mobile/App.js', """\
/**
 * App.js — ADLCS Mobile Root  v8.0  ONLINE-ONLY
 * Offline SQLite removed. Geofencing disabled for dev/test.
 * App boots instantly to Login (via Splash).
 * All data goes directly to backend → Supabase.
 */
import React from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import { ThemeProvider }    from './src/context/ThemeContext'
import { GeofenceProvider } from './src/context/GeofenceContext'
import { navigationRef }    from './src/navigation/navigationService'

// ── Shared ────────────────────────────────────────────────────────────────────
import SplashScreen  from './src/screens/SplashScreen'
import LoginScreen   from './src/screens/auth/LoginScreen'

// ── Hospital officer ──────────────────────────────────────────────────────────
import HospitalHomeScreen     from './src/screens/hospital/HospitalHomeScreen'
import RegisterBirthScreen    from './src/screens/hospital/RegisterBirthScreen'
import RecordDeathScreen      from './src/screens/hospital/RecordDeathScreen'
import IssueCertificateScreen from './src/screens/hospital/IssueCertificateScreen'
import ViewRecordsScreen      from './src/screens/hospital/ViewRecordsScreen'
import PendingCasesScreen     from './src/screens/hospital/PendingCasesScreen'
import SyncDataScreen         from './src/screens/hospital/SyncDataScreen'

// ── Village officer ───────────────────────────────────────────────────────────
import VillageHomeScreen            from './src/screens/village/VillageHomeScreen'
import RegisterCitizenScreen        from './src/screens/village/RegisterCitizenScreen'
import RegisterMarriageScreen       from './src/screens/village/RegisterMarriageScreen'
import VillageRecordDeathScreen     from './src/screens/village/VillageRecordDeathScreen'
import RegisterBuildingScreen       from './src/screens/village/RegisterBuildingScreen'
import RegisterInfrastructureScreen from './src/screens/village/RegisterInfrastructureScreen'
import TrackMigrationScreen         from './src/screens/village/TrackMigrationScreen'
import VillageViewRecordsScreen     from './src/screens/village/VillageViewRecordsScreen'

const Stack = createNativeStackNavigator()

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        {/* GeofenceProvider is a no-op stub — geofencing disabled for dev */}
        <GeofenceProvider>
          <NavigationContainer ref={navigationRef}>
            <Stack.Navigator
              initialRouteName="Splash"
              screenOptions={{
                headerShown:  false,
                animation:    'fade',
                contentStyle: { backgroundColor: '#050d1a' },
              }}
            >
              {/* ── Shared ────────────────────────────────────────── */}
              <Stack.Screen name="Splash"   component={SplashScreen} />
              <Stack.Screen name="Login"    component={LoginScreen} />

              {/* ── Hospital Officer ──────────────────────────────── */}
              <Stack.Screen name="HospitalHome"     component={HospitalHomeScreen} />
              <Stack.Screen name="RegisterBirth"    component={RegisterBirthScreen}
                options={{ animation: 'slide_from_right' }} />
              <Stack.Screen name="RecordDeath"      component={RecordDeathScreen}
                options={{ animation: 'slide_from_right' }} />
              <Stack.Screen name="IssueCertificate" component={IssueCertificateScreen}
                options={{ animation: 'slide_from_right' }} />
              <Stack.Screen name="ViewRecords"      component={ViewRecordsScreen}
                options={{ animation: 'slide_from_right' }} />
              <Stack.Screen name="PendingCases"     component={PendingCasesScreen}
                options={{ animation: 'slide_from_right' }} />
              <Stack.Screen name="SyncData"         component={SyncDataScreen}
                options={{ animation: 'slide_from_bottom' }} />

              {/* ── Village Officer ───────────────────────────────── */}
              <Stack.Screen name="VillageHome"             component={VillageHomeScreen} />
              <Stack.Screen name="RegisterCitizen"         component={RegisterCitizenScreen}
                options={{ animation: 'slide_from_right' }} />
              <Stack.Screen name="RegisterMarriage"        component={RegisterMarriageScreen}
                options={{ animation: 'slide_from_right' }} />
              <Stack.Screen name="VillageRecordDeath"      component={VillageRecordDeathScreen}
                options={{ animation: 'slide_from_right' }} />
              <Stack.Screen name="RegisterBuilding"        component={RegisterBuildingScreen}
                options={{ animation: 'slide_from_right' }} />
              <Stack.Screen name="RegisterInfrastructure"  component={RegisterInfrastructureScreen}
                options={{ animation: 'slide_from_right' }} />
              <Stack.Screen name="TrackMigration"          component={TrackMigrationScreen}
                options={{ animation: 'slide_from_right' }} />
              <Stack.Screen name="VillageViewRecords"      component={VillageViewRecordsScreen}
                options={{ animation: 'slide_from_right' }} />
            </Stack.Navigator>
          </NavigationContainer>
        </GeofenceProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  )
}
""")

# =============================================================================
# 2. GeofenceContext.tsx — no-op stub (GPS disabled for dev/test)
# =============================================================================
print('\n[2] GeofenceContext.tsx (no-op stub)')
write('code/mobile/src/context/GeofenceContext.tsx', """\
/**
 * GeofenceContext.tsx — NO-OP STUB (dev/test mode)
 *
 * Geofencing is temporarily disabled to speed up development and testing.
 * All screens that import useGeofence() receive safe static values:
 *   inZone = true, distanceKm = 0, setGeofenceConfig = no-op
 *
 * No GPS permissions are requested. Re-enable by restoring the full
 * implementation when geofencing is needed.
 */

import React, { createContext, useContext, ReactNode } from 'react'

export interface GeofenceConfig {
  gps:  { lat: number; lng: number }
  role: string
}

interface GeofenceCtx {
  inZone:            boolean
  distanceKm:        number | null
  setGeofenceConfig: (cfg: GeofenceConfig) => void
}

const GeofenceContext = createContext<GeofenceCtx>({
  inZone:            true,
  distanceKm:        0,
  setGeofenceConfig: () => {},
})

export function GeofenceProvider({ children }: { children: ReactNode }) {
  // No GPS tracking — geofencing disabled for dev/test
  return (
    <GeofenceContext.Provider value={{ inZone: true, distanceKm: 0, setGeofenceConfig: () => {} }}>
      {children}
    </GeofenceContext.Provider>
  )
}

export function useGeofence(): GeofenceCtx {
  return useContext(GeofenceContext)
}
""")

# =============================================================================
# 3. localDb.ts — stubs only (no SQLite)
# =============================================================================
print('\n[3] localDb.ts (stubs, no SQLite)')
write('code/mobile/src/services/localDb.ts', """\
/**
 * localDb.ts  v8.0  STUBS ONLY — online-only mode
 *
 * SQLite / expo-sqlite completely removed.
 * Retained exports:
 *   • Type definitions  (LocalBirth, LocalDeath) — used by screens
 *   • Cert / ID generators — used by form screens to pre-fill cert numbers
 *   • No-op async stubs — satisfy any remaining imports without crashing
 *
 * All real data persistence goes directly to the backend via syncService.
 */

// ─── Types ─────────────────────────────────────────────────────────────────────
export interface LocalBirth {
  id:               string
  certNo:           string
  nationalId:       string
  childFirstName:   string
  childMiddleName:  string
  childSurname:     string
  gender:           string
  dateOfBirth:      string   // DD/MM/YYYY
  fatherName:       string
  fatherNid:        string
  motherName:       string
  motherNid:        string
  facilityName:     string
  facilityDistrict: string
  facilityRegion:   string
  officerName:      string
  registeredAt:     string   // ISO
  synced:           number   // 0 | 1
  certPdfPath:      string
  rawJson:          string
}

export interface LocalDeath {
  id:               string
  certNo:           string
  nationalId:       string
  deceasedName:     string
  causeOfDeath:     string
  dateOfDeath:      string   // DD/MM/YYYY
  locationType:     string
  category:         string
  informantName:    string
  facilityName:     string
  officerName:      string
  registeredAt:     string
  synced:           number
  certPdfPath:      string
  rawJson:          string
}

export interface OfficerCache {
  officerName:        string
  facilityName:       string
  facilityType:       string
  facilityGrade:      string
  facilityRegion:     string
  facilityDistrict:   string
  facilityGpsLat:     string
  facilityGpsLng:     string
  todayBirths:        number
  todayDeaths:        number
  monthBirths:        number
  monthDeaths:        number
  pendingCases:       number
  facilityCertIssued: number
  facilityDeliveries: number
}

// ─── Cert / ID generators ──────────────────────────────────────────────────────
export function generateBirthCertNo(): string {
  const seq = Math.floor(Math.random() * 90000000 + 10000000)
  return `${seq} A`
}

export function generateDeathCertNo(): string {
  const seq = Math.floor(Math.random() * 90000000 + 10000000)
  return `TZ-D-${seq} A`
}

export function generateNewbornNationalId(
  dob: string,
  regionCode   = '07',
  districtCode = '03',
  wardCode     = '1',
): string {
  const parts   = dob.split('/')
  const day     = (parts[0] ?? '01').padStart(2, '0')
  const month   = (parts[1] ?? '01').padStart(2, '0')
  const year    = parts[2] ?? String(new Date().getFullYear())
  const date    = `${year}${month}${day}`
  const loc     = `${regionCode.padStart(2,'0')}${districtCode.padStart(2,'0')}${wardCode.padStart(1,'0')}`
  const seq     = String(Math.floor(Math.random() * 89999) + 10001).padStart(5, '0')
  const cc      = String(Math.floor(Math.random() * 89) + 10)
  return `${date}-${loc}-${seq}-${cc}`
}

export function generateNationalId(
  dob: string,
  regionCode   = '07',
  districtCode = '03',
  wardCode     = '1',
): string {
  const parts = dob.split('/')
  const day   = (parts[0] ?? '01').padStart(2, '0')
  const month = (parts[1] ?? '01').padStart(2, '0')
  const year  = parts[2] ?? '2026'
  const date  = `${year}${month}${day}`
  const loc   = `${regionCode.padStart(2,'0')}${districtCode.padStart(2,'0')}${wardCode.padStart(1,'0')}`
  const seq   = String(Math.floor(Math.random() * 90000) + 10000).padStart(5, '0')
  const cc    = String(Math.floor(Math.random() * 90) + 10)
  return `${date}-${loc}-${seq}-${cc}`
}

// ─── No-op stubs (satisfy imports, no SQLite operations) ──────────────────────
export async function getDb(): Promise<any>           { return null }
export async function saveBirth(d: any): Promise<any> { return { ...d, id:`stub-${Date.now()}`, registeredAt:new Date().toISOString(), synced:0, certPdfPath:'' } }
export async function saveDeath(d: any): Promise<any> { return { ...d, id:`stub-${Date.now()}`, registeredAt:new Date().toISOString(), synced:0, certPdfPath:'' } }
export async function markBirthSynced(_id: string): Promise<void> {}
export async function markDeathSynced(_id: string): Promise<void> {}
export async function getAllBirths(): Promise<LocalBirth[]> { return [] }
export async function getAllDeaths(): Promise<LocalDeath[]> { return [] }
export async function getPendingBirths(): Promise<LocalBirth[]> { return [] }
export async function getPendingDeaths(): Promise<LocalDeath[]> { return [] }
export async function getBirthById(_id: string): Promise<LocalBirth | null> { return null }
export async function updateBirthCertPath(_id: string, _path: string): Promise<void> {}
export async function updateDeathCertPath(_id: string, _path: string): Promise<void> {}
export async function getLocalStats() {
  return { todayBirths:0, todayDeaths:0, monthBirths:0, monthDeaths:0, pendingSync:0, totalBirths:0, totalDeaths:0 }
}
export async function cacheOfficerData(_data: Partial<OfficerCache>): Promise<void> {}
export async function getCachedOfficerData(): Promise<Partial<OfficerCache>> { return {} }
""")

# =============================================================================
# 4. syncService.ts — online-only API client (no NetInfo / SQLite)
# =============================================================================
print('\n[4] syncService.ts (online-only API client)')
write('code/mobile/src/services/syncService.ts', """\
/**
 * syncService.ts  v8.0  ONLINE-ONLY
 *
 * All data goes directly to backend (https://adlcs-backend.onrender.com).
 * No offline SQLite queue — every call is a live API request.
 *
 * AbortSignal.timeout() is NOT used (Hermes incompatible).
 * Timeouts use AbortController + setTimeout instead.
 *
 * Exports:
 *   apiGet / apiPost          — authenticated HTTP helpers
 *   isOnline / getConnQuality — always-online stubs
 *   saveAndSyncBirth/Death    — POST directly to backend
 *   fetchRemoteDashboard/Activity/Records/OfficerProfile
 *   checkConnQuality          — real ping to /api/health
 *   getSyncStatus             — stub (no local queue)
 *   triggerSync / init / stop — no-ops
 */

import AsyncStorage from '@react-native-async-storage/async-storage'
import { LocalBirth, LocalDeath } from './localDb'

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'https://adlcs-backend.onrender.com/api'

export type ConnQuality = 'Good' | 'Fair' | 'Offline'
export interface SyncResult { synced: number; failed: number; offline: boolean }

// ─── Online status — always true in online-only mode ──────────────────────────
export function isOnline(): boolean { return true }
export function getConnQuality(): ConnQuality { return 'Good' }

// ─── Abort-controller timeout helper (Hermes-safe) ────────────────────────────
function makeSignal(ms: number): { signal: AbortSignal; clear: () => void } {
  const ctrl  = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  return { signal: ctrl.signal, clear: () => clearTimeout(timer) }
}

// ─── Auth token ───────────────────────────────────────────────────────────────
async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem('adlcs_access_token')
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────
export async function apiPost(endpoint: string, body: object): Promise<any> {
  const token = await getToken()
  if (!token) throw new Error('No auth token')
  const { signal, clear } = makeSignal(15_000)
  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify(body),
      signal,
    })
    clear()
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  } catch (e) { clear(); throw e }
}

export async function apiGet(endpoint: string): Promise<any> {
  const token = await getToken()
  if (!token) throw new Error('No auth token')
  const { signal, clear } = makeSignal(10_000)
  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal,
    })
    clear()
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  } catch (e) { clear(); throw e }
}

// ─── Connection quality check ──────────────────────────────────────────────────
export async function checkConnQuality(): Promise<ConnQuality> {
  const { signal, clear } = makeSignal(3000)
  try {
    const t = Date.now()
    await fetch(`${API_BASE}/health`, { signal })
    clear()
    return Date.now() - t < 700 ? 'Good' : 'Fair'
  } catch { clear(); return 'Offline' }
}

// ─── Save birth → POST directly to backend ────────────────────────────────────
export async function saveAndSyncBirth(
  data: Omit<LocalBirth, 'id'|'registeredAt'|'synced'|'certPdfPath'>
): Promise<{ birth: LocalBirth; syncedRemote: boolean }> {
  const now  = new Date().toISOString()
  const id   = `online-${Date.now()}`
  const birth: LocalBirth = { ...data, id, registeredAt: now, synced: 0, certPdfPath: '' }

  try {
    const json = await apiPost('/officer/birth/sync', {
      localId:         id,
      birthCertNo:     data.certNo,
      nationalId:      data.nationalId,
      childFirstName:  data.childFirstName,
      childMiddleName: data.childMiddleName,
      childSurname:    data.childSurname,
      gender:          data.gender.toLowerCase(),
      dateOfBirth:     data.dateOfBirth,
      fatherNid:       data.fatherNid,
      motherNid:       data.motherNid,
      registeredAt:    now,
    })
    if (json.success || json.duplicate) {
      await AsyncStorage.setItem('adlcs_last_sync', now)
      return { birth: { ...birth, synced: 1 }, syncedRemote: true }
    }
  } catch (e) { console.warn('[saveAndSyncBirth]', e) }

  return { birth, syncedRemote: false }
}

// ─── Save death → POST directly to backend ────────────────────────────────────
export async function saveAndSyncDeath(
  data: Omit<LocalDeath, 'id'|'registeredAt'|'synced'|'certPdfPath'>
): Promise<{ death: LocalDeath; syncedRemote: boolean }> {
  const now  = new Date().toISOString()
  const id   = `online-${Date.now()}`
  const death: LocalDeath = { ...data, id, registeredAt: now, synced: 0, certPdfPath: '' }

  try {
    const json = await apiPost('/officer/death/sync', {
      localId:       id,
      deathCertNo:   data.certNo,
      nationalId:    data.nationalId,
      causeOfDeath:  data.causeOfDeath,
      dateOfDeath:   data.dateOfDeath,
      locationType:  data.locationType,
      category:      data.category,
      informantName: data.informantName,
      registeredAt:  now,
    })
    if (json.success || json.duplicate) {
      await AsyncStorage.setItem('adlcs_last_sync', now)
      return { death: { ...death, synced: 1 }, syncedRemote: true }
    }
  } catch (e) { console.warn('[saveAndSyncDeath]', e) }

  return { death, syncedRemote: false }
}

// ─── Remote data fetchers ──────────────────────────────────────────────────────
export async function fetchRemoteDashboard(): Promise<any | null> {
  try {
    const json = await apiGet('/officer/dashboard')
    return json.success ? json.data : null
  } catch { return null }
}

export async function fetchRemoteActivity(): Promise<any[]> {
  try {
    const json = await apiGet('/officer/activity?limit=5')
    return json.success ? json.data : []
  } catch { return [] }
}

export async function fetchRemoteRecords(
  type: 'all'|'birth'|'death', page: number, query: string
): Promise<{ data: any[]; total: number } | null> {
  try {
    const params = new URLSearchParams({
      type, page: String(page), limit: '30', ...(query ? { q: query } : {})
    })
    const json = await apiGet(`/officer/records?${params}`)
    return json.success ? { data: json.data, total: json.total ?? json.data.length } : null
  } catch { return null }
}

export async function fetchOfficerProfile(): Promise<any | null> {
  try {
    const json = await apiGet('/officer/profile')
    return json.success ? json.data : null
  } catch { return null }
}

// ─── Sync status — no local queue in online-only mode ─────────────────────────
export async function getSyncStatus() {
  const lastSync = await AsyncStorage.getItem('adlcs_last_sync')
  return { unsyncedBirths: 0, unsyncedDeaths: 0, lastSyncAt: lastSync }
}

// ─── No-ops (API compatibility with existing screen imports) ──────────────────
export async function triggerSync(): Promise<SyncResult> {
  return { synced: 0, failed: 0, offline: false }
}
export async function init(_getter?: () => Promise<string|null>): Promise<void> {}
export function stop(): void {}
""")

# =============================================================================
# 5. LoginScreen.tsx — login-only (no onboarding/OTP/geofencing)
# =============================================================================
print('\n[5] LoginScreen.tsx (simplified — login form only)')
write('code/mobile/src/screens/auth/LoginScreen.tsx', """\
/**
 * LoginScreen.tsx — ADLCS Mobile Authentication  v8.0  ONLINE-ONLY
 *
 * Onboarding removed for faster dev/test:
 *   • No OTP device activation
 *   • No GPS geofence capture
 *   • No device-activation register modal
 *
 * Flow (all users):
 *   Login form (email + password) → MFA verify (if enabled) → Dashboard
 *
 * To restore onboarding: revert to LoginScreen v7.
 */

import React, { useState, useEffect, useRef } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, KeyboardAvoidingView,
  Platform, Animated, Alert, Dimensions, ImageBackground, Image,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { LinearGradient }  from 'expo-linear-gradient'
import { Eye, EyeOff, Shield, MapPin, Smartphone, AlertCircle } from 'lucide-react-native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'

// ─── Types ────────────────────────────────────────────────────────────────────
type RootStack = {
  Splash:       undefined
  Login:        undefined
  VillageHome:  undefined
  HospitalHome: undefined
}
type LoginScreenProps = {
  navigation: NativeStackNavigationProp<RootStack, 'Login'>
}

// ─── Config ───────────────────────────────────────────────────────────────────
const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'https://adlcs-backend.onrender.com/api'
const { height: SCREEN_H } = Dimensions.get('window')

// ─── Tanzania colours ─────────────────────────────────────────────────────────
const C = {
  pageBg:  '#060f1e',
  cardBg:  '#0d1f38',
  border:  '#1e3a5f',
  inputBg: '#060f1e',
  green:   '#1eb53a',
  text:    '#ffffff',
  textSub: '#94a3b8',
  textDim: '#4b6080',
  red:     '#f87171',
  yellow:  '#fcd116',
  tzGreen: '#1eb53a',
  tzBlue:  '#00a3dd',
  tzNavy:  '#003087',
  white:   '#ffffff',
} as const

// ─── Small shared components ──────────────────────────────────────────────────
function Lbl({ children }: { children: string }) {
  return <Text style={s.lbl}>{children}</Text>
}

type InpProps = {
  value:        string
  onChangeText: (t: string) => void
  placeholder?: string
  secure?:      boolean
  keyboard?:    'default' | 'email-address' | 'number-pad' | 'phone-pad'
  right?:       React.ReactNode
  editable?:    boolean
}
function Inp({ value, onChangeText, placeholder, secure, keyboard, right, editable }: InpProps) {
  return (
    <View style={s.inpWrap}>
      <TextInput
        style={s.inp}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={C.textDim}
        secureTextEntry={secure}
        keyboardType={keyboard ?? 'default'}
        autoCapitalize="none"
        autoCorrect={false}
        editable={editable}
      />
      {right ? <View style={s.inpRight}>{right}</View> : null}
    </View>
  )
}

function ErrMsg({ msg }: { msg: string }) {
  if (!msg) return null
  return (
    <View style={s.errRow}>
      <AlertCircle size={11} color={C.red} />
      <Text style={s.errTxt}>{msg}</Text>
    </View>
  )
}

type PrimaryBtnProps = {
  label:     string
  onPress:   () => void
  loading?:  boolean
  disabled?: boolean
  color?:    string
}
function PrimaryBtn({ label, onPress, loading, disabled, color }: PrimaryBtnProps) {
  return (
    <TouchableOpacity
      style={[s.btn, { backgroundColor: color ?? C.tzGreen }, (disabled || loading) && s.btnOff]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
    >
      {loading
        ? <ActivityIndicator color="#fff" size="small" />
        : <Text style={s.btnTxt}>{label}</Text>
      }
    </TouchableOpacity>
  )
}

// ─── Top Brand Strip ──────────────────────────────────────────────────────────
function TopBrand() {
  return (
    <ImageBackground
      source={require('../../../public/assets/flag.jpg')}
      style={s.topBrand}
      blurRadius={4}
      resizeMode="cover"
    >
      <LinearGradient
        colors={['rgba(0,30,80,0.88)', 'rgba(3,50,100,0.82)']}
        style={StyleSheet.absoluteFill}
      />
      {/* Tanzania flag stripe */}
      <View style={s.flagStripe}>
        <View style={{ flex: 3, backgroundColor: C.tzGreen }} />
        <View style={{ width: 10, backgroundColor: C.yellow }} />
        <View style={{ width: 8,  backgroundColor: '#000' }} />
        <View style={{ width: 10, backgroundColor: C.yellow }} />
        <View style={{ flex: 3, backgroundColor: C.tzBlue }} />
      </View>
      {/* Brand row */}
      <View style={s.topRow}>
        <View style={s.nbsBox}>
          <Image
            source={require('../../../public/assets/longo_nbs.png')}
            style={{ width: 36, height: 36 }}
            resizeMode="contain"
            onError={() => {}}
          />
          <Text style={s.nbsLabel}>NBS</Text>
        </View>
        <View style={s.topCenter}>
          <Text style={s.topGov}>THE UNITED REPUBLIC OF TANZANIA</Text>
          <Text style={s.topTitle}>NBS-CENSUS</Text>
          <View style={s.topDivider} />
          <Text style={s.topSub}>Census for Development</Text>
        </View>
        <View style={s.coaBox}>
          <Image
            source={require('../../../public/assets/court_of_arm.png')}
            style={{ width: 36, height: 36 }}
            resizeMode="contain"
            onError={() => {}}
          />
          <Text style={s.coaLabel}>GoT</Text>
        </View>
      </View>
      <Text style={s.tagline}>&ldquo;Hali ya Watanzania kwa Takwimu&rdquo;</Text>
    </ImageBackground>
  )
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function LoginScreen({ navigation }: LoginScreenProps) {

  const [email,     setEmail]     = useState('')
  const [password,  setPassword]  = useState('')
  const [showPass,  setShowPass]  = useState(false)
  const [mfaCode,   setMfaCode]   = useState('')
  const [tempToken, setTempToken] = useState('')
  const [loginMode, setLoginMode] = useState<'login' | 'mfa_verify'>('login')
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')

  const fadeAnim = useRef(new Animated.Value(0)).current

  // Fade in on mount
  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start()
  }, [])

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleLogin = async () => {
    if (!email.includes('@')) { setError('Enter a valid email address'); return }
    if (password.length < 4)  { setError('Enter your password'); return }
    setError(''); setLoading(true)
    try {
      const res  = await fetch(`${API_BASE}/auth/login`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, password }),
      })
      const data = await res.json() as {
        success: boolean; message?: string
        mfaRequired?: boolean; tempToken?: string
        accessToken?: string; refreshToken?: string
        profile?: { role: string; full_name?: string; employee_id?: string }
      }
      if (!res.ok) { setError(data.message ?? 'Login failed'); return }
      if (data.mfaRequired) {
        setTempToken(data.tempToken ?? '')
        setLoginMode('mfa_verify')
      } else {
        await AsyncStorage.multiSet([
          ['adlcs_access_token',  data.accessToken  ?? ''],
          ['adlcs_refresh_token', data.refreshToken ?? ''],
          ['adlcs_role',          data.profile?.role ?? ''],
          ['adlcs_officer_name',  data.profile?.full_name ?? 'Officer'],
          ['adlcs_employee_id',   data.profile?.employee_id ?? 'EMP-000'],
        ])
        goHome(data.profile?.role ?? '')
      }
    } catch {
      setError('Connection failed. Check your internet.')
    } finally {
      setLoading(false)
    }
  }

  const handleMfaVerify = async () => {
    if (mfaCode.length < 6) { setError('Enter the 6-digit TOTP code'); return }
    setError(''); setLoading(true)
    try {
      const res  = await fetch(`${API_BASE}/auth/mfa/verify`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ tempToken, code: mfaCode }),
      })
      const data = await res.json() as {
        success: boolean; message?: string
        accessToken?: string; refreshToken?: string
        profile?: { role: string; full_name?: string; employee_id?: string }
      }
      if (!res.ok) { setError(data.message ?? 'Invalid MFA code'); setMfaCode(''); return }
      await AsyncStorage.multiSet([
        ['adlcs_access_token',  data.accessToken  ?? ''],
        ['adlcs_refresh_token', data.refreshToken ?? ''],
        ['adlcs_role',          data.profile?.role ?? ''],
        ['adlcs_officer_name',  data.profile?.full_name ?? 'Officer'],
        ['adlcs_employee_id',   data.profile?.employee_id ?? 'EMP-000'],
      ])
      goHome(data.profile?.role ?? '')
    } catch {
      setError('Connection failed. Try again.')
    } finally {
      setLoading(false)
    }
  }

  const goHome = (role: string) => {
    if (role === 'village_officer')       navigation.replace('VillageHome')
    else if (role === 'hospital_officer') navigation.replace('HospitalHome')
    else Alert.alert('Access Denied', 'This app is for field officers only. Use the web portal.')
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <View style={s.screen}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* Top brand */}
          <View style={{ height: SCREEN_H * 0.27 }}>
            <TopBrand />
          </View>

          {/* Card area */}
          <View style={s.cardArea}>
            <Animated.View style={{ opacity: fadeAnim }}>
              <View style={s.card}>

                <View style={s.cardIconWrap}>
                  {loginMode === 'mfa_verify'
                    ? <Smartphone size={22} color={C.tzBlue} />
                    : <Shield     size={22} color={C.tzGreen} />
                  }
                </View>

                <Text style={s.cardTitle}>
                  {loginMode === 'mfa_verify' ? 'MFA Verification' : 'Officer Login'}
                </Text>
                <Text style={s.cardSub}>
                  {loginMode === 'mfa_verify'
                    ? 'Enter the 6-digit code from your authenticator app'
                    : 'Sign in to your NBS field officer account'}
                </Text>

                <ErrMsg msg={error} />

                {/* Login form */}
                {loginMode === 'login' && (
                  <>
                    <Lbl>EMAIL ADDRESS</Lbl>
                    <Inp
                      value={email}
                      onChangeText={t => { setEmail(t); setError('') }}
                      placeholder="official@nbs.go.tz"
                      keyboard="email-address"
                    />
                    <View style={{ height: 12 }} />
                    <Lbl>PASSWORD</Lbl>
                    <Inp
                      value={password}
                      onChangeText={t => { setPassword(t); setError('') }}
                      placeholder="••••••••"
                      secure={!showPass}
                      right={
                        <TouchableOpacity onPress={() => setShowPass(!showPass)}>
                          {showPass
                            ? <EyeOff size={15} color={C.textDim} />
                            : <Eye    size={15} color={C.textDim} />
                          }
                        </TouchableOpacity>
                      }
                    />
                    <View style={{ height: 16 }} />
                    <PrimaryBtn label="Sign In" onPress={handleLogin} loading={loading} color={C.tzNavy} />
                  </>
                )}

                {/* MFA verify */}
                {loginMode === 'mfa_verify' && (
                  <>
                    <View style={[s.infoBox, { borderColor: `${C.tzBlue}40`, backgroundColor: `${C.tzBlue}10` }]}>
                      <Text style={[s.infoTxt, { color: C.tzBlue }]}>
                        Open Google Authenticator → NBS-ADLCS → enter the 6-digit code.
                      </Text>
                    </View>
                    <Lbl>6-DIGIT TOTP CODE</Lbl>
                    <Inp
                      value={mfaCode}
                      onChangeText={t => { setMfaCode(t.replace(/\\D/g, '').slice(0, 6)); setError('') }}
                      placeholder="000 000"
                      keyboard="number-pad"
                    />
                    <View style={{ height: 16 }} />
                    <PrimaryBtn
                      label="Verify & Sign In"
                      onPress={handleMfaVerify}
                      loading={loading}
                      disabled={mfaCode.length < 6}
                      color={C.tzNavy}
                    />
                    <TouchableOpacity
                      onPress={() => { setLoginMode('login'); setError('') }}
                      style={s.linkBtn}
                    >
                      <Text style={s.linkTxt}>← Back to login</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>

              {/* Footer */}
              <View style={s.footer}>
                <MapPin size={11} color={C.textDim} />
                <Text style={s.footerTxt}>NBS Head Office · Dodoma, Tanzania</Text>
              </View>
              <Text style={s.footerTxt2}>Unauthorized access is prohibited and monitored</Text>
              <Text style={s.footerTxt2}>© 2026 National Bureau of Statistics · ADLCS</Text>
            </Animated.View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  )
}

// ─── StyleSheet ───────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  screen:      { flex: 1, backgroundColor: C.pageBg },
  cardArea:    { backgroundColor: C.pageBg, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 36 },

  topBrand:    { flex: 1, overflow: 'hidden' },
  flagStripe:  { flexDirection: 'row', height: 5 },
  topRow:      { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 8, gap: 8 },
  nbsBox:      { width: 52, alignItems: 'center', gap: 3 },
  nbsLabel:    { fontSize: 8, fontWeight: '800', color: C.yellow, letterSpacing: 1.2 },
  coaBox:      { width: 52, alignItems: 'center', gap: 3 },
  coaLabel:    { fontSize: 8, fontWeight: '700', color: 'rgba(255,255,255,0.5)', letterSpacing: 1 },
  topCenter:   { flex: 1, alignItems: 'center' },
  topGov:      { fontSize: 7, fontWeight: '800', color: C.yellow, letterSpacing: 1, textTransform: 'uppercase', textAlign: 'center' },
  topTitle:    { fontSize: 18, fontWeight: '900', color: C.white, letterSpacing: 2, marginTop: 3 },
  topDivider:  { height: 2, width: 40, backgroundColor: C.yellow, borderRadius: 1, marginVertical: 4 },
  topSub:      { fontSize: 9, color: 'rgba(255,255,255,0.7)', letterSpacing: 1, textTransform: 'uppercase' },
  tagline:     { fontSize: 9, fontStyle: 'italic', color: 'rgba(252,209,22,0.7)', textAlign: 'center', paddingVertical: 6 },

  card:        { backgroundColor: C.cardBg, borderRadius: 18, borderWidth: 1, borderColor: C.border, padding: 22 },
  cardIconWrap:{ width: 50, height: 50, borderRadius: 14, backgroundColor: `${C.tzGreen}18`,
                 borderWidth: 1, borderColor: `${C.tzGreen}50`, alignItems: 'center',
                 justifyContent: 'center', alignSelf: 'center', marginBottom: 12 },
  cardTitle:   { fontSize: 16, fontWeight: '800', color: C.text, textAlign: 'center', marginBottom: 4 },
  cardSub:     { fontSize: 11.5, color: C.textSub, textAlign: 'center', marginBottom: 14, lineHeight: 17 },

  lbl:         { fontSize: 10, color: C.textSub, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 7 },
  inpWrap:     { flexDirection: 'row', alignItems: 'center', backgroundColor: C.inputBg,
                 borderWidth: 1, borderColor: C.border, borderRadius: 10, marginBottom: 0 },
  inp:         { flex: 1, color: C.text, fontSize: 13, paddingHorizontal: 14, paddingVertical: 12 },
  inpRight:    { paddingRight: 12 },

  infoBox:     { borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 14 },
  infoTxt:     { fontSize: 11.5, lineHeight: 18 },

  btn:         { borderRadius: 12, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' },
  btnTxt:      { color: C.white, fontWeight: '800', fontSize: 14 },
  btnOff:      { opacity: 0.45 },
  linkBtn:     { alignItems: 'center', marginTop: 14 },
  linkTxt:     { fontSize: 11.5, color: `${C.tzBlue}cc` },

  errRow:      { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 10 },
  errTxt:      { fontSize: 10.5, color: C.red, flex: 1 },

  footer:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 20 },
  footerTxt:   { fontSize: 10, color: C.textDim },
  footerTxt2:  { fontSize: 9, color: C.border, textAlign: 'center', marginTop: 3 },
})
""")

# =============================================================================
# 6. Fix AbortSignal.timeout in all screen files (Hermes-safe IIFE replacement)
# =============================================================================
print('\n[6] Fix AbortSignal.timeout — HospitalHomeScreen')
patch('code/mobile/src/screens/hospital/HospitalHomeScreen.tsx', [
    (
        'signal:  AbortSignal.timeout(12_000),',
        'signal:  (()=>{const __c=new AbortController();setTimeout(()=>__c.abort(),12000);return __c.signal})(),'
    ),
])

print('\n[7] Fix AbortSignal.timeout — RegisterBirthScreen')
patch('code/mobile/src/screens/hospital/RegisterBirthScreen.tsx', [
    (
        "}, { headers:{ Authorization:`Bearer ${token}` }, signal: AbortSignal.timeout(5000) })",
        "}, { headers:{ Authorization:`Bearer ${token}` }, signal: (()=>{const __c=new AbortController();setTimeout(()=>__c.abort(),5000);return __c.signal})() })"
    ),
])

print('\n[8] Fix AbortSignal.timeout — RecordDeathScreen')
# RecordDeathScreen has multiple identical fetch patterns — patch all occurrences
_rds_rel = 'code/mobile/src/screens/hospital/RecordDeathScreen.tsx'
_rds_path = os.path.join(ROOT, _rds_rel)
try:
    with open(_rds_path, 'r', encoding='utf-8') as f:
        src = f.read()
    src = src.replace(
        'signal: AbortSignal.timeout(5000)',
        'signal: (()=>{const __c=new AbortController();setTimeout(()=>__c.abort(),5000);return __c.signal})()'
    )
    with open(_rds_path, 'w', encoding='utf-8') as f:
        f.write(src)
    ok.append(_rds_rel)
    print(f'  ✓ {_rds_rel}  (all occurrences patched)')
except FileNotFoundError:
    fail.append(_rds_rel)
    print(f'  ✗ {_rds_rel}  FILE NOT FOUND')

print('\n[9] Fix AbortSignal.timeout — VillageRecordDeathScreen')
_vrd_rel = 'code/mobile/src/screens/village/VillageRecordDeathScreen.tsx'
_vrd_path = os.path.join(ROOT, _vrd_rel)
try:
    with open(_vrd_path, 'r', encoding='utf-8') as f:
        src = f.read()
    src = src.replace(
        'signal: AbortSignal.timeout(5000)',
        'signal: (()=>{const __c=new AbortController();setTimeout(()=>__c.abort(),5000);return __c.signal})()'
    )
    with open(_vrd_path, 'w', encoding='utf-8') as f:
        f.write(src)
    ok.append(_vrd_rel)
    print(f'  ✓ {_vrd_rel}  (all occurrences patched)')
except FileNotFoundError:
    fail.append(_vrd_rel)
    print(f'  ✗ {_vrd_rel}  FILE NOT FOUND')

print('\n[10] Fix AbortSignal.timeout — RegisterMarriageScreen')
patch('code/mobile/src/screens/village/RegisterMarriageScreen.tsx', [
    (
        '{ headers:{ Authorization:`Bearer ${token}` }, signal: AbortSignal.timeout(5000) })',
        '{ headers:{ Authorization:`Bearer ${token}` }, signal: (()=>{const __c=new AbortController();setTimeout(()=>__c.abort(),5000);return __c.signal})() })'
    ),
])

print('\n[11] Fix AbortSignal.timeout — TrackMigrationScreen')
patch('code/mobile/src/screens/village/TrackMigrationScreen.tsx', [
    (
        '{ headers:{ Authorization:`Bearer ${token}` }, signal: AbortSignal.timeout(5000) })',
        '{ headers:{ Authorization:`Bearer ${token}` }, signal: (()=>{const __c=new AbortController();setTimeout(()=>__c.abort(),5000);return __c.signal})() })'
    ),
])

# =============================================================================
# 12. Backend — auth.js: add missing prisma import for change-password route
# =============================================================================
print('\n[12] Backend auth.js — add prisma import for change-password route')
patch('code/backend/src/routes/auth.js', [
    (
        "const { verifyRefresh }        = require('../lib/jwt')\n",
        "const { verifyRefresh }        = require('../lib/jwt')\nconst { prisma }               = require('../lib/prisma')\n"
    ),
])

# =============================================================================
# 13. Backend — dashboard.js: ensure activity and records endpoints exist
#     Add GET /api/officer/activity if missing
# =============================================================================
print('\n[13] Backend dashboard.js — ensure /officer/activity endpoint exists')
_dash_rel  = 'code/backend/src/routes/dashboard.js'
_dash_path = os.path.join(ROOT, _dash_rel)
try:
    with open(_dash_path, 'r', encoding='utf-8') as f:
        dash_src = f.read()

    if '/officer/activity' not in dash_src:
        # Append a basic activity endpoint before module.exports
        activity_route = """
// ── GET /api/officer/activity ─────────────────────────────────────────────────
// Returns recent birth/death events for the dashboard activity feed
router.get('/activity', async (req, res) => {
  const { id, role } = req.user
  const limit = Math.min(parseInt(req.query.limit ?? '10'), 50)
  try {
    const [births, deaths] = await Promise.all([
      prisma.birth.findMany({
        where: role === 'village_officer' ? {} : { officerId: id },
        orderBy: { registeredAt: 'desc' },
        take: limit,
        select: { id:true, birthCertNo:true, childFirstName:true, childSurname:true, registeredAt:true },
      }).catch(() => []),
      prisma.death.findMany({
        where: role === 'village_officer' ? {} : { hospitalOfficerId: id },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: { id:true, deathCertNo:true, causeOfDeath:true, createdAt:true },
      }).catch(() => []),
    ])

    const feed = [
      ...births.map(b => ({
        id: `b-${b.id}`, type: 'birth',
        label: `Birth — ${b.childFirstName} ${b.childSurname}`,
        sub: `Cert: ${b.birthCertNo}`,
        date: b.registeredAt ?? new Date(),
      })),
      ...deaths.map(d => ({
        id: `d-${d.id}`, type: 'death',
        label: `Death — ${d.causeOfDeath ?? 'Cause unknown'}`,
        sub: `Cert: ${d.deathCertNo}`,
        date: d.createdAt ?? new Date(),
      })),
    ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, limit)

    return res.json({ success: true, data: feed })
  } catch (err) {
    console.error('[activity]', err)
    return res.status(500).json({ success: false, message: 'Failed to fetch activity' })
  }
})
"""
        dash_src = dash_src.replace('module.exports = router', activity_route + '\nmodule.exports = router')

    # Also ensure /officer/profile exists in dashboard or village routes
    with open(_dash_path, 'w', encoding='utf-8') as f:
        f.write(dash_src)
    ok.append(_dash_rel)
    print(f'  ✓ {_dash_rel}')
except FileNotFoundError:
    fail.append(_dash_rel)
    print(f'  ✗ {_dash_rel}  FILE NOT FOUND')

# =============================================================================
# 14. Backend — village.js: add /officer/profile if not present
# =============================================================================
print('\n[14] Backend village.js — ensure /officer/profile exists')
_vil_rel  = 'code/backend/src/routes/village.js'
_vil_path = os.path.join(ROOT, _vil_rel)
try:
    with open(_vil_path, 'r', encoding='utf-8') as f:
        vil_src = f.read()

    if "router.get('/profile'" not in vil_src:
        profile_route = """
// ── GET /api/officer/profile ──────────────────────────────────────────────────
// Used by both hospital and village officer ID-card modal
router.get('/profile', async (req, res) => {
  const { id, role } = req.user
  try {
    let data = null
    if (role === 'hospital_officer') {
      const o = await prisma.hospitalOfficer.findUnique({
        where: { id },
        include: { facility: { include: { village: { include: { ward: { include: { district: { include: { region: true } } } } } } } } },
      })
      if (o) data = {
        officerName: o.fullName, employeeId: o.employeeId ?? '',
        facilityName: o.facility?.name ?? '—',
        facilityType: o.facility?.facilityType ?? '—',
        facilityGrade: o.facility?.grade ?? '—',
        facilityRegion: o.facility?.village?.ward?.district?.region?.name ?? '—',
        facilityDistrict: o.facility?.village?.ward?.district?.name ?? '—',
        facilityGpsLat: o.facility?.gpsLat ?? null,
        facilityGpsLng: o.facility?.gpsLng ?? null,
      }
    } else if (role === 'village_officer') {
      const o = await prisma.villageOfficer.findUnique({
        where: { id },
        include: { village: true, ward: true },
      })
      if (o) data = {
        officerName: o.fullName, employeeId: o.employeeId ?? '',
        villageName: o.village?.name ?? '—',
        wardName: o.ward?.name ?? '—',
      }
    }
    if (!data) return res.status(404).json({ success: false, message: 'Officer not found' })
    return res.json({ success: true, data })
  } catch (err) {
    console.error('[profile]', err)
    return res.status(500).json({ success: false, message: 'Failed to fetch profile' })
  }
})
"""
        vil_src = vil_src.replace('module.exports = router', profile_route + '\nmodule.exports = router')

    with open(_vil_path, 'w', encoding='utf-8') as f:
        f.write(vil_src)
    ok.append(_vil_rel)
    print(f'  ✓ {_vil_rel}')
except FileNotFoundError:
    fail.append(_vil_rel)
    print(f'  ✗ {_vil_rel}  FILE NOT FOUND')

# =============================================================================
# 15. Remove expo-sqlite from package.json (optional cleanup)
#     Keep the package installed but mark it unused in metadata
# =============================================================================
# We intentionally keep expo-sqlite in package.json — removing it risks breaking
# the Expo SDK peer dependency graph. The localDb.ts stub simply never imports it.

# =============================================================================
# Summary
# =============================================================================
print(f'\n{"="*60}')
print(f'  DONE — {len(ok)} files written/patched, {len(fail)} failed')
if fail:
    print('  FAILED:')
    for f in fail:
        print(f'    • {f}')
print(f'{"="*60}')
print("""
NEXT STEPS
──────────
Mobile (code/mobile/):
  git add -A && git commit -m "chore: remove offline capability, disable geofencing"
  git push origin main
  # Then reload in Expo Go / rebuild EAS

Backend (code/backend/):
  git add code/backend && git commit -m "fix: add prisma import in auth.js, add activity+profile routes"
  git push origin main
  # Render auto-deploys on push

Verify backend is healthy:
  curl https://adlcs-backend.onrender.com/api/health

Test login:
  1. Open Expo Go → scan QR
  2. App opens Splash → Login immediately (no OTP/GPS prompts)
  3. Sign in with seeded credentials
  4. Dashboard loads from Supabase via backend ✓
""")
