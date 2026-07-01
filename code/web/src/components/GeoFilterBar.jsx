/**
 * GeoFilterBar.jsx — Region → District → Ward → Village cascading filter
 *
 * Backed by /api/admin/geo/* endpoints (live Supabase data — not the static
 * tanzania.js list), so the IDs returned match real Region/District/Ward/
 * Village rows and can be passed straight back to the other admin endpoints
 * as regionId / districtId / wardId / villageId query params.
 */

import { useEffect, useState } from 'react'
import { MapPin, X } from 'lucide-react'
import { apiGetRegions, apiGetDistricts, apiGetWards, apiGetVillages } from '../api/admin.api'

export default function GeoFilterBar({ onChange, scoped = false }) {
  const [regions,   setRegions]   = useState([])
  const [districts, setDistricts] = useState([])
  const [wards,     setWards]     = useState([])
  const [villages,  setVillages]  = useState([])

  const [regionId,   setRegionId]   = useState('')
  const [districtId, setDistrictId] = useState('')
  const [wardId,     setWardId]     = useState('')
  const [villageId,  setVillageId]  = useState('')

  useEffect(() => {
    if (scoped) return
    apiGetRegions().then(r => setRegions(r.data || [])).catch(() => setRegions([]))
  }, [scoped])

  // PATCH-9: scoped (district_admin) mode skips Region/District entirely —
  // fetch wards for the caller's own district directly. The backend
  // auto-scopes /admin/geo/wards to the requester's district when no
  // districtId is supplied and the caller is a district_admin.
  useEffect(() => {
    if (!scoped) return
    apiGetWards().then(r => setWards(r.data || [])).catch(() => setWards([]))
  }, [scoped])

  // Cascade: when regionId changes, fetch districts (or clear list).
  useEffect(() => {
    const fetch = regionId
      ? apiGetDistricts(regionId).then(r => r.data || [])
      : Promise.resolve([])
    fetch
      .then(data => { setDistricts(data); if (!regionId) setDistrictId('') })
      .catch(() => setDistricts([]))
  }, [regionId])  

  // Cascade: when districtId changes, fetch wards (or clear list).
  useEffect(() => {
    const fetch = districtId
      ? apiGetWards(districtId).then(r => r.data || [])
      : Promise.resolve([])
    fetch
      .then(data => { setWards(data); if (!districtId) setWardId('') })
      .catch(() => setWards([]))
  }, [districtId])  

  // Cascade: when wardId changes, fetch villages (or clear list).
  useEffect(() => {
    const fetch = wardId
      ? apiGetVillages(wardId).then(r => r.data || [])
      : Promise.resolve([])
    fetch
      .then(data => { setVillages(data); if (!wardId) setVillageId('') })
      .catch(() => setVillages([]))
  }, [wardId])  

  useEffect(() => {
    onChange?.({ regionId, districtId, wardId, villageId })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regionId, districtId, wardId, villageId])

  function reset() {
    setRegionId(''); setDistrictId(''); setWardId(''); setVillageId('')
  }

  const sel = 'bg-[#0a1628] border border-[#1a3060] rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-[#00d4ff]/50 transition-colors disabled:opacity-40'

  if (scoped) {
    // PATCH-9: district admins get a real two-tier filter — Ward, then
    // Village/Street (populated once a ward is selected) — scoped to
    // their own district, instead of a static read-only label.
    return (
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <MapPin size={14} className="text-[#00d4ff] shrink-0" />
        <span className="text-xs text-gray-500 shrink-0">Your district</span>
        <select className={sel} value={wardId} onChange={e => setWardId(e.target.value)}>
          <option value="">All Wards</option>
          {wards.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <select className={sel} value={villageId} onChange={e => setVillageId(e.target.value)} disabled={!wardId}>
          <option value="">All Villages / Streets</option>
          {villages.map(v => (
            <option key={v.id} value={v.id}>{v.name}{v.type === 'street' ? ' (Street)' : ''}</option>
          ))}
        </select>
        {(wardId || villageId) && (
          <button onClick={reset} className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-red-300">
            <X size={12} /> Clear
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      <MapPin size={14} className="text-[#00d4ff] shrink-0" />
      <select className={sel} value={regionId} onChange={e => setRegionId(e.target.value)}>
        <option value="">All Regions</option>
        {regions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
      </select>
      <select className={sel} value={districtId} onChange={e => setDistrictId(e.target.value)} disabled={!regionId}>
        <option value="">All Districts</option>
        {districts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
      </select>
      <select className={sel} value={wardId} onChange={e => setWardId(e.target.value)} disabled={!districtId}>
        <option value="">All Wards</option>
        {wards.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
      </select>
      <select className={sel} value={villageId} onChange={e => setVillageId(e.target.value)} disabled={!wardId}>
        <option value="">All Villages</option>
        {villages.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
      </select>
      {(regionId || districtId || wardId || villageId) && (
        <button onClick={reset} className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-red-300">
          <X size={12} /> Clear
        </button>
      )}
    </div>
  )
}
