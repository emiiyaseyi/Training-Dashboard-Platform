'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { Loader2, CheckCircle2, AlertTriangle, ChevronLeft, ChevronRight, Plus, Trash2, Search, X } from 'lucide-react'
import { PDPSectionRenderer, type PDPQuestion } from '@/components/pdp/PDPSectionRenderer'
import { PDPIntroPage } from '@/components/pdp/PDPIntroPage'
import { firstPageIssue } from '@/lib/pdp-validate'

interface PrefillSnapshot {
  businessUnit: string
  department: string | null
  role: string | null
  capabilities: { name: string; covered: boolean }[]
  recentFeedback: string[]
  trainingHistory2026: { trainingName: string; capability: string | null; month: string }[]
}
interface Section { id: string; key: string; title: string; description: string | null; maxRepeats: number; questions: PDPQuestion[] }
interface Answers { answers: Record<string, string | string[]>; developmentNeeds: Record<string, string | string[]>[] }

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
  sections: Section[]
  teamMembers: TeamMember[]
}

interface SearchHit { staffId: string; name: string; businessUnit: string | null; role: string | null }

type PageDescriptor = { type: 'intro' } | { type: 'section'; section: Section } | { type: 'need'; section: Section; index: number }

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
  const [page, setPage] = useState(0)
  const [form, setForm] = useState<Answers | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [allDone, setAllDone] = useState(false)
  const [pageError, setPageError] = useState('')

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
    if (currentMember) setForm(currentMember.answers ?? { answers: {}, developmentNeeds: [{}] })
    setPage(0)
    setPageError('')
  }, [currentMember?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Draft autosave for the team member currently open, debounced — so a manager working through a
  // large team can close the tab mid-person and resume exactly where they left off (the effect
  // above already seeds `form` from the saved draft when a member's page loads).
  useEffect(() => {
    if (!currentMember || !form || currentMember.submitted) return
    const timeout = setTimeout(() => {
      fetch(`/api/pdp/manager/${token}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryId: currentMember.id, answers: form, draft: true }),
      }).catch(() => {})
    }, 1200)
    return () => clearTimeout(timeout)
  }, [form, currentMember, token])

  const pages: PageDescriptor[] = useMemo(() => {
    if (!ctx || !form) return []
    const out: PageDescriptor[] = [{ type: 'intro' }]
    for (const section of ctx.sections) {
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

  if (!currentMember || !form) return <div className="flex items-center justify-center min-h-screen"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>

  const current = pages[page]
  const needsSection = ctx.sections.find((s) => s.key === 'development_needs')
  const confirmationSection = ctx.sections.find((s) => s.key === 'confirmation')
  const confirmationQuestion = confirmationSection?.questions.find((q) => q.type === 'yesno')
  const confirmationBlocked = !!confirmationQuestion && form.answers[confirmationQuestion.id] === 'No'

  const setAnswer = (questionId: string, value: string | string[]) => {
    setForm((prev) => prev && { ...prev, answers: { ...prev.answers, [questionId]: value } })
  }
  const setNeedAnswer = (index: number, questionId: string, value: string | string[]) => {
    setForm((prev) => prev && { ...prev, developmentNeeds: prev.developmentNeeds.map((n, i) => (i === index ? { ...n, [questionId]: value } : n)) })
  }
  const addNeed = () => setForm((prev) => prev && { ...prev, developmentNeeds: [...prev.developmentNeeds, {}] })
  const removeNeed = (index: number) => {
    setForm((prev) => prev && { ...prev, developmentNeeds: prev.developmentNeeds.filter((_, i) => i !== index) })
    setPage((p) => Math.max(0, p - 1))
  }

  const checkCurrentPage = (): boolean => {
    if (!current || current.type === 'intro') { setPageError(''); return true }
    const values = current.type === 'need' ? (form.developmentNeeds[current.index] || {}) : form.answers
    const issue = firstPageIssue(current.section.questions, values)
    setPageError(issue || '')
    return !issue
  }

  const goNext = () => {
    if (!checkCurrentPage()) return
    setPage((p) => p + 1)
  }

  const saveAndNext = async () => {
    if (confirmationBlocked) { setPageError('The confirmation question is set to "No" — update the plan, or set it to "Yes" once it\'s ready, before submitting this person.'); return }
    if (!checkCurrentPage()) return
    setSaving(true)
    setSaveError('')
    try {
      const res = await fetch(`/api/pdp/manager/${token}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryId: currentMember.id, answers: form }),
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

        <div className="w-full bg-slate-200 rounded-full h-1.5 mb-1 mt-3">
          <div className="bg-navy-600 h-1.5 rounded-full transition-all" style={{ width: `${((page + 1) / pages.length) * 100}%` }} />
        </div>
        <p className="text-[11px] text-slate-400 mb-4">Page {page + 1} of {pages.length}</p>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          {current?.type === 'intro' && (
            <PDPIntroPage
              staffName={currentMember.staffName}
              staffId={currentMember.staffId}
              businessUnit={currentMember.prefill?.businessUnit || currentMember.businessUnit || ''}
              department={currentMember.prefill?.department ?? null}
              role={currentMember.prefill?.role ?? currentMember.role}
              trainingHistory2026={currentMember.prefill?.trainingHistory2026 || []}
            />
          )}

          {current?.type === 'section' && (
            <div>
              <h2 className="text-sm font-semibold text-slate-800 mb-1">{current.section.title}</h2>
              {current.section.description && <p className="text-xs text-slate-500 mb-4">{current.section.description}</p>}
              <PDPSectionRenderer questions={current.section.questions} values={form.answers} onChange={setAnswer} />
            </div>
          )}

          {current?.type === 'need' && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-sm font-semibold text-slate-800">Development Need {current.index + 1}</h2>
                {form.developmentNeeds.length > 1 && (
                  <button onClick={() => removeNeed(current.index)} className="text-xs text-slate-400 hover:text-red-600 flex items-center gap-1">
                    <Trash2 className="w-3.5 h-3.5" /> Remove
                  </button>
                )}
              </div>
              {current.section.description && <p className="text-xs text-slate-500 mb-4">{current.section.description}</p>}
              <PDPSectionRenderer
                questions={current.section.questions}
                values={form.developmentNeeds[current.index] || {}}
                onChange={(qId, v) => setNeedAnswer(current.index, qId, v)}
              />
              {current.index === form.developmentNeeds.length - 1 && form.developmentNeeds.length < (needsSection?.maxRepeats ?? 1) && (
                <button onClick={addNeed} className="flex items-center gap-1.5 text-xs font-medium text-navy-700 hover:underline mt-4">
                  <Plus className="w-3.5 h-3.5" /> Add another Development Need
                </button>
              )}
            </div>
          )}
        </div>

        {pageError && <p className="text-xs text-red-600 mt-3">{pageError}</p>}
        {saveError && <p className="text-xs text-red-600 mt-3">{saveError}</p>}

        <div className="flex items-center justify-between mt-4">
          <button
            onClick={() => { setPageError(''); setPage((p) => Math.max(0, p - 1)) }}
            disabled={page === 0}
            className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 disabled:opacity-30"
          >
            <ChevronLeft className="w-4 h-4" /> Back
          </button>
          {page < pages.length - 1 ? (
            <button
              onClick={goNext}
              className="flex items-center gap-1 text-sm font-medium text-white bg-navy-600 rounded-lg px-4 py-2 hover:bg-navy-700"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={saveAndNext}
              disabled={saving || confirmationBlocked}
              title={confirmationBlocked ? 'Select "Yes" on the confirmation question to continue' : undefined}
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
