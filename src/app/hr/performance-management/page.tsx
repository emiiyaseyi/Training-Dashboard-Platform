'use client'

import { TrendingUp, ClipboardCheck, Star, Users2 } from 'lucide-react'
import { UnitPageHeader } from '@/components/hr/UnitPageHeader'
import { MetricListCard } from '@/components/hr/MetricListCard'
import { BarChart } from '@/components/charts/BarChart'

// Contract-review completion is real, from HR REPORT — 1ST QPR 2026. The rating trend is real
// too, pulled directly from "HR Dashboard/PM & TM_Data_for_Dashboard_CLEAN.xlsx" ("Performance
// Appraisal" sheet averages, columns E/F/G = H1 2025/H2 2025/H1 2026) — it's a declining trend,
// not the improving one an estimate might assume, which is why this needed the source file
// rather than a guess. Goal achievement, performance distribution and PIP population have no
// data source anywhere in this app yet and stay explicit placeholders. Talent Management (TM
// pool, promotion, mobility, succession) is its own unit — see /hr/talent-management.
const KPIS = [
  { label: 'Contracts Reviewed', value: '80%', sub: 'Group‑wide, Q1 2026', icon: ClipboardCheck, tag: 'HR Report' },
  { label: 'Avg. Rating, H1 2026', value: '3.8 / 5', sub: 'Down from 3.9 in H2 2025', icon: Star, tag: 'Excel' },
  { label: 'Contracts Outstanding', value: '20%', sub: 'Target: 100% by quarter end', icon: TrendingUp, tag: 'HR Report' },
  { label: 'Staff in Scope', value: '329', sub: 'Group‑wide headcount', icon: Users2, tag: 'HR Report' },
]

// Average Score — H1 2025 / H2 2025 / H1 2026, from 'Performance Appraisal' sheet (cols E/F/G).
const RATING_TREND = { labels: ['H1 2025', 'H2 2025', 'H1 2026'], values: [3.9, 3.9, 3.8] }

const TAG_STYLES: Record<string, string> = {
  'HR Report': 'text-meristem-700 bg-meristem-50',
  Excel: 'text-sky-700 bg-sky-50',
}

// No performance-distribution, goal-tracking or manager-effectiveness feed exists anywhere in
// this app yet — every value below is an honest "—", not an invented number, until Performance
// Management confirms a source for each.
const DISTRIBUTION_BANDS = ['Outstanding', 'Exceeds Expectations', 'Meets Expectations', 'Needs Improvement', 'Unsatisfactory']
const DEPARTMENTS = ['Sales', 'Finance', 'Operations']
const MANAGER_METRICS = ['Manager Review Completion', 'Manager Goal Setting Completion', 'Team Performance Score', 'Manager Calibration Variance']

export default function PerformanceManagementPage() {
  return (
    <div>
      <UnitPageHeader title="Performance Management" description="Performance contracts, reviews & ratings" icon={TrendingUp} />

      <div className="p-4 sm:p-8 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {KPIS.map((k) => (
            <div key={k.label} className="bg-white border border-meristem-100 rounded-2xl p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="w-9 h-9 rounded-full bg-meristem-100 flex items-center justify-center">
                  <k.icon className="w-4.5 h-4.5 text-meristem-700" />
                </div>
                <span className={`text-[9px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 ${TAG_STYLES[k.tag]}`}>{k.tag}</span>
              </div>
              <p className="text-2xl font-bold text-slate-800 tabular-nums">{k.value}</p>
              <p className="text-xs font-medium text-slate-600 mt-1">{k.label}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">{k.sub}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white border border-meristem-100 rounded-2xl p-5">
            <p className="text-sm font-bold text-slate-800 mb-1">Average Performance Rating</p>
            <p className="text-xs text-slate-400 mb-3">Out of 5.0, by half‑year — from the TM dashboard workbook</p>
            <BarChart labels={RATING_TREND.labels} values={RATING_TREND.values} color="#2F6B2B" showLabels height={220} />
          </div>

          <div className="bg-white border border-meristem-100 rounded-2xl p-5">
            <p className="text-sm font-bold text-slate-800 mb-1">Organization‑wide Contract Review</p>
            <p className="text-xs text-slate-400 mb-3">Q1 2026 completion status</p>
            <div className="w-full bg-meristem-50 rounded-full h-2.5">
              <div className="h-2.5 rounded-full bg-meristem-600" style={{ width: '80%' }} />
            </div>
            <p className="text-xs text-slate-500 mt-2">80% complete — target 100% by quarter end</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <MetricListCard title="Performance Distribution" metrics={DISTRIBUTION_BANDS} />
          <MetricListCard title="Goal Performance" metrics={['Goals Set', 'Goals Completed', 'Goal Achievement Rate', 'Overdue Goals']} />
          <MetricListCard title="Performance Improvement" metrics={['Staff on a PIP', 'PIP Completion Rate', 'PIP Success Rate']} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="bg-white border border-meristem-100 rounded-2xl p-5 lg:col-span-2">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold text-slate-800">Department Performance</p>
              <span className="text-[9px] font-bold uppercase tracking-wide text-rose-600 bg-rose-50 rounded-full px-2 py-0.5">no data source yet</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="text-left text-[10px] text-slate-400 uppercase tracking-wide border-b border-meristem-50">
                    <th className="py-2 font-medium">Department</th>
                    <th className="py-2 font-medium text-right">Avg. Score</th>
                    <th className="py-2 font-medium text-right">Goal Achievement</th>
                    <th className="py-2 font-medium text-right">High Performers</th>
                    <th className="py-2 font-medium text-right">Low Performers</th>
                  </tr>
                </thead>
                <tbody>
                  {DEPARTMENTS.map((d) => (
                    <tr key={d} className="border-b border-meristem-50 last:border-0">
                      <td className="py-2.5 text-slate-700 font-medium">{d}</td>
                      <td className="py-2.5 text-right text-slate-300 font-semibold">—</td>
                      <td className="py-2.5 text-right text-slate-300 font-semibold">—</td>
                      <td className="py-2.5 text-right text-slate-300 font-semibold">—</td>
                      <td className="py-2.5 text-right text-slate-300 font-semibold">—</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <MetricListCard title="Manager Effectiveness" metrics={MANAGER_METRICS} />
        </div>
      </div>
    </div>
  )
}
