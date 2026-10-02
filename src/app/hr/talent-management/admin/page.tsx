'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Users2, TrendingUp, Repeat, Award, Star, UploadCloud, Loader2, Trash2, Search, ArrowUpDown, ArrowUp, ArrowDown, Pencil } from 'lucide-react'
import { SectionCard } from '@/components/ui/SectionCard'
import { usePagePermission } from '@/lib/use-page-permission'

// ---------- shared bits ----------

interface FieldConfig {
  key: string
  label: string
  type: 'text' | 'number' | 'date' | 'checkbox' | 'select'
  placeholder?: string
  options?: string[] // for type: 'select' — a static list, or left empty to use `dynamicOptions` (BU list)
  dynamicOptions?: 'businessUnit' // fetched once and shared across all sections that need it
}

type Row = Record<string, unknown>

interface ComputedColumn {
  key: string
  label: string
  compute: (row: Row) => string
}

function yearsBetweenToday(iso: string | null | undefined): number | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return (Date.now() - d.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
}

function fmtYears(years: number | null): string {
  if (years == null) return '—'
  return `${Math.round(years * 10) / 10} yrs`
}

function fmtCell(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) return value.slice(0, 10)
  return String(value)
}

// One section = one table of existing rows (with per-row delete), one "add one" form, and one
// bulk-paste box (tab or comma separated, one row per line, same column order as `fields`) — the
// admin can add/update individually or in bulk, per the brief. Bulk posts { items: [...] } to the
// same endpoint the single form posts a bare object to; the API upserts by its own natural key so
// re-pasting a correction never duplicates a row.
function RecordSection({
  title, icon: Icon, apiPath, fields, idKey = 'id', extraColumns = [], computedColumns = [], buOptions = [], refreshSignal = 0,
}: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  apiPath: string
  fields: FieldConfig[]
  idKey?: string
  extraColumns?: string[]
  // Read-only, derived-at-render columns appended after the editable ones (e.g. tenure computed
  // from a date field) — never sent back to the API, just shown for reference.
  computedColumns?: ComputedColumn[]
  // Canonical Business Unit names (e.g. "Meristem Securities Limited", not "MSL") for any field
  // with dynamicOptions: 'businessUnit' — fetched once at the page level and passed down so every
  // section's BU dropdown stays in sync with the same list used across the rest of the app.
  buOptions?: string[]
  // Bumped by the parent after a successful "Import from Sheets" run — this section mounted (and
  // fetched) once, before that import happened, so without this it would keep showing stale
  // (often empty) data until the admin manually reloads the whole page.
  refreshSignal?: number
}) {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState<Record<string, string>>({})
  const [bulkText, setBulkText] = useState('')
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [sortCol, setSortCol] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [editingId, setEditingId] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    fetch(apiPath)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setRows(Array.isArray(data) ? data : []))
      .catch(() => setError('Failed to load.'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [apiPath, refreshSignal])

  const columns = [...extraColumns, ...fields.map((f) => f.key)]

  const toggleSort = (col: string) => {
    if (sortCol !== col) { setSortCol(col); setSortDir('asc'); return }
    setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
  }

  const displayRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    let result = rows
    if (q) {
      result = rows.filter((r) => columns.some((c) => fmtCell(r[c]).toLowerCase().includes(q)))
    }
    if (sortCol) {
      result = [...result].sort((a, b) => {
        const av = fmtCell(a[sortCol])
        const bv = fmtCell(b[sortCol])
        const an = Number(av)
        const bn = Number(bv)
        const cmp = !Number.isNaN(an) && !Number.isNaN(bn) && av !== '' && bv !== ''
          ? an - bn
          : av.localeCompare(bv)
        return sortDir === 'asc' ? cmp : -cmp
      })
    }
    return result
  }, [rows, search, sortCol, sortDir, columns])

  const startEdit = (row: Row) => {
    const next: Record<string, string> = {}
    for (const f of fields) {
      const v = row[f.key]
      if (f.type === 'checkbox') next[f.key] = v ? 'on' : ''
      else if (f.type === 'date' && typeof v === 'string') next[f.key] = v.slice(0, 10)
      else next[f.key] = v == null ? '' : String(v)
    }
    setForm(next)
    setEditingId(String(row[idKey]))
    setError('')
  }

  const cancelEdit = () => {
    setForm({})
    setEditingId(null)
  }

  const submitOne = async () => {
    setSaving(true)
    setError('')
    try {
      const body: Record<string, unknown> = editingId ? { id: editingId } : {}
      for (const f of fields) {
        if (f.type === 'checkbox') body[f.key] = form[f.key] === 'on'
        else if (f.type === 'number') body[f.key] = form[f.key] ? Number(form[f.key]) : undefined
        else body[f.key] = form[f.key] || undefined
      }
      const res = await fetch(apiPath, {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Failed to save.') }
      setForm({})
      setEditingId(null)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.')
    } finally {
      setSaving(false)
    }
  }

  const submitBulk = async () => {
    const lines = bulkText.split('\n').map((l) => l.trim()).filter(Boolean)
    if (lines.length === 0) return
    setSaving(true)
    setError('')
    try {
      const items = lines.map((line) => {
        const parts = line.split(/\t|,/).map((p) => p.trim())
        const item: Record<string, unknown> = {}
        fields.forEach((f, i) => {
          const raw = parts[i] ?? ''
          if (f.type === 'checkbox') item[f.key] = /^(yes|true|y|1)$/i.test(raw)
          else if (f.type === 'number') item[f.key] = raw ? Number(raw) : undefined
          else item[f.key] = raw || undefined
        })
        return item
      })
      const res = await fetch(apiPath, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }) })
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Failed to save.') }
      setBulkText('')
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: string) => {
    setDeletingId(id)
    try {
      await fetch(apiPath, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
      load()
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <SectionCard icon={Icon} title={title} description={`${rows.length} record${rows.length === 1 ? '' : 's'}`}>
      <div className="p-5 pt-0 space-y-4">
        {error && <p className="text-xs text-rose-600 bg-rose-50 rounded-lg px-3 py-2">{error}</p>}

        {/* Add one / Edit */}
        {editingId && (
          <p className="text-[11px] text-amber-700 bg-amber-50 rounded-lg px-3 py-1.5">Editing an existing record — Save to apply changes, or Cancel.</p>
        )}
        <div className="flex flex-wrap items-end gap-2">
          {fields.map((f) => (
            <div key={f.key}>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">{f.label}</label>
              {f.type === 'checkbox' ? (
                <input
                  type="checkbox"
                  checked={form[f.key] === 'on'}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.checked ? 'on' : '' })}
                  className="w-4 h-4 mt-1.5"
                />
              ) : f.type === 'select' ? (
                <select
                  value={form[f.key] || ''}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs w-44 bg-white"
                >
                  <option value="">—</option>
                  {(f.dynamicOptions === 'businessUnit' ? buOptions : f.options || []).map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              ) : (
                <input
                  type={f.type}
                  value={form[f.key] || ''}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  placeholder={f.placeholder}
                  className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs w-36"
                />
              )}
            </div>
          ))}
          <button
            type="button" onClick={submitOne} disabled={saving}
            className="px-3 py-1.5 bg-meristem-700 text-white text-xs font-medium rounded-lg disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : editingId ? 'Save Changes' : 'Add'}
          </button>
          {editingId && (
            <button type="button" onClick={cancelEdit} className="px-3 py-1.5 border border-slate-300 text-slate-600 text-xs font-medium rounded-lg">
              Cancel
            </button>
          )}
        </div>

        {/* Bulk paste */}
        <div>
          <label className="block text-[11px] font-medium text-slate-500 mb-1">
            Bulk paste — one row per line, columns in order: {fields.map((f) => f.label).join(', ')} (tab or comma separated)
          </label>
          <textarea
            value={bulkText} onChange={(e) => setBulkText(e.target.value)}
            rows={3} className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-mono"
            placeholder={fields.map((f) => f.placeholder || f.label).join('\t')}
          />
          <button
            type="button" onClick={submitBulk} disabled={saving || !bulkText.trim()}
            className="mt-1.5 px-3 py-1.5 bg-slate-700 text-white text-xs font-medium rounded-lg disabled:opacity-50"
          >
            Save bulk rows
          </button>
        </div>

        {/* Search */}
        {rows.length > 0 && (
          <div className="relative max-w-xs">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="w-full pl-8 pr-2.5 py-1.5 border border-slate-300 rounded-lg text-xs"
            />
          </div>
        )}

        {/* Table */}
        {loading ? (
          <p className="text-xs text-slate-400">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-xs text-slate-400">No records yet.</p>
        ) : displayRows.length === 0 ? (
          <p className="text-xs text-slate-400">No records match &quot;{search}&quot;.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-400 border-b border-slate-100">
                  {columns.map((c) => (
                    <th key={c} className="py-1.5 pr-4 font-medium">
                      <button type="button" onClick={() => toggleSort(c)} className="flex items-center gap-1 hover:text-slate-600">
                        {fields.find((f) => f.key === c)?.label || c}
                        {sortCol === c ? (sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-40" />}
                      </button>
                    </th>
                  ))}
                  {computedColumns.map((cc) => (
                    <th key={cc.key} className="py-1.5 pr-4 font-medium text-slate-300" title="Computed, not stored">{cc.label}</th>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody>
                {displayRows.map((r) => (
                  <tr key={String(r[idKey])} className="border-b border-slate-50">
                    {columns.map((c) => <td key={c} className="py-1.5 pr-4 text-slate-700">{fmtCell(r[c])}</td>)}
                    {computedColumns.map((cc) => <td key={cc.key} className="py-1.5 pr-4 text-slate-400">{cc.compute(r)}</td>)}
                    <td className="py-1.5 text-right whitespace-nowrap">
                      <button type="button" onClick={() => startEdit(r)} className="mr-2" title="Edit">
                        <Pencil className="w-3.5 h-3.5 text-slate-400 hover:text-slate-600 inline" />
                      </button>
                      <button type="button" onClick={() => remove(String(r[idKey]))} disabled={deletingId === String(r[idKey])} title="Delete">
                        <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </SectionCard>
  )
}

// ---------- page ----------

export default function TalentManagementAdminPage() {
  const { canAdmin } = usePagePermission()
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<string | null>(null)
  const [refreshSignal, setRefreshSignal] = useState(0)
  const [buOptions, setBuOptions] = useState<string[]>([])

  // Canonical BU names (e.g. "Meristem Securities Limited", not "MSL") — the same list used
  // across the rest of the app, so Current BU / New BU dropdowns here can't drift from it.
  useEffect(() => {
    fetch('/api/business-units')
      .then((res) => (res.ok ? res.json() : []))
      .then((data: { name: string }[]) => setBuOptions(Array.isArray(data) ? data.map((u) => u.name).sort() : []))
      .catch(() => {})
  }, [])

  const runImport = async () => {
    setImporting(true)
    setImportResult(null)
    try {
      const res = await fetch('/api/admin/talent-management/import-from-sheets', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Import failed.')
      const summary = (data.results as { sheet: string; imported: number; skipped: number; unresolved: string[]; error: string | null }[])
        .map((r) => r.error ? `${r.sheet}: ${r.error}` : `${r.sheet}: ${r.imported} imported, ${r.skipped} skipped${r.unresolved.length ? `, ${r.unresolved.length} unresolved (${r.unresolved.join(', ')})` : ''}`)
        .join('\n')
      setImportResult(summary)
      setRefreshSignal((n) => n + 1)
    } catch (err) {
      setImportResult(err instanceof Error ? err.message : 'Import failed.')
    } finally {
      setImporting(false)
    }
  }

  if (!canAdmin) {
    return (
      <div className="p-8">
        <p className="text-sm text-slate-500">You don&apos;t have admin access to Talent Management.</p>
        <Link href="/hr/talent-management" className="text-xs text-meristem-700 mt-2 inline-block">← Back to dashboard</Link>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/hr/talent-management" className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 mb-2">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Talent Management
          </Link>
          <h1 className="text-lg font-bold text-slate-800">Talent Management — Admin</h1>
          <p className="text-xs text-slate-500 mt-0.5">Edit TM profiles, promotions, mobility, strategic committees, and appraisal scores — individually or in bulk.</p>
        </div>
        <div className="text-right">
          <button
            type="button" onClick={runImport} disabled={importing}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-700 text-white text-xs font-medium rounded-lg disabled:opacity-50"
          >
            {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UploadCloud className="w-3.5 h-3.5" />}
            Import from Sheets
          </button>
          <p className="text-[10px] text-slate-400 mt-1 max-w-xs">One-time/occasional bootstrap from the configured Talent Management tabs — safe to re-run, never overwrites a record you&apos;ve since corrected here with stale sheet data for a different key.</p>
        </div>
      </div>

      {importResult && (
        <pre className="text-[11px] bg-slate-50 border border-slate-200 rounded-lg p-3 whitespace-pre-wrap">{importResult}</pre>
      )}

      <RecordSection
        title="Talent Member Profiles"
        icon={Users2}
        apiPath="/api/hr/talent-management/roster"
        idKey="id"
        refreshSignal={refreshSignal}
        buOptions={buOptions}
        fields={[
          { key: 'staffId', label: 'Emp. ID', type: 'text', placeholder: 'MRL-0001' },
          { key: 'name', label: 'Name', type: 'text' },
          { key: 'email', label: 'Email', type: 'text' },
          { key: 'businessUnit', label: 'Current BU', type: 'select', dynamicOptions: 'businessUnit' },
          { key: 'currentRole', label: 'Current Role', type: 'text' },
          { key: 'currentGrade', label: 'Current Job Grade', type: 'text' },
          { key: 'currentTier', label: 'Current Tier', type: 'select', options: ['1', '2', '3'] },
          { key: 'gender', label: 'Gender', type: 'select', options: ['Male', 'Female'] },
          { key: 'dojMeristem', label: 'DOJ Meristem', type: 'date' },
          { key: 'dateJoinedTM', label: 'Date Joined TM', type: 'date' },
          { key: 'status', label: 'Status', type: 'select', options: ['Active', 'Exited'] },
        ]}
        computedColumns={[
          { key: 'lengthOfService', label: 'Length of Service (live)', compute: (r) => fmtYears(yearsBetweenToday(r.dojMeristem as string)) },
          { key: 'lengthInTM', label: 'Length in TM (live)', compute: (r) => fmtYears(yearsBetweenToday(r.dateJoinedTM as string)) },
        ]}
      />

      <RecordSection
        title="Promotions"
        icon={TrendingUp}
        apiPath="/api/hr/talent-management/promotions"
        refreshSignal={refreshSignal}
        fields={[
          { key: 'staffId', label: 'Emp. ID', type: 'text' },
          { key: 'name', label: 'Name', type: 'text' },
          { key: 'year', label: 'Year', type: 'number', placeholder: '2026' },
          { key: 'previousGrade', label: 'Previous Grade', type: 'text' },
          { key: 'newGrade', label: 'New Grade', type: 'text' },
          { key: 'promoted', label: 'Promoted', type: 'checkbox' },
        ]}
      />

      <RecordSection
        title="Internal Mobility"
        icon={Repeat}
        apiPath="/api/hr/talent-management/mobility"
        refreshSignal={refreshSignal}
        buOptions={buOptions}
        fields={[
          { key: 'staffId', label: 'Emp. ID', type: 'text' },
          { key: 'name', label: 'Name', type: 'text' },
          { key: 'year', label: 'Year', type: 'number', placeholder: '2026' },
          { key: 'newBusinessUnit', label: 'New BU', type: 'select', dynamicOptions: 'businessUnit' },
          { key: 'newRole', label: 'New Role', type: 'text' },
          { key: 'employmentStatus', label: 'Employment Status', type: 'select', options: ['Active', 'Exited'] },
        ]}
      />

      <RecordSection
        title="Strategic Committees"
        icon={Award}
        apiPath="/api/hr/talent-management/committees"
        refreshSignal={refreshSignal}
        fields={[
          { key: 'staffId', label: 'Emp. ID', type: 'text' },
          { key: 'name', label: 'Name', type: 'text' },
          { key: 'committee', label: 'Committee', type: 'text' },
        ]}
      />

      <RecordSection
        title="Performance Appraisal"
        icon={Star}
        apiPath="/api/hr/talent-management/performance"
        refreshSignal={refreshSignal}
        fields={[
          { key: 'staffId', label: 'Emp. ID', type: 'text' },
          { key: 'name', label: 'Name', type: 'text' },
          { key: 'period', label: 'Period', type: 'text', placeholder: 'H1 2026' },
          { key: 'score', label: 'Score (0–1)', type: 'number', placeholder: '0.78' },
        ]}
      />
    </div>
  )
}
