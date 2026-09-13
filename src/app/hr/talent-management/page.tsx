'use client'

import { useEffect, useState } from 'react'
import { Users2, TrendingUp, Repeat, Award, GraduationCap, Clock } from 'lucide-react'
import { UnitPageHeader } from '@/components/hr/UnitPageHeader'
import { MetricListCard } from '@/components/hr/MetricListCard'
import { BarChart } from '@/components/charts/BarChart'
import { FilterBar } from '@/components/ui/FilterBar'
import type { PeriodFilter } from '@/lib/filter-types'

// Sourced directly from the live formulas in "HR Dashboard/PM & TM_Data_for_Dashboard_CLEAN.xlsx"
// ("TM Dashboard Metrics — Live Summary" sheet, cells B4/B7-B8/B11-B12/B15-B19/B27-B28) — these
// are real figures from the spreadsheet the business maintains, just not yet wired to a live
// database the way the two cards below are. All three below are all-time / cumulative figures
// (the sheet's own labels: "% of TM pool promoted in any tracked year", "% of TM pool with a
// recorded BU or role change"), not a quarterly rate — shown that way to avoid implying a rate
// that isn't what the source actually measures.
const EXCEL_KPIS = [
  { label: 'Promoted (all-time)', value: '83%', sub: '34 of 41 TM staff, any tracked year', icon: TrendingUp },
  { label: 'Internal Mobility (all-time)', value: '65%', sub: '28 of 43 with a recorded BU/role change', icon: Repeat },
  { label: 'Committee Involvement', value: '90%', sub: '37 of 41 on a Strategic Committee', icon: Award },
]

const TENURE_BUCKETS = { labels: ['0–2 yrs', '3–5 yrs', '6–10 yrs', '10+ yrs'], values: [0, 12, 13, 16] }
const AVG_TM_TENURE = 10.0

// Average Score — H1 2025 / H2 2025 / H1 2026, from 'Performance Appraisal' sheet averages
// (columns E/F/G respectively) — a declining trend, not the improving one a rough estimate
// might assume, which is exactly why this needed pulling from the source file directly.
const RATING_TREND = { labels: ['H1 2025', 'H2 2025', 'H1 2026'], values: [3.9, 3.9, 3.8] }

// None of these have a source anywhere in this app (no succession-planning, 9-box, career-plan
// or attrition-risk tracking exists yet) — every value is an honest "—", not a guess.
const TALENT_POOL_METRICS = ['High Performers', 'High Potentials', 'Critical Talent', 'Emerging Leaders', 'Leadership Talent', 'Key Specialists', 'Talent Pool by Department']
const SUCCESSION_METRICS = ['Critical Positions', 'Positions With a Successor', 'Ready‑Now Successors', 'Ready in 1–2 Years', 'Ready in 3–5 Years']
const NINE_BOX_METRICS = ['High Performance / High Potential', 'High Performance / Medium Potential', 'Medium Performance / High Potential', 'High Potential %', 'High Performer %', 'Ready‑Now Talent', 'Future Talent']
const TALENT_RISK_METRICS = ['Critical Talent at Risk', 'High Performer Attrition Risk', 'Retirement Risk', 'Single‑Point‑of‑Failure Roles', 'Critical Skills at Risk']
const CAREER_DEV_METRICS = ['Employees With a Career Plan', 'Development Plan Completion', 'Career Conversations Completed', 'Employees Ready for Promotion']
const RETENTION_METRICS = ['Critical Talent Retention', 'High Performer Retention', 'HiPo Retention', 'Regrettable Attrition (Critical Roles)']
const PIPELINE_METRICS = ['Leadership Pipeline', 'Successor Pipeline', 'Graduate/Entry‑Level Pipeline', 'Future Capability Gaps']

interface LiveTm { totalTalentMembers: number; coveragePct: number; staffTrained: number }

export default function TalentManagementPage() {
  const [live, setLive] = useState<LiveTm | null>(null)
  const [period, setPeriod] = useState<PeriodFilter>({ mode: 'all' })

  useEffect(() => {
    let cancelled = false
    fetch('/api/talent-members')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (!cancelled && data) setLive(data) })
      .catch(() => { /* keep placeholder state on failure */ })
    return () => { cancelled = true }
  }, [])

  return (
    <div>
      <UnitPageHeader
        title="Talent Management"
        description="TM pool, promotion, mobility & succession"
        icon={<Users2 className="w-5 h-5 text-meristem-700" />}
        actions={<FilterBar availableYears={[2026, 2025]} value={period} onChange={setPeriod} />}
      />

      <div className="p-4 sm:p-8 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-meristem-100 rounded-2xl p-5">
            <div className="w-9 h-9 rounded-full bg-meristem-100 flex items-center justify-center mb-3">
              <Users2 className="w-4.5 h-4.5 text-meristem-700" />
            </div>
            <p className="text-2xl font-bold text-slate-800 tabular-nums">{live ? live.totalTalentMembers : '—'}</p>
            <p className="text-xs font-medium text-slate-600 mt-1">Total TM Pool</p>
            <p className="text-[11px] text-meristem-700 font-medium mt-0.5">Live — from Talent Members roster</p>
          </div>

          <div className="bg-white border border-meristem-100 rounded-2xl p-5">
            <div className="w-9 h-9 rounded-full bg-meristem-100 flex items-center justify-center mb-3">
              <GraduationCap className="w-4.5 h-4.5 text-meristem-700" />
            </div>
            <p className="text-2xl font-bold text-slate-800 tabular-nums">{live ? `${Math.round(live.coveragePct * 10) / 10}%` : '—'}</p>
            <p className="text-xs font-medium text-slate-600 mt-1">Training Coverage</p>
            <p className="text-[11px] text-meristem-700 font-medium mt-0.5">Live — {live ? `${live.staffTrained} trained this year` : 'loading…'}</p>
          </div>

          {EXCEL_KPIS.map((k) => (
            <div key={k.label} className="bg-white border border-meristem-100 rounded-2xl p-5">
              <div className="w-9 h-9 rounded-full bg-meristem-100 flex items-center justify-center mb-3">
                <k.icon className="w-4.5 h-4.5 text-meristem-700" />
              </div>
              <p className="text-2xl font-bold text-slate-800 tabular-nums">{k.value}</p>
              <p className="text-xs font-medium text-slate-600 mt-1">{k.label}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">{k.sub}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white border border-meristem-100 rounded-2xl p-5">
            <p className="text-sm font-bold text-slate-800 mb-1">TM Pool by Tenure</p>
            <p className="text-xs text-slate-400 mb-3">Average {AVG_TM_TENURE} years at Meristem — from the TM dashboard workbook</p>
            <BarChart labels={TENURE_BUCKETS.labels} values={TENURE_BUCKETS.values} color="#B0714F" showLabels height={220} />
          </div>

          <div className="bg-white border border-meristem-100 rounded-2xl p-5">
            <p className="text-sm font-bold text-slate-800 mb-1">Average Performance Score</p>
            <p className="text-xs text-slate-400 mb-3">TM pool, out of 5.0, by half‑year — from the TM dashboard workbook</p>
            <BarChart labels={RATING_TREND.labels} values={RATING_TREND.values} color="#9A4A2E" showLabels height={220} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <MetricListCard title="Talent Pool Composition" metrics={TALENT_POOL_METRICS} />
          <MetricListCard title="Succession Planning" metrics={SUCCESSION_METRICS} />
          <MetricListCard title="9‑Box / Talent Segmentation" metrics={NINE_BOX_METRICS} />
          <MetricListCard title="Talent Risk" metrics={TALENT_RISK_METRICS} />
          <MetricListCard title="Career Development" metrics={CAREER_DEV_METRICS} />
          <MetricListCard title="Retention of Key Talent" metrics={RETENTION_METRICS} />
          <MetricListCard title="Workforce Pipeline" metrics={PIPELINE_METRICS} />
        </div>

        <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
          <Clock className="w-3 h-3" /> Excel-sourced figures reflect the workbook as of when it was shared — connect a live sheet to keep them current automatically.
        </p>
      </div>
    </div>
  )
}
