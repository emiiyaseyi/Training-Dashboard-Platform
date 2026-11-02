'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'

interface Question {
  id: string
  label: string
  type: 'single-choice' | 'textarea'
  options?: string[]
}

interface Context {
  title: string
  intro: string
  questions: Question[]
  staffName: string
  submitted: boolean
}

export default function NewHireSurveyPage() {
  const { token } = useParams<{ token: string }>()
  const [loading, setLoading] = useState(true)
  const [ctx, setCtx] = useState<Context | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    fetch(`/api/new-hire-survey/${token}`)
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'This survey link is invalid.')
        setCtx(data)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'This survey link is invalid.'))
      .finally(() => setLoading(false))
  }, [token])

  if (loading) return <div className="flex items-center justify-center min-h-screen"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen p-6">
        <div className="max-w-md text-center">
          <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
          <p className="text-sm text-slate-700">{error}</p>
        </div>
      </div>
    )
  }

  if (!ctx) return null

  if (ctx.submitted || done) {
    return (
      <div className="flex items-center justify-center min-h-screen p-6">
        <div className="max-w-md text-center">
          <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-800 mb-1">Thank you for your feedback{ctx.staffName ? `, ${ctx.staffName.split(' ')[0]}` : ''}!</p>
          <p className="text-xs text-slate-500">Your response has been recorded.</p>
        </div>
      </div>
    )
  }

  const unanswered = ctx.questions.filter((q) => !answers[q.id]?.trim())

  const submit = async () => {
    if (unanswered.length > 0) {
      setSubmitError(`Please answer: "${unanswered[0].label}"`)
      return
    }
    setSubmitting(true)
    setSubmitError(null)
    try {
      const res = await fetch(`/api/new-hire-survey/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to submit.')
      setDone(true)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white border border-slate-200 rounded-xl p-5 mb-4">
          <h1 className="text-base font-bold text-slate-800">{ctx.title}</h1>
          <p className="text-xs text-slate-500 mt-2 leading-relaxed">{ctx.intro}</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-6">
          {ctx.questions.map((q, i) => (
            <div key={q.id}>
              <p className="text-sm font-medium text-slate-800 mb-2">{i + 1}. {q.label}</p>
              {q.type === 'single-choice' ? (
                <div className="space-y-1.5">
                  {q.options!.map((opt) => (
                    <label key={opt} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                      <input
                        type="radio"
                        name={q.id}
                        value={opt}
                        checked={answers[q.id] === opt}
                        onChange={() => setAnswers((a) => ({ ...a, [q.id]: opt }))}
                        className="accent-meristem-600"
                      />
                      {opt}
                    </label>
                  ))}
                </div>
              ) : (
                <textarea
                  value={answers[q.id] ?? ''}
                  onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                  placeholder="Enter your answer"
                  rows={4}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-meristem-300"
                />
              )}
            </div>
          ))}

          {submitError && <p className="text-xs text-red-600">{submitError}</p>}

          <button
            onClick={submit}
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 bg-meristem-700 hover:bg-meristem-800 text-white text-sm font-semibold py-2.5 rounded-lg disabled:opacity-60"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Submit
          </button>
        </div>
      </div>
    </div>
  )
}
