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
  editedAnswers: Answers | null
  answers: Answers | null
}

function sameValue(a: string | string[] | undefined, b: string | string[] | undefined): boolean {
  const an = a == null ? '' : Array.isArray(a) ? a.join('|') : a
  const bn = b == null ? '' : Array.isArray(b) ? b.join('|') : b
  return an === bn
}
function renderValue(v: string | string[] | undefined): string {
  return v == null ? '—' : Array.isArray(v) ? (v.join(', ') || '—') : v
}

// The staff member's submitted plan, now EDITABLE by the line manager (not just a read-only
// recap) — the manager can correct/adjust what the employee selected before accepting it. Each
// field that differs from the employee's original submission shows what it originally was, so the
// change is visible without a separate audit log.
function EditablePlanSections({
  sections, original, edited, onChange,
}: {
  sections: Section[]
  original: Answers
  edited: Answers
  onChange: (next: Answers) => void
}) {
  const needsSection = sections.find((s) => s.key === 'development_needs')
  const otherSections = sections.filter((s) => s.key !== 'development_needs')

  return (
    <div className="space-y-5">
      {otherSections.map((s) => (
        <div key={s.id}>
          <p className="text-xs font-semibold text-slate-600 mb-2">{s.title}</p>
          <PDPSectionRenderer
            questions={s.questions}
            values={edited.answers}
            onChange={(qId, v) => onChange({ ...edited, answers: { ...edited.answers, [qId]: v } })}
          />
          {s.questions.filter((q) => !sameValue(edited.answers[q.id], original.answers[q.id])).map((q) => (
            <p key={q.id} className="text-[11px] text-amber-700 mt-1">Changed &mdash; originally: {renderValue(original.answers[q.id])}</p>
          ))}
        </div>
      ))}
      {needsSection && edited.developmentNeeds.map((need, i) => {
        const originalNeed = original.developmentNeeds[i]
        return (
          <div key={i}>
            <p className="text-xs font-semibold text-slate-600 mb-2">Development Need {i + 1}{!originalNeed && <span className="text-amber-700 font-normal"> (added by manager)</span>}</p>
            <PDPSectionRenderer
              questions={needsSection.questions}
              values={need}
              onChange={(qId, v) => {
                const nextNeeds = edited.developmentNeeds.map((n, idx) => (idx === i ? { ...n, [qId]: v } : n))
                onChange({ ...edited, developmentNeeds: nextNeeds })
              }}
            />
            {originalNeed && needsSection.questions.filter((q) => !sameValue(need[q.id], originalNeed[q.id])).map((q) => (
              <p key={q.id} className="text-[11px] text-amber-700 mt-1">Changed &mdash; originally: {renderValue(originalNeed[q.id])}</p>
            ))}
          </div>
        )
      })}
    </div>
  )
}

export default function PDPManagerValidatePage() {
  const { token } = useParams<{ token: string }>()
  const [ctx, setCtx] = useState<Context | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState<Answers | null>(null)
  const [editedForm, setEditedForm] = useState<Answers | null>(null)
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
        setEditedForm(data.editedAnswers ?? data.staffAnswers ?? { answers: {}, developmentNeeds: [] })
      })
      .catch(() => setError('Could not load this review.'))
      .finally(() => setLoading(false))
  }, [token])

  // Draft autosave of the manager's edits, debounced — mirrors the other PDP tracks.
  useEffect(() => {
    if (loading || !editedForm || !ctx || ctx.alreadyResponded || submitted) return
    const timeout = setTimeout(() => {
      fetch(`/api/pdp/validate/${token}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ editedAnswers: editedForm }),
      }).catch(() => {})
    }, 1200)
    return () => clearTimeout(timeout)
  }, [editedForm, loading, ctx, submitted, token])

  if (loading) return <div className="flex items-center justify-center min-h-screen"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>

  if (error || !ctx || !form || !editedForm) return (
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
        <p className="text-sm font-medium text-slate-800">Thank you — your review of {ctx.staffName}&apos;s Development Plan has been recorded. {ctx.staffName} will receive a copy of the finalized plan.</p>
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

  const staffAnswers = ctx.staffAnswers
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
        body: JSON.stringify({ answers: form, editedAnswers: editedForm }),
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
          <p className="text-sm font-semibold text-slate-800 mb-1">Submitted Plan</p>
          <p className="text-[11px] text-slate-400 mb-3">Edit anything below if needed before accepting — fields you change show what {ctx.staffName.split(' ')[0]} originally selected.</p>
          <EditablePlanSections sections={ctx.respondentSections} original={staffAnswers} edited={editedForm} onChange={setEditedForm} />
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
            Accept &amp; Confirm Review
          </button>
        </div>
      </div>
    </div>
  )
}
