import { Clock, GraduationCap, Users, Timer } from 'lucide-react'
import { ReportTile } from './ReportTile'
import { SlideShell } from './SlideShell'
import { ParticipationCard } from '@/components/ui/ParticipationCard'
import type { GroupAnalytics } from '@/lib/analytics'

export function Slide2LearningHours({ data, pageNumber, periodLabel }: { data: GroupAnalytics; pageNumber: number; periodLabel: string }) {
  const h = data.hoursReport
  return (
    <SlideShell title="Learning Hours Delivered" subtitle="Time invested across formal training and knowledge sharing" pageNumber={pageNumber} periodLabel={periodLabel}>
      <div className="grid grid-cols-4 gap-3 mb-4">
        <ReportTile icon={Clock} title="Total Learning Hours" value={`${h.totalHours.toLocaleString(undefined, { maximumFractionDigits: 1 })} hrs`} subtitle="Across all tracked learning activities" />
        <ReportTile icon={GraduationCap} title="Training Hours" value={`${h.totalFormalHours.toLocaleString(undefined, { maximumFractionDigits: 1 })} hrs`} subtitle="From formal training programmes" />
        <ReportTile icon={Users} title="KSS Hours" value={`${h.totalKSSHours.toLocaleString(undefined, { maximumFractionDigits: 1 })} hrs`} subtitle="From knowledge sharing sessions" valueColor="text-report-green" />
        <ReportTile icon={Timer} title="Avg Hours per Staff" value={`${h.avgHoursPerStaff.toFixed(1)} hrs`} subtitle="Average per employee with learning records" valueColor="text-gold-400" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <ParticipationCard title="Training Participation" participation={data.trainingParticipation} totalStaff={data.totalStaffCount} />
        <ParticipationCard title="Subscription Coverage" participation={data.subscriptionParticipation} totalStaff={data.totalStaffCount} variant="subscription" />
      </div>
    </SlideShell>
  )
}
