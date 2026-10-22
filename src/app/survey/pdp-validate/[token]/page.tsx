'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'
import { PDPSectionRenderer, type PDPQuestion } from '@/components/pdp/PDPSectionRenderer'
import { firstPageIssue } from '@/lib/pdp-validate'

interface PrefillSnapshot { businessUnit: string; department: string | null; role: string | null }
interface Section { id: string; key: string; title: string; description: string | null; maxRepeats: number; questions: PDPQuestion[] }
interface Answers { answers: Record<string, string | string[]>; developmentNeeds: Record<string, string | string[]>[] }

interface Context {
  valid: boolean
  cycleTitle: string
  staffName: string
  managerName: string | null
  alreadyResponded: boolean
  staffNotYetSubmitted: boolean
  respondentSections: Section[]
  validationSections: Section[]
  prefill: PrefillSnapshot
  staffAnswers: Answers | null
  answers: Answers | null
}

// Read-only recap of what the staff member submitted — labels resolved from respondentSections
// (same sections/questions the staff member's own form used), rendered as plain text rather than
// the full interactive form since the manager isn't editing these answers, only reviewing them.
function StaffAnswersRecap({ sections, answers }: { sections: Section[]; answers: Answers }) {
  const needsSection = sections.find((s) => s.key === 'development_needs')
  const otherSections = sections.filter((s) => s.key !== 'development_needs')
  const renderValue = (v: string | string[] | undefined) => (v == null ? '—' : Array.isArray(v) ? v.join(', ') || '—' : v)

  return (
    <div className="space-y-4">
      {otherSections.map((s) => (
        <div key={s.id}>
          <p className="text-xs font-semibold text-slate-600 mb-1">{s.title}</p>
          <div className="space-y-1">
            {s.questions.map((q) => (
              <p key={q.id} className="text-xs text-slate-600"><span className="text-slate-400">{q.label}:</span> {renderValue(answers.answers[q.id])}</p>
            ))}
          </div>
        </div>
      ))}
      {needsSection && answers.developmentNeeds.map((need, i) => (
        <div key={i}>
          <p className="text-xs font-semibold text-slate-600 mb-1">Development Need {i + 1}</p>
          <div className="space-y-1">
            {needsSection.questions.map((q) => (
              <p key={q.id} className="text-xs text-slate-600"><span className="text-slate-400">{q.label}:</span> {renderValue(need[q.id])}</p>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function PDPManagerValidatePage() {
  const { token } = useParams<{ token: string }>()
  const [ctx, setCtx] = useState<Context | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState<Answers | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    fetch(`/api/pdp/validate/${token}`)
      .then((r) => r.json())
      .then((data: Context & { error?: string }) => {
        if (data.error) { setError(data.error); return }
        setCtx(data)
        setForm(data.answers ?? { answers: {}, developmentNeeds: [] })
      })
      .catch(() => setError('Could not load this review.'))
      .finally(() => setLoading(false))
  }, [token])

  if (loading) return <div className="flex items-center justify-center min-h-screen"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>

  if (error || !ctx || !form) return (
    <div className="flex items-center justify-center min-h-screen p-6">
      <div className="max-w-md text-center">
        <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-3" />
        <p className="text-sm text-slate-600">{error || 'This link is invalid.'}</p>
      </div>
    </div>
  )

  if (ctx.alreadyResponded || submitted) return (
    <div className="flex items-center justify-center min-h-screen p-6">
      <div className="max-w-md text-center">
        <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-3" />
        <p className="text-sm font-medium text-slate-800">Thank you — your review of {ctx.staffName}&apos;s Development Plan has been recorded.</p>
      </div>
    </div>
  )

  if (ctx.staffNotYetSubmitted || !ctx.staffAnswers) return (
    <div className="flex items-center justify-center min-h-screen p-6">
      <div className="max-w-md text-center">
        <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-3" />
        <p className="text-sm text-slate-600">{ctx.staffName} hasn&apos;t submitted their plan yet — check back once they have.</p>
      </div>
    </div>
  )

  const validationSection = ctx.validationSections[0]

  const submit = async () => {
    if (validationSection) {
      const issue = firstPageIssue(validationSection.questions, form.answers)
      if (issue) { setSubmitError(issue); return }
    }
    setSubmitting(true)
    setSubmitError('')
    try {
      const res = await fetch(`/api/pdp/validate/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setSubmitError(data.error || 'Failed to submit.'); return }
      setSubmitted(true)
    } catch {
      setSubmitError('Failed to submit — network error.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="mb-4">
          <h1 className="text-lg font-bold text-slate-900">{ctx.cycleTitle} — Review</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {ctx.staffName} · {ctx.prefill.role || 'Role not on file'} · {ctx.prefill.businessUnit}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 mb-4">
          <p className="text-sm font-semibold text-slate-800 mb-3">Submitted Plan</p>
          <StaffAnswersRecap sections={ctx.respondentSections} answers={ctx.staffAnswers} />
        </div>

        {validationSection && (
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <p className="text-sm font-semibold text-slate-800 mb-1">{validationSection.title}</p>
            {validationSection.description && <p className="text-xs text-slate-500 mb-4">{validationSection.description}</p>}
            <PDPSectionRenderer
              questions={validationSection.questions}
              values={form.answers}
              onChange={(qId, v) => setForm((prev) => prev && { ...prev, answers: { ...prev.answers, [qId]: v } })}
            />
          </div>
        )}

        {submitError && <p className="text-xs text-red-600 mt-3">{submitError}</p>}

        <div className="flex justify-end mt-4">
          <button
            onClick={submit}
            disabled={submitting}
            className="flex items-center gap-1.5 text-sm font-medium text-white bg-emerald-600 rounded-lg px-4 py-2 hover:bg-emerald-700 disabled:opacity-50"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Confirm Review
          </button>
        </div>
      </div>
    </div>
  )
}
