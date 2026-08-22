'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { RefreshCw, Users, UserCheck, UserX, Download, Search } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { FilterBar } from '@/components/ui/FilterBar'
import { AlertBadge } from '@/components/ui/AlertBadge'
import { ChartCard } from '@/components/ui/ChartCard'
import { DataTable } from '@/components/ui/DataTable'
import { KPICard } from '@/components/ui/KPICard'
import { BarChart } from '@/components/charts/BarChart'
import { type PeriodFilter, filterToQuery } from '@/lib/filter-types'
import type { YetToAttendReport } from '@/lib/roster-analytics'

export default function YetToAttendPage() {
  const [data, setData] = useState<YetToAttendReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<PeriodFilter>({ mode: 'all' })
  const [search, setSearch] = useState('')
  const [buFilter, setBuFilter] = useState('ALL')
  const [exporting, setExporting] = useState(false)

  const load = useCallback(async (f: PeriodFilter) => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/analytics/yet-to-attend${filterToQuery(f)}`)
      if (!res.ok) throw new Error()
      setData(await res.json())
    } catch {
      setError('Could not load the Yet to Attend Training report.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(filter) }, [filter, load])

  const buOptions = useMemo(() => (data ? data.byBU.map((b) => b.businessUnit) : []), [data])

  const filteredList = useMemo(() => {
    if (!data) return []
    const q = search.trim().toLowerCase()
    return data.list.filter((s) => {
      if (buFilter !== 'ALL' && s.businessUnit !== buFilter) return false
      if (!q) return true
      return s.staffName.toLowerCase().includes(q) || s.staffId.toLowerCase().includes(q)
    })
  }, [data, search, buFilter])

  const handleExport = async () => {
    if (!data) return
    setExporting(true)
    try {
      const { exportExcel } = await import('@/lib/export')
      await exportExcel(
        [{
          name: 'Yet to Attend Training',
          rows: filteredList.map((s) => ({
            'Staff ID': s.staffId,
            Name: s.staffName,
            'Business Unit': s.businessUnit,
            Role: s.role ?? '',
            Department: s.department ?? '',
            'Employment Date': s.employmentDate ? new Date(s.employmentDate).toLocaleDateString() : '',
          })),
        }],
        'yet_to_attend_training'
      )
    } finally {
      setExporting(false)
    }
  }

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
        title="Yet to Attend Training"
        subtitle="Confirmed staff on the roster with no training record in the selected period"
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
        {!data.hasRosterData ? (
          <AlertBadge
            variant="info"
            message="No Staff Roster uploaded yet. Go to Upload & Data → Staff Roster to upload the current staff list (Staff ID, First/Middle/Last Name, Business Unit, Role, Department, Employment Date, Confirmation Status). This report is additive — it doesn't affect any other report."
          />
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <KPICard
                title="Confirmed Staff"
                value={data.totalConfirmedStaff.toLocaleString()}
                subtitle="On roster, excludes unconfirmed staff"
                icon={Users}
                color="blue"
              />
              <KPICard
                title="Attended Training"
                value={data.totalAttended.toLocaleString()}
                subtitle="At least one training in period"
                icon={UserCheck}
                color="green"
              />
              <KPICard
                title="Yet to Attend"
                value={data.totalYetToAttend.toLocaleString()}
                subtitle="No training record in period"
                icon={UserX}
                color="red"
                alert={data.totalYetToAttend > 0}
              />
              <KPICard
                title="Coverage"
                value={`${data.overallCoverageRatio.toFixed(1)}%`}
                subtitle="Share of confirmed staff trained"
                icon={UserCheck}
                color="purple"
              />
            </div>

            {data.byBU.length > 0 && (
              <ChartCard
                title="Yet to Attend by Business Unit"
                rows={data.byBU.map((b) => ({
                  'Business Unit': b.businessUnit,
                  'Confirmed Staff': b.totalConfirmed,
                  Attended: b.attended,
                  'Yet to Attend': b.yetToAttend,
                }))}
                filename="yet_to_attend_by_bu"
              >
                <BarChart
                  labels={data.byBU.map((b) => b.businessUnit)}
                  values={data.byBU.map((b) => b.yetToAttend)}
                  color="#C0392B"
                  height={Math.max(280, data.byBU.length * 40)}
                  horizontal
                  showLabels
                />
              </ChartCard>
            )}

            <div>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <h2 className="text-sm font-semibold text-slate-800">
                  Staff List ({filteredList.length})
                </h2>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search name or Staff ID"
                      className="pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg text-xs w-52"
                    />
                  </div>
                  <select
                    value={buFilter}
                    onChange={(e) => setBuFilter(e.target.value)}
                    className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs"
                  >
                    <option value="ALL">All Business Units</option>
                    {buOptions.map((bu) => (
                      <option key={bu} value={bu}>{bu}</option>
                    ))}
                  </select>
                  <button
                    onClick={handleExport}
                    disabled={exporting || filteredList.length === 0}
                    className="flex items-center gap-1.5 text-xs font-medium text-slate-600 border border-slate-300 rounded-lg px-3 py-1.5 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Export
                  </button>
                </div>
              </div>

              <DataTable
                columns={[
                  { key: 'staffId', header: 'Staff ID' },
                  { key: 'staffName', header: 'Name' },
                  { key: 'businessUnit', header: 'Business Unit' },
                  { key: 'role', header: 'Role', render: (r) => (r.role as string) || '—' },
                  { key: 'department', header: 'Department', render: (r) => (r.department as string) || '—' },
                  {
                    key: 'employmentDate',
                    header: 'Employment Date',
                    render: (r) => (r.employmentDate ? new Date(r.employmentDate as string).toLocaleDateString() : '—'),
                  },
                ]}
                data={filteredList as unknown as Record<string, unknown>[]}
                emptyMessage="No staff match the current filters — everyone confirmed has attended training in this period."
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
