'use client'

import { Users2, TrendingUp, Repeat, Award } from 'lucide-react'
import { UnitPageHeader } from '@/components/hr/UnitPageHeader'
import { BarChart } from '@/components/charts/BarChart'

// Dummy data shaped from HR Dashboard/PM & TM_Data_for_Dashboard_CLEAN.xlsx ("TM Dashboard
// Metrics — Live Summary" sheet) — real figures TBD once Talent Management confirms the live
// data source (the sheet already exists; connecting it is a fast follow, not a redesign). Split
// out from Performance Management, which now only covers contract-review compliance.
const KPIS = [
  { label: 'Total TM Pool', value: '84', sub: 'Talent Management roster', icon: Users2 },
  { label: 'Promotion Rate', value: '18%', sub: '% of TM pool promoted (tracked years)', icon: TrendingUp },
  { label: 'Internal Mobility', value: '22%', sub: 'Changed BU/role, 2025–2026', icon: Repeat },
  { label: 'Committee Involvement', value: '31%', sub: 'On a Strategic Committee', icon: Award },
]

const TENURE_BUCKETS = { labels: ['0–2 yrs', '3–5 yrs', '6–10 yrs', '10+ yrs'], values: [22, 31, 19, 12] }

export default function TalentManagementPage() {
  return (
    <div>
      <UnitPageHeader title="Talent Management" description="TM pool, promotion, mobility & succession" icon={Users2} />

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
            <p className="text-sm font-bold text-slate-800 mb-1">TM Pool by Tenure</p>
            <p className="text-xs text-slate-400 mb-3">Average tenure at Meristem</p>
            <BarChart labels={TENURE_BUCKETS.labels} values={TENURE_BUCKETS.values} color="#B0714F" showLabels height={220} />
          </div>

          <div className="bg-white border border-meristem-100 rounded-2xl p-5">
            <p className="text-sm font-bold text-slate-800 mb-1">Succession Coverage</p>
            <p className="text-xs text-slate-400 mb-3">Critical roles with an identified successor</p>
            <div className="w-full bg-meristem-50 rounded-full h-2.5">
              <div className="h-2.5 rounded-full bg-meristem-600" style={{ width: '64%' }} />
            </div>
            <p className="text-xs text-slate-500 mt-2">14 of 22 critical roles covered (64%) — 8 roles have no identified successor</p>
          </div>
        </div>
      </div>
    </div>
  )
}
