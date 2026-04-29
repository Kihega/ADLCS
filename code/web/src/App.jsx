/**
 * App.jsx — ADLCS Web Router
 *
 * Route map:
 *   /login            → LoginPage (public)
 *   /super-admin      → ProtectedRoute [super_admin]      → Dashboard
 *   /district-admin   → ProtectedRoute [district_admin]   → Dashboard
 *   /village-officer  → ProtectedRoute [village_officer]  → Dashboard
 *   /hospital-officer → ProtectedRoute [hospital_officer] → Dashboard
 *   /public           → ProtectedRoute [public_user]      → Dashboard
 *   /                 → redirect to /login
 *
 * On app startup, we attempt a silent token refresh so users who previously
 * logged in are restored without having to re-enter their credentials.
 */

import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'

import { useAuthStore }       from './store/authStore'
import { apiRefresh, apiMe }  from './api/auth.api'

import ProtectedRoute         from './components/ProtectedRoute'
import LoginPage              from './pages/LoginPage'
import PlaceholderDashboard     from './pages/PlaceholderDashboard'
#import DistrictAdminDashboard  from './pages/DistrictAdminDashboard'

/**
 * SilentRefresh — runs once on app mount.
 * If a refresh token exists in localStorage, exchange it for an access token
 * and reload the user's profile. This keeps the session alive across page reloads.
 */
function SilentRefresh() {
  const { getRefreshToken, setAuth, clearAuth } = useAuthStore()

  useEffect(() => {
    async function restore() {
      const refreshToken = getRefreshToken()
      if (!refreshToken) return // no previous session

      try {
        const refreshResult = await apiRefresh(refreshToken)
        // Access token obtained — now fetch the profile to get role + user data
        // We temporarily set the token so apiMe's interceptor can use it
        useAuthStore.setState({ accessToken: refreshResult.accessToken })
        const meResult = await apiMe()
        setAuth({
          user:         meResult.data,
          role:         meResult.data.role,
          accessToken:  refreshResult.accessToken,
          refreshToken: null, // don't rotate — keep the same one in localStorage
        })
      } catch {
        // Refresh token expired or invalid — start fresh
        clearAuth()
      }
    }

    restore()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}

export default function App() {
  return (
    <BrowserRouter>
      {/* Attempt session restoration on every cold load */}
      <SilentRefresh />

      <Routes>
        {/* Public */}
        <Route path="/login" element={<LoginPage />} />

        {/* Protected — each role gets its own path */}
        <Route
          path="/super-admin"
          element={
            <ProtectedRoute roles={['super_admin']}>
              <PlaceholderDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/district-admin"
          element={
            <ProtectedRoute roles={['district_admin']}>
              <DistrictAdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/village-officer"
          element={
            <ProtectedRoute roles={['village_officer']}>
              <PlaceholderDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/hospital-officer"
          element={
            <ProtectedRoute roles={['hospital_officer']}>
              <PlaceholderDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/public"
          element={
            <ProtectedRoute roles={['public_user']}>
              <PlaceholderDashboard />
            </ProtectedRoute>
          }
        />

        {/* Fallback */}
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
