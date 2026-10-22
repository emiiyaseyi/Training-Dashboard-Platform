'use client'

import { useState } from 'react'
import { Loader2, Plus, Trash2, Pencil, X, Check } from 'lucide-react'

interface Question {
  id: string
  order: number
  label: string
  description: string | null
  type: string
  options: string | null
  ratingMax: number
  required: boolean
}

interface Cycle {
  id: string
  priorityQuestionLabel: string | null
  actionQuestionLabel: string | null
  actionRequired: boolean
}

const TYPE_OPTIONS = [
  { value: 'text', label: 'Short text' },
  { value: 'textarea', label: 'Long text' },
  { value: 'select', label: 'Dropdown' },
  { value: 'multiselect', label: 'Multiple choice' },
  { value: 'rating', label: 'Rating' },
  { value: 'yesno', label: 'Yes/No' },
]

// Sits inside the PDP admin page as a collapsible section — shows every question a respondent
// will actually see: the two fixed fields every capability page already has (editable wording +
// an "Action required" toggle), plus the admin-authored extra question bank shown on the final
// page of both tracks. Mirrors CustomSurveyPanel's question-authoring pattern, without its
// section-branching (not needed for PDP's simpler fixed flow).
export function PDPQuestionsEditor({ cycle, questions, onReload }: { cycle: Cycle; questions: Question[]; onReload: () => Promise<void> }) {
  const [savingFixed, setSavingFixed] = useState(false)
  const [priorityLabel, setPriorityLabel] = useState(cycle.priorityQuestionLabel || '')
  const [actionLabel, setActionLabel] = useState(cycle.actionQuestionLabel || '')
  const [actionRequired, setActionRequired] = useState(cycle.actionRequired)

  const [showAdd, setShowAdd] = useState(false)
  const [newQ, setNewQ] = useState({ label: '', description: '', type: 'text', options: '', required: false })
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState({ label: '', description: '', required: false })
  const [savingId, setSavingId] = useState<string | null>(null)

  const saveFixedFields = async () => {
    setSavingFixed(true)
    try {
      await fetch(`/api/admin/pdp/${cycle.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priorityQuestionLabel: priorityLabel.trim() || null,
          actionQuestionLabel: actionLabel.trim() || null,
          actionRequired,
        }),
      })
      await onReload()
    } finally {
      setSavingFixed(false)
    }
  }

  const addQuestion = async () => {
    if (!newQ.label.trim()) return
    setAdding(true)
    try {
      await fetch(`/api/admin/pdp/${cycle.id}/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: newQ.label.trim(),
          description: newQ.description.trim() || null,
          type: newQ.type,
          options: ['select', 'multiselect'].includes(newQ.type) ? newQ.options.split('\n').map((o) => o.trim()).filter(Boolean) : undefined,
          required: newQ.required,
        }),
      })
      setNewQ({ label: '', description: '', type: 'text', options: '', required: false })
      setShowAdd(false)
      await onReload()
    } finally {
      setAdding(false)
    }
  }

  const startEdit = (q: Question) => {
    setEditingId(q.id)
    setEditDraft({ label: q.label, description: q.description || '', required: q.required })
  }

  const saveEdit = async (id: string) => {
    setSavingId(id)
    try {
      await fetch(`/api/admin/pdp/${cycle.id}/questions/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: editDraft.label.trim(), description: editDraft.description.trim() || null, required: editDraft.required }),
      })
      setEditingId(null)
      await onReload()
    } finally {
      setSavingId(null)
    }
  }

  const deleteQuestion = async (id: string) => {
    if (!confirm('Remove this question? Anyone who already answered it keeps their existing answer on record, it just won’t be shown going forward.')) return
    setSavingId(id)
    try {
      await fetch(`/api/admin/pdp/${cycle.id}/questions/${id}`, { method: 'DELETE' })
      await onReload()
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold text-slate-600 mb-2">Fixed fields (every capability page)</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-2">
          <label className="text-xs text-slate-500">
            Priority question wording
            <input value={priorityLabel} onChange={(e) => setPriorityLabel(e.target.value)} placeholder="How much of a priority is this for 2027?" className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm mt-1" />
          </label>
          <label className="text-xs text-slate-500">
            Development action question wording
            <input value={actionLabel} onChange={(e) => setActionLabel(e.target.value)} placeholder="What development action would help here?" className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm mt-1" />
          </label>
        </div>
        <label className="flex items-center gap-1.5 text-xs text-slate-600 mb-2">
          <input type="checkbox" checked={actionRequired} onChange={(e) => setActionRequired(e.target.checked)} />
          Development action is mandatory whenever a capability isn&apos;t marked &quot;Not needed&quot;
        </label>
        <button onClick={saveFixedFields} disabled={savingFixed} className="flex items-center gap-1.5 text-xs font-medium text-white bg-navy-600 rounded-lg px-3 py-1.5 hover:bg-navy-700 disabled:opacity-50">
          {savingFixed && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save
        </button>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-slate-600">Extra questions (shown on every plan, after the capability pages)</p>
          <button onClick={() => setShowAdd((v) => !v)} className="flex items-center gap-1 text-xs font-medium text-navy-700 hover:underline">
            <Plus className="w-3.5 h-3.5" /> Add question
          </button>
        </div>

        {showAdd && (
          <div className="border border-dashed border-slate-300 rounded-lg p-3 mb-3 space-y-2">
            <input value={newQ.label} onChange={(e) => setNewQ({ ...newQ, label: e.target.value })} placeholder="Question label" className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm" />
            <input value={newQ.description} onChange={(e) => setNewQ({ ...newQ, description: e.target.value })} placeholder="Helper text (optional)" className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm" />
            <div className="flex items-center gap-2">
              <select value={newQ.type} onChange={(e) => setNewQ({ ...newQ, type: e.target.value })} className="border border-slate-300 rounded-md px-2.5 py-1.5 text-sm">
                {TYPE_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <label className="flex items-center gap-1.5 text-xs text-slate-600">
                <input type="checkbox" checked={newQ.required} onChange={(e) => setNewQ({ ...newQ, required: e.target.checked })} />
                Required
              </label>
            </div>
            {['select', 'multiselect'].includes(newQ.type) && (
              <textarea
                value={newQ.options}
                onChange={(e) => setNewQ({ ...newQ, options: e.target.value })}
                placeholder="One option per line"
                rows={3}
                className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm"
              />
            )}
            <div className="flex items-center gap-2">
              <button onClick={addQuestion} disabled={adding || !newQ.label.trim()} className="flex items-center gap-1.5 text-xs font-medium text-white bg-navy-600 rounded-lg px-3 py-1.5 hover:bg-navy-700 disabled:opacity-50">
                {adding && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Add
              </button>
              <button onClick={() => setShowAdd(false)} className="text-xs text-slate-500 hover:text-slate-800">Cancel</button>
            </div>
          </div>
        )}

        {questions.length === 0 ? (
          <p className="text-xs text-slate-400">No extra questions yet — everyone just sees the capability pages above.</p>
        ) : (
          <div className="space-y-1.5">
            {questions.map((q) => (
              <div key={q.id} className="border border-slate-200 rounded-lg px-3 py-2">
                {editingId === q.id ? (
                  <div className="space-y-2">
                    <input value={editDraft.label} onChange={(e) => setEditDraft({ ...editDraft, label: e.target.value })} className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm" />
                    <input value={editDraft.description} onChange={(e) => setEditDraft({ ...editDraft, description: e.target.value })} placeholder="Helper text" className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm" />
                    <label className="flex items-center gap-1.5 text-xs text-slate-600">
                      <input type="checkbox" checked={editDraft.required} onChange={(e) => setEditDraft({ ...editDraft, required: e.target.checked })} />
                      Required
                    </label>
                    <div className="flex items-center gap-2">
                      <button onClick={() => saveEdit(q.id)} disabled={savingId === q.id} className="flex items-center gap-1 text-xs font-medium text-white bg-navy-600 rounded-md px-2.5 py-1 hover:bg-navy-700 disabled:opacity-50">
                        {savingId === q.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Save
                      </button>
                      <button onClick={() => setEditingId(null)} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800"><X className="w-3 h-3" /> Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-medium text-slate-700">{q.label}{q.required && <span className="text-red-500"> *</span>}</p>
                      <p className="text-[11px] text-slate-400">{TYPE_OPTIONS.find((t) => t.value === q.type)?.label || q.type}{q.description ? ` — ${q.description}` : ''}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => startEdit(q)} className="text-slate-400 hover:text-navy-600"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => deleteQuestion(q.id)} disabled={savingId === q.id} className="text-slate-400 hover:text-red-600">
                        {savingId === q.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
