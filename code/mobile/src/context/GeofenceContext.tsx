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
