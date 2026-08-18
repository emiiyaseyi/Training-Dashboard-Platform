import { Users, UserCheck, UserX } from 'lucide-react'
import { NairaSign } from '@/components/ui/NairaSign'
import { ReportTile } from './ReportTile'
import { SlideShell } from './SlideShell'
import { fmt, pct } from '@/lib/slide-format'
import type { GroupAnalytics } from '@/lib/analytics'

export function Slide8TalentMember({ data, pageNumber, periodLabel }: { data: GroupAnalytics; pageNumber: number; periodLabel: string }) {
  const tm = data.talentMember
  const trainedPct = tm.totalHeadcount > 0 ? (tm.staffTrained / tm.totalHeadcount) * 100 : 0
  const notTrainedPct = tm.totalHeadcount > 0 ? (tm.staffNotTrained / tm.totalHeadcount) * 100 : 0

  return (
    <SlideShell title="Talent Member (TM) Trainings" subtitle="Coverage and investment for the Talent Member population" pageNumber={pageNumber} periodLabel={periodLabel}>
      <div className="grid grid-cols-4 gap-3 mb-4">
        <ReportTile icon={Users} title="Total Talent Members" value={tm.totalHeadcount.toLocaleString()} subtitle="Configured TM population" />
        <ReportTile icon={UserCheck} title="Staff Trained" value={tm.staffTrained.toLocaleString()} subtitle={tm.totalHeadcount > 0 ? `${pct(trainedPct)} of TM population` : 'No TM headcount configured'} valueColor="text-report-green" />
        <ReportTile icon={UserX} title="Yet to be Trained" value={tm.staffNotTrained.toLocaleString()} subtitle={tm.totalHeadcount > 0 ? `${pct(notTrainedPct)} of TM population` : 'No TM headcount configured'} valueColor={tm.staffNotTrained > 0 ? 'text-report-red' : 'text-report-green'} />
        <ReportTile icon={NairaSign} title="Total Spend" value={fmt(tm.totalSpend)} subtitle="Counts toward Formal Training Spend" valueColor="text-gold-400" />
      </div>

      <div className="rounded-xl border border-navy-200 bg-navy-100 p-5">
        <h3 className="text-sm font-semibold text-navy-600 mb-4">TM Training Coverage</h3>
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">Trained</span>
              <span className="font-semibold text-slate-800 tabular-nums">
                {tm.staffTrained.toLocaleString()} <span className="text-slate-400 font-normal ml-1">({trainedPct.toFixed(1)}%)</span>
              </span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2 mt-1">
              <div className="h-2 rounded-full bg-report-green" style={{ width: `${Math.min(100, trainedPct)}%` }} />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">Yet to be Trained</span>
              <span className="font-semibold text-slate-800 tabular-nums">
                {tm.staffNotTrained.toLocaleString()} <span className="text-slate-400 font-normal ml-1">({notTrainedPct.toFixed(1)}%)</span>
              </span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2 mt-1">
              <div className="h-2 rounded-full bg-report-red" style={{ width: `${Math.min(100, notTrainedPct)}%` }} />
            </div>
          </div>
          {tm.totalHeadcount === 0 && (
            <p className="text-xs text-report-gray pt-1 border-t border-slate-200">
              Set the Total TM Headcount in Admin Settings to see coverage percentages.
            </p>
          )}
        </div>
      </div>
    </SlideShell>
  )
}
