'use client'

import { TrendingUp, ClipboardCheck, Star, Users2 } from 'lucide-react'
import { UnitPageHeader } from '@/components/hr/UnitPageHeader'
import { BarChart } from '@/components/charts/BarChart'

// Dummy data shaped from HR REPORT — 1ST QPR 2026 (performance contract review completion) —
// real figures TBD once Performance Management confirms the live data source. Talent Management
// (TM pool, promotion, mobility, succession) is its own unit now — see /hr/talent-management.
const KPIS = [
  { label: 'Contracts Reviewed', value: '80%', sub: 'Group‑wide, Q1 2026', icon: ClipboardCheck },
  { label: 'Avg. Rating', value: '4.1 / 5', sub: 'H1 2026, highest on record', icon: Star },
  { label: 'Contracts Outstanding', value: '20%', sub: 'Target: 100% by quarter end', icon: TrendingUp },
  { label: 'Staff in Scope', value: '329', sub: 'Group‑wide headcount', icon: Users2 },
]

const RATING_TREND = { labels: ['H1 2025', 'H2 2025', 'H1 2026'], values: [3.8, 4.0, 4.1] }

export default function PerformanceManagementPage() {
  return (
    <div>
      <UnitPageHeader title="Performance Management" description="Performance contracts, reviews & ratings" icon={TrendingUp} />

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
            <p className="text-sm font-bold text-slate-800 mb-1">Average Performance Rating</p>
            <p className="text-xs text-slate-400 mb-3">Out of 5.0, by half‑year</p>
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
      </div>
    </div>
  )
}
