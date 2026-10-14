'use client'

import { useEffect, useState, useCallback } from 'react'
import { RefreshCw } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { FilterBar } from '@/components/ui/FilterBar'
import { AlertBadge } from '@/components/ui/AlertBadge'
import { DataTable } from '@/components/ui/DataTable'
import { NarrativeInsight } from '@/components/ui/NarrativeInsight'
import { InsightsStageNav } from '@/components/layout/InsightsStageNav'
import { SubTabs } from '@/components/ui/SubTabs'
import { type PeriodFilter, filterToQuery } from '@/lib/filter-types'
import type { BudgetOverrunRisk, HoursComplianceRisk, TalentMemberCoverageRisk } from '@/lib/ld-insights-metrics'
import { budgetRiskHeadline, hoursComplianceHeadline, talentMemberRiskHeadline } from '@/lib/ld-insights-narrative'

interface PredictiveData {
  availableYears: number[]
  budgetRisks: BudgetOverrunRisk[]
  hoursRisks: HoursComplianceRisk[]
  totalStaffWithHours: number
  talentMemberRisk: TalentMemberCoverageRisk
}

const TABS = [
  { key: 'budget', label: 'Budget Overrun Risk' },
  { key: 'hours', label: 'Hours Compliance Risk' },
  { key: 'talent-member', label: 'Talent Member Coverage Risk' },
] as const

const RISK_STYLE: Record<BudgetOverrunRisk['risk'], string> = {
  'on-track': 'bg-green-100 text-green-700',
  'at-risk': 'bg-amber-100 text-amber-700',
  'over-budget': 'bg-red-100 text-red-700',
}

const SEVERITY_STYLE: Record<HoursComplianceRisk['severity'], string> = {
  critical: 'bg-red-100 text-red-700',
  warning: 'bg-amber-100 text-amber-700',
}

function fmt(n: number) {
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `₦${(n / 1_000).toFixed(1)}K`
  return `₦${n.toLocaleString()}`
}

export default function LdPredictiveInsightsPage() {
  const [data, setData] = useState<PredictiveData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<PeriodFilter>({ mode: 'ytd' })
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('budget')

  const load = useCallback(async (f: PeriodFilter) => {
    setLoading(true)
    setError('')
    try {
      const qs = filterToQuery(f)
      const res = await fetch(`/api/analytics/insights${qs}${qs ? '&' : '?'}stage=predictive`)
      if (!res.ok) throw new Error()
      setData(await res.json())
    } catch {
      setError('Could not load the predictive report.')
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

  if (error) return (
    <div className="p-4 sm:p-8 space-y-4">
      <AlertBadge variant="error" message={error} />
      <button onClick={() => load(filter)} className="text-sm text-blue-600 flex items-center gap-1.5">
        <RefreshCw className="w-3.5 h-3.5" /> Retry
      </button>
    </div>
  )

  if (!data) return null

  return (
    <div className="flex flex-col">
      <PageHeader
        title="L&D Insights"
        subtitle="Predictive — what's heading for trouble before it happens"
        actions={
          <div className="flex items-center gap-2">
            <FilterBar availableYears={data.availableYears} value={filter} onChange={setFilter} />
            <button onClick={() => load(filter)} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
          </div>
        }
      />
      <InsightsStageNav />

      <div className="p-4 sm:p-8 space-y-6">
        <AlertBadge variant="info" message="Projections are most meaningful on a Year to Date filter — on All Time or a full past Year there's nothing left to project against, so every business unit/staff member reads as 'on track'." />
        <SubTabs tabs={TABS.map((t) => ({ key: t.key, label: t.label }))} active={tab} onChange={(k) => setTab(k as typeof tab)} />

        {tab === 'budget' && (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">Projects each business unit&apos;s full-year spend from its spend-to-date and months elapsed, flagging overrun risk before it actually happens — not just after.</p>
            <NarrativeInsight title="Prediction" insights={[budgetRiskHeadline(data.budgetRisks)]} />
            <DataTable
              columns={[
                { key: 'buName', header: 'Business Unit' },
                { key: 'budget', header: 'Budget', align: 'right', render: (r) => fmt(r.budget as number) },
                { key: 'spendToDate', header: 'Spend to Date', align: 'right', render: (r) => fmt(r.spendToDate as number) },
                { key: 'projectedFullYearSpend', header: 'Projected Full-Year', align: 'right', render: (r) => fmt(r.projectedFullYearSpend as number) },
                {
                  key: 'risk', header: 'Risk', align: 'right',
                  render: (r) => (
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${RISK_STYLE[r.risk as BudgetOverrunRisk['risk']]}`}>
                      {(r.projectedUtilisation as number).toFixed(0)}% — {r.risk as string}
                    </span>
                  ),
                },
              ]}
              data={data.budgetRisks as unknown as Record<string, unknown>[]}
              emptyMessage="No business unit has a budget configured for this period."
            />
          </div>
        )}

        {tab === 'hours' && (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">Staff currently below the training-hours pace needed to hit the annual target — flagged while there&apos;s still time to act, not discovered at year end.</p>
            <NarrativeInsight title="Prediction" insights={[hoursComplianceHeadline(data.hoursRisks, data.totalStaffWithHours)]} />
            <DataTable
              columns={[
                { key: 'staffName', header: 'Staff' },
                { key: 'businessUnit', header: 'Business Unit' },
                { key: 'totalHours', header: 'Hours So Far', align: 'right', render: (r) => (r.totalHours as number).toFixed(1) },
                { key: 'threshold', header: 'Target (This Period)', align: 'right', render: (r) => (r.threshold as number).toFixed(0) },
                {
                  key: 'severity', header: 'Status', align: 'right',
                  render: (r) => (
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${SEVERITY_STYLE[r.severity as HoursComplianceRisk['severity']]}`}>
                      {(r.pctOfThreshold as number).toFixed(0)}% — {r.severity as string}
                    </span>
                  ),
                },
              ]}
              data={data.hoursRisks as unknown as Record<string, unknown>[]}
              emptyMessage="No staff are currently trending behind the hours target."
            />
          </div>
        )}

        {tab === 'talent-member' && (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">Talent Members with neither a completed training nor one already scheduled — the group genuinely at risk of finishing the period uncovered, distinct from the overall coverage percentage.</p>
            <NarrativeInsight title="Prediction" insights={[talentMemberRiskHeadline(data.talentMemberRisk)]} />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Total Headcount</p>
                <p className="text-2xl font-bold text-slate-800">{data.talentMemberRisk.totalHeadcount}</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Trained</p>
                <p className="text-2xl font-bold text-green-700">{data.talentMemberRisk.staffTrained}</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Scheduled, Not Yet Attended</p>
                <p className="text-2xl font-bold text-amber-700">{data.talentMemberRisk.staffWithUpcomingTraining}</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">At Risk (neither)</p>
                <p className="text-2xl font-bold text-red-700">{data.talentMemberRisk.staffAtRisk}</p>
                <p className="text-xs text-slate-400 mt-1">{data.talentMemberRisk.atRiskPct.toFixed(0)}% of headcount</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
