/**
 * YearMonthFilter.jsx — Year + Month picker for the RITA / NIDA / Migration
 * Trends cards (PATCH-WEEKLYTRENDS-2026).
 *
 * The charts below each of these cards show Week 1..Week 5 of whichever
 * month/year is selected here (defaulting to the current month).
 */
import { useEffect, useState } from 'react'
import { Calendar } from 'lucide-react'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export default function YearMonthFilter({ onChange }) {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)

  useEffect(() => {
    onChange?.({ year, month })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month])

  const years = []
  for (let y = now.getFullYear(); y >= now.getFullYear() - 5; y--) years.push(y)

  const sel = 'bg-[#0a1628] border border-[#1a3060] rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-[#00d4ff]/50 transition-colors'

  return (
    <div className="flex flex-wrap items-center gap-2 mb-3">
      <Calendar size={14} className="text-[#00d4ff] shrink-0" />
      <span className="text-xs text-gray-500 shrink-0">Period</span>
      <select className={sel} value={year} onChange={e => setYear(Number(e.target.value))}>
        {years.map(y => <option key={y} value={y}>{y}</option>)}
      </select>
      <select className={sel} value={month} onChange={e => setMonth(Number(e.target.value))}>
        {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
      </select>
    </div>
  )
}
