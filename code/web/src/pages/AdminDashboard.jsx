/**
 * AdminDashboard.jsx — TzCRVS Super Admin / District Admin Dashboard
 *
 * A single role-aware dashboard component used by both /super-admin and
 * /district-admin routes. Every section fetches live data from
 * /api/admin/* — there is no mock or placeholder data. Buttons trigger
 * real API calls (status changes, deletes, registrations, password
 * changes) and the UI reflects the result.
 *
 * Privilege model:
 *   super_admin    — sees every section, national scope, can manage
 *                     district admins and all users.
 *   district_admin — sees an automatically-scoped subset (their own
 *                     district only) and cannot access District Admins,
 *                     Manage Users, or System Performance.
 */

import React, { useEffect, useState, useCallback } from 'react'  // PATCH-EMAIL-2025: React needed by useTheme
import { useNavigate } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import {
  Menu, X, LogOut, Shield, Users, RefreshCw, CheckCircle2,
  AlertTriangle, Database, Server, Globe, UserCheck, UserX,
  Trash2, UserPlus, ChevronLeft, ChevronRight, Settings,
  ShieldAlert, Stethoscope,
  Map as MapIcon, Search, Cpu, LayoutDashboard, Landmark, Heart,
  FileText, Sun, Moon,  // PATCH-EMAIL-2025: light/dark mode toggle icons
  Repeat,  // PATCH-MIGTRENDS-2026: Migration Trends sidebar icon
} from 'lucide-react'

import { useAuthStore } from '../store/authStore'
import { apiLogout } from '../api/auth.api'
import * as api from '../api/admin.api'
// HOTFIX-LINT-1: destructure from namespace so named refs resolve
const { apiGetSuperAdmins, apiDeleteSuperAdmin } = api

import NBSHeader from '../components/NBSHeader'
import GeoFilterBar from '../components/GeoFilterBar'
import YearMonthFilter from '../components/YearMonthFilter'
import ChangePasswordModal from '../modals/ChangePasswordModal'
import NewRegistrationModal from '../modals/NewRegistrationModal'
import ConfirmModal from '../components/ConfirmModal' // PATCH-ADMINREG-2026

// ── Shared UI primitives ─────────────────────────────────────────────────────

// PATCH-WEEKLYTRENDS-2026: shared month-name lookup for the RITA/NIDA/
// Migration Trends card headers (e.g. "Weekly Trend (July 2026)").
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function Card({ children, className = '' }) {
  return <div className={`bg-[#0a1628] border border-[#1a3060] rounded-xl p-4 ${className}`}>{children}</div>
}

// eslint-disable-next-line no-unused-vars -- Icon IS used as a JSX component below
function StatCard({ Icon, label, value, sub, accent = 'text-[#00d4ff]' }) {
  return (
    <Card className="flex items-center gap-3">
      <div className={`w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center ${accent}`}>
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <p className="text-gray-400 text-xs truncate">{label}</p>
        <p className={`font-bold text-xl ${accent}`}>{value}</p>
        {sub && <p className="text-gray-600 text-[10px] truncate">{sub}</p>}
      </div>
    </Card>
  )
}

const STATUS_STYLES = {
  active:    'bg-[#00ff9d]/15 text-[#00ff9d]',
  pending:   'bg-yellow-500/15 text-yellow-400',
  suspended: 'bg-red-500/15 text-red-400',
  offline:   'bg-gray-500/15 text-gray-400',
}

function StatusPill({ status }) {
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide ${STATUS_STYLES[status] || STATUS_STYLES.offline}`}>
      {status}
    </span>
  )
}

function SeverityPill({ severity }) {
  const map = {
    info:     'bg-[#00d4ff]/15 text-[#00d4ff]',
    warning:  'bg-orange-500/15 text-orange-400',
    critical: 'bg-red-500/15 text-red-400',
  }
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide ${map[severity] || map.info}`}>
      {severity}
    </span>
  )
}

function Th({ children }) {
  return <th className="text-left text-[10px] text-gray-500 uppercase tracking-wider font-semibold px-3 py-2">{children}</th>
}
function Td({ children, className = '' }) {
  return <td className={`px-3 py-2 text-xs text-gray-300 ${className}`}>{children}</td>
}

function EmptyState({ colSpan, text = 'No records found' }) {
  return (
    <tr><td colSpan={colSpan} className="text-center text-gray-600 text-xs py-8">{text}</td></tr>
  )
}
function LoadingState({ colSpan }) {
  return (
    <tr><td colSpan={colSpan} className="text-center text-gray-500 text-xs py-8">
      <RefreshCw size={14} className="inline animate-spin mr-2" />Loading…
    </td></tr>
  )
}

function PagerFooter({ page, total, limit, onPage }) {
  const pages = Math.max(Math.ceil((total || 0) / limit), 1)
  return (
    <div className="flex items-center justify-between px-3 py-2 border-t border-[#1a3060] text-[11px] text-gray-500">
      <span>{total ?? 0} total</span>
      <div className="flex items-center gap-2">
        <button disabled={page <= 1} onClick={() => onPage(page - 1)} className="p-1 rounded hover:bg-white/5 disabled:opacity-30">
          <ChevronLeft size={14} />
        </button>
        <span>Page {page} / {pages}</span>
        <button disabled={page >= pages} onClick={() => onPage(page + 1)} className="p-1 rounded hover:bg-white/5 disabled:opacity-30">
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  )
}

function SearchBox({ value, onChange, placeholder = 'Search…' }) {
  return (
    <div className="relative">
      <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="bg-[#0a1628] border border-[#1a3060] rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-gray-600 outline-none focus:border-[#00d4ff]/50 transition-colors"
      />
    </div>
  )
}

function StatusSelect({ value, options, onChange }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="bg-[#0a1628] border border-[#1a3060] rounded-lg px-2 py-1 text-[11px] text-white outline-none focus:border-[#00d4ff]/50"
    >
      {options.map(o => <option key={o} value={o}>{o.toUpperCase()}</option>)}
    </select>
  )
}

// PATCH-EMAIL-2025: added disabled prop for min-admin guard
function IconButton({ onClick, title, danger, disabled, children }) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      title={title}
      disabled={disabled}
      className={`p-1.5 rounded-lg border transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
        danger
          ? 'border-red-500/30 text-red-400 hover:bg-red-500/10'
          : 'border-[#1a3060] text-gray-400 hover:text-[#00d4ff] hover:border-[#00d4ff]/40'
      }`}
    >
      {children}
    </button>
  )
}

// ── Section: Dashboard (overview) ───────────────────────────────────────────

// PATCH-POP-3: DashboardSection also loads system-performance for accurate
// DB/Redis status cards (real latency probes instead of boolean isRedisReady)
function DashboardSection({ role }) {
  const [overview, setOverview] = useState(null)
  const [population, setPopulation] = useState(null)
  const [perf, setPerf] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [ov, pop, perfRes] = await Promise.all([
        api.apiGetOverview(),
        api.apiGetPopulation({}),
        api.apiGetSystemPerformance().catch(() => null),  // graceful — not fatal if role has no access
      ])
      setOverview(ov.data)
      setPopulation(pop.data)
      setPerf(perfRes?.data || null)
    } catch (err) {
      console.error('[dashboard]', err)
    } finally {
      setLoading(false)
    }
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  if (loading && !overview) {
    return <div className="text-gray-500 text-sm flex items-center gap-2"><RefreshCw size={14} className="animate-spin" />Loading dashboard…</div>
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard Icon={Users} label="Total Population" value={(overview?.totalPopulation ?? 0).toLocaleString()}
          sub={`${overview?.malePct ?? 0}% M · ${overview?.femalePct ?? 0}% F`} accent="text-[#00ff9d]" />
        {role === 'super_admin' && (
          <StatCard Icon={Landmark} label="District Admins" value={overview?.districtAdminsTotal ?? 0}
            sub={`${overview?.districtAdminsPending ?? 0} pending`} accent="text-blue-400" />
        )}
        <StatCard Icon={MapIcon} label="Village Officers" value={overview?.villageOfficersTotal ?? 0}
          sub={`${overview?.villageOfficersPending ?? 0} pending`} accent="text-[#00d4ff]" />
        <StatCard Icon={Stethoscope} label="Health Officers" value={overview?.hospitalOfficersTotal ?? 0}
          sub={`${overview?.hospitalOfficersPending ?? 0} pending`} accent="text-orange-400" />
        {/* PATCH-POP-3: real system-perf cards.
            PATCH-DISTRICTCARDS-2026: these are national infra health
            cards (DB/Redis/uptime/runtime) — meaningless for a
            district_admin scoped to one district, so super_admin only. */}
        {role === 'super_admin' && (
          <>
            <StatCard Icon={Database} label="PostgreSQL (Supabase)" value={perf?.databaseOk ? 'Online' : 'Offline'}
              sub={perf?.dbLatencyMs != null ? `${perf.dbLatencyMs} ms` : ''}
              accent={perf?.databaseOk ? 'text-[#00ff9d]' : 'text-red-400'} />
            <StatCard Icon={Server} label="Redis (Upstash)" value={perf?.redisOk ? 'Online' : 'Offline'}
              sub={perf?.redisLatencyMs != null ? `${perf.redisLatencyMs} ms` : ''}
              accent={perf?.redisOk ? 'text-[#00ff9d]' : 'text-gray-500'} />
            <StatCard Icon={Cpu} label="Backend Uptime" value={perf ? `${Math.floor((perf.uptimeSeconds||0)/3600)}h ${Math.floor(((perf.uptimeSeconds||0)%3600)/60)}m` : '—'} accent="text-[#00d4ff]" />
            <StatCard Icon={Globe} label="Node Runtime" value={perf?.nodeVersion || '—'} accent="text-purple-400" />
          </>
        )}
      </div>

      <Card>
        <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3">Population by Age Band</p>
        <div style={{ width: '100%', height: 260 }}>
          <ResponsiveContainer>
            <BarChart data={population?.pyramid || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a3060" />
              <XAxis dataKey="age" tick={{ fill: '#6b7280', fontSize: 10 }} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} />
              <Tooltip contentStyle={{ background: '#0a1628', border: '1px solid #1a3060', fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="male" name="Male" fill="#00d4ff" radius={[2, 2, 0, 0]} />
              <Bar dataKey="female" name="Female" fill="#00ff9d" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

    </div>
  )
}

// ── Section: Demographics ────────────────────────────────────────────────────

function DemographicsSection({ role }) {
  const [filters, setFilters] = useState({})
  const [population, setPopulation] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    api.apiGetPopulation(filters)
      .then(r => setPopulation(r.data))
      .catch(err => console.error('[demographics]', err))
      .finally(() => setLoading(false))
  }, [filters])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-4">
      <GeoFilterBar onChange={setFilters} scoped={role === 'district_admin'} />

      <div className="grid grid-cols-3 gap-3">
        <StatCard Icon={Users} label="Total Citizens" value={(population?.total ?? 0).toLocaleString()} accent="text-[#00ff9d]" />
        <StatCard Icon={UserCheck} label="Male" value={`${(population?.male ?? 0).toLocaleString()} (${population?.malePct ?? 0}%)`} accent="text-[#00d4ff]" />
        <StatCard Icon={UserCheck} label="Female" value={`${(population?.female ?? 0).toLocaleString()} (${population?.femalePct ?? 0}%)`} accent="text-pink-400" />
      </div>

      <Card>
        <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3">Age Distribution by Gender</p>
        <div style={{ width: '100%', height: 420 }}>
          {loading ? (
            <div className="flex items-center justify-center h-full text-gray-500 text-xs"><RefreshCw size={14} className="animate-spin mr-2" />Loading…</div>
          ) : (
            <ResponsiveContainer>
              <BarChart data={population?.pyramid || []} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a3060" />
                <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 10 }} />
                <YAxis type="category" dataKey="age" tick={{ fill: '#6b7280', fontSize: 10 }} width={50} />
                <Tooltip contentStyle={{ background: '#0a1628', border: '1px solid #1a3060', fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="male" name="Male" fill="#00d4ff" />
                <Bar dataKey="female" name="Female" fill="#00ff9d" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      {/* PATCH-3: Population Pyramid Card — mirrors male(left)/female(right) per age band */}
      <Card className="mt-4">
        <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3">
          Population Pyramid — {filters.regionId ? 'Selected Region' : filters.districtId ? 'Selected District' : 'National'}
        </p>
        {population?.pyramid?.length ? (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart
              layout="vertical"
              data={population.pyramid.map(b => ({
                age: b.age,
                Male: -(b.male || 0),
                Female: b.female || 0,
              }))}
              margin={{ left: 10, right: 10, top: 4, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#1a3060" />
              <XAxis
                type="number"
                tickFormatter={v => Math.abs(v).toLocaleString()}
                tick={{ fill: '#94a3b8', fontSize: 10 }}
              />
              <YAxis
                dataKey="age"
                type="category"
                tick={{ fill: '#94a3b8', fontSize: 10 }}
                width={48}
              />
              <Tooltip
                formatter={(value, name) => [Math.abs(value).toLocaleString(), name]}
                contentStyle={{ backgroundColor: '#0a1628', border: '1px solid #1a3060', borderRadius: 8, fontSize: 11 }}
                labelStyle={{ color: '#e2e8f0' }}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
              <Bar dataKey="Male"   fill="#3b82f6" radius={[0,3,3,0]} />
              <Bar dataKey="Female" fill="#ec4899" radius={[0,3,3,0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-gray-600 text-xs py-8 text-center">No pyramid data — select a filter or wait for population data to load.</p>
        )}
      </Card>
    </div>
  )
}

// ── Section: District Admins [super_admin] ──────────────────────────────────

// PATCH-ADMINREG-2026: no more standalone "New District Admin" button here —
// admin registration now lives on Manage Users ("Add New Admin").
function DistrictAdminsSection() {
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('all')
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [confirmTarget, setConfirmTarget] = useState(null)
  const [notice, setNotice] = useState('')
  const limit = 10

  const load = useCallback(() => {
    setLoading(true)
    api.apiGetDistrictAdmins({ page, limit, q, ...(status !== 'all' ? { status } : {}) })
      .then(r => { setRows(r.data || []); setTotal(r.total || 0) })
      .catch(err => console.error('[district-admins]', err))
      .finally(() => setLoading(false))
  }, [page, status, q])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  async function setRowStatus(id, newStatus) {
    try {
      await api.apiUpdateDistrictAdminStatus(id, newStatus)
      load()
    } catch (err) { setNotice(err.response?.data?.message || 'Update failed') }
  }
  function remove(id, name) { setConfirmTarget({ id, name }) }
  async function confirmRemove() {
    const t = confirmTarget
    setConfirmTarget(null)
    try {
      await api.apiDeleteDistrictAdmin(t.id)
      load()
    } catch (err) { setNotice(err.response?.data?.message || 'Delete failed') }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchBox value={q} onChange={v => { setPage(1); setQ(v) }} placeholder="Search name, email, ID…" />
        <StatusSelect value={status} options={['all', 'pending', 'active', 'suspended']} onChange={v => { setPage(1); setStatus(v) }} />
      </div>

      <Card className="p-0 overflow-x-auto">
        <table className="w-full">
          <thead><tr className="border-b border-[#1a3060]">
            <Th>Name</Th><Th>Email</Th><Th>Region / District</Th><Th>Status</Th><Th>MFA</Th><Th>Last Login</Th><Th>Actions</Th>
          </tr></thead>
          <tbody>
            {loading && <LoadingState colSpan={7} />}
            {!loading && rows.length === 0 && <EmptyState colSpan={7} />}
            {!loading && rows.map(r => (
              <tr key={r.id} className="border-b border-[#1a3060]/50 hover:bg-white/[0.02]">
                <Td className="text-white font-medium">{r.fullName}</Td>
                <Td>{r.email}</Td>
                <Td>{r.region?.name || '—'} / {r.district?.name || '—'}</Td>
                <Td><StatusPill status={r.status} /></Td>
                <Td>{r.mfaEnabled ? 'Yes' : 'No'}</Td>
                <Td>{r.lastLogin ? new Date(r.lastLogin).toLocaleDateString('en-TZ') : '—'}</Td>
                <Td>
                  <div className="flex items-center gap-1">
                    {r.status !== 'active' && (
                      <IconButton title="Activate" onClick={() => setRowStatus(r.id, 'active')}><UserCheck size={13} /></IconButton>
                    )}
                    {r.status !== 'suspended' && (
                      <IconButton title="Suspend" onClick={() => setRowStatus(r.id, 'suspended')}><UserX size={13} /></IconButton>
                    )}
                    <IconButton title="Delete" danger onClick={() => remove(r.id, r.fullName)}><Trash2 size={13} /></IconButton>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
        <PagerFooter page={page} total={total} limit={limit} onPage={setPage} />
      </Card>

      {confirmTarget && (
        <ConfirmModal
          title="Delete District Admin"
          message={`Delete district admin "${confirmTarget.name}"? This cannot be undone.`}
          danger
          confirmLabel="Delete"
          onConfirm={confirmRemove}
          onCancel={() => setConfirmTarget(null)}
        />
      )}
      {notice && <ConfirmModal title="Notice" message={notice} confirmLabel="OK" onConfirm={() => setNotice('')} />}
    </div>
  )
}
// ── Section: Officers (Village / Hospital) ───────────────────────────────────

function OfficersSection({ kind, role, onRegister }) {
  const isVillage = kind === 'village'
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('all')
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const limit = 10

  const getList   = isVillage ? api.apiGetVillageOfficers   : api.apiGetHealthOfficers
  const setStatusApi = isVillage ? api.apiUpdateVillageOfficerStatus : api.apiUpdateHealthOfficerStatus
  const deleteApi = isVillage ? api.apiDeleteVillageOfficer : api.apiDeleteHealthOfficer

  const load = useCallback(() => {
    setLoading(true)
    getList({ page, limit, q, ...(status !== 'all' ? { status } : {}) })
      .then(r => { setRows(r.data || []); setTotal(r.total || 0) })
      .catch(err => console.error('[officers]', err))
      .finally(() => setLoading(false))
  }, [page, status, q, getList])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  // PATCH-ADMINREG-PT2-2026
  const [confirmTarget, setConfirmTarget] = useState(null)
  const [notice, setNotice] = useState('')
  async function setRowStatus(id, newStatus) {
    try { await setStatusApi(id, newStatus); load() }
    catch (err) { setNotice(err.response?.data?.message || 'Update failed') }
  }
  function remove(id, name) { setConfirmTarget({ id, name }) }
  async function confirmRemove() {
    const t = confirmTarget
    setConfirmTarget(null)
    try { await deleteApi(t.id); load() }
    catch (err) { setNotice(err.response?.data?.message || 'Delete failed') }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <SearchBox value={q} onChange={v => { setPage(1); setQ(v) }} placeholder="Search name, email, ID…" />
          <StatusSelect value={status} options={['all', 'pending', 'active', 'offline', 'suspended']} onChange={v => { setPage(1); setStatus(v) }} />
        </div>
        {role === 'district_admin' && (
          <button onClick={onRegister} className="flex items-center gap-1.5 bg-[#00d4ff]/10 border border-[#00d4ff]/30 text-[#00d4ff] text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-[#00d4ff]/20">
            <UserPlus size={13} /> New {isVillage ? 'Village' : 'Health'} Officer
          </button>
        )}
      </div>

      <Card className="p-0 overflow-x-auto">
        <table className="w-full">
          <thead><tr className="border-b border-[#1a3060]">
            <Th>Name</Th><Th>Email</Th><Th>{isVillage ? 'Village / Ward' : 'Facility'}</Th><Th>District</Th><Th>Status</Th><Th>Last Login</Th><Th>Actions</Th>
          </tr></thead>
          <tbody>
            {loading && <LoadingState colSpan={7} />}
            {!loading && rows.length === 0 && <EmptyState colSpan={7} />}
            {!loading && rows.map(r => (
              <tr key={r.id} className="border-b border-[#1a3060]/50 hover:bg-white/[0.02]">
                <Td className="text-white font-medium">{r.fullName}</Td>
                <Td>{r.email}</Td>
                <Td>{isVillage ? `${r.village?.name || '—'} / ${r.ward?.name || '—'}` : (r.facility?.facilityName || '—')}</Td>
                <Td>{r.district?.name || '—'}</Td>
                <Td><StatusPill status={r.status} /></Td>
                <Td>{r.lastLogin ? new Date(r.lastLogin).toLocaleDateString('en-TZ') : '—'}</Td>
                <Td>
                  <div className="flex items-center gap-1">
                    {r.status !== 'active' && (
                      <IconButton title="Activate" onClick={() => setRowStatus(r.id, 'active')}><UserCheck size={13} /></IconButton>
                    )}
                    {r.status !== 'suspended' && (
                      <IconButton title="Suspend" onClick={() => setRowStatus(r.id, 'suspended')}><UserX size={13} /></IconButton>
                    )}
                    {/* PATCH-ADMINREG-PT2-2026: only national-scope (Super Admin)
                        accounts may delete officer accounts. */}
                    {role === 'super_admin' && (
                      <IconButton title="Delete" danger onClick={() => remove(r.id, r.fullName)}><Trash2 size={13} /></IconButton>
                    )}
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
        <PagerFooter page={page} total={total} limit={limit} onPage={setPage} />
      </Card>

      {confirmTarget && (
        <ConfirmModal
          title="Delete Officer"
          message={`Delete officer "${confirmTarget.name}"? This cannot be undone.`}
          danger
          confirmLabel="Delete"
          onConfirm={confirmRemove}
          onCancel={() => setConfirmTarget(null)}
        />
      )}
      {notice && <ConfirmModal title="Notice" message={notice} confirmLabel="OK" onConfirm={() => setNotice('')} />}
    </div>
  )
}
// ── Section: Manage Users [super_admin] ──────────────────────────────────────

// PATCH-ADMINREG-PT2-2026: dropped the 'Public Users' tab — that slot is now
// the always-visible "Add New Admin" button instead (see ManageUsersSection).
const USER_ROLES = [
  { key: 'super_admin',      label: 'Super Admins',  statuses: ['pending', 'active', 'suspended'] },
  { key: 'district_admin',   label: 'District Admins', statuses: ['pending', 'active', 'suspended'] },
  { key: 'village_officer',  label: 'Village Officers', statuses: ['pending', 'active', 'offline', 'suspended'] },
  { key: 'hospital_officer', label: 'Health Officers', statuses: ['pending', 'active', 'offline', 'suspended'] },
]

// PATCH-EMAIL-2025: accepts onRegister so super_admin tab can open the modal
function ManageUsersSection({ currentUserId, onRegister }) {
  const [tab, setTab] = useState('district_admin')
  const [superAdminMeta, setSuperAdminMeta] = useState({ total: 0, canAdd: true, canDelete: false })
  const [data, setData] = useState({})
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      api.apiGetUsers({ q }),
      apiGetSuperAdmins(),  // PATCH-EMAIL-2025: load count/guard flags
    ])
      .then(([usersRes, saRes]) => {
        setData(usersRes.data || {})
        setSuperAdminMeta({ total: saRes.total ?? 0, canAdd: saRes.canAdd ?? true, canDelete: saRes.canDelete ?? false })
      })
      .catch(err => console.error('[users]', err))
      .finally(() => setLoading(false))
  }, [q])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  const roleDef = USER_ROLES.find(r => r.key === tab)
  const rows = data[tab] || []

  // PATCH-ADMINREG-PT2-2026
  const [confirmTarget, setConfirmTarget] = useState(null)
  const [notice, setNotice] = useState('')
  async function setRowStatus(id, newStatus) {
    try { await api.apiUpdateUserStatus(tab, id, newStatus); load() }
    catch (err) { setNotice(err.response?.data?.message || 'Update failed') }
  }
  function remove(id, name) { setConfirmTarget({ id, name }) }
  async function confirmRemove() {
    const t = confirmTarget
    setConfirmTarget(null)
    try {
      if (tab === 'super_admin') {
        await apiDeleteSuperAdmin(t.id)
      } else {
        await api.apiDeleteUser(tab, t.id)
      }
      load()
    } catch (err) { setNotice(err.response?.data?.message || 'Delete failed') }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {USER_ROLES.map(r => (
            <button
              key={r.key}
              onClick={() => setTab(r.key)}
              className={`text-[11px] font-bold px-3 py-1.5 rounded-lg border transition-colors ${
                tab === r.key ? 'bg-[#00d4ff]/10 border-[#00d4ff]/40 text-[#00d4ff]' : 'border-[#1a3060] text-gray-500 hover:border-[#2a4060]'
              }`}
            >
              {r.label} {Array.isArray(data[r.key]) ? `(${data[r.key].length})` : ''}
            </button>
          ))}
        </div>
        {/* PATCH-ADMINREG-PT2-2026: always-visible unified registration entry
            point — was previously conditional on the super_admin tab and only
            created National Admins; the modal itself now offers a Scope
            (National/District) picker, and this is where "Public Users" used
            to sit. */}
        <div className="flex items-center gap-2">
          {tab === 'super_admin' && (
            <span className="text-[10px] text-gray-500">{superAdminMeta.total}/{3} admins</span>
          )}
          <button
            onClick={() => onRegister && onRegister()}
            className="flex items-center gap-1.5 bg-[#00d4ff]/10 border border-[#00d4ff]/30 text-[#00d4ff] text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-[#00d4ff]/20"
          >
            <UserPlus size={13} /> Add New Admin
          </button>
        </div>
        <SearchBox value={q} onChange={setQ} placeholder="Search name / email…" />
      </div>

      <Card className="p-0 overflow-x-auto">
        <table className="w-full">
          <thead><tr className="border-b border-[#1a3060]">
            <Th>Name</Th><Th>Email</Th><Th>Status</Th><Th>Last Login</Th><Th>Actions</Th>
          </tr></thead>
          <tbody>
            {loading && <LoadingState colSpan={5} />}
            {!loading && rows.length === 0 && <EmptyState colSpan={5} />}
            {!loading && rows.map(r => (
              <tr key={r.id} className="border-b border-[#1a3060]/50 hover:bg-white/[0.02]">
                <Td className="text-white font-medium">{r.fullName || r.displayName || '—'}</Td>
                <Td>{r.email}</Td>
                <Td><StatusPill status={r.status} /></Td>
                <Td>{r.lastLogin ? new Date(r.lastLogin).toLocaleDateString('en-TZ') : '—'}</Td>
                <Td>
                  <div className="flex items-center gap-1">
                    {roleDef.statuses.filter(s => s !== r.status).map(s => (
                      <button
                        key={s}
                        onClick={() => setRowStatus(r.id, s)}
                        disabled={tab === 'super_admin' && r.id === currentUserId}
                        className="text-[10px] px-2 py-1 rounded-lg border border-[#1a3060] text-gray-400 hover:text-[#00d4ff] hover:border-[#00d4ff]/40 disabled:opacity-30"
                      >
                        {s}
                      </button>
                    ))}
                    {/* PATCH-EMAIL-2025: disable delete if last super_admin or self */}
                    <IconButton
                      title={
                        tab === 'super_admin' && !superAdminMeta.canDelete
                          ? 'Cannot delete — system must retain at least 1 Super Admin'
                          : 'Delete'
                      }
                      danger
                      onClick={() => remove(r.id, r.fullName || r.displayName)}
                      disabled={tab === 'super_admin' && (!superAdminMeta.canDelete || r.id === currentUserId)}
                    >
                      <Trash2 size={13} />
                    </IconButton>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {confirmTarget && (
        <ConfirmModal
          title="Delete User"
          message={`Delete user "${confirmTarget.name}"? This cannot be undone.`}
          danger
          confirmLabel="Delete"
          onConfirm={confirmRemove}
          onCancel={() => setConfirmTarget(null)}
        />
      )}
      {notice && <ConfirmModal title="Notice" message={notice} confirmLabel="OK" onConfirm={() => setNotice('')} />}
    </div>
  )
}

// ── Section: Audit Logs / Security Alerts ────────────────────────────────────

function AuditLogsSection({ securityOnly = false }) {
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [severity, setSeverity] = useState('all')
  const [action, setAction] = useState('')
  const [loading, setLoading] = useState(true)
  const limit = 12

  const load = useCallback(() => {
    setLoading(true)
    const fn = securityOnly ? api.apiGetSecurityAlerts : api.apiGetAuditLogs
    const params = { page, limit, ...(action ? { action } : {}) }
    if (severity !== 'all') params.severity = severity
    fn(params)
      .then(r => { setRows(r.data || []); setTotal(r.total || 0) })
      .catch(err => console.error('[audit-logs]', err))
      .finally(() => setLoading(false))
  }, [page, severity, action, securityOnly])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchBox value={action} onChange={v => { setPage(1); setAction(v) }} placeholder="Filter by action…" />
        <StatusSelect value={severity} options={['all', 'info', 'warning', 'critical']} onChange={v => { setPage(1); setSeverity(v) }} />
        <button onClick={load} className="flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-[#00d4ff] border border-[#1a3060] px-2 py-1.5 rounded-lg">
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      <Card className="p-0 overflow-x-auto">
        <table className="w-full">
          <thead><tr className="border-b border-[#1a3060]">
            <Th>Time</Th><Th>Actor</Th><Th>Action</Th><Th>Target</Th><Th>Severity</Th>
          </tr></thead>
          <tbody>
            {loading && <LoadingState colSpan={5} />}
            {!loading && rows.length === 0 && <EmptyState colSpan={5} text={securityOnly ? 'No security alerts' : 'No audit log entries'} />}
            {!loading && rows.map(l => (
              <tr key={l.id} className="border-b border-[#1a3060]/50 hover:bg-white/[0.02]">
                <Td>{new Date(l.timestamp).toLocaleString('en-TZ')}</Td>
                <Td className="font-mono text-[10px]">{l.actorRole} · {l.actorId.slice(0, 8)}…</Td>
                <Td className="text-white">{l.action.replace(/_/g, ' ')}</Td>
                <Td>{l.targetTable}{l.targetId ? ` #${String(l.targetId).slice(0, 8)}` : ''}</Td>
                <Td><SeverityPill severity={l.severity} /></Td>
              </tr>
            ))}
          </tbody>
        </table>
        <PagerFooter page={page} total={total} limit={limit} onPage={setPage} />
      </Card>
    </div>
  )
}

// ── Section: System Performance [super_admin] ────────────────────────────────

function SystemPerformanceSection() {
  const [perf, setPerf] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    api.apiGetSystemPerformance()
      .then(r => setPerf(r.data))
      .catch(err => console.error('[system-performance]', err))
      .finally(() => setLoading(false))
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  if (loading && !perf) {
    return <div className="text-gray-500 text-sm flex items-center gap-2"><RefreshCw size={14} className="animate-spin" />Checking system health…</div>
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard Icon={Database} label="PostgreSQL (Supabase)" value={perf?.databaseOk ? 'Online' : 'Offline'}
          sub={perf?.dbLatencyMs != null ? `${perf.dbLatencyMs} ms` : ''} accent={perf?.databaseOk ? 'text-[#00ff9d]' : 'text-red-400'} />
        <StatCard Icon={Server} label="Redis (Upstash)" value={perf?.redisOk ? 'Online' : 'Offline'}
          sub={perf?.redisLatencyMs != null ? `${perf.redisLatencyMs} ms` : ''} accent={perf?.redisOk ? 'text-[#00ff9d]' : 'text-gray-500'} />
        <StatCard Icon={Cpu} label="Backend Uptime" value={`${Math.floor((perf?.uptimeSeconds || 0) / 3600)}h ${Math.floor(((perf?.uptimeSeconds || 0) % 3600) / 60)}m`} accent="text-[#00d4ff]" />
        <StatCard Icon={Globe} label="Node Runtime" value={perf?.nodeVersion || '—'} accent="text-purple-400" />
      </div>

      {/* BUGFIX-10: unused "Table Record Counts" card grid removed — System
          Performance now shows only the first row of live health cards. */}
      <button onClick={load} className="flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-[#00d4ff] border border-[#1a3060] px-3 py-1.5 rounded-lg">
        <RefreshCw size={12} /> Re-run health check
      </button>
    </div>
  )
}

// BUGFIX-10: "Migration Trends" menu button + section removed (Super Admin
// and District Admin dashboards). /api/admin/migrations and
// apiGetMigrations() are left untouched in case they're needed again.

// ── Section: Marriages ───────────────────────────────────────────────────────

function MarriagesSection() {
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [statusCounts, setStatusCounts] = useState([])
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('all')
  const [loading, setLoading] = useState(true)
  const limit = 10

  const load = useCallback(() => {
    setLoading(true)
    api.apiGetMarriages({ page, limit, ...(status !== 'all' ? { status } : {}) })
      .then(r => { setRows(r.data || []); setTotal(r.total || 0); setStatusCounts(r.statusCounts || []) })
      .catch(err => console.error('[marriages]', err))
      .finally(() => setLoading(false))
  }, [page, status])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Heart size={14} className="text-pink-400" />
        <StatusSelect value={status} options={['all', 'active', 'dissolved', 'pending_dissolution', 'unregistered']} onChange={v => { setPage(1); setStatus(v) }} />
        {statusCounts.map(s => (
          <span key={s.status} className="text-[10px] text-gray-500 border border-[#1a3060] rounded-full px-2 py-0.5">
            {s.status}: {s._count._all}
          </span>
        ))}
      </div>

      <Card className="p-0 overflow-x-auto">
        <table className="w-full">
          <thead><tr className="border-b border-[#1a3060]">
            <Th>Cert No</Th><Th>Husband</Th><Th>Wife</Th><Th>Place</Th><Th>Date</Th><Th>Status</Th>
          </tr></thead>
          <tbody>
            {loading && <LoadingState colSpan={6} />}
            {!loading && rows.length === 0 && <EmptyState colSpan={6} />}
            {!loading && rows.map(m => (
              <tr key={m.id} className="border-b border-[#1a3060]/50 hover:bg-white/[0.02]">
                <Td className="font-mono text-[10px]">{m.marriageCertNo}</Td>
                <Td className="text-white">{m.husband?.firstName} {m.husband?.surname}</Td>
                <Td className="text-white">{m.wife?.firstName} {m.wife?.surname}</Td>
                <Td>{m.marriagePlace}</Td>
                <Td>{new Date(m.marriageDate).toLocaleDateString('en-TZ')}</Td>
                <Td><StatusPill status={m.status === 'active' ? 'active' : 'suspended'} /></Td>
              </tr>
            ))}
          </tbody>
        </table>
        <PagerFooter page={page} total={total} limit={limit} onPage={setPage} />
      </Card>
    </div>
  )
}
// ── Navigation config ────────────────────────────────────────────────────────


// ── PATCH-4: Section: RITA — Births / Deaths / Marriages trends ──────────────
function RITASection({ role }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({})
  const [period, setPeriod] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() + 1 }
  })
  // LINTFIX-2-v2: reverted to the exact same load()-useCallback pattern
  // already used successfully by every other section in this file
  // (OverviewSection, PopulationSection, OfficersSection, etc.). Inlining
  // the fetch directly into useEffect (the v1 attempt) actually made the
  // set-state-in-effect error WORSE, because eslint-plugin-react-hooks v7
  // flags any setState lexically written inside the effect body itself —
  // it does NOT flag setState calls inside a separate function that the
  // effect merely invokes. This is why every other section's identical
  // `useEffect(() => { load() }, [load])` one-liner passes cleanly.
  const load = useCallback((f = filters) => {
    setLoading(true)
    api.apiGetRITA(f)
      .then(r => setData(r.data))
      .catch(e => console.error('[RITA]', e))
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load({ ...filters, ...period }) }, [filters, period, load])

  const [notice, setNotice] = useState('')

  return (
    <div className="space-y-4">
      {notice && <ConfirmModal title="Notice" message={notice} confirmLabel="OK" onConfirm={() => setNotice('')} />}
      <div className="flex items-center justify-between">
        <h2 className="text-white font-bold text-lg">RITA — Registration Trends</h2>
      </div>
      <YearMonthFilter onChange={p => setPeriod(p)} />
      <GeoFilterBar onChange={f => setFilters(f)} scoped={role === 'district_admin'} />

      {loading ? (
        <Card><p className="text-gray-500 text-xs py-8 text-center"><RefreshCw size={14} className="inline animate-spin mr-2" />Loading RITA data…</p></Card>
      ) : (
        <>
          {/* Totals */}
          <div className="grid grid-cols-3 gap-3">
            <StatCard Icon={Users}  label="Total Births"    value={(data?.totals?.births    ?? 0).toLocaleString()} accent="text-[#3b82f6]" />
            <StatCard Icon={AlertTriangle} label="Total Deaths" value={(data?.totals?.deaths ?? 0).toLocaleString()} accent="text-red-400" />
            <StatCard Icon={Heart}  label="Total Marriages" value={(data?.totals?.marriages ?? 0).toLocaleString()} accent="text-pink-400" />
          </div>

          {/* Births trend */}
          <Card>
            <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3">Birth Registrations — Weekly Trend ({MONTH_NAMES[period.month - 1]} {period.year})</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data?.births || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a3060" />
                <XAxis dataKey="week" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <Tooltip contentStyle={{ backgroundColor: '#0a1628', border: '1px solid #1a3060', fontSize: 11 }} />
                <Bar dataKey="count" fill="#3b82f6" name="Births" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          {/* Deaths trend */}
          <Card>
            <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3">Death Registrations — Weekly Trend ({MONTH_NAMES[period.month - 1]} {period.year})</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data?.deaths || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a3060" />
                <XAxis dataKey="week" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <Tooltip contentStyle={{ backgroundColor: '#0a1628', border: '1px solid #1a3060', fontSize: 11 }} />
                <Bar dataKey="count" fill="#ef4444" name="Deaths" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          {/* Marriages trend */}
          <Card>
            <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3">Marriage Registrations — Weekly Trend ({MONTH_NAMES[period.month - 1]} {period.year})</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data?.marriages || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a3060" />
                <XAxis dataKey="week" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <Tooltip contentStyle={{ backgroundColor: '#0a1628', border: '1px solid #1a3060', fontSize: 11 }} />
                <Bar dataKey="count" fill="#ec4899" name="Marriages" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </>
      )}
    </div>
  )
}

// ── PATCH-4: Section: NIDA — NIN Issuance trends ─────────────────────────────
function NIDASection({ role }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({})
  const [period, setPeriod] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() + 1 }
  })

  // LINTFIX-2-v2: same load()-useCallback pattern as every other section
  // in this file (see RITASection above for the full explanation of why
  // the v1 inline-fetch attempt was wrong).
  const load = useCallback((f = filters) => {
    setLoading(true)
    api.apiGetNIDA(f)
      .then(r => setData(r.data))
      .catch(e => console.error('[NIDA]', e))
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load({ ...filters, ...period }) }, [filters, period, load])

  return (
    <div className="space-y-4">
      <h2 className="text-white font-bold text-lg">NIDA — NIN Issuance Trends</h2>
      <YearMonthFilter onChange={p => setPeriod(p)} />
      <GeoFilterBar onChange={f => setFilters(f)} scoped={role === 'district_admin'} />

      {loading ? (
        <Card><p className="text-gray-500 text-xs py-8 text-center"><RefreshCw size={14} className="inline animate-spin mr-2" />Loading NIDA data…</p></Card>
      ) : (
        <>
          <StatCard Icon={UserCheck} label="Total NIDs Issued" value={(data?.total ?? 0).toLocaleString()} accent="text-[#00d4ff]" />
          <Card>
            <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3">NIN Issuances — Weekly Trend ({MONTH_NAMES[period.month - 1]} {period.year})</p>
            {data?.ninIssuances?.length ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data.ninIssuances}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a3060" />
                  <XAxis dataKey="week" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
                  <Tooltip contentStyle={{ backgroundColor: '#0a1628', border: '1px solid #1a3060', fontSize: 11 }} />
                  <Bar dataKey="count" fill="#00d4ff" name="NIDs Issued" radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-gray-600 text-xs py-8 text-center">No NIN issuance data found. Issue some NIDs via the Village Officer app first.</p>
            )}
          </Card>
        </>
      )}
    </div>
  )
}

// PATCH-MIGTRENDS-2026: Migration Trends re-added for both roles. Uses the
// same GeoFilterBar contract as RITA/NIDA: super_admin gets the full
// Region -> District -> Ward -> Village/Street cascade; district_admin
// gets the scoped Ward -> Village/Street picker, floored server-side to
// their own district regardless of what the client sends.
function MigrationsSection({ role }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({})
  const [period, setPeriod] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() + 1 }
  })

  const load = useCallback((f = filters) => {
    setLoading(true)
    api.apiGetMigrationTrends(f)
      .then(r => setData(r.data))
      .catch(e => console.error('[MigrationTrends]', e))
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load({ ...filters, ...period }) }, [filters, period, load])

  const totals = data?.totals || { pending: 0, confirmed: 0, cancelled: 0, expired: 0, all: 0 }

  return (
    <div className="space-y-4">
      <h2 className="text-white font-bold text-lg">Migration Trends</h2>
      <YearMonthFilter onChange={p => setPeriod(p)} />
      <GeoFilterBar onChange={f => setFilters(f)} scoped={role === 'district_admin'} />

      {loading ? (
        <Card><p className="text-gray-500 text-xs py-8 text-center"><RefreshCw size={14} className="inline animate-spin mr-2" />Loading migration data…</p></Card>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard Icon={Repeat}         label="Pending"   value={totals.pending.toLocaleString()}   accent="text-amber-400" />
            <StatCard Icon={CheckCircle2}   label="Confirmed" value={totals.confirmed.toLocaleString()} accent="text-emerald-400" />
            <StatCard Icon={AlertTriangle}  label="Cancelled" value={totals.cancelled.toLocaleString()} accent="text-red-400" />
            <StatCard Icon={UserX}          label="Expired"   value={totals.expired.toLocaleString()}   accent="text-gray-400" />
          </div>
          <Card>
            <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3">Migration Requests — Weekly Trend ({MONTH_NAMES[period.month - 1]} {period.year})</p>
            {data?.trend?.length ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data.trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a3060" />
                  <XAxis dataKey="week" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
                  <Tooltip contentStyle={{ backgroundColor: '#0a1628', border: '1px solid #1a3060', fontSize: 11 }} />
                  <Bar dataKey="count" fill="#7c3aed" name="Migration Requests" radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-gray-600 text-xs py-8 text-center">No migration requests found for this scope yet.</p>
            )}
          </Card>
        </>
      )}
    </div>
  )
}

// ── useTheme — persisted per user-ID in localStorage, removed on logout ────
// PATCH-POP-3: key is now scoped to userId so different users on the same
// device each keep their own preference. The cleanup effect removes the CSS
// class when AdminDashboard unmounts (logout), so the login page is always
// shown in the default dark theme regardless of what the previous user chose.
function useTheme(userId) {
  const THEME_KEY = userId ? `tzcrvs_theme_${userId}` : 'tzcrvs_theme'
  const [theme, setThemeRaw] = React.useState(
    () => (userId ? localStorage.getItem(THEME_KEY) : null) || 'dark'
  )
  function setTheme(t) {
    setThemeRaw(t)
    if (userId) localStorage.setItem(THEME_KEY, t)
    document.documentElement.classList.toggle('tzcrvs-light', t === 'light')
  }
  // Apply class on every theme change
  React.useEffect(() => {
    document.documentElement.classList.toggle('tzcrvs-light', theme === 'light')
  }, [theme])
  // Cleanup on unmount (logout) — ensures login page is never in light mode
  React.useEffect(() => {
    return () => { document.documentElement.classList.remove('tzcrvs-light') }
  }, [])
  return [theme, setTheme]
}

const NAV = [
  { key: 'dashboard',           label: 'Dashboard',            Icon: LayoutDashboard, roles: ['super_admin', 'district_admin'] },
  { key: 'demographics',        label: 'Demographics',         Icon: MapIcon,         roles: ['super_admin', 'district_admin'] },
  { key: 'district_admins',     label: 'District Admins',      Icon: Landmark,        roles: ['super_admin'] },
  { key: 'village_officers',    label: 'Village Officers',     Icon: Users,           roles: ['super_admin', 'district_admin'] },
  { key: 'health_officers',     label: 'Health Officers',      Icon: Stethoscope,     roles: ['super_admin', 'district_admin'] },
  { key: 'manage_users',        label: 'Manage Users',         Icon: Shield,          roles: ['super_admin'] },
  { key: 'marriages',           label: 'Marriage Records',     Icon: Heart,           roles: ['super_admin', 'district_admin'] },
  { key: 'migrations',          label: 'Migration Trends',     Icon: Repeat,          roles: ['super_admin', 'district_admin'] },
  { key: 'audit_logs',          label: 'System Log Reports',   Icon: FileText,        roles: ['super_admin'] },
  { key: 'security_alerts',     label: 'Security Alerts',      Icon: ShieldAlert,     roles: ['super_admin'] },
  { key: 'system_performance',  label: 'System Performance',   Icon: Cpu,             roles: ['super_admin'] },
  { key: 'rita',               label: 'RITA',                 Icon: FileText,        roles: ['super_admin', 'district_admin'] },
  { key: 'nida',               label: 'NIDA',                 Icon: Shield,          roles: ['super_admin', 'district_admin'] },
]

const SECTION_TITLE = {
  dashboard: 'Dashboard', demographics: 'Demographics View', district_admins: 'District Admins',
  village_officers: 'Village Officers', health_officers: 'Health Officers', manage_users: 'Manage Users',
  marriages: 'Marriage Records', audit_logs: 'System Log Reports',
  security_alerts: 'Security Alerts', system_performance: 'System Performance',
  migrations: 'Migration Trends',
}

// ── Main component ───────────────────────────────────────────────────────────

export default function AdminDashboard({ role }) {
  const navigate = useNavigate()
  const { user, clearAuth } = useAuthStore()

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [activeNav,   setActiveNav]   = useState('dashboard')
  const [showChangePwd, setShowChangePwd]       = useState(false)
  const [showNewReg,    setShowNewReg]           = useState(false)
  const [loggingOut,    setLoggingOut]           = useState(false)

  const nav = NAV.filter(n => n.roles.includes(role))

  async function handleLogout() {
    setLoggingOut(true)
    try { await apiLogout() } catch { /* clear locally even if API fails */ }
    finally { clearAuth(); navigate('/login', { replace: true }) }
  }

  function renderSection() {
    switch (activeNav) {
      case 'dashboard':           return <DashboardSection role={role} />
      case 'demographics':        return <DemographicsSection role={role} />
      case 'district_admins':     return <DistrictAdminsSection onRegister={() => setShowNewReg(true)} />
      case 'village_officers':    return <OfficersSection kind="village" role={role} onRegister={() => setShowNewReg(true)} />
      case 'health_officers':     return <OfficersSection kind="health" role={role} onRegister={() => setShowNewReg(true)} />
      case 'manage_users':        return <ManageUsersSection currentUserId={user?.id} onRegister={() => setShowNewReg(true)} />
      case 'marriages':           return <MarriagesSection />
      case 'audit_logs':          return <AuditLogsSection />
      case 'security_alerts':     return <AuditLogsSection securityOnly />
      case 'system_performance':  return <SystemPerformanceSection />
      case 'rita':               return <RITASection role={role} />
      case 'nida':               return <NIDASection role={role} />
      case 'migrations':         return <MigrationsSection role={role} />
      default:                    return null
    }
  }

  const roleLabel = role === 'super_admin' ? 'Administrator' : 'District Administrator' // PATCH-ADMINREG-2026
  const [theme, setTheme] = useTheme(user?.id)  // PATCH-POP-3: scoped to logged-in user

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#060f1e]">
      <NBSHeader activeSection={SECTION_TITLE[activeNav]} />

      <div className="flex-1 overflow-hidden flex">
        {/* ── Sidebar ───────────────────────────────────────────────────── */}
        <aside
          className={`bg-[#0a1628] border-r border-[#1a3060] flex flex-col shrink-0 transition-all duration-200
            ${sidebarOpen ? 'w-56' : 'w-0 md:w-14'} overflow-hidden`}
        >
          <div className="flex items-center justify-between p-3 border-b border-[#1a3060]">
            {sidebarOpen && <span className="text-white text-xs font-bold truncate">{roleLabel}</span>}
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-gray-500 hover:text-[#00d4ff] shrink-0">
              {sidebarOpen ? <X size={16} /> : <Menu size={16} />}
            </button>
          </div>
          <nav className="flex-1 overflow-y-auto py-2">
            {nav.map(n => (
              <button
                key={n.key}
                onClick={() => setActiveNav(n.key)}
                title={n.label}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-xs transition-colors ${
                  activeNav === n.key
                    ? 'bg-[#00d4ff]/10 text-[#00d4ff] border-r-2 border-[#00d4ff]'
                    : 'text-gray-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                <n.Icon size={16} className="shrink-0" />
                {sidebarOpen && <span className="truncate">{n.label}</span>}
              </button>
            ))}
          </nav>
          <div className="border-t border-[#1a3060] p-2 space-y-1">
            <button
              onClick={() => setShowChangePwd(true)}
              className="w-full flex items-center gap-3 px-3 py-2 text-xs text-gray-400 hover:bg-white/5 hover:text-white rounded-lg"
            >
              <Settings size={16} className="shrink-0" />
              {sidebarOpen && <span>Change Password</span>}
            </button>
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="w-full flex items-center gap-3 px-3 py-2 text-xs text-gray-400 hover:bg-red-900/20 hover:text-red-300 rounded-lg disabled:opacity-50"
            >
              <LogOut size={16} className="shrink-0" />
              {sidebarOpen && <span>{loggingOut ? 'Logging out…' : 'Logout'}</span>}
            </button>
          </div>
        </aside>

        {/* ── Main content ──────────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="flex items-center justify-between mb-4">{/* HOTFIX-LINT-4 */}
            <div>
              <h1 className="text-white font-bold text-lg">{SECTION_TITLE[activeNav]}</h1>
              <p className="text-gray-500 text-xs">
                {user?.fullName || user?.email} · {roleLabel}
              </p>
            </div>
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="p-2 rounded-lg border border-[#1a3060] text-gray-400 hover:text-[#00d4ff] hover:border-[#00d4ff]/40 transition-colors"
            >
              {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            </button>
          </div>
          {renderSection()}
        </main>
      </div>

      {showChangePwd && <ChangePasswordModal onClose={() => setShowChangePwd(false)} />}
      {showNewReg && (
        <NewRegistrationModal
          defaultTarget={
            activeNav === 'health_officers'  ? 'hospital_officer'  :
            activeNav === 'village_officers' ? 'village_officer'   : undefined
          }
          onClose={() => { setShowNewReg(false); setActiveNav(activeNav) }}
        />
      )}{/* PATCH-ADMINREG-PT2-2026 */}
    </div>
  )
}
