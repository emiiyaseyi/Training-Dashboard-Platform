'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { BookOpen, Loader2, AlertTriangle, Eye, Paperclip, ChevronLeft } from 'lucide-react'
import { visibleQuestions } from '@/lib/custom-survey-branching'

interface Question {
  id: string
  section: string | null
  label: string
  type: 'text' | 'textarea' | 'select' | 'multiselect' | 'rating' | 'date' | 'yesno' | 'file'
  options: string[] | null
  ratingMax: number
  required: boolean
  gatesSection: string | null
  skipSectionIfValues: string[] | null
}

interface PreviewContext {
  title: string
  description: string | null
  status: 'draft' | 'launched' | 'closed'
  displayMode: 'single' | 'paginated'
  questions: Question[]
}

// Deliberately independent of the live respondent-facing form (src/app/survey/custom/[token]) —
// nothing here is wired to a real token, submission, or file upload, so there's no risk of this
// preview accidentally touching real data. Interactive (you can click through rating/select/etc
// to see how they behave), but self-contained on purpose.
function PreviewQuestionInput({ q, value, onChange }: { q: Question; value: string | string[]; onChange: (v: string | string[]) => void }) {
  const base = 'w-full px-4 py-2.5 border border-slate-300 rounded-lg text-[17px] focus:outline-none focus:ring-2 focus:ring-navy-600'
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
    case 'file':
      return (
        <div className="flex items-center gap-2 border border-dashed border-slate-300 rounded-lg px-4 py-2.5 text-[16px] text-slate-400">
          <Paperclip className="w-4 h-4 shrink-0" />
          File upload — respondents will be able to attach a file here (not available in preview)
        </div>
      )
    case 'multiselect': {
      const selected = Array.isArray(value) ? value : []
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {q.options?.map((o) => (
            <label key={o} className="flex items-center gap-2 text-[17px] text-slate-600">
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
        <div className="flex items-center gap-2.5 flex-wrap">
          {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
            <button
              type="button"
              key={n}
              onClick={() => onChange(String(n))}
              className={`w-10 h-10 rounded-full border text-[17px] font-medium ${
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
        <div className="flex items-center gap-2.5">
          {['Yes', 'No'].map((o) => (
            <button
              type="button"
              key={o}
              onClick={() => onChange(o)}
              className={`px-5 py-2 rounded-lg border text-[17px] font-medium ${
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
    default:
      return <input type="text" value={(value as string) || ''} onChange={(e) => onChange(e.target.value)} className={base} />
  }
}

export default function CustomSurveyPreviewPage() {
  const params = useParams<{ id: string }>()
  const [context, setContext] = useState<PreviewContext | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({})
  const [page, setPage] = useState(0)

  useEffect(() => {
    fetch(`/api/admin/custom-surveys/${params.id}/preview`)
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Could not load this survey.')
        setContext(data)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load this survey.'))
      .finally(() => setLoading(false))
  }, [params.id])

  const visibleQs = useMemo(() => (context ? visibleQuestions(context.questions, answers) : []), [context, answers])

  const sections = useMemo(() => {
    const seen: string[] = []
    for (const q of visibleQs) {
      const s = q.section || ''
      if (!seen.includes(s)) seen.push(s)
    }
    return seen
  }, [visibleQs])

  const paginated = context?.displayMode === 'paginated' && sections.length > 1

  useEffect(() => {
    if (page >= sections.length) setPage(Math.max(0, sections.length - 1))
  }, [sections.length, page])

  const currentSection = paginated ? sections[page] : null
  const questionsToShow = paginated ? visibleQs.filter((q) => (q.section || '') === currentSection) : visibleQs
  const isLastPage = !paginated || page === sections.length - 1

  return (
    <div className="min-h-dvh w-full flex items-center justify-center bg-navy-700 px-4 pt-10 pb-20">
      <div className="w-full max-w-3xl">
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 rounded-lg bg-gold-400 flex items-center justify-center mb-4">
            <BookOpen className="w-7 h-7 text-navy-800" />
          </div>
          <p className="text-white font-semibold text-[23px]">Learning Intelligence</p>
          <p className="text-slate-400 text-[18px]">Survey</p>
        </div>

        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-2.5 mb-4 text-[15px]">
          <Eye className="w-4 h-4 shrink-0" />
          Preview only — this is what respondents will see. Nothing here is saved or sent, and file uploads are disabled.
          {context && <span className="ml-auto font-medium capitalize">{context.status}</span>}
        </div>

        <div className="bg-white rounded-xl shadow-xl p-8">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-navy-600" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center text-center py-6">
              <AlertTriangle className="w-8 h-8 text-red-500 mb-3" />
              <p className="text-[18px] font-medium text-slate-800">{error}</p>
              <p className="text-[16px] text-slate-500 mt-1">You need admin access to preview a survey.</p>
            </div>
          ) : context ? (
            <div>
              <p className="text-[18px] text-slate-500">Hi there,</p>
              <p className="text-[21px] font-semibold text-slate-800 mt-1">{context.title}</p>
              {context.description && <p className="text-[16px] text-slate-400 mt-0.5">{context.description}</p>}

              {context.questions.length === 0 ? (
                <p className="text-[16px] text-slate-400 mt-6">No questions added yet.</p>
              ) : (
                <>
                  {paginated && (
                    <div className="mt-4">
                      <div className="flex items-center justify-between text-[13px] text-slate-400 mb-1">
                        <span>Section {page + 1} of {sections.length}</span>
                        <span>{currentSection || 'General'}</span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-navy-600 transition-all" style={{ width: `${((page + 1) / sections.length) * 100}%` }} />
                      </div>
                    </div>
                  )}
                  <div className="mt-6 space-y-6">
                    {paginated ? (
                      <div className="space-y-4">
                        {questionsToShow.map((q) => (
                          <div key={q.id}>
                            <label className="block text-[18px] text-slate-700 mb-1.5">
                              {q.label}
                              {q.required && <span className="text-red-500 ml-0.5">*</span>}
                            </label>
                            <PreviewQuestionInput
                              q={q}
                              value={answers[q.id] ?? (q.type === 'multiselect' ? [] : '')}
                              onChange={(v) => setAnswers((prev) => ({ ...prev, [q.id]: v }))}
                            />
                          </div>
                        ))}
                      </div>
                    ) : (
                      sections.map((section) => (
                        <div key={section}>
                          {section && <p className="text-[16px] font-semibold text-navy-600 uppercase tracking-wide mb-3">{section}</p>}
                          <div className="space-y-4">
                            {visibleQs.filter((q) => (q.section || '') === section).map((q) => (
                              <div key={q.id}>
                                <label className="block text-[18px] text-slate-700 mb-1.5">
                                  {q.label}
                                  {q.required && <span className="text-red-500 ml-0.5">*</span>}
                                </label>
                                <PreviewQuestionInput
                                  q={q}
                                  value={answers[q.id] ?? (q.type === 'multiselect' ? [] : '')}
                                  onChange={(v) => setAnswers((prev) => ({ ...prev, [q.id]: v }))}
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}

              <div className="mt-6 flex items-center gap-2">
                {paginated && page > 0 && (
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    className="flex items-center gap-1 px-4 py-3 text-[18px] font-medium text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50"
                  >
                    <ChevronLeft className="w-4 h-4" /> Back
                  </button>
                )}
                {paginated && !isLastPage ? (
                  <button
                    type="button"
                    onClick={() => setPage((p) => p + 1)}
                    className="flex-1 flex items-center justify-center gap-2 bg-navy-600 hover:bg-navy-700 text-white text-[18px] font-medium rounded-lg py-3 transition-colors"
                  >
                    Next
                  </button>
                ) : (
                  <div className="flex-1 flex items-center justify-center gap-2 bg-slate-100 text-slate-400 text-[18px] font-medium rounded-lg py-3 cursor-not-allowed">
                    Submit (disabled in preview)
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
