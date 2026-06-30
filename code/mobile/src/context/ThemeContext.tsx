/**
 * ThemeContext.tsx — TzCRVS Per-Session Theme Provider
 *
 * Provides isDark/theme/toggleTheme to every screen and modal.
 * Wrap the NavigationContainer with <ThemeProvider> in App.js.
 *
 * SESSION SCOPING:
 *   Theme preference is persisted per logged-in officer (keyed by their
 *   tzcrvs_employee_id, written to AsyncStorage at login). This means:
 *     • Toggling dark/light mode only affects the screens of whoever is
 *       currently signed in — it does not leak into the Login/Splash
 *       screens, and it does not carry over to a different officer who
 *       signs in afterwards on the same device.
 *     • Each officer's own choice is remembered for THEM specifically,
 *       and restored automatically the next time they log in.
 *
 * Usage in any screen:
 *   const { theme: T, isDark, toggleTheme } = useTheme()
 *
 * Call refreshThemeForCurrentSession() right after a successful login
 * (once tzcrvs_employee_id has just been written) so the very next screen
 * reflects that officer's saved preference immediately.
 *
 * Call resetThemeToDefault() on sign-out so the next person to use the
 * device sees the fixed default rather than the previous officer's choice.
 */

import React, { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react'
import { StatusBar } from 'expo-status-bar'
import AsyncStorage from '@react-native-async-storage/async-storage'

// ─── Design Tokens (shared) ───────────────────────────────────────────────────
export const TZ = {
  green: '#1eb53a',
  blue: '#00a3dd',
  navy: '#003087',
  yellow: '#fcd116',
  black: '#000000',
}

export interface Theme {
  bg: string
  card: string
  card2: string
  text: string
  textSub: string
  textDim: string
  border: string
  primary: string
  primaryL: string
  accent: string
  danger: string
  success: string
  barStyle: 'light' | 'dark'
  isDark: boolean
}

export const DARK: Theme = {
  bg: '#050d1a',
  card: '#0d1f38',
  card2: '#091628',
  text: '#f8fafc',
  textSub: '#94a3b8',
  textDim: '#4b6080',
  border: '#1e3a5f',
  primary: '#0891b2',
  primaryL: '#22d3ee',
  accent: '#fcd116',
  danger: '#f87171',
  success: '#4ade80',
  barStyle: 'light',
  isDark: true,
}

export const LIGHT: Theme = {
  bg: '#f0f4f8',
  card: '#ffffff',
  card2: '#f8fafc',
  text: '#0f1923',
  textSub: '#4b5563',
  textDim: '#9ca3af',
  border: '#e1e8f0',
  primary: '#0891b2',
  primaryL: '#0369a1',
  accent: '#c8962e',
  danger: '#dc2626',
  success: '#16a34a',
  barStyle: 'dark',
  isDark: false,
}

// Fixed default used whenever there is no logged-in officer yet
// (Splash, Login) — never affected by any officer's saved preference.
const DEFAULT_IS_DARK = true

// ─── Per-officer persistence helpers ──────────────────────────────────────────
function themeKeyFor(employeeId: string): string {
  return `tzcrvs_theme_pref_${employeeId}`
}

async function getCurrentEmployeeId(): Promise<string | null> {
  try {
    const id = await AsyncStorage.getItem('tzcrvs_employee_id')
    return id && id.length > 0 ? id : null
  } catch {
    return null
  }
}

async function loadThemeForEmployee(employeeId: string): Promise<boolean> {
  try {
    const stored = await AsyncStorage.getItem(themeKeyFor(employeeId))
    if (stored === 'light') return false
    if (stored === 'dark') return true
    return DEFAULT_IS_DARK
  } catch {
    return DEFAULT_IS_DARK
  }
}

async function saveThemeForEmployee(employeeId: string, isDark: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(themeKeyFor(employeeId), isDark ? 'dark' : 'light')
  } catch {
    // Non-fatal — theme just won't persist across app restarts this time.
  }
}

// ─── Context Definition ───────────────────────────────────────────────────────
interface ThemeContextValue {
  isDark: boolean
  theme: Theme
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue>({
  isDark: DEFAULT_IS_DARK,
  theme: DEFAULT_IS_DARK ? DARK : LIGHT,
  toggleTheme: () => {},
})

// Module-level refresh signal so screens outside the React tree (e.g. the
// login handler, before navigation has settled) can request that the
// provider re-read the current officer's saved preference.
type RefreshListener = () => void
const refreshListeners = new Set<RefreshListener>()

/**
 * Call this immediately after writing tzcrvs_employee_id at login so the
 * home screen the officer lands on reflects THEIR saved theme right away,
 * instead of momentarily showing the previous session's value.
 */
export function refreshThemeForCurrentSession(): void {
  refreshListeners.forEach((fn) => fn())
}

/**
 * Call this on sign-out (after clearing tzcrvs_* keys) so the next person
 * to use this device sees the fixed default at the Login screen, not
 * whatever the previous officer had chosen.
 */
export function resetThemeToDefault(): void {
  refreshListeners.forEach((fn) => fn())
}

// ─── Provider ─────────────────────────────────────────────────────────────────
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isDark, setIsDark] = useState(DEFAULT_IS_DARK)
  const employeeIdRef = useRef<string | null>(null)

  const reload = async () => {
    const employeeId = await getCurrentEmployeeId()
    employeeIdRef.current = employeeId
    if (employeeId) {
      setIsDark(await loadThemeForEmployee(employeeId))
    } else {
      // No one is logged in (Splash / Login / just signed out) — always
      // the fixed default, regardless of any officer's saved choice.
      setIsDark(DEFAULT_IS_DARK)
    }
  }

  useEffect(() => {
    reload()
    refreshListeners.add(reload)
    return () => {
      refreshListeners.delete(reload)
    }
  }, [])

  const toggleTheme = () => {
    setIsDark((prev) => {
      const next = !prev
      // Persist against whichever officer is currently logged in. If no
      // one is logged in, this only changes the in-memory value for the
      // current screen session and is never written to a per-officer key.
      if (employeeIdRef.current) {
        saveThemeForEmployee(employeeIdRef.current, next)
      }
      return next
    })
  }

  const theme = isDark ? DARK : LIGHT

  return (
    <ThemeContext.Provider value={{ isDark, theme, toggleTheme }}>
      <StatusBar style={theme.barStyle} />
      {children}
    </ThemeContext.Provider>
  )
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export const useTheme = () => useContext(ThemeContext)
