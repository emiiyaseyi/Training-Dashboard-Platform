'use client'

import { useEffect, useState } from 'react'
import { ClipboardCheck, RefreshCw, AlertTriangle, CheckCircle2, Loader2, Wand2, Search, X } from 'lucide-react'
import { Pagination, paginate } from '@/components/ui/Pagination'
import { SectionCard } from '@/components/ui/SectionCard'

interface TableAuditSample {
  id: string
  summary: string
  issues: string[]
  fields?: Record<string, string>
}

interface TableAudit {
  table: string
  label: string
  totalRecords: number
  issueCount: number
  samples: TableAuditSample[]
}

interface BusinessUnitOption {
  id: string
  name: string
}

const PAGE_SIZE = 10

const FIELD_LABELS: Record<string, string> = {
  staffId: 'Staff ID',
  businessUnit: 'Business Unit',
  training: 'Training name',
  membershipOrg: 'Membership Organization',
  trainingTitle: 'Training Title',
}

function FixForm({
  table,
  sample,
  businessUnits,
  onDone,
  onCancel,
}: {
  table: string
  sample: TableAuditSample
  businessUnits: BusinessUnitOption[]
  onDone: () => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState<Record<string, string>>(sample.fields || {})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      // First save without propagating, so we know how many other records share the same issue
      // before asking the admin to touch anything beyond the one row they're looking at.
      const res = await fetch(`/api/admin/data-quality/${table}/${sample.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates: draft }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Failed to save.')
        return
      }
      if (data.similarCount > 0) {
        const matchNote = data.matchedBy === 'name'
          ? ' (matched by name only, since the Staff ID on these was itself missing — double-check these are really the same person before confirming)'
          : ''
        if (confirm(`${data.similarCount} other record(s) in this table have the exact same issue for this same person${matchNote}. Apply this same fix to all of them too?`)) {
          const applyRes = await fetch(`/api/admin/data-quality/${table}/${sample.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ updates: draft, applyToSimilar: true }),
          })
          const applyData = await applyRes.json().catch(() => ({}))
          if (applyRes.ok) alert(`Fixed ${applyData.updated} record(s).`)
        }
      }
      onDone()
    } catch {
      setError('Failed to save — network error.')
    } finally {
      setSaving(false)
    }
  }

  const fieldNames = Object.keys(sample.fields || {})

  return (
    <div className="border border-dashed border-slate-300 rounded-lg p-3 space-y-2.5 bg-slate-50">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {fieldNames.map((field) =>
          field === 'businessUnit' ? (
            <select
              key={field}
              value={draft[field] || ''}
              onChange={(e) => setDraft({ ...draft, [field]: e.target.value })}
              className="border border-slate-300 rounded-md px-2.5 py-1.5 text-xs"
            >
              <option value="">Select Business Unit…</option>
              {businessUnits.map((bu) => <option key={bu.id} value={bu.name}>{bu.name}</option>)}
            </select>
          ) : (
            <input
              key={field}
              placeholder={FIELD_LABELS[field] || field}
              value={draft[field] || ''}
              onChange={(e) => setDraft({ ...draft, [field]: e.target.value })}
              className="border border-slate-300 rounded-md px-2.5 py-1.5 text-xs"
            />
          )
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex items-center gap-2">
        <button onClick={save} disabled={saving} className="flex items-center gap-1.5 text-xs font-medium text-white bg-navy-600 rounded-lg px-3 py-1.5 hover:bg-navy-700 disabled:opacity-50">
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Save
        </button>
        <button onClick={onCancel} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 px-2 py-1.5">
          <X className="w-3.5 h-3.5" /> Cancel
        </button>
      </div>
    </div>
  )
}

function AuditTableSection({ t, businessUnits, onFixed }: { t: TableAudit; businessUnits: BusinessUnitOption[]; onFixed: () => void }) {
  const [page, setPage] = useState(1)
  const [query, setQuery] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)

  const q = query.trim().toLowerCase()
  const filtered = q
    ? t.samples.filter((s) => s.summary.toLowerCase().includes(q) || s.issues.some((i) => i.toLowerCase().includes(q)))
    : t.samples
  const pageRows = paginate(filtered, page, PAGE_SIZE)
  const showSearch = t.samples.length > PAGE_SIZE

  useEffect(() => {
    setPage(1)
  }, [query])

  const fixable = t.table !== 'roster'

  return (
    <div className="border border-slate-200 rounded-lg p-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm font-medium text-slate-700">{t.label}</p>
        <p className="text-xs text-amber-700">
          {t.issueCount} of {t.totalRecords} record{t.totalRecords === 1 ? '' : 's'}
        </p>
      </div>
      {t.table === 'roster' && (
        <p className="text-[11px] text-slate-400 mt-1">Fix these in the Staff Data Quality panel above — click any flagged staff record there.</p>
      )}

      {showSearch && (
        <div className="relative mt-2">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded-md text-xs"
          />
        </div>
      )}

      <div className="mt-2 space-y-1.5">
        {pageRows.length === 0 ? (
          <p className="text-xs text-slate-400">No matches for that search.</p>
        ) : (
          pageRows.map((s) =>
            editingId === s.id ? (
              <FixForm
                key={s.id}
                table={t.table}
                sample={s}
                businessUnits={businessUnits}
                onCancel={() => setEditingId(null)}
                onDone={() => { setEditingId(null); onFixed() }}
              />
            ) : fixable && s.fields ? (
              <button
                key={s.id}
                onClick={() => setEditingId(s.id)}
                className="w-full text-left text-xs bg-slate-50 hover:bg-navy-50 hover:border-navy-200 border border-transparent rounded-md px-2.5 py-1.5 transition-colors"
              >
                <p className="text-slate-700 font-medium">{s.summary}</p>
                <p className="text-amber-700">{s.issues.join(' · ')}</p>
              </button>
            ) : (
              <div key={s.id} className="text-xs bg-slate-50 rounded-md px-2.5 py-1.5">
                <p className="text-slate-700 font-medium">{s.summary}</p>
                <p className="text-amber-700">{s.issues.join(' · ')}</p>
              </div>
            )
          )
        )}
        {t.issueCount > t.samples.length && (
          <p className="text-[11px] text-slate-400">+ {t.issueCount - t.samples.length} more not shown (showing the first {t.samples.length})</p>
        )}
      </div>

      <Pagination page={page} totalItems={filtered.length} pageSize={PAGE_SIZE} onChange={setPage} />
    </div>
  )
}

export function DataQualityAudit() {
  const [audit, setAudit] = useState<TableAudit[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [normalizing, setNormalizing] = useState(false)
  const [normalizeResult, setNormalizeResult] = useState<{ table: string; updated: number }[] | null>(null)
  const [businessUnits, setBusinessUnits] = useState<BusinessUnitOption[]>([])

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
    fetch('/api/business-units').then((r) => r.json()).then((d) => setBusinessUnits(Array.isArray(d) ? d : []))
  }, [])

  const normalizeBusinessUnits = async () => {
    setNormalizing(true)
    setNormalizeResult(null)
    try {
      const res = await fetch('/api/admin/normalize-business-units', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setNormalizeResult(data.results.filter((r: { updated: number }) => r.updated > 0))
        await load()
      } else {
        alert(data.error || 'Failed to normalize Business Unit names.')
      }
    } finally {
      setNormalizing(false)
    }
  }

  const totalIssues = audit?.reduce((s, t) => s + t.issueCount, 0) ?? 0

  return (
    <SectionCard
      icon={ClipboardCheck}
      title="Data Quality Audit"
      description="Records per table missing key fields — Staff ID, Business Unit, cost/amount, etc. Click a flagged record to fix it."
      headerActions={
        <>
          <button
            onClick={(e) => { e.stopPropagation(); normalizeBusinessUnits() }}
            disabled={normalizing}
            title="Re-applies Business Unit aliases (e.g. NESI -> Meristem Wealth Management Limited) to every already-stored record — catches rows imported before an alias was added."
            className="flex items-center gap-1.5 text-xs text-navy-600 border border-navy-200 rounded-lg px-2.5 py-1 hover:bg-navy-50 disabled:opacity-50"
          >
            {normalizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
            Normalize Business Unit names
          </button>
          <button onClick={(e) => { e.stopPropagation(); load() }} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </>
      }
    >
      {normalizeResult && (
        <div className="mb-3 text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
          {normalizeResult.length === 0 ? (
            <p className="text-emerald-700">No Business Unit values needed fixing — already consistent.</p>
          ) : (
            <p className="text-slate-700">
              Fixed: {normalizeResult.map((r) => `${r.table} (${r.updated})`).join(', ')}
            </p>
          )}
        </div>
      )}

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

          {audit.filter((t) => t.issueCount > 0).map((t) => (
            <AuditTableSection key={t.table} t={t} businessUnits={businessUnits} onFixed={load} />
          ))}
        </div>
      )}
    </SectionCard>
  )
}
