/**
 * AdminDashboard.jsx — ADLCS Super Admin / District Admin Dashboard
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

import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import {
  Menu, X, LogOut, Shield, Users, RefreshCw, CheckCircle2,
  AlertTriangle, Database, Server, Globe, UserCheck, UserX,
  Trash2, UserPlus, ChevronLeft, ChevronRight, Settings,
  ShieldAlert, ArrowLeftRight, Stethoscope,
  Map as MapIcon, Search, Cpu, LayoutDashboard, Landmark, Heart,
  FileText,
} from 'lucide-react'

import { useAuthStore } from '../store/authStore'
import { apiLogout } from '../api/auth.api'
import * as api from '../api/admin.api'

import NBSHeader from '../components/NBSHeader'
import GeoFilterBar from '../components/GeoFilterBar'
import ChangePasswordModal from '../modals/ChangePasswordModal'
import NewRegistrationModal from '../modals/NewRegistrationModal'

// ── Shared UI primitives ─────────────────────────────────────────────────────

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

function IconButton({ onClick, title, danger, children }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded-lg border transition-colors ${
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

function DashboardSection({ role }) {
  const [overview, setOverview] = useState(null)
  const [population, setPopulation] = useState(null)
  const [recentLogs, setRecentLogs] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [ov, pop, logs] = await Promise.all([
        api.apiGetOverview(),
        api.apiGetPopulation({}),
        api.apiGetAuditLogs({ limit: 6 }),
      ])
      setOverview(ov.data)
      setPopulation(pop.data)
      setRecentLogs(logs.data || [])
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
        <StatCard Icon={ShieldAlert} label="Security Alerts (24h)" value={overview?.securityAlerts24h ?? 0}
          sub="warning + critical" accent="text-red-400" />
        <StatCard Icon={Database}
          label="Database"
          value={overview?.systemHealth?.databaseOk ? 'Online' : 'Offline'}
          accent={overview?.systemHealth?.databaseOk ? 'text-[#00ff9d]' : 'text-red-400'} />
        <StatCard Icon={Server}
          label="Redis Cache"
          value={overview?.systemHealth?.redisOk ? 'Online' : 'Offline'}
          accent={overview?.systemHealth?.redisOk ? 'text-[#00ff9d]' : 'text-gray-500'} />
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

      <Card>
        <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3">Recent Activity</p>
        <div className="space-y-2">
          {recentLogs.length === 0 && <p className="text-gray-600 text-xs">No recent activity</p>}
          {recentLogs.map(l => (
            <div key={l.id} className="flex items-center gap-3 text-xs">
              {l.severity === 'critical' || l.severity === 'warning'
                ? <AlertTriangle size={14} className="text-red-400 shrink-0" />
                : <CheckCircle2 size={14} className="text-[#00ff9d] shrink-0" />}
              <span className="text-gray-300 flex-1 truncate">{l.action.replace(/_/g, ' ')} — {l.targetTable}</span>
              <span className="text-gray-600 shrink-0">{new Date(l.timestamp).toLocaleString('en-TZ')}</span>
              <SeverityPill severity={l.severity} />
            </div>
          ))}
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

function DistrictAdminsSection({ onRegister }) {
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('all')
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
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
    } catch (err) { alert(err.response?.data?.message || 'Update failed') }
  }
  async function remove(id, name) {
    if (!window.confirm(`Delete district admin "${name}"? This cannot be undone.`)) return
    try {
      await api.apiDeleteDistrictAdmin(id)
      load()
    } catch (err) { alert(err.response?.data?.message || 'Delete failed') }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <SearchBox value={q} onChange={v => { setPage(1); setQ(v) }} placeholder="Search name, email, ID…" />
          <StatusSelect value={status} options={['all', 'pending', 'active', 'suspended']} onChange={v => { setPage(1); setStatus(v) }} />
        </div>
        <button onClick={onRegister} className="flex items-center gap-1.5 bg-[#00d4ff]/10 border border-[#00d4ff]/30 text-[#00d4ff] text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-[#00d4ff]/20">
          <UserPlus size={13} /> New District Admin
        </button>
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
    </div>
  )
}

// ── Section: Officers (Village / Health) ─────────────────────────────────────

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

  async function setRowStatus(id, newStatus) {
    try { await setStatusApi(id, newStatus); load() }
    catch (err) { alert(err.response?.data?.message || 'Update failed') }
  }
  async function remove(id, name) {
    if (!window.confirm(`Delete officer "${name}"? This cannot be undone.`)) return
    try { await deleteApi(id); load() }
    catch (err) { alert(err.response?.data?.message || 'Delete failed') }
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
                    <IconButton title="Delete" danger onClick={() => remove(r.id, r.fullName)}><Trash2 size={13} /></IconButton>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
        <PagerFooter page={page} total={total} limit={limit} onPage={setPage} />
      </Card>
    </div>
  )
}
// ── Section: Manage Users [super_admin] ──────────────────────────────────────

const USER_ROLES = [
  { key: 'super_admin',      label: 'Super Admins',  statuses: ['pending', 'active', 'suspended'] },
  { key: 'district_admin',   label: 'District Admins', statuses: ['pending', 'active', 'suspended'] },
  { key: 'village_officer',  label: 'Village Officers', statuses: ['pending', 'active', 'offline', 'suspended'] },
  { key: 'hospital_officer', label: 'Health Officers', statuses: ['pending', 'active', 'offline', 'suspended'] },
  { key: 'public_user',      label: 'Public Users', statuses: ['active', 'suspended'] },
]

function ManageUsersSection({ currentUserId }) {
  const [tab, setTab] = useState('district_admin')
  const [data, setData] = useState({})
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    api.apiGetUsers({ q })
      .then(r => setData(r.data || {}))
      .catch(err => console.error('[users]', err))
      .finally(() => setLoading(false))
  }, [q])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  const roleDef = USER_ROLES.find(r => r.key === tab)
  const rows = data[tab] || []

  async function setRowStatus(id, newStatus) {
    try { await api.apiUpdateUserStatus(tab, id, newStatus); load() }
    catch (err) { alert(err.response?.data?.message || 'Update failed') }
  }
  async function remove(id, name) {
    if (!window.confirm(`Delete user "${name}"? This cannot be undone.`)) return
    try { await api.apiDeleteUser(tab, id); load() }
    catch (err) { alert(err.response?.data?.message || 'Delete failed') }
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
                    <IconButton title="Delete" danger
                      onClick={() => remove(r.id, r.fullName || r.displayName)}
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

      <Card>
        <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3">Table Record Counts</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {Object.entries(perf?.tableCounts || {}).map(([k, v]) => (
            <div key={k} className="bg-[#060f1e] border border-[#1a3060] rounded-lg p-3 text-center">
              <p className="text-gray-500 text-[10px] uppercase tracking-wider">{k}</p>
              <p className="text-white font-bold text-lg">{v.toLocaleString()}</p>
            </div>
          ))}
        </div>
      </Card>

      <button onClick={load} className="flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-[#00d4ff] border border-[#1a3060] px-3 py-1.5 rounded-lg">
        <RefreshCw size={12} /> Re-run health check
      </button>
    </div>
  )
}

// ── Section: Migrations ──────────────────────────────────────────────────────

function MigrationsSection() {
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('all')
  const [loading, setLoading] = useState(true)
  const limit = 10

  const load = useCallback(() => {
    setLoading(true)
    api.apiGetMigrations({ page, limit, ...(status !== 'all' ? { status } : {}) })
      .then(r => { setRows(r.data || []); setTotal(r.total || 0) })
      .catch(err => console.error('[migrations]', err))
      .finally(() => setLoading(false))
  }, [page, status])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <ArrowLeftRight size={14} className="text-[#00d4ff]" />
        <StatusSelect value={status} options={['all', 'pending', 'confirmed', 'cancelled', 'expired']} onChange={v => { setPage(1); setStatus(v) }} />
      </div>

      <Card className="p-0 overflow-x-auto">
        <table className="w-full">
          <thead><tr className="border-b border-[#1a3060]">
            <Th>Citizen</Th><Th>From</Th><Th>To</Th><Th>Reason</Th><Th>Status</Th><Th>Requested</Th>
          </tr></thead>
          <tbody>
            {loading && <LoadingState colSpan={6} />}
            {!loading && rows.length === 0 && <EmptyState colSpan={6} />}
            {!loading && rows.map(m => (
              <tr key={m.id} className="border-b border-[#1a3060]/50 hover:bg-white/[0.02]">
                <Td className="text-white font-medium">{m.citizen ? `${m.citizen.firstName} ${m.citizen.surname}` : '—'}</Td>
                <Td>{m.fromVillage?.name || '—'}</Td>
                <Td>{m.toVillage?.name || '—'}</Td>
                <Td className="truncate max-w-[160px]">{m.reason}</Td>
                <Td><StatusPill status={m.status === 'confirmed' ? 'active' : (m.status === 'pending' ? 'pending' : 'suspended')} /></Td>
                <Td>{new Date(m.requestDate).toLocaleDateString('en-TZ')}</Td>
              </tr>
            ))}
          </tbody>
        </table>
        <PagerFooter page={page} total={total} limit={limit} onPage={setPage} />
      </Card>
    </div>
  )
}

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
  const [deleting, setDeleting] = useState(false)

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
  useEffect(() => { load(filters) }, [filters, load])

  const handleDelete = async () => {
    if (!window.confirm('Delete ALL birth records? This cannot be undone. Test parent citizens will be preserved.')) return
    setDeleting(true)
    try {
      const r = await api.apiDeleteBirths()
      alert(r.message || 'Births deleted')
      load(filters)
    } catch(e) { alert('Failed: ' + e.message) }
    finally { setDeleting(false) }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-white font-bold text-lg">RITA — Registration Trends</h2>
        {role === 'super_admin' && (
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-bold px-3 py-2 rounded-lg transition-colors"
          >
            <Trash2 size={13} />
            {deleting ? 'Deleting…' : 'Clear All Births (Test Reset)'}
          </button>
        )}
      </div>
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
            <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3">Birth Registrations — Monthly Trend</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data?.births || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a3060" />
                <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <Tooltip contentStyle={{ backgroundColor: '#0a1628', border: '1px solid #1a3060', fontSize: 11 }} />
                <Bar dataKey="count" fill="#3b82f6" name="Births" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          {/* Deaths trend */}
          <Card>
            <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3">Death Registrations — Monthly Trend</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data?.deaths || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a3060" />
                <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <Tooltip contentStyle={{ backgroundColor: '#0a1628', border: '1px solid #1a3060', fontSize: 11 }} />
                <Bar dataKey="count" fill="#ef4444" name="Deaths" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          {/* Marriages trend */}
          <Card>
            <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3">Marriage Registrations — Monthly Trend</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data?.marriages || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a3060" />
                <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 10 }} />
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
  useEffect(() => { load(filters) }, [filters, load])

  return (
    <div className="space-y-4">
      <h2 className="text-white font-bold text-lg">NIDA — NIN Issuance Trends</h2>
      <GeoFilterBar onChange={f => setFilters(f)} scoped={role === 'district_admin'} />

      {loading ? (
        <Card><p className="text-gray-500 text-xs py-8 text-center"><RefreshCw size={14} className="inline animate-spin mr-2" />Loading NIDA data…</p></Card>
      ) : (
        <>
          <StatCard Icon={UserCheck} label="Total NIDs Issued" value={(data?.total ?? 0).toLocaleString()} accent="text-[#00d4ff]" />
          <Card>
            <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3">NIN Issuances — Monthly Trend</p>
            {data?.ninIssuances?.length ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data.ninIssuances}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a3060" />
                  <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 10 }} />
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

const NAV = [
  { key: 'dashboard',           label: 'Dashboard',            Icon: LayoutDashboard, roles: ['super_admin', 'district_admin'] },
  { key: 'demographics',        label: 'Demographics',         Icon: MapIcon,         roles: ['super_admin', 'district_admin'] },
  { key: 'district_admins',     label: 'District Admins',      Icon: Landmark,        roles: ['super_admin'] },
  { key: 'village_officers',    label: 'Village Officers',     Icon: Users,           roles: ['super_admin', 'district_admin'] },
  { key: 'health_officers',     label: 'Health Officers',      Icon: Stethoscope,     roles: ['super_admin', 'district_admin'] },
  { key: 'manage_users',        label: 'Manage Users',         Icon: Shield,          roles: ['super_admin'] },
  { key: 'migrations',          label: 'Migration Trends',     Icon: ArrowLeftRight,  roles: ['super_admin', 'district_admin'] },
  { key: 'marriages',           label: 'Marriage Records',     Icon: Heart,           roles: ['super_admin', 'district_admin'] },
  { key: 'audit_logs',          label: 'System Log Reports',   Icon: FileText,        roles: ['super_admin', 'district_admin'] },
  { key: 'security_alerts',     label: 'Security Alerts',      Icon: ShieldAlert,     roles: ['super_admin', 'district_admin'] },
  { key: 'system_performance',  label: 'System Performance',   Icon: Cpu,             roles: ['super_admin'] },
  { key: 'rita',               label: 'RITA',                 Icon: FileText,        roles: ['super_admin', 'district_admin'] },
  { key: 'nida',               label: 'NIDA',                 Icon: Shield,          roles: ['super_admin', 'district_admin'] },
]

const SECTION_TITLE = {
  dashboard: 'Dashboard', demographics: 'Demographics View', district_admins: 'District Admins',
  village_officers: 'Village Officers', health_officers: 'Health Officers', manage_users: 'Manage Users',
  migrations: 'Migration Trends', marriages: 'Marriage Records', audit_logs: 'System Log Reports',
  security_alerts: 'Security Alerts', system_performance: 'System Performance',
}

// ── Main component ───────────────────────────────────────────────────────────

export default function AdminDashboard({ role }) {
  const navigate = useNavigate()
  const { user, clearAuth } = useAuthStore()

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [activeNav,   setActiveNav]   = useState('dashboard')
  const [showChangePwd, setShowChangePwd] = useState(false)
  const [showNewReg,    setShowNewReg]    = useState(false)
  const [loggingOut,    setLoggingOut]    = useState(false)

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
      case 'manage_users':        return <ManageUsersSection currentUserId={user?.id} />
      case 'migrations':          return <MigrationsSection />
      case 'marriages':           return <MarriagesSection />
      case 'audit_logs':          return <AuditLogsSection />
      case 'security_alerts':     return <AuditLogsSection securityOnly />
      case 'system_performance':  return <SystemPerformanceSection />
      case 'rita':               return <RITASection role={role} />
      case 'nida':               return <NIDASection role={role} />
      default:                    return null
    }
  }

  const roleLabel = role === 'super_admin' ? 'Super Administrator' : 'District Administrator'

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
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-white font-bold text-lg">{SECTION_TITLE[activeNav]}</h1>
              <p className="text-gray-500 text-xs">
                {user?.fullName || user?.email} · {roleLabel}
              </p>
            </div>
          </div>
          {renderSection()}
        </main>
      </div>

      {showChangePwd && <ChangePasswordModal onClose={() => setShowChangePwd(false)} />}
      {showNewReg && (
        <NewRegistrationModal
          role={role}
          defaultTarget={activeNav === 'health_officers' ? 'hospital_officer' : activeNav === 'village_officers' ? 'village_officer' : undefined}
          onClose={() => setShowNewReg(false)}
        />
      )}
    </div>
  )
}
