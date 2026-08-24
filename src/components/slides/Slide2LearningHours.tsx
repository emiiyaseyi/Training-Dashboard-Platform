import { Clock, GraduationCap, Users, Timer, ClipboardCheck } from 'lucide-react'
import { ReportTile } from './ReportTile'
import { SlideShell } from './SlideShell'
import { ParticipationCard } from '@/components/ui/ParticipationCard'
import type { GroupAnalytics } from '@/lib/analytics'

export function Slide2LearningHours({ data, pageNumber, periodLabel }: { data: GroupAnalytics; pageNumber: number; periodLabel: string }) {
  const h = data.hoursReport
  return (
    <SlideShell title="Learning Hours Delivered" subtitle="Time invested across formal training and knowledge sharing" pageNumber={pageNumber} periodLabel={periodLabel}>
      <div className="h-full flex flex-col">
        <div className="grid grid-cols-5 gap-3 mb-4 shrink-0">
          <ReportTile icon={Clock} title="Total Learning Hours" value={`${h.totalHours.toLocaleString(undefined, { maximumFractionDigits: 1 })} hrs`} subtitle="Across all tracked learning activities" />
          <ReportTile icon={GraduationCap} title="Training Hours" value={`${h.totalFormalHours.toLocaleString(undefined, { maximumFractionDigits: 1 })} hrs`} subtitle="From formal training programmes" />
          <ReportTile icon={Users} title="KSS Hours" value={`${h.totalKSSHours.toLocaleString(undefined, { maximumFractionDigits: 1 })} hrs`} subtitle="From knowledge sharing sessions" valueColor="text-report-green" />
          <ReportTile icon={Timer} title="Avg Hours per Staff" value={`${h.avgHoursPerStaff.toFixed(1)} hrs`} subtitle="Average per employee with learning records" valueColor="text-gold-400" />
          <ReportTile
            icon={ClipboardCheck}
            title="Post-Training Impact"
            value={data.postTrainingReviewCount > 0 ? `${data.postTrainingImpactScore.toFixed(1)}/5` : 'No data'}
            subtitle={data.postTrainingReviewCount > 0 ? 'From line manager reviews' : 'Upload manager reviews to populate'}
            valueColor="text-report-green"
          />
        </div>

        <div className="grid grid-cols-2 gap-4 flex-1 min-h-0">
          <ParticipationCard title="Training Participation" participation={data.trainingParticipation} totalStaff={data.totalStaffCount} />
          <ParticipationCard title="Subscription Coverage" participation={data.subscriptionParticipation} totalStaff={data.totalStaffCount} variant="subscription" />
        </div>
      </div>
    </SlideShell>
  )
}
