'use client'

import { useState } from 'react'
import { X, Loader2, Save } from 'lucide-react'

export interface EditableQuestion {
  id: string
  label: string
  type: string
  options?: string[] | null
  ratingMax?: number
}

function QuestionEditInput({ q, value, onChange }: { q: EditableQuestion; value: string | string[]; onChange: (v: string | string[]) => void }) {
  const base = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy-600'
  switch (q.type) {
    case 'textarea':
      return <textarea value={(value as string) || ''} onChange={(e) => onChange(e.target.value)} rows={3} className={base} />
    case 'select':
      return (
        <select value={(value as string) || ''} onChange={(e) => onChange(e.target.value)} className={base}>
          <option value="">Select…</option>
          {q.options?.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      )
    case 'multiselect': {
      const selected = Array.isArray(value) ? value : []
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {q.options?.map((o) => (
            <label key={o} className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={selected.includes(o)}
                onChange={(e) => onChange(e.target.checked ? [...selected, o] : selected.filter((s) => s !== o))}
              />
              {o}
            </label>
          ))}
        </div>
      )
    }
    case 'rating': {
      const max = q.ratingMax || 5
      return (
        <div className="flex items-center gap-2 flex-wrap">
          {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
            <button
              type="button"
              key={n}
              onClick={() => onChange(String(n))}
              className={`w-8 h-8 rounded-full border text-sm font-medium ${
                String(value) === String(n) ? 'bg-navy-600 text-white border-navy-600' : 'border-slate-300 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      )
    }
    case 'yesno':
      return (
        <div className="flex items-center gap-2">
          {['Yes', 'No'].map((o) => (
            <button
              type="button"
              key={o}
              onClick={() => onChange(o)}
              className={`px-4 py-1.5 rounded-lg border text-sm font-medium ${
                value === o ? 'bg-navy-600 text-white border-navy-600' : 'border-slate-300 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {o}
            </button>
          ))}
        </div>
      )
    case 'date':
      return <input type="date" value={(value as string) || ''} onChange={(e) => onChange(e.target.value)} className={base} />
    case 'file':
      return <p className="text-sm text-slate-400 italic">File answers can&apos;t be edited here — re-download the file from Uploaded Files if it needs replacing.</p>
    default:
      // Covers plain text and "ranking" (a Custom-Survey-only ordered-list type) — ranking's
      // stored answer is an array, so it's edited here as a comma-separated list rather than with
      // dedicated reorder controls, which is a reasonable trade-off for how rarely a ranking
      // answer needs correcting.
      return (
        <input
          type="text"
          value={Array.isArray(value) ? value.join(', ') : value || ''}
          onChange={(e) => onChange(e.target.value)}
          className={base}
        />
      )
  }
}

// Admin correction of an already-submitted response — used for both training-schedule survey
// responses (Pre/Post-1/Post-2) and Custom Survey responses, since both are just { questionId:
// answer } JSON blobs against a known question list. The caller supplies the save function so it
// can hit whichever endpoint (and whichever downstream sync, e.g. the FeedbackRecord/
// ManagerReviewRecord that a Post-1/Post-2 answer also feeds) applies to that response type.
export function SurveyResponseEditModal({
  title,
  questions,
  initialAnswers,
  onSave,
  onClose,
}: {
  title: string
  questions: EditableQuestion[]
  initialAnswers: Record<string, string | string[]>
  onSave: (answers: Record<string, string | string[]>) => Promise<void>
  onClose: () => void
}) {
  const [answers, setAnswers] = useState<Record<string, string | string[]>>(initialAnswers)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      await onSave(answers)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <p className="text-sm font-semibold text-slate-800">Edit Response — {title}</p>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4 space-y-4 flex-1">
          {questions.length === 0 ? (
            <p className="text-sm text-slate-400">No editable questions on this response.</p>
          ) : (
            questions.map((q) => (
              <div key={q.id}>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">{q.label}</label>
                <QuestionEditInput
                  q={q}
                  value={answers[q.id] ?? (q.type === 'multiselect' ? [] : '')}
                  onChange={(v) => setAnswers((prev) => ({ ...prev, [q.id]: v }))}
                />
              </div>
            ))
          )}
          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-100">
          <button onClick={onClose} className="text-sm text-slate-600 px-3 py-1.5 rounded-lg hover:bg-slate-50">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-1.5 text-sm font-medium text-white bg-navy-600 hover:bg-navy-700 rounded-lg px-4 py-1.5 disabled:opacity-60"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
