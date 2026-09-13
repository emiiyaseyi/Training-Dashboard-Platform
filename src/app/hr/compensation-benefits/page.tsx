'use client'

import { useState } from 'react'
import { Wallet, PiggyBank, Users2, Building2, Baby, TrendingUp, Receipt, Smartphone } from 'lucide-react'
import { UnitPageHeader } from '@/components/hr/UnitPageHeader'
import { MetricListCard } from '@/components/hr/MetricListCard'
import { BarChart } from '@/components/charts/BarChart'
import { FilterBar } from '@/components/ui/FilterBar'
import type { PeriodFilter } from '@/lib/filter-types'

// The loan portfolio and Q1 2026 achievement bullets are real, from HR REPORT — 1ST QPR 2026.
// Total salary paid to date has no data source in this app yet (no payroll system feed exists) —
// shown as an explicit placeholder rather than an invented figure, first because it's the metric
// most requested here.
const TAG_STYLES: Record<string, string> = {
  'HR Report': 'text-meristem-700 bg-meristem-50',
  placeholder: 'text-rose-600 bg-rose-50',
}

const KPIS = [
  { label: 'Total Salary Paid (YTD)', value: '—', sub: 'No payroll data source connected yet', icon: Receipt, tag: 'placeholder' },
  { label: 'Loan Portfolio', value: '₦96.4M', sub: 'Groupwide, active', icon: Wallet, tag: 'HR Report' },
  { label: 'Active Beneficiaries', value: '36', sub: 'Staff with an active loan', icon: Users2, tag: 'HR Report' },
  { label: 'Business Units Covered', value: '7', sub: 'Of 9 Meristem entities', icon: Building2, tag: 'HR Report' },
]

const ACHIEVEMENT_CARDS = [
  { label: 'New Baby Allowance', value: '₦50,000 → ₦100,000', sub: 'Doubled, Q1 2026', icon: Baby },
  { label: 'Salary Review', value: 'Complete', sub: 'Groupwide, Q1 2026', icon: PiggyBank },
  { label: 'Mobile Support Allowance', value: '+100%', sub: 'Groupwide increase, Q1 2026', icon: Smartphone },
  { label: 'PAYE Structure', value: 'Implemented', sub: 'New structure, with staff engagement on tax effect', icon: TrendingUp },
]

const LOAN_BY_BU = {
  labels: ['MSL', 'MWML', 'MSBL', 'MRPSL', 'MCL', 'MFL', 'NESI'],
  values: [41.0, 19.4, 13.6, 9.9, 6.5, 5.0, 1.0],
}

const ACHIEVEMENTS = [
  'Review of New Baby Allowance Benefit: ₦50,000 → ₦100,000',
  'Completion of groupwide salary review',
  'Groupwide mobile support allowance improved by over 100%',
  'Implementation of new PAYE structure, with staff engagement to cushion the tax effect',
  'Commencement of groupwide OEI (Operational Effectiveness Index) review',
]

const BENEFITS_METRICS = ['Benefits Enrollment Rate', 'Cost of Benefits per Employee', 'Loan Repayment Compliance Rate', 'Health Insurance Utilisation', 'Leave Encashment Requests']

export default function CompensationBenefitsPage() {
  const [period, setPeriod] = useState<PeriodFilter>({ mode: 'all' })

  return (
    <div>
      <UnitPageHeader
        title="Compensation & Benefits"
        description="Compensation review, benefits & staff loans"
        icon={<Wallet className="w-5 h-5 text-meristem-700" />}
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

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {ACHIEVEMENT_CARDS.map((a) => (
            <div key={a.label} className="bg-white border border-meristem-100 rounded-2xl p-5">
              <div className="w-9 h-9 rounded-full bg-meristem-100 flex items-center justify-center mb-3">
                <a.icon className="w-4.5 h-4.5 text-meristem-700" />
              </div>
              <p className="text-lg font-bold text-slate-800">{a.value}</p>
              <p className="text-xs font-medium text-slate-600 mt-1">{a.label}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">{a.sub}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="bg-white border border-meristem-100 rounded-2xl p-5 lg:col-span-2">
            <p className="text-sm font-bold text-slate-800 mb-1">Staff Loan Portfolio by Business Unit</p>
            <p className="text-xs text-slate-400 mb-3">₦ millions</p>
            <BarChart labels={LOAN_BY_BU.labels} values={LOAN_BY_BU.values} color="#2F6B2B" showLabels labelSuffix="M" height={240} />
          </div>
          <div className="bg-white border border-meristem-100 rounded-2xl p-5">
            <p className="text-sm font-bold text-slate-800 mb-3">Q1 2026 Achievements</p>
            <ul className="space-y-2.5">
              {ACHIEVEMENTS.map((a) => (
                <li key={a} className="flex items-start gap-2 text-xs text-slate-600">
                  <span className="w-1.5 h-1.5 rounded-full bg-meristem-500 mt-1.5 shrink-0" />
                  {a}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <MetricListCard title="Benefits Administration" metrics={BENEFITS_METRICS} />
          <div className="bg-white border border-meristem-100 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold text-slate-800">Operational Effectiveness Index (OEI)</p>
              <span className="text-[9px] font-bold uppercase tracking-wide text-amber-600 bg-amber-50 rounded-full px-2 py-0.5">in progress</span>
            </div>
            <p className="text-xs text-slate-500">Groupwide OEI review commenced in Q1 2026 — results and a target score aren&apos;t published yet.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
