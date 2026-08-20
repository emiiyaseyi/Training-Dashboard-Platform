'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { BookOpen, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'

const STAGE_LABELS: Record<string, string> = {
  pre: 'Pre-Training Survey',
  post1: 'Post-Training Survey',
  post2: 'Manager Post-Training Impact Review',
}

interface Question {
  id: string
  section: string | null
  label: string
  type: 'text' | 'textarea' | 'select' | 'multiselect' | 'rating' | 'date' | 'yesno'
  options: string[] | null
  required: boolean
  autoFill: string | null
}

interface SurveyContext {
  valid: boolean
  stage: string
  recipientRole: 'employee' | 'manager'
  recipientName: string | null
  employeeName: string
  trainingName: string
  businessUnit: string
  alreadyResponded: boolean
  questions: Question[]
  autoFillValues: Record<string, string>
}

function QuestionInput({ q, value, onChange }: { q: Question; value: string | string[]; onChange: (v: string | string[]) => void }) {
  const base = 'w-full px-4 py-2.5 border border-slate-300 rounded-lg text-[18px] focus:outline-none focus:ring-2 focus:ring-navy-600'
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {q.options?.map((o) => (
            <label key={o} className="flex items-center gap-2 text-[18px] text-slate-600">
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
    case 'rating':
      return (
        <div className="flex items-center gap-2.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              type="button"
              key={n}
              onClick={() => onChange(String(n))}
              className={`w-11 h-11 rounded-full border text-[18px] font-medium ${
                String(value) === String(n) ? 'bg-navy-600 text-white border-navy-600' : 'border-slate-300 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      )
    case 'yesno':
      return (
        <div className="flex items-center gap-2.5">
          {['Yes', 'No'].map((o) => (
            <button
              type="button"
              key={o}
              onClick={() => onChange(o)}
              className={`px-5 py-2 rounded-lg border text-[18px] font-medium ${
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

export default function SurveyPage() {
  const params = useParams<{ token: string; stage: string }>()
  const [context, setContext] = useState<SurveyContext | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    fetch(`/api/survey/${params.token}/${params.stage}`)
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'This survey link is invalid.')
        setContext(data)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'This survey link is invalid.'))
      .finally(() => setLoading(false))
  }, [params.token, params.stage])

  const visibleQuestions = useMemo(() => (context?.questions || []).filter((q) => !q.autoFill), [context])
  const sections = useMemo(() => {
    const seen: string[] = []
    for (const q of visibleQuestions) {
      const s = q.section || ''
      if (!seen.includes(s)) seen.push(s)
    }
    return seen
  }, [visibleQuestions])

  const label = STAGE_LABELS[params.stage as string] || 'Survey'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitError('')
    setSubmitting(true)
    try {
      const res = await fetch(`/api/survey/${params.token}/${params.stage}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to submit.')
      setSubmitted(true)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-navy-700 px-4 py-10">
      <div className="w-full max-w-3xl">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-lg bg-gold-400 flex items-center justify-center mb-4">
            <BookOpen className="w-7 h-7 text-navy-800" />
          </div>
          <p className="text-white font-semibold text-[23px]">Learning Intelligence</p>
          <p className="text-slate-400 text-[18px]">{label}</p>
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
              <p className="text-[16px] text-slate-500 mt-1">If you think this is a mistake, contact your L&amp;D team.</p>
            </div>
          ) : submitted || context?.alreadyResponded ? (
            <div className="flex flex-col items-center text-center py-6">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 mb-3" />
              <p className="text-[18px] font-medium text-slate-800">
                {submitted ? 'Thank you — your response has been submitted!' : 'You’ve already submitted this survey — thank you!'}
              </p>
              <p className="text-[16px] text-slate-500 mt-1">{context?.trainingName}</p>
            </div>
          ) : context ? (
            <form onSubmit={handleSubmit}>
              <p className="text-[18px] text-slate-500">Hi {context.recipientName || 'there'},</p>
              <p className="text-[21px] font-semibold text-slate-800 mt-1">{context.trainingName}</p>
              <p className="text-[16px] text-slate-400 mt-0.5">{context.businessUnit}</p>

              <div className="mt-6 space-y-6">
                {sections.map((section) => (
                  <div key={section}>
                    {section && <p className="text-[16px] font-semibold text-navy-600 uppercase tracking-wide mb-3">{section}</p>}
                    <div className="space-y-4">
                      {visibleQuestions.filter((q) => (q.section || '') === section).map((q) => (
                        <div key={q.id}>
                          <label className="block text-[18px] text-slate-700 mb-1.5">
                            {q.label}
                            {q.required && <span className="text-red-500 ml-0.5">*</span>}
                          </label>
                          <QuestionInput
                            q={q}
                            value={answers[q.id] ?? (q.type === 'multiselect' ? [] : '')}
                            onChange={(v) => setAnswers((prev) => ({ ...prev, [q.id]: v }))}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {submitError && (
                <p className="mt-4 text-[16px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{submitError}</p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="mt-6 w-full flex items-center justify-center gap-2 bg-navy-600 hover:bg-navy-700 text-white text-[18px] font-medium rounded-lg py-3 transition-colors disabled:opacity-60"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Submit
              </button>
            </form>
          ) : null}
        </div>
      </div>
    </div>
  )
}
