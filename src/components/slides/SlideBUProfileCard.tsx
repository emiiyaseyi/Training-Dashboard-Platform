import { Building2, Users, TrendingUp } from 'lucide-react'
import { fmt, pct, rating } from '@/lib/slide-format'
import type { BUSummary } from '@/lib/analytics'

// Static report tile matching the deck's "Business Unit Profiles" slide exactly —
// distinct from the interactive BUCard on /business-units, which drives drill-down.
export function SlideBUProfileCard({ bu }: { bu: BUSummary }) {
  return (
    <div className="rounded-xl border border-navy-100 bg-white p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-navy-200 flex items-center justify-center shrink-0">
            <Building2 className="w-4 h-4 text-navy-600" />
          </div>
          <p className="text-sm font-bold text-navy-600 leading-snug truncate">{bu.name}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[10px] text-report-gray">Total Investment</p>
          <p className="text-sm font-bold text-navy-600 tabular-nums">{fmt(bu.totalInvestment)}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <p className="text-[10px] text-report-gray">Training Spend</p>
          <p className="text-sm font-semibold text-navy-600 tabular-nums">{fmt(bu.trainingCost)}</p>
          <p className="text-[10px] text-report-gray mt-0.5">{bu.budget > 0 ? `${pct(bu.budgetUtilisation)} of budget` : 'Budget not set'}</p>
        </div>
        <div>
          <p className="text-[10px] text-report-gray">Subscription Spend</p>
          <p className="text-sm font-semibold text-navy-600 tabular-nums">{fmt(bu.subscriptionCost)}</p>
          <p className="text-[10px] text-report-gray mt-0.5">{bu.subscriptionStaff} members</p>
        </div>
      </div>

      <div className="flex items-center gap-4 pt-2 border-t border-navy-50">
        <div className="flex items-center gap-1.5">
          <Users className="w-3 h-3 text-report-gray" />
          <span className="text-[10px] text-report-gray">Coverage</span>
          <span className="text-xs font-bold text-gold-400 tabular-nums">{bu.totalStaff > 0 ? pct(bu.coverageRatio) : '—'}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <TrendingUp className="w-3 h-3 text-report-gray" />
          <span className="text-[10px] text-report-gray">Impact</span>
          <span className="text-xs font-bold text-report-green tabular-nums">{rating(bu.avgImpactScore)}</span>
        </div>
      </div>
    </div>
  )
}
