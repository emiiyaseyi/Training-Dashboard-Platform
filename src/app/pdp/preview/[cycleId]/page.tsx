'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { Loader2, AlertTriangle, ChevronLeft, ChevronRight, Plus, Trash2, Eye } from 'lucide-react'
import { PDPSectionRenderer, type PDPQuestion } from '@/components/pdp/PDPSectionRenderer'
import { PDPIntroPage } from '@/components/pdp/PDPIntroPage'
import { PDPTrainingHistoryPage } from '@/components/pdp/PDPTrainingHistoryPage'
import { firstPageIssue } from '@/lib/pdp-validate'
import { RepeatInterventionCheck, REPEAT_REASON_KEY, findRepeatedCapability, repeatReasonSatisfied } from '@/components/pdp/RepeatInterventionCheck'
import { resolveWrapupSectionQuestions, isToolSectionVisible, isSectionAKey } from '@/lib/pdp-wrapup'

interface PrefillSnapshot {
  businessUnit: string
  department: string | null
  role: string | null
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

interface Context {
  valid: boolean
  cycleTitle: string
  staffName: string
  sections: Section[]
  prefill: PrefillSnapshot
}

type PageDescriptor = { type: 'intro' } | { type: 'training-history' } | { type: 'section'; section: Section } | { type: 'need'; section: Section; index: number }

// Admin-only, read from the live cycle's current sections/questions — no token, nothing is ever
// saved or sent. Lets an admin click through exactly what staff will see before launching Track A,
// including after editing sections/questions in the admin panel.
export default function PDPFormPreviewPage() {
  const { cycleId } = useParams<{ cycleId: string }>()
  const [ctx, setCtx] = useState<Context | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({})
  const [developmentNeeds, setDevelopmentNeeds] = useState<Record<string, string | string[]>[]>([{}])
  const [page, setPage] = useState(0)
  const [pageError, setPageError] = useState('')

  useEffect(() => {
    fetch(`/api/admin/pdp/${cycleId}/preview`)
      .then((r) => r.json())
      .then((data: Context & { error?: string }) => {
        if (data.error) { setError(data.error); return }
        setCtx(data)
      })
      .catch(() => setError('Could not load this preview.'))
      .finally(() => setLoading(false))
  }, [cycleId])

  const pages: PageDescriptor[] = useMemo(() => {
    if (!ctx) return []
    const out: PageDescriptor[] = [{ type: 'intro' }]
    let insertedTrainingHistory = false
    for (const section of ctx.sections) {
      if (!isToolSectionVisible(section, ctx.sections, answers)) continue
      if (!insertedTrainingHistory && !isSectionAKey(section.key)) {
        out.push({ type: 'training-history' })
        insertedTrainingHistory = true
      }
      if (section.key === 'development_needs') {
        const count = Math.max(1, developmentNeeds.length)
        for (let i = 0; i < count; i++) out.push({ type: 'need', section, index: i })
      } else {
        out.push({ type: 'section', section })
      }
    }
    return out
  }, [ctx, developmentNeeds, answers])

  if (loading) return <div className="flex items-center justify-center min-h-screen"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>

  if (error || !ctx) return (
    <div className="flex items-center justify-center min-h-screen p-6">
      <div className="max-w-md text-center">
        <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-3" />
        <p className="text-[18px] text-slate-600">{error || 'This cycle could not be found.'}</p>
      </div>
    </div>
  )

  const current = pages[page]
  const needsSection = ctx.sections.find((s) => s.key === 'development_needs')
  const areaQuestionId = needsSection?.questions.find((q) => q.type === 'select')?.id

  const setAnswer = (questionId: string, value: string | string[]) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }))
  }
  const setNeedAnswer = (index: number, questionId: string, value: string | string[]) => {
    setDevelopmentNeeds((prev) => prev.map((n, i) => (i === index ? { ...n, [questionId]: value } : n)))
  }
  const addNeed = () => {
    setDevelopmentNeeds((prev) => [...prev, {}])
    setPage((p) => p + 1)
  }
  const removeNeed = (index: number) => {
    setDevelopmentNeeds((prev) => prev.filter((_, i) => i !== index))
    setPage((p) => Math.max(0, p - 1))
  }

  const checkCurrentPage = (): boolean => {
    if (!current || current.type === 'intro' || current.type === 'training-history') { setPageError(''); return true }
    const values = current.type === 'need' ? (developmentNeeds[current.index] || {}) : answers
    const questions = current.type === 'need' ? current.section.questions : resolveWrapupSectionQuestions(current.section, ctx.sections, answers)
    const issue = firstPageIssue(questions, values)
    if (issue) { setPageError(issue); return false }
    if (current.type === 'need' && areaQuestionId) {
      const repeatMatch = findRepeatedCapability(values[areaQuestionId] as string | undefined, ctx.prefill.trainingHistory2026)
      if (repeatMatch && !repeatReasonSatisfied(values[REPEAT_REASON_KEY] as string | undefined)) {
        setPageError('This need was already covered by a 2026 Learning Intervention. Please select a reason for repeating it.')
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

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2 text-[14px] mb-4">
          <Eye className="w-4 h-4 shrink-0" />
          Preview mode. This is what staff will see. Nothing here is saved or sent.
        </div>

        <div className="mb-4">
          <h1 className="text-[23px] font-bold text-slate-900">{ctx.cycleTitle}</h1>
        </div>

        <div className="w-full bg-slate-200 rounded-full h-1.5 mb-1">
          <div className="bg-navy-600 h-1.5 rounded-full transition-all" style={{ width: `${((page + 1) / pages.length) * 100}%` }} />
        </div>
        <p className="text-[14px] text-slate-400 mb-4">{Math.round(((page + 1) / pages.length) * 100)}% complete</p>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          {current?.type === 'intro' && (
            <PDPIntroPage
              staffName={ctx.staffName}
              businessUnit={ctx.prefill.businessUnit}
              department={ctx.prefill.department}
              role={ctx.prefill.role}
            />
          )}

          {current?.type === 'training-history' && (
            <PDPTrainingHistoryPage trainingHistory2026={ctx.prefill.trainingHistory2026} />
          )}

          {current?.type === 'section' && (
            <div>
              <h2 className="text-[18px] font-semibold text-slate-800 mb-1">{current.section.title}</h2>
              {current.section.description && <p className="text-[15px] text-slate-500 mb-4">{current.section.description}</p>}
              <PDPSectionRenderer questions={resolveWrapupSectionQuestions(current.section, ctx.sections, answers)} values={answers} onChange={setAnswer} />
            </div>
          )}

          {current?.type === 'need' && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-[18px] font-semibold text-slate-800">Development Need {current.index + 1}</h2>
                {developmentNeeds.length > 1 && (
                  <button onClick={() => removeNeed(current.index)} className="text-[15px] text-slate-400 hover:text-red-600 flex items-center gap-1">
                    <Trash2 className="w-3.5 h-3.5" /> Remove
                  </button>
                )}
              </div>
              {current.section.description && <p className="text-[15px] text-slate-500 mb-4">{current.section.description}</p>}
              <PDPSectionRenderer
                questions={current.section.questions}
                values={developmentNeeds[current.index] || {}}
                onChange={(qId, v) => setNeedAnswer(current.index, qId, v)}
              />
              {areaQuestionId && (() => {
                const need = developmentNeeds[current.index] || {}
                const repeatMatch = findRepeatedCapability(need[areaQuestionId] as string | undefined, ctx.prefill.trainingHistory2026)
                return repeatMatch ? (
                  <RepeatInterventionCheck
                    match={repeatMatch}
                    reason={(need[REPEAT_REASON_KEY] as string) || ''}
                    onChange={(r) => setNeedAnswer(current.index, REPEAT_REASON_KEY, r)}
                  />
                ) : null
              })()}
              {current.index === developmentNeeds.length - 1 && developmentNeeds.length < (needsSection?.maxRepeats ?? 1) && (
                <button onClick={addNeed} className="flex items-center gap-1.5 text-[15px] font-medium text-navy-700 hover:underline mt-4">
                  <Plus className="w-3.5 h-3.5" /> Add another Development Need
                </button>
              )}
            </div>
          )}
        </div>

        {pageError && <p className="text-[15px] text-red-600 mt-3">{pageError}</p>}

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
              disabled
              title="Preview only. Nothing is submitted here"
              className="flex items-center gap-1.5 text-[18px] font-medium text-white bg-emerald-600/60 rounded-lg px-4 py-2 cursor-not-allowed"
            >
              Submit (preview only)
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
