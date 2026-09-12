'use client'

import { Wallet, PiggyBank, Users2, Building2 } from 'lucide-react'
import { UnitPageHeader } from '@/components/hr/UnitPageHeader'
import { BarChart } from '@/components/charts/BarChart'

// Dummy data shaped from HR REPORT — 1ST QPR 2026, slide 15 (Staff Loan summary) — real figures
// TBD from Compensation & Benefits once their data source is confirmed.
const KPIS = [
  { label: 'Loan Portfolio', value: '₦96.4M', sub: 'Groupwide, active', icon: Wallet },
  { label: 'Active Beneficiaries', value: '36', sub: 'Staff with an active loan', icon: Users2 },
  { label: 'Business Units Covered', value: '7', sub: 'Of 9 Meristem entities', icon: Building2 },
  { label: 'Salary Review', value: 'Complete', sub: 'Groupwide, Q1 2026', icon: PiggyBank },
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
]

export default function CompensationBenefitsPage() {
  return (
    <div>
      <UnitPageHeader title="Compensation & Benefits" description="Compensation review, benefits & staff loans" icon={Wallet} />

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
      </div>
    </div>
  )
}
