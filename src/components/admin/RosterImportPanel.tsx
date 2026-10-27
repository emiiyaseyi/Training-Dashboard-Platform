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

type Override = { email?: string; lineManagerStaffId?: string }

export function RosterImportPanel() {
  const [tab, setTab] = useState('')
  const [plan, setPlan] = useState<Plan | null>(null)
  const [busy, setBusy] = useState<'preview' | 'apply' | null>(null)
  const [deactivateMissing, setDeactivateMissing] = useState(false)
  // The admin's choices from the preview — sent back with Preview/Import.
  const [exclude, setExclude] = useState<string[]>([])
  const [overrides, setOverrides] = useState<Record<string, Override>>({})
  const [keepActive, setKeepActive] = useState<string[]>([])

  useEffect(() => {
    fetch('/api/admin/roster-import').then((r) => r.json()).then((d) => setTab(d.tab || '')).catch(() => {})
  }, [])

  const toggle = (list: string[], setList: (v: string[]) => void, id: string) =>
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id])

  const setOverride = (id: string, patch: Override) =>
    setOverrides((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))

  const run = async (mode: 'preview' | 'apply') => {
    if (mode === 'apply') {
      const left = plan?.issues.filter((i) => !exclude.includes(i.staffId) && !isFixed(i)).length ?? 0
      const msg = `Import the staff list into the database now?${left ? `\n\n${left} warning(s) are still open — they will be imported as they are (ignored).` : ''}${exclude.length ? `\n${exclude.length} person(s) are excluded.` : ''}`
      if (!window.confirm(msg)) return
    }
    setBusy(mode)
    try {
      const res = await fetch('/api/admin/roster-import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, tab, deactivateMissing, exclude, overrides, keepActive }),
      })
      setPlan(await res.json())
    } finally {
      setBusy(null)
    }
  }

  const kindOf = (problem: string): 'email' | 'manager' | 'other' =>
    /email/i.test(problem) ? 'email' : /line manager/i.test(problem) ? 'manager' : 'other'

  // An issue counts as fixed once the admin has typed a value for it (it disappears after the next Preview).
  function isFixed(i: { staffId: string; problem: string }) {
    const k = kindOf(i.problem)
    const o = overrides[i.staffId]
    return (k === 'email' && !!o?.email?.trim()) || (k === 'manager' && !!o?.lineManagerStaffId?.trim())
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

  const inputCls = 'border border-slate-300 rounded-md px-2 py-1 text-xs w-56'

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
            {exclude.length > 0 && <> {exclude.length} excluded by you.</>}
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
              <p className="text-slate-500 mt-0.5">
                None of these block the import. Leave them (they are ignored and imported as they are), tick <b>Exclude</b> to leave that person out, or type the missing value in the box and
                it is used for the import (the sheet itself is not changed). Click Preview again to refresh this list.
              </p>
              <div className="max-h-72 overflow-y-auto border border-amber-200 bg-amber-50/40 rounded-lg p-2 space-y-1.5 mt-1">
                {plan.issues.slice(0, 300).map((i, n) => {
                  const k = kindOf(i.problem)
                  return (
                    <div key={n} className="flex items-center gap-2 flex-wrap">
                      <span className="flex-1 min-w-[16rem]">{i.staffId} {i.name && `· ${i.name}`} — {i.problem}</span>
                      {k === 'email' && (
                        <input placeholder="type the email" value={overrides[i.staffId]?.email || ''} onChange={(e) => setOverride(i.staffId, { email: e.target.value })} className={inputCls} />
                      )}
                      {k === 'manager' && (
                        <input placeholder="manager Staff ID, e.g. MSL-0013" value={overrides[i.staffId]?.lineManagerStaffId || ''} onChange={(e) => setOverride(i.staffId, { lineManagerStaffId: e.target.value })} className={inputCls} />
                      )}
                      <label className="flex items-center gap-1 text-slate-600 whitespace-nowrap">
                        <input type="checkbox" checked={exclude.includes(i.staffId)} onChange={() => toggle(exclude, setExclude, i.staffId)} /> Exclude
                      </label>
                    </div>
                  )
                })}
              </div>
              <button onClick={downloadIssues} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 mt-1.5">
                <Download className="w-3.5 h-3.5" /> Download full list (CSV)
              </button>
            </div>
          )}

          {plan.notInSheet.length > 0 && (
            <div>
              <p className="font-medium text-slate-800">{plan.notInSheet.length} active people in the platform are not in the sheet</p>
              <p className="text-slate-500 mt-0.5">
                {deactivateMissing ? 'They will be marked inactive when you import — tick "Keep active" for anyone who should stay.' : 'They are left as they are. Tick the box above to mark them inactive.'}
              </p>
              <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-lg p-2 space-y-1 mt-1">
                {plan.notInSheet.map((s) => (
                  <label key={s.staffId} className="flex items-center gap-2">
                    <input type="checkbox" checked={keepActive.includes(s.staffId)} onChange={() => toggle(keepActive, setKeepActive, s.staffId)} />
                    <span>{s.staffId} · {s.name}</span>
                    <span className="text-slate-400">{keepActive.includes(s.staffId) ? 'keep active' : ''}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
