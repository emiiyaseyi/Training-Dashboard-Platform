'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { RefreshCw } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { FilterBar } from '@/components/ui/FilterBar'
import { AlertBadge } from '@/components/ui/AlertBadge'
import { ChartCard } from '@/components/ui/ChartCard'
import { DataTable } from '@/components/ui/DataTable'
import { BarChart } from '@/components/charts/BarChart'
import type { GroupAnalytics } from '@/lib/analytics'
import { type PeriodFilter, filterToQuery } from '@/lib/filter-types'

export default function CapabilityCoveragePage() {
  const [data, setData] = useState<GroupAnalytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<PeriodFilter>({ mode: 'all' })
  const chartRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async (f: PeriodFilter) => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/analytics/group${filterToQuery(f)}`)
      if (!res.ok) throw new Error()
      setData(await res.json())
    } catch {
      setError('Could not load capability coverage data.')
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
  const coverage = data.capabilityCoverage

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Differentiating Capabilities Coverage"
        subtitle="Share of total staff trained against each strategic capability"
        actions={
          <div className="flex items-center gap-2">
            <FilterBar availableYears={data.availableYears} value={filter} onChange={setFilter} />
            <button onClick={() => load(filter)} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
          </div>
        }
      />

      <div className="p-4 sm:p-8 space-y-6">
        {coverage.length === 0 && (
          <AlertBadge
            variant="info"
            message="No Differentiating Capabilities configured yet. Add them in Admin → Differentiating Capabilities, then tag training records with a Capability on upload."
          />
        )}

        {coverage.length > 0 && (
          <>
            <div ref={chartRef}>
              <ChartCard
                title="Capability Coverage (%)"
                rows={coverage.map((c) => ({ Capability: c.capability, 'Staff Trained': c.staffTrained, 'Coverage %': c.coverageRatio.toFixed(1) }))}
                filename="capability_coverage"
              >
                <BarChart
                  labels={coverage.map((c) => c.capability)}
                  values={coverage.map((c) => c.coverageRatio)}
                  color="#1E2761"
                  height={Math.max(280, coverage.length * 50)}
                  horizontal
                  showLabels
                  labelSuffix="%"
                />
              </ChartCard>
            </div>

            <div>
              <h2 className="text-sm font-semibold text-slate-800 mb-2">Coverage Detail</h2>
              <DataTable
                columns={[
                  { key: 'capability', header: 'Differentiating Capability' },
                  { key: 'staffTrained', header: 'Staff Trained', align: 'right' },
                  { key: 'coverageRatio', header: 'Coverage', align: 'right', render: (r) => `${(r.coverageRatio as number).toFixed(1)}%` },
                ]}
                data={coverage as unknown as Record<string, unknown>[]}
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
