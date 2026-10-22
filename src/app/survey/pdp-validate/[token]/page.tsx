'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Loader2, CheckCircle2, AlertTriangle, Plus, Trash2 } from 'lucide-react'

interface PDPCapabilityPrefill { name: string; covered: boolean }
interface PrefillSnapshot { businessUnit: string; department: string | null; role: string | null; capabilities: PDPCapabilityPrefill[]; recentFeedback: string[] }
type Priority = 'high' | 'medium' | 'low' | 'not-needed'
interface CapabilityAnswer { priority: Priority; action: string }
interface CustomEntry { label: string; priority: Priority; action: string }
interface Answers { capabilities: Record<string, CapabilityAnswer>; customEntries: CustomEntry[] }

interface Context {
  valid: boolean
  cycleTitle: string
  staffName: string
  managerName: string | null
  alreadyResponded: boolean
  staffNotYetSubmitted: boolean
  prefill: PrefillSnapshot
  answers: Answers | null
}

const PRIORITY_OPTIONS: { value: Priority; label: string }[] = [
  { value: 'high', label: 'High priority' },
  { value: 'medium', label: 'Medium priority' },
  { value: 'low', label: 'Low priority' },
  { value: 'not-needed', label: 'Not needed right now' },
]

export default function PDPManagerValidatePage() {
  const { token } = useParams<{ token: string }>()
  const [ctx, setCtx] = useState<Context | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [answers, setAnswers] = useState<Answers | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    fetch(`/api/pdp/validate/${token}`)
      .then((r) => r.json())
      .then((data: Context & { error?: string }) => {
        if (data.error) { setError(data.error); return }
        setCtx(data)
        setAnswers(data.answers ?? { capabilities: {}, customEntries: [] })
      })
      .catch(() => setError('Could not load this review.'))
      .finally(() => setLoading(false))
  }, [token])

  if (loading) return <div className="flex items-center justify-center min-h-screen"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>

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
        <p className="text-sm font-medium text-slate-800">Thank you — your review of {ctx.staffName}&apos;s Development Plan has been recorded.</p>
      </div>
    </div>
  )

  if (ctx.staffNotYetSubmitted) return (
    <div className="flex items-center justify-center min-h-screen p-6">
      <div className="max-w-md text-center">
        <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-3" />
        <p className="text-sm text-slate-600">{ctx.staffName} hasn&apos;t submitted their plan yet — check back once they have.</p>
      </div>
    </div>
  )

  const setCapabilityAnswer = (name: string, patch: Partial<CapabilityAnswer>) => {
    setAnswers((prev) => prev && { ...prev, capabilities: { ...prev.capabilities, [name]: { ...prev.capabilities[name], ...patch } } })
  }
  const addCustomEntry = () => setAnswers((prev) => prev && { ...prev, customEntries: [...prev.customEntries, { label: '', priority: 'medium', action: '' }] })
  const updateCustomEntry = (i: number, patch: Partial<CustomEntry>) => {
    setAnswers((prev) => prev && { ...prev, customEntries: prev.customEntries.map((e, idx) => (idx === i ? { ...e, ...patch } : e)) })
  }
  const removeCustomEntry = (i: number) => setAnswers((prev) => prev && { ...prev, customEntries: prev.customEntries.filter((_, idx) => idx !== i) })

  const submit = async () => {
    setSubmitting(true)
    setSubmitError('')
    try {
      const res = await fetch(`/api/pdp/validate/${token}`, {
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
      <div className="max-w-2xl mx-auto">
        <div className="mb-4">
          <h1 className="text-lg font-bold text-slate-900">{ctx.cycleTitle} — Review</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {ctx.staffName} · {ctx.prefill.role || 'Role not on file'} · {ctx.prefill.businessUnit}
          </p>
          <p className="text-xs text-slate-400 mt-1">Edit anything below before confirming — this is your own copy, separate from what {ctx.staffName.split(' ')[0]} submitted.</p>
        </div>

        <div className="space-y-3">
          {ctx.prefill.capabilities.map((c) => (
            <div key={c.name} className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <h2 className="text-sm font-semibold text-slate-800">{c.name}</h2>
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${c.covered ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                  {c.covered ? 'Training on file' : 'No training on file'}
                </span>
              </div>
              <select
                value={answers.capabilities[c.name]?.priority ?? 'not-needed'}
                onChange={(e) => setCapabilityAnswer(c.name, { priority: e.target.value as Priority })}
                className="w-full border border-slate-300 rounded-md px-2.5 py-2 text-sm mb-2"
              >
                {PRIORITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {answers.capabilities[c.name]?.priority !== 'not-needed' && (
                <textarea
                  value={answers.capabilities[c.name]?.action ?? ''}
                  onChange={(e) => setCapabilityAnswer(c.name, { action: e.target.value })}
                  rows={2}
                  placeholder="Development action"
                  className="w-full border border-slate-300 rounded-md px-2.5 py-2 text-sm"
                />
              )}
            </div>
          ))}

          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <h2 className="text-sm font-semibold text-slate-800 mb-2">Anything not listed?</h2>
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
        </div>

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
