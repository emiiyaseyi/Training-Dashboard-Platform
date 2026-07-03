import type { StaffParticipation } from '@/lib/analytics'
import { SectionExport } from './SectionExport'

interface ParticipationCardProps {
  title: string
  participation: StaffParticipation
  totalStaff?: number
  variant?: 'training' | 'subscription'
}

function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="w-full bg-slate-100 rounded-full h-2 mt-1">
      <div className={`h-2 rounded-full ${color}`} style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  )
}

export function ParticipationCard({ title, participation, totalStaff, variant = 'training' }: ParticipationCardProps) {
  const isSub = variant === 'subscription'
  const exportRows = participation.staffList.map((s) => ({
    'Staff ID': s.staffId,
    'Staff Name': s.staffName,
    'Training / Subscription Count': s.count,
    'Category': s.count === 1 ? 'Single' : 'Multiple (2+)',
  }))

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
        <SectionExport rows={exportRows} filename={`participation_${title.replace(/\s+/g, '_')}`} label="Export" />
      </div>

      <div className="space-y-4">
        {/* One */}
        <div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-600">
              {isSub
                ? <>Hold exactly <strong>1</strong> subscription</>
                : <>Completed exactly <strong>1</strong></>}
            </span>
            <span className="font-semibold text-slate-800 tabular-nums">
              {participation.oneTraining.toLocaleString()}
              <span className="text-slate-400 font-normal ml-1">
                ({participation.oneTrainingPct.toFixed(1)}%)
              </span>
            </span>
          </div>
          <Bar pct={participation.oneTrainingPct} color="bg-blue-400" />
        </div>

        {/* Two or more */}
        <div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-600">
              {isSub
                ? <>Hold <strong>2 or more</strong> subscriptions</>
                : <>Completed <strong>2 or more</strong></>}
            </span>
            <span className="font-semibold text-slate-800 tabular-nums">
              {participation.twoPlus.toLocaleString()}
              <span className="text-slate-400 font-normal ml-1">
                ({participation.twoPlusPct.toFixed(1)}%)
              </span>
            </span>
          </div>
          <Bar pct={participation.twoPlusPct} color="bg-green-400" />
        </div>

        {totalStaff != null && totalStaff > 0 && (
          <p className="text-xs text-slate-400 pt-1 border-t border-slate-100">
            Percentages based on {(participation.oneTraining + participation.twoPlus).toLocaleString()} trained staff
            out of {totalStaff.toLocaleString()} total headcount
          </p>
        )}
      </div>
    </div>
  )
}
