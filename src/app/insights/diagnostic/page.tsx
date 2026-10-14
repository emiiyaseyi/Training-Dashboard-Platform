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
import type { SkillsGapReport, SkillsGapRow } from '@/lib/skills-gap'
import type { LearningIntelligence } from '@/lib/analytics'
import type { CostImpactMismatch } from '@/lib/ld-insights-metrics'
import { coverageGapHeadline, costImpactHeadline, redFlagHeadline } from '@/lib/ld-insights-narrative'

interface DiagnosticData {
  availableYears: number[]
  coverageGaps: SkillsGapReport
  costImpact: CostImpactMismatch[]
  learningIntelligence: LearningIntelligence
}

const TABS = [
  { key: 'coverage', label: 'Coverage Gaps' },
  { key: 'cost-impact', label: 'Cost vs Impact' },
  { key: 'red-flags', label: 'Participation & Red Flags' },
] as const

const SEVERITY_STYLE: Record<SkillsGapRow['severity'], string> = {
  critical: 'bg-red-100 text-red-700',
  moderate: 'bg-amber-100 text-amber-700',
  healthy: 'bg-green-100 text-green-700',
}

function fmt(n: number) {
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `₦${(n / 1_000).toFixed(1)}K`
  return `₦${n.toLocaleString()}`
}

export default function LdDiagnosticInsightsPage() {
  const [data, setData] = useState<DiagnosticData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<PeriodFilter>({ mode: 'all' })
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('coverage')

  const load = useCallback(async (f: PeriodFilter) => {
    setLoading(true)
    setError('')
    try {
      const qs = filterToQuery(f)
      const res = await fetch(`/api/analytics/insights${qs}${qs ? '&' : '?'}stage=diagnostic`)
      if (!res.ok) throw new Error()
      setData(await res.json())
    } catch {
      setError('Could not load the diagnostic report.')
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
        subtitle="Diagnostic — finding WHY, not just reporting what happened"
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

        {tab === 'coverage' && (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">A blended coverage ratio hides which specific business unit/role is actually under-covered on a given capability. Sorted lowest coverage first.</p>
            <NarrativeInsight title="Diagnosis" insights={[coverageGapHeadline(data.coverageGaps)]} />
            {!data.coverageGaps.hasRosterData ? (
              <AlertBadge variant="info" message="No staff roster data uploaded yet — upload a roster to see coverage gaps." />
            ) : (
              <DataTable
                columns={[
                  { key: 'groupValue', header: 'Group' },
                  { key: 'capability', header: 'Capability' },
                  { key: 'staffTrained', header: 'Trained', align: 'right' },
                  { key: 'totalStaff', header: 'Eligible Staff', align: 'right' },
                  {
                    key: 'coverageRatio', header: 'Coverage', align: 'right',
                    render: (r) => (
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${SEVERITY_STYLE[r.severity as SkillsGapRow['severity']]}`}>
                        {(r.coverageRatio as number).toFixed(1)}%
                      </span>
                    ),
                  },
                ]}
                data={data.coverageGaps.topGaps as unknown as Record<string, unknown>[]}
                emptyMessage="No critical gaps found at the current thresholds."
              />
            )}
          </div>
        )}

        {tab === 'cost-impact' && (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">A blended average investment figure hides which specific business unit is spending heavily relative to the impact staff actually report.</p>
            <NarrativeInsight title="Diagnosis" insights={[costImpactHeadline(data.costImpact)]} />
            <DataTable
              columns={[
                { key: 'buName', header: 'Business Unit' },
                { key: 'totalInvestment', header: 'Total Investment', align: 'right', render: (r) => fmt(r.totalInvestment as number) },
                { key: 'avgImpactScore', header: 'Avg. Impact Score', align: 'right', render: (r) => `${(r.avgImpactScore as number).toFixed(1)}/5` },
                {
                  key: 'investmentPerImpactPoint', header: 'Investment / Impact Point', align: 'right',
                  render: (r) => r.investmentPerImpactPoint == null ? '—' : fmt(r.investmentPerImpactPoint as number),
                },
              ]}
              data={data.costImpact as unknown as Record<string, unknown>[]}
              emptyMessage="No business unit has both spend and a measured impact score yet."
            />
          </div>
        )}

        {tab === 'red-flags' && (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">Activity concentrated in a few staff, or feedback too thin to trust, is invisible in a single blended participation number.</p>
            <NarrativeInsight title="Diagnosis" insights={[redFlagHeadline(data.learningIntelligence)]} />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Participation Inequality</p>
                <p className="text-2xl font-bold text-slate-800">{data.learningIntelligence.participationInequality.toFixed(0)}%</p>
                <p className="text-xs text-slate-400 mt-1">Share of all activity held by the top 20% most active staff</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Top Business Unit (LCI)</p>
                <p className="text-2xl font-bold text-green-700">{data.learningIntelligence.topBU?.name ?? '—'}</p>
                <p className="text-xs text-slate-400 mt-1">{data.learningIntelligence.topBU ? `${data.learningIntelligence.topBU.lci.toFixed(0)} — ${data.learningIntelligence.topBU.lciLabel}` : 'Not enough data yet'}</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Bottom Business Unit (LCI)</p>
                <p className="text-2xl font-bold text-red-700">{data.learningIntelligence.bottomBU?.name ?? '—'}</p>
                <p className="text-xs text-slate-400 mt-1">{data.learningIntelligence.bottomBU ? `${data.learningIntelligence.bottomBU.lci.toFixed(0)} — ${data.learningIntelligence.bottomBU.lciLabel}` : 'Not enough data yet'}</p>
              </div>
            </div>
            <DataTable
              columns={[
                { key: 'severity', header: 'Severity', render: (r) => (
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${r.severity === 'critical' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                    {r.severity as string}
                  </span>
                ) },
                { key: 'buName', header: 'Business Unit', render: (r) => (r.buName as string) ?? 'Group-wide' },
                { key: 'message', header: 'Flag' },
              ]}
              data={data.learningIntelligence.redFlags as unknown as Record<string, unknown>[]}
              emptyMessage="No active red flags right now."
            />
          </div>
        )}
      </div>
    </div>
  )
}
