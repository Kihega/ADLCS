/**
 * PlaceholderDashboard.jsx — ADLCS Role Dashboard (Sprint 1 Placeholder)
 *
 * Shown after login while the real dashboards are built.
 * Renders role-specific colour scheme, icon, badge, and stat cards.
 * Confirms JWT auth is working end-to-end.
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { apiLogout } from '../api/auth.api'

// ── Role configuration ────────────────────────────────────────────────────────

const ROLE_CONFIG = {
  super_admin: {
    label:       'Super Administrator',
    icon:        '🛡️',
    accent:      '#00d4ff',
    accentBg:    'bg-[#00d4ff]/10',
    accentBorder:'border-[#00d4ff]/30',
    accentText:  'text-[#00d4ff]',
    badge:       'bg-[#00d4ff]/20 text-[#00d4ff]',
    description: 'NBS Headquarters — Full system access',
    stats: [
      { label: 'Districts',      value: '—', icon: '🗺️' },
      { label: 'Officers',       value: '—', icon: '👥' },
      { label: 'Citizens',       value: '—', icon: '🧑‍🤝‍🧑' },
      { label: 'Audit Logs',     value: '—', icon: '📋' },
    ],
    nextSprint: 'User management, district onboarding, system audit logs',
  },
  district_admin: {
    label:       'District Administrator',
    icon:        '🏛️',
    accent:      '#a78bfa',
    accentBg:    'bg-purple-500/10',
    accentBorder:'border-purple-500/30',
    accentText:  'text-purple-400',
    badge:       'bg-purple-500/20 text-purple-300',
    description: 'District-level management',
    stats: [
      { label: 'Villages',       value: '—', icon: '🏘️' },
      { label: 'Officers',       value: '—', icon: '👮' },
      { label: 'Registrations',  value: '—', icon: '📝' },
      { label: 'Pending',        value: '—', icon: '⏳' },
    ],
    nextSprint: 'Village officer management, district stats, registration overview',
  },
  village_officer: {
    label:       'Village Officer',
    icon:        '🏡',
    accent:      '#34d399',
    accentBg:    'bg-green-500/10',
    accentBorder:'border-green-500/30',
    accentText:  'text-green-400',
    badge:       'bg-green-500/20 text-green-300',
    description: 'Village-level field operations',
    stats: [
      { label: 'Citizens',       value: '—', icon: '🧑‍🤝‍🧑' },
      { label: 'Births',         value: '—', icon: '👶' },
      { label: 'Deaths',         value: '—', icon: '🕊️' },
      { label: 'Migrations',     value: '—', icon: '🚶' },
    ],
    nextSprint: 'Citizen registration, birth/death recording, geofencing',
  },
  hospital_officer: {
    label:       'Health Facility Officer',
    icon:        '🏥',
    accent:      '#fb923c',
    accentBg:    'bg-orange-500/10',
    accentBorder:'border-orange-500/30',
    accentText:  'text-orange-400',
    badge:       'bg-orange-500/20 text-orange-300',
    description: 'Health facility reporting',
    stats: [
      { label: 'Births',         value: '—', icon: '👶' },
      { label: 'Deaths',         value: '—', icon: '🕊️' },
      { label: 'Certificates',   value: '—', icon: '📜' },
      { label: 'Pending',        value: '—', icon: '⏳' },
    ],
    nextSprint: 'Birth/death registration, certificate generation, facility stats',
  },
  public_user: {
    label:       'Public User',
    icon:        '👤',
    accent:      '#f472b6',
    accentBg:    'bg-pink-500/10',
    accentBorder:'border-pink-500/30',
    accentText:  'text-pink-400',
    badge:       'bg-pink-500/20 text-pink-300',
    description: 'Citizen self-service portal',
    stats: [
      { label: 'Certificates',   value: '—', icon: '📜' },
      { label: 'Applications',   value: '—', icon: '📋' },
      { label: 'Messages',       value: '—', icon: '💬' },
      { label: 'Alerts',         value: '—', icon: '🔔' },
    ],
    nextSprint: 'View personal records, request certificates, status tracking',
  },
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ icon, label, value, accentText, accentBg, accentBorder }) {
  return (
    <div className={`${accentBg} border ${accentBorder} rounded-xl p-4 flex items-center gap-3`}>
      <span className="text-2xl">{icon}</span>
      <div>
        <p className="text-gray-400 text-xs">{label}</p>
        <p className={`${accentText} font-bold text-xl`}>{value}</p>
      </div>
    </div>
  )
}

function TokenBadge({ token }) {
  const [copied, setCopied] = useState(false)

  function copy() {
    navigator.clipboard.writeText(token).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  // Show only first 30 + last 10 chars so it doesn't overflow
  const display = token
    ? `${token.slice(0, 28)}…${token.slice(-10)}`
    : '—'

  return (
    <div
      className="flex items-center gap-2 bg-[#0a1628] border border-[#1a3060]
                 rounded-lg px-3 py-2 cursor-pointer hover:border-[#00d4ff]/40
                 transition-colors group"
      onClick={copy}
      title="Click to copy full token"
    >
      <code className="text-[#00d4ff]/70 text-xs font-mono flex-1 truncate">
        {display}
      </code>
      <span className="text-gray-600 text-xs group-hover:text-[#00d4ff] transition-colors shrink-0">
        {copied ? '✅ Copied' : '📋'}
      </span>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PlaceholderDashboard() {
  const navigate             = useNavigate()
  const { user, role, accessToken, clearAuth } = useAuthStore()
  const [loggingOut, setLoggingOut] = useState(false)

  const cfg = ROLE_CONFIG[role] || ROLE_CONFIG.super_admin

  async function handleLogout() {
    setLoggingOut(true)
    try {
      await apiLogout()
    } catch {
      // Clear locally even if API fails
    } finally {
      clearAuth()
      navigate('/login', { replace: true })
    }
  }

  return (
    <div className="min-h-screen bg-[#050d1a] p-4 md:p-8">

      {/* Background grid */}
      <div
        className="fixed inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(#00d4ff 1px, transparent 1px), linear-gradient(90deg, #00d4ff 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      <div className="max-w-3xl mx-auto relative z-10">

        {/* ── Header bar ──────────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{cfg.icon}</span>
            <div>
              <h1 className="text-white font-bold text-lg leading-tight">{cfg.label}</h1>
              <p className="text-gray-500 text-xs">{cfg.description}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="bg-[#0a1628] hover:bg-red-900/30 border border-[#1a3060]
                       hover:border-red-500/40 text-gray-400 hover:text-red-300
                       font-medium rounded-lg px-4 py-2 text-sm transition-all
                       disabled:opacity-50"
          >
            {loggingOut ? 'Logging out…' : '← Logout'}
          </button>
        </div>

        {/* ── Welcome card ────────────────────────────────────────────── */}
        <div
          className={`${cfg.accentBg} border ${cfg.accentBorder}
                      rounded-2xl p-6 mb-6 flex items-center gap-4`}
        >
          <div
            className={`w-14 h-14 rounded-full ${cfg.accentBg} border-2 ${cfg.accentBorder}
                        flex items-center justify-center text-2xl shrink-0`}
          >
            {cfg.icon}
          </div>
          <div className="flex-1 min-w-0">
            <p className={`${cfg.accentText} font-bold text-lg truncate`}>
              {user?.fullName || user?.email}
            </p>
            <p className="text-gray-400 text-sm truncate">{user?.email}</p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className={`${cfg.badge} text-xs font-medium px-2 py-0.5 rounded-full`}>
                {role?.replace('_', ' ').toUpperCase()}
              </span>
              {user?.employeeId && (
                <span className="text-gray-600 text-xs">
                  ID: {user.employeeId}
                </span>
              )}
              <span className="text-green-500 text-xs flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                Authenticated
              </span>
            </div>
          </div>
        </div>

        {/* ── Stats row ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {cfg.stats.map((s) => (
            <StatCard
              key={s.label}
              {...s}
              accentText={cfg.accentText}
              accentBg={cfg.accentBg}
              accentBorder={cfg.accentBorder}
            />
          ))}
        </div>

        {/* ── Sprint notice ────────────────────────────────────────────── */}
        <div className="bg-[#0a1628] border border-[#1a3060] rounded-xl p-5 mb-6">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-yellow-400">🚧</span>
            <p className="text-yellow-400 font-semibold text-sm">Sprint 1 Complete</p>
            <span className="bg-green-500/20 text-green-400 text-xs px-2 py-0.5 rounded-full ml-auto">
              Auth ✓
            </span>
          </div>
          <p className="text-gray-400 text-sm">
            JWT authentication is fully operational for{' '}
            <strong className="text-white">{cfg.label}</strong>.
            The real dashboard for this role is being built in the next sprint.
          </p>
          <p className={`${cfg.accentText} text-xs mt-2`}>
            📌 Next: {cfg.nextSprint}
          </p>
        </div>

        {/* ── JWT debug panel ──────────────────────────────────────────── */}
        <div className="bg-[#0a1628] border border-[#1a3060] rounded-xl p-5">
          <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-3">
            🔐 Active Session (Dev Info)
          </p>
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-gray-600 w-28 shrink-0">Role (from DB):</span>
              <span className={`${cfg.accentText} font-mono`}>{role}</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-gray-600 w-28 shrink-0">User ID:</span>
              <span className="text-gray-400 font-mono truncate">{user?.id || '—'}</span>
            </div>
            <div className="flex flex-col gap-1 text-xs">
              <span className="text-gray-600">Access Token (click to copy):</span>
              <TokenBadge token={accessToken} />
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
