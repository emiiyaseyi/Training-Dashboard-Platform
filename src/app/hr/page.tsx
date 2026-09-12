'use client'

import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { ArrowRight, Users, UserSearch, GraduationCap, TrendingUp, Wallet } from 'lucide-react'
import { hasAccess, PAGE_LABELS, PAGE_ROUTES, HR_UNIT_KEYS, type PageKey } from '@/lib/permissions'

// Highlights are placeholders — each unit is meant to own what appears here (per the brief,
// "each unit can decide on what to be seen on the summary page"), swapped for real computed
// figures as each unit's real data source is wired in (L&D's real numbers are the obvious first
// swap, since that data already exists in this app).
const UNIT_SUMMARY: Record<(typeof HR_UNIT_KEYS)[number], {
  icon: typeof Users
  badge: string
  description: string
  highlights: { label: string; value: string }[]
}> = {
  'hr-employee-services': {
    icon: Users, badge: 'bg-slate-100 text-slate-700',
    description: 'Headcount, attrition, engagement & workforce composition',
    highlights: [
      { label: 'Total Headcount', value: '329' },
      { label: 'Attrition Rate (Q1)', value: '4.0%' },
      { label: 'Avg. Tenure', value: '3.2 yrs' },
    ],
  },
  'hr-talent-acquisition': {
    icon: UserSearch, badge: 'bg-sky-100 text-sky-700',
    description: 'Hiring pipeline, time to fill, cost of hire',
    highlights: [
      { label: 'Avg. Time to Hire', value: '5 wks' },
      { label: 'Offer Acceptance', value: '—' },
      { label: 'Open Requisitions', value: '—' },
    ],
  },
  'hr-learning-development': {
    icon: GraduationCap, badge: 'bg-emerald-100 text-emerald-700',
    description: 'Training investment, coverage & impact — the existing Learning Intelligence dashboard',
    highlights: [
      { label: 'Training Investment YTD', value: '₦22.5M' },
      { label: 'Coverage Ratio', value: '5.5%' },
      { label: 'Impact Score', value: '4.3 / 5' },
    ],
  },
  'hr-performance-management': {
    icon: TrendingUp, badge: 'bg-amber-100 text-amber-700',
    description: 'Performance contracts, Talent Management promotion & mobility',
    highlights: [
      { label: 'Promotion Rate', value: '—' },
      { label: 'Internal Mobility', value: '—' },
      { label: 'Contract Review', value: '80%' },
    ],
  },
  'hr-compensation-benefits': {
    icon: Wallet, badge: 'bg-violet-100 text-violet-700',
    description: 'Compensation review, benefits & staff loans',
    highlights: [
      { label: 'Salary Review', value: 'Complete' },
      { label: 'Staff Loan Portfolio', value: '₦96.4M' },
      { label: 'Loan Beneficiaries', value: '36' },
    ],
  },
}

export default function HrSummaryPage() {
  const { data: session } = useSession()
  if (!session?.user) return null

  const isSuperAdmin = session.user.isSuperAdmin
  const visibleUnits: (typeof HR_UNIT_KEYS)[number][] = HR_UNIT_KEYS.filter(
    (key) => isSuperAdmin || hasAccess(session.user.permissions?.[key], 'view')
  )

  return (
    <div className="p-4 sm:p-8 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">HR Summary</h1>
        <p className="text-sm text-slate-500 mt-1">
          Top highlights across every HR unit — click any card to open that unit&apos;s full report.
        </p>
      </div>

      {visibleUnits.length === 0 ? (
        <div className="bg-white border border-meristem-100 rounded-2xl p-8 text-center">
          <p className="text-sm text-slate-500">You don&apos;t have access to any HR unit yet. Contact your administrator.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleUnits.map((key) => {
            const unit = UNIT_SUMMARY[key]
            const Icon = unit.icon
            return (
              <Link
                key={key}
                href={PAGE_ROUTES[key as PageKey]}
                className="bg-white border border-meristem-100 rounded-2xl p-5 hover:shadow-md hover:border-meristem-300 transition-all group flex flex-col"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className={`w-11 h-11 rounded-full flex items-center justify-center ${unit.badge}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-meristem-600 group-hover:translate-x-0.5 transition-all mt-1" />
                </div>
                <p className="text-sm font-bold text-slate-800">{PAGE_LABELS[key].replace('HR — ', '')}</p>
                <p className="text-xs text-slate-500 mt-1 mb-4">{unit.description}</p>

                <div className="mt-auto grid grid-cols-3 gap-2 pt-3 border-t border-meristem-50">
                  {unit.highlights.map((h) => (
                    <div key={h.label}>
                      <p className="text-sm font-bold text-meristem-800 tabular-nums">{h.value}</p>
                      <p className="text-[10px] text-slate-400 leading-tight mt-0.5">{h.label}</p>
                    </div>
                  ))}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
