/**
 * auth.api.js — ADLCS Auth API Client
 *
 * Wraps all /api/auth/* endpoints with a shared axios instance.
 * The request interceptor injects the Bearer access token automatically.
 * The response interceptor handles 401s by attempting a silent refresh —
 * if the refresh also fails it clears the session and reloads to /login.
 */

import axios from 'axios'
import { useAuthStore } from '../store/authStore'
import { resolveBase } from './apiResolver'

// BASE starts as the env-configured URL; resolveBase() may switch it to local
// BUGFIX-2: no hardcoded fallback — VITE_API_BASE_URL must be set in web/.env
const INITIAL_BASE = import.meta.env.VITE_API_BASE_URL
// BUGFIX-2 guard: fail loudly at startup instead of silently calling
// "undefined/auth/..." if the developer forgot to set the .env variable.
if (!INITIAL_BASE) {
  console.error(
    '❌ VITE_API_BASE_URL is not set. Create web/.env (see web/.env.example) ' +
    'and set VITE_API_BASE_URL=https://your-backend-url/api'
  )
}
let _baseReady = false

// Shared axios instance for all authenticated requests
export const apiClient = axios.create({ baseURL: INITIAL_BASE })

// ── Request interceptor — resolve base URL + attach access token ───────────────
apiClient.interceptors.request.use(async (config) => {
  // Resolve live backend on first call (cached 60 s by apiResolver)
  if (!_baseReady) {
    try {
      const base = await resolveBase()
      apiClient.defaults.baseURL = base
      config.baseURL = base
      _baseReady = true
    } catch {
      return Promise.reject(new Error('No internet connection'))
    }
  }
  const { accessToken } = useAuthStore.getState()
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`
  }
  return config
})

// ── Response interceptor — silent token refresh on 401 ────────────────────────
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config

    // Attempt a silent refresh once per request (flag prevents infinite loops)
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true
      try {
        const { getRefreshToken, updateAccessToken, clearAuth } = useAuthStore.getState()
        const refreshToken = getRefreshToken()

        if (!refreshToken) {
          clearAuth()
          window.location.href = '/login'
          return Promise.reject(error)
        }

        // Use a plain axios call (not apiClient) to avoid the interceptor loop
        // BUGFIX-2: no hardcoded fallback — relies solely on .env / resolved base
        const base = apiClient.defaults.baseURL || import.meta.env.VITE_API_BASE_URL
        const { data } = await axios.post(`${base}/auth/refresh`, { refreshToken })
        updateAccessToken(data.accessToken)

        // Retry the original failed request with the new token
        original.headers.Authorization = `Bearer ${data.accessToken}`
        return apiClient(original)
      } catch {
        // Refresh also failed — force logout
        useAuthStore.getState().clearAuth()
        window.location.href = '/login'
        return Promise.reject(error)
      }
    }

    return Promise.reject(error)
  }
)

// ── Auth endpoint functions ───────────────────────────────────────────────────

/** Step 1: email + password. Returns { mfaRequired, accessToken?, refreshToken?, profile?, tempToken? } */
export async function apiLogin(email, password) {
  const { data } = await apiClient.post('/auth/login', { email, password })
  return data
}

/** Step 2 (MFA only): TOTP code + tempToken. Returns { accessToken, refreshToken, profile } */
export async function apiMfaVerify(tempToken, code) {
  const { data } = await apiClient.post('/auth/mfa/verify', { tempToken, code })
  return data
}

/** Exchange a refresh token for a new access token */
export async function apiRefresh(refreshToken) {
  const { data } = await apiClient.post('/auth/refresh', { refreshToken })
  return data
}

/** Invalidate the current session */
export async function apiLogout() {
  const { data } = await apiClient.post('/auth/logout')
  return data
}

/** Fetch the current user's profile */
export async function apiMe() {
  const { data } = await apiClient.get('/auth/me')
  return data
}
