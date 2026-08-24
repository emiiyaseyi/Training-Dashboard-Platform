import {
  Users, Target, BarChart2, BadgeCheck, UserCheck, GraduationCap,
  CreditCard, CheckCircle, Star, Award, ShieldCheck,
} from 'lucide-react'
import { NairaSign } from '@/components/ui/NairaSign'
import { ReportTile } from './ReportTile'
import { SlideShell } from './SlideShell'
import { fmt, pct, rating } from '@/lib/slide-format'
import type { GroupAnalytics } from '@/lib/analytics'

export function Slide1ExecutiveOverview({ data, pageNumber, periodLabel }: { data: GroupAnalytics; pageNumber: number; periodLabel: string }) {
  return (
    <SlideShell title="Executive Overview" subtitle="Group-wide learning investment at a glance" pageNumber={pageNumber} periodLabel={periodLabel}>
      <div className="grid grid-cols-4 gap-3 h-full content-start">
        <ReportTile icon={NairaSign} title="Total Learning Investment" value={fmt(data.totalLearningInvestment)} subtitle={`${pct(data.trainingSharePct)} training · ${pct(data.otherSharePct)} strategic learnings · ${pct(data.subscriptionSharePct)} subscriptions`} />
        <ReportTile icon={GraduationCap} title="Formal Training Spend" value={fmt(data.totalTrainingCost)} subtitle="Internal + External programmes" valueColor="text-navy-600" />
        <ReportTile icon={Award} title="Strategic Learnings" value={fmt(data.totalOtherTrainingCost)} subtitle={data.otherTrainingTypeNames.join(', ') || 'Summits, Leadership Cafe, Workshops'} valueColor="text-gold-400" />
        <ReportTile icon={BadgeCheck} title="Subscription Spend" value={fmt(data.totalSubscriptionCost)} subtitle="Professional memberships" valueColor="text-report-green" />

        <ReportTile icon={Users} title="Investment per Staff" value={fmt(data.investmentPerStaff)} subtitle={`Across ${data.totalStaffCount.toLocaleString()} total staff`} valueColor="text-gold-400" />
        <ReportTile icon={UserCheck} title="Staff Coverage" value={pct(data.groupCoverageRatio)} subtitle={`${data.uniqueStaffTrained} of ${data.totalStaffCount} trained`} valueColor={data.groupCoverageRatio >= 70 ? 'text-report-green' : data.groupCoverageRatio >= 40 ? 'text-gold-400' : 'text-report-red'} />
        <ReportTile icon={Star} title="Avg Impact Score" value={rating(data.avgImpactScore)} subtitle="Based on confidence ratings (max 5)" valueColor={data.avgImpactScore >= 4 ? 'text-report-green' : 'text-gold-400'} />
        <ReportTile icon={BarChart2} title="Projected Annual Spend" value={fmt(data.forecastedSpend)} subtitle={`Budget: ${fmt(data.totalBudget)}`} valueColor={data.budgetRisk === 'over-budget' ? 'text-report-red' : 'text-report-green'} />

        <ReportTile icon={CreditCard} title="Number of Subscriptions" value={data.topMembershipOrgs.reduce((s, o) => s + o.count, 0).toString()} subtitle={`${data.uniqueSubscriptionStaff} staff covered`} />
        <ReportTile icon={Target} title="Trainings vs Role Relevance" value={rating(data.avgRoleRelevance)} subtitle="How relevant is training to their role?" valueColor={data.avgRoleRelevance >= 4 ? 'text-report-green' : 'text-gold-400'} />
        <ReportTile icon={CheckCircle} title="Trainings vs Expectations Met" value={rating(data.avgExpectationsMet)} subtitle="Extent to which expectations were met" valueColor={data.avgExpectationsMet >= 4 ? 'text-report-green' : 'text-gold-400'} />
        <ReportTile icon={ShieldCheck} title={`${data.hoursReport.hoursThreshold}-Hour Compliance`} value={`${data.hoursReport.staffMeeting40hPct.toFixed(0)}%`} subtitle={`${data.hoursReport.staffMeeting40h} of ${data.totalStaffCount} staff`} valueColor={data.hoursReport.staffMeeting40hPct >= 80 ? 'text-report-green' : data.hoursReport.staffMeeting40hPct >= 50 ? 'text-gold-400' : 'text-report-red'} />
      </div>
    </SlideShell>
  )
}
