'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { Loader2, CheckCircle2, AlertTriangle, ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react'

interface PDPCapabilityPrefill {
  name: string
  covered: boolean
}
interface PrefillSnapshot {
  businessUnit: string
  department: string | null
  role: string | null
  capabilities: PDPCapabilityPrefill[]
  recentFeedback: string[]
}
type Priority = 'high' | 'medium' | 'low' | 'not-needed'
interface CapabilityAnswer { priority: Priority; action: string }
interface CustomEntry { label: string; priority: Priority; action: string }
interface Answers {
  capabilities: Record<string, CapabilityAnswer>
  customEntries: CustomEntry[]
}

interface Context {
  valid: boolean
  cycleTitle: string
  staffName: string
  alreadyResponded: boolean
  maxCapabilitiesPerPerson: number | null
  prefill: PrefillSnapshot
  answers: Answers | null
}

const PRIORITY_OPTIONS: { value: Priority; label: string }[] = [
  { value: 'high', label: 'High priority' },
  { value: 'medium', label: 'Medium priority' },
  { value: 'low', label: 'Low priority' },
  { value: 'not-needed', label: "Not needed right now" },
]

function emptyAnswers(prefill: PrefillSnapshot): Answers {
  const capabilities: Record<string, CapabilityAnswer> = {}
  for (const c of prefill.capabilities) capabilities[c.name] = { priority: c.covered ? 'not-needed' : 'medium', action: '' }
  return { capabilities, customEntries: [] }
}

export default function PDPStaffSurveyPage() {
  const { token } = useParams<{ token: string }>()
  const [ctx, setCtx] = useState<Context | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [answers, setAnswers] = useState<Answers | null>(null)
  const [page, setPage] = useState(0) // 0..capabilities.length-1 = per-capability pages, last = custom-entries page
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    fetch(`/api/pdp/staff/${token}`)
      .then((r) => r.json())
      .then((data: Context & { error?: string }) => {
        if (data.error) { setError(data.error); return }
        setCtx(data)
        setAnswers(data.answers ?? emptyAnswers(data.prefill))
      })
      .catch(() => setError('Could not load this plan.'))
      .finally(() => setLoading(false))
  }, [token])

  const selectedCount = useMemo(() => {
    if (!answers) return 0
    const fromCapabilities = Object.values(answers.capabilities).filter((c) => c.priority !== 'not-needed').length
    return fromCapabilities + answers.customEntries.length
  }, [answers])

  const max = ctx?.maxCapabilitiesPerPerson ?? null
  const overLimit = max != null && selectedCount > max

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
    </div>
  )

  if (error || !ctx || !answers) return (
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
        <p className="text-sm font-medium text-slate-800">Thank you, {ctx.staffName.split(' ')[0]} — your Personal Development Plan has been submitted.</p>
        <p className="text-xs text-slate-500 mt-2">Your line manager will be asked to review it.</p>
      </div>
    </div>
  )

  const capabilities = ctx.prefill.capabilities
  const totalPages = capabilities.length + 1
  const isCustomPage = page === capabilities.length
  const current = isCustomPage ? null : capabilities[page]

  const setCapabilityAnswer = (name: string, patch: Partial<CapabilityAnswer>) => {
    setAnswers((prev) => prev && { ...prev, capabilities: { ...prev.capabilities, [name]: { ...prev.capabilities[name], ...patch } } })
  }
  const addCustomEntry = () => {
    setAnswers((prev) => prev && { ...prev, customEntries: [...prev.customEntries, { label: '', priority: 'medium', action: '' }] })
  }
  const updateCustomEntry = (i: number, patch: Partial<CustomEntry>) => {
    setAnswers((prev) => prev && { ...prev, customEntries: prev.customEntries.map((e, idx) => (idx === i ? { ...e, ...patch } : e)) })
  }
  const removeCustomEntry = (i: number) => {
    setAnswers((prev) => prev && { ...prev, customEntries: prev.customEntries.filter((_, idx) => idx !== i) })
  }

  const submit = async () => {
    setSubmitting(true)
    setSubmitError('')
    try {
      const res = await fetch(`/api/pdp/staff/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(answers),
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
      <div className="max-w-xl mx-auto">
        <div className="mb-4">
          <h1 className="text-lg font-bold text-slate-900">{ctx.cycleTitle}</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {ctx.staffName} · {ctx.prefill.role || 'Role not on file'} · {ctx.prefill.businessUnit}
            {ctx.prefill.department ? ` · ${ctx.prefill.department}` : ''}
          </p>
        </div>

        <div className="w-full bg-slate-200 rounded-full h-1.5 mb-1">
          <div className="bg-navy-600 h-1.5 rounded-full transition-all" style={{ width: `${((page + 1) / totalPages) * 100}%` }} />
        </div>
        <p className="text-[11px] text-slate-400 mb-4">Page {page + 1} of {totalPages}</p>

        {max != null && (
          <p className={`text-xs mb-3 ${overLimit ? 'text-red-600 font-medium' : 'text-slate-500'}`}>
            {selectedCount} / {max} capabilities/needs selected{overLimit ? ' — remove some before continuing' : ''}
          </p>
        )}

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          {current && (
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-sm font-semibold text-slate-800">{current.name}</h2>
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${current.covered ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                  {current.covered ? 'You have training on file for this' : 'No training on file for this yet'}
                </span>
              </div>
              <p className="text-xs text-slate-500 mb-4">Based on your training history so far — edit if it doesn&apos;t reflect where you actually are.</p>

              <label className="block text-xs font-medium text-slate-600 mb-1.5">How much of a priority is this for 2027?</label>
              <select
                value={answers.capabilities[current.name]?.priority ?? 'not-needed'}
                onChange={(e) => setCapabilityAnswer(current.name, { priority: e.target.value as Priority })}
                className="w-full border border-slate-300 rounded-md px-2.5 py-2 text-sm mb-4"
              >
                {PRIORITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>

              {answers.capabilities[current.name]?.priority !== 'not-needed' && (
                <>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">What development action would help here?</label>
                  <textarea
                    value={answers.capabilities[current.name]?.action ?? ''}
                    onChange={(e) => setCapabilityAnswer(current.name, { action: e.target.value })}
                    rows={3}
                    placeholder="e.g. a specific course, certification, mentoring, stretch assignment..."
                    className="w-full border border-slate-300 rounded-md px-2.5 py-2 text-sm"
                  />
                </>
              )}
            </div>
          )}

          {isCustomPage && (
            <div>
              <h2 className="text-sm font-semibold text-slate-800 mb-1">Anything not listed?</h2>
              <p className="text-xs text-slate-500 mb-4">Add a capability or development need that wasn&apos;t in the list above.</p>

              {ctx.prefill.recentFeedback.length > 0 && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-4">
                  <p className="text-[11px] font-medium text-slate-500 mb-1.5">From your previous training feedback</p>
                  {ctx.prefill.recentFeedback.map((f, i) => (
                    <p key={i} className="text-xs text-slate-600 italic mb-1 last:mb-0">&ldquo;{f}&rdquo;</p>
                  ))}
                </div>
              )}

              {answers.customEntries.map((entry, i) => (
                <div key={i} className="border border-slate-200 rounded-lg p-3 mb-3">
                  <div className="flex items-center gap-2 mb-2">
                    <input
                      value={entry.label}
                      onChange={(e) => updateCustomEntry(i, { label: e.target.value })}
                      placeholder="Capability or need"
                      className="flex-1 border border-slate-300 rounded-md px-2.5 py-1.5 text-sm"
                    />
                    <button onClick={() => removeCustomEntry(i)} className="text-slate-400 hover:text-red-600 shrink-0">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <select
                    value={entry.priority}
                    onChange={(e) => updateCustomEntry(i, { priority: e.target.value as Priority })}
                    className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm mb-2"
                  >
                    {PRIORITY_OPTIONS.filter((o) => o.value !== 'not-needed').map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <textarea
                    value={entry.action}
                    onChange={(e) => updateCustomEntry(i, { action: e.target.value })}
                    rows={2}
                    placeholder="Development action"
                    className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm"
                  />
                </div>
              ))}
              <button onClick={addCustomEntry} className="flex items-center gap-1.5 text-xs font-medium text-navy-700 hover:underline">
                <Plus className="w-3.5 h-3.5" /> Add another
              </button>
            </div>
          )}
        </div>

        {submitError && <p className="text-xs text-red-600 mt-3">{submitError}</p>}

        <div className="flex items-center justify-between mt-4">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 disabled:opacity-30"
          >
            <ChevronLeft className="w-4 h-4" /> Back
          </button>
          {page < totalPages - 1 ? (
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={overLimit}
              className="flex items-center gap-1 text-sm font-medium text-white bg-navy-600 rounded-lg px-4 py-2 hover:bg-navy-700 disabled:opacity-50"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={submitting || overLimit}
              className="flex items-center gap-1.5 text-sm font-medium text-white bg-emerald-600 rounded-lg px-4 py-2 hover:bg-emerald-700 disabled:opacity-50"
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
