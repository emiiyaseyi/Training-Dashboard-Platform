'use client'

import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react'
import { GraduationCap, Loader2, Plus, Pencil, Trash2, X, Search, Download } from 'lucide-react'
import { SectionCard } from '@/components/ui/SectionCard'
import { ROLE_RESPONSIBILITY_CATEGORIES, DEVELOPMENT_DRIVER_OPTIONS, BUSINESS_OUTCOME_OPTIONS } from '@/lib/pdp-seed'

interface Course {
  id: string
  title: string
  provider: string
  category: string | null
  tags: string[]
  durationLabel: string | null
  sourceUrl: string | null
  active: boolean
}

type Draft = {
  title: string; provider: string; category: string; tags: string[]
  durationLabel: string; sourceUrl: string; active: boolean
}

function emptyDraft(): Draft {
  return { title: '', provider: '', category: '', tags: [], durationLabel: '', sourceUrl: '', active: true }
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
      durationLabel: c.durationLabel || '', sourceUrl: c.sourceUrl || '', active: c.active,
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

  // One-time initial load of ~993 courses from 7 providers' 2026 calendars (NIM, LBS, PwC Finance
  // Academy, PwC Business School, POISE, FITC, Phillips Consulting — local deliveries only), each
  // pre-tagged against the same taxonomies the PDP form uses. Safe to click more than once — upserts
  // by (title, provider), so a second click just re-confirms the data rather than duplicating it.
  // Driven in batches from here (not one giant server-side pass) — a single request covering all
  // ~993 courses risked tripping Vercel's serverless timeout and left the button spinning forever
  // with no response ever coming back. Each batch is small and fast; looping client-side also
  // means the admin sees live progress instead of a frozen spinner.
  const SEED_BATCH_SIZE = 100
  const seedCatalog = async () => {
    if (!confirm('Load the initial ~993-course catalog from the 7 provider calendars? Safe to run more than once — existing courses are updated in place, never duplicated.')) return
    setSeeding(true)
    setSeedMessage(null)
    let offset = 0
    let createdTotal = 0
    let updatedTotal = 0
    let total = 0
    try {
      while (true) {
        const res = await fetch('/api/admin/training-catalog/seed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ offset, limit: SEED_BATCH_SIZE }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || 'Failed to load the catalog.')
        createdTotal += data.created
        updatedTotal += data.updated
        total = data.total
        offset = data.nextOffset
        setSeedMessage(`Loading… ${Math.min(offset, total)} / ${total} processed (${createdTotal} added, ${updatedTotal} updated so far).`)
        if (data.done) break
      }
      setSeedMessage(`Done — ${createdTotal} added, ${updatedTotal} updated (${total} total).`)
      load()
    } catch (err) {
      setSeedMessage(err instanceof Error ? err.message : 'Failed to load the catalog.')
    } finally {
      setSeeding(false)
    }
  }

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
              title="One-time load of ~993 courses from 7 providers' 2026 calendars, pre-tagged against the PDP taxonomies. Safe to click more than once."
              className="flex items-center gap-1.5 text-xs font-medium text-slate-600 border border-slate-300 rounded-lg px-3 py-1.5 hover:bg-slate-50 disabled:opacity-50"
            >
              {seeding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              Load Initial Catalog
            </button>
            <button
              onClick={() => { setShowAddForm((v) => !v); setAddDraft(emptyDraft()); setFormError(null) }}
              className="flex items-center gap-1.5 text-xs font-medium text-white bg-navy-600 rounded-lg px-3 py-1.5 hover:bg-navy-700"
            >
              <Plus className="w-3.5 h-3.5" /> Add Course
            </button>
          </div>
        </div>

        {seedMessage && <p className="text-[11px] text-slate-500">{seedMessage}</p>}

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
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-400">No courses match.</td></tr>
                ) : (
                  filtered.map((c) => (
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
      </div>
    </SectionCard>
  )
}
