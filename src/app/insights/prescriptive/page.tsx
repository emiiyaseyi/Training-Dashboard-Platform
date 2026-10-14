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
import type { VendorRecommendation, BudgetReallocationSuggestion, PriorityIntervention } from '@/lib/ld-insights-metrics'
import { vendorRecommendationHeadline, budgetReallocationHeadline, priorityInterventionHeadline } from '@/lib/ld-insights-narrative'

interface PrescriptiveData {
  availableYears: number[]
  vendorRecommendations: VendorRecommendation[]
  budgetReallocations: BudgetReallocationSuggestion[]
  priorityInterventions: PriorityIntervention[]
}

const TABS = [
  { key: 'vendors', label: 'Vendor Recommendations' },
  { key: 'budget', label: 'Budget Reallocation' },
  { key: 'priority', label: 'Priority Interventions' },
] as const

function fmt(n: number) {
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `₦${(n / 1_000).toFixed(1)}K`
  return `₦${n.toLocaleString()}`
}

export default function LdPrescriptiveInsightsPage() {
  const [data, setData] = useState<PrescriptiveData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<PeriodFilter>({ mode: 'ytd' })
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('vendors')

  const load = useCallback(async (f: PeriodFilter) => {
    setLoading(true)
    setError('')
    try {
      const qs = filterToQuery(f)
      const res = await fetch(`/api/analytics/insights${qs}${qs ? '&' : '?'}stage=prescriptive`)
      if (!res.ok) throw new Error()
      setData(await res.json())
    } catch {
      setError('Could not load the prescriptive report.')
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
        subtitle="Prescriptive — concrete next actions, not just rankings"
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
        <SubTabs tabs={TABS.map((t) => ({ key: t.key, label: t.label }))} active={tab} onChange={(k) => setTab(k as typeof tab)} />

        {tab === 'vendors' && (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">For each training with 2+ vendors tried (enough responses on each to trust), which vendor to consolidate on — a concrete next-booking choice, not just a performance ranking.</p>
            <NarrativeInsight title="Recommendation" insights={[vendorRecommendationHeadline(data.vendorRecommendations)]} />
            <DataTable
              columns={[
                { key: 'training', header: 'Training' },
                { key: 'recommendedVendor', header: 'Recommended Vendor', render: (r) => (r.recommendedVendor as string | null) ?? '—' },
                { key: 'avgRating', header: 'Rating', align: 'right', render: (r) => `${(r.avgRating as number).toFixed(1)}/5` },
                { key: 'alternativesConsidered', header: 'Vendors Compared', align: 'right' },
                { key: 'action', header: 'Action' },
              ]}
              data={data.vendorRecommendations as unknown as Record<string, unknown>[]}
              emptyMessage="No training has enough vendor history to compare yet."
            />
          </div>
        )}

        {tab === 'budget' && (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">Pairs business units projected to come in well under budget with those projected to breach theirs, suggesting how much to move and why.</p>
            <NarrativeInsight title="Recommendation" insights={[budgetReallocationHeadline(data.budgetReallocations)]} />
            <DataTable
              columns={[
                { key: 'fromBU', header: 'From' },
                { key: 'toBU', header: 'To' },
                { key: 'suggestedAmount', header: 'Suggested Amount', align: 'right', render: (r) => fmt(r.suggestedAmount as number) },
                { key: 'reason', header: 'Reason' },
              ]}
              data={data.budgetReallocations as unknown as Record<string, unknown>[]}
              emptyMessage="No reallocation opportunity right now."
            />
          </div>
        )}

        {tab === 'priority' && (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">Merges active red flags and critical capability gaps into one ranked list — what to act on first, with a concrete next step for each.</p>
            <NarrativeInsight title="Recommendation" insights={[priorityInterventionHeadline(data.priorityInterventions)]} />
            <DataTable
              columns={[
                { key: 'severity', header: 'Severity', render: (r) => (
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${r.severity === 'critical' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                    {r.severity as string}
                  </span>
                ) },
                { key: 'area', header: 'Area' },
                { key: 'description', header: 'Finding' },
                { key: 'recommendedAction', header: 'Recommended Action' },
              ]}
              data={data.priorityInterventions as unknown as Record<string, unknown>[]}
              emptyMessage="Nothing flagged for immediate intervention right now."
            />
          </div>
        )}
      </div>
    </div>
  )
}
