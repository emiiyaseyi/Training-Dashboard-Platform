'use client'

import { useEffect, useState, useCallback } from 'react'
import { BookOpen, Users, TrendingUp, Target, BarChart2, RefreshCw, Clock, Timer, ShieldCheck, Star, Award, Activity, CheckCircle } from 'lucide-react'
import { NairaSign } from '@/components/ui/NairaSign'
import { KPICard } from '@/components/ui/KPICard'
import { DataTable } from '@/components/ui/DataTable'
import { AlertBadge } from '@/components/ui/AlertBadge'
import { PageHeader } from '@/components/ui/PageHeader'
import { FilterBar } from '@/components/ui/FilterBar'
import { PDFExportButton } from '@/components/ui/PDFExportButton'
import { ParticipationCard } from '@/components/ui/ParticipationCard'
import { SectionExport } from '@/components/ui/SectionExport'
import { LearningIntelligenceLayer } from '@/components/ui/LearningIntelligenceLayer'
import { MetricsKey } from '@/components/ui/MetricsKey'
import { BarChart } from '@/components/charts/BarChart'
import { LineChart } from '@/components/charts/LineChart'
import { PieChart } from '@/components/charts/PieChart'
import { ScatterChart } from '@/components/charts/ScatterChart'
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

export default function TrainingDashboard() {
  const [data, setData] = useState<DashData | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<PeriodFilter>({ mode: 'all' })

  const load = useCallback(async (f: PeriodFilter) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/analytics/group${filterToQuery(f)}`)
      setData(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(filter) }, [filter, load])

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (!data) return null

  const isEmpty = data.totalTrainingCost === 0
  const avgCostPerStaff = data.uniqueStaffTrained > 0 ? data.totalTrainingCost / data.uniqueStaffTrained : 0
  const trainingFrequency = data.uniqueStaffTrained > 0
    ? (data.topTrainings.reduce((s, t) => s + t.count, 0) / data.uniqueStaffTrained)
    : 0
  const scatterPoints = data.businessUnits
    .filter((b) => b.trainingCost > 0 || b.avgImpactScore > 0)
    .map((b) => ({ x: b.trainingCost, y: b.avgImpactScore, label: b.name }))

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Training Analytics"
        subtitle="Formal training programme spend, coverage, and impact"
        actions={
          <div className="flex items-center gap-2">
            <FilterBar availableYears={data.availableYears} value={filter} onChange={setFilter} />
            <PDFExportButton reportTitle="Training Analytics — Learning Intelligence Dashboard" />
            <button onClick={() => load(filter)} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
          </div>
        }
      />

      <div className="p-8 space-y-8">
        {isEmpty && <AlertBadge variant="info" message="No training cost data uploaded yet." />}

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard title="Total Training Cost" value={fmt(data.totalTrainingCost)} subtitle="Period spend" icon={NairaSign} color="blue" />
          <KPICard title="Staff Trained" value={data.uniqueStaffTrained.toLocaleString()} subtitle={`Coverage: ${pct(data.groupCoverageRatio)}`} icon={Users} color="green" />
          <KPICard title="Avg Cost per Staff" value={fmt(avgCostPerStaff)} subtitle="Per trained employee" icon={BarChart2} color="purple" />
          <KPICard title="Avg Impact Score" value={data.avgImpactScore === 0 ? '—' : rating(data.avgImpactScore)} subtitle={data.avgImpactScore === 0 ? 'Upload feedback data' : 'Avg confidence rating (max 5)'} icon={Star} color={data.avgImpactScore >= 4.0 ? 'green' : data.avgImpactScore >= 3.0 ? 'amber' : 'slate'} />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard title="Budget Utilisation" value={data.totalBudget > 0 ? pct((data.totalTrainingCost / data.totalBudget) * 100) : 'Not set'} subtitle={`Budget: ${fmt(data.totalBudget)}`} icon={Target} color={data.budgetRisk === 'over-budget' ? 'red' : 'amber'} alert={data.budgetRisk === 'over-budget' && data.totalBudget > 0} />
          <KPICard title="Projected Spend" value={fmt(data.forecastedSpend)} subtitle="End of year forecast" icon={TrendingUp} color={data.budgetRisk === 'over-budget' ? 'red' : 'blue'} />
          <KPICard title="Training Programmes" value={data.topTrainings.length.toString()} subtitle="Unique programmes" icon={BookOpen} color="purple" />
          <KPICard title="Avg Trainings / Staff" value={trainingFrequency.toFixed(1)} subtitle="Training frequency" icon={Activity} color="slate" />
          {data.avgRoleRelevance > 0 && <KPICard title="Role Relevance" value={rating(data.avgRoleRelevance)} subtitle="Training relevance to current role" icon={Target} color={data.avgRoleRelevance >= 4 ? 'green' : 'amber'} />}
          {data.avgExpectationsMet > 0 && <KPICard title="Expectations Met" value={rating(data.avgExpectationsMet)} subtitle="Extent expectations were met" icon={CheckCircle} color={data.avgExpectationsMet >= 4 ? 'green' : 'amber'} />}
          {data.avgVendorRating > 0 && <KPICard title="Vendor Rating" value={rating(data.avgVendorRating)} subtitle="Avg facilitator/provider evaluation" icon={Award} color={data.avgVendorRating >= 4 ? 'green' : data.avgVendorRating >= 3 ? 'amber' : 'red'} />}
          {data.hoursReport.hasData && <KPICard title="Total Learning Hours" value={`${data.hoursReport.totalHours.toLocaleString()} hrs`} subtitle="Across all tracked learning activities" icon={Clock} color="purple" />}
          {data.hoursReport.hasData && <KPICard title="Avg Hours per Staff" value={`${data.hoursReport.avgHoursPerStaff.toFixed(1)} hrs`} subtitle="Average per employee with learning records" icon={Timer} color="purple" />}
          {data.hoursReport.hasData && <KPICard title="40-Hour Compliance" value={`${data.hoursReport.staffMeeting40hPct.toFixed(0)}%`} subtitle={`${data.hoursReport.staffMeeting40h} staff meeting requirement`} icon={ShieldCheck} color={data.hoursReport.staffMeeting40hPct >= 80 ? 'green' : data.hoursReport.staffMeeting40hPct >= 50 ? 'amber' : 'red'} />}
          {data.hoursReport.hasData && data.hoursReport.costPerHour > 0 && <KPICard title="Cost per Hour" value={fmt(data.hoursReport.costPerHour)} subtitle="Training cost per learning hour" icon={NairaSign} color="amber" />}
        </div>

        {/* Metrics Key */}
        <MetricsKey />

        {/* Learning Intelligence & Risk Layer — immediately after KPI summary */}
        {!isEmpty && <LearningIntelligenceLayer li={data.learningIntelligence} showSubscription={false} />}

        {/* Participation */}
        {!isEmpty && (
          <ParticipationCard title="Training Participation" participation={data.trainingParticipation} totalStaff={data.totalStaffCount} />
        )}

        {/* Charts */}
        {!isEmpty && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-slate-800">Monthly Training Spend</h2>
                  <SectionExport rows={data.monthlySpend.map((m) => ({ Month: m.month, 'Cost (₦)': m.cost }))} filename="training_monthly_spend" />
                </div>
                <LineChart labels={data.monthlySpend.map((m) => m.month)} values={data.monthlySpend.map((m) => m.cost)} height={240} />
              </div>
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-slate-800">Training Spend by Business Unit</h2>
                  <SectionExport rows={data.businessUnits.map((b) => ({ 'Business Unit': b.name, 'Spend (₦)': b.trainingCost }))} filename="training_bu_spend" />
                </div>
                <BarChart labels={data.businessUnits.map((b) => b.name)} values={data.businessUnits.map((b) => b.trainingCost)} color="#3b82f6" height={240} horizontal={data.businessUnits.length > 4} />
              </div>
            </div>

            {data.avgImpactScore > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-semibold text-slate-800">Impact Score Distribution</h2>
                    <SectionExport rows={data.impactDistribution.map((d) => ({ Range: d.range, Count: d.count }))} filename="impact_distribution" />
                  </div>
                  <BarChart labels={data.impactDistribution.map((d) => d.range)} values={data.impactDistribution.map((d) => d.count)} color="#a855f7" height={220} />
                </div>
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-semibold text-slate-800">Application Rates</h2>
                    <SectionExport rows={data.applicationRates.map((a) => ({ Category: a.category, Count: a.count }))} filename="application_rates" />
                  </div>
                  {data.applicationRates.length > 0
                    ? <PieChart labels={data.applicationRates.map((a) => a.category)} values={data.applicationRates.map((a) => a.count)} donut height={220} />
                    : <p className="text-sm text-slate-400 text-center py-8">No feedback data</p>}
                </div>
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-semibold text-slate-800">Cost vs Impact (BU)</h2>
                    <SectionExport rows={scatterPoints.map((p) => ({ 'Business Unit': p.label, 'Training Cost (₦)': p.x, 'Impact Score %': p.y }))} filename="roi_scatter" />
                  </div>
                  {scatterPoints.length > 0
                    ? <ScatterChart points={scatterPoints} height={220} />
                    : <p className="text-sm text-slate-400 text-center py-8">No data</p>}
                </div>
              </div>
            )}
          </>
        )}

        {/* Tables */}
        {data.topTrainings.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-slate-800">Top Training Programmes by Spend</span>
              <SectionExport rows={data.topTrainings.map((t) => ({ Programme: t.training, Participants: t.count, 'Total Cost (₦)': t.totalCost, 'Avg Cost (₦)': Math.round(t.totalCost / t.count) }))} filename="top_trainings" />
            </div>
            <DataTable
              columns={[
                { key: 'training', header: 'Training Programme' },
                { key: 'count', header: 'Participants', align: 'right' },
                { key: 'totalCost', header: 'Total Cost', align: 'right', render: (r) => fmt(r.totalCost as number) },
                { key: 'totalCost', header: 'Avg Cost / Participant', align: 'right', render: (r) => fmt((r.totalCost as number) / (r.count as number)) },
              ]}
              data={data.topTrainings as unknown as Record<string, unknown>[]}
            />
          </div>
        )}

        {data.businessUnits.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-slate-800">Business Unit Training Detail</span>
              <SectionExport rows={data.businessUnits.map((b) => ({ 'Business Unit': b.name, 'Spend (₦)': b.trainingCost, 'Budget (₦)': b.budget, 'Utilisation %': b.budget > 0 ? b.budgetUtilisation.toFixed(1) : 'N/A', 'Staff Trained': b.staffTrained, 'Coverage %': b.coverageRatio.toFixed(1), 'Avg Impact (out of 5)': b.avgImpactScore.toFixed(1) }))} filename="bu_training_detail" />
            </div>
            <DataTable
              columns={[
                { key: 'name', header: 'Business Unit' },
                { key: 'trainingCost', header: 'Spend', align: 'right', render: (r) => fmt(r.trainingCost as number) },
                { key: 'budget', header: 'Budget', align: 'right', render: (r) => (r.budget as number) > 0 ? fmt(r.budget as number) : '—' },
                { key: 'budgetUtilisation', header: 'Utilisation', align: 'right', render: (r) => (r.budget as number) > 0 ? pct(r.budgetUtilisation as number) : '—' },
                { key: 'staffTrained', header: 'Staff Trained', align: 'right' },
                { key: 'coverageRatio', header: 'Coverage', align: 'right', render: (r) => pct(r.coverageRatio as number) },
                { key: 'avgImpactScore', header: 'Impact Score', align: 'right', render: (r) => rating(r.avgImpactScore as number) },
              ]}
              data={data.businessUnits as unknown as Record<string, unknown>[]}
            />
          </div>
        )}
      </div>
    </div>
  )
}
