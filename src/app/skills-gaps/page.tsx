'use client'

import { useEffect, useState, useCallback } from 'react'
import { RefreshCw, AlertTriangle } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { FilterBar } from '@/components/ui/FilterBar'
import { AlertBadge } from '@/components/ui/AlertBadge'
import { DataTable } from '@/components/ui/DataTable'
import { type PeriodFilter, filterToQuery } from '@/lib/filter-types'
import type { SkillsGapReport, SkillsGapRow } from '@/lib/skills-gap'

const TABS = [
  { key: 'byBusinessUnit', label: 'By Business Unit' },
  { key: 'byDepartment', label: 'By Department' },
  { key: 'byRole', label: 'By Role' },
] as const

const SEVERITY_STYLE: Record<SkillsGapRow['severity'], string> = {
  critical: 'bg-red-100 text-red-700',
  moderate: 'bg-amber-100 text-amber-700',
  healthy: 'bg-green-100 text-green-700',
}

export default function SkillsGapsPage() {
  const [data, setData] = useState<SkillsGapReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<PeriodFilter>({ mode: 'all' })
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('byBusinessUnit')

  const load = useCallback(async (f: PeriodFilter) => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/analytics/skills-gaps${filterToQuery(f)}`)
      if (!res.ok) throw new Error()
      setData(await res.json())
    } catch {
      setError('Could not load the skills gap report.')
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

  const rows = data[tab]
  const totalGroups = new Set(rows.map((r) => r.groupValue)).size

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Skills & Competency Gaps"
        subtitle="Where training coverage on each Differentiating Capability is lowest, broken down by Business Unit, Department, and Role"
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
        <AlertBadge
          variant="info"
          message={
            `This measures a coverage gap — how little of a group has been trained on each capability — not yet a true required-vs-actual gap. ` +
            `Severity bands: Critical ≤ ${data.thresholds.criticalThreshold}%, Moderate ≤ ${data.thresholds.moderateThreshold}%, configurable in Admin → Skills Gap Settings. ` +
            `A "this role requires these capabilities" matrix is planned as the next step for a stricter gap definition.`
          }
        />

        {!data.hasRosterData && (
          <AlertBadge variant="info" message="No staff roster data uploaded yet — upload a roster to see coverage gaps." />
        )}

        {data.hasRosterData && data.topGaps.length === 0 && (
          <AlertBadge variant="success" message="No critical gaps found at the current thresholds — every capability/group combination is above the critical line." />
        )}

        {data.hasRosterData && data.topGaps.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-red-800 mb-2 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" /> Worst Critical Gaps (across BU, Department, and Role)
            </h2>
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
              data={data.topGaps as unknown as Record<string, unknown>[]}
            />
          </div>
        )}

        {data.hasRosterData && (
          <div>
            <div className="flex items-center gap-2 mb-3 border-b border-slate-200">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t.key ? 'border-navy-600 text-navy-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <p className="text-xs text-slate-400 mb-2">
              {totalGroups} group{totalGroups === 1 ? '' : 's'} × {data.hasRosterData ? 'every configured capability' : ''} — sorted lowest coverage first.
            </p>

            <DataTable
              columns={[
                { key: 'groupValue', header: TABS.find((t) => t.key === tab)!.label.replace('By ', '') },
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
              data={rows as unknown as Record<string, unknown>[]}
              emptyMessage="No data for this breakdown yet — add Differentiating Capabilities in Admin and tag training records with them."
            />
          </div>
        )}
      </div>
    </div>
  )
}
