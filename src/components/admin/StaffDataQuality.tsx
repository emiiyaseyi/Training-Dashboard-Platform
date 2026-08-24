'use client'

import { useEffect, useMemo, useState } from 'react'
import { Users, RefreshCw, AlertTriangle, CheckCircle2, Loader2, Sparkles, X, Copy, Search, DownloadCloud } from 'lucide-react'
import { Pagination, paginate } from '@/components/ui/Pagination'
import { SectionCard } from '@/components/ui/SectionCard'

interface StaffQualityRow {
  id: string
  staffId: string
  name: string
  firstName: string
  middleName: string | null
  lastName: string
  email: string | null
  businessUnit: string
  lineManagerStaffId: string | null
  role: string | null
  department: string | null
  issues: string[]
}

interface DuplicateIdGroup {
  key: string
  staffId: string
  keep: { id: string; name: string; businessUnit: string; createdAt: string }
  shadowed: { id: string; name: string; businessUnit: string; createdAt: string }[]
}

interface Audit {
  rows: StaffQualityRow[]
  flaggedCount: number
  totalStaff: number
  duplicateIdGroups: DuplicateIdGroup[]
  duplicateNameGroups: { name: string; staffIds: string[] }[]
}

interface RosterStaff {
  staffId: string
  name: string
  email: string | null
  businessUnit: string
}

interface BusinessUnitOption {
  id: string
  name: string
}

type Draft = {
  staffId: string; firstName: string; middleName: string; lastName: string
  email: string; businessUnit: string; lineManagerStaffId: string
}

const PAGE_SIZE = 20

const FIELD_DISPLAY_LABELS: Record<string, string> = {
  email: 'Email',
  lineManagerStaffId: 'Line Manager',
  role: 'Role',
  department: 'Department',
  employmentDate: 'Employment Date',
}

export function StaffDataQuality() {
  const [audit, setAudit] = useState<Audit | null>(null)
  const [loading, setLoading] = useState(true)
  const [cleaning, setCleaning] = useState(false)
  const [cleanResult, setCleanResult] = useState<number | null>(null)
  const [backfilling, setBackfilling] = useState(false)
  const [backfillResult, setBackfillResult] = useState<{
    checked: number; updated: number; fieldsFilled: number; stillMissing: number; noSheetRow: number
    matchedByName: number; staffIdMismatch: number
    fieldBreakdown: { field: string; missingInDb: number; availableInSheet: number }[]; error?: string
  } | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [page, setPage] = useState(1)

  const [roster, setRoster] = useState<RosterStaff[]>([])
  const [businessUnits, setBusinessUnits] = useState<BusinessUnitOption[]>([])
  const [managerSearch, setManagerSearch] = useState('')
  const [rowQuery, setRowQuery] = useState('')
  const [saveResult, setSaveResult] = useState<{ level: 'success' | 'warning' | 'error'; message: string } | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/staff-quality')
      setAudit(await res.json())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    fetch('/api/admin/roster-directory').then((r) => r.json()).then(setRoster)
    fetch('/api/business-units').then((r) => r.json()).then((d) => setBusinessUnits(Array.isArray(d) ? d : []))
  }, [])

  useEffect(() => {
    setPage(1)
  }, [audit?.rows.length, rowQuery])

  const clean = async () => {
    const total = audit?.duplicateIdGroups.reduce((s, g) => s + g.shadowed.length, 0) || 0
    if (total === 0) return
    if (!confirm(`Remove ${total} older duplicate record(s), keeping only the most recent upload's row for each Staff ID? This cannot be undone.`)) return
    setCleaning(true)
    setCleanResult(null)
    try {
      const res = await fetch('/api/admin/staff-quality/clean', { method: 'POST' })
      const data = await res.json()
      setCleanResult(data.removed)
      await load()
    } finally {
      setCleaning(false)
    }
  }

  const backfillFromSheet = async () => {
    setBackfilling(true)
    setBackfillResult(null)
    try {
      const res = await fetch('/api/admin/staff-quality/backfill-from-sheet', { method: 'POST' })
      const data = await res.json()
      setBackfillResult(data)
      if (!data.error) await load()
    } finally {
      setBackfilling(false)
    }
  }

  const startEdit = (r: StaffQualityRow) => {
    setEditingId(r.id)
    setManagerSearch('')
    setSaveResult(null)
    setDraft({
      staffId: r.staffId, firstName: r.firstName, middleName: r.middleName || '', lastName: r.lastName,
      email: r.email || '', businessUnit: r.businessUnit, lineManagerStaffId: r.lineManagerStaffId || '',
    })
  }

  const saveEdit = async () => {
    if (!editingId || !draft) return
    setSaving(true)
    setSaveResult(null)
    try {
      const res = await fetch(`/api/admin/staff-quality/${editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        const sync = data.sheetSync as { attempted: boolean; success: boolean; reason?: string } | undefined
        setSaveResult(
          !sync?.attempted
            ? { level: 'success', message: 'Saved.' }
            : sync.success
              ? { level: 'success', message: 'Saved. Line Manager Name/Email updated in the comprehensive staff list sheet.' }
              : { level: 'warning', message: `Saved to the database, but the sheet was NOT updated: ${sync.reason || 'unknown reason'}` }
        )
        setEditingId(null)
        setDraft(null)
        await load()
      } else {
        setSaveResult({ level: 'error', message: data.error || 'Failed to save.' })
      }
    } catch {
      setSaveResult({ level: 'error', message: 'Failed to save — network error.' })
    } finally {
      setSaving(false)
    }
  }

  const managerResults = useMemo(() => {
    const q = managerSearch.trim().toLowerCase()
    if (!q || !draft) return []
    return roster
      .filter((r) => r.staffId !== draft.staffId)
      .filter((r) => r.name.toLowerCase().includes(q) || r.staffId.toLowerCase().includes(q))
      .slice(0, 8)
  }, [managerSearch, roster, draft])

  const currentManager = draft ? roster.find((r) => r.staffId.toUpperCase() === draft.lineManagerStaffId.toUpperCase()) : undefined

  const duplicateShadowedTotal = audit?.duplicateIdGroups.reduce((s, g) => s + g.shadowed.length, 0) || 0
  const q = rowQuery.trim().toLowerCase()
  const filteredRows = audit ? (q ? audit.rows.filter((r) => r.name.toLowerCase().includes(q) || r.staffId.toLowerCase().includes(q) || r.email?.toLowerCase().includes(q)) : audit.rows) : []
  const pageRows = paginate(filteredRows, page, PAGE_SIZE)
  const showSearch = !!audit && audit.rows.length > PAGE_SIZE

  return (
    <SectionCard
      icon={Users}
      title="Staff Data Quality"
      description="Flags missing Staff ID, name, email, or Business Unit, plus duplicate Staff IDs and names. Click any record to fix it."
      headerActions={
        <>
          <button
            onClick={(e) => { e.stopPropagation(); backfillFromSheet() }}
            disabled={backfilling}
            title="Fills gaps (email, line manager, role, department, employment date) from the Staff Roster / Comprehensive Staff List sheet already configured under Live Data Source — never overwrites a value that's already present, never invents one."
            className="flex items-center gap-1.5 text-xs text-navy-600 border border-navy-200 rounded-lg px-2.5 py-1 hover:bg-navy-50 disabled:opacity-50"
          >
            {backfilling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <DownloadCloud className="w-3.5 h-3.5" />}
            Fill Missing Fields from Sheet
          </button>
          {duplicateShadowedTotal > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); clean() }}
              disabled={cleaning}
              title="Deletes older duplicate roster rows for the same Staff ID, keeping only the most recent upload's row"
              className="flex items-center gap-1.5 text-xs text-navy-600 border border-navy-200 rounded-lg px-2.5 py-1 hover:bg-navy-50 disabled:opacity-50"
            >
              {cleaning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              Clean {duplicateShadowedTotal} Duplicate Record{duplicateShadowedTotal === 1 ? '' : 's'}
            </button>
          )}
          <button onClick={(e) => { e.stopPropagation(); load() }} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </>
      }
    >

      {cleanResult !== null && (
        <div className="mb-3 text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-emerald-700">
          Removed {cleanResult} duplicate record(s).
        </div>
      )}

      {backfillResult && (
        <div className={`mb-3 text-xs rounded-lg px-3 py-2 border space-y-1 ${backfillResult.error ? 'bg-red-50 border-red-100 text-red-700' : 'bg-slate-50 border-slate-200 text-slate-700'}`}>
          {backfillResult.error ? backfillResult.error : (
            <>
              <p className={backfillResult.updated > 0 ? 'text-emerald-700' : ''}>
                Checked {backfillResult.checked} flagged staff — filled {backfillResult.fieldsFilled} field(s) across {backfillResult.updated} record(s).
                {' '}{backfillResult.stillMissing} still have nothing to fill from in the sheet
                {backfillResult.noSheetRow > 0 && ` (${backfillResult.noSheetRow} of those weren't found in the sheet by Staff ID or by exact name)`}.
                {backfillResult.matchedByName > 0 && ` ${backfillResult.matchedByName} were matched by name instead of Staff ID (their Staff ID here didn't match the sheet).`}
              </p>
              {backfillResult.staffIdMismatch > 0 && (
                <p className="text-amber-700">
                  {backfillResult.staffIdMismatch} of those name-matched people also have a DIFFERENT Staff ID in the sheet than what&apos;s stored here —
                  their fields were filled, but the Staff ID itself wasn&apos;t changed (that&apos;s a separate correction; edit them individually below if the sheet&apos;s ID is the right one).
                </p>
              )}
              {backfillResult.fieldBreakdown.some((f) => f.missingInDb > 0) && (
                <ul className="pl-3 list-disc space-y-0.5">
                  {backfillResult.fieldBreakdown.filter((f) => f.missingInDb > 0).map((f) => (
                    <li key={f.field}>
                      {FIELD_DISPLAY_LABELS[f.field] || f.field}: {f.missingInDb} missing here, the sheet had a value for {f.availableInSheet} of them.
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}

      {saveResult && (
        <div className={`mb-3 flex items-start justify-between gap-3 text-xs rounded-lg px-3 py-2 border ${
          saveResult.level === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
            : saveResult.level === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-800'
            : 'bg-red-50 border-red-100 text-red-700'
        }`}>
          <span className="flex items-start gap-1.5">
            {saveResult.level === 'warning' && <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
            {saveResult.message}
          </span>
          <button onClick={() => setSaveResult(null)} className="shrink-0 opacity-60 hover:opacity-100"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {loading ? (
        <p className="text-xs text-slate-400">Loading…</p>
      ) : !audit ? (
        <p className="text-xs text-red-600">Failed to load staff quality audit.</p>
      ) : (
        <div className="space-y-3">
          <div
            className={`flex items-center gap-2 text-xs rounded-lg px-3 py-2.5 border ${
              audit.flaggedCount === 0 ? 'text-emerald-700 bg-emerald-50 border-emerald-100' : 'text-amber-800 bg-amber-50 border-amber-200'
            }`}
          >
            {audit.flaggedCount === 0 ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 shrink-0" />}
            {audit.flaggedCount === 0
              ? `No data quality issues across ${audit.totalStaff} staff records.`
              : `${audit.flaggedCount} of ${audit.totalStaff} staff record(s) flagged.`}
          </div>

          {showSearch && (
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                value={rowQuery}
                onChange={(e) => setRowQuery(e.target.value)}
                placeholder="Search by name, Staff ID, or email…"
                className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg text-xs"
              />
            </div>
          )}

          {audit.duplicateNameGroups.length > 0 && (
            <div className="border border-amber-200 bg-amber-50 rounded-lg p-3">
              <p className="text-xs font-medium text-amber-800 flex items-center gap-1.5">
                <Copy className="w-3.5 h-3.5" /> Same name, different Staff IDs — check these aren&apos;t duplicate entries for one person
              </p>
              <div className="mt-1.5 space-y-0.5">
                {audit.duplicateNameGroups.map((g) => (
                  <p key={g.name} className="text-xs text-amber-700">{g.name}: {g.staffIds.join(', ')}</p>
                ))}
              </div>
            </div>
          )}

          {q && filteredRows.length === 0 && (
            <p className="text-xs text-slate-400 px-1">No flagged records match that search.</p>
          )}

          <div className="space-y-2">
            {pageRows.map((r) =>
              editingId === r.id && draft ? (
                <div key={r.id} className="border border-dashed border-slate-300 rounded-lg p-3 space-y-2.5 bg-slate-50">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <input placeholder="Staff ID" value={draft.staffId} onChange={(e) => setDraft({ ...draft, staffId: e.target.value })} className="border border-slate-300 rounded-md px-2.5 py-1.5 text-xs" />
                    <input placeholder="First name" value={draft.firstName} onChange={(e) => setDraft({ ...draft, firstName: e.target.value })} className="border border-slate-300 rounded-md px-2.5 py-1.5 text-xs" />
                    <input placeholder="Last name" value={draft.lastName} onChange={(e) => setDraft({ ...draft, lastName: e.target.value })} className="border border-slate-300 rounded-md px-2.5 py-1.5 text-xs" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <input placeholder="Email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} className="border border-slate-300 rounded-md px-2.5 py-1.5 text-xs" />
                    <select value={draft.businessUnit} onChange={(e) => setDraft({ ...draft, businessUnit: e.target.value })} className="border border-slate-300 rounded-md px-2.5 py-1.5 text-xs">
                      <option value="">Select Business Unit…</option>
                      {businessUnits.map((bu) => <option key={bu.id} value={bu.name}>{bu.name}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">Line Manager</label>
                    {draft.lineManagerStaffId && (
                      <span className="inline-flex items-center gap-1.5 text-xs bg-navy-50 text-navy-700 rounded-full pl-2.5 pr-1.5 py-1 mb-1.5">
                        {currentManager?.name || draft.lineManagerStaffId}
                        <button type="button" onClick={() => setDraft({ ...draft, lineManagerStaffId: '' })} className="hover:text-red-600">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    )}
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        value={managerSearch}
                        onChange={(e) => setManagerSearch(e.target.value)}
                        placeholder="Search by name or Staff ID to set/change…"
                        className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded-md text-xs"
                      />
                      {managerResults.length > 0 && (
                        <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                          {managerResults.map((m) => (
                            <button
                              key={m.staffId}
                              type="button"
                              onClick={() => { setDraft({ ...draft, lineManagerStaffId: m.staffId }); setManagerSearch('') }}
                              className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex items-center justify-between gap-2"
                            >
                              <span className="text-slate-700">{m.name}</span>
                              <span className="text-slate-400">{m.staffId}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button onClick={saveEdit} disabled={saving} className="flex items-center gap-1.5 text-xs font-medium text-white bg-navy-600 rounded-lg px-3 py-1.5 hover:bg-navy-700 disabled:opacity-50">
                      {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      Save
                    </button>
                    <button onClick={() => { setEditingId(null); setDraft(null) }} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 px-2 py-1.5">
                      <X className="w-3.5 h-3.5" /> Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  key={r.id}
                  onClick={() => startEdit(r)}
                  className="w-full flex items-start justify-between gap-3 border border-slate-200 rounded-lg px-3 py-2.5 text-left hover:border-navy-300 hover:bg-navy-50/30 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-800">{r.name || <span className="text-red-500">(no name)</span>} <span className="text-slate-400 font-normal">· {r.staffId || '(no Staff ID)'}</span></p>
                    <p className="text-[11px] text-slate-500 mt-0.5">{r.email || '—'} · {r.businessUnit || '—'}</p>
                    <p className="text-[11px] text-amber-700 mt-1">{r.issues.join(' · ')}</p>
                  </div>
                </button>
              )
            )}
          </div>

          <Pagination page={page} totalItems={filteredRows.length} pageSize={PAGE_SIZE} onChange={setPage} />
        </div>
      )}
    </SectionCard>
  )
}
