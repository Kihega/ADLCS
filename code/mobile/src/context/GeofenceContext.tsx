/**
 * GeofenceContext.tsx — ADLCS Geofence Monitor
 *
 * Continuously tracks the officer's GPS position against their assigned
 * facility/village GPS coordinates. Enforces the 0.5 km boundary rule for
 * hospital officers and 1 km for village officers.
 *
 * Rules:
 *   • In zone  → green status indicator, normal operation
 *   • Out of zone → red status + warning icon shown on all screens
 *   • Out of zone ≥ 3 hours → tokens cleared, navigate to Login with
 *     Alert popup reminding officer to return to their assigned boundary
 *
 * Dev note: In __DEV__ mode the timeout is shortened to 5 minutes so
 * the 3-hour flow can be tested without waiting.
 */

import React, {
  createContext, useContext, useEffect, useRef,
  useState, useCallback, ReactNode,
} from 'react'
import * as Location from 'expo-location'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Alert } from 'react-native'
import { reset } from '../navigation/navigationService'

// ─── Haversine Distance ───────────────────────────────────────────────────────
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R    = 6371
  const dLat = (lat2 - lat1) * (Math.PI / 180)
  const dLng = (lng2 - lng1) * (Math.PI / 180)
  const a    =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) *
    Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ─── Constants ────────────────────────────────────────────────────────────────
const POLL_INTERVAL_MS    = 30_000                          // 30 seconds
const BOUNDARY_TIMEOUT_MS = __DEV__ ? 5 * 60_000 : 3 * 60 * 60_000  // 5 min dev / 3 hr prod

const GEOFENCE_RADIUS_KM: Record<string, number> = {
  village_officer:  1.0,
  hospital_officer: 0.5,
}

const STORAGE_KEYS = [
  'adlcs_access_token',
  'adlcs_refresh_token',
  'adlcs_role',
  'adlcs_device_activated',
  'adlcs_officer_name',
  'adlcs_facility',
  'adlcs_out_since',
]

// ─── Context Shape ────────────────────────────────────────────────────────────
export interface FacilityGps { lat: number; lng: number }

interface GeofenceContextValue {
  inZone:         boolean
  distanceKm:     number | null
  outSince:       Date | null
  facilityGps:    FacilityGps | null
  role:           string | null
  setGeofenceConfig: (config: { gps: FacilityGps; role: string }) => void
  clearGeofence:  () => void
}

const GeofenceContext = createContext<GeofenceContextValue>({
  inZone:            true,
  distanceKm:        null,
  outSince:          null,
  facilityGps:       null,
  role:              null,
  setGeofenceConfig: () => {},
  clearGeofence:     () => {},
})

// ─── Provider ─────────────────────────────────────────────────────────────────
export function GeofenceProvider({ children }: { children: ReactNode }) {
  const [facilityGps, setFacilityGps] = useState<FacilityGps | null>(null)
  const [role,        setRole]        = useState<string | null>(null)
  const [inZone,      setInZone]      = useState(true)
  const [distanceKm,  setDistanceKm]  = useState<number | null>(null)
  const [outSince,    setOutSince]    = useState<Date | null>(null)

  const outSinceRef    = useRef<Date | null>(null)
  const intervalRef    = useRef<ReturnType<typeof setInterval> | null>(null)
  const loggedOutRef   = useRef(false)

  // ── Force logout after boundary timeout ─────────────────────────────────
  const forceLogout = useCallback(async () => {
    if (loggedOutRef.current) return
    loggedOutRef.current = true

    await AsyncStorage.multiRemove(STORAGE_KEYS)
    outSinceRef.current = null
    setOutSince(null)
    setInZone(true)

    Alert.alert(
      '⚠️ Boundary Timeout',
      'You have been outside your assigned operational boundary for too long.\n\n' +
      'Please return to your designated facility/village area and log in again to continue registration.',
      [{ text: 'OK', onPress: () => reset('Login') }],
      { cancelable: false },
    )
  }, [])

  // ── Poll location ────────────────────────────────────────────────────────
  const checkLocation = useCallback(async () => {
    if (!facilityGps || !role) return

    try {
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      })
      const dist = haversineKm(
        loc.coords.latitude, loc.coords.longitude,
        facilityGps.lat, facilityGps.lng,
      )
      setDistanceKm(dist)

      const radius = GEOFENCE_RADIUS_KM[role] ?? 0.5
      const inside = dist <= radius
      setInZone(inside)

      if (!inside) {
        if (!outSinceRef.current) {
          const now = new Date()
          outSinceRef.current = now
          setOutSince(now)
          await AsyncStorage.setItem('adlcs_out_since', now.toISOString())
        } else {
          const elapsed = Date.now() - outSinceRef.current.getTime()
          if (elapsed >= BOUNDARY_TIMEOUT_MS) {
            await forceLogout()
          }
        }
      } else {
        // Back inside — reset timer
        outSinceRef.current = null
        setOutSince(null)
        await AsyncStorage.removeItem('adlcs_out_since')
      }
    } catch {
      // Location unavailable — don't penalise officer (GPS signal issues)
    }
  }, [facilityGps, role, forceLogout])

  // ── Start / stop polling ─────────────────────────────────────────────────
  useEffect(() => {
    if (!facilityGps || !role) return

    // Request permission
    Location.requestForegroundPermissionsAsync().then(({ status }) => {
      if (status !== 'granted') return

      // Restore any pre-existing out-since timestamp (e.g. after app crash)
      AsyncStorage.getItem('adlcs_out_since').then(saved => {
        if (saved) {
          const d = new Date(saved)
          outSinceRef.current = d
          setOutSince(d)
        }
      })

      checkLocation() // immediate first check
      intervalRef.current = setInterval(checkLocation, POLL_INTERVAL_MS)
    })

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [facilityGps, role, checkLocation])

  // ─── Public API ────────────────────────────────────────────────────────────
  const setGeofenceConfig = useCallback(
    ({ gps, role: r }: { gps: FacilityGps; role: string }) => {
      loggedOutRef.current = false
      setFacilityGps(gps)
      setRole(r)
    },
    [],
  )

  const clearGeofence = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    setFacilityGps(null)
    setRole(null)
    setInZone(true)
    setDistanceKm(null)
    outSinceRef.current = null
    setOutSince(null)
    loggedOutRef.current = false
  }, [])

  return (
    <GeofenceContext.Provider value={{
      inZone, distanceKm, outSince,
      facilityGps, role,
      setGeofenceConfig, clearGeofence,
    }}>
      {children}
    </GeofenceContext.Provider>
  )
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export const useGeofence = () => useContext(GeofenceContext)
