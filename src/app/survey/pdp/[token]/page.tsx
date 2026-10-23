'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { Loader2, CheckCircle2, AlertTriangle, ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react'
import { PDPSectionRenderer, type PDPQuestion } from '@/components/pdp/PDPSectionRenderer'
import { PDPIntroPage } from '@/components/pdp/PDPIntroPage'
import { firstPageIssue } from '@/lib/pdp-validate'
import { RepeatInterventionCheck, REPEAT_REASON_KEY, findRepeatedCapability, repeatReasonSatisfied } from '@/components/pdp/RepeatInterventionCheck'
import { resolveWrapupSectionQuestions, isToolSectionVisible } from '@/lib/pdp-wrapup'

interface PrefillSnapshot {
  businessUnit: string
  department: string | null
  role: string | null
  capabilities: { name: string; covered: boolean }[]
  recentFeedback: string[]
  trainingHistory2026: { trainingName: string; capability: string | null; month: string }[]
}

interface Section {
  id: string
  key: string
  title: string
  description: string | null
  maxRepeats: number
  questions: PDPQuestion[]
}

interface Answers {
  answers: Record<string, string | string[]>
  developmentNeeds: Record<string, string | string[]>[]
}

interface Context {
  valid: boolean
  cycleTitle: string
  staffName: string
  alreadyResponded: boolean
  finalizedByManager: { managerName: string; viewToken: string } | null
  sections: Section[]
  prefill: PrefillSnapshot
  answers: Answers | null
}

type PageDescriptor = { type: 'intro' } | { type: 'section'; section: Section } | { type: 'need'; section: Section; index: number }

export default function PDPStaffSurveyPage() {
  const { token } = useParams<{ token: string }>()
  const [ctx, setCtx] = useState<Context | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState<Answers | null>(null)
  const [page, setPage] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [pageError, setPageError] = useState('')

  useEffect(() => {
    fetch(`/api/pdp/staff/${token}`)
      .then((r) => r.json())
      .then((data: Context & { error?: string }) => {
        if (data.error) { setError(data.error); return }
        setCtx(data)
        // A saved draft that predates the current {answers, developmentNeeds} shape can come back
        // with a missing/undefined developmentNeeds key — defaulting it here (not just when the
        // whole `answers` object is null) keeps every .map()/.find() downstream from crashing.
        setForm({
          answers: data.answers?.answers ?? {},
          developmentNeeds: Array.isArray(data.answers?.developmentNeeds) ? data.answers.developmentNeeds : [{}],
        })
      })
      .catch(() => setError('Could not load this plan.'))
      .finally(() => setLoading(false))
  }, [token])

  // Draft autosave — debounced so a run of keystrokes/clicks sends one request, not one per
  // change. Lets a respondent close the tab mid-fill and resume exactly where they left off (the
  // GET above already returns the saved draft as the initial form state). Never fires before the
  // initial load completes, and never once submitted.
  useEffect(() => {
    if (loading || !form || !ctx || ctx.alreadyResponded || submitted) return
    const timeout = setTimeout(() => {
      fetch(`/api/pdp/staff/${token}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      }).catch(() => {})
    }, 1200)
    return () => clearTimeout(timeout)
  }, [form, loading, ctx, submitted, token])

  const pages: PageDescriptor[] = useMemo(() => {
    if (!ctx || !form) return []
    const out: PageDescriptor[] = [{ type: 'intro' }]
    for (const section of ctx.sections) {
      if (!isToolSectionVisible(section, ctx.sections, form.answers)) continue
      if (section.key === 'development_needs') {
        const count = Math.max(1, form.developmentNeeds.length)
        for (let i = 0; i < count; i++) out.push({ type: 'need', section, index: i })
      } else {
        out.push({ type: 'section', section })
      }
    }
    return out
  }, [ctx, form])

  if (loading) return <div className="flex items-center justify-center min-h-screen"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>

  if (error || !ctx || !form) return (
    <div className="flex items-center justify-center min-h-screen p-6">
      <div className="max-w-md text-center">
        <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-3" />
        <p className="text-[18px] text-slate-600">{error || 'This link is invalid.'}</p>
      </div>
    </div>
  )

  if (ctx.finalizedByManager) return (
    <div className="flex items-center justify-center min-h-screen p-6">
      <div className="max-w-md text-center">
        <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-3" />
        <p className="text-[18px] font-medium text-slate-800">{ctx.finalizedByManager.managerName} has already completed your Personal Development Plan for you.</p>
        <a href={`/survey/pdp-view/${ctx.finalizedByManager.viewToken}`} className="inline-block mt-4 text-[15px] font-medium text-white bg-emerald-600 rounded-lg px-4 py-2 hover:bg-emerald-700">View My Finalized Plan</a>
      </div>
    </div>
  )

  if (ctx.alreadyResponded || submitted) return (
    <div className="flex items-center justify-center min-h-screen p-6">
      <div className="max-w-md text-center">
        <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-3" />
        <p className="text-[18px] font-medium text-slate-800">Thank you, {ctx.staffName.split(' ')[0]} — your Personal Development Plan has been submitted.</p>
        <p className="text-[15px] text-slate-500 mt-2">Your line manager will be asked to review it.</p>
      </div>
    </div>
  )

  const current = pages[page]
  const needsSection = ctx.sections.find((s) => s.key === 'development_needs')
  const areaQuestionId = needsSection?.questions.find((q) => q.type === 'select')?.id
  // The confirmation section's yesno question only accepts "Yes" to actually submit — selecting
  // "No" means the respondent is telling us their plan isn't ready, so Submit gets disabled rather
  // than silently accepting a "No" as if it meant the same as leaving it blank.
  const confirmationSection = ctx.sections.find((s) => s.key === 'confirmation')
  const confirmationQuestion = confirmationSection?.questions.find((q) => q.type === 'yesno')
  const confirmationBlocked = !!confirmationQuestion && form.answers[confirmationQuestion.id] === 'No'

  const setAnswer = (questionId: string, value: string | string[]) => {
    setForm((prev) => prev && { ...prev, answers: { ...prev.answers, [questionId]: value } })
  }
  const setNeedAnswer = (index: number, questionId: string, value: string | string[]) => {
    setForm((prev) => prev && { ...prev, developmentNeeds: prev.developmentNeeds.map((n, i) => (i === index ? { ...n, [questionId]: value } : n)) })
  }
  // Advances to the new blank need's page immediately — without this, the "Add another" click
  // appends to developmentNeeds but leaves `page` pointing at the same index, so the respondent
  // stays on the page they were already looking at and nothing visibly happens (the button simply
  // disappears, since it only shows on the last need page, making the click look like it did
  // nothing). The new need always lands immediately after the current one in the page order, since
  // it's appended to the end of developmentNeeds while the respondent is on the last existing need.
  const addNeed = () => {
    setForm((prev) => prev && { ...prev, developmentNeeds: [...prev.developmentNeeds, {}] })
    setPage((p) => p + 1)
  }
  const removeNeed = (index: number) => {
    setForm((prev) => prev && { ...prev, developmentNeeds: prev.developmentNeeds.filter((_, i) => i !== index) })
    setPage((p) => Math.max(0, p - 1))
  }

  // Checks the page currently showing against its own required/maxSelect rules before advancing
  // or submitting — the intro page has nothing to check. Returns true when the page is clear to
  // leave.
  const checkCurrentPage = (): boolean => {
    if (!current || current.type === 'intro') { setPageError(''); return true }
    const values = current.type === 'need' ? (form.developmentNeeds[current.index] || {}) : form.answers
    const questions = current.type === 'need' ? current.section.questions : resolveWrapupSectionQuestions(current.section, ctx.sections, form.answers)
    const issue = firstPageIssue(questions, values)
    if (issue) { setPageError(issue); return false }
    if (current.type === 'need' && areaQuestionId) {
      const repeatMatch = findRepeatedCapability(values[areaQuestionId] as string | undefined, ctx.prefill.trainingHistory2026)
      if (repeatMatch && !repeatReasonSatisfied(values[REPEAT_REASON_KEY] as string | undefined)) {
        setPageError('This need was already covered by a 2026 Learning Intervention — please select a reason for repeating it.')
        return false
      }
    }
    setPageError('')
    return true
  }

  const goNext = () => {
    if (!checkCurrentPage()) return
    setPage((p) => p + 1)
  }

  const submit = async () => {
    if (confirmationBlocked) { setPageError('You selected "No" on the confirmation question — please review and update your plan, or select "Yes" once it reflects your actual development needs, before submitting.'); return }
    if (!checkCurrentPage()) return
    setSubmitting(true)
    setSubmitError('')
    try {
      const res = await fetch(`/api/pdp/staff/${token}`, {
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
      <div className="max-w-3xl mx-auto">
        <div className="mb-4">
          <h1 className="text-[23px] font-bold text-slate-900">{ctx.cycleTitle}</h1>
        </div>

        <div className="w-full bg-slate-200 rounded-full h-1.5 mb-1">
          <div className="bg-navy-600 h-1.5 rounded-full transition-all" style={{ width: `${((page + 1) / pages.length) * 100}%` }} />
        </div>
        <p className="text-[14px] text-slate-400 mb-4">Page {page + 1} of {pages.length}</p>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          {current?.type === 'intro' && (
            <PDPIntroPage
              staffName={ctx.staffName}
              businessUnit={ctx.prefill.businessUnit}
              department={ctx.prefill.department}
              role={ctx.prefill.role}
              trainingHistory2026={ctx.prefill.trainingHistory2026}
            />
          )}

          {current?.type === 'section' && (
            <div>
              <h2 className="text-[18px] font-semibold text-slate-800 mb-1">{current.section.title}</h2>
              {current.section.description && <p className="text-[15px] text-slate-500 mb-4">{current.section.description}</p>}
              <PDPSectionRenderer questions={resolveWrapupSectionQuestions(current.section, ctx.sections, form.answers)} values={form.answers} onChange={setAnswer} />
            </div>
          )}

          {current?.type === 'need' && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-[18px] font-semibold text-slate-800">Development Need {current.index + 1}</h2>
                {form.developmentNeeds.length > 1 && (
                  <button onClick={() => removeNeed(current.index)} className="text-[15px] text-slate-400 hover:text-red-600 flex items-center gap-1">
                    <Trash2 className="w-3.5 h-3.5" /> Remove
                  </button>
                )}
              </div>
              {current.section.description && <p className="text-[15px] text-slate-500 mb-4">{current.section.description}</p>}
              <PDPSectionRenderer
                questions={current.section.questions}
                values={form.developmentNeeds[current.index] || {}}
                onChange={(qId, v) => setNeedAnswer(current.index, qId, v)}
              />
              {areaQuestionId && (() => {
                const need = form.developmentNeeds[current.index] || {}
                const repeatMatch = findRepeatedCapability(need[areaQuestionId] as string | undefined, ctx.prefill.trainingHistory2026)
                return repeatMatch ? (
                  <RepeatInterventionCheck
                    match={repeatMatch}
                    reason={(need[REPEAT_REASON_KEY] as string) || ''}
                    onChange={(r) => setNeedAnswer(current.index, REPEAT_REASON_KEY, r)}
                  />
                ) : null
              })()}
              {current.index === form.developmentNeeds.length - 1 && form.developmentNeeds.length < (needsSection?.maxRepeats ?? 1) && (
                <button onClick={addNeed} className="flex items-center gap-1.5 text-[15px] font-medium text-navy-700 hover:underline mt-4">
                  <Plus className="w-3.5 h-3.5" /> Add another Development Need
                </button>
              )}
            </div>
          )}
        </div>

        {pageError && <p className="text-[15px] text-red-600 mt-3">{pageError}</p>}
        {submitError && <p className="text-[15px] text-red-600 mt-3">{submitError}</p>}

        <div className="flex items-center justify-between mt-4">
          <button
            onClick={() => { setPageError(''); setPage((p) => Math.max(0, p - 1)) }}
            disabled={page === 0}
            className="flex items-center gap-1 text-[18px] text-slate-500 hover:text-slate-800 disabled:opacity-30"
          >
            <ChevronLeft className="w-4 h-4" /> Back
          </button>
          {page < pages.length - 1 ? (
            <button
              onClick={goNext}
              className="flex items-center gap-1 text-[18px] font-medium text-white bg-navy-600 rounded-lg px-4 py-2 hover:bg-navy-700"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={submitting || confirmationBlocked}
              title={confirmationBlocked ? 'Select "Yes" on the confirmation question to submit' : undefined}
              className="flex items-center gap-1.5 text-[18px] font-medium text-white bg-emerald-600 rounded-lg px-4 py-2 hover:bg-emerald-700 disabled:opacity-50"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              Submit
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
