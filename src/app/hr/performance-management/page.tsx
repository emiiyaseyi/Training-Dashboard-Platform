'use client'

import { TrendingUp, Award, Repeat, Users2 } from 'lucide-react'
import { UnitPageHeader } from '@/components/hr/UnitPageHeader'
import { BarChart } from '@/components/charts/BarChart'

// Dummy data shaped from HR Dashboard/PM & TM_Data_for_Dashboard_CLEAN.xlsx ("TM Dashboard
// Metrics — Live Summary" sheet) — real figures TBD once Performance Management confirms the
// live data source (the sheet already exists; connecting it is a fast follow, not a redesign).
const KPIS = [
  { label: 'Total TM Pool', value: '84', sub: 'Talent Management roster', icon: Users2 },
  { label: 'Promotion Rate', value: '18%', sub: '% of TM pool promoted (tracked years)', icon: TrendingUp },
  { label: 'Internal Mobility', value: '22%', sub: 'Changed BU/role, 2025–2026', icon: Repeat },
  { label: 'Committee Involvement', value: '31%', sub: 'On a Strategic Committee', icon: Award },
]

const PERFORMANCE_TREND = { labels: ['H1 2025', 'H2 2025', 'H1 2026'], values: [3.8, 4.0, 4.1] }
const TENURE_BUCKETS = { labels: ['0–2 yrs', '3–5 yrs', '6–10 yrs', '10+ yrs'], values: [22, 31, 19, 12] }

export default function PerformanceManagementPage() {
  return (
    <div>
      <UnitPageHeader title="Performance Management" description="Performance contracts & Talent Management promotion, mobility, tenure" icon={TrendingUp} />

      <div className="p-4 sm:p-8 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {KPIS.map((k) => (
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
            <p className="text-sm font-bold text-slate-800 mb-1">Average Performance Score</p>
            <p className="text-xs text-slate-400 mb-3">Out of 5.0, by half-year</p>
            <BarChart labels={PERFORMANCE_TREND.labels} values={PERFORMANCE_TREND.values} color="#2F6B2B" showLabels height={220} />
          </div>
          <div className="bg-white border border-meristem-100 rounded-2xl p-5">
            <p className="text-sm font-bold text-slate-800 mb-1">TM Pool by Tenure</p>
            <p className="text-xs text-slate-400 mb-3">Average tenure at Meristem</p>
            <BarChart labels={TENURE_BUCKETS.labels} values={TENURE_BUCKETS.values} color="#4F9A43" showLabels height={220} />
          </div>
        </div>

        <div className="bg-white border border-meristem-100 rounded-2xl p-5">
          <p className="text-sm font-bold text-slate-800 mb-1">Organization-wide Performance Contract Review</p>
          <p className="text-xs text-slate-400 mb-3">Q1 2026 completion status</p>
          <div className="w-full bg-meristem-50 rounded-full h-2.5">
            <div className="h-2.5 rounded-full bg-meristem-600" style={{ width: '80%' }} />
          </div>
          <p className="text-xs text-slate-500 mt-2">80% complete</p>
        </div>
      </div>
    </div>
  )
}
