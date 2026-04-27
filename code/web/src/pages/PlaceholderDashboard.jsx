/**
 * PlaceholderDashboard.jsx — Temporary role dashboard
 *
 * Shown after login while the real dashboard is being built.
 * Displays the logged-in user's name and role, and provides a logout button.
 * Each role will be replaced with its full dashboard in subsequent sprints.
 */

import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { apiLogout } from '../api/auth.api'

// Human-readable label for each role
const ROLE_LABELS = {
  super_admin:      'Super Administrator',
  district_admin:   'District Administrator',
  village_officer:  'Village Officer',
  hospital_officer: 'Hospital Officer',
  public_user:      'Public User',
}

export default function PlaceholderDashboard() {
  const navigate           = useNavigate()
  const { user, role, clearAuth } = useAuthStore()

  async function handleLogout() {
    try {
      await apiLogout()
    } catch {
      // Even if the API call fails, clear local session
    } finally {
      clearAuth()
      navigate('/login', { replace: true })
    }
  }

  return (
    <div className="min-h-screen bg-[#050d1a] flex items-center justify-center p-4">
      <div className="text-center max-w-md">

        {/* Success badge */}
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full
                        bg-[#00d4ff]/10 border-2 border-[#00d4ff]/30 mb-6">
          <span className="text-3xl">✓</span>
        </div>

        <h1 className="text-2xl font-bold text-white mb-2">
          {ROLE_LABELS[role] || 'Dashboard'}
        </h1>

        <p className="text-[#00d4ff] font-medium mb-1">
          {user?.fullName || user?.displayName || user?.email}
        </p>

        <p className="text-gray-500 text-sm mb-2">
          {user?.email}
        </p>

        {user?.employeeId && (
          <p className="text-gray-600 text-xs mb-8">
            Employee ID: {user.employeeId}
          </p>
        )}

        <div className="bg-[#0a1628] border border-[#1a3060] rounded-xl p-6 mb-6 text-left">
          <p className="text-[#00d4ff] font-semibold text-sm mb-1">
            🚧 Sprint in Progress
          </p>
          <p className="text-gray-400 text-sm">
            The <strong className="text-white">{ROLE_LABELS[role]}</strong> dashboard is
            being built in the next sprint. Authentication is fully working — this
            placeholder confirms your login was successful.
          </p>
        </div>

        <button
          onClick={handleLogout}
          className="bg-[#1a3060] hover:bg-red-900/40 border border-[#1a3060]
                     hover:border-red-500/40 text-gray-300 hover:text-red-300
                     font-medium rounded-lg px-6 py-2.5 text-sm transition-all"
        >
          Logout
        </button>
      </div>
    </div>
  )
}
