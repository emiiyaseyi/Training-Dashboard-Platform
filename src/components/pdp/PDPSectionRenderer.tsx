'use client'

import { ChevronUp, ChevronDown } from 'lucide-react'
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
  showIfQuestionId?: string | null
  showIfEquals?: string | null
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

// A question stored as 'select' (single string answer) and later changed to 'multiselect' by an
// admin (e.g. the Expected Improvement / How Demonstrated questions, converted mid-cycle) leaves
// any answer saved BEFORE that change as a bare string in the database — rendering it through the
// now-multiselect code path with a plain `?? []` (which only catches null/undefined, not "wrong
// type but still truthy") left `current` as that raw string, and `.find()`/`.map()` don't exist on
// a string the way they do on an array, crashing the whole page. Wraps a legacy string answer into
// a single-element array instead of discarding it, so the respondent's existing answer survives
// the type change rather than silently vanishing.
function asStringArray(v: string | string[] | undefined): string[] {
  if (Array.isArray(v)) return v
  if (typeof v === 'string' && v) return [v]
  return []
}

function OtherTextField({ value, onChange }: { value: string; onChange: (text: string) => void }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Please specify"
      className="w-full border border-slate-300 rounded-md px-2.5 py-2 text-[18px] mt-2"
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
      {questions.map((q) => {
        // Conditional question (e.g. "which would help you most…" after "Do you require
        // training?") — not on the page at all until its condition is met, same as the
        // server-side validators treat it.
        if (q.showIfQuestionId && values[q.showIfQuestionId] !== q.showIfEquals) return null
        return (
        <div key={q.id}>
          <label className="block text-[15px] font-medium text-slate-600 mb-1">
            {q.label}{q.required && <span className="text-red-500"> *</span>}
          </label>
          {q.description && <p className="text-[14px] text-slate-400 mb-1.5">{q.description}</p>}

          {q.type === 'text' && (
            <input
              value={(values[q.id] as string) ?? ''}
              onChange={(e) => onChange(q.id, e.target.value)}
              className="w-full border border-slate-300 rounded-md px-2.5 py-2 text-[18px]"
            />
          )}
          {q.type === 'textarea' && (
            <textarea
              value={(values[q.id] as string) ?? ''}
              onChange={(e) => onChange(q.id, e.target.value)}
              rows={3}
              className="w-full border border-slate-300 rounded-md px-2.5 py-2 text-[18px]"
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
                  className="w-full border border-slate-300 rounded-md px-2.5 py-2 text-[18px]"
                >
                  <option value="">Select…</option>
                  {(q.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
                {other && <OtherTextField value={otherFreeText(raw)} onChange={(text) => onChange(q.id, withOtherText(text))} />}
              </>
            )
          })()}
          {q.type === 'multiselect' && q.searchable && (() => {
            const current = asStringArray(values[q.id])
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
            const current = asStringArray(values[q.id])
            const otherEntry = current.find(isOtherValue)
            const optionsList = q.options || []
            const allSelected = optionsList.length > 0 && optionsList.every((o) => (o === OTHER_LABEL ? !!otherEntry : current.includes(o)))
            return (
              <div>
                {optionsList.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onChange(q.id, allSelected ? [] : [...optionsList])}
                    className="text-[13px] font-medium text-navy-600 hover:underline mb-2"
                  >
                    {allSelected ? 'Deselect all' : 'Select all'}
                  </button>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2.5">
                  {(q.options || []).map((o) => {
                    const checked = o === OTHER_LABEL ? !!otherEntry : current.includes(o)
                    const atLimit = q.maxSelect != null && current.length >= q.maxSelect && !checked
                    return (
                      <label key={o} className={`flex items-start gap-2 text-[15px] ${atLimit ? 'text-slate-300' : 'text-slate-700'}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={atLimit}
                          className="mt-0.5 shrink-0"
                          onChange={() => {
                            if (o === OTHER_LABEL) {
                              onChange(q.id, otherEntry ? current.filter((v) => !isOtherValue(v)) : [...current, OTHER_LABEL])
                            } else {
                              onChange(q.id, checked ? current.filter((v) => v !== o) : [...current, o])
                            }
                          }}
                        />
                        <span>{o}</span>
                      </label>
                    )
                  })}
                </div>
                {otherEntry && <OtherTextField value={otherFreeText(otherEntry)} onChange={(text) => onChange(q.id, current.map((v) => (isOtherValue(v) ? withOtherText(text) : v)))} />}
                {q.maxSelect != null && <p className="text-[14px] text-slate-400 mt-1">{current.length} / {q.maxSelect} selected</p>}
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
                  className={`w-8 h-8 rounded-full text-[15px] font-medium border ${String(n) === values[q.id] ? 'bg-navy-600 text-white border-navy-600' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}
                >
                  {n}
                </button>
              ))}
            </div>
          )}
          {q.type === 'ranking' && (() => {
            const optionsList = q.options || []
            if (optionsList.length === 0) {
              return <p className="text-[15px] text-slate-400 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">Nothing to prioritize — based on your answers above, you&apos;re already comfortable with everything covered.</p>
            }
            // Falls back to the given (already-filtered) order until the respondent actually
            // reorders something — an unseeded answer still means "default priority order", not
            // "unanswered", so there's nothing to persist to state until a move happens.
            const current = asStringArray(values[q.id])
            const known = current.filter((v) => optionsList.includes(v))
            const order = known.length > 0 ? [...known, ...optionsList.filter((o) => !known.includes(o))] : optionsList
            const move = (i: number, dir: -1 | 1) => {
              const j = i + dir
              if (j < 0 || j >= order.length) return
              const next = [...order]
              ;[next[i], next[j]] = [next[j], next[i]]
              onChange(q.id, next)
            }
            return (
              <div className="space-y-1.5">
                {order.map((item, i) => (
                  <div key={item} className="flex items-center justify-between gap-2 border border-slate-200 rounded-lg px-3 py-2">
                    <span className="text-[16px] text-slate-700"><span className="text-slate-400 mr-2">{i + 1}.</span>{item}</span>
                    <div className="flex gap-1 shrink-0">
                      <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-20">
                        <ChevronUp className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => move(i, 1)} disabled={i === order.length - 1} className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-20">
                        <ChevronDown className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )
          })()}
          {q.type === 'yesno' && (
            <div className="flex gap-2">
              {['Yes', 'No'].map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => onChange(q.id, o)}
                  className={`px-3 py-1.5 rounded-md text-[15px] font-medium border ${values[q.id] === o ? 'bg-navy-600 text-white border-navy-600' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}
                >
                  {o}
                </button>
              ))}
            </div>
          )}
        </div>
        )
      })}
    </div>
  )
}
