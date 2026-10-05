import { Building2, Users, TrendingUp, ClipboardCheck } from 'lucide-react'
import { fmt, pct, rating } from '@/lib/slide-format'
import type { BUSummary } from '@/lib/analytics'

// Static report tile matching the deck's "Business Unit Profiles" slide exactly (font sizes
// pulled directly from the source PPTX XML) — distinct from the interactive BUCard on
// /business-units, which drives drill-down.
export function SlideBUProfileCard({ bu }: { bu: BUSummary }) {
  return (
    <div className="rounded-xl border border-navy-100 bg-white flex flex-col" style={{ padding: 14 }}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="rounded-lg bg-navy-200 flex items-center justify-center shrink-0" style={{ width: 28, height: 28 }}>
            <Building2 className="text-navy-600" style={{ width: 15, height: 15 }} />
          </div>
          <p className="font-bold text-navy-700 leading-snug truncate" style={{ fontSize: 18 }}>{bu.name}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-report-gray" style={{ fontSize: 13 }}>Total Learning Investment</p>
          <p className="font-bold tabular-nums" style={{ fontSize: 26, lineHeight: '30px', color: '#1E2761' }}>{fmt(bu.totalInvestment)}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3" style={{ marginTop: 10 }}>
        <div>
          <p className="text-report-gray" style={{ fontSize: 13 }}>Formal Training</p>
          <p className="font-bold text-navy-700 tabular-nums" style={{ fontSize: 18, lineHeight: '22px' }}>{fmt(bu.trainingCost)}</p>
          <p className="text-report-gray" style={{ fontSize: 12, marginTop: 2 }}>{bu.budget > 0 ? `${pct((bu.trainingCost / bu.budget) * 100)} of budget` : 'Budget not set'}</p>
        </div>
        <div>
          <p className="text-report-gray" style={{ fontSize: 13 }}>Strategic Learnings</p>
          <p className="font-bold tabular-nums" style={{ fontSize: 18, lineHeight: '22px', color: '#C9A24B' }}>{fmt(bu.otherInvestmentCost)}</p>
          <p className="text-report-gray" style={{ fontSize: 12, marginTop: 2 }}>{bu.otherStaffTrained} staff</p>
        </div>
        <div>
          <p className="text-report-gray" style={{ fontSize: 13 }}>Subscription Spend</p>
          <p className="font-bold text-navy-700 tabular-nums" style={{ fontSize: 18, lineHeight: '22px' }}>{fmt(bu.subscriptionCost)}</p>
          <p className="text-report-gray" style={{ fontSize: 12, marginTop: 2 }}>{bu.subscriptionStaff} members</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 border-t border-navy-50" style={{ marginTop: 10, paddingTop: 10 }}>
        <div>
          <div className="flex items-center gap-1.5">
            <Users className="text-report-gray" style={{ width: 12, height: 12 }} />
            <span className="text-report-gray" style={{ fontSize: 13 }}>Coverage</span>
          </div>
          <p className="font-bold tabular-nums" style={{ fontSize: 22, lineHeight: '26px', color: '#C9A24B' }}>{bu.totalStaff > 0 ? pct(bu.coverageRatio) : '—'}</p>
          <p className="text-report-gray" style={{ fontSize: 11, marginTop: 2 }}>{bu.eligibleStaffTrained} trained (1+ training)</p>
        </div>
        <div>
          <div className="flex items-center gap-1.5">
            <TrendingUp className="text-report-gray" style={{ width: 12, height: 12 }} />
            <span className="text-report-gray" style={{ fontSize: 13 }}>Avg Impact Score</span>
          </div>
          <p className="font-bold tabular-nums" style={{ fontSize: 22, lineHeight: '26px', color: '#1F9D6C' }}>{rating(bu.avgImpactScore)}</p>
          <p className="text-report-gray" style={{ fontSize: 11, marginTop: 2 }}>Self-reported confidence</p>
        </div>
        <div>
          <div className="flex items-center gap-1.5">
            <ClipboardCheck className="text-report-gray" style={{ width: 12, height: 12 }} />
            <span className="text-report-gray" style={{ fontSize: 13 }}>Post-Training Impact</span>
          </div>
          <p className="font-bold tabular-nums" style={{ fontSize: 22, lineHeight: '26px', color: '#1E2761' }}>{bu.postTrainingImpactScore > 0 ? rating(bu.postTrainingImpactScore) : '—'}</p>
          <p className="text-report-gray" style={{ fontSize: 11, marginTop: 2 }}>From line manager reviews</p>
        </div>
      </div>
    </div>
  )
}
