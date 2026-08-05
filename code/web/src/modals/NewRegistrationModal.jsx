/**
 * NewRegistrationModal.jsx — register a new admin or officer account
 *
 * PATCH-ADMINREG-2026: one unified, BID-driven form.
 *
 *  - defaultTarget === undefined  → opened from the "Add New Admin" button
 *    on Manage Users. Shows a Scope dropdown (National / District); picking
 *    District reveals Region + District pickers.
 *  - defaultTarget === 'village_officer' | 'hospital_officer' → opened from
 *    their own screens. No Scope dropdown; Village Officer keeps the
 *    Region → District → Ward → Village cascade (with "add a new village"
 *    inline); Hospital Officer gets a free-text Facility Name field (the
 *    backend finds-or-creates the facility — there was no facility field
 *    wired up here before at all).
 *
 * Every variant starts with a Birth ID (BID) search: the person's identity
 * (name, gender, NIN, village) is pulled from the citizen registry and
 * shown in a confirmation card. Nothing else on the form is editable until
 * that's confirmed — there's no free-typed "Full Name" field any more.
 *
 * On success the account is already ACTIVE with the default password shown
 * below (pre-filled `Admin@1234`, editable) — share it with the new user
 * directly. A welcome email is also sent as a courtesy notice.
 */
import { useState, useEffect } from 'react'
import { X, RefreshCw, CheckCircle, AlertCircle, Copy, Search, Plus } from 'lucide-react'
import {
  apiCreateSuperAdmin,
  apiCreateDistrictAdmin,
  apiCreateVillageOfficer,
  apiCreateHealthOfficer,
  apiLookupCitizenByBID,
  apiGetRegions,
  apiGetDistricts,
  apiGetWards,
  apiGetVillages,
  apiCreateVillage,
} from '../api/admin.api'

const TARGET_LABEL = {
  super_admin:      'National Admin',
  district_admin:   'District Admin',
  village_officer:  'Village Officer',
  hospital_officer: 'Hospital Officer',
}

export default function NewRegistrationModal({ defaultTarget, onClose }) {
  const unifiedAdminFlow = !defaultTarget
  const [target, setTarget] = useState(defaultTarget || 'super_admin')

  // ── BID search / identity confirmation ───────────────────────────────────
  const [bidQuery, setBidQuery]       = useState('')
  const [bidSearching, setBidSearching] = useState(false)
  const [citizenMatch, setCitizenMatch] = useState(null) // null | 'not_found' | {..}
  const [confirmed, setConfirmed]     = useState(false)

  // ── Rest of the form ─────────────────────────────────────────────────────
  const [form, setForm] = useState({
    email: '', mobile: '', department: '',
    password: 'Admin@1234',
    regionId: '', districtId: '', wardId: '', villageId: '',
    facilityName: '',
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // ── Geo cascade (District Admin scope + Village Officer) ─────────────────
  const [regions, setRegions]     = useState([])
  const [districts, setDistricts] = useState([])
  const [wards, setWards]         = useState([])
  const [villages, setVillages]   = useState([])
  const [addingVillage, setAddingVillage] = useState(false)
  const [newVillageName, setNewVillageName] = useState('')

  const needsGeo = target === 'district_admin' || target === 'village_officer'

  useEffect(() => {
    if (needsGeo) apiGetRegions().then(r => setRegions(r.data || [])).catch(() => {})
  }, [needsGeo])

  async function handleRegionChange(regionId) {
    set('regionId', regionId); set('districtId', ''); set('wardId', ''); set('villageId', '')
    setDistricts([]); setWards([]); setVillages([])
    if (regionId) {
      const r = await apiGetDistricts(regionId).catch(() => ({ data: [] }))
      setDistricts(r.data || [])
    }
  }
  async function handleDistrictChange(districtId) {
    set('districtId', districtId); set('wardId', ''); set('villageId', '')
    setWards([]); setVillages([])
    if (districtId && target === 'village_officer') {
      const r = await apiGetWards(districtId).catch(() => ({ data: [] }))
      setWards(r.data || [])
    }
  }
  async function handleWardChange(wardId) {
    set('wardId', wardId); set('villageId', '')
    setVillages([])
    if (wardId) {
      const r = await apiGetVillages(wardId).catch(() => ({ data: [] }))
      setVillages(r.data || [])
    }
  }
  async function handleAddVillage() {
    if (!newVillageName.trim() || !form.wardId) return
    try {
      const r = await apiCreateVillage(form.wardId, newVillageName.trim())
      setVillages(v => [...v, r.data])
      set('villageId', r.data.id)
      setAddingVillage(false); setNewVillageName('')
    } catch (err) {
      setError(err.response?.data?.message || 'Could not add village')
    }
  }

  // ── Submission state ──────────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]   = useState('')
  const [result, setResult] = useState(null)
  const [copied, setCopied] = useState(false)

  async function handleBidSearch() {
    const bid = bidQuery.trim()
    if (!bid) return
    setBidSearching(true); setCitizenMatch(null); setConfirmed(false); setError('')
    try {
      const res = await apiLookupCitizenByBID(bid)
      setCitizenMatch(res.data)
    } catch {
      setCitizenMatch('not_found')
    } finally {
      setBidSearching(false)
    }
  }

  async function handleSubmit() {
    setError('')
    if (!confirmed || !citizenMatch || citizenMatch === 'not_found') {
      setError('Search for and confirm the Birth ID first.'); return
    }
    if (!form.email) {
      setError('Email is required.'); return
    }
    if (target === 'district_admin' && (!form.regionId || !form.districtId)) {
      setError('Region and District are required for a District Admin.'); return
    }
    if (target === 'village_officer' && !form.villageId) {
      setError('Village is required for a Village Officer.'); return
    }

    setSubmitting(true)
    try {
      const base = {
        fullName:   citizenMatch.fullName,
        birthId:    citizenMatch.birthId,
        citizenId:  citizenMatch.id,
        email:      form.email,
        mobile:     form.mobile,
        password:   form.password,
      }
      let res
      if (target === 'super_admin') {
        res = await apiCreateSuperAdmin({ ...base, department: form.department || undefined })
      } else if (target === 'district_admin') {
        res = await apiCreateDistrictAdmin({ ...base, regionId: form.regionId, districtId: form.districtId })
      } else if (target === 'village_officer') {
        res = await apiCreateVillageOfficer({ ...base, wardId: form.wardId || undefined, villageId: form.villageId })
      } else {
        res = await apiCreateHealthOfficer({ ...base, facilityName: form.facilityName || undefined })
      }
      setResult(res.data)
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed')
    } finally {
      setSubmitting(false)
    }
  }

  function copyPassword() {
    if (!result?.defaultPassword) return
    navigator.clipboard.writeText(result.defaultPassword).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 1500)
    })
  }

  const inp = 'w-full bg-[#0a1628] border border-[#1a3060] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 outline-none focus:border-[#00d4ff]/50 transition-colors'
  const lbl = 'text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 block'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-[#0d1f38] border border-[#1e3a5f] rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1a3060] sticky top-0 bg-[#0d1f38]">
          <h3 className="text-white font-bold text-sm">
            {result ? 'Account Created' : `Register ${TARGET_LABEL[target]}`}
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={18} /></button>
        </div>

        {!result ? (
          <div className="p-5 space-y-4">
            {unifiedAdminFlow && (
              <div>
                <label className={lbl}>Scope</label>
                <select className={inp} value={target} onChange={e => setTarget(e.target.value)}>
                  <option value="super_admin">National</option>
                  <option value="district_admin">District</option>
                </select>
              </div>
            )}

            {/* ── Birth ID search ──────────────────────────────────────────── */}
            <div>
              <label className={lbl}>Birth ID (BID) *</label>
              <div className="flex gap-2">
                <input
                  className={`${inp} flex-1`}
                  value={bidQuery}
                  onChange={e => { setBidQuery(e.target.value.toUpperCase()); setCitizenMatch(null); setConfirmed(false) }}
                  placeholder="BID-7F3K9QXTZ2"
                />
                <button
                  type="button"
                  onClick={handleBidSearch}
                  disabled={bidSearching || !bidQuery.trim()}
                  className="px-3 py-2 rounded-lg bg-[#00d4ff]/10 border border-[#00d4ff]/30 text-[#00d4ff] text-xs font-bold hover:bg-[#00d4ff]/20 disabled:opacity-40 flex items-center gap-1.5 shrink-0"
                >
                  {bidSearching ? <RefreshCw size={13} className="animate-spin" /> : <Search size={13} />}
                  Search
                </button>
              </div>
            </div>

            {citizenMatch === 'not_found' && (
              <p className="text-red-400 text-[11px] flex items-center gap-1">
                <AlertCircle size={11} /> No citizen found with this Birth ID. Double-check and try again.
              </p>
            )}

            {citizenMatch && citizenMatch !== 'not_found' && (
              <div className="p-3 rounded-lg border border-[#00ff9d]/30 bg-[#00ff9d]/5 space-y-1.5">
                <p className="text-[#00ff9d] text-xs font-bold flex items-center gap-1.5">
                  <CheckCircle size={13} /> Citizen Found
                </p>
                <p className="text-white text-sm font-semibold">{citizenMatch.fullName}</p>
                <p className="text-gray-400 text-[11px]">
                  {[
                    citizenMatch.gender || null,
                    citizenMatch.nationalId ? `NIN: ${citizenMatch.nationalId}` : null,
                    citizenMatch.currentVillage?.name || citizenMatch.village || null,
                    citizenMatch.currentVillage?.ward?.district?.name || citizenMatch.district || null,
                  ].filter(Boolean).join(' · ')}
                </p>
                {!confirmed && (
                  <button
                    type="button"
                    onClick={() => setConfirmed(true)}
                    className="mt-1 w-full py-1.5 rounded-lg text-xs font-bold bg-[#00ff9d]/15 border border-[#00ff9d]/40 text-[#00ff9d] hover:bg-[#00ff9d]/25"
                  >
                    Confirm &amp; Continue
                  </button>
                )}
              </div>
            )}

            {/* ── Rest of the form only appears once BID is confirmed ─────── */}
            {confirmed && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={lbl}>Email</label>
                    <input className={inp} type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="name@nbs.go.tz" />
                  </div>
                  <div>
                    <label className={lbl}>Phone Number</label>
                    <input className={inp} value={form.mobile} onChange={e => set('mobile', e.target.value)} placeholder="+255 7XX XXX XXX" />
                  </div>
                </div>

                {target === 'district_admin' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={lbl}>Region</label>
                      <select className={inp} value={form.regionId} onChange={e => handleRegionChange(e.target.value)}>
                        <option value="">Select region…</option>
                        {regions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={lbl}>District</label>
                      <select className={inp} value={form.districtId} disabled={!form.regionId} onChange={e => set('districtId', e.target.value)}>
                        <option value="">Select district…</option>
                        {districts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                    </div>
                  </div>
                )}

                {target === 'village_officer' && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={lbl}>Region</label>
                        <select className={inp} value={form.regionId} onChange={e => handleRegionChange(e.target.value)}>
                          <option value="">Select region…</option>
                          {regions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={lbl}>District</label>
                        <select className={inp} value={form.districtId} disabled={!form.regionId} onChange={e => handleDistrictChange(e.target.value)}>
                          <option value="">Select district…</option>
                          {districts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={lbl}>Ward</label>
                        <select className={inp} value={form.wardId} disabled={!form.districtId} onChange={e => handleWardChange(e.target.value)}>
                          <option value="">Select ward…</option>
                          {wards.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={lbl}>Village / Street</label>
                        <select className={inp} value={form.villageId} disabled={!form.wardId} onChange={e => set('villageId', e.target.value)}>
                          <option value="">Select village…</option>
                          {villages.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                        </select>
                      </div>
                    </div>
                    {form.wardId && !addingVillage && (
                      <button type="button" onClick={() => setAddingVillage(true)} className="text-[11px] text-[#00d4ff] flex items-center gap-1">
                        <Plus size={12} /> Village/street not listed? Add new
                      </button>
                    )}
                    {addingVillage && (
                      <div className="flex gap-2">
                        <input className={`${inp} flex-1`} value={newVillageName} onChange={e => setNewVillageName(e.target.value)} placeholder="New village/street name" />
                        <button type="button" onClick={handleAddVillage} className="px-3 py-2 rounded-lg bg-[#00d4ff]/10 border border-[#00d4ff]/30 text-[#00d4ff] text-xs font-bold">Add</button>
                      </div>
                    )}
                  </>
                )}

                {target === 'hospital_officer' && (
                  <div>
                    <label className={lbl}>Facility Name</label>
                    <input className={inp} value={form.facilityName} onChange={e => set('facilityName', e.target.value)} placeholder="e.g. Mufindi District Hospital" />
                    <p className="text-[10px] text-gray-500 mt-1">Region/District are assigned automatically, matching your own account's district.</p>
                  </div>
                )}

                {/* PATCH-DISTRICTADMIN-DEPT-FIX-2026: District Admin has no
                    `department` column in this schema — only National Admin does. */}
                {target === 'super_admin' && (
                  <div>
                    <label className={lbl}>Department (optional)</label>
                    <input className={inp} value={form.department} onChange={e => set('department', e.target.value)}
                      placeholder="e.g. Statistics & Data Management" />
                  </div>
                )}

                <div>
                  <label className={lbl}>Default Password</label>
                  <input className={inp} value={form.password} onChange={e => set('password', e.target.value)} />
                </div>
              </>
            )}

            {error && (
              <p className="text-red-400 text-[11px] flex items-center gap-1"><AlertCircle size={11} />{error}</p>
            )}

            {confirmed && (
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full py-2.5 rounded-lg font-bold text-sm bg-gradient-to-r from-[#00d4ff] to-[#0088bb] text-[#060f1e] flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {submitting ? <RefreshCw size={15} className="animate-spin" /> : 'Register'}
              </button>
            )}
          </div>
        ) : (
          <div className="p-5 space-y-3">
            <p className="text-[#00ff9d] text-sm font-bold flex items-center gap-2"><CheckCircle size={16} /> {result.fullName} registered successfully</p>
            <p className="text-gray-500 text-xs">
              Status: <span className="text-[#00ff9d] uppercase">{result.status}</span> — share this default
              password with them directly. They can log in right away with their email and this password,
              and should change it within 3 days.
            </p>
            {/* PATCH-EMAIL-VISIBILITY-2026: show the real outcome instead of an
                unconditional claim the email went out. */}
            {result.emailSent ? (
              <p className="text-[#00ff9d] text-xs">✓ Confirmation email sent to {result.email}.</p>
            ) : (
              <p className="text-[#ffb020] text-xs">
                ⚠ Confirmation email did NOT send{result.emailError ? `: ${result.emailError}` : '.'} Share the
                password with them directly.
              </p>
            )}
            <div
              onClick={copyPassword}
              className="flex items-center gap-2 bg-[#0a1628] border border-[#1a3060] rounded-lg px-3 py-2 cursor-pointer hover:border-[#00d4ff]/40 transition-colors"
            >
              <code className="text-[#00d4ff] text-sm font-mono flex-1 tracking-widest">{result.defaultPassword}</code>
              <Copy size={13} className="text-gray-500" />
              {copied && <span className="text-[#00ff9d] text-[10px]">Copied</span>}
            </div>
            <button onClick={onClose} className="w-full py-2.5 rounded-lg font-bold text-sm bg-[#00d4ff]/10 border border-[#00d4ff]/30 text-[#00d4ff]">
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
