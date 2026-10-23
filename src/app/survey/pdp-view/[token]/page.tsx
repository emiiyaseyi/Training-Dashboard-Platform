'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Loader2, AlertTriangle } from 'lucide-react'
import type { PDPQuestion } from '@/components/pdp/PDPSectionRenderer'

interface Section { id: string; key: string; title: string; description: string | null; maxRepeats: number; questions: PDPQuestion[] }
interface Answers { answers: Record<string, string | string[]>; developmentNeeds: Record<string, string | string[]>[] }

interface Context {
  valid: boolean
  cycleTitle: string
  staffName: string
  managerName: string | null
  sections: Section[]
  answers: Answers
}

function renderValue(v: string | string[] | undefined): string {
  return v == null ? '-' : Array.isArray(v) ? (v.join(', ') || '-') : v
}

// Read-only — the link sent once a line manager finalizes a plan (either track), so the employee
// has somewhere to see exactly what was agreed without needing to keep the completion email
// forever. Never editable: there is no form here, just the finalized Q&A.
export default function PDPViewPage() {
  const { token } = useParams<{ token: string }>()
  const [ctx, setCtx] = useState<Context | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/pdp/view/${token}`)
      .then((r) => r.json())
      .then((data: Context & { error?: string }) => {
        if (data.error) { setError(data.error); return }
        setCtx(data)
      })
      .catch(() => setError('Could not load this plan.'))
      .finally(() => setLoading(false))
  }, [token])

  if (loading) return <div className="flex items-center justify-center min-h-screen"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>

  if (error || !ctx) return (
    <div className="flex items-center justify-center min-h-screen p-6">
      <div className="max-w-md text-center">
        <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-3" />
        <p className="text-[15px] text-slate-600">{error || 'This link is invalid.'}</p>
      </div>
    </div>
  )

  const needsSection = ctx.sections.find((s) => s.key === 'development_needs')
  const otherSections = ctx.sections.filter((s) => s.key !== 'development_needs')

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="mb-4">
          <h1 className="text-[23px] font-bold text-slate-900">{ctx.cycleTitle}: Finalized Plan</h1>
          <p className="text-[15px] text-slate-500 mt-0.5">
            {ctx.staffName}{ctx.managerName ? ` · Reviewed by ${ctx.managerName}` : ''}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-5">
          {otherSections.map((s) => (
            <div key={s.id}>
              <p className="text-[15px] font-semibold text-slate-700 mb-2">{s.title}</p>
              <div className="space-y-1">
                {s.questions.map((q) => (
                  <p key={q.id} className="text-[14px] text-slate-600"><span className="text-slate-400">{q.label}:</span> {renderValue(ctx.answers.answers[q.id])}</p>
                ))}
              </div>
            </div>
          ))}
          {needsSection && ctx.answers.developmentNeeds.map((need, i) => (
            <div key={i}>
              <p className="text-[15px] font-semibold text-slate-700 mb-2">Development Need {i + 1}</p>
              <div className="space-y-1">
                {needsSection.questions.map((q) => (
                  <p key={q.id} className="text-[14px] text-slate-600"><span className="text-slate-400">{q.label}:</span> {renderValue(need[q.id])}</p>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
