'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { BookOpen, Loader2, AlertTriangle, Eye, Paperclip } from 'lucide-react'

const STAGE_LABELS: Record<string, string> = {
  pre: 'Pre-Training Survey',
  post1: 'Post-Training Survey',
  post2: 'Manager Post-Training Impact Review',
}

interface Question {
  id: string
  section: string | null
  label: string
  type: 'text' | 'textarea' | 'select' | 'multiselect' | 'rating' | 'date' | 'yesno' | 'file'
  options: string[] | null
  ratingMax: number
  required: boolean
}

interface PreviewContext {
  trainingName: string
  businessUnit: string
  stage: string
  questions: Question[]
}

// Admin-only read preview of a training schedule's Pre/Post-1/Post-2 form — mirrors the Custom
// Survey preview (src/app/survey/custom/preview/[id]) but reads from the fixed pre/post1/post2
// question bank via /api/admin/training-schedule/[id]/survey-preview instead of a Custom Survey's
// own questions. Nothing here is wired to a real token or submission.
function PreviewQuestionInput({ q }: { q: Question }) {
  const base = 'w-full px-4 py-2.5 border border-slate-300 rounded-lg text-[17px] text-slate-400 bg-slate-50'
  switch (q.type) {
    case 'textarea':
      return <textarea disabled rows={3} className={base} placeholder="Respondent's answer appears here" />
    case 'select':
      return <select disabled className={base}><option>Select…</option>{q.options?.map((o) => <option key={o}>{o}</option>)}</select>
    case 'file':
      return (
        <div className="flex items-center gap-2 border border-dashed border-slate-300 rounded-lg px-4 py-2.5 text-[16px] text-slate-400">
          <Paperclip className="w-4 h-4 shrink-0" />
          File upload — respondents will be able to attach a file here
        </div>
      )
    case 'multiselect':
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {q.options?.map((o) => (
            <label key={o} className="flex items-center gap-2 text-[17px] text-slate-500">
              <input type="checkbox" disabled />
              {o}
            </label>
          ))}
        </div>
      )
    case 'rating': {
      const max = q.ratingMax || 5
      return (
        <div className="flex items-center gap-2.5 flex-wrap">
          {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
            <div key={n} className="w-10 h-10 rounded-full border border-slate-300 text-slate-500 flex items-center justify-center text-[17px] font-medium">{n}</div>
          ))}
        </div>
      )
    }
    case 'yesno':
      return (
        <div className="flex items-center gap-2.5">
          {['Yes', 'No'].map((o) => (
            <div key={o} className="px-5 py-2 rounded-lg border border-slate-300 text-slate-500 text-[17px] font-medium">{o}</div>
          ))}
        </div>
      )
    case 'date':
      return <input type="date" disabled className={base} />
    default:
      return <input type="text" disabled className={base} placeholder="Respondent's answer appears here" />
  }
}

export default function SchedulePreviewPage() {
  const params = useParams<{ scheduleId: string; stage: string }>()
  const [context, setContext] = useState<PreviewContext | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/admin/training-schedule/${params.scheduleId}/survey-preview?stage=${params.stage}`)
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Could not load this survey.')
        setContext(data)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load this survey.'))
      .finally(() => setLoading(false))
  }, [params.scheduleId, params.stage])

  const sections = context ? [...new Set(context.questions.map((q) => q.section || ''))] : []
  const label = STAGE_LABELS[params.stage as string] || 'Survey'

  return (
    <div className="min-h-dvh w-full flex items-center justify-center bg-navy-700 px-4 pt-10 pb-20">
      <div className="w-full max-w-3xl">
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 rounded-lg bg-gold-400 flex items-center justify-center mb-4">
            <BookOpen className="w-7 h-7 text-navy-800" />
          </div>
          <p className="text-white font-semibold text-[23px]">Learning Intelligence</p>
          <p className="text-slate-400 text-[18px]">{label}</p>
        </div>

        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-2.5 mb-4 text-[15px]">
          <Eye className="w-4 h-4 shrink-0" />
          Preview only — this is what respondents will see. Nothing here is saved or sent.
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
              <p className="text-[21px] font-semibold text-slate-800 mt-1">{context.trainingName}</p>
              <p className="text-[16px] text-slate-400 mt-0.5">{context.businessUnit}</p>

              {context.questions.length === 0 ? (
                <p className="text-[16px] text-slate-400 mt-6">No questions configured for this stage.</p>
              ) : (
                <div className="mt-6 space-y-6">
                  {sections.map((section) => (
                    <div key={section}>
                      {section && <p className="text-[16px] font-semibold text-navy-600 uppercase tracking-wide mb-3">{section}</p>}
                      <div className="space-y-4">
                        {context.questions.filter((q) => (q.section || '') === section).map((q) => (
                          <div key={q.id}>
                            <label className="block text-[18px] text-slate-700 mb-1.5">
                              {q.label}
                              {q.required && <span className="text-red-500 ml-0.5">*</span>}
                            </label>
                            <PreviewQuestionInput q={q} />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-6 flex-1 flex items-center justify-center gap-2 bg-slate-100 text-slate-400 text-[18px] font-medium rounded-lg py-3 cursor-not-allowed">
                Submit (disabled in preview)
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
