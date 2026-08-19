'use client'

import { useEffect, useState } from 'react'
import { ClipboardCheck, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react'

interface TableAudit {
  table: string
  label: string
  totalRecords: number
  issueCount: number
  samples: { summary: string; issues: string[] }[]
}

export function DataQualityAudit() {
  const [audit, setAudit] = useState<TableAudit[] | null>(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/data-quality')
      setAudit(await res.json())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const totalIssues = audit?.reduce((s, t) => s + t.issueCount, 0) ?? 0

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-3">
          <ClipboardCheck className="w-5 h-5 text-slate-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-slate-800">Data Quality Audit</p>
            <p className="text-xs text-slate-500 mt-0.5">
              A sample of records per table missing key fields — Staff ID, Business Unit, cost/amount, etc.
            </p>
          </div>
        </div>
        <button onClick={load} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 shrink-0">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {loading ? (
        <p className="text-xs text-slate-400">Loading…</p>
      ) : !audit ? (
        <p className="text-xs text-red-600">Failed to load audit.</p>
      ) : (
        <div className="space-y-3">
          <div
            className={`flex items-center gap-2 text-xs rounded-lg px-3 py-2.5 border ${
              totalIssues === 0 ? 'text-emerald-700 bg-emerald-50 border-emerald-100' : 'text-amber-800 bg-amber-50 border-amber-200'
            }`}
          >
            {totalIssues === 0 ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 shrink-0" />}
            {totalIssues === 0 ? 'No data quality issues found across any table.' : `${totalIssues} record(s) with missing fields across all tables.`}
          </div>

          {audit
            .filter((t) => t.issueCount > 0)
            .map((t) => (
              <div key={t.table} className="border border-slate-200 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-700">{t.label}</p>
                  <p className="text-xs text-amber-700">
                    {t.issueCount} of {t.totalRecords} record{t.totalRecords === 1 ? '' : 's'}
                  </p>
                </div>
                <div className="mt-2 space-y-1.5">
                  {t.samples.map((s, i) => (
                    <div key={i} className="text-xs bg-slate-50 rounded-md px-2.5 py-1.5">
                      <p className="text-slate-700 font-medium">{s.summary}</p>
                      <p className="text-amber-700">{s.issues.join(' · ')}</p>
                    </div>
                  ))}
                  {t.issueCount > t.samples.length && (
                    <p className="text-[11px] text-slate-400">+ {t.issueCount - t.samples.length} more not shown</p>
                  )}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  )
}
