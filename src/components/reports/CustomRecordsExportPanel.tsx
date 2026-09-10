'use client'

import { useEffect, useMemo, useState } from 'react'
import { Search, ListFilter, Loader2 } from 'lucide-react'
import { SectionCard } from '@/components/ui/SectionCard'
import { DataTable } from '@/components/ui/DataTable'
import { SectionExport } from '@/components/ui/SectionExport'
import { FilterBar } from '@/components/ui/FilterBar'
import { type PeriodFilter, filterToParams } from '@/lib/filter-types'

type RecordType = 'training' | 'subscription'

interface CustomTrainingRow {
  id: string; staffId: string; staffName: string; businessUnit: string; department: string | null
  training: string; month: string; year: number; cost: number; vendor: string | null
}
interface CustomSubscriptionRow {
  id: string; staffId: string; staffName: string; businessUnit: string; department: string | null
  membershipOrg: string; category: string; month: string | null; amount: number
}
interface CustomRecordsReport {
  recordType: RecordType
  rows: (CustomTrainingRow | CustomSubscriptionRow)[]
  totalCost: number
}

function fmtNaira(n: number) {
  return `₦${n.toLocaleString()}`
}

// Ad-hoc pull of training or subscription records for one person, department, or business unit —
// distinct from the monthly BU snapshot reports above it on this page, which are fixed-shape and
// BU-scoped. This is a free-form lookup an L&D team can run for "everything for this one person"
// or "everything for this department this quarter" without opening Manage Records.
export function CustomRecordsExportPanel() {
  const [recordType, setRecordType] = useState<RecordType>('training')
  const [staffName, setStaffName] = useState('')
  const [businessUnit, setBusinessUnit] = useState('')
  const [department, setDepartment] = useState('')
  const [filter, setFilter] = useState<PeriodFilter>({ mode: 'all' })
  const [options, setOptions] = useState<{ departments: string[]; businessUnits: string[] }>({ departments: [], businessUnits: [] })
  const [report, setReport] = useState<CustomRecordsReport | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch('/api/reports/record-filter-options').then((r) => r.json()).then(setOptions).catch(() => {})
  }, [])

  useEffect(() => {
    const t = setTimeout(() => {
      setLoading(true)
      const params = new URLSearchParams({
        recordType,
        ...(staffName.trim() && { staffName: staffName.trim() }),
        ...(businessUnit && { businessUnit }),
        ...(department && { department }),
        ...filterToParams(filter),
      })
      fetch(`/api/reports/custom-records?${params.toString()}`)
        .then((r) => r.json())
        .then(setReport)
        .catch(() => setReport(null))
        .finally(() => setLoading(false))
    }, 300)
    return () => clearTimeout(t)
  }, [recordType, staffName, businessUnit, department, filter])

  const exportRows = useMemo(() => {
    if (!report) return []
    if (report.recordType === 'training') {
      return (report.rows as CustomTrainingRow[]).map((r) => ({
        Name: r.staffName, 'Staff ID': r.staffId, 'Business Unit': r.businessUnit, Department: r.department || '',
        Training: r.training, Month: r.month, Year: r.year, 'Cost (₦)': r.cost, Vendor: r.vendor || '',
      }))
    }
    return (report.rows as CustomSubscriptionRow[]).map((r) => ({
      Name: r.staffName, 'Staff ID': r.staffId, 'Business Unit': r.businessUnit, Department: r.department || '',
      'Membership Org': r.membershipOrg, Category: r.category, Month: r.month || '', 'Amount (₦)': r.amount,
    }))
  }, [report])

  return (
    <SectionCard
      icon={ListFilter}
      title="Custom Records Lookup"
      description="Pull every training or subscription record for one person, a department, or a Business Unit — independent of the monthly snapshots below."
      headerActions={
        <SectionExport
          rows={exportRows}
          filename={`${recordType}_records${staffName ? `_${staffName.replace(/\s+/g, '_')}` : ''}`}
          format="xlsx"
          label="Excel"
        />
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          {(['training', 'subscription'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setRecordType(t)}
              className={`text-xs font-medium rounded-lg px-3 py-1.5 border ${
                recordType === t ? 'bg-navy-600 text-white border-navy-600' : 'text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {t === 'training' ? 'Training Records' : 'Subscription Records'}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              value={staffName}
              onChange={(e) => setStaffName(e.target.value)}
              placeholder="Staff name…"
              className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>
          <select
            value={businessUnit}
            onChange={(e) => setBusinessUnit(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">All Business Units</option>
            {options.businessUnits.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          <select
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">All Departments</option>
            {options.departments.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <FilterBar availableYears={[new Date().getFullYear(), new Date().getFullYear() - 1, new Date().getFullYear() - 2]} value={filter} onChange={setFilter} />
        </div>

        {loading ? (
          <p className="text-xs text-slate-400 flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…</p>
        ) : !report || report.rows.length === 0 ? (
          <p className="text-xs text-slate-400">No matching records. Try widening a filter.</p>
        ) : (
          <>
            <p className="text-xs text-slate-500">
              {report.rows.length} record{report.rows.length === 1 ? '' : 's'} · Total {fmtNaira(report.totalCost)}
            </p>
            {report.recordType === 'training' ? (
              <DataTable
                columns={[
                  { key: 'staffName', header: 'Name', sortable: true },
                  { key: 'staffId', header: 'Staff ID', sortable: true },
                  { key: 'businessUnit', header: 'Business Unit', sortable: true },
                  { key: 'department', header: 'Department', render: (r) => (r.department as string) || '—' },
                  { key: 'training', header: 'Training', sortable: true },
                  { key: 'month', header: 'Month' },
                  { key: 'year', header: 'Year', align: 'right' },
                  { key: 'cost', header: 'Cost', align: 'right', sortable: true, render: (r) => fmtNaira(r.cost as number) },
                  { key: 'vendor', header: 'Vendor', render: (r) => (r.vendor as string) || '—' },
                ]}
                data={report.rows as unknown as Record<string, unknown>[]}
              />
            ) : (
              <DataTable
                columns={[
                  { key: 'staffName', header: 'Name', sortable: true },
                  { key: 'staffId', header: 'Staff ID', sortable: true },
                  { key: 'businessUnit', header: 'Business Unit', sortable: true },
                  { key: 'department', header: 'Department', render: (r) => (r.department as string) || '—' },
                  { key: 'membershipOrg', header: 'Membership Org', sortable: true },
                  { key: 'category', header: 'Category' },
                  { key: 'month', header: 'Month', render: (r) => (r.month as string) || '—' },
                  { key: 'amount', header: 'Amount', align: 'right', sortable: true, render: (r) => fmtNaira(r.amount as number) },
                ]}
                data={report.rows as unknown as Record<string, unknown>[]}
              />
            )}
          </>
        )}
      </div>
    </SectionCard>
  )
}
