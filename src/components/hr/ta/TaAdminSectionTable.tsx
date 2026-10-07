'use client'

import { useEffect, useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, Loader2, Search, X } from 'lucide-react'

interface TaAdminField {
  key: string
  label: string
  type: 'text' | 'number' | 'date' | 'select' | 'textarea'
  options?: string[]
  required?: boolean
}

type Row = Record<string, unknown> & { rowNumber: number }

function emptyForm(fields: TaAdminField[]): Record<string, string> {
  return Object.fromEntries(fields.map((f) => [f.key, '']))
}

function fmtCell(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}

/** One generic table + add/edit form for a single TA sheet tab, backed by
 * /api/hr/admin/ta/[section]. Every write here lands on the actual Google Sheet (see
 * ta-sheets-write.ts) — there is no separate database copy to fall out of sync with. */
export function TaAdminSectionTable({ slug, label }: { slug: string; label: string }) {
  const apiPath = `/api/hr/admin/ta/${slug}`
  const [fields, setFields] = useState<TaAdminField[]>([])
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<Record<string, string>>({})
  const [editingRow, setEditingRow] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [deletingRow, setDeletingRow] = useState<number | null>(null)

  const load = () => {
    setLoading(true)
    setError('')
    fetch(apiPath)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error)
        setFields(data.fields ?? [])
        setRows(data.records ?? [])
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load.'))
      .finally(() => setLoading(false))
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [slug])

  const displayRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => fields.some((f) => fmtCell(r[f.key]).toLowerCase().includes(q)))
  }, [rows, search, fields])

  const startAdd = () => {
    setForm(emptyForm(fields))
    setEditingRow(null)
    setShowForm(true)
    setError('')
  }

  const startEdit = (row: Row) => {
    const next: Record<string, string> = {}
    for (const f of fields) next[f.key] = fmtCell(row[f.key])
    setForm(next)
    setEditingRow(row.rowNumber)
    setShowForm(true)
    setError('')
  }

  const cancelForm = () => {
    setShowForm(false)
    setEditingRow(null)
    setForm({})
  }

  const submit = async () => {
    const missing = fields.find((f) => f.required && !form[f.key]?.trim())
    if (missing) { setError(`${missing.label} is required.`); return }

    setSaving(true)
    setError('')
    try {
      const body: Record<string, unknown> = { ...form }
      if (editingRow != null) body.rowNumber = editingRow
      const res = await fetch(apiPath, {
        method: editingRow != null ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to save.')
      cancelForm()
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.')
    } finally {
      setSaving(false)
    }
  }

  const deleteRow = async (rowNumber: number) => {
    if (!confirm('Remove this row? It will be cleared from the Google Sheet (the row stays, blanked out) and will disappear from every TA dashboard page.')) return
    setDeletingRow(rowNumber)
    setError('')
    try {
      const res = await fetch(`${apiPath}?rowNumber=${rowNumber}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to delete.')
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete.')
    } finally {
      setDeletingRow(null)
    }
  }

  return (
    <div className="bg-white border border-meristem-100 rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-meristem-50 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <p className="text-sm font-bold text-slate-800">{label}</p>
          <span className="text-xs text-slate-400">{rows.length} row{rows.length === 1 ? '' : 's'}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="text-xs border border-meristem-100 rounded-lg pl-7 pr-2 py-1.5 w-40"
            />
          </div>
          <button
            onClick={startAdd}
            className="flex items-center gap-1.5 text-xs font-semibold text-white bg-meristem-600 hover:bg-meristem-700 rounded-lg px-3 py-1.5"
          >
            <Plus className="w-3.5 h-3.5" /> Add row
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center justify-between gap-3 bg-rose-50 border-b border-rose-100 px-5 py-2.5 text-xs text-rose-700">
          <span>{error}</span>
          <button onClick={() => setError('')} className="shrink-0"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {showForm && (
        <div className="p-5 border-b border-meristem-50 bg-meristem-50/40 space-y-3">
          <p className="text-xs font-semibold text-slate-600">{editingRow != null ? `Editing row ${editingRow}` : 'New row'}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {fields.map((f) => (
              <label key={f.key} className="flex flex-col gap-1 text-[11px] font-medium text-slate-500">
                {f.label}{f.required ? ' *' : ''}
                {f.type === 'select' ? (
                  <select
                    value={form[f.key] ?? ''}
                    onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
                    className="text-sm border border-meristem-100 rounded-lg px-3 py-2 bg-white"
                  >
                    <option value="">—</option>
                    {f.options?.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : f.type === 'textarea' ? (
                  <textarea
                    value={form[f.key] ?? ''}
                    onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
                    rows={3}
                    className="text-sm border border-meristem-100 rounded-lg px-3 py-2"
                  />
                ) : (
                  <input
                    type={f.type === 'date' ? 'date' : f.type === 'number' ? 'number' : 'text'}
                    value={form[f.key] ?? ''}
                    onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
                    className="text-sm border border-meristem-100 rounded-lg px-3 py-2"
                  />
                )}
              </label>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={submit} disabled={saving} className="flex items-center gap-1.5 text-xs font-semibold text-white bg-meristem-600 hover:bg-meristem-700 disabled:opacity-60 rounded-lg px-3 py-1.5">
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} {editingRow != null ? 'Save changes' : 'Add row'}
            </button>
            <button onClick={cancelForm} className="text-xs font-medium text-slate-500 hover:text-slate-700 px-3 py-1.5">Cancel</button>
          </div>
          <p className="text-[10px] text-slate-400">Writes directly to the Google Sheet — reflected on every TA dashboard page on next load.</p>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-slate-400 p-5">Loading…</p>
      ) : displayRows.length === 0 ? (
        <p className="text-sm text-slate-400 p-5">{rows.length === 0 ? 'No rows found.' : 'No rows match your search.'}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-400 uppercase tracking-wide border-b border-meristem-50">
                {fields.map((f) => <th key={f.key} className="px-4 py-2.5 font-medium whitespace-nowrap">{f.label}</th>)}
                <th className="px-4 py-2.5 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row) => (
                <tr key={row.rowNumber} className="border-b border-meristem-50 last:border-0">
                  {fields.map((f) => (
                    <td key={f.key} className="px-4 py-2.5 text-slate-700 whitespace-nowrap max-w-[220px] truncate" title={fmtCell(row[f.key])}>
                      {fmtCell(row[f.key]) || '—'}
                    </td>
                  ))}
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => startEdit(row)} className="flex items-center gap-1 text-slate-500 hover:text-meristem-700">
                        <Pencil className="w-3 h-3" /> Edit
                      </button>
                      <button onClick={() => deleteRow(row.rowNumber)} disabled={deletingRow === row.rowNumber} className="flex items-center gap-1 text-slate-500 hover:text-rose-600 disabled:opacity-60">
                        {deletingRow === row.rowNumber ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />} Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
