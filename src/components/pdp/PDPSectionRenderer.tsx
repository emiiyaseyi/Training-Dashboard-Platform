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

// "Other" handling: a select/multiselect option literally named "Other" gets a free-text field
// once picked, and the typed text is folded into the stored answer as "Other: <text>" so no extra
// shape is needed anywhere else in the app (export, validation, the manager-validation recap all
// just see a string). The select/chip controls themselves only ever display/compare the bare
// "Other" label — these helpers translate between the two.
const OTHER_LABEL = 'Other'
function isOtherValue(v: string): boolean {
  return v === OTHER_LABEL || v.startsWith(`${OTHER_LABEL}: `)
}
function otherFreeText(v: string): string {
  return v.startsWith(`${OTHER_LABEL}: `) ? v.slice(OTHER_LABEL.length + 2) : ''
}
function withOtherText(text: string): string {
  return text.trim() ? `${OTHER_LABEL}: ${text.trim()}` : OTHER_LABEL
}

function OtherTextField({ value, onChange }: { value: string; onChange: (text: string) => void }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Please specify"
      className="w-full border border-slate-300 rounded-md px-2.5 py-2 text-sm mt-2"
    />
  )
}

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
          {q.type === 'select' && q.searchable && (() => {
            const raw = (values[q.id] as string) ?? ''
            const other = isOtherValue(raw)
            return (
              <>
                <SearchableSelect options={q.options || []} value={other ? OTHER_LABEL : raw} onChange={(v) => onChange(q.id, v === OTHER_LABEL ? OTHER_LABEL : v)} />
                {other && <OtherTextField value={otherFreeText(raw)} onChange={(text) => onChange(q.id, withOtherText(text))} />}
              </>
            )
          })()}
          {q.type === 'select' && !q.searchable && (() => {
            const raw = (values[q.id] as string) ?? ''
            const other = isOtherValue(raw)
            return (
              <>
                <select
                  value={other ? OTHER_LABEL : raw}
                  onChange={(e) => onChange(q.id, e.target.value === OTHER_LABEL ? OTHER_LABEL : e.target.value)}
                  className="w-full border border-slate-300 rounded-md px-2.5 py-2 text-sm"
                >
                  <option value="">Select…</option>
                  {(q.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
                {other && <OtherTextField value={otherFreeText(raw)} onChange={(text) => onChange(q.id, withOtherText(text))} />}
              </>
            )
          })()}
          {q.type === 'multiselect' && q.searchable && (() => {
            const current = (values[q.id] as string[]) ?? []
            const otherEntry = current.find(isOtherValue)
            const displayValue = current.map((v) => (isOtherValue(v) ? OTHER_LABEL : v))
            const handleChange = (next: string[]) => {
              const existingText = otherEntry ? otherFreeText(otherEntry) : ''
              onChange(q.id, next.map((v) => (v === OTHER_LABEL ? withOtherText(existingText) : v)))
            }
            return (
              <>
                <SearchableMultiSelect options={q.options || []} value={displayValue} onChange={handleChange} maxSelect={q.maxSelect} />
                {otherEntry && <OtherTextField value={otherFreeText(otherEntry)} onChange={(text) => onChange(q.id, current.map((v) => (isOtherValue(v) ? withOtherText(text) : v)))} />}
              </>
            )
          })()}
          {q.type === 'multiselect' && !q.searchable && (() => {
            const current = (values[q.id] as string[]) ?? []
            const otherEntry = current.find(isOtherValue)
            return (
              <div>
                <div className="flex flex-wrap gap-2">
                  {(q.options || []).map((o) => {
                    const checked = o === OTHER_LABEL ? !!otherEntry : current.includes(o)
                    const atLimit = q.maxSelect != null && current.length >= q.maxSelect && !checked
                    return (
                      <label key={o} className={`flex items-center gap-1.5 text-xs border rounded-full px-2.5 py-1 ${atLimit ? 'text-slate-300 border-slate-100' : 'text-slate-600 border-slate-200'}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={atLimit}
                          onChange={() => {
                            if (o === OTHER_LABEL) {
                              onChange(q.id, otherEntry ? current.filter((v) => !isOtherValue(v)) : [...current, OTHER_LABEL])
                            } else {
                              onChange(q.id, checked ? current.filter((v) => v !== o) : [...current, o])
                            }
                          }}
                        />
                        {o}
                      </label>
                    )
                  })}
                </div>
                {otherEntry && <OtherTextField value={otherFreeText(otherEntry)} onChange={(text) => onChange(q.id, current.map((v) => (isOtherValue(v) ? withOtherText(text) : v)))} />}
                {q.maxSelect != null && <p className="text-[11px] text-slate-400 mt-1">{current.length} / {q.maxSelect} selected</p>}
              </div>
            )
          })()}
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
