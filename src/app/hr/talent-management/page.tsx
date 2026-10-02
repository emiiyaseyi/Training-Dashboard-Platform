'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Users2, TrendingUp, Repeat, Award, GraduationCap, Settings } from 'lucide-react'
import { UnitPageHeader } from '@/components/hr/UnitPageHeader'
import { BarChart } from '@/components/charts/BarChart'
import { PieChart } from '@/components/charts/PieChart'
import { FilterBar } from '@/components/ui/FilterBar'
import { usePagePermission } from '@/lib/use-page-permission'
import { abbreviateBUName } from '@/lib/bu-normalizer'
import type { PeriodFilter } from '@/lib/filter-types'

interface TMDashboardData {
  totalTMPool: number
  memberNames: { staffId: string; name: string }[]
  promotedCount: number
  promotionRatePct: number
  mobilityCount: number
  mobilityRatePct: number
  averageTenureYears: number
  tenureBuckets: { labels: string[]; values: number[] }
  performanceByPeriod: { period: string; avgScorePct: number; avgScoreOutOf5: number }[]
  committeeInvolvedCount: number
  committeeInvolvementRatePct: number
  committeeBreakdown: { committee: string; count: number }[]
  tierComposition: { tier: string; count: number }[]
  buComposition: { bu: string; count: number }[]
  genderComposition: { gender: string; count: number }[]
  trainingCoveragePct: number
  staffTrained: number
}

function pct(n: number): string {
  return `${Math.round(n * 10) / 10}%`
}

export default function TalentManagementPage() {
  const [data, setData] = useState<TMDashboardData | null>(null)
  const [period, setPeriod] = useState<PeriodFilter>({ mode: 'all' })
  const [showRoster, setShowRoster] = useState(false)
  const { canAdmin } = usePagePermission()

  useEffect(() => {
    let cancelled = false
    const sp = new URLSearchParams({ filterMode: period.mode })
    if (period.year) sp.set('year', String(period.year))
    if (period.fromMonth) sp.set('fromMonth', period.fromMonth)
    if (period.toMonth) sp.set('toMonth', period.toMonth)
    fetch(`/api/hr/talent-management?${sp.toString()}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => { if (!cancelled && d) setData(d) })
      .catch(() => { /* keep placeholder state on failure */ })
    return () => { cancelled = true }
  }, [period])

  return (
    <div>
      <UnitPageHeader
        title="Talent Management"
        description="TM pool, promotion, mobility & performance"
        icon={<Users2 className="w-5 h-5 text-meristem-700" />}
        actions={
          <div className="flex items-center gap-2">
            <FilterBar availableYears={[2026, 2025]} value={period} onChange={setPeriod} />
            {canAdmin && (
              <Link
                href="/hr/talent-management/admin"
                className="flex items-center gap-1.5 text-xs font-medium text-meristem-700 bg-meristem-50 hover:bg-meristem-100 rounded-lg px-3 py-2"
              >
                <Settings className="w-3.5 h-3.5" /> TM Admin
              </Link>
            )}
          </div>
        }
      />

      <div className="p-4 sm:p-8 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-white border border-meristem-100 rounded-2xl p-5">
            <div className="w-9 h-9 rounded-full bg-meristem-100 flex items-center justify-center mb-3">
              <Users2 className="w-4.5 h-4.5 text-meristem-700" />
            </div>
            <p className="text-2xl font-bold text-slate-800 tabular-nums">{data ? data.totalTMPool : '—'}</p>
            <p className="text-xs font-medium text-slate-600 mt-1">Total TM Pool</p>
            <button
              type="button"
              onClick={() => setShowRoster((v) => !v)}
              className="text-[11px] text-meristem-700 font-medium mt-0.5 hover:underline"
              disabled={!data || data.memberNames.length === 0}
            >
              {showRoster ? 'Hide names' : 'View names'}
            </button>
            {showRoster && data && (
              <select className="w-full mt-2 text-[11px] border border-slate-200 rounded-lg px-2 py-1.5" defaultValue="">
                <option value="" disabled>Select a member…</option>
                {data.memberNames.map((m) => (
                  <option key={m.staffId} value={m.staffId}>{m.name}</option>
                ))}
              </select>
            )}
          </div>

          <div className="bg-white border border-meristem-100 rounded-2xl p-5">
            <div className="w-9 h-9 rounded-full bg-meristem-100 flex items-center justify-center mb-3">
              <TrendingUp className="w-4.5 h-4.5 text-meristem-700" />
            </div>
            <p className="text-2xl font-bold text-slate-800 tabular-nums">{data ? pct(data.promotionRatePct) : '—'}</p>
            <p className="text-xs font-medium text-slate-600 mt-1">Promoted (2025–2026)</p>
            <p className="text-[11px] text-slate-400 mt-0.5">{data ? `${data.promotedCount} of ${data.totalTMPool}` : 'loading…'}</p>
          </div>

          <div className="bg-white border border-meristem-100 rounded-2xl p-5">
            <div className="w-9 h-9 rounded-full bg-meristem-100 flex items-center justify-center mb-3">
              <Repeat className="w-4.5 h-4.5 text-meristem-700" />
            </div>
            <p className="text-2xl font-bold text-slate-800 tabular-nums">{data ? pct(data.mobilityRatePct) : '—'}</p>
            <p className="text-xs font-medium text-slate-600 mt-1">Internal Mobility (2025–2026)</p>
            <p className="text-[11px] text-slate-400 mt-0.5">{data ? `${data.mobilityCount} of ${data.totalTMPool} changed BU/role` : 'loading…'}</p>
          </div>

          <div className="bg-white border border-meristem-100 rounded-2xl p-5">
            <div className="w-9 h-9 rounded-full bg-meristem-100 flex items-center justify-center mb-3">
              <Award className="w-4.5 h-4.5 text-meristem-700" />
            </div>
            <p className="text-2xl font-bold text-slate-800 tabular-nums">{data ? pct(data.committeeInvolvementRatePct) : '—'}</p>
            <p className="text-xs font-medium text-slate-600 mt-1">Committee Involvement</p>
            <p className="text-[11px] text-slate-400 mt-0.5">{data ? `${data.committeeInvolvedCount} of ${data.totalTMPool}` : 'loading…'}</p>
          </div>

          <div className="bg-white border border-meristem-100 rounded-2xl p-5">
            <div className="w-9 h-9 rounded-full bg-meristem-100 flex items-center justify-center mb-3">
              <GraduationCap className="w-4.5 h-4.5 text-meristem-700" />
            </div>
            <p className="text-2xl font-bold text-slate-800 tabular-nums">{data ? pct(data.trainingCoveragePct) : '—'}</p>
            <p className="text-xs font-medium text-slate-600 mt-1">Training Coverage</p>
            <p className="text-[11px] text-meristem-700 font-medium mt-0.5">{data ? `${data.staffTrained} trained this period` : 'loading…'}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white border border-meristem-100 rounded-2xl p-5">
            <p className="text-sm font-bold text-slate-800 mb-1">TM Pool by Tenure</p>
            <p className="text-xs text-slate-400 mb-3">
              Average {data ? `${Math.round(data.averageTenureYears * 10) / 10} years` : '—'} at Meristem — computed live from DOJ Meristem
            </p>
            {data && <BarChart labels={data.tenureBuckets.labels} values={data.tenureBuckets.values} color="#B0714F" showLabels height={220} />}
          </div>

          <div className="bg-white border border-meristem-100 rounded-2xl p-5">
            <p className="text-sm font-bold text-slate-800 mb-1">Average Performance Score</p>
            <p className="text-xs text-slate-400 mb-3">TM pool, by half-year</p>
            {data && (
              <div className="grid grid-cols-3 gap-3">
                {data.performanceByPeriod.map((p) => (
                  <div key={p.period} className="text-center">
                    <p className="text-lg font-bold text-slate-800 tabular-nums">{pct(p.avgScorePct)}</p>
                    <p className="text-[11px] text-slate-400">{Math.round(p.avgScoreOutOf5 * 10) / 10}/5</p>
                    <p className="text-[11px] text-slate-500 mt-1">{p.period}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="bg-white border border-meristem-100 rounded-2xl p-5">
            <p className="text-sm font-bold text-slate-800 mb-3">Talent Pool Composition (by Tier)</p>
            {data && data.tierComposition.length > 0 && (
              <PieChart labels={data.tierComposition.map((t) => t.tier)} values={data.tierComposition.map((t) => t.count)} height={220} />
            )}
          </div>

          <div className="bg-white border border-meristem-100 rounded-2xl p-5">
            <p className="text-sm font-bold text-slate-800 mb-3">TM BU Composition</p>
            {data && data.buComposition.length > 0 && (
              <PieChart labels={data.buComposition.map((b) => abbreviateBUName(b.bu))} values={data.buComposition.map((b) => b.count)} height={220} />
            )}
          </div>

          <div className="bg-white border border-meristem-100 rounded-2xl p-5">
            <p className="text-sm font-bold text-slate-800 mb-3">Gender Composition</p>
            {data && data.genderComposition.length > 0 && (
              <PieChart labels={data.genderComposition.map((g) => g.gender)} values={data.genderComposition.map((g) => g.count)} height={220} />
            )}
          </div>
        </div>

        <div className="bg-white border border-meristem-100 rounded-2xl p-5">
          <p className="text-sm font-bold text-slate-800 mb-3">Strategic Committee Breakdown</p>
          {data && data.committeeBreakdown.length > 0 ? (
            <div className="space-y-2">
              {data.committeeBreakdown.map((c) => (
                <div key={c.committee} className="flex items-center justify-between text-[12px]">
                  <span className="text-slate-600">{c.committee}</span>
                  <span className="font-semibold text-slate-800 tabular-nums">{c.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400">No committee data yet.</p>
          )}
        </div>
      </div>
    </div>
  )
}
