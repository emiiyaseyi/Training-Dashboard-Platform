'use client'

import { SearchableSelect, SearchableMultiSelect } from './SearchableSelect'

export interface PDPQuestion {
  id: string
  label: string
  description: string | null
  type: string
  options: string[] | null
  ratingMax: number
  required: boolean
  searchable: boolean
  maxSelect: number | null
}

export type PDPValueMap = Record<string, string | string[]>

// Renders every question in one section (or one repeat instance of the repeating
// 'development_needs' section) against a flat value map — shared by all three public pages so
// question-type rendering (searchable vs plain select, multiselect chips, rating, yes/no) only
// exists in one place.
export function PDPSectionRenderer({
  questions, values, onChange,
}: {
  questions: PDPQuestion[]
  values: PDPValueMap
  onChange: (questionId: string, value: string | string[]) => void
}) {
  return (
    <div className="space-y-4">
      {questions.map((q) => (
        <div key={q.id}>
          <label className="block text-xs font-medium text-slate-600 mb-1">
            {q.label}{q.required && <span className="text-red-500"> *</span>}
          </label>
          {q.description && <p className="text-[11px] text-slate-400 mb-1.5">{q.description}</p>}

          {q.type === 'text' && (
            <input
              value={(values[q.id] as string) ?? ''}
              onChange={(e) => onChange(q.id, e.target.value)}
              className="w-full border border-slate-300 rounded-md px-2.5 py-2 text-sm"
            />
          )}
          {q.type === 'textarea' && (
            <textarea
              value={(values[q.id] as string) ?? ''}
              onChange={(e) => onChange(q.id, e.target.value)}
              rows={3}
              className="w-full border border-slate-300 rounded-md px-2.5 py-2 text-sm"
            />
          )}
          {q.type === 'select' && q.searchable && (
            <SearchableSelect options={q.options || []} value={(values[q.id] as string) ?? ''} onChange={(v) => onChange(q.id, v)} />
          )}
          {q.type === 'select' && !q.searchable && (
            <select
              value={(values[q.id] as string) ?? ''}
              onChange={(e) => onChange(q.id, e.target.value)}
              className="w-full border border-slate-300 rounded-md px-2.5 py-2 text-sm"
            >
              <option value="">Select…</option>
              {(q.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          )}
          {q.type === 'multiselect' && q.searchable && (
            <SearchableMultiSelect options={q.options || []} value={(values[q.id] as string[]) ?? []} onChange={(v) => onChange(q.id, v)} maxSelect={q.maxSelect} />
          )}
          {q.type === 'multiselect' && !q.searchable && (
            <div className="flex flex-wrap gap-2">
              {(q.options || []).map((o) => {
                const current = (values[q.id] as string[]) ?? []
                const checked = current.includes(o)
                const atLimit = q.maxSelect != null && current.length >= q.maxSelect && !checked
                return (
                  <label key={o} className={`flex items-center gap-1.5 text-xs border rounded-full px-2.5 py-1 ${atLimit ? 'text-slate-300 border-slate-100' : 'text-slate-600 border-slate-200'}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={atLimit}
                      onChange={() => onChange(q.id, checked ? current.filter((v) => v !== o) : [...current, o])}
                    />
                    {o}
                  </label>
                )
              })}
              {q.maxSelect != null && <p className="text-[11px] text-slate-400 w-full">{((values[q.id] as string[]) ?? []).length} / {q.maxSelect} selected</p>}
            </div>
          )}
          {q.type === 'rating' && (
            <div className="flex gap-1.5">
              {Array.from({ length: q.ratingMax }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => onChange(q.id, String(n))}
                  className={`w-8 h-8 rounded-full text-xs font-medium border ${String(n) === values[q.id] ? 'bg-navy-600 text-white border-navy-600' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}
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
                  className={`px-3 py-1.5 rounded-md text-xs font-medium border ${values[q.id] === o ? 'bg-navy-600 text-white border-navy-600' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}
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
