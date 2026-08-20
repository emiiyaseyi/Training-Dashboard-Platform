'use client'

import { useEffect, useState } from 'react'
import { Users, RefreshCw, AlertTriangle, CheckCircle2, Loader2, Sparkles, Pencil, X, Copy } from 'lucide-react'

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

type Draft = {
  staffId: string; firstName: string; middleName: string; lastName: string
  email: string; businessUnit: string; lineManagerStaffId: string
}

export function StaffDataQuality() {
  const [audit, setAudit] = useState<Audit | null>(null)
  const [loading, setLoading] = useState(true)
  const [cleaning, setCleaning] = useState(false)
  const [cleanResult, setCleanResult] = useState<number | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)

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
  }, [])

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

  const startEdit = (r: StaffQualityRow) => {
    setEditingId(r.id)
    setDraft({
      staffId: r.staffId, firstName: r.firstName, middleName: r.middleName || '', lastName: r.lastName,
      email: r.email || '', businessUnit: r.businessUnit, lineManagerStaffId: r.lineManagerStaffId || '',
    })
  }

  const saveEdit = async () => {
    if (!editingId || !draft) return
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/staff-quality/${editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      })
      if (res.ok) {
        setEditingId(null)
        setDraft(null)
        await load()
      } else {
        const data = await res.json().catch(() => ({}))
        alert(data.error || 'Failed to save.')
      }
    } finally {
      setSaving(false)
    }
  }

  const duplicateShadowedTotal = audit?.duplicateIdGroups.reduce((s, g) => s + g.shadowed.length, 0) || 0

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-3">
          <Users className="w-5 h-5 text-slate-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-slate-800">Staff Data Quality</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Flags missing Staff ID, name, email, or Business Unit, plus duplicate Staff IDs and names, across the uploaded roster.
              Edit a record inline to fix it directly.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {duplicateShadowedTotal > 0 && (
            <button
              onClick={clean}
              disabled={cleaning}
              title="Deletes older duplicate roster rows for the same Staff ID, keeping only the most recent upload's row"
              className="flex items-center gap-1.5 text-xs text-navy-600 border border-navy-200 rounded-lg px-2.5 py-1 hover:bg-navy-50 disabled:opacity-50"
            >
              {cleaning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              Clean {duplicateShadowedTotal} Duplicate Record{duplicateShadowedTotal === 1 ? '' : 's'}
            </button>
          )}
          <button onClick={load} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>
      </div>

      {cleanResult !== null && (
        <div className="mb-3 text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-emerald-700">
          Removed {cleanResult} duplicate record(s).
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

          <div className="space-y-2">
            {audit.rows.map((r) =>
              editingId === r.id && draft ? (
                <div key={r.id} className="border border-dashed border-slate-300 rounded-lg p-3 space-y-2.5 bg-slate-50">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <input placeholder="Staff ID" value={draft.staffId} onChange={(e) => setDraft({ ...draft, staffId: e.target.value })} className="border border-slate-300 rounded-md px-2.5 py-1.5 text-xs" />
                    <input placeholder="First name" value={draft.firstName} onChange={(e) => setDraft({ ...draft, firstName: e.target.value })} className="border border-slate-300 rounded-md px-2.5 py-1.5 text-xs" />
                    <input placeholder="Last name" value={draft.lastName} onChange={(e) => setDraft({ ...draft, lastName: e.target.value })} className="border border-slate-300 rounded-md px-2.5 py-1.5 text-xs" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <input placeholder="Email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} className="border border-slate-300 rounded-md px-2.5 py-1.5 text-xs" />
                    <input placeholder="Business Unit" value={draft.businessUnit} onChange={(e) => setDraft({ ...draft, businessUnit: e.target.value })} className="border border-slate-300 rounded-md px-2.5 py-1.5 text-xs" />
                    <input placeholder="Line Manager Staff ID" value={draft.lineManagerStaffId} onChange={(e) => setDraft({ ...draft, lineManagerStaffId: e.target.value })} className="border border-slate-300 rounded-md px-2.5 py-1.5 text-xs" />
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
                <div key={r.id} className="flex items-start justify-between gap-3 border border-slate-200 rounded-lg px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-800">{r.name || <span className="text-red-500">(no name)</span>} <span className="text-slate-400 font-normal">· {r.staffId || '(no Staff ID)'}</span></p>
                    <p className="text-[11px] text-slate-500 mt-0.5">{r.email || '—'} · {r.businessUnit || '—'}</p>
                    <p className="text-[11px] text-amber-700 mt-1">{r.issues.join(' · ')}</p>
                  </div>
                  <button onClick={() => startEdit(r)} className="text-slate-300 hover:text-navy-600 p-1 shrink-0">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>
              )
            )}
          </div>
        </div>
      )}
    </div>
  )
}
