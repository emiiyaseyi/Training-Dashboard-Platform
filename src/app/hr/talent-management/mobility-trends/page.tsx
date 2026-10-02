'use client'

import { useEffect, useState } from 'react'
import { Repeat, ArrowRight } from 'lucide-react'
import { UnitPageHeader } from '@/components/hr/UnitPageHeader'
import { TmSubNav } from '@/components/hr/tm/TmSubNav'
import { BarChart } from '@/components/charts/BarChart'
import { FilterBar } from '@/components/ui/FilterBar'
import { abbreviateBUName } from '@/lib/bu-normalizer'
import { filterToQuery, type PeriodFilter } from '@/lib/filter-types'

interface MobilityTrends {
  byYear: { year: number; movedCount: number; ratePct: number }[]
  byBU: { bu: string; movedCount: number }[]
  buToBu: { from: string; to: string; count: number }[]
  records: { staffId: string; name: string; year: number; fromBU: string | null; toBU: string | null; fromRole: string | null; toRole: string | null }[]
}

function pct(n: number): string {
  return `${Math.round(n * 10) / 10}%`
}

export default function MobilityTrendsPage() {
  const [data, setData] = useState<MobilityTrends | null>(null)
  const [period, setPeriod] = useState<PeriodFilter>({ mode: 'all' })

  useEffect(() => {
    let cancelled = false
    fetch(`/api/hr/talent-management/mobility-trends${filterToQuery(period)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => { if (!cancelled && d) setData(d) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [period])

  return (
    <div>
      <UnitPageHeader
        title="Talent Management"
        description="TM pool, promotion, mobility & performance"
        icon={<Repeat className="w-5 h-5 text-meristem-700" />}
        actions={<FilterBar availableYears={[2026, 2025]} value={period} onChange={setPeriod} />}
      />
      <TmSubNav />

      <div className="p-4 sm:p-8 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {data?.byYear.map((y) => (
            <div key={y.year} className="bg-white border border-meristem-100 rounded-2xl p-5">
              <p className="text-2xl font-bold text-slate-800 tabular-nums">{pct(y.ratePct)}</p>
              <p className="text-xs font-medium text-slate-600 mt-1">Moved BU/Role in {y.year}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">{y.movedCount} of the active TM pool</p>
            </div>
          ))}
        </div>

        <div className="bg-white border border-meristem-100 rounded-2xl p-5">
          <p className="text-sm font-bold text-slate-800 mb-3">Mobility by Business Unit</p>
          {data && data.byBU.length > 0 ? (
            <BarChart labels={data.byBU.map((b) => abbreviateBUName(b.bu))} values={data.byBU.map((b) => b.movedCount)} color="#B0714F" showLabels height={Math.max(180, data.byBU.length * 32)} horizontal />
          ) : (
            <p className="text-xs text-slate-400">No mobility recorded yet.</p>
          )}
        </div>

        <div className="bg-white border border-meristem-100 rounded-2xl p-5">
          <p className="text-sm font-bold text-slate-800 mb-3">BU-to-BU Movement</p>
          {data && data.buToBu.length > 0 ? (
            <div className="space-y-2">
              {data.buToBu.map((m, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="text-slate-600 flex items-center gap-1.5">
                    {abbreviateBUName(m.from)} <ArrowRight className="w-3 h-3 text-slate-300" /> {abbreviateBUName(m.to)}
                  </span>
                  <span className="font-semibold text-slate-800 tabular-nums">{m.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400">No cross-BU moves recorded yet.</p>
          )}
        </div>

        <div className="bg-white border border-meristem-100 rounded-2xl p-5">
          <p className="text-sm font-bold text-slate-800 mb-3">All Mobility Records</p>
          {data && data.records.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-400 border-b border-slate-100">
                    <th className="py-1.5 pr-4 font-medium">Name</th>
                    <th className="py-1.5 pr-4 font-medium">Year</th>
                    <th className="py-1.5 pr-4 font-medium">From BU</th>
                    <th className="py-1.5 pr-4 font-medium">To BU</th>
                    <th className="py-1.5 pr-4 font-medium">New Role</th>
                  </tr>
                </thead>
                <tbody>
                  {data.records.map((r, i) => (
                    <tr key={i} className="border-b border-slate-50">
                      <td className="py-1.5 pr-4 text-slate-700">{r.name}</td>
                      <td className="py-1.5 pr-4 text-slate-600">{r.year}</td>
                      <td className="py-1.5 pr-4 text-slate-600">{r.fromBU ? abbreviateBUName(r.fromBU) : '—'}</td>
                      <td className="py-1.5 pr-4 text-slate-600">{r.toBU ? abbreviateBUName(r.toBU) : '—'}</td>
                      <td className="py-1.5 pr-4 text-slate-600">{r.toRole || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-slate-400">No mobility recorded yet.</p>
          )}
        </div>
      </div>
    </div>
  )
}
