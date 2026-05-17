/**
 * ThemeContext.tsx — ADLCS Global Theme Provider
 *
 * Provides isDark/theme/toggleTheme to every screen and modal.
 * Wrap the NavigationContainer with <ThemeProvider> in App.js.
 *
 * Usage in any screen:
 *   const { theme: T, isDark, toggleTheme } = useTheme()
 */

import React, { createContext, useContext, useState, ReactNode } from 'react'
import { StatusBar } from 'expo-status-bar'

// ─── Design Tokens (shared) ───────────────────────────────────────────────────
export const TZ = {
  green:  '#1eb53a',
  blue:   '#00a3dd',
  navy:   '#003087',
  yellow: '#fcd116',
  black:  '#000000',
}

export interface Theme {
  bg:        string
  card:      string
  card2:     string
  text:      string
  textSub:   string
  textDim:   string
  border:    string
  primary:   string
  primaryL:  string
  accent:    string
  danger:    string
  success:   string
  barStyle:  'light' | 'dark'
  isDark:    boolean
}

export const DARK: Theme = {
  bg:       '#050d1a',
  card:     '#0d1f38',
  card2:    '#091628',
  text:     '#f8fafc',
  textSub:  '#94a3b8',
  textDim:  '#4b6080',
  border:   '#1e3a5f',
  primary:  '#0891b2',
  primaryL: '#22d3ee',
  accent:   '#fcd116',
  danger:   '#f87171',
  success:  '#4ade80',
  barStyle: 'light',
  isDark:   true,
}

export const LIGHT: Theme = {
  bg:       '#f0f4f8',
  card:     '#ffffff',
  card2:    '#f8fafc',
  text:     '#0f1923',
  textSub:  '#4b5563',
  textDim:  '#9ca3af',
  border:   '#e1e8f0',
  primary:  '#0891b2',
  primaryL: '#0369a1',
  accent:   '#c8962e',
  danger:   '#dc2626',
  success:  '#16a34a',
  barStyle: 'dark',
  isDark:   false,
}

// ─── Context Definition ───────────────────────────────────────────────────────
interface ThemeContextValue {
  isDark:      boolean
  theme:       Theme
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue>({
  isDark:      true,
  theme:       DARK,
  toggleTheme: () => {},
})

// ─── Provider ─────────────────────────────────────────────────────────────────
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isDark, setIsDark] = useState(true)
  const theme = isDark ? DARK : LIGHT

  return (
    <ThemeContext.Provider value={{ isDark, theme, toggleTheme: () => setIsDark(d => !d) }}>
      <StatusBar style={theme.barStyle} />
      {children}
    </ThemeContext.Provider>
  )
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export const useTheme = () => useContext(ThemeContext)