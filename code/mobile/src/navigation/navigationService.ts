/**
 * navigationService.ts — ADLCS Navigation Reference Singleton
 *
 * Provides a ref-based navigation helper so contexts (ThemeContext,
 * GeofenceContext) can trigger navigation without prop-drilling or
 * circular imports.
 *
 * Usage:
 *   App.js  →  <NavigationContainer ref={navigationRef}>
 *   GeofenceContext  →  navigate('Login')   (force-logout on boundary timeout)
 */

import { createNavigationContainerRef } from '@react-navigation/native'

export type RootStack = {
  Splash:              undefined
  Login:               undefined
  VillageHome:         undefined
  HospitalHome:        undefined
  RegisterBirth:       undefined
  RecordDeath:         undefined
  IssueCertificate:    undefined
  ViewRecords:         undefined
  PendingCases:        undefined
  SyncData:            undefined
}

export const navigationRef = createNavigationContainerRef<RootStack>()

export function navigate(name: keyof RootStack, params?: object) {
  if (navigationRef.isReady()) {
    navigationRef.navigate(name as any, params as any)
  }
}

export function reset(name: keyof RootStack) {
  if (navigationRef.isReady()) {
    navigationRef.reset({ index: 0, routes: [{ name }] })
  }
}