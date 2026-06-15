/**
 * App.jsx — ADLCS Web Router
 *
 * Web portal serves ADMIN roles only:
 *   /super-admin    → ProtectedRoute [super_admin]    → AdminDashboard (role="super_admin")
 *   /district-admin → ProtectedRoute [district_admin] → AdminDashboard (role="district_admin")
 *   /mobile-only    → MobileOnlyPage (shown when village/hospital officer
 *                     accidentally logs in via web — tells them to use the app)
 *   /login          → LoginPage (public)
 *   /               → redirect to /login
 *
 * Village officers and hospital officers are served by the React Native
 * mobile app (code/mobile). Their routes are intentionally absent here.
 */

import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'

import { useAuthStore }      from './store/authStore'
import { apiRefresh, apiMe } from './api/auth.api'

import ProtectedRoute       from './components/ProtectedRoute'
import LoginPage            from './pages/LoginPage'
import AdminDashboard       from './pages/AdminDashboard'
import MobileOnlyPage       from './pages/MobileOnlyPage'

// ── Silent token refresh on startup ──────────────────────────────────────────
function SilentRefresh() {
  const { getRefreshToken, setAuth, clearAuth } = useAuthStore()

  useEffect(() => {
    async function restore() {
      const refreshToken = getRefreshToken()
      if (!refreshToken) return
      try {
        const refreshResult = await apiRefresh(refreshToken)
        useAuthStore.setState({ accessToken: refreshResult.accessToken })
        const meResult = await apiMe()
        setAuth({
          user:         meResult.data,
          role:         meResult.data.role,
          accessToken:  refreshResult.accessToken,
          refreshToken: null,
        })
      } catch {
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
      <SilentRefresh />

      <Routes>
        {/* ── Public ───────────────────────────────────────────────────── */}
        <Route path="/login" element={<LoginPage />} />

        {/* ── Admin web routes ──────────────────────────────────────────── */}
        <Route
          path="/super-admin"
          element={
            <ProtectedRoute roles={['super_admin']}>
              <AdminDashboard role="super_admin" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/district-admin"
          element={
            <ProtectedRoute roles={['district_admin']}>
              <AdminDashboard role="district_admin" />
            </ProtectedRoute>
          }
        />

        {/* ── Mobile-only notice (village / hospital officers on web) ────── */}
        <Route path="/mobile-only" element={<MobileOnlyPage />} />

        {/* ── Fallback ─────────────────────────────────────────────────── */}
        <Route path="/"  element={<Navigate to="/login" replace />} />
        <Route path="*"  element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
