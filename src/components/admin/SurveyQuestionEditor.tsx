'use client'

import { useEffect, useState } from 'react'
import { ListChecks, Loader2, Plus, Trash2, ChevronUp, ChevronDown, Pencil } from 'lucide-react'

type QuestionType = 'text' | 'textarea' | 'select' | 'multiselect' | 'rating' | 'date' | 'yesno' | 'file'

interface Question {
  id: string
  stage: string
  order: number
  section: string | null
  label: string
  type: QuestionType
  options: string[] | null
  ratingMax: number
  required: boolean
  autoFill: string | null
  fieldKey: string | null
  driveFolderId: string | null
}

// Accepts either a bare folder ID or a full Drive URL (https://drive.google.com/drive/folders/<id>...).
function extractDriveFolderId(input: string): string {
  const trimmed = input.trim()
  const match = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/)
  return match ? match[1] : trimmed
}

const STAGE_TABS: { key: 'pre' | 'post1' | 'post2'; label: string }[] = [
  { key: 'pre', label: 'Pre-Training' },
  { key: 'post1', label: 'Post-1 (Employee)' },
  { key: 'post2', label: 'Post-2 (Manager)' },
]

const TYPE_OPTIONS: QuestionType[] = ['text', 'textarea', 'select', 'multiselect', 'rating', 'date', 'yesno']

const AUTOFILL_OPTIONS = [
  { value: '', label: 'None — ask the respondent' },
  { value: 'trainingName', label: 'Training name' },
  { value: 'businessUnit', label: 'Business unit' },
  { value: 'employeeName', label: 'Employee name' },
  { value: 'recipientName', label: 'Recipient name (whoever is filling it)' },
  { value: 'role', label: 'Role' },
]

const emptyDraft = {
  section: '', label: '', type: 'text' as QuestionType, optionsText: '', ratingMax: 5, required: false, autoFill: '', fieldKey: '', driveFolderId: '',
}

function QuestionForm({
  draft, onChange, onSave, onCancel, saving,
}: {
  draft: typeof emptyDraft
  onChange: (d: typeof emptyDraft) => void
  onSave: () => void
  onCancel: () => void
  saving: boolean
}) {
  const needsOptions = draft.type === 'select' || draft.type === 'multiselect'
  return (
    <div className="border border-dashed border-slate-300 rounded-lg p-3 space-y-2.5 bg-slate-50">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <input
          placeholder="Section (optional, groups questions on the form)"
          value={draft.section}
          onChange={(e) => onChange({ ...draft, section: e.target.value })}
          className="border border-slate-300 rounded-md px-2.5 py-1.5 text-xs"
        />
        <select
          value={draft.type}
          onChange={(e) => onChange({ ...draft, type: e.target.value as QuestionType })}
          className="border border-slate-300 rounded-md px-2.5 py-1.5 text-xs"
        >
          {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <textarea
        placeholder="Question label"
        value={draft.label}
        onChange={(e) => onChange({ ...draft, label: e.target.value })}
        rows={2}
        className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-xs"
      />
      {needsOptions && (
        <input
          placeholder="Options, comma-separated (e.g. Yes, No, Maybe)"
          value={draft.optionsText}
          onChange={(e) => onChange({ ...draft, optionsText: e.target.value })}
          className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-xs"
        />
      )}
      {draft.type === 'file' && (
        <input
          placeholder="Google Drive folder — paste the folder link or just its ID"
          value={draft.driveFolderId}
          onChange={(e) => onChange({ ...draft, driveFolderId: extractDriveFolderId(e.target.value) })}
          className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-xs"
        />
      )}
      {draft.type === 'rating' && (
        <label className="block text-xs text-slate-600">
          Scale — respondent picks 1 to
          <select
            value={draft.ratingMax}
            onChange={(e) => onChange({ ...draft, ratingMax: Number(e.target.value) })}
            className="ml-2 border border-slate-300 rounded-md px-2 py-1 text-xs"
          >
            {[3, 4, 5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <select
          value={draft.autoFill}
          onChange={(e) => onChange({ ...draft, autoFill: e.target.value })}
          className="border border-slate-300 rounded-md px-2.5 py-1.5 text-xs"
        >
          {AUTOFILL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <input
          placeholder="Metric field key (optional, e.g. confidenceRating)"
          value={draft.fieldKey}
          onChange={(e) => onChange({ ...draft, fieldKey: e.target.value })}
          className="border border-slate-300 rounded-md px-2.5 py-1.5 text-xs"
        />
      </div>
      <label className="flex items-center gap-1.5 text-xs text-slate-600">
        <input type="checkbox" checked={draft.required} onChange={(e) => onChange({ ...draft, required: e.target.checked })} />
        Required
      </label>
      <div className="flex items-center gap-2">
        <button
          onClick={onSave}
          disabled={saving || !draft.label.trim()}
          className="flex items-center gap-1.5 text-xs font-medium text-white bg-navy-600 rounded-lg px-3 py-1.5 hover:bg-navy-700 disabled:opacity-50"
        >
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Save
        </button>
        <button onClick={onCancel} className="text-xs text-slate-500 hover:text-slate-800 px-2 py-1.5">
          Cancel
        </button>
      </div>
    </div>
  )
}

export function SurveyQuestionEditor() {
  const [stage, setStage] = useState<'pre' | 'post1' | 'post2'>('pre')
  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState(emptyDraft)
  const [adding, setAdding] = useState(false)
  const [addDraft, setAddDraft] = useState(emptyDraft)
  const [saving, setSaving] = useState(false)
  const [reordering, setReordering] = useState(false)

  const load = async (s: typeof stage) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/survey-questions?stage=${s}`)
      setQuestions(await res.json())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load(stage)
    setEditingId(null)
    setAdding(false)
  }, [stage])

  const toOptionsArray = (text: string) => text.split(',').map((o) => o.trim()).filter(Boolean)

  const startEdit = (q: Question) => {
    setEditingId(q.id)
    setEditDraft({
      section: q.section || '', label: q.label, type: q.type,
      optionsText: (q.options || []).join(', '), ratingMax: q.ratingMax || 5, required: q.required,
      autoFill: q.autoFill || '', fieldKey: q.fieldKey || '', driveFolderId: q.driveFolderId || '',
    })
  }

  const saveEdit = async () => {
    if (!editingId) return
    setSaving(true)
    try {
      await fetch(`/api/admin/survey-questions/${editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section: editDraft.section, label: editDraft.label, type: editDraft.type,
          options: toOptionsArray(editDraft.optionsText), ratingMax: editDraft.ratingMax, required: editDraft.required,
          autoFill: editDraft.autoFill, fieldKey: editDraft.fieldKey, driveFolderId: editDraft.driveFolderId,
        }),
      })
      setEditingId(null)
      await load(stage)
    } finally {
      setSaving(false)
    }
  }

  const saveAdd = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/survey-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stage, section: addDraft.section, label: addDraft.label, type: addDraft.type,
          options: toOptionsArray(addDraft.optionsText), ratingMax: addDraft.ratingMax, required: addDraft.required,
          autoFill: addDraft.autoFill, fieldKey: addDraft.fieldKey, driveFolderId: addDraft.driveFolderId,
        }),
      })
      if (res.ok) {
        setAdding(false)
        setAddDraft(emptyDraft)
        await load(stage)
      } else {
        const data = await res.json().catch(() => ({}))
        alert(data.error || 'Failed to add question.')
      }
    } finally {
      setSaving(false)
    }
  }

  const deleteQuestion = async (id: string) => {
    if (!confirm('Delete this question? Past responses that already answered it are unaffected.')) return
    await fetch(`/api/admin/survey-questions/${id}`, { method: 'DELETE' })
    await load(stage)
  }

  const move = async (index: number, dir: -1 | 1) => {
    const target = index + dir
    if (target < 0 || target >= questions.length) return
    const reordered = [...questions]
    ;[reordered[index], reordered[target]] = [reordered[target], reordered[index]]
    setQuestions(reordered)
    setReordering(true)
    try {
      await fetch('/api/admin/survey-questions/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds: reordered.map((q) => q.id) }),
      })
    } finally {
      setReordering(false)
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5">
      <div className="flex items-start gap-3 mb-4">
        <ListChecks className="w-5 h-5 text-slate-400 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-slate-800">Survey Questions</p>
          <p className="text-xs text-slate-500 mt-0.5">
            Edit, reorder, add, or remove the questions each survey form asks. Fields marked &quot;auto-filled&quot; aren&apos;t shown to the
            respondent — they&apos;re populated automatically (training name, employee, etc). A &quot;metric field key&quot; wires a question&apos;s
            answer into an existing dashboard metric (e.g. <code className="bg-slate-100 px-1 rounded">confidenceRating</code>,{' '}
            <code className="bg-slate-100 px-1 rounded">impactScore</code>) — leave blank for questions that are just for reference.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1.5 mb-4 border-b border-slate-100 pb-3">
        {STAGE_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setStage(t.key)}
            className={`text-xs font-medium rounded-lg px-3 py-1.5 ${
              stage === t.key ? 'bg-navy-600 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-xs text-slate-400">Loading…</p>
      ) : (
        <div className="space-y-2">
          {questions.map((q, i) =>
            editingId === q.id ? (
              <QuestionForm key={q.id} draft={editDraft} onChange={setEditDraft} onSave={saveEdit} onCancel={() => setEditingId(null)} saving={saving} />
            ) : (
              <div key={q.id} className="flex items-start gap-2 border border-slate-200 rounded-lg px-3 py-2.5">
                <div className="flex flex-col shrink-0 mt-0.5">
                  <button onClick={() => move(i, -1)} disabled={i === 0 || reordering} className="text-slate-300 hover:text-slate-700 disabled:opacity-30">
                    <ChevronUp className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => move(i, 1)} disabled={i === questions.length - 1 || reordering} className="text-slate-300 hover:text-slate-700 disabled:opacity-30">
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="min-w-0 flex-1">
                  {q.section && <p className="text-[10px] uppercase tracking-wide text-navy-600 font-semibold">{q.section}</p>}
                  <p className="text-xs text-slate-800">{q.label}</p>
                  <div className="flex flex-wrap items-center gap-1 mt-1">
                    <span className="text-[10px] bg-slate-100 text-slate-500 rounded px-1.5 py-0.5">{q.type}{q.type === 'rating' ? ` (1-${q.ratingMax || 5})` : ''}</span>
                    {q.required && <span className="text-[10px] bg-red-50 text-red-600 rounded px-1.5 py-0.5">required</span>}
                    {q.autoFill && <span className="text-[10px] bg-blue-50 text-blue-600 rounded px-1.5 py-0.5">auto-filled: {q.autoFill}</span>}
                    {q.fieldKey && <span className="text-[10px] bg-emerald-50 text-emerald-700 rounded px-1.5 py-0.5">feeds: {q.fieldKey}</span>}
                    {q.type === 'file' && (
                      <span className={`text-[10px] rounded px-1.5 py-0.5 ${q.driveFolderId ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>
                        {q.driveFolderId ? 'Drive folder set' : 'No Drive folder configured'}
                      </span>
                    )}
                    {q.options && q.options.length > 0 && (
                      <span className="text-[10px] text-slate-400">options: {q.options.join(', ')}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => startEdit(q)} className="text-slate-300 hover:text-navy-600 p-1">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => deleteQuestion(q.id)} className="text-slate-300 hover:text-red-600 p-1">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )
          )}

          {adding ? (
            <QuestionForm draft={addDraft} onChange={setAddDraft} onSave={saveAdd} onCancel={() => { setAdding(false); setAddDraft(emptyDraft) }} saving={saving} />
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="flex items-center gap-1.5 text-xs font-medium text-navy-600 border border-dashed border-navy-200 rounded-lg px-3 py-2 hover:bg-navy-50 w-full justify-center"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Question
            </button>
          )}
        </div>
      )}
    </div>
  )
}
