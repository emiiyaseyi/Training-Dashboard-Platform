'use client'

import { useEffect, useState } from 'react'
import { Users, Loader2, Search, Download } from 'lucide-react'

interface Plan {
  sheetName: string
  totalRows: number
  newStaff: number
  changedStaff: number
  unchangedStaff: number
  skippedStaff: number
  notInSheet: { staffId: string; name: string }[]
  issues: { staffId: string; name: string; problem: string }[]
  sampleChanges: { staffId: string; name: string; changes: string[] }[]
  error?: string
  applied?: { created: number; updated: number; deactivated: number }
}

export function RosterImportPanel() {
  const [tab, setTab] = useState('')
  const [plan, setPlan] = useState<Plan | null>(null)
  const [busy, setBusy] = useState<'preview' | 'apply' | null>(null)
  const [deactivateMissing, setDeactivateMissing] = useState(false)

  useEffect(() => {
    fetch('/api/admin/roster-import').then((r) => r.json()).then((d) => setTab(d.tab || '')).catch(() => {})
  }, [])

  const run = async (mode: 'preview' | 'apply') => {
    if (mode === 'apply' && !window.confirm('Import the staff list from the sheet into the database now? Existing people are updated in place.')) return
    setBusy(mode)
    try {
      const res = await fetch('/api/admin/roster-import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode, tab, deactivateMissing }) })
      setPlan(await res.json())
    } finally {
      setBusy(null)
    }
  }

  const downloadIssues = () => {
    if (!plan) return
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`
    const csv = ['Staff ID,Name,Problem', ...plan.issues.map((i) => [i.staffId, i.name, i.problem].map(esc).join(','))].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = 'staff-import-issues.csv'
    a.click()
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5 space-y-4">
      <div className="flex items-start gap-3">
        <Users className="w-5 h-5 text-slate-400 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-slate-800">Import Staff List from Google Sheet</p>
          <p className="text-xs text-slate-500 mt-0.5">
            Brings the staff list into the database once, on demand. People already in the platform are updated in place (a blank cell never erases what the platform has);
            new people are added. After this, staff are managed in the platform only — nothing syncs in daily, and edits are not written back to the sheet.
          </p>
        </div>
      </div>

      <label className="block text-xs text-slate-500">
        Sheet tab
        <input value={tab} onChange={(e) => setTab(e.target.value)} className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm mt-1" />
      </label>

      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => run('preview')} disabled={!!busy || !tab.trim()} className="flex items-center gap-1.5 text-xs font-medium text-navy-600 border border-navy-200 rounded-lg px-3 py-1.5 hover:bg-navy-50 disabled:opacity-50">
          {busy === 'preview' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />} Preview
        </button>
        <button onClick={() => run('apply')} disabled={!!busy || !tab.trim()} className="flex items-center gap-1.5 text-xs font-medium text-white bg-navy-600 rounded-lg px-3 py-1.5 hover:bg-navy-700 disabled:opacity-50">
          {busy === 'apply' && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Import now
        </button>
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          <input type="checkbox" checked={deactivateMissing} onChange={(e) => setDeactivateMissing(e.target.checked)} />
          Mark people who are not in the sheet as inactive
        </label>
      </div>

      {plan?.error && <p className="text-xs text-red-600">{plan.error}</p>}
      {plan && !plan.error && (
        <div className="space-y-3 text-xs text-slate-700">
          {plan.applied && (
            <p className="text-emerald-700 font-medium">
              Done — {plan.applied.created} added, {plan.applied.updated} updated{plan.applied.deactivated ? `, ${plan.applied.deactivated} marked inactive` : ''}.
            </p>
          )}
          <p>
            {plan.totalRows} rows in &quot;{plan.sheetName}&quot;: <b>{plan.newStaff}</b> new, <b>{plan.changedStaff}</b> to update, {plan.unchangedStaff} unchanged, <b>{plan.skippedStaff}</b> skipped.
            {plan.notInSheet.length > 0 && <> {plan.notInSheet.length} active people in the platform are not in the sheet.</>}
          </p>
          {plan.sampleChanges.length > 0 && (
            <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-lg p-2 space-y-1">
              {plan.sampleChanges.map((c) => (
                <p key={c.staffId}><b>{c.name}</b> ({c.staffId}) — {c.changes.join('; ')}</p>
              ))}
            </div>
          )}
          {plan.issues.length > 0 && (
            <div>
              <p className="text-amber-700 font-medium">{plan.issues.length} things to fix in the sheet</p>
              <div className="max-h-56 overflow-y-auto border border-amber-200 bg-amber-50/40 rounded-lg p-2 space-y-1 mt-1">
                {plan.issues.slice(0, 200).map((i, n) => (
                  <p key={n}>{i.staffId} {i.name && `· ${i.name}`} — {i.problem}</p>
                ))}
              </div>
              <button onClick={downloadIssues} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 mt-1.5">
                <Download className="w-3.5 h-3.5" /> Download full list (CSV)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
