'use client'

export interface PDPQuestion {
  id: string
  label: string
  description: string | null
  type: 'text' | 'textarea' | 'select' | 'multiselect' | 'rating' | 'yesno'
  options: string[] | null
  ratingMax: number
  required: boolean
}

export type PDPQuestionAnswers = Record<string, string | string[]>

// Shared renderer for the admin-authored extra questions — used identically on the Track A
// staff-fill page, the manager-validation page, and Track B's per-member page, so the same
// question bank renders the same way everywhere a PDP plan is filled.
export function PDPQuestionFields({
  questions, answers, onChange,
}: {
  questions: PDPQuestion[]
  answers: PDPQuestionAnswers
  onChange: (questionId: string, value: string | string[]) => void
}) {
  if (questions.length === 0) return null
  return (
    <div className="space-y-4">
      {questions.map((q) => (
        <div key={q.id}>
          <label className="block text-xs font-medium text-slate-600 mb-1">
            {q.label}{q.required && <span className="text-red-500"> *</span>}
          </label>
          {q.description && <p className="text-[11px] text-slate-400 mb-1.5">{q.description}</p>}
          {(q.type === 'text') && (
            <input
              value={(answers[q.id] as string) ?? ''}
              onChange={(e) => onChange(q.id, e.target.value)}
              className="w-full border border-slate-300 rounded-md px-2.5 py-2 text-sm"
            />
          )}
          {q.type === 'textarea' && (
            <textarea
              value={(answers[q.id] as string) ?? ''}
              onChange={(e) => onChange(q.id, e.target.value)}
              rows={3}
              className="w-full border border-slate-300 rounded-md px-2.5 py-2 text-sm"
            />
          )}
          {q.type === 'select' && (
            <select
              value={(answers[q.id] as string) ?? ''}
              onChange={(e) => onChange(q.id, e.target.value)}
              className="w-full border border-slate-300 rounded-md px-2.5 py-2 text-sm"
            >
              <option value="">Select…</option>
              {(q.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          )}
          {q.type === 'multiselect' && (
            <div className="flex flex-wrap gap-2">
              {(q.options || []).map((o) => {
                const current = (answers[q.id] as string[]) ?? []
                const checked = current.includes(o)
                return (
                  <label key={o} className="flex items-center gap-1.5 text-xs text-slate-600 border border-slate-200 rounded-full px-2.5 py-1">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onChange(q.id, checked ? current.filter((v) => v !== o) : [...current, o])}
                    />
                    {o}
                  </label>
                )
              })}
            </div>
          )}
          {q.type === 'rating' && (
            <div className="flex gap-1.5">
              {Array.from({ length: q.ratingMax }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => onChange(q.id, String(n))}
                  className={`w-8 h-8 rounded-full text-xs font-medium border ${String(n) === answers[q.id] ? 'bg-navy-600 text-white border-navy-600' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}
                >
                  {n}
                </button>
              ))}
            </div>
          )}
          {q.type === 'yesno' && (
            <div className="flex gap-2">
              {['Yes', 'No'].map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => onChange(q.id, o)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium border ${answers[q.id] === o ? 'bg-navy-600 text-white border-navy-600' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}
                >
                  {o}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
