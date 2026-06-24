/**
 * NewRegistrationModal.jsx — Register a new admin / officer account
 *
 * Super Admin → registers a District Admin (POST /api/admin/district-admins)
 * District Admin → registers a Village Officer or Health Officer
 *                   (POST /api/admin/village-officers | /health-officers)
 *
 * On success the server returns a one-time authorization token
 * (e.g. DADM-1234-5678) which the new user enters on first login.
 */

import { useState, useEffect } from 'react'
import { X, RefreshCw, CheckCircle, AlertCircle, Copy } from 'lucide-react'
import {
  apiCreateDistrictAdmin, apiCreateVillageOfficer, apiCreateHealthOfficer,
  apiGetRegions, apiGetDistricts, apiGetWards, apiGetVillages,
} from '../api/admin.api'

export default function NewRegistrationModal({ role, onClose, defaultTarget }) {
  const isSuperAdmin = role === 'super_admin'
  const [target, setTarget] = useState(defaultTarget || (isSuperAdmin ? 'district_admin' : 'village_officer'))

  const [form, setForm] = useState({
    fullName: '', email: '', nidaNumber: '', employeeId: '', mobile: '',
    regionId: '', districtId: '', wardId: '', villageId: '',
  })
  const [regions,   setRegions]   = useState([])
  const [districts, setDistricts] = useState([])
  const [wards,     setWards]     = useState([])
  const [villages,  setVillages]  = useState([])

  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [result,  setResult]  = useState(null)
  const [copied,  setCopied]  = useState(false)

  const set = (field, val) => setForm(p => ({ ...p, [field]: val }))

  useEffect(() => {
    if (isSuperAdmin) apiGetRegions().then(r => setRegions(r.data || [])).catch(() => {})
  }, [isSuperAdmin])

  useEffect(() => {
    const fetch = form.regionId
      ? apiGetDistricts(form.regionId).then(r => r.data || [])
      : Promise.resolve([])
    fetch.then(data => setDistricts(data)).catch(() => {})
  }, [form.regionId])  

  useEffect(() => {
    const fetch = form.districtId
      ? apiGetWards(form.districtId).then(r => r.data || [])
      : Promise.resolve([])
    fetch.then(data => setWards(data)).catch(() => {})
  }, [form.districtId])  

  useEffect(() => {
    const fetch = form.wardId
      ? apiGetVillages(form.wardId).then(r => r.data || [])
      : Promise.resolve([])
    fetch.then(data => setVillages(data)).catch(() => {})
  }, [form.wardId])  

  async function handleSubmit() {
    if (!form.fullName || !form.email || !form.nidaNumber || !form.employeeId) {
      setError('Full name, email, NIDA number and employee ID are required'); return
    }
    setError(''); setLoading(true)
    try {
      let res
      if (target === 'district_admin') {
        res = await apiCreateDistrictAdmin({
          fullName: form.fullName, email: form.email, nidaNumber: form.nidaNumber,
          employeeId: form.employeeId, mobile: form.mobile,
          regionId: form.regionId || undefined, districtId: form.districtId || undefined,
        })
      } else if (target === 'village_officer') {
        res = await apiCreateVillageOfficer({
          fullName: form.fullName, email: form.email, nidaNumber: form.nidaNumber,
          employeeId: form.employeeId, mobile: form.mobile,
          wardId: form.wardId || undefined, villageId: form.villageId || undefined,
        })
      } else {
        res = await apiCreateHealthOfficer({
          fullName: form.fullName, email: form.email, nidaNumber: form.nidaNumber,
          employeeId: form.employeeId, mobile: form.mobile,
        })
      }
      setResult(res.data)
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  function copyToken() {
    if (!result?.authToken) return
    navigator.clipboard.writeText(result.authToken).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 1500)
    })
  }

  const inp = 'w-full bg-[#060f1e] border border-[#1e3a5f] rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-700 outline-none focus:border-[#00d4ff]/50 transition-colors'
  const sel = 'w-full bg-[#060f1e] border border-[#1e3a5f] rounded-lg px-4 py-2.5 text-sm text-white outline-none focus:border-[#00d4ff]/50 transition-colors disabled:opacity-40'
  const lbl = 'text-[10px] text-gray-400 uppercase tracking-widest mb-1.5 block'

  const tabs = isSuperAdmin
    ? [{ key: 'district_admin', label: 'District Admin' }]
    : [
        { key: 'village_officer',  label: 'Village Officer' },
        { key: 'hospital_officer', label: 'Health Officer' },
      ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto">
      <div className="bg-[#0d1f38] border border-[#1e3a5f] rounded-2xl shadow-2xl w-full max-w-md my-8 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1a3060]">
          <h3 className="text-white font-bold text-sm">New Registration</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={18} /></button>
        </div>

        {result ? (
          <div className="p-6 space-y-4 text-center">
            <CheckCircle size={36} className="text-[#00ff9d] mx-auto" />
            <p className="text-white font-bold text-sm">{result.fullName} registered</p>
            <p className="text-gray-500 text-xs">
              Status: <span className="text-yellow-400 uppercase">{result.status}</span> — share this one-time
              authorization token so they can complete their profile on first login.
            </p>
            <div
              onClick={copyToken}
              className="flex items-center gap-2 bg-[#0a1628] border border-[#1a3060] rounded-lg px-3 py-2 cursor-pointer hover:border-[#00d4ff]/40 transition-colors"
            >
              <code className="text-[#00d4ff] text-sm font-mono flex-1 tracking-widest">{result.authToken}</code>
              <Copy size={13} className="text-gray-500" />
              {copied && <span className="text-[#00ff9d] text-[10px]">Copied</span>}
            </div>
            <button
              onClick={onClose}
              className="w-full py-2.5 rounded-xl font-bold text-sm bg-gradient-to-r from-[#00d4ff] to-[#0088bb] text-[#060f1e] hover:opacity-90 transition-all"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="p-6 space-y-4">
            {tabs.length > 1 && (
              <div className="flex gap-2">
                {tabs.map(tb => (
                  <button
                    key={tb.key}
                    onClick={() => setTarget(tb.key)}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-all ${
                      target === tb.key
                        ? 'bg-[#00d4ff]/10 border-[#00d4ff]/40 text-[#00d4ff]'
                        : 'border-[#1e3a5f] text-gray-500 hover:border-[#2a4060]'
                    }`}
                  >
                    {tb.label}
                  </button>
                ))}
              </div>
            )}

            <div>
              <label className={lbl}>Full Name</label>
              <input className={inp} value={form.fullName} onChange={e => set('fullName', e.target.value)} placeholder="Jane Doe" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Email</label>
                <input className={inp} type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="name@nbs.go.tz" />
              </div>
              <div>
                <label className={lbl}>Mobile</label>
                <input className={inp} value={form.mobile} onChange={e => set('mobile', e.target.value)} placeholder="+255 7XX XXX XXX" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>NIDA Number</label>
                <input className={inp} value={form.nidaNumber} onChange={e => set('nidaNumber', e.target.value)} placeholder="19900101-07001-00001-21" />
              </div>
              <div>
                <label className={lbl}>Employee ID</label>
                <input className={inp} value={form.employeeId} onChange={e => set('employeeId', e.target.value)} placeholder="NBS-0001" />
              </div>
            </div>

            {target === 'district_admin' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>Region</label>
                  <select className={sel} value={form.regionId} onChange={e => { set('regionId', e.target.value); set('districtId', '') }}>
                    <option value="">Select region</option>
                    {regions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={lbl}>District</label>
                  <select className={sel} value={form.districtId} onChange={e => set('districtId', e.target.value)} disabled={!form.regionId}>
                    <option value="">Select district</option>
                    {districts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
              </div>
            )}

            {target === 'village_officer' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>Ward</label>
                  <select className={sel} value={form.wardId} onChange={e => { set('wardId', e.target.value); set('villageId', '') }}>
                    <option value="">Select ward</option>
                    {wards.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={lbl}>Village</label>
                  <select className={sel} value={form.villageId} onChange={e => set('villageId', e.target.value)} disabled={!form.wardId}>
                    <option value="">Select village</option>
                    {villages.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
              </div>
            )}

            {error && (
              <p className="text-red-400 text-[10px] flex items-center gap-1">
                <AlertCircle size={10} />{error}
              </p>
            )}

            <button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full py-2.5 rounded-xl font-bold text-sm bg-gradient-to-r from-[#00ff9d] to-[#00bb6e] text-[#060f1e] flex items-center justify-center gap-2 hover:opacity-90 transition-all disabled:opacity-50"
            >
              {loading ? <RefreshCw size={15} className="animate-spin" /> : 'Register'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
