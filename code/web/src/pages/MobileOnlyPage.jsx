/**
 * MobileOnlyPage.jsx
 *
 * Shown when a village_officer or hospital_officer successfully authenticates
 * via the web portal (which is admin-only). Instructs them to use the
 * TzCRVS mobile app instead.
 *
 * The web LoginPage.jsx ROLE_ROUTE map sends these roles to /mobile-only.
 * No ProtectedRoute wrapper needed — the page itself is the terminal destination.
 */

import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { apiLogout }    from '../api/auth.api'

export default function MobileOnlyPage() {
  const navigate              = useNavigate()
  const { role, clearAuth }   = useAuthStore()

  async function handleLogout() {
    try { await apiLogout() } catch { /* clear locally even if API fails */ }
    clearAuth()
    navigate('/login', { replace: true })
  }

  const roleLabel =
    role === 'village_officer'  ? 'Village Officer' :
    role === 'hospital_officer' ? 'Health Facility Officer' :
    'Field Officer'

  return (
    <div className="min-h-screen bg-[#050d1a] flex items-center justify-center p-6">

      {/* Background grid */}
      <div
        className="fixed inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(#00d4ff 1px, transparent 1px), linear-gradient(90deg, #00d4ff 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      <div className="relative z-10 max-w-md w-full text-center">

        {/* Icon */}
        <div className="w-20 h-20 rounded-2xl bg-[#00d4ff]/10 border border-[#00d4ff]/30
                        flex items-center justify-center mx-auto mb-6 text-4xl">
          📱
        </div>

        {/* Role badge */}
        <span className="inline-block bg-orange-500/20 text-orange-300 text-xs
                         font-semibold px-3 py-1 rounded-full mb-4 uppercase tracking-wider">
          {roleLabel}
        </span>

        <h1 className="text-white text-2xl font-bold mb-3">
          Use the Mobile App
        </h1>

        <p className="text-gray-400 text-sm leading-relaxed mb-2">
          The <strong className="text-white">TzCRVS web portal</strong> is for{' '}
          <strong className="text-white">administrators only</strong>.
        </p>
        <p className="text-gray-400 text-sm leading-relaxed mb-8">
          As a <strong className="text-[#fb923c]">{roleLabel}</strong>, your
          dashboard is accessed through the{' '}
          <strong className="text-white">TzCRVS mobile app</strong>. Please open
          the app on your registered device to continue.
        </p>

        {/* App info card */}
        <div className="bg-[#0d1f38] border border-[#1e3a5f] rounded-2xl p-5 mb-6 text-left space-y-3">
          <p className="text-[#00d4ff] text-xs font-semibold uppercase tracking-widest">
            How to access your dashboard
          </p>
          {[
            { n: '1', t: 'Open the TzCRVS mobile app on your device' },
            { n: '2', t: 'Log in with the same credentials you just used' },
            { n: '3', t: 'Your dashboard will load automatically' },
          ].map(step => (
            <div key={step.n} className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-[#00d4ff]/20 text-[#00d4ff] text-xs
                               font-bold flex items-center justify-center shrink-0 mt-0.5">
                {step.n}
              </span>
              <p className="text-gray-300 text-sm">{step.t}</p>
            </div>
          ))}
        </div>

        {/* Download note */}
        <p className="text-gray-600 text-xs mb-6">
          Don&apos;t have the app? Contact your District Administrator to receive
          the installation link and activation token.
        </p>

        <button
          onClick={handleLogout}
          className="w-full py-3 rounded-xl font-bold text-sm bg-[#0d1f38]
                     border border-[#1e3a5f] text-gray-400 hover:border-[#00d4ff]/40
                     hover:text-white transition-all"
        >
          ← Back to Login
        </button>

      </div>
    </div>
  )
}
