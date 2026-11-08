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

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from 'react'
import { StatusBar } from 'expo-status-bar'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { subscribeSession, notifySessionChanged } from '../services/session'

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
  warning: string
  brand: string
  blue: string
  barStyle: 'light' | 'dark'
  isDark: boolean
}

export const DARK: Theme = {
  bg: '#050d1a',
  card: '#0d1f38',
  card2: '#091628',
  text: '#f8fafc',
  textSub: '#94a3b8',
  // HI-CONTRAST-2026: textDim was #4b6080 (2.6:1 on card) — now 6.5:1.
  // border lifted so inputs/cards are visible (≈3:1 non-text contrast).
  textDim: '#8ea4c0',
  border: '#3d6ca3',
  primary: '#0891b2',
  primaryL: '#22d3ee',
  accent: '#fcd116',
  danger: '#f87171',
  success: '#4ade80',
  warning: '#fb923c',
  brand: '#22c55e',
  blue: '#38bdf8',
  barStyle: 'light',
  isDark: true,
}

export const LIGHT: Theme = {
  bg: '#f0f4f8',
  card: '#ffffff',
  card2: '#f8fafc',
  text: '#0f1923',
  textSub: '#475569',
  // HI-CONTRAST-2026: light-mode text/accent colours that were below 4.5:1 on
  // white (textDim 2.5, accent 2.7, primary 3.7, success 3.3) are darkened.
  textDim: '#5b6676',
  border: '#a3b1c2',
  primary: '#0e7490',
  primaryL: '#0369a1',
  accent: '#8a5a00',
  danger: '#b91c1c',
  success: '#15803d',
  warning: '#c2410c',
  brand: '#15803d',
  blue: '#0369a1',
  barStyle: 'dark',
  isDark: false,
}

/**
 * Theme-aware colour for the connection-quality indicator (Good/Fair/Offline).
 * The old fixed #fbbf24 "Fair" yellow was ~1.7:1 on a white card (invisible).
 */
export function connColor(q: 'Good' | 'Fair' | 'Offline', dark: boolean): string {
  if (q === 'Good') return dark ? '#4ade80' : '#15803d'
  if (q === 'Fair') return dark ? '#fbbf24' : '#b45309'
  return dark ? '#f87171' : '#b91c1c'
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

// Session changes (login / sign-out) come from services/session.ts. The theme
// is keyed by the signed-in officer, so it can never leak to the Login screen
// or to whoever signs in next on the same device.
//
// Kept for backward compatibility — both simply announce a session change.
export function refreshThemeForCurrentSession(): void {
  notifySessionChanged('start')
}
export function resetThemeToDefault(): void {
  notifySessionChanged('end')
}

// ─── Provider ─────────────────────────────────────────────────────────────────
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isDark, setIsDark] = useState(DEFAULT_IS_DARK)
  const isDarkRef = useRef(DEFAULT_IS_DARK)
  const employeeIdRef = useRef<string | null>(null)
  const reloadSeq = useRef(0)

  // Re-read the current officer's saved preference. A newer request always
  // wins, so a slow read for a previous user can never overwrite the theme.
  const reload = useCallback(async () => {
    const seq = ++reloadSeq.current
    const employeeId = await getCurrentEmployeeId()
    const dark = employeeId ? await loadThemeForEmployee(employeeId) : DEFAULT_IS_DARK
    if (seq !== reloadSeq.current) return
    employeeIdRef.current = employeeId
    isDarkRef.current = dark
    setIsDark(dark)
  }, [])

  useEffect(() => {
    reload()
    return subscribeSession((event) => {
      if (event === 'end') {
        // Immediately detach from the officer who just signed out so that
        // nothing toggled from here on is saved against their id.
        reloadSeq.current++
        employeeIdRef.current = null
        isDarkRef.current = DEFAULT_IS_DARK
        setIsDark(DEFAULT_IS_DARK)
        return
      }
      reload()
    })
  }, [reload])

  const toggleTheme = useCallback(() => {
    const next = !isDarkRef.current
    isDarkRef.current = next
    setIsDark(next)
    // Persist ONLY for the officer who is signed in. With nobody signed in
    // (Splash / Login) it just changes the in-memory value.
    const id = employeeIdRef.current
    if (id) saveThemeForEmployee(id, next)
  }, [])

  const theme = isDark ? DARK : LIGHT
  const value = useMemo(() => ({ isDark, theme, toggleTheme }), [isDark, theme, toggleTheme])

  return (
    <ThemeContext.Provider value={value}>
      <StatusBar style={theme.barStyle} />
      {children}
    </ThemeContext.Provider>
  )
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export const useTheme = () => useContext(ThemeContext)
