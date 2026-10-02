'use client'

import { useEffect, useState } from 'react'
import { Award } from 'lucide-react'
import { UnitPageHeader } from '@/components/hr/UnitPageHeader'
import { TmSubNav } from '@/components/hr/tm/TmSubNav'
import { BarChart } from '@/components/charts/BarChart'
import { PieChart } from '@/components/charts/PieChart'
import { FilterBar } from '@/components/ui/FilterBar'
import { abbreviateBUName } from '@/lib/bu-normalizer'
import { filterToQuery, type PeriodFilter } from '@/lib/filter-types'

interface CommitteesPerformance {
  committeeBreakdown: { committee: string; count: number }[]
  performanceByBU: { bu: string; avgScorePct: number }[]
  scoreDistribution: { bucket: string; count: number }[]
  latestPeriod: string
  records: { staffId: string; name: string; score: number }[]
}

export default function CommitteesPerformancePage() {
  const [data, setData] = useState<CommitteesPerformance | null>(null)
  const [period, setPeriod] = useState<PeriodFilter>({ mode: 'all' })

  useEffect(() => {
    let cancelled = false
    fetch(`/api/hr/talent-management/committees-performance${filterToQuery(period)}`)
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
        icon={<Award className="w-5 h-5 text-meristem-700" />}
        actions={<FilterBar availableYears={[2026, 2025]} value={period} onChange={setPeriod} />}
      />
      <TmSubNav />

      <div className="p-4 sm:p-8 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white border border-meristem-100 rounded-2xl p-5">
            <p className="text-sm font-bold text-slate-800 mb-3">Strategic Committee Breakdown</p>
            {data && data.committeeBreakdown.length > 0 ? (
              <PieChart labels={data.committeeBreakdown.map((c) => c.committee)} values={data.committeeBreakdown.map((c) => c.count)} height={260} />
            ) : (
              <p className="text-xs text-slate-400">No committee data yet.</p>
            )}
          </div>

          <div className="bg-white border border-meristem-100 rounded-2xl p-5">
            <p className="text-sm font-bold text-slate-800 mb-1">Score Distribution</p>
            <p className="text-xs text-slate-400 mb-3">{data ? data.latestPeriod : '—'}</p>
            {data && data.scoreDistribution.some((b) => b.count > 0) ? (
              <BarChart labels={data.scoreDistribution.map((b) => b.bucket)} values={data.scoreDistribution.map((b) => b.count)} color="#5C8FB0" showLabels height={220} />
            ) : (
              <p className="text-xs text-slate-400">No scores for this period yet.</p>
            )}
          </div>
        </div>

        <div className="bg-white border border-meristem-100 rounded-2xl p-5">
          <p className="text-sm font-bold text-slate-800 mb-1">Average Performance by Business Unit</p>
          <p className="text-xs text-slate-400 mb-3">{data ? data.latestPeriod : '—'}</p>
          {data && data.performanceByBU.length > 0 ? (
            <BarChart
              labels={data.performanceByBU.map((b) => abbreviateBUName(b.bu))}
              values={data.performanceByBU.map((b) => b.avgScorePct)}
              labelSuffix="%"
              color="#9A4A2E"
              showLabels
              horizontal
              height={Math.max(180, data.performanceByBU.length * 32)}
            />
          ) : (
            <p className="text-xs text-slate-400">No scores for this period yet.</p>
          )}
        </div>

        <div className="bg-white border border-meristem-100 rounded-2xl p-5">
          <p className="text-sm font-bold text-slate-800 mb-1">All Scores</p>
          <p className="text-xs text-slate-400 mb-3">{data ? data.latestPeriod : '—'}</p>
          {data && data.records.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-400 border-b border-slate-100">
                    <th className="py-1.5 pr-4 font-medium">Name</th>
                    <th className="py-1.5 pr-4 font-medium">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {data.records.map((r) => (
                    <tr key={r.staffId} className="border-b border-slate-50">
                      <td className="py-1.5 pr-4 text-slate-700">{r.name}</td>
                      <td className="py-1.5 pr-4 text-slate-600 tabular-nums">{Math.round(r.score * 10) / 10}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-slate-400">No scores for this period yet.</p>
          )}
        </div>
      </div>
    </div>
  )
}
