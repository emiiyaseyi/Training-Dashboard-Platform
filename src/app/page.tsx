'use client'

import { useEffect, useState, useCallback, useRef, useMemo, createRef } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { NarrativeInsight } from '@/components/ui/NarrativeInsight'
import { DataTable } from '@/components/ui/DataTable'
import { AlertBadge } from '@/components/ui/AlertBadge'
import { PageHeader } from '@/components/ui/PageHeader'
import { FilterBar } from '@/components/ui/FilterBar'
import { SectionExport } from '@/components/ui/SectionExport'
import { StaffHoursTable } from '@/components/ui/StaffHoursTable'
import { SubscriptionBreakdown } from '@/components/ui/SubscriptionBreakdown'
import { LearningIntelligenceLayer } from '@/components/ui/LearningIntelligenceLayer'
import { MetricsKey } from '@/components/ui/MetricsKey'
import { SlideViewer } from '@/components/ui/SlideViewer'
import { buildSlideNodes, SLIDE_COUNT } from '@/components/slides'
import { SlideDeckExportMenu } from '@/components/slides/SlideDeckExportMenu'
import type { GroupAnalytics } from '@/lib/analytics'
import { type PeriodFilter, filterToQuery, filterLabel } from '@/lib/filter-types'
import { fmt, pct, rating } from '@/lib/slide-format'
import { usePagePermission } from '@/lib/use-page-permission'

type DashData = GroupAnalytics & { narrative: string[] }

export default function ExecutiveDashboard() {
  const { isPlatformAdmin } = usePagePermission()
  const [data, setData] = useState<DashData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<PeriodFilter>({ mode: 'all' })
  const [slideIndex, setSlideIndex] = useState(0)

  const buTableRef = useRef<HTMLDivElement>(null)
  const slideRefs = useMemo(() => Array.from({ length: SLIDE_COUNT }, () => createRef<HTMLDivElement>()), [])

  const load = useCallback(async (f: PeriodFilter) => {
    setLoading(true)
    setError('')
    try {
      // Executive Overview always shows full group-wide data to every user, regardless of
      // their assigned Business Unit scope — the other analytics pages restrict to it.
      const qs = filterToQuery(f)
      const res = await fetch(`/api/analytics/group${qs}${qs ? '&' : '?'}full=true`)
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
    <div className="p-4 sm:p-8 space-y-4">
      <AlertBadge variant="error" message={error} />
      <button onClick={() => load(filter)} className="text-sm text-blue-600 flex items-center gap-1.5">
        <RefreshCw className="w-3.5 h-3.5" /> Retry
      </button>
    </div>
  )

  if (!data) return null
  const isEmpty = data.totalLearningInvestment === 0
  const periodLabel = filterLabel(filter)

  const buTableRows = data.businessUnits.map((b) => ({
    'Business Unit': b.name,
    'Formal Training Spend (₦)': b.trainingCost,
    'Strategic Learnings (₦)': b.otherInvestmentCost,
    'Subscription Spend (₦)': b.subscriptionCost,
    'Total Investment (₦)': b.totalInvestment,
    'Staff Trained': b.staffTrained,
    'Coverage %': parseFloat(b.coverageRatio.toFixed(1)),
    'Avg Impact (out of 5)': parseFloat(b.avgImpactScore.toFixed(1)),
  }))

  const slides = buildSlideNodes(data, periodLabel)

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Executive Overview"
        subtitle="Unified view of total learning investment across the organisation"
        actions={
          <div className="flex items-center gap-2">
            <FilterBar availableYears={data.availableYears} value={filter} onChange={handleFilter} />
            <SlideDeckExportMenu data={data} periodLabel={periodLabel} />
            <button onClick={() => load(filter)} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
          </div>
        }
      />

      {isEmpty && <div className="px-8 pt-6"><AlertBadge variant="info" message="No data uploaded yet. Go to Upload & Data to import your files." /></div>}

      {isPlatformAdmin && data.dataQuality.issues.length > 0 && (
        <div className="mx-8 mt-6 no-print rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-1">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <p className="text-sm font-semibold text-amber-800">Data Quality: {data.dataQuality.score}/100</p>
          </div>
          {data.dataQuality.issues.map((issue, i) => <p key={i} className="text-xs text-amber-700 ml-6">• {issue}</p>)}
        </div>
      )}

      {/* The 7-slide report deck — matches the L&D Investment Report structure */}
      <SlideViewer slides={slides} slideRefs={slideRefs} index={slideIndex} onIndexChange={setSlideIndex} />

      {/* Supplementary detail — not part of the fixed slide deck */}
      {!isEmpty && (
        <div className="p-4 sm:p-8 pt-0 space-y-8">
          <MetricsKey />

          <LearningIntelligenceLayer li={data.learningIntelligence} />

          {data.topMembershipOrgs.length > 0 && (
            <SubscriptionBreakdown orgs={data.topMembershipOrgs} title="Subscription Breakdown by Programme" />
          )}

          {data.hoursReport.hasData && data.hoursReport.staffDetail.length > 0 && (
            <StaffHoursTable staffDetail={data.hoursReport.staffDetail} hoursThreshold={data.hoursReport.hoursThreshold} />
          )}

          {data.businessUnits.length > 0 && (
            <div ref={buTableRef}>
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-semibold text-slate-800">Business Unit Summary</h2>
                <SectionExport captureRef={buTableRef} rows={buTableRows} filename="bu_summary" label="Export" />
              </div>
              <DataTable
                columns={[
                  { key: 'name', header: 'Business Unit' },
                  { key: 'trainingCost', header: 'Formal Training', align: 'right', render: (r) => fmt(r.trainingCost as number) },
                  { key: 'otherInvestmentCost', header: 'Strategic Learnings', align: 'right', render: (r) => fmt(r.otherInvestmentCost as number) },
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
      )}
    </div>
  )
}
