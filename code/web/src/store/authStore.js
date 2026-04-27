/**
 * authStore.js — ADLCS Global Auth State (Zustand)
 *
 * Holds the authenticated user's session in memory.
 * The access token lives only in this store (never written to localStorage).
 * The refresh token IS persisted in localStorage so the session survives
 * a page reload — on startup the app tries to exchange it for a fresh
 * access token via POST /api/auth/refresh.
 */

import { create } from 'zustand'

// Key used in localStorage for the refresh token
const REFRESH_KEY = 'adlcs_rt'

export const useAuthStore = create((set, get) => ({
  // ── State ───────────────────────────────────────────────────────────────────
  user:            null,   // safe profile from server (no passwordHash/mfaSecret)
  role:            null,   // 'super_admin' | 'district_admin' | 'village_officer' | 'hospital_officer' | 'public_user'
  accessToken:     null,   // Bearer token — kept in memory only
  isAuthenticated: false,

  // ── Actions ─────────────────────────────────────────────────────────────────

  /**
   * setAuth — called after a successful login or refresh.
   * Persists the refresh token to localStorage; access token stays in memory.
   */
  setAuth: ({ user, role, accessToken, refreshToken }) => {
    if (refreshToken) {
      localStorage.setItem(REFRESH_KEY, refreshToken)
    }
    set({ user, role, accessToken, isAuthenticated: true })
  },

  /**
   * updateAccessToken — called after a silent token refresh.
   * Only the access token changes; user/role are unchanged.
   */
  updateAccessToken: (accessToken) => {
    set({ accessToken })
  },

  /**
   * clearAuth — logout or session expiry.
   * Removes the refresh token from localStorage and wipes all state.
   */
  clearAuth: () => {
    localStorage.removeItem(REFRESH_KEY)
    set({ user: null, role: null, accessToken: null, isAuthenticated: false })
  },

  /** getRefreshToken — read the persisted refresh token (may be null) */
  getRefreshToken: () => localStorage.getItem(REFRESH_KEY),
}))
