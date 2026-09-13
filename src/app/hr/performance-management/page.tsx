'use client'

import { useState } from 'react'
import { TrendingUp, TrendingDown, ClipboardCheck, Star, Users2, AlertCircle } from 'lucide-react'
import { UnitPageHeader } from '@/components/hr/UnitPageHeader'
import { MetricListCard } from '@/components/hr/MetricListCard'
import { BarChart } from '@/components/charts/BarChart'
import { PieChart } from '@/components/charts/PieChart'
import { FilterBar } from '@/components/ui/FilterBar'
import type { PeriodFilter } from '@/lib/filter-types'

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
const DISTRIBUTION_BANDS = ['Outstanding', 'Exceeds Expectations', 'Meets Expectations', 'Needs Improvement', 'Unsatisfactory', 'High Performer Population', 'Low Performer Population']
// Front Office / Back Office is the real departmental split used elsewhere in this app (Employee
// Services, and Talent Acquisition's OfficeType) — not a fabricated department list.
const DEPARTMENTS = ['Front Office', 'Back Office']
// Real: HR REPORT — 1ST QPR 2026's "Cost & No of Employees Per Category" chart (89 + 240 = 329).
// Order matches DEPARTMENTS (Front Office, Back Office) so the two lists can be zipped by index.
const OFFICE_HEADCOUNT = { labels: ['Front Office', 'Back Office'], values: [89, 240] }
const MANAGER_METRICS = ['Manager Review Completion', 'Manager Goal Setting Completion', 'Team Performance Score', 'Manager Calibration Variance']
const PROCESS_METRICS = ['Goal Setting Completion', 'Goal Alignment Rate', 'Mid‑Year Review Completion', 'Year‑End Review Completion', 'Employee Self‑Assessment Completion']
const GOAL_METRICS = ['Goals Set', 'Goals Completed', 'Goal Achievement Rate', 'Average Goal Score', 'Business Goals Achieved', 'Individual Goals Achieved', 'Strategic Goals Achieved', 'Overdue Goals']

// Real: H2 2025 -> H1 2026, from the same 'Performance Appraisal' sheet averages as RATING_TREND.
const CYCLE_COMPARISON = { current: 3.8, currentLabel: 'H1 2026', previous: 3.9, previousLabel: 'H2 2025' }

// No BU/department-level Performance Contract completion breakdown exists anywhere in this app
// yet — only the group-wide 80% figure (HR Report) is real. Entity names are real (the Meristem
// Group's own entities); the completion values against them are not.
const BU_ENTITIES = ['MSL', 'MWML', 'MSBL', 'MRPSL', 'MCL', 'MFL', 'MTL', 'NESI', 'MFO']

export default function PerformanceManagementPage() {
  const [period, setPeriod] = useState<PeriodFilter>({ mode: 'all' })

  return (
    <div>
      <UnitPageHeader
        title="Performance Management"
        description="Performance contracts, reviews & ratings"
        icon={<TrendingUp className="w-5 h-5 text-meristem-700" />}
        actions={<FilterBar availableYears={[2026, 2025]} value={period} onChange={setPeriod} />}
      />

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

        <div className="bg-white border border-meristem-100 rounded-2xl p-5">
          <p className="text-sm font-bold text-slate-800 mb-1">Group‑wide Performance — Cycle over Cycle</p>
          <p className="text-xs text-slate-400 mb-4">Current appraisal cycle vs. previous, from the TM dashboard workbook</p>
          <div className="flex items-center gap-6">
            <div>
              <p className="text-3xl font-bold text-slate-800 tabular-nums">{CYCLE_COMPARISON.current}</p>
              <p className="text-[11px] text-slate-500">{CYCLE_COMPARISON.currentLabel} (current)</p>
            </div>
            <div className={`flex items-center gap-1.5 text-sm font-semibold ${CYCLE_COMPARISON.current < CYCLE_COMPARISON.previous ? 'text-rose-600' : 'text-meristem-700'}`}>
              {CYCLE_COMPARISON.current < CYCLE_COMPARISON.previous ? <TrendingDown className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />}
              {Math.abs(CYCLE_COMPARISON.current - CYCLE_COMPARISON.previous).toFixed(1)} pts {CYCLE_COMPARISON.current < CYCLE_COMPARISON.previous ? 'dropping' : 'rising'}
            </div>
            <div>
              <p className="text-3xl font-bold text-slate-400 tabular-nums">{CYCLE_COMPARISON.previous}</p>
              <p className="text-[11px] text-slate-500">{CYCLE_COMPARISON.previousLabel} (previous)</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white border border-meristem-100 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold text-slate-800">PC Completion by Business Unit</p>
              <span className="text-[9px] font-bold uppercase tracking-wide text-rose-600 bg-rose-50 rounded-full px-2 py-0.5">no data source yet</span>
            </div>
            <div className="space-y-2">
              {BU_ENTITIES.map((bu) => (
                <div key={bu} className="flex items-center justify-between text-[12px]">
                  <span className="text-slate-500">{bu}</span>
                  <span className="font-semibold text-slate-300">—</span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white border border-meristem-100 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-bold text-slate-800">Headcount by Office Category</p>
              <span className="text-[9px] font-bold uppercase tracking-wide text-meristem-700 bg-meristem-50 rounded-full px-2 py-0.5">HR Report</span>
            </div>
            <p className="text-xs text-slate-400 mb-3">Real headcount split — PC completion by category isn&apos;t tracked yet, but the population it would apply to is known</p>
            <PieChart labels={OFFICE_HEADCOUNT.labels} values={OFFICE_HEADCOUNT.values} donut showAmounts={false} height={200} />
            <div className="mt-3 space-y-1.5">
              {DEPARTMENTS.map((d, i) => (
                <div key={d} className="flex items-center justify-between text-[12px]">
                  <span className="text-slate-500">{d} PC completion</span>
                  <span className="font-semibold text-slate-300">— <span className="text-slate-400 font-normal">({OFFICE_HEADCOUNT.values[i]} staff)</span></span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-white border border-meristem-100 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <AlertCircle className="w-4 h-4 text-meristem-700" />
            <p className="text-sm font-bold text-slate-800">Staff Currently on a Performance Improvement Plan</p>
            <span className="text-[9px] font-bold uppercase tracking-wide text-rose-600 bg-rose-50 rounded-full px-2 py-0.5 ml-auto">no data source yet</span>
          </div>
          <p className="text-2xl font-bold text-slate-300 tabular-nums mt-2">—</p>
          <p className="text-xs text-slate-400 mt-1">No PIP tracking source connected — nothing to show until Performance Management provides one.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <MetricListCard title="Performance Process" metrics={PROCESS_METRICS} />
          <MetricListCard title="Performance Distribution" metrics={DISTRIBUTION_BANDS} />
          <MetricListCard title="Goal Performance" metrics={GOAL_METRICS} />
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
