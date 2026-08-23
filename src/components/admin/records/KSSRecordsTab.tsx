'use client'

import { useEffect, useMemo, useState } from 'react'
import { Search, Plus, Trash2, Save, Loader2, X, Pencil } from 'lucide-react'
import { Pagination } from '@/components/ui/Pagination'

interface KSSRow {
  id: string
  staffId: string
  staffName: string
  businessUnit: string
  durationMinutes: number
  month: string | null
  year: number | null
}

interface RosterStaff {
  staffId: string
  name: string
  email: string | null
  businessUnit: string
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export function KSSRecordsTab() {
  const [rows, setRows] = useState<KSSRow[]>([])
  const [total, setTotal] = useState(0)
  const [pageSize, setPageSize] = useState(20)
  const [page, setPage] = useState(1)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<{ staffName: string; businessUnit: string; durationMinutes: string; month: string; year: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const [addingNew, setAddingNew] = useState(false)
  const [directory, setDirectory] = useState<RosterStaff[]>([])
  const [pickerQuery, setPickerQuery] = useState('')
  const [pickedStaff, setPickedStaff] = useState<RosterStaff | null>(null)
  const [newDuration, setNewDuration] = useState('')
  const [newMonth, setNewMonth] = useState(MONTHS[new Date().getMonth()])
  const [newYear, setNewYear] = useState(String(new Date().getFullYear()))
  const [addSaving, setAddSaving] = useState(false)
  const [addError, setAddError] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/records/kss?search=${encodeURIComponent(query)}&page=${page}`)
      const data = await res.json()
      setRows(data.rows || [])
      setTotal(data.total || 0)
      setPageSize(data.pageSize || 20)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const t = setTimeout(() => load(), 300)
    return () => clearTimeout(t)
  }, [page, query]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetch('/api/admin/roster-directory').then((r) => r.json()).then((d) => setDirectory(Array.isArray(d) ? d : [])).catch(() => {})
  }, [])

  const pickerResults = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase()
    if (!q) return []
    return directory.filter((s) => s.name.toLowerCase().includes(q) || s.staffId.toLowerCase().includes(q) || s.email?.toLowerCase().includes(q)).slice(0, 8)
  }, [pickerQuery, directory])

  const startEdit = (r: KSSRow) => {
    setEditingId(r.id)
    setDraft({ staffName: r.staffName, businessUnit: r.businessUnit, durationMinutes: String(r.durationMinutes), month: r.month || '', year: r.year ? String(r.year) : '' })
  }

  const saveEdit = async (id: string) => {
    if (!draft) return
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/records/kss/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staffName: draft.staffName, businessUnit: draft.businessUnit,
          durationMinutes: parseFloat(draft.durationMinutes) || 0,
          month: draft.month || null, year: draft.year ? parseInt(draft.year) : null,
        }),
      })
      if (res.ok) { setEditingId(null); setDraft(null); await load() }
      else alert('Failed to save.')
    } finally {
      setSaving(false)
    }
  }

  const deleteRow = async (id: string) => {
    if (!confirm('Delete this KSS record? This cannot be undone.')) return
    setDeletingId(id)
    try {
      await fetch(`/api/admin/records/kss/${id}`, { method: 'DELETE' })
      await load()
    } finally {
      setDeletingId(null)
    }
  }

  const addRecord = async () => {
    if (!pickedStaff || !newDuration) return
    setAddSaving(true)
    setAddError('')
    try {
      const res = await fetch('/api/admin/records/kss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staffId: pickedStaff.staffId, staffName: pickedStaff.name, businessUnit: pickedStaff.businessUnit,
          durationMinutes: parseFloat(newDuration) || 0, month: newMonth, year: parseInt(newYear),
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setAddingNew(false); setPickedStaff(null); setPickerQuery(''); setNewDuration('')
        setPage(1); await load()
      } else {
        setAddError(data.error || 'Failed to add record.')
      }
    } finally {
      setAddSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1) }}
            placeholder="Search name, Staff ID, or Business Unit…"
            className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg text-sm"
          />
        </div>
        {!addingNew && (
          <button onClick={() => setAddingNew(true)} className="flex items-center gap-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg px-3 py-2 hover:bg-blue-700">
            <Plus className="w-4 h-4" /> Add KSS Record
          </button>
        )}
      </div>

      {addingNew && (
        <div className="border border-blue-200 rounded-lg p-4 space-y-3 bg-blue-50/30">
          <div className="relative">
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Staff member</label>
            {pickedStaff ? (
              <div className="flex items-center gap-2 text-sm bg-white border border-slate-200 rounded-lg px-3 py-2">
                <span className="font-medium text-slate-800">{pickedStaff.name}</span>
                <span className="text-slate-400">{pickedStaff.staffId} · {pickedStaff.businessUnit}</span>
                <button onClick={() => setPickedStaff(null)} className="ml-auto text-slate-400 hover:text-red-600"><X className="w-4 h-4" /></button>
              </div>
            ) : (
              <>
                <input
                  value={pickerQuery}
                  onChange={(e) => setPickerQuery(e.target.value)}
                  placeholder="Search by name, email, or Staff ID…"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
                {pickerResults.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {pickerResults.map((s) => (
                      <button key={s.staffId} onClick={() => { setPickedStaff(s); setPickerQuery('') }} className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex items-center justify-between gap-2">
                        <span className="text-slate-700">{s.name}</span>
                        <span className="text-slate-400">{s.staffId} · {s.businessUnit}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">In-Meeting Duration (minutes)</label>
              <input type="number" min={0} value={newDuration} onChange={(e) => setNewDuration(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Month</label>
              <select value={newMonth} onChange={(e) => setNewMonth(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm">
                {MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Year</label>
              <input type="number" value={newYear} onChange={(e) => setNewYear(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            </div>
          </div>
          {addError && <p className="text-xs text-red-600">{addError}</p>}
          <div className="flex items-center gap-2">
            <button
              onClick={addRecord}
              disabled={!pickedStaff || !newDuration || addSaving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {addSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Add
            </button>
            <button onClick={() => { setAddingNew(false); setPickedStaff(null); setAddError('') }} className="text-sm text-slate-500 hover:text-slate-700">Cancel</button>
          </div>
        </div>
      )}

      <div className="border border-slate-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Staff ID</th>
              <th className="px-3 py-2">Business Unit</th>
              <th className="px-3 py-2">Duration (min)</th>
              <th className="px-3 py-2">Month</th>
              <th className="px-3 py-2">Year</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-xs text-slate-400">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-xs text-slate-400">No KSS records found.</td></tr>
            ) : rows.map((r) => {
              const isEditing = editingId === r.id
              return (
                <tr key={r.id} className="border-b border-slate-100">
                  {isEditing && draft ? (
                    <>
                      <td className="px-3 py-1.5"><input value={draft.staffName} onChange={(e) => setDraft({ ...draft, staffName: e.target.value })} className="w-full border border-slate-200 rounded px-2 py-1 text-sm" /></td>
                      <td className="px-3 py-1.5 text-slate-500">{r.staffId}</td>
                      <td className="px-3 py-1.5"><input value={draft.businessUnit} onChange={(e) => setDraft({ ...draft, businessUnit: e.target.value })} className="w-full border border-slate-200 rounded px-2 py-1 text-sm" /></td>
                      <td className="px-3 py-1.5"><input type="number" value={draft.durationMinutes} onChange={(e) => setDraft({ ...draft, durationMinutes: e.target.value })} className="w-24 border border-slate-200 rounded px-2 py-1 text-sm" /></td>
                      <td className="px-3 py-1.5">
                        <select value={draft.month} onChange={(e) => setDraft({ ...draft, month: e.target.value })} className="border border-slate-200 rounded px-2 py-1 text-sm">
                          <option value="">—</option>
                          {MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-1.5"><input type="number" value={draft.year} onChange={(e) => setDraft({ ...draft, year: e.target.value })} className="w-20 border border-slate-200 rounded px-2 py-1 text-sm" /></td>
                      <td className="px-3 py-1.5">
                        <div className="flex items-center gap-1.5 justify-end">
                          <button onClick={() => saveEdit(r.id)} disabled={saving} className="p-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
                            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                          </button>
                          <button onClick={() => { setEditingId(null); setDraft(null) }} className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"><X className="w-3.5 h-3.5" /></button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-3 py-2 text-slate-800">{r.staffName}</td>
                      <td className="px-3 py-2 text-slate-500">{r.staffId}</td>
                      <td className="px-3 py-2 text-slate-600">{r.businessUnit}</td>
                      <td className="px-3 py-2 text-slate-600 tabular-nums">{r.durationMinutes}</td>
                      <td className="px-3 py-2 text-slate-600">{r.month || '—'}</td>
                      <td className="px-3 py-2 text-slate-600">{r.year || '—'}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5 justify-end">
                          <button onClick={() => startEdit(r)} className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"><Pencil className="w-3.5 h-3.5" /></button>
                          <button onClick={() => deleteRow(r.id)} disabled={deletingId === r.id} className="p-1.5 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 disabled:opacity-50">
                            {deletingId === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <Pagination page={page} totalItems={total} pageSize={pageSize} onChange={setPage} />
    </div>
  )
}
