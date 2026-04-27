/**
 * ProtectedRoute.jsx — ADLCS Route Guard
 *
 * Wraps any route that requires authentication.
 * Optionally restricts access to specific roles.
 *
 * Usage:
 *   <ProtectedRoute>                        — any authenticated user
 *   <ProtectedRoute roles={['super_admin']} — super_admin only
 */

import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

// Role → home route mapping (used for wrong-role redirect)
const ROLE_HOME = {
  super_admin:      '/super-admin',
  district_admin:   '/district-admin',
  village_officer:  '/village-officer',
  hospital_officer: '/hospital-officer',
  public_user:      '/public',
}

export default function ProtectedRoute({ children, roles }) {
  const { isAuthenticated, role } = useAuthStore()

  // Not logged in — send to login
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  // Logged in but wrong role — send to their own home
  if (roles && !roles.includes(role)) {
    return <Navigate to={ROLE_HOME[role] || '/login'} replace />
  }

  return children
}
