'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { BookOpen, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'

const STAGE_LABELS: Record<string, string> = {
  pre: 'Pre-Training Survey',
  post1: 'Post-Training Survey',
  post2: 'Manager Post-Training Impact Review',
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
}

export default function SurveyPage() {
  const params = useParams<{ token: string; stage: string }>()
  const [context, setContext] = useState<SurveyContext | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

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

  const label = STAGE_LABELS[params.stage as string] || 'Survey'

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-navy-700 px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-lg bg-gold-400 flex items-center justify-center mb-4">
            <BookOpen className="w-6 h-6 text-navy-800" />
          </div>
          <p className="text-white font-semibold text-lg">Learning Intelligence</p>
          <p className="text-slate-400 text-sm">{label}</p>
        </div>

        <div className="bg-white rounded-xl shadow-xl p-6">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-navy-600" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center text-center py-6">
              <AlertTriangle className="w-8 h-8 text-red-500 mb-3" />
              <p className="text-sm font-medium text-slate-800">{error}</p>
              <p className="text-xs text-slate-500 mt-1">If you think this is a mistake, contact your L&amp;D team.</p>
            </div>
          ) : context?.alreadyResponded ? (
            <div className="flex flex-col items-center text-center py-6">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 mb-3" />
              <p className="text-sm font-medium text-slate-800">You&apos;ve already submitted this survey — thank you!</p>
              <p className="text-xs text-slate-500 mt-1">{context.trainingName}</p>
            </div>
          ) : context ? (
            <div>
              <p className="text-sm text-slate-500">Hi {context.recipientName || 'there'},</p>
              <p className="text-base font-semibold text-slate-800 mt-1">{context.trainingName}</p>
              <p className="text-xs text-slate-400 mt-0.5">{context.businessUnit}</p>
              <div className="mt-6 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
                <p className="text-sm text-slate-500">This survey&apos;s questions are being finalized — check back shortly.</p>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
