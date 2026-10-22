'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { Loader2, CheckCircle2, AlertTriangle, ChevronLeft, ChevronRight, Plus, Trash2, Search, X } from 'lucide-react'
import { PDPQuestionFields, type PDPQuestion, type PDPQuestionAnswers } from '@/components/pdp/PDPQuestionFields'

interface PDPCapabilityPrefill { name: string; covered: boolean }
interface PrefillSnapshot { businessUnit: string; department: string | null; role: string | null; capabilities: PDPCapabilityPrefill[]; recentFeedback: string[] }
type Priority = 'high' | 'medium' | 'low' | 'not-needed'
interface CapabilityAnswer { priority: Priority; action: string }
interface CustomEntry { label: string; priority: Priority; action: string }
interface Answers { capabilities: Record<string, CapabilityAnswer>; customEntries: CustomEntry[]; questionAnswers: PDPQuestionAnswers }

interface TeamMember {
  id: string
  staffId: string
  staffName: string
  businessUnit: string | null
  role: string | null
  status: 'pending' | 'accepted' | 'declined' | 'added'
  prefill: PrefillSnapshot | null
  answers: Answers | null
  submitted: boolean
}

interface Context {
  valid: boolean
  disabled?: boolean
  disabledMessage?: string
  cycleTitle: string
  managerName: string
  rosterConfirmed: boolean
  alreadyResponded: boolean
  maxCapabilitiesPerPerson: number | null
  actionRequired: boolean
  priorityQuestionLabel: string | null
  actionQuestionLabel: string | null
  questions: PDPQuestion[]
  teamMembers: TeamMember[]
}

interface SearchHit { staffId: string; name: string; businessUnit: string | null; role: string | null }

const PRIORITY_OPTIONS: { value: Priority; label: string }[] = [
  { value: 'high', label: 'High priority' },
  { value: 'medium', label: 'Medium priority' },
  { value: 'low', label: 'Low priority' },
  { value: 'not-needed', label: 'Not needed right now' },
]

function emptyAnswers(prefill: PrefillSnapshot | null): Answers {
  const capabilities: Record<string, CapabilityAnswer> = {}
  for (const c of prefill?.capabilities || []) capabilities[c.name] = { priority: c.covered ? 'not-needed' : 'medium', action: '' }
  return { capabilities, customEntries: [], questionAnswers: {} }
}

export default function PDPManagerTeamPage() {
  const { token } = useParams<{ token: string }>()
  const [ctx, setCtx] = useState<Context | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Roster-review step state
  const [decided, setDecided] = useState<Record<string, 'accepted' | 'declined'>>({})
  const [addQuery, setAddQuery] = useState('')
  const [addResults, setAddResults] = useState<SearchHit[]>([])
  const [addedPending, setAddedPending] = useState<SearchHit[]>([])
  const [confirming, setConfirming] = useState(false)

  // Per-member fill step state
  const [memberIndex, setMemberIndex] = useState(0)
  const [capPage, setCapPage] = useState(0)
  const [draft, setDraft] = useState<Answers | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [allDone, setAllDone] = useState(false)

  const load = () => {
    fetch(`/api/pdp/manager/${token}`)
      .then((r) => r.json())
      .then((data: Context & { error?: string }) => {
        if (data.error) { setError(data.error); return }
        setCtx(data)
      })
      .catch(() => setError('Could not load your team.'))
      .finally(() => setLoading(false))
  }
  useEffect(load, [token])

  useEffect(() => {
    const q = addQuery.trim()
    if (q.length < 2) { setAddResults([]); return }
    const t = setTimeout(() => {
      fetch(`/api/pdp/manager/${token}/search?q=${encodeURIComponent(q)}`).then((r) => r.json()).then(setAddResults).catch(() => setAddResults([]))
    }, 250)
    return () => clearTimeout(t)
  }, [addQuery, token])

  const activeMembers = useMemo(() => (ctx?.teamMembers || []).filter((m) => m.status === 'accepted' || m.status === 'added'), [ctx])
  const currentMember = activeMembers[memberIndex]

  useEffect(() => {
    if (currentMember) setDraft(currentMember.answers ?? emptyAnswers(currentMember.prefill))
    setCapPage(0)
  }, [currentMember?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <div className="flex items-center justify-center min-h-screen"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>

  if (error || !ctx) return (
    <div className="flex items-center justify-center min-h-screen p-6">
      <div className="max-w-md text-center">
        <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-3" />
        <p className="text-sm text-slate-600">{error || 'This link is invalid.'}</p>
      </div>
    </div>
  )

  if (ctx.disabled) return (
    <div className="flex items-center justify-center min-h-screen p-6">
      <div className="max-w-md text-center">
        <AlertTriangle className="w-8 h-8 text-slate-400 mx-auto mb-3" />
        <p className="text-sm font-medium text-slate-800 mb-1">This link has been disabled</p>
        <p className="text-sm text-slate-600">{ctx.disabledMessage}</p>
      </div>
    </div>
  )

  if (ctx.alreadyResponded) return (
    <div className="flex items-center justify-center min-h-screen p-6">
      <div className="max-w-md text-center">
        <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-3" />
        <p className="text-sm font-medium text-slate-800">You&apos;ve completed Development Plans for your whole team. Thank you.</p>
      </div>
    </div>
  )

  // ── Step 1: roster review ──────────────────────────────────────────────
  if (!ctx.rosterConfirmed) {
    const pending = ctx.teamMembers.filter((m) => m.status === 'pending')

    const acceptAll = () => {
      const next: Record<string, 'accepted' | 'declined'> = {}
      for (const m of pending) next[m.id] = 'accepted'
      setDecided(next)
    }
    const toggleDecline = (id: string) => setDecided((prev) => ({ ...prev, [id]: prev[id] === 'declined' ? 'accepted' : 'declined' }))
    const addPerson = (hit: SearchHit) => {
      if (addedPending.some((p) => p.staffId === hit.staffId)) return
      setAddedPending((prev) => [...prev, hit])
      setAddQuery('')
      setAddResults([])
    }
    const removeAddedPending = (staffId: string) => setAddedPending((prev) => prev.filter((p) => p.staffId !== staffId))

    const confirmRoster = async () => {
      setConfirming(true)
      try {
        const accept = pending.filter((m) => (decided[m.id] ?? 'accepted') === 'accepted').map((m) => m.id)
        const decline = pending.filter((m) => decided[m.id] === 'declined').map((m) => m.id)
        const add = addedPending.map((p) => p.staffId)
        const res = await fetch(`/api/pdp/manager/${token}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accept, decline, add }),
        })
        if (res.ok) {
          setLoading(true)
          load()
        }
      } finally {
        setConfirming(false)
      }
    }

    return (
      <div className="min-h-screen bg-slate-50 py-8 px-4">
        <div className="max-w-xl mx-auto">
          <h1 className="text-lg font-bold text-slate-900">{ctx.cycleTitle}</h1>
          <p className="text-sm text-slate-500 mt-0.5 mb-5">
            Hi {ctx.managerName.split(' ')[0]} — please confirm your team before filling in each person&apos;s Development Plan.
            Decline anyone who shouldn&apos;t be here, or add someone missing. You&apos;ll then fill one page per person.
          </p>

          <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-slate-800">Your team ({pending.length})</p>
              <button onClick={acceptAll} className="text-xs font-medium text-navy-700 hover:underline">Accept all</button>
            </div>
            {pending.length === 0 && <p className="text-xs text-slate-400">No one found reporting to you on the current roster — add people below.</p>}
            <div className="space-y-1.5">
              {pending.map((m) => {
                const isDeclined = decided[m.id] === 'declined'
                return (
                  <div key={m.id} className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border ${isDeclined ? 'border-slate-200 bg-slate-50 opacity-50' : 'border-slate-200'}`}>
                    <div>
                      <p className="text-sm text-slate-800">{m.staffName}</p>
                      <p className="text-[11px] text-slate-400">{m.staffId} · {m.businessUnit}{m.role ? ` · ${m.role}` : ''}</p>
                    </div>
                    <button onClick={() => toggleDecline(m.id)} className={`text-xs font-medium ${isDeclined ? 'text-navy-600' : 'text-red-500'} hover:underline shrink-0`}>
                      {isDeclined ? 'Re-add' : 'Decline'}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 mb-5">
            <p className="text-sm font-semibold text-slate-800 mb-2">Add someone missing</p>
            <div className="relative mb-2">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                value={addQuery}
                onChange={(e) => setAddQuery(e.target.value)}
                placeholder="Search by name or Staff ID…"
                className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
              {addResults.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {addResults.map((r) => (
                    <button key={r.staffId} onClick={() => addPerson(r)} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center justify-between gap-2">
                      <span>{r.name}</span>
                      <span className="text-xs text-slate-400">{r.staffId}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {addedPending.map((p) => (
                <span key={p.staffId} className="inline-flex items-center gap-1.5 text-xs bg-navy-50 text-navy-700 rounded-full pl-2.5 pr-1.5 py-1">
                  {p.name}
                  <button onClick={() => removeAddedPending(p.staffId)}><X className="w-3 h-3" /></button>
                </span>
              ))}
            </div>
          </div>

          <button
            onClick={confirmRoster}
            disabled={confirming}
            className="flex items-center gap-1.5 text-sm font-medium text-white bg-navy-600 rounded-lg px-4 py-2 hover:bg-navy-700 disabled:opacity-50"
          >
            {confirming && <Loader2 className="w-4 h-4 animate-spin" />}
            Confirm and Continue
          </button>
        </div>
      </div>
    )
  }

  // ── Step 2: per-member fill ─────────────────────────────────────────────
  if (activeMembers.length === 0 || allDone || activeMembers.every((m) => m.submitted)) return (
    <div className="flex items-center justify-center min-h-screen p-6">
      <div className="max-w-md text-center">
        <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-3" />
        <p className="text-sm font-medium text-slate-800">You&apos;ve completed Development Plans for your whole team. Thank you.</p>
      </div>
    </div>
  )

  if (!currentMember || !draft) return <div className="flex items-center justify-center min-h-screen"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>

  const capabilities = currentMember.prefill?.capabilities ?? []
  const hasQuestionsPage = ctx.questions.length > 0
  const totalPages = capabilities.length + 1 + (hasQuestionsPage ? 1 : 0)
  const isCustomPage = capPage === capabilities.length
  const isQuestionsPage = hasQuestionsPage && capPage === capabilities.length + 1
  const currentCap = isCustomPage || isQuestionsPage ? null : capabilities[capPage]
  const max = ctx.maxCapabilitiesPerPerson
  const selectedCount = Object.values(draft.capabilities).filter((c) => c.priority !== 'not-needed').length + draft.customEntries.length
  const overLimit = max != null && selectedCount > max
  const priorityLabel = ctx.priorityQuestionLabel || 'Priority for 2027'
  const actionLabel = ctx.actionQuestionLabel || 'Development action'
  const currentCapAnswer = currentCap ? draft.capabilities[currentCap.name] : undefined
  const actionMissing = !!currentCap && ctx.actionRequired && currentCapAnswer?.priority !== 'not-needed' && !currentCapAnswer?.action?.trim()

  const setCapabilityAnswer = (name: string, patch: Partial<CapabilityAnswer>) => {
    setDraft((prev) => prev && { ...prev, capabilities: { ...prev.capabilities, [name]: { ...prev.capabilities[name], ...patch } } })
  }
  const addCustomEntry = () => setDraft((prev) => prev && { ...prev, customEntries: [...prev.customEntries, { label: '', priority: 'medium', action: '' }] })
  const updateCustomEntry = (i: number, patch: Partial<CustomEntry>) => {
    setDraft((prev) => prev && { ...prev, customEntries: prev.customEntries.map((e, idx) => (idx === i ? { ...e, ...patch } : e)) })
  }
  const removeCustomEntry = (i: number) => setDraft((prev) => prev && { ...prev, customEntries: prev.customEntries.filter((_, idx) => idx !== i) })

  const saveAndNext = async () => {
    setSaving(true)
    setSaveError('')
    try {
      const res = await fetch(`/api/pdp/manager/${token}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryId: currentMember.id, answers: draft }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setSaveError(data.error || 'Failed to save.'); return }
      if (data.allDone) { setAllDone(true); return }
      setMemberIndex((i) => i + 1)
    } catch {
      setSaveError('Failed to save — network error.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-xl mx-auto">
        <p className="text-xs text-slate-400 mb-1">Team member {memberIndex + 1} of {activeMembers.length}</p>
        <h1 className="text-lg font-bold text-slate-900">{currentMember.staffName}</h1>
        <p className="text-sm text-slate-500 mb-4">{currentMember.role || 'Role not on file'} · {currentMember.businessUnit}</p>

        <div className="w-full bg-slate-200 rounded-full h-1.5 mb-1">
          <div className="bg-navy-600 h-1.5 rounded-full transition-all" style={{ width: `${((capPage + 1) / totalPages) * 100}%` }} />
        </div>
        {max != null && (
          <p className={`text-xs mb-3 ${overLimit ? 'text-red-600 font-medium' : 'text-slate-500'}`}>
            {selectedCount} / {max} capabilities/needs selected{overLimit ? ' — remove some before continuing' : ''}
          </p>
        )}

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          {currentCap && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-sm font-semibold text-slate-800">{currentCap.name}</h2>
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${currentCap.covered ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                  {currentCap.covered ? 'Training on file' : 'No training on file'}
                </span>
              </div>
              <label className="block text-[11px] text-slate-500 mb-1">{priorityLabel}</label>
              <select
                value={draft.capabilities[currentCap.name]?.priority ?? 'not-needed'}
                onChange={(e) => setCapabilityAnswer(currentCap.name, { priority: e.target.value as Priority })}
                className="w-full border border-slate-300 rounded-md px-2.5 py-2 text-sm mb-4"
              >
                {PRIORITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {draft.capabilities[currentCap.name]?.priority !== 'not-needed' && (
                <>
                  <label className="block text-[11px] text-slate-500 mb-1">{actionLabel}{ctx.actionRequired && <span className="text-red-500"> *</span>}</label>
                  <textarea
                    value={draft.capabilities[currentCap.name]?.action ?? ''}
                    onChange={(e) => setCapabilityAnswer(currentCap.name, { action: e.target.value })}
                    rows={3}
                    placeholder="Development action"
                    className="w-full border border-slate-300 rounded-md px-2.5 py-2 text-sm"
                  />
                </>
              )}
            </div>
          )}

          {isQuestionsPage && (
            <div>
              <h2 className="text-sm font-semibold text-slate-800 mb-4">A few more questions</h2>
              <PDPQuestionFields
                questions={ctx.questions}
                answers={draft.questionAnswers}
                onChange={(id, value) => setDraft((prev) => prev && { ...prev, questionAnswers: { ...prev.questionAnswers, [id]: value } })}
              />
            </div>
          )}

          {isCustomPage && (
            <div>
              <h2 className="text-sm font-semibold text-slate-800 mb-3">Anything not listed?</h2>
              {draft.customEntries.map((entry, i) => (
                <div key={i} className="border border-slate-200 rounded-lg p-3 mb-3">
                  <div className="flex items-center gap-2 mb-2">
                    <input
                      value={entry.label}
                      onChange={(e) => updateCustomEntry(i, { label: e.target.value })}
                      placeholder="Capability or need"
                      className="flex-1 border border-slate-300 rounded-md px-2.5 py-1.5 text-sm"
                    />
                    <button onClick={() => removeCustomEntry(i)} className="text-slate-400 hover:text-red-600 shrink-0"><Trash2 className="w-4 h-4" /></button>
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

        {actionMissing && <p className="text-xs text-red-600 mt-3">A development action is required before continuing.</p>}
        {saveError && <p className="text-xs text-red-600 mt-3">{saveError}</p>}

        <div className="flex items-center justify-between mt-4">
          <button
            onClick={() => setCapPage((p) => Math.max(0, p - 1))}
            disabled={capPage === 0}
            className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 disabled:opacity-30"
          >
            <ChevronLeft className="w-4 h-4" /> Back
          </button>
          {capPage < totalPages - 1 ? (
            <button
              onClick={() => setCapPage((p) => p + 1)}
              disabled={overLimit || actionMissing}
              className="flex items-center gap-1 text-sm font-medium text-white bg-navy-600 rounded-lg px-4 py-2 hover:bg-navy-700 disabled:opacity-50"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={saveAndNext}
              disabled={saving || overLimit}
              className="flex items-center gap-1.5 text-sm font-medium text-white bg-emerald-600 rounded-lg px-4 py-2 hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {memberIndex === activeMembers.length - 1 ? 'Finish' : 'Save & Next Person'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
