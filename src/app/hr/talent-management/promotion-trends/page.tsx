'use client'

import { useEffect, useState } from 'react'
import { TrendingUp } from 'lucide-react'
import { UnitPageHeader } from '@/components/hr/UnitPageHeader'
import { TmSubNav } from '@/components/hr/tm/TmSubNav'
import { BarChart } from '@/components/charts/BarChart'
import { FilterBar } from '@/components/ui/FilterBar'
import { abbreviateBUName } from '@/lib/bu-normalizer'
import { filterToQuery, type PeriodFilter } from '@/lib/filter-types'

interface PromotionTrends {
  byYear: { year: number; promotedCount: number; ratePct: number }[]
  byBU: { bu: string; count: number }[]
  byTier: { tier: string; count: number }[]
  records: { staffId: string; name: string; year: number; previousGrade: string | null; newGrade: string | null }[]
}

function pct(n: number): string {
  return `${Math.round(n * 10) / 10}%`
}

export default function PromotionTrendsPage() {
  const [data, setData] = useState<PromotionTrends | null>(null)
  const [period, setPeriod] = useState<PeriodFilter>({ mode: 'all' })

  useEffect(() => {
    let cancelled = false
    fetch(`/api/hr/talent-management/promotion-trends${filterToQuery(period)}`)
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
        icon={<TrendingUp className="w-5 h-5 text-meristem-700" />}
        actions={<FilterBar availableYears={[2026, 2025]} value={period} onChange={setPeriod} />}
      />
      <TmSubNav />

      <div className="p-4 sm:p-8 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {data?.byYear.map((y) => (
            <div key={y.year} className="bg-white border border-meristem-100 rounded-2xl p-5">
              <p className="text-2xl font-bold text-slate-800 tabular-nums">{pct(y.ratePct)}</p>
              <p className="text-xs font-medium text-slate-600 mt-1">Promoted in {y.year}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">{y.promotedCount} of the active TM pool</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white border border-meristem-100 rounded-2xl p-5">
            <p className="text-sm font-bold text-slate-800 mb-3">Promotions by Business Unit</p>
            {data && data.byBU.length > 0 ? (
              <BarChart labels={data.byBU.map((b) => abbreviateBUName(b.bu))} values={data.byBU.map((b) => b.count)} color="#2F6B2B" showLabels horizontal height={Math.max(180, data.byBU.length * 32)} />
            ) : (
              <p className="text-xs text-slate-400">No promotions recorded yet.</p>
            )}
          </div>
          <div className="bg-white border border-meristem-100 rounded-2xl p-5">
            <p className="text-sm font-bold text-slate-800 mb-3">Promotions by Tier</p>
            {data && data.byTier.length > 0 ? (
              <BarChart labels={data.byTier.map((t) => t.tier)} values={data.byTier.map((t) => t.count)} color="#7A66B0" showLabels height={220} />
            ) : (
              <p className="text-xs text-slate-400">No promotions recorded yet.</p>
            )}
          </div>
        </div>

        <div className="bg-white border border-meristem-100 rounded-2xl p-5">
          <p className="text-sm font-bold text-slate-800 mb-3">All Promotion Records</p>
          {data && data.records.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-400 border-b border-slate-100">
                    <th className="py-1.5 pr-4 font-medium">Name</th>
                    <th className="py-1.5 pr-4 font-medium">Year</th>
                    <th className="py-1.5 pr-4 font-medium">Previous Grade</th>
                    <th className="py-1.5 pr-4 font-medium">New Grade</th>
                  </tr>
                </thead>
                <tbody>
                  {data.records.map((r, i) => (
                    <tr key={i} className="border-b border-slate-50">
                      <td className="py-1.5 pr-4 text-slate-700">{r.name}</td>
                      <td className="py-1.5 pr-4 text-slate-600">{r.year}</td>
                      <td className="py-1.5 pr-4 text-slate-600">{r.previousGrade || '—'}</td>
                      <td className="py-1.5 pr-4 text-slate-600">{r.newGrade || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-slate-400">No promotions recorded yet.</p>
          )}
        </div>
      </div>
    </div>
  )
}
