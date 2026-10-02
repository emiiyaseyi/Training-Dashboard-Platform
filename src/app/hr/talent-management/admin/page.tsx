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
  defaultValue?: () => string // actual pre-filled value for a fresh Add form, not just a placeholder
}

function defaultForm(fields: FieldConfig[]): Record<string, string> {
  const form: Record<string, string> = {}
  for (const f of fields) if (f.defaultValue) form[f.key] = f.defaultValue()
  return form
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

// H1 if the current month is Jan-Jun, H2 if Jul-Dec — matches the calendar halves already used
// throughout this sheet (H1 2025 / H2 2025 / H1 2026), so a new appraisal record defaults to the
// period that's actually current instead of an arbitrary placeholder.
function currentHalfYearPeriod(): string {
  const now = new Date()
  const half = now.getMonth() < 6 ? 'H1' : 'H2'
  return `${half} ${now.getFullYear()}`
}

function findRecordFor(rows: Row[], match: (r: Row) => boolean): Row | null {
  return rows.find(match) ?? null
}

const mobilityPivot: PivotConfig = {
  columns: [
    { key: 'staffId', label: 'Emp. ID', render: (rows) => fmtCell(rows[0]?.staffId) },
    { key: 'name', label: 'Name', render: (rows) => fmtCell(rows[0]?.name) },
    {
      key: '2025',
      label: '2025: From → To',
      render: (rows) => {
        const r = findRecordFor(rows, (x) => x.year === 2025)
        if (!r) return '—'
        const to = [r.newBusinessUnit, r.newRole].filter(Boolean).join(' / ')
        return to ? `No prior data → ${to}` : 'No Change'
      },
      editRecord: (rows) => findRecordFor(rows, (x) => x.year === 2025),
    },
    {
      key: '2026',
      label: '2026: From → To',
      render: (rows) => {
        const r = findRecordFor(rows, (x) => x.year === 2026)
        if (!r) return '—'
        const from = [r.previousBusinessUnit, r.previousRole].filter(Boolean).join(' / ') || '(unchanged)'
        const to = [r.newBusinessUnit, r.newRole].filter(Boolean).join(' / ')
        return to ? `${from} → ${to}` : 'No Change'
      },
      editRecord: (rows) => findRecordFor(rows, (x) => x.year === 2026),
    },
    {
      key: 'employmentStatus',
      label: 'Employment Status',
      render: (rows) => fmtCell(rows[0]?.employmentStatus),
      editRecord: (rows) => rows[0] ?? null,
    },
  ],
}

const promotionPivot: PivotConfig = {
  columns: [
    { key: 'staffId', label: 'Emp. ID', render: (rows) => fmtCell(rows[0]?.staffId) },
    { key: 'name', label: 'Name', render: (rows) => fmtCell(rows[0]?.name) },
    {
      key: '2025',
      label: '2025 Promotion',
      render: (rows) => {
        const r = findRecordFor(rows, (x) => x.year === 2025)
        if (!r) return '—'
        return r.promoted ? `Yes${r.newGrade ? ` → ${fmtCell(r.newGrade)}` : ''}` : 'No'
      },
      editRecord: (rows) => findRecordFor(rows, (x) => x.year === 2025),
    },
    {
      key: '2026',
      label: '2026 Promotion',
      render: (rows) => {
        const r = findRecordFor(rows, (x) => x.year === 2026)
        if (!r) return '—'
        return r.promoted ? `Yes${r.newGrade ? ` → ${fmtCell(r.newGrade)}` : ''}` : 'No'
      },
      editRecord: (rows) => findRecordFor(rows, (x) => x.year === 2026),
    },
    {
      key: 'everPromoted',
      label: 'Ever Promoted (2025–2026)',
      render: (rows) => (rows.some((r) => r.promoted) ? 'Yes' : 'No'),
    },
  ],
}

const performancePivot: PivotConfig = {
  columns: [
    { key: 'staffId', label: 'Emp. ID', render: (rows) => fmtCell(rows[0]?.staffId) },
    { key: 'name', label: 'Name', render: (rows) => fmtCell(rows[0]?.name) },
    ...['H1 2025', 'H2 2025', 'H1 2026'].map((period) => ({
      key: period,
      label: period,
      render: (rows: Row[]) => {
        const r = findRecordFor(rows, (x) => x.period === period)
        return r?.score != null ? `${Math.round(Number(r.score) * 10) / 10}` : '—'
      },
      editRecord: (rows: Row[]) => findRecordFor(rows, (x) => x.period === period),
    })),
    {
      key: 'trend',
      label: 'Trend',
      render: (rows) => {
        const scores = ['H1 2025', 'H2 2025', 'H1 2026']
          .map((p) => findRecordFor(rows, (x) => x.period === p)?.score)
          .filter((s): s is number => s != null)
        if (scores.length < 2) return '—'
        const delta = Number(scores[scores.length - 1]) - Number(scores[0])
        if (Math.abs(delta) < 0.5) return 'Flat'
        return delta > 0 ? `▲ +${Math.round(delta * 10) / 10}` : `▼ ${Math.round(delta * 10) / 10}`
      },
    },
  ],
}

function fmtCell(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) return value.slice(0, 10)
  return String(value)
}

// One row per PERSON instead of one row per underlying record — "retain the sheet format" for
// Mobility/Promotion/Performance, which were originally one-row-per-person-per-year/period wide
// sheets. Groups the flat records by staffId; each pivot column renders from that person's own
// records (e.g. "find the 2025 row and show its newBusinessUnit"), with its own Edit pencil that
// opens the one underlying record it came from — editing itself still happens exactly like every
// other section (one year/period record at a time), only the listing is pivoted.
interface PivotColumn {
  key: string
  label: string
  render: (rowsForPerson: Row[]) => string
  // Which single underlying record (if any) this column's Edit pencil should open — distinct from
  // render() because a cell can summarize more than one record (e.g. "Ever Promoted" from both
  // years) while still needing one specific record to edit.
  editRecord?: (rowsForPerson: Row[]) => Row | null
}

interface PivotConfig {
  columns: PivotColumn[]
}

// One section = one table of existing rows (with per-row delete), one "add one" form, and one
// bulk-paste box (tab or comma separated, one row per line, same column order as `fields`) — the
// admin can add/update individually or in bulk, per the brief. Bulk posts { items: [...] } to the
// same endpoint the single form posts a bare object to; the API upserts by its own natural key so
// re-pasting a correction never duplicates a row.
function RecordSection({
  title, icon: Icon, apiPath, fields, idKey = 'id', extraColumns = [], computedColumns = [], buOptions = [], refreshSignal = 0, pivot, dedupePath,
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
  // When set, the table renders one row per person (grouped by staffId) instead of one row per
  // underlying record — see PivotConfig above.
  pivot?: PivotConfig
  // One-time cleanup endpoint for a section whose natural key isn't DB-enforced (currently just
  // Strategic Committees) — shows a "Remove duplicates" button when set.
  dedupePath?: string
}) {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState<Record<string, string>>(() => defaultForm(fields))
  const [bulkText, setBulkText] = useState('')
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [sortCol, setSortCol] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deduping, setDeduping] = useState(false)
  const [dedupeResult, setDedupeResult] = useState<string | null>(null)

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

  // Grouped by staffId for pivot mode — one entry per person, carrying every underlying record
  // for them so each pivot column can pick out whichever year/period it needs.
  const displayPersons = useMemo(() => {
    if (!pivot) return []
    const groups = new Map<string, Row[]>()
    for (const r of displayRows) {
      const key = String(r.staffId ?? r[idKey])
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(r)
    }
    return [...groups.entries()].map(([staffId, personRows]) => ({ staffId, personRows }))
  }, [displayRows, pivot, idKey])

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
    setForm(defaultForm(fields))
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
      setForm(defaultForm(fields))
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

  const dedupe = async () => {
    if (!dedupePath) return
    setDeduping(true)
    setDedupeResult(null)
    try {
      const res = await fetch(dedupePath, { method: 'POST' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Failed to deduplicate.')
      setDedupeResult(`Removed ${d.deleted} duplicate${d.deleted === 1 ? '' : 's'}, ${d.remaining} remaining.`)
      load()
    } catch (err) {
      setDedupeResult(err instanceof Error ? err.message : 'Failed to deduplicate.')
    } finally {
      setDeduping(false)
    }
  }

  return (
    <SectionCard
      icon={Icon}
      title={title}
      description={
        pivot
          ? `${rows.length} record${rows.length === 1 ? '' : 's'} across ${displayPersons.length} ${displayPersons.length === 1 ? 'person' : 'people'} — one row per year/period, pivoted below`
          : `${rows.length} record${rows.length === 1 ? '' : 's'}`
      }
    >
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
        {(rows.length > 0 || dedupePath) && (
          <div className="flex items-center gap-2">
            {rows.length > 0 && (
              <div className="relative max-w-xs flex-1">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search…"
                  className="w-full pl-8 pr-2.5 py-1.5 border border-slate-300 rounded-lg text-xs"
                />
              </div>
            )}
            {dedupePath && (
              <button
                type="button" onClick={dedupe} disabled={deduping}
                className="px-2.5 py-1.5 border border-slate-300 text-slate-600 text-[11px] font-medium rounded-lg whitespace-nowrap disabled:opacity-50"
              >
                {deduping ? <Loader2 className="w-3 h-3 animate-spin inline" /> : 'Remove duplicates'}
              </button>
            )}
          </div>
        )}
        {dedupeResult && <p className="text-[11px] text-slate-500">{dedupeResult}</p>}

        {/* Table */}
        {loading ? (
          <p className="text-xs text-slate-400">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-xs text-slate-400">No records yet.</p>
        ) : displayRows.length === 0 ? (
          <p className="text-xs text-slate-400">No records match &quot;{search}&quot;.</p>
        ) : pivot ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-400 border-b border-slate-100">
                  {pivot.columns.map((c) => <th key={c.key} className="py-1.5 pr-4 font-medium">{c.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {displayPersons.map(({ staffId, personRows }) => (
                  <tr key={staffId} className="border-b border-slate-50">
                    {pivot.columns.map((c) => {
                      const editTarget = c.editRecord?.(personRows) ?? null
                      return (
                        <td key={c.key} className="py-1.5 pr-4 text-slate-700">
                          <span>{c.render(personRows)}</span>
                          {editTarget && (
                            <button type="button" onClick={() => startEdit(editTarget)} className="ml-1.5 align-middle" title="Edit">
                              <Pencil className="w-3 h-3 text-slate-300 hover:text-slate-600 inline" />
                            </button>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
        {pivot && (
          <p className="text-[11px] text-slate-400">Pivoted for readability — delete isn&apos;t available here; use the search box above to narrow down, then edit or clear a value via the pencil icon.</p>
        )}
      </div>
    </SectionCard>
  )
}

// ---------- page ----------

interface TMImportSheetResultClient {
  sheet: string
  imported: number
  skipped: number
  skippedDetails: { identifier: string; reason: string }[]
  unresolved: { name: string; committee?: string }[]
  error: string | null
}

// Inline fix for one unresolved Strategic Teams name — types a Staff ID, saves straight to the
// committees endpoint, same as editing it later from that section's table would, just without
// having to go find the row there first.
function ResolveUnresolvedName({ name, committee, onResolved }: { name: string; committee?: string; onResolved: () => void }) {
  const [staffId, setStaffId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const save = async () => {
    if (!staffId.trim() || !committee) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/hr/talent-management/committees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffId: staffId.trim(), name, committee }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Failed to save.') }
      onResolved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <span className="inline-flex items-center gap-1 ml-2">
      <input
        value={staffId} onChange={(e) => setStaffId(e.target.value)}
        placeholder="Staff ID"
        className="px-1.5 py-0.5 border border-slate-300 rounded text-[11px] w-24"
      />
      <button type="button" onClick={save} disabled={saving || !staffId.trim()} className="px-1.5 py-0.5 bg-meristem-700 text-white text-[11px] rounded disabled:opacity-50">
        {saving ? '…' : 'Resolve'}
      </button>
      {error && <span className="text-rose-600 text-[11px]">{error}</span>}
    </span>
  )
}

function ImportIssuesPanel({ results, onResolved }: { results: TMImportSheetResultClient[]; onResolved: () => void }) {
  return (
    <div className="space-y-3">
      {results.map((r) => (
        <div key={r.sheet} className="border border-slate-200 rounded-lg p-3">
          <p className="text-xs font-semibold text-slate-700">
            {r.sheet}
            {r.error ? <span className="text-rose-600 font-normal"> — {r.error}</span> : <span className="text-slate-400 font-normal"> — {r.imported} imported, {r.skipped} skipped{r.unresolved.length ? `, ${r.unresolved.length} unresolved` : ''}</span>}
          </p>
          {r.skippedDetails.length > 0 && (
            <div className="mt-1.5">
              <p className="text-[11px] font-medium text-slate-500">Skipped:</p>
              <ul className="text-[11px] text-slate-500 list-disc list-inside">
                {r.skippedDetails.map((s, i) => <li key={i}>{s.identifier} — {s.reason}</li>)}
              </ul>
            </div>
          )}
          {r.unresolved.length > 0 && (
            <div className="mt-1.5">
              <p className="text-[11px] font-medium text-slate-500">Unresolved — couldn&apos;t match anyone in the staff directory:</p>
              <ul className="text-[11px] text-slate-600">
                {r.unresolved.map((u, i) => (
                  <li key={i} className="py-0.5">
                    {u.name}{u.committee ? ` (${u.committee})` : ''}
                    {u.committee && <ResolveUnresolvedName name={u.name} committee={u.committee} onResolved={onResolved} />}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export default function TalentManagementAdminPage() {
  const { canAdmin } = usePagePermission()
  const [importing, setImporting] = useState(false)
  const [importResults, setImportResults] = useState<TMImportSheetResultClient[] | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
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
    setImportResults(null)
    setImportError(null)
    try {
      const res = await fetch('/api/admin/talent-management/import-from-sheets', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Import failed.')
      setImportResults(data.results as TMImportSheetResultClient[])
      setRefreshSignal((n) => n + 1)
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import failed.')
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

      {importError && (
        <p className="text-xs text-rose-600 bg-rose-50 rounded-lg px-3 py-2">{importError}</p>
      )}
      {importResults && (
        <ImportIssuesPanel results={importResults} onResolved={() => setRefreshSignal((n) => n + 1)} />
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
        pivot={promotionPivot}
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
        pivot={mobilityPivot}
        fields={[
          { key: 'staffId', label: 'Emp. ID', type: 'text' },
          { key: 'name', label: 'Name', type: 'text' },
          { key: 'year', label: 'Year', type: 'number', placeholder: '2026' },
          { key: 'previousBusinessUnit', label: 'Previous BU', type: 'select', dynamicOptions: 'businessUnit' },
          { key: 'previousRole', label: 'Previous Role', type: 'text' },
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
        dedupePath="/api/hr/talent-management/committees/deduplicate"
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
        pivot={performancePivot}
        fields={[
          { key: 'staffId', label: 'Emp. ID', type: 'text' },
          { key: 'name', label: 'Name', type: 'text' },
          { key: 'period', label: 'Period', type: 'text', defaultValue: currentHalfYearPeriod },
          { key: 'score', label: 'Score (0–100)', type: 'number', placeholder: '78' },
        ]}
      />
    </div>
  )
}
