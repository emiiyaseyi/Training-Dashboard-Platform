'use client'

import { useState } from 'react'
import { Loader2, Plus, Trash2, Pencil, X, Check, ChevronDown, ChevronUp } from 'lucide-react'

interface Question {
  id: string
  order: number
  label: string
  description: string | null
  type: string
  options: string | null
  optionsSource: string | null
  ratingMax: number
  required: boolean
  searchable: boolean
  maxSelect: number | null
}

interface Section {
  id: string
  key: string
  title: string
  description: string | null
  enabled: boolean
  maxRepeats: number
  questions: Question[]
}

interface Cycle {
  id: string
  requireManagerValidation: boolean
}

const TYPE_OPTIONS = [
  { value: 'text', label: 'Short text' },
  { value: 'textarea', label: 'Long text' },
  { value: 'select', label: 'Dropdown' },
  { value: 'multiselect', label: 'Multiple choice' },
  { value: 'rating', label: 'Rating' },
  { value: 'yesno', label: 'Yes/No' },
]

const emptyQuestionDraft = { label: '', description: '', type: 'text', options: '', optionsSource: '', required: false, searchable: false, maxSelect: '' }

// Admin-configurable editor for the whole PDP form: sections (enable/disable, repeat count — e.g.
// "up to 3 Development Needs") and, inside each, its questions (type, options, required,
// searchable, max-select cap, or sourced live from the configured Differentiating Capabilities
// instead of a fixed option list). Replaces the earlier flat "priority/action" fixed-field editor
// now that the form is fully section/question driven. Editable before AND after a cycle has been
// sent — nothing here is locked once launched, per the admin's explicit requirement.
export function PDPQuestionsEditor({ cycle, sections, onReload }: { cycle: Cycle; sections: Section[]; onReload: () => Promise<void> }) {
  const [savingValidationToggle, setSavingValidationToggle] = useState(false)
  const [requireValidation, setRequireValidation] = useState(cycle.requireManagerValidation)
  const [expandedId, setExpandedId] = useState<string | null>(sections[0]?.id ?? null)

  const [showAddSection, setShowAddSection] = useState(false)
  const [newSection, setNewSection] = useState({ title: '', description: '', maxRepeats: '1' })
  const [addingSection, setAddingSection] = useState(false)
  const [savingSectionId, setSavingSectionId] = useState<string | null>(null)

  const [addingQuestionTo, setAddingQuestionTo] = useState<string | null>(null)
  const [newQ, setNewQ] = useState(emptyQuestionDraft)
  const [savingQuestion, setSavingQuestion] = useState(false)
  const [editingQId, setEditingQId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState(emptyQuestionDraft)
  const [savingQId, setSavingQId] = useState<string | null>(null)

  const toggleRequireValidation = async (checked: boolean) => {
    setRequireValidation(checked)
    setSavingValidationToggle(true)
    try {
      await fetch(`/api/admin/pdp/${cycle.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requireManagerValidation: checked }),
      })
      await onReload()
    } finally {
      setSavingValidationToggle(false)
    }
  }

  const addSection = async () => {
    if (!newSection.title.trim()) return
    setAddingSection(true)
    try {
      await fetch(`/api/admin/pdp/${cycle.id}/sections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newSection.title.trim(),
          description: newSection.description.trim() || null,
          maxRepeats: Number(newSection.maxRepeats) || 1,
        }),
      })
      setNewSection({ title: '', description: '', maxRepeats: '1' })
      setShowAddSection(false)
      await onReload()
    } finally {
      setAddingSection(false)
    }
  }

  const toggleSectionEnabled = async (section: Section) => {
    setSavingSectionId(section.id)
    try {
      await fetch(`/api/admin/pdp/${cycle.id}/sections/${section.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !section.enabled }),
      })
      await onReload()
    } finally {
      setSavingSectionId(null)
    }
  }

  const deleteSection = async (section: Section) => {
    if (!confirm(`Delete the "${section.title}" section and all its questions? Anyone who already answered keeps their existing answers on record, they just won't be asked again.`)) return
    setSavingSectionId(section.id)
    try {
      await fetch(`/api/admin/pdp/${cycle.id}/sections/${section.id}`, { method: 'DELETE' })
      await onReload()
    } finally {
      setSavingSectionId(null)
    }
  }

  const addQuestion = async (sectionId: string) => {
    if (!newQ.label.trim()) return
    setSavingQuestion(true)
    try {
      await fetch(`/api/admin/pdp/${cycle.id}/sections/${sectionId}/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: newQ.label.trim(),
          description: newQ.description.trim() || null,
          type: newQ.type,
          options: newQ.optionsSource === 'capabilities' ? undefined : ['select', 'multiselect'].includes(newQ.type) ? newQ.options.split('\n').map((o) => o.trim()).filter(Boolean) : undefined,
          optionsSource: newQ.optionsSource === 'capabilities' ? 'capabilities' : undefined,
          required: newQ.required,
          searchable: newQ.searchable,
          maxSelect: newQ.type === 'multiselect' && newQ.maxSelect ? Number(newQ.maxSelect) : undefined,
        }),
      })
      setNewQ(emptyQuestionDraft)
      setAddingQuestionTo(null)
      await onReload()
    } finally {
      setSavingQuestion(false)
    }
  }

  const startEdit = (q: Question) => {
    setEditingQId(q.id)
    setEditDraft({
      label: q.label,
      description: q.description || '',
      type: q.type,
      options: q.options ? (JSON.parse(q.options) as string[]).join('\n') : '',
      optionsSource: q.optionsSource || '',
      required: q.required,
      searchable: q.searchable,
      maxSelect: q.maxSelect ? String(q.maxSelect) : '',
    })
  }

  const saveEdit = async (sectionId: string, id: string) => {
    setSavingQId(id)
    try {
      await fetch(`/api/admin/pdp/${cycle.id}/sections/${sectionId}/questions/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: editDraft.label.trim(),
          description: editDraft.description.trim() || null,
          required: editDraft.required,
          searchable: editDraft.searchable,
          options: editDraft.optionsSource === 'capabilities' ? null : ['select', 'multiselect'].includes(editDraft.type) ? editDraft.options.split('\n').map((o) => o.trim()).filter(Boolean) : null,
          maxSelect: editDraft.type === 'multiselect' && editDraft.maxSelect ? Number(editDraft.maxSelect) : null,
        }),
      })
      setEditingQId(null)
      await onReload()
    } finally {
      setSavingQId(null)
    }
  }

  const deleteQuestion = async (sectionId: string, id: string) => {
    if (!confirm('Remove this question? Anyone who already answered it keeps their existing answer on record, it just won’t be shown going forward.')) return
    setSavingQId(id)
    try {
      await fetch(`/api/admin/pdp/${cycle.id}/sections/${sectionId}/questions/${id}`, { method: 'DELETE' })
      await onReload()
    } finally {
      setSavingQId(null)
    }
  }

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-1.5 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
        <input type="checkbox" checked={requireValidation} onChange={(e) => toggleRequireValidation(e.target.checked)} disabled={savingValidationToggle} />
        Require line manager review (Section 7) after a staff member submits their own plan — only applies to Track A (Self-Fill); Track B managers skip this since they are the line manager already.
        {savingValidationToggle && <Loader2 className="w-3 h-3 animate-spin" />}
      </label>

      {sections.length === 0 && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          This cycle has no sections yet, so respondents opening their link currently see an empty form. Seed it via the Supabase SQL Editor (same approach used for the Skills Assessment Test), then refresh this panel.
        </p>
      )}

      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-600">Sections</p>
        <button onClick={() => setShowAddSection((v) => !v)} className="flex items-center gap-1 text-xs font-medium text-navy-700 hover:underline">
          <Plus className="w-3.5 h-3.5" /> Add section
        </button>
      </div>

      {showAddSection && (
        <div className="border border-dashed border-slate-300 rounded-lg p-3 space-y-2">
          <input value={newSection.title} onChange={(e) => setNewSection({ ...newSection, title: e.target.value })} placeholder="Section title" className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm" />
          <input value={newSection.description} onChange={(e) => setNewSection({ ...newSection, description: e.target.value })} placeholder="Helper text (optional)" className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm" />
          <label className="text-xs text-slate-500 block max-w-xs">
            Repeat this section up to
            <input type="number" min={1} value={newSection.maxRepeats} onChange={(e) => setNewSection({ ...newSection, maxRepeats: e.target.value })} className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm mt-1" />
            <span className="text-[11px] text-slate-400">times per respondent (e.g. 3 for multiple Development Needs). Leave at 1 for a normal, once-only section.</span>
          </label>
          <div className="flex items-center gap-2">
            <button onClick={addSection} disabled={addingSection || !newSection.title.trim()} className="flex items-center gap-1.5 text-xs font-medium text-white bg-navy-600 rounded-lg px-3 py-1.5 hover:bg-navy-700 disabled:opacity-50">
              {addingSection && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Add
            </button>
            <button onClick={() => setShowAddSection(false)} className="text-xs text-slate-500 hover:text-slate-800">Cancel</button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {sections.map((section) => (
          <div key={section.id} className={`border rounded-lg ${section.enabled ? 'border-slate-200' : 'border-slate-100 bg-slate-50 opacity-70'}`}>
            <div className="flex items-center justify-between gap-2 px-3 py-2">
              <button onClick={() => setExpandedId(expandedId === section.id ? null : section.id)} className="flex items-center gap-2 text-left flex-1">
                {expandedId === section.id ? <ChevronUp className="w-3.5 h-3.5 text-slate-400 shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                <span className="text-sm font-medium text-slate-700">{section.title}</span>
                <span className="text-[11px] text-slate-400">{section.questions.length} question(s){section.maxRepeats > 1 ? ` · up to ${section.maxRepeats}x` : ''}</span>
              </button>
              <div className="flex items-center gap-2 shrink-0">
                <label className="flex items-center gap-1 text-[11px] text-slate-500">
                  <input type="checkbox" checked={section.enabled} onChange={() => toggleSectionEnabled(section)} disabled={savingSectionId === section.id} />
                  Shown
                </label>
                <button onClick={() => deleteSection(section)} disabled={savingSectionId === section.id} className="text-slate-400 hover:text-red-600">
                  {savingSectionId === section.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {expandedId === section.id && (
              <div className="border-t border-slate-100 px-3 py-3 space-y-2">
                {section.description && <p className="text-[11px] text-slate-400">{section.description}</p>}

                {section.questions.map((q) => (
                  <div key={q.id} className="border border-slate-200 rounded-lg px-3 py-2">
                    {editingQId === q.id ? (
                      <div className="space-y-2">
                        <input value={editDraft.label} onChange={(e) => setEditDraft({ ...editDraft, label: e.target.value })} className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm" />
                        <input value={editDraft.description} onChange={(e) => setEditDraft({ ...editDraft, description: e.target.value })} placeholder="Helper text" className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm" />
                        {['select', 'multiselect'].includes(editDraft.type) && editDraft.optionsSource !== 'capabilities' && (
                          <textarea value={editDraft.options} onChange={(e) => setEditDraft({ ...editDraft, options: e.target.value })} placeholder="One option per line" rows={3} className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm" />
                        )}
                        <div className="flex items-center gap-3 flex-wrap">
                          <label className="flex items-center gap-1.5 text-xs text-slate-600">
                            <input type="checkbox" checked={editDraft.required} onChange={(e) => setEditDraft({ ...editDraft, required: e.target.checked })} /> Required
                          </label>
                          {['select', 'multiselect'].includes(editDraft.type) && (
                            <label className="flex items-center gap-1.5 text-xs text-slate-600">
                              <input type="checkbox" checked={editDraft.searchable} onChange={(e) => setEditDraft({ ...editDraft, searchable: e.target.checked })} /> Searchable
                            </label>
                          )}
                          {editDraft.type === 'multiselect' && (
                            <label className="text-xs text-slate-500">
                              Max selections
                              <input type="number" min={1} value={editDraft.maxSelect} onChange={(e) => setEditDraft({ ...editDraft, maxSelect: e.target.value })} placeholder="No cap" className="w-24 border border-slate-300 rounded-md px-2 py-1 text-xs ml-1.5" />
                            </label>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => saveEdit(section.id, q.id)} disabled={savingQId === q.id} className="flex items-center gap-1 text-xs font-medium text-white bg-navy-600 rounded-md px-2.5 py-1 hover:bg-navy-700 disabled:opacity-50">
                            {savingQId === q.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Save
                          </button>
                          <button onClick={() => setEditingQId(null)} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800"><X className="w-3 h-3" /> Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-xs font-medium text-slate-700">{q.label}{q.required && <span className="text-red-500"> *</span>}</p>
                          <p className="text-[11px] text-slate-400">
                            {TYPE_OPTIONS.find((t) => t.value === q.type)?.label || q.type}
                            {q.optionsSource === 'capabilities' ? ' · options from Differentiating Capabilities' : ''}
                            {q.searchable ? ' · searchable' : ''}
                            {q.maxSelect ? ` · up to ${q.maxSelect}` : ''}
                            {q.description ? ` — ${q.description}` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button onClick={() => startEdit(q)} className="text-slate-400 hover:text-navy-600"><Pencil className="w-3.5 h-3.5" /></button>
                          <button onClick={() => deleteQuestion(section.id, q.id)} disabled={savingQId === q.id} className="text-slate-400 hover:text-red-600">
                            {savingQId === q.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {addingQuestionTo === section.id ? (
                  <div className="border border-dashed border-slate-300 rounded-lg p-3 space-y-2">
                    <input value={newQ.label} onChange={(e) => setNewQ({ ...newQ, label: e.target.value })} placeholder="Question label" className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm" />
                    <input value={newQ.description} onChange={(e) => setNewQ({ ...newQ, description: e.target.value })} placeholder="Helper text (optional)" className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm" />
                    <div className="flex items-center gap-2 flex-wrap">
                      <select value={newQ.type} onChange={(e) => setNewQ({ ...newQ, type: e.target.value })} className="border border-slate-300 rounded-md px-2.5 py-1.5 text-sm">
                        {TYPE_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                      <label className="flex items-center gap-1.5 text-xs text-slate-600">
                        <input type="checkbox" checked={newQ.required} onChange={(e) => setNewQ({ ...newQ, required: e.target.checked })} /> Required
                      </label>
                      {['select', 'multiselect'].includes(newQ.type) && (
                        <label className="flex items-center gap-1.5 text-xs text-slate-600">
                          <input type="checkbox" checked={newQ.searchable} onChange={(e) => setNewQ({ ...newQ, searchable: e.target.checked })} /> Searchable
                        </label>
                      )}
                      {newQ.type === 'multiselect' && (
                        <label className="text-xs text-slate-500">
                          Max selections
                          <input type="number" min={1} value={newQ.maxSelect} onChange={(e) => setNewQ({ ...newQ, maxSelect: e.target.value })} placeholder="No cap" className="w-24 border border-slate-300 rounded-md px-2 py-1 text-xs ml-1.5" />
                        </label>
                      )}
                    </div>
                    {['select', 'multiselect'].includes(newQ.type) && (
                      <div className="space-y-1.5">
                        <label className="flex items-center gap-1.5 text-xs text-slate-600">
                          <input type="checkbox" checked={newQ.optionsSource === 'capabilities'} onChange={(e) => setNewQ({ ...newQ, optionsSource: e.target.checked ? 'capabilities' : '' })} />
                          Use the configured Differentiating Capabilities as the option list (stays in sync with Admin → Taxonomies)
                        </label>
                        {newQ.optionsSource !== 'capabilities' && (
                          <textarea value={newQ.options} onChange={(e) => setNewQ({ ...newQ, options: e.target.value })} placeholder="One option per line" rows={3} className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm" />
                        )}
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <button onClick={() => addQuestion(section.id)} disabled={savingQuestion || !newQ.label.trim()} className="flex items-center gap-1.5 text-xs font-medium text-white bg-navy-600 rounded-lg px-3 py-1.5 hover:bg-navy-700 disabled:opacity-50">
                        {savingQuestion && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Add
                      </button>
                      <button onClick={() => { setAddingQuestionTo(null); setNewQ(emptyQuestionDraft) }} className="text-xs text-slate-500 hover:text-slate-800">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setAddingQuestionTo(section.id)} className="flex items-center gap-1 text-xs font-medium text-navy-700 hover:underline">
                    <Plus className="w-3.5 h-3.5" /> Add question
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
        {sections.length === 0 && <p className="text-xs text-slate-400">No sections yet.</p>}
      </div>
    </div>
  )
}
