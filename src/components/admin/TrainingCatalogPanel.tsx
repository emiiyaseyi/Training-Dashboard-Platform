'use client'

import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react'
import { GraduationCap, Loader2, Plus, Pencil, Trash2, X, Search, Download, Tags } from 'lucide-react'
import { SectionCard } from '@/components/ui/SectionCard'
import { Pagination, paginate } from '@/components/ui/Pagination'
import { ROLE_RESPONSIBILITY_CATEGORIES, DEVELOPMENT_DRIVER_OPTIONS, BUSINESS_OUTCOME_OPTIONS } from '@/lib/pdp-seed'
import { MIN_GRADE_TIER_OPTIONS } from '@/lib/staff-grade'

const PAGE_SIZE = 50

interface Course {
  id: string
  title: string
  provider: string
  category: string | null
  tags: string[]
  durationLabel: string | null
  sourceUrl: string | null
  minTier: number | null
  active: boolean
}

type Draft = {
  title: string; provider: string; category: string; tags: string[]
  durationLabel: string; sourceUrl: string; minTier: number | null; active: boolean
}

function emptyDraft(): Draft {
  return { title: '', provider: '', category: '', tags: [], durationLabel: '', sourceUrl: '', minTier: null, active: true }
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-xs text-slate-500">
      {label}
      <span className="block mt-1">{children}</span>
    </label>
  )
}

// One labeled group of checkboxes for one of the four tag dimensions the PDP matching engine
// scores against (see resolveNeedTrainingOptions in pdp-training-suggestions.ts) — picking tags
// from these exact lists (rather than free text) is what makes matching a simple set-overlap.
function TagGroup({ label, options, selected, onToggle }: { label: string; options: string[]; selected: string[]; onToggle: (tag: string) => void }) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-500 mb-1.5">{label}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1 max-h-40 overflow-y-auto border border-slate-200 rounded-lg p-2">
        {options.map((o) => (
          <label key={o} className="flex items-start gap-1.5 text-xs text-slate-600">
            <input type="checkbox" checked={selected.includes(o)} onChange={() => onToggle(o)} className="mt-0.5 shrink-0" />
            <span>{o}</span>
          </label>
        ))}
      </div>
    </div>
  )
}

function CourseForm({
  draft, setDraft, providers, capabilityNames, onSave, onCancel, saving, error,
}: {
  draft: Draft
  setDraft: (d: Draft) => void
  providers: string[]
  capabilityNames: string[]
  onSave: () => void
  onCancel: () => void
  saving: boolean
  error: string | null
}) {
  const inputClass = 'w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm'
  const toggleTag = (tag: string) => {
    setDraft({ ...draft, tags: draft.tags.includes(tag) ? draft.tags.filter((t) => t !== tag) : [...draft.tags, tag] })
  }
  return (
    <div className="border border-dashed border-slate-300 rounded-lg p-4 space-y-3 bg-slate-50">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Title">
          <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className={inputClass} />
        </Field>
        <Field label="Provider">
          <input
            list="training-catalog-providers"
            value={draft.provider}
            onChange={(e) => setDraft({ ...draft, provider: e.target.value })}
            placeholder="Search or type a new provider…"
            className={inputClass}
          />
          <datalist id="training-catalog-providers">
            {providers.map((p) => <option key={p} value={p} />)}
          </datalist>
        </Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Category (provider's own track label)">
          <input value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} className={inputClass} />
        </Field>
        <Field label="Duration">
          <input placeholder="e.g. 3 days" value={draft.durationLabel} onChange={(e) => setDraft({ ...draft, durationLabel: e.target.value })} className={inputClass} />
        </Field>
        <Field label="Source URL (optional)">
          <input value={draft.sourceUrl} onChange={(e) => setDraft({ ...draft, sourceUrl: e.target.value })} className={inputClass} />
        </Field>
      </div>

      <Field label="Minimum Grade Level — never shown to staff, only narrows who this can be suggested to">
        <select
          value={draft.minTier ?? ''}
          onChange={(e) => setDraft({ ...draft, minTier: e.target.value === '' ? null : Number(e.target.value) })}
          className={inputClass}
        >
          {MIN_GRADE_TIER_OPTIONS.map((o) => (
            <option key={o.label} value={o.value ?? ''}>{o.label}</option>
          ))}
        </select>
      </Field>

      <div className="space-y-3">
        <TagGroup label="Role Responsibility / Skill Area" options={ROLE_RESPONSIBILITY_CATEGORIES} selected={draft.tags} onToggle={toggleTag} />
        <TagGroup label="Development Driver" options={DEVELOPMENT_DRIVER_OPTIONS} selected={draft.tags} onToggle={toggleTag} />
        <TagGroup label="Business Outcome" options={BUSINESS_OUTCOME_OPTIONS} selected={draft.tags} onToggle={toggleTag} />
        {capabilityNames.length > 0 && (
          <TagGroup label="Meristem Strategic Capability" options={capabilityNames} selected={draft.tags} onToggle={toggleTag} />
        )}
      </div>

      <label className="flex items-center gap-1.5 text-xs text-slate-600">
        <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
        Active (shown in PDP suggestions)
      </label>

      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex items-center gap-2">
        <button onClick={onSave} disabled={saving} className="flex items-center gap-1.5 text-xs font-medium text-white bg-navy-600 rounded-lg px-3 py-1.5 hover:bg-navy-700 disabled:opacity-50">
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

export function TrainingCatalogPanel() {
  const [courses, setCourses] = useState<Course[]>([])
  const [capabilityNames, setCapabilityNames] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [providerFilter, setProviderFilter] = useState('all')
  const [page, setPage] = useState(1)

  const [showAddForm, setShowAddForm] = useState(false)
  const [addDraft, setAddDraft] = useState<Draft>(emptyDraft())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<Draft>(emptyDraft())
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [seeding, setSeeding] = useState(false)
  const [seedMessage, setSeedMessage] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    fetch('/api/admin/training-catalog').then((r) => r.json()).then((d) => setCourses(Array.isArray(d) ? d : [])).finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    fetch('/api/capabilities').then((r) => r.json()).then((d) => setCapabilityNames(Array.isArray(d) ? d.map((c: { name: string }) => c.name) : [])).catch(() => {})
  }, [])

  const providers = useMemo(() => [...new Set(courses.map((c) => c.provider))].sort(), [courses])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return courses.filter((c) => {
      if (providerFilter !== 'all' && c.provider !== providerFilter) return false
      if (q && !(c.title.toLowerCase().includes(q) || c.provider.toLowerCase().includes(q) || (c.category || '').toLowerCase().includes(q))) return false
      return true
    })
  }, [courses, query, providerFilter])

  useEffect(() => { setPage(1) }, [query, providerFilter])

  const pageRows = paginate(filtered, page, PAGE_SIZE)

  const addCourse = async () => {
    setSaving(true)
    setFormError(null)
    try {
      const res = await fetch('/api/admin/training-catalog', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(addDraft),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setFormError(data.error || 'Failed to add course.'); return }
      setShowAddForm(false)
      setAddDraft(emptyDraft())
      load()
    } finally {
      setSaving(false)
    }
  }

  const startEdit = (c: Course) => {
    setEditingId(c.id)
    setFormError(null)
    setEditDraft({
      title: c.title, provider: c.provider, category: c.category || '', tags: c.tags,
      durationLabel: c.durationLabel || '', sourceUrl: c.sourceUrl || '', minTier: c.minTier, active: c.active,
    })
  }

  const saveEdit = async () => {
    if (!editingId) return
    setSaving(true)
    setFormError(null)
    try {
      const res = await fetch(`/api/admin/training-catalog/${editingId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editDraft),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setFormError(data.error || 'Failed to save.'); return }
      setEditingId(null)
      load()
    } finally {
      setSaving(false)
    }
  }

  // Shared driver for all 4 batched admin actions below — each one's API route takes {offset,
  // limit} and returns {nextOffset, total, done, ...counts}. Looping from here (instead of one
  // giant server-side pass) keeps every single request fast enough to never trip Vercel's
  // serverless timeout, and lets the admin see live "Batch X of Y" progress instead of a frozen
  // spinner with no feedback until the whole thing finishes (or silently never does).
  const runBatched = async (
    endpoint: string,
    batchSize: number,
    describe: (data: Record<string, unknown>) => string,
    summarize: (totals: Record<string, number>, total: number) => string,
  ) => {
    setSeeding(true)
    setSeedMessage('Starting…')
    let offset = 0
    let batchNum = 0
    let total = 0
    const totals: Record<string, number> = {}
    try {
      while (true) {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ offset, limit: batchSize }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || 'Request failed.')
        batchNum += 1
        total = typeof data.total === 'number' ? data.total : total
        const totalBatches = total > 0 ? Math.ceil(total / batchSize) : batchNum
        for (const [key, val] of Object.entries(data)) {
          if (typeof val === 'number' && key !== 'nextOffset' && key !== 'total') totals[key] = (totals[key] || 0) + val
        }
        setSeedMessage(`Batch ${batchNum} of ${totalBatches} complete — ${describe(data)}`)
        offset = typeof data.nextOffset === 'number' ? data.nextOffset : offset + batchSize
        if (data.done) break
      }
      setSeedMessage(summarize(totals, total))
      load()
    } catch (err) {
      setSeedMessage(err instanceof Error ? err.message : 'Request failed.')
    } finally {
      setSeeding(false)
    }
  }

  // One-time initial load of ~1,100 courses from 9 providers' 2026 calendars plus Udemy/Coursera,
  // each pre-tagged against the same taxonomies the PDP form uses. Safe to click more than once —
  // upserts by (title, provider), so a second click just re-confirms the data rather than
  // duplicating it.
  const seedCatalog = () => runBatched(
    '/api/admin/training-catalog/seed',
    100,
    (d) => `${d.created} added, ${d.updated} updated, ${d.unchanged} unchanged this batch.`,
    (t) => `Done — ${t.created || 0} added, ${t.updated || 0} updated (${(t.created || 0) + (t.updated || 0) + (t.unchanged || 0)} processed).`,
  )

  const stripYears = () => runBatched(
    '/api/admin/training-catalog/strip-years',
    150,
    (d) => `${d.updated} title(s) cleaned this batch.`,
    (t) => (t.updated > 0 ? `Done — removed the year from ${t.updated} title(s).` : 'Done — no course titles had a year to remove.'),
  )

  // Conservative one-off pass — only flags clearly board/C-suite titles (e.g. "Chief Information
  // Officers' Continuous Education Programme") as Tier 4, never touches a course that already has
  // a grade level set. Everything else stays unrestricted; review/adjust via the table.
  const autoTagGrade = () => runBatched(
    '/api/admin/training-catalog/auto-tag-grade',
    150,
    (d) => `${d.tagged} course(s) set to "AVP and Above" this batch.`,
    (t) => (t.tagged > 0 ? `Done — set "AVP and Above" on ${t.tagged} clearly board/C-suite course(s). Everything else stays unrestricted — review via the table.` : 'Done — no untagged courses matched an obvious board/C-suite title.'),
  )

  // One-off pass: tags courses against Meristem's currently-configured Differentiating
  // Capabilities, via keyword overlap on title/category. Never removes an existing tag, so it's
  // safe to re-run after adding new capabilities or new courses.
  const autoTagCapabilities = () => runBatched(
    '/api/admin/training-catalog/auto-tag-capabilities',
    150,
    (d) => `${d.tagged} course(s) tagged this batch.`,
    (t) => (t.tagged > 0 ? `Done — added a Meristem Strategic Capability tag to ${t.tagged} course(s) based on title/category keyword matches. Spot-check via the table — this is keyword matching, not a guarantee of true relevance.` : 'Done — no courses matched a configured capability by keyword.'),
  )

  const deleteCourse = async (c: Course) => {
    if (!confirm(`Delete "${c.title}" (${c.provider}) from the training catalog? This can't be undone, but doesn't affect any PDP already filled.`)) return
    setBusyId(c.id)
    try {
      await fetch(`/api/admin/training-catalog/${c.id}`, { method: 'DELETE' })
      load()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <SectionCard
      icon={GraduationCap}
      title="Training Catalog"
      description="Real, bookable external training courses, tagged so the PDP's Proposed Training Title question can suggest matching ones. Tag each course against Role Responsibility/Skill Area, Development Driver, Business Outcome and Meristem Strategic Capability — whatever a respondent's own answers overlap with is what gets suggested."
    >
      <div className="p-5 pt-0 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search title, provider, category…"
                className="pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg text-xs w-64"
              />
            </div>
            <select value={providerFilter} onChange={(e) => setProviderFilter(e.target.value)} className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs">
              <option value="all">All Providers</option>
              {providers.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={seedCatalog}
              disabled={seeding}
              title="One-time load of ~1,100 courses from 9 providers' 2026 calendars plus Udemy/Coursera, pre-tagged against the PDP taxonomies. Safe to click more than once — runs in batches, with progress shown below."
              className="flex items-center gap-1.5 text-xs font-medium text-slate-600 border border-slate-300 rounded-lg px-3 py-1.5 hover:bg-slate-50 disabled:opacity-50"
            >
              {seeding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              Load Initial Catalog
            </button>
            <button
              onClick={stripYears}
              disabled={seeding}
              title="Removes a calendar year from any course title (e.g. '2026 Chief Information Officers...' -> 'Chief Information Officers...'). Keeps years that are part of an actual product name, like 'COBIT 2019'."
              className="flex items-center gap-1.5 text-xs font-medium text-slate-600 border border-slate-300 rounded-lg px-3 py-1.5 hover:bg-slate-50 disabled:opacity-50"
            >
              {seeding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
              Remove Years from Titles
            </button>
            <button
              onClick={autoTagGrade}
              disabled={seeding}
              title="One-off, conservative: flags only clearly board/C-suite titles (e.g. 'Chief Information Officers...') as 'AVP and Above', so a junior grade never sees them suggested. Never overwrites a course that already has a grade level set — everything else stays unrestricted."
              className="flex items-center gap-1.5 text-xs font-medium text-slate-600 border border-slate-300 rounded-lg px-3 py-1.5 hover:bg-slate-50 disabled:opacity-50"
            >
              {seeding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <GraduationCap className="w-3.5 h-3.5" />}
              Auto-tag Grade Levels
            </button>
            <button
              onClick={autoTagCapabilities}
              disabled={seeding}
              title="One-off: tags courses against Meristem's currently-configured Strategic Capabilities by matching keywords in the capability name against each course's title/category. Never removes a tag already set — safe to re-run."
              className="flex items-center gap-1.5 text-xs font-medium text-slate-600 border border-slate-300 rounded-lg px-3 py-1.5 hover:bg-slate-50 disabled:opacity-50"
            >
              {seeding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Tags className="w-3.5 h-3.5" />}
              Auto-tag Capabilities
            </button>
            <button
              onClick={() => { setShowAddForm((v) => !v); setAddDraft(emptyDraft()); setFormError(null) }}
              className="flex items-center gap-1.5 text-xs font-medium text-white bg-navy-600 rounded-lg px-3 py-1.5 hover:bg-navy-700"
            >
              <Plus className="w-3.5 h-3.5" /> Add Course
            </button>
          </div>
        </div>

        {seedMessage && (
          <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${seeding ? 'bg-navy-50 text-navy-700 border border-navy-200' : 'bg-slate-50 text-slate-600 border border-slate-200'}`}>
            {seeding && <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />}
            {seedMessage}
          </div>
        )}

        {showAddForm && (
          <CourseForm draft={addDraft} setDraft={setAddDraft} providers={providers} capabilityNames={capabilityNames} onSave={addCourse} onCancel={() => setShowAddForm(false)} saving={saving} error={formError} />
        )}

        <div className="border border-slate-200 rounded-xl bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 text-left text-[11px] font-medium text-slate-500 border-b border-slate-200">
                  <th className="px-3 py-2">Title</th>
                  <th className="px-3 py-2">Provider</th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2">Tags</th>
                  <th className="px-3 py-2">Active</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-400">Loading…</td></tr>
                ) : pageRows.length === 0 ? (
                  <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-400">No courses match.</td></tr>
                ) : (
                  pageRows.map((c) => (
                    <Fragment key={c.id}>
                      <tr className="border-b border-slate-100 last:border-0 align-top">
                        <td className="px-3 py-2 text-slate-700">{c.title}</td>
                        <td className="px-3 py-2 text-slate-600">{c.provider}</td>
                        <td className="px-3 py-2 text-slate-500">{c.category || '—'}</td>
                        <td className="px-3 py-2 text-slate-500">{c.tags.length}</td>
                        <td className="px-3 py-2">
                          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${c.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                            {c.active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <button onClick={() => (editingId === c.id ? setEditingId(null) : startEdit(c))} className="text-navy-600 hover:text-navy-800">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => deleteCourse(c)} disabled={busyId === c.id} className="text-slate-400 hover:text-red-600 disabled:opacity-50">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {editingId === c.id && (
                        <tr className="border-b border-slate-100 last:border-0 bg-slate-50">
                          <td colSpan={6} className="px-3 py-3">
                            <CourseForm draft={editDraft} setDraft={setEditDraft} providers={providers} capabilityNames={capabilityNames} onSave={saveEdit} onCancel={() => setEditingId(null)} saving={saving} error={formError} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        <Pagination page={page} totalItems={filtered.length} pageSize={PAGE_SIZE} onChange={setPage} />
      </div>
    </SectionCard>
  )
}
