'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Users, TrendingUp, Target, BarChart2,
  BadgeCheck, AlertTriangle, RefreshCw,
  Clock, Timer, ShieldCheck, Star, Award, UserCheck, GraduationCap, CreditCard, CheckCircle,
} from 'lucide-react'
import { KPICard } from '@/components/ui/KPICard'
import { NairaSign } from '@/components/ui/NairaSign'
import { NarrativeInsight } from '@/components/ui/NarrativeInsight'
import { DataTable } from '@/components/ui/DataTable'
import { AlertBadge } from '@/components/ui/AlertBadge'
import { PageHeader } from '@/components/ui/PageHeader'
import { FilterBar } from '@/components/ui/FilterBar'
import { PDFExportButton } from '@/components/ui/PDFExportButton'
import { ParticipationCard } from '@/components/ui/ParticipationCard'
import { SectionExport } from '@/components/ui/SectionExport'
import { LearningIntelligenceLayer } from '@/components/ui/LearningIntelligenceLayer'
import { MetricsKey } from '@/components/ui/MetricsKey'
import { ChartCard } from '@/components/ui/ChartCard'
import { BarChart } from '@/components/charts/BarChart'
import { PieChart } from '@/components/charts/PieChart'
import { LineChart } from '@/components/charts/LineChart'
import type { GroupAnalytics } from '@/lib/analytics'
import { type PeriodFilter, filterToQuery } from '@/lib/filter-types'

type DashData = GroupAnalytics & { narrative: string[] }

function fmt(n: number) {
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `₦${(n / 1_000).toFixed(1)}K`
  return `₦${n.toLocaleString()}`
}
function pct(n: number) { return `${n.toFixed(1)}%` }
function rating(n: number) { return `${n.toFixed(1)}/5` }

export default function ExecutiveDashboard() {
  const [data, setData] = useState<DashData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<PeriodFilter>({ mode: 'all' })

  const load = useCallback(async (f: PeriodFilter) => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/analytics/group${filterToQuery(f)}`)
      if (!res.ok) throw new Error()
      setData(await res.json())
    } catch {
      setError('Could not load dashboard data.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(filter) }, [filter, load])

  const handleFilter = (f: PeriodFilter) => { setFilter(f); }

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (error) return (
    <div className="p-8 space-y-4">
      <AlertBadge variant="error" message={error} />
      <button onClick={() => load(filter)} className="text-sm text-blue-600 flex items-center gap-1.5">
        <RefreshCw className="w-3.5 h-3.5" /> Retry
      </button>
    </div>
  )

  if (!data) return null
  const isEmpty = data.totalLearningInvestment === 0

  const buTableRows = data.businessUnits.map((b) => ({
    'Business Unit': b.name,
    'Training Spend (₦)': b.trainingCost,
    'Subscription Spend (₦)': b.subscriptionCost,
    'Total Investment (₦)': b.totalInvestment,
    'Staff Trained': b.staffTrained,
    'Coverage %': parseFloat(b.coverageRatio.toFixed(1)),
    'Avg Impact (out of 5)': parseFloat(b.avgImpactScore.toFixed(1)),
  }))

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Executive Overview"
        subtitle="Unified view of total learning investment across the organisation"
        actions={
          <div className="flex items-center gap-2">
            <FilterBar availableYears={data.availableYears} value={filter} onChange={handleFilter} />
            <PDFExportButton reportTitle="Executive Overview — Learning Intelligence Dashboard" />
            <button onClick={() => load(filter)} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
          </div>
        }
      />

      <div className="p-8 space-y-8">
        {isEmpty && <AlertBadge variant="info" message="No data uploaded yet. Go to Upload & Data to import your files." />}

        {data.dataQuality.issues.length > 0 && (
          <div className="no-print rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-1">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <p className="text-sm font-semibold text-amber-800">Data Quality: {data.dataQuality.score}/100</p>
            </div>
            {data.dataQuality.issues.map((issue, i) => <p key={i} className="text-xs text-amber-700 ml-6">• {issue}</p>)}
          </div>
        )}

        {/* KPI grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard title="Total Learning Investment" value={fmt(data.totalLearningInvestment)} subtitle={`${pct(data.trainingSharePct)} training · ${pct(data.subscriptionSharePct)} subscriptions`} icon={NairaSign} color="blue" />
          <KPICard title="Training Spend" value={fmt(data.totalTrainingCost)} subtitle="Formal training programmes" icon={GraduationCap} color="purple" />
          <KPICard title="Subscription Spend" value={fmt(data.totalSubscriptionCost)} subtitle="Professional memberships" icon={BadgeCheck} color="green" />
          <KPICard title="Investment per Staff" value={fmt(data.investmentPerStaff)} subtitle={`Across ${data.totalStaffCount.toLocaleString()} total staff`} icon={Users} color="amber" />
          <KPICard title="Staff Coverage" value={pct(data.groupCoverageRatio)} subtitle={`${data.uniqueStaffTrained} of ${data.totalStaffCount} trained`} icon={UserCheck} color={data.groupCoverageRatio >= 70 ? 'green' : data.groupCoverageRatio >= 40 ? 'amber' : 'red'} alert={data.groupCoverageRatio < 30 && data.totalStaffCount > 0} />
          <KPICard title="Avg Impact Score" value={rating(data.avgImpactScore)} subtitle="Based on confidence ratings (max 5)" icon={Star} color={data.avgImpactScore >= 4.0 ? 'green' : data.avgImpactScore >= 3.0 ? 'amber' : 'slate'} />
          <KPICard title="Projected Annual Spend" value={fmt(data.forecastedSpend)} subtitle={`Budget: ${fmt(data.totalBudget)}`} icon={BarChart2} color={data.budgetRisk === 'over-budget' ? 'red' : data.budgetRisk === 'at-risk' ? 'amber' : 'green'} alert={data.budgetRisk === 'over-budget' && data.totalBudget > 0} />
          <KPICard title="Active Subscriptions" value={data.topMembershipOrgs.reduce((s, o) => s + o.count, 0).toString()} subtitle={`${data.uniqueSubscriptionStaff} staff covered`} icon={CreditCard} color="slate" />
          {data.avgRoleRelevance > 0 && <KPICard title="Role Relevance" value={rating(data.avgRoleRelevance)} subtitle="How relevant is training to their role?" icon={Target} color={data.avgRoleRelevance >= 4 ? 'green' : 'amber'} />}
          {data.avgExpectationsMet > 0 && <KPICard title="Expectations Met" value={rating(data.avgExpectationsMet)} subtitle="Extent to which expectations were met" icon={CheckCircle} color={data.avgExpectationsMet >= 4 ? 'green' : 'amber'} />}
          {data.avgVendorRating > 0 && <KPICard title="Vendor Rating" value={rating(data.avgVendorRating)} subtitle="Avg facilitator/provider evaluation" icon={Award} color={data.avgVendorRating >= 4 ? 'green' : data.avgVendorRating >= 3 ? 'amber' : 'red'} />}
          {data.hoursReport.hasData && <KPICard title="Total Learning Hours" value={`${data.hoursReport.totalHours.toLocaleString()} hrs`} subtitle="Across all tracked learning activities" icon={Clock} color="purple" />}
          {data.hoursReport.hasData && <KPICard title="Avg Hours per Staff" value={`${data.hoursReport.avgHoursPerStaff.toFixed(1)} hrs`} subtitle="Average per employee with learning records" icon={Timer} color="purple" />}
          {data.hoursReport.hasData && <KPICard title="40-Hour Compliance" value={`${data.hoursReport.staffMeeting40hPct.toFixed(0)}%`} subtitle={`${data.hoursReport.staffMeeting40h} of ${data.hoursReport.staffMeeting40h + data.hoursReport.staffBelow40h} staff`} icon={ShieldCheck} color={data.hoursReport.staffMeeting40hPct >= 80 ? 'green' : data.hoursReport.staffMeeting40hPct >= 50 ? 'amber' : 'red'} />}
        </div>

        {/* Metrics Key */}
        <MetricsKey />

        {/* Learning Intelligence & Risk Layer — immediately after KPI summary */}
        {!isEmpty && <LearningIntelligenceLayer li={data.learningIntelligence} />}

        {/* Participation stats */}
        {!isEmpty && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ParticipationCard title="Training Participation" participation={data.trainingParticipation} totalStaff={data.totalStaffCount} />
            <ParticipationCard title="Subscription Participation" participation={data.subscriptionParticipation} totalStaff={data.totalStaffCount} />
          </div>
        )}

        {/* Charts */}
        {!isEmpty && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <ChartCard title="Investment Split" rows={[{ Training: data.totalTrainingCost, Subscriptions: data.totalSubscriptionCost }]} filename="investment_split">
                <PieChart labels={['Training', 'Subscriptions']} values={[data.totalTrainingCost, data.totalSubscriptionCost]} donut height={220} />
              </ChartCard>
              <ChartCard title="Monthly Training Spend" className="lg:col-span-2" rows={data.monthlySpend.map((m) => ({ Month: m.month, 'Cost (₦)': m.cost }))} filename="monthly_spend">
                <LineChart labels={data.monthlySpend.map((m) => m.month)} values={data.monthlySpend.map((m) => m.cost)} height={220} />
              </ChartCard>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ChartCard title="Total Investment by Business Unit" rows={data.businessUnits.map((b) => ({ 'Business Unit': b.name, 'Total Investment (₦)': b.totalInvestment }))} filename="bu_investment">
                <BarChart labels={data.businessUnits.map((b) => b.name)} values={data.businessUnits.map((b) => b.totalInvestment)} color="#3b82f6" height={280} horizontal />
              </ChartCard>
              <ChartCard title="Staff Coverage by Business Unit" rows={data.businessUnits.map((b) => ({ 'Business Unit': b.name, 'Coverage %': b.coverageRatio.toFixed(1) }))} filename="bu_coverage">
                <BarChart labels={data.businessUnits.map((b) => b.name)} values={data.businessUnits.map((b) => b.coverageRatio)} color="#22c55e" height={280} horizontal />
              </ChartCard>
            </div>
          </>
        )}

        {/* BU Summary table */}
        {data.businessUnits.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-slate-800">Business Unit Summary</h2>
              <SectionExport rows={buTableRows} filename="bu_summary" />
            </div>
            <DataTable
              columns={[
                { key: 'name', header: 'Business Unit' },
                { key: 'trainingCost', header: 'Training Spend', align: 'right', render: (r) => fmt(r.trainingCost as number) },
                { key: 'subscriptionCost', header: 'Subscriptions', align: 'right', render: (r) => fmt(r.subscriptionCost as number) },
                { key: 'totalInvestment', header: 'Total Investment', align: 'right', render: (r) => fmt(r.totalInvestment as number) },
                { key: 'coverageRatio', header: 'Coverage', align: 'right', render: (r) => pct(r.coverageRatio as number) },
                { key: 'avgImpactScore', header: 'Avg Impact', align: 'right', render: (r) => rating(r.avgImpactScore as number) },
                {
                  key: 'isOverBudget', header: 'Budget', align: 'center',
                  render: (r) => (
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${r.isOverBudget ? 'bg-red-100 text-red-700' : (r.budget as number) === 0 ? 'bg-slate-100 text-slate-500' : 'bg-green-100 text-green-700'}`}>
                      {r.isOverBudget ? 'Over' : (r.budget as number) === 0 ? 'Not set' : 'On track'}
                    </span>
                  ),
                },
              ]}
              data={data.businessUnits as unknown as Record<string, unknown>[]}
            />
          </div>
        )}

        {data.narrative.length > 0 && <NarrativeInsight insights={data.narrative} />}
      </div>
    </div>
  )
}
