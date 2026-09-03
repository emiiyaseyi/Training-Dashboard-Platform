'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  ClipboardList, Loader2, Plus, ChevronDown, ChevronUp, Trash2, Send, Search, X, PenLine, Rocket, Ban, Eye, BarChart3,
} from 'lucide-react'
import { BarChart } from '@/components/charts/BarChart'

type QuestionType = 'text' | 'textarea' | 'select' | 'multiselect' | 'rating' | 'date' | 'yesno' | 'file' | 'ranking'
type AudienceType = 'all' | 'department' | 'role' | 'businessUnit' | 'selected'

interface Question {
  id: string
  order: number
  section: string | null
  label: string
  type: QuestionType
  options: string[] | null
  ratingMax: number
  required: boolean
  gatesSection: string | null
  skipSectionIfValues: string[] | null
}

interface Response {
  id: string
  answers: string
  submittedAt: string
}

interface Recipient {
  id: string
  staffId: string
  staffName: string
  email: string | null
  businessUnit: string | null
  sentAt: string | null
  respondedAt: string | null
  reminderAt: string | null
  responses: Response[]
}

interface SurveySummary {
  id: string
  title: string
  description: string | null
  audienceType: AudienceType
  audienceValue: string | null
  expiryDays: number
  status: 'draft' | 'launched' | 'closed'
  launchedAt: string | null
  closedAt: string | null
  questionCount: number
  recipientCount: number
  sentCount: number
  respondedCount: number
}

interface SurveyDetail extends SurveySummary {
  displayMode: 'single' | 'paginated'
  questions: Question[]
  recipients: Recipient[]
}

interface RosterStaff {
  staffId: string
  name: string
  email: string | null
  businessUnit: string
}

const TYPE_OPTIONS: QuestionType[] = ['text', 'textarea', 'select', 'multiselect', 'rating', 'date', 'yesno', 'file', 'ranking']

const AUDIENCE_LABELS: Record<AudienceType, string> = {
  all: 'All Staff',
  department: 'A Department',
  role: 'A Role',
  businessUnit: 'A Business Unit',
  selected: 'Selected Staff',
}

const emptyQuestionDraft = { section: '', label: '', type: 'text' as QuestionType, optionsText: '', ratingMax: 5, required: false }
const emptyBulkDraft = { section: '', type: 'select' as QuestionType, optionsText: '', labelsText: '', required: true }

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString()
}

function statusBadge(status: SurveySummary['status']) {
  const style = {
    draft: 'bg-slate-100 text-slate-600',
    launched: 'bg-emerald-50 text-emerald-700',
    closed: 'bg-amber-50 text-amber-700',
  }[status]
  return <span className={`text-[10px] font-medium rounded px-1.5 py-0.5 ${style}`}>{status}</span>
}

function QuestionForm({
  draft, onChange, onSave, onCancel, saving,
}: {
  draft: typeof emptyQuestionDraft
  onChange: (d: typeof emptyQuestionDraft) => void
  onSave: () => void
  onCancel: () => void
  saving: boolean
}) {
  const needsOptions = draft.type === 'select' || draft.type === 'multiselect' || draft.type === 'ranking'
  return (
    <div className="border border-dashed border-slate-300 rounded-lg p-3 space-y-2.5 bg-slate-50">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <input
          placeholder="Section (optional, groups questions on the form)"
          value={draft.section}
          onChange={(e) => onChange({ ...draft, section: e.target.value })}
          className="border border-slate-300 rounded-md px-2.5 py-1.5 text-xs"
        />
        <select
          value={draft.type}
          onChange={(e) => onChange({ ...draft, type: e.target.value as QuestionType })}
          className="border border-slate-300 rounded-md px-2.5 py-1.5 text-xs"
        >
          {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <textarea
        placeholder="Question label"
        value={draft.label}
        onChange={(e) => onChange({ ...draft, label: e.target.value })}
        rows={2}
        className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-xs"
      />
      {needsOptions && (
        <input
          placeholder="Options, comma-separated (e.g. Yes, No, Maybe)"
          value={draft.optionsText}
          onChange={(e) => onChange({ ...draft, optionsText: e.target.value })}
          className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-xs"
        />
      )}
      {draft.type === 'rating' && (
        <label className="block text-xs text-slate-600">
          Scale — respondent picks 1 to
          <select
            value={draft.ratingMax}
            onChange={(e) => onChange({ ...draft, ratingMax: Number(e.target.value) })}
            className="ml-2 border border-slate-300 rounded-md px-2 py-1 text-xs"
          >
            {[3, 4, 5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      )}
      <label className="flex items-center gap-1.5 text-xs text-slate-600">
        <input type="checkbox" checked={draft.required} onChange={(e) => onChange({ ...draft, required: e.target.checked })} />
        Required
      </label>
      <div className="flex items-center gap-2">
        <button
          onClick={onSave}
          disabled={saving || !draft.label.trim()}
          className="flex items-center gap-1.5 text-xs font-medium text-white bg-navy-600 rounded-lg px-3 py-1.5 hover:bg-navy-700 disabled:opacity-50"
        >
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Save
        </button>
        <button onClick={onCancel} className="text-xs text-slate-500 hover:text-slate-800 px-2 py-1.5">
          Cancel
        </button>
      </div>
    </div>
  )
}

// One row of shared type/options/section — pasted labels (one per line) each become their own
// question, all sharing that same shape. Built for exactly this: pasting a checklist of many
// skill/task rows that all use the same rating scale (e.g. "Proficient / Needs Practice / Not
// Yet Able / N/A"), instead of clicking "Add Question" dozens of times.
function BulkQuestionForm({
  draft, onChange, onSave, onCancel, saving,
}: {
  draft: typeof emptyBulkDraft
  onChange: (d: typeof emptyBulkDraft) => void
  onSave: () => void
  onCancel: () => void
  saving: boolean
}) {
  const needsOptions = draft.type === 'select' || draft.type === 'multiselect' || draft.type === 'ranking'
  const lineCount = draft.labelsText.split('\n').map((l) => l.trim()).filter(Boolean).length
  return (
    <div className="border border-dashed border-slate-300 rounded-lg p-3 space-y-2.5 bg-slate-50">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <input
          placeholder="Section applied to every row (e.g. Microsoft Excel)"
          value={draft.section}
          onChange={(e) => onChange({ ...draft, section: e.target.value })}
          className="border border-slate-300 rounded-md px-2.5 py-1.5 text-xs"
        />
        <select
          value={draft.type}
          onChange={(e) => onChange({ ...draft, type: e.target.value as QuestionType })}
          className="border border-slate-300 rounded-md px-2.5 py-1.5 text-xs"
        >
          {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      {needsOptions && (
        <input
          placeholder="Options applied to every row, comma-separated (e.g. Proficient, Needs Practice, Not Yet Able, N/A)"
          value={draft.optionsText}
          onChange={(e) => onChange({ ...draft, optionsText: e.target.value })}
          className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-xs"
        />
      )}
      <textarea
        placeholder="One question per line — each line becomes its own question, all sharing the section/type/options above"
        value={draft.labelsText}
        onChange={(e) => onChange({ ...draft, labelsText: e.target.value })}
        rows={8}
        className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-xs font-mono"
      />
      <label className="flex items-center gap-1.5 text-xs text-slate-600">
        <input type="checkbox" checked={draft.required} onChange={(e) => onChange({ ...draft, required: e.target.checked })} />
        Required
      </label>
      <div className="flex items-center gap-2">
        <button
          onClick={onSave}
          disabled={saving || lineCount === 0}
          className="flex items-center gap-1.5 text-xs font-medium text-white bg-navy-600 rounded-lg px-3 py-1.5 hover:bg-navy-700 disabled:opacity-50"
        >
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Add {lineCount || ''} Question{lineCount === 1 ? '' : 's'}
        </button>
        <button onClick={onCancel} className="text-xs text-slate-500 hover:text-slate-800 px-2 py-1.5">
          Cancel
        </button>
      </div>
    </div>
  )
}

function SurveyRow({ summary, roster, onChanged }: { summary: SurveySummary; roster: RosterStaff[]; onChanged: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const [detail, setDetail] = useState<SurveyDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  const [savingField, setSavingField] = useState(false)
  const [audienceOptions, setAudienceOptions] = useState<{ departments: string[]; roles: string[]; businessUnits: string[] } | null>(null)
  const [preview, setPreview] = useState<{ count: number; sample: string[]; missingEmail: number; missingEmailSample: string[] } | null>(null)
  const [previewing, setPreviewing] = useState(false)

  const [selectedPending, setSelectedPending] = useState<RosterStaff[]>([])
  const [selectedQuery, setSelectedQuery] = useState('')

  const [addingQuestion, setAddingQuestion] = useState(false)
  const [questionDraft, setQuestionDraft] = useState(emptyQuestionDraft)
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null)
  const [savingQuestion, setSavingQuestion] = useState(false)
  const [bulkAdding, setBulkAdding] = useState(false)
  const [bulkDraft, setBulkDraft] = useState(emptyBulkDraft)

  const [launching, setLaunching] = useState(false)
  const [closing, setClosing] = useState(false)
  const [resendingId, setResendingId] = useState<string | null>(null)
  const [addParticipantQuery, setAddParticipantQuery] = useState('')
  const [addingParticipant, setAddingParticipant] = useState(false)
  const [viewingResponse, setViewingResponse] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'responses' | 'insights'>('responses')
  const [insightsTool, setInsightsTool] = useState<string | null>(null)

  // Derived entirely from data loadDetail() already fetched (questions + every recipient's
  // response) — no separate endpoint needed.
  //
  // Two layers:
  //  - Generic (questionDistributions/allValues/respondentScores): a per-question answer
  //    distribution and a per-respondent raw tally, works for ANY select/multiselect/yesno/rating
  //    question set regardless of wording — the fallback view for a survey that isn't shaped like
  //    a skills audit.
  //  - Tool-shaped (toolInsights/priorityRanking): recognizes the specific 3-question pattern this
  //    skills-audit survey uses per section — a gate question (gatesSection set), a "can you
  //    already do" multiselect, and a "would help your role" multiselect (matched by label
  //    wording, since nothing in the schema marks a question as either of those two roles) — and
  //    turns them into the things an L&D team actually needs: who's Advanced/Novice per tool, a
  //    named "needs help" roster per tool (can-do vs would-help gap), which SPECIFIC skills are
  //    most commonly missing, and a weighted priority order from the closing ranking question.
  //    A section that doesn't match this pattern (no gate, or missing one of the two checklists)
  //    is silently skipped here — it still shows up in the generic layer above.
  const insights = useMemo(() => {
    if (!detail) return null
    const categorical = detail.questions.filter((q) => ['select', 'multiselect', 'yesno', 'rating'].includes(q.type))
    if (categorical.length === 0 && detail.questions.every((q) => q.type !== 'ranking')) return null

    const responded = detail.recipients
      .map((r) => ({ recipient: r, resp: r.responses[0] }))
      .filter((x): x is { recipient: Recipient; resp: Response } => !!x.resp)
      .map(({ recipient, resp }) => ({ recipient, answers: JSON.parse(resp.answers) as Record<string, string | string[]> }))

    const valuesOf = (v: string | string[] | undefined): string[] => (Array.isArray(v) ? v : v ? [v] : [])

    const questionDistributions = categorical.map((q) => {
      const counts = new Map<string, number>()
      for (const { answers } of responded) {
        for (const v of valuesOf(answers[q.id])) counts.set(v, (counts.get(v) || 0) + 1)
      }
      const order = q.options || []
      const values = [...counts.keys()].sort((a, b) => {
        const ai = order.indexOf(a), bi = order.indexOf(b)
        return ai !== -1 && bi !== -1 ? ai - bi : a.localeCompare(b)
      })
      return { question: q, values, counts: values.map((v) => counts.get(v) || 0) }
    })

    const allValues: string[] = []
    for (const { values } of questionDistributions) for (const v of values) if (!allValues.includes(v)) allValues.push(v)

    const respondentScores = responded.map(({ recipient, answers }) => {
      const tally: Record<string, number> = {}
      for (const q of categorical) for (const v of valuesOf(answers[q.id])) tally[v] = (tally[v] || 0) + 1
      return { recipient, tally }
    })

    // ── Priority ranking (from the "ranking" closing question, if present) ──
    // Normalized Borda-style score per item: a #1 pick contributes 100, a last-place pick
    // contributes close to 0, regardless of how many items that particular respondent ranked (so
    // someone who only had 2 relevant tools left to rank doesn't unfairly out-weight someone who
    // ranked 8) — averaged across everyone who included that item at all.
    const rankingQuestion = detail.questions.find((q) => q.type === 'ranking') || null
    const priorityScoreByItem = new Map<string, number>()
    const priorityVotesByItem = new Map<string, number>()
    if (rankingQuestion) {
      const sums = new Map<string, number>()
      for (const { answers } of responded) {
        const list = answers[rankingQuestion.id]
        if (!Array.isArray(list) || list.length === 0) continue
        list.forEach((item, i) => {
          const contribution = ((list.length - i) / list.length) * 100
          sums.set(item, (sums.get(item) || 0) + contribution)
          priorityVotesByItem.set(item, (priorityVotesByItem.get(item) || 0) + 1)
        })
      }
      for (const [item, sum] of sums) priorityScoreByItem.set(item, sum / (priorityVotesByItem.get(item) || 1))
    }
    const priorityRanking = [...priorityScoreByItem.entries()]
      .map(([item, score]) => ({ item, score, votes: priorityVotesByItem.get(item) || 0 }))
      .sort((a, b) => b.score - a.score)

    // ── Per-tool competency + gap analysis ──
    const bySection = new Map<string, Question[]>()
    for (const q of detail.questions) {
      const s = q.section || ''
      if (!bySection.has(s)) bySection.set(s, [])
      bySection.get(s)!.push(q)
    }

    type Level = 'advanced' | 'intermediate' | 'basic' | 'novice'
    const tierOf = (skill: string, ordered: string[]): number => {
      const idx = ordered.indexOf(skill)
      if (idx === -1) return 0
      return Math.min(2, Math.floor((idx / ordered.length) * 3))
    }
    const classify = (canDo: string[], ordered: string[]): Level => {
      if (canDo.length === 0) return 'novice'
      const maxTier = Math.max(...canDo.map((s) => tierOf(s, ordered)))
      return maxTier === 2 ? 'advanced' : maxTier === 1 ? 'intermediate' : 'basic'
    }

    const toolInsights = [...bySection.entries()]
      .filter(([section]) => section && section !== 'Wrap-Up')
      .map(([section, qs]) => {
        const gate = qs.find((q) => q.gatesSection === section) || null
        const canDoQ = qs.find((q) => q.type === 'multiselect' && /can you already do/i.test(q.label)) || null
        const needQ = qs.find((q) => q.type === 'multiselect' && /would help you most/i.test(q.label)) || null
        if (!canDoQ || !needQ) return null

        const ordered = canDoQ.options || []
        const levelPeople: Record<Level, { name: string; businessUnit: string | null }[]> = { advanced: [], intermediate: [], basic: [], novice: [] }
        const needsHelp: { name: string; businessUnit: string | null; missing: string[] }[] = []
        const skillGapCounts = new Map<string, number>()
        let applicable = 0
        let skipped = 0

        for (const { recipient, answers } of responded) {
          if (gate) {
            const gateAnswer = answers[gate.id]
            const gateVals = valuesOf(gateAnswer)
            const isSkipped = gate.skipSectionIfValues?.some((v) => gateVals.includes(v)) ?? false
            if (isSkipped) { skipped++; continue }
          }
          applicable++
          const canDo = valuesOf(answers[canDoQ.id])
          const need = valuesOf(answers[needQ.id])
          const level = classify(canDo, ordered)
          levelPeople[level].push({ name: recipient.staffName, businessUnit: recipient.businessUnit })
          const missing = need.filter((s) => !canDo.includes(s))
          if (missing.length > 0) {
            needsHelp.push({ name: recipient.staffName, businessUnit: recipient.businessUnit, missing })
            for (const skill of missing) skillGapCounts.set(skill, (skillGapCounts.get(skill) || 0) + 1)
          }
        }

        const priority = priorityScoreByItem.get(section)
        return {
          section,
          applicable,
          skipped,
          levelCounts: {
            advanced: levelPeople.advanced.length,
            intermediate: levelPeople.intermediate.length,
            basic: levelPeople.basic.length,
            novice: levelPeople.novice.length,
          },
          levelPeople,
          needsHelp,
          skillGaps: [...skillGapCounts.entries()].map(([skill, count]) => ({ skill, count })).sort((a, b) => b.count - a.count),
          priorityScore: priority !== undefined ? Math.round(priority) : null,
          priorityVotes: priorityVotesByItem.get(section) || 0,
        }
      })
      .filter((t): t is NonNullable<typeof t> => t !== null)
      .sort((a, b) => (b.priorityScore ?? -1) - (a.priorityScore ?? -1) || b.needsHelp.length - a.needsHelp.length)

    // ── Headline KPIs for the summary cards ──
    const totalNeedingHelp = new Set(toolInsights.flatMap((t) => t.needsHelp.map((p) => p.name))).size
    const topGapTool = [...toolInsights].sort((a, b) => b.needsHelp.length - a.needsHelp.length)[0] || null
    const topSkillGap = toolInsights
      .flatMap((t) => t.skillGaps.map((g) => ({ ...g, tool: t.section })))
      .sort((a, b) => b.count - a.count)[0] || null
    const topPriorityTool = priorityRanking[0] || null

    return {
      questionDistributions, allValues, respondentScores,
      toolInsights, priorityRanking, rankingQuestion,
      summary: { totalRespondents: responded.length, totalNeedingHelp, topGapTool, topSkillGap, topPriorityTool },
    }
  }, [detail])

  const loadDetail = async () => {
    setLoadingDetail(true)
    try {
      const res = await fetch(`/api/admin/custom-surveys/${summary.id}`)
      const data = await res.json()
      setDetail(data)
      if (data.audienceType === 'selected' && data.audienceValue) {
        const ids: string[] = JSON.parse(data.audienceValue)
        setSelectedPending(roster.filter((r) => ids.includes(r.staffId)))
      }
    } finally {
      setLoadingDetail(false)
    }
  }

  const toggle = () => {
    if (!expanded) {
      loadDetail()
      if (!audienceOptions) {
        fetch('/api/admin/custom-surveys/audience-options').then((r) => r.json()).then(setAudienceOptions)
      }
    }
    setExpanded(!expanded)
  }

  const patchSurvey = async (data: Record<string, unknown>) => {
    setSavingField(true)
    try {
      const res = await fetch(`/api/admin/custom-surveys/${summary.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
      })
      if (res.ok) {
        setDetail(await res.json().then((s) => ({ ...detail, ...s }) as SurveyDetail))
      } else {
        const err = await res.json().catch(() => ({}))
        alert(err.error || 'Failed to save.')
      }
    } finally {
      setSavingField(false)
    }
  }

  const runPreview = async () => {
    if (!detail) return
    setPreviewing(true)
    try {
      const audienceValue = detail.audienceType === 'selected' ? JSON.stringify(selectedPending.map((p) => p.staffId)) : detail.audienceValue
      const res = await fetch('/api/admin/custom-surveys/audience-preview', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audienceType: detail.audienceType, audienceValue }),
      })
      setPreview(await res.json())
    } finally {
      setPreviewing(false)
    }
  }

  const selectedSearchResults = useMemo(() => {
    const q = selectedQuery.trim().toLowerCase()
    if (!q) return []
    const pendingIds = new Set(selectedPending.map((p) => p.staffId))
    return roster.filter((r) => !pendingIds.has(r.staffId))
      .filter((r) => r.name.toLowerCase().includes(q) || r.staffId.toLowerCase().includes(q) || r.email?.toLowerCase().includes(q))
      .slice(0, 8)
  }, [selectedQuery, roster, selectedPending])

  const saveSelectedAudience = async (next: RosterStaff[]) => {
    setSelectedPending(next)
    await patchSurvey({ audienceValue: JSON.stringify(next.map((p) => p.staffId)) })
  }

  // Same search-by-name/email/Staff ID pattern as the draft-mode "Selected Staff" audience picker
  // above — the original audience is only ever resolved once at launch, so this is the one way to
  // bring in someone who was missed the first time (a new hire, a typo'd identifier, etc.).
  const addParticipantResults = useMemo(() => {
    const q = addParticipantQuery.trim().toLowerCase()
    if (!q || !detail) return []
    const existingIds = new Set(detail.recipients.map((r) => r.staffId))
    return roster.filter((r) => !existingIds.has(r.staffId))
      .filter((r) => r.name.toLowerCase().includes(q) || r.staffId.toLowerCase().includes(q) || r.email?.toLowerCase().includes(q))
      .slice(0, 8)
  }, [addParticipantQuery, roster, detail])

  const addParticipant = async (staff: RosterStaff) => {
    setAddingParticipant(true)
    try {
      const res = await fetch(`/api/admin/custom-surveys/${summary.id}/recipients`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifiers: [staff.staffId] }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(data.error || 'Failed to add participant.')
        return
      }
      setAddParticipantQuery('')
      await loadDetail()
      onChanged()
    } finally {
      setAddingParticipant(false)
    }
  }

  const startAddQuestion = () => { setAddingQuestion(true); setQuestionDraft(emptyQuestionDraft) }
  const startEditQuestion = (q: Question) => {
    setEditingQuestionId(q.id)
    setQuestionDraft({ section: q.section || '', label: q.label, type: q.type, optionsText: (q.options || []).join(', '), ratingMax: q.ratingMax || 5, required: q.required })
  }
  const toOptionsArray = (text: string) => text.split(',').map((o) => o.trim()).filter(Boolean)

  const saveQuestion = async () => {
    setSavingQuestion(true)
    try {
      const body = {
        section: questionDraft.section, label: questionDraft.label, type: questionDraft.type,
        options: toOptionsArray(questionDraft.optionsText), ratingMax: questionDraft.ratingMax, required: questionDraft.required,
      }
      const res = editingQuestionId
        ? await fetch(`/api/admin/custom-surveys/${summary.id}/questions/${editingQuestionId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        : await fetch(`/api/admin/custom-surveys/${summary.id}/questions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (res.ok) {
        setAddingQuestion(false)
        setEditingQuestionId(null)
        await loadDetail()
        onChanged()
      } else {
        const err = await res.json().catch(() => ({}))
        alert(err.error || 'Failed to save question.')
      }
    } finally {
      setSavingQuestion(false)
    }
  }

  const saveBulkQuestions = async () => {
    setSavingQuestion(true)
    try {
      const labels = bulkDraft.labelsText.split('\n').map((l) => l.trim()).filter(Boolean)
      const options = toOptionsArray(bulkDraft.optionsText)
      const questions = labels.map((label) => ({
        section: bulkDraft.section, label, type: bulkDraft.type, options, required: bulkDraft.required,
      }))
      const res = await fetch(`/api/admin/custom-surveys/${summary.id}/questions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ questions }),
      })
      if (res.ok) {
        const data = await res.json()
        setBulkAdding(false)
        setBulkDraft(emptyBulkDraft)
        await loadDetail()
        onChanged()
        if (data.errors?.length > 0) alert(`${data.questions.length} added. Some rows were skipped:\n${data.errors.join('\n')}`)
      } else {
        const err = await res.json().catch(() => ({}))
        alert(err.error || 'Failed to add questions.')
      }
    } finally {
      setSavingQuestion(false)
    }
  }

  const deleteQuestion = async (id: string) => {
    if (!confirm('Delete this question?')) return
    await fetch(`/api/admin/custom-surveys/${summary.id}/questions/${id}`, { method: 'DELETE' })
    await loadDetail()
    onChanged()
  }

  const deleteSurvey = async () => {
    if (!confirm(`Delete "${summary.title}"? This cannot be undone.`)) return
    await fetch(`/api/admin/custom-surveys/${summary.id}`, { method: 'DELETE' })
    onChanged()
  }

  const launch = async () => {
    if (!confirm(`Launch "${summary.title}"? This resolves the audience and sends the survey email immediately — it can't be undone.`)) return
    setLaunching(true)
    try {
      const res = await fetch(`/api/admin/custom-surveys/${summary.id}/launch`, { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        alert(`Launched — ${data.sent} email(s) sent to ${data.recipientCount} recipient(s).${data.skipped.length ? ` ${data.skipped.length} skipped (see recipient list).` : ''}`)
        await loadDetail()
        onChanged()
      } else {
        alert(data.error || 'Failed to launch.')
      }
    } finally {
      setLaunching(false)
    }
  }

  const closeSurvey = async () => {
    if (!confirm('Close this survey? No more reminders will be sent, but the form stays open for anyone with the link.')) return
    setClosing(true)
    try {
      await fetch(`/api/admin/custom-surveys/${summary.id}/close`, { method: 'POST' })
      await loadDetail()
      onChanged()
    } finally {
      setClosing(false)
    }
  }

  const resend = async (recipientId: string) => {
    setResendingId(recipientId)
    try {
      const res = await fetch(`/api/admin/custom-surveys/${summary.id}/resend`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recipientId }),
      })
      const data = await res.json()
      if (!res.ok) alert(data.error || 'Failed to resend.')
      await loadDetail()
    } finally {
      setResendingId(null)
    }
  }

  return (
    <div className="border border-slate-200 rounded-lg">
      <button onClick={toggle} className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-slate-800 truncate">{summary.title}</p>
            {statusBadge(summary.status)}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {AUDIENCE_LABELS[summary.audienceType]}{summary.audienceType !== 'all' && summary.audienceType !== 'selected' && summary.audienceValue ? `: ${summary.audienceValue}` : ''}
            {' · '}{summary.questionCount} question{summary.questionCount === 1 ? '' : 's'}
            {summary.status !== 'draft' && ` · ${summary.recipientCount} recipient${summary.recipientCount === 1 ? '' : 's'} · Sent: ${summary.sentCount} · Responded: ${summary.respondedCount}`}
          </p>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-slate-100 pt-3 space-y-4">
          {loadingDetail || !detail ? (
            <p className="text-xs text-slate-400">Loading…</p>
          ) : (
            <>
              <a
                href={`/survey/custom/preview/${summary.id}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-navy-600 border border-navy-200 rounded-lg px-3 py-1.5 hover:bg-navy-50 w-fit"
              >
                <Eye className="w-3.5 h-3.5" /> Preview Survey
              </a>
              {detail.status === 'draft' ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Title</label>
                      <input
                        value={detail.title}
                        onChange={(e) => setDetail({ ...detail, title: e.target.value })}
                        onBlur={(e) => patchSurvey({ title: e.target.value })}
                        className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Expiry — reminder days</label>
                      <input
                        type="number" min={1}
                        value={detail.expiryDays}
                        onChange={(e) => setDetail({ ...detail, expiryDays: Number(e.target.value) })}
                        onBlur={(e) => patchSurvey({ expiryDays: Number(e.target.value) })}
                        className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Layout</label>
                    <div className="flex items-center gap-2">
                      {(['single', 'paginated'] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => { setDetail({ ...detail, displayMode: mode }); patchSurvey({ displayMode: mode }) }}
                          className={`text-xs font-medium rounded-lg px-3 py-1.5 border ${
                            detail.displayMode === mode ? 'bg-navy-600 text-white border-navy-600' : 'text-slate-600 border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          {mode === 'single' ? 'One full page' : 'One section per page'}
                        </button>
                      ))}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      &quot;One section per page&quot; is needed for section-skipping (Skip section if… below) to actually skip a page, not just hide questions on it.
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Description (optional, shown to respondents)</label>
                    <textarea
                      value={detail.description || ''}
                      onChange={(e) => setDetail({ ...detail, description: e.target.value })}
                      onBlur={(e) => patchSurvey({ description: e.target.value })}
                      rows={2}
                      className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">Audience</label>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {(Object.keys(AUDIENCE_LABELS) as AudienceType[]).map((t) => (
                        <button
                          key={t}
                          onClick={() => { setDetail({ ...detail, audienceType: t, audienceValue: null }); patchSurvey({ audienceType: t, audienceValue: null }); setPreview(null) }}
                          className={`text-xs font-medium rounded-lg px-3 py-1.5 border ${detail.audienceType === t ? 'bg-navy-600 text-white border-navy-600' : 'text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                        >
                          {AUDIENCE_LABELS[t]}
                        </button>
                      ))}
                    </div>

                    {(detail.audienceType === 'department' || detail.audienceType === 'role' || detail.audienceType === 'businessUnit') && audienceOptions && (
                      <select
                        value={detail.audienceValue || ''}
                        onChange={(e) => { setDetail({ ...detail, audienceValue: e.target.value }); patchSurvey({ audienceValue: e.target.value }); setPreview(null) }}
                        className="border border-slate-300 rounded-md px-2.5 py-1.5 text-sm"
                      >
                        <option value="">Select…</option>
                        {(detail.audienceType === 'department' ? audienceOptions.departments : detail.audienceType === 'role' ? audienceOptions.roles : audienceOptions.businessUnits)
                          .map((v) => <option key={v} value={v}>{v}</option>)}
                      </select>
                    )}

                    {detail.audienceType === 'selected' && (
                      <div>
                        <div className="relative">
                          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                          <input
                            value={selectedQuery}
                            onChange={(e) => setSelectedQuery(e.target.value)}
                            placeholder="Search by name, email, or Staff ID…"
                            className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg text-sm"
                          />
                          {selectedSearchResults.length > 0 && (
                            <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                              {selectedSearchResults.map((r) => (
                                <button
                                  key={r.staffId}
                                  onClick={() => { saveSelectedAudience([...selectedPending, r]); setSelectedQuery(''); setPreview(null) }}
                                  className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex items-center justify-between gap-2"
                                >
                                  <span className="text-slate-700">{r.name}</span>
                                  <span className="text-slate-400">{r.staffId}{r.email ? ` · ${r.email}` : ''}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        {selectedPending.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {selectedPending.map((p) => (
                              <span key={p.staffId} className="flex items-center gap-1 text-xs bg-navy-50 text-navy-700 rounded-full pl-2.5 pr-1.5 py-1">
                                {p.name}
                                <button onClick={() => { saveSelectedAudience(selectedPending.filter((x) => x.staffId !== p.staffId)); setPreview(null) }} className="hover:text-red-600">
                                  <X className="w-3 h-3" />
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex items-center gap-2 mt-2">
                      <button onClick={runPreview} disabled={previewing} className="flex items-center gap-1.5 text-xs text-slate-500 border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50 disabled:opacity-50">
                        {previewing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
                        Preview Audience
                      </button>
                      {savingField && <span className="text-[11px] text-slate-400">Saving…</span>}
                    </div>
                    {preview && (
                      <div className="text-xs text-slate-500 mt-1.5 space-y-0.5">
                        <p>
                          {preview.count} staff would receive this survey
                          {preview.sample.length > 0 && ` (e.g. ${preview.sample.join(', ')}${preview.count > preview.sample.length ? ', …' : ''})`}.
                        </p>
                        {preview.missingEmail > 0 && (
                          <p className="text-amber-700">
                            {preview.missingEmail} have no email on file and will be skipped
                            {preview.missingEmailSample.length > 0 && `: ${preview.missingEmailSample.join(', ')}${preview.missingEmail > preview.missingEmailSample.length ? ', …' : ''}`}.
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  <div>
                    <p className="text-xs font-medium text-slate-600 mb-1.5">Questions</p>
                    <div className="space-y-2">
                      {detail.questions.map((q) => (
                        editingQuestionId === q.id ? (
                          <QuestionForm key={q.id} draft={questionDraft} onChange={setQuestionDraft} onSave={saveQuestion} onCancel={() => setEditingQuestionId(null)} saving={savingQuestion} />
                        ) : (
                          <div key={q.id} className="flex items-start gap-2 border border-slate-200 rounded-lg px-3 py-2.5">
                            <div className="min-w-0 flex-1">
                              {q.section && <p className="text-[10px] uppercase tracking-wide text-navy-600 font-semibold">{q.section}</p>}
                              <p className="text-xs text-slate-800">{q.label}</p>
                              <div className="flex flex-wrap items-center gap-1 mt-1">
                                <span className="text-[10px] bg-slate-100 text-slate-500 rounded px-1.5 py-0.5">{q.type}{q.type === 'rating' ? ` (1-${q.ratingMax || 5})` : ''}</span>
                                {q.required && <span className="text-[10px] bg-red-50 text-red-600 rounded px-1.5 py-0.5">required</span>}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button onClick={() => startEditQuestion(q)} className="text-slate-300 hover:text-navy-600 p-1"><PenLine className="w-3.5 h-3.5" /></button>
                              <button onClick={() => deleteQuestion(q.id)} className="text-slate-300 hover:text-red-600 p-1"><Trash2 className="w-3.5 h-3.5" /></button>
                            </div>
                          </div>
                        )
                      ))}
                      {addingQuestion ? (
                        <QuestionForm draft={questionDraft} onChange={setQuestionDraft} onSave={saveQuestion} onCancel={() => setAddingQuestion(false)} saving={savingQuestion} />
                      ) : bulkAdding ? (
                        <BulkQuestionForm draft={bulkDraft} onChange={setBulkDraft} onSave={saveBulkQuestions} onCancel={() => setBulkAdding(false)} saving={savingQuestion} />
                      ) : (
                        <div className="flex items-center gap-2">
                          <button onClick={startAddQuestion} className="flex items-center gap-1.5 text-xs font-medium text-navy-600 border border-dashed border-navy-200 rounded-lg px-3 py-2 hover:bg-navy-50 flex-1 justify-center">
                            <Plus className="w-3.5 h-3.5" /> Add Question
                          </button>
                          <button
                            onClick={() => { setBulkAdding(true); setBulkDraft(emptyBulkDraft) }}
                            className="flex items-center gap-1.5 text-xs font-medium text-navy-600 border border-dashed border-navy-200 rounded-lg px-3 py-2 hover:bg-navy-50 flex-1 justify-center"
                          >
                            <Plus className="w-3.5 h-3.5" /> Bulk Add (paste multiple)
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                    <button
                      onClick={launch}
                      disabled={launching || detail.questions.length === 0 || !detail.audienceType || (detail.audienceType !== 'all' && detail.audienceType !== 'selected' && !detail.audienceValue) || (detail.audienceType === 'selected' && selectedPending.length === 0)}
                      className="flex items-center gap-1.5 text-xs font-medium text-white bg-emerald-600 rounded-lg px-3 py-1.5 hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {launching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Rocket className="w-3.5 h-3.5" />}
                      Launch — Send Now
                    </button>
                    <button onClick={deleteSurvey} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-red-600 ml-auto">
                      <Trash2 className="w-3.5 h-3.5" /> Delete draft
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs text-slate-500">
                      Launched {detail.launchedAt ? fmtDate(detail.launchedAt) : ''} · {AUDIENCE_LABELS[detail.audienceType]}
                      {detail.audienceType !== 'all' && detail.audienceType !== 'selected' && detail.audienceValue ? `: ${detail.audienceValue}` : ''}
                      {' · Expires '}{detail.expiryDays} day{detail.expiryDays === 1 ? '' : 's'} after launch
                    </p>
                    <div className="flex items-center gap-2 ml-auto">
                      {detail.status === 'launched' && (
                        <button onClick={closeSurvey} disabled={closing} className="flex items-center gap-1.5 text-xs text-amber-700 border border-amber-200 rounded-lg px-3 py-1.5 hover:bg-amber-50 disabled:opacity-50">
                          {closing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}
                          Close (stop reminders)
                        </button>
                      )}
                    </div>
                  </div>
                  {detail.status === 'launched' && (
                    <div className="relative">
                      <label className="block text-xs font-medium text-slate-600 mb-1">Add Participant</label>
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                        <input
                          value={addParticipantQuery}
                          onChange={(e) => setAddParticipantQuery(e.target.value)}
                          placeholder="Search by name, email, or Staff ID…"
                          disabled={addingParticipant}
                          className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg text-sm disabled:opacity-50"
                        />
                        {addParticipantResults.length > 0 && (
                          <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                            {addParticipantResults.map((r) => (
                              <button
                                key={r.staffId}
                                onClick={() => addParticipant(r)}
                                disabled={addingParticipant}
                                className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex items-center justify-between gap-2 disabled:opacity-50"
                              >
                                <span className="text-slate-700">{r.name}</span>
                                <span className="text-slate-400">{r.staffId}{r.email ? ` · ${r.email}` : ''}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">Sends the survey to them immediately — the original audience is only resolved once, at launch, so this is the way to bring in someone who was missed.</p>
                    </div>
                  )}

                  <div className="flex items-center gap-1.5 border-b border-slate-100 pb-2">
                    <button
                      onClick={() => setActiveTab('responses')}
                      className={`text-xs font-medium rounded-lg px-3 py-1.5 ${activeTab === 'responses' ? 'bg-navy-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                    >
                      Responses
                    </button>
                    {insights && (
                      <button
                        onClick={() => setActiveTab('insights')}
                        className={`flex items-center gap-1.5 text-xs font-medium rounded-lg px-3 py-1.5 ${activeTab === 'insights' ? 'bg-navy-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                      >
                        <BarChart3 className="w-3.5 h-3.5" /> Insights
                      </button>
                    )}
                  </div>

                  {activeTab === 'insights' && insights && (
                    <div className="border border-slate-200 rounded-lg p-4 space-y-5 bg-slate-50">
                      <p className="text-xs font-semibold text-slate-700">
                        Results Insights <span className="text-slate-400 font-normal">— {insights.summary.totalRespondents} response{insights.summary.totalRespondents === 1 ? '' : 's'} analyzed</span>
                      </p>

                      {insights.toolInsights.length > 0 ? (
                        <>
                          {/* Headline KPIs — the four things an L&D team asks first. */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            <div className="border border-slate-200 bg-white rounded-lg px-3 py-2.5">
                              <p className="text-xl font-semibold text-amber-700 tabular-nums">{insights.summary.totalNeedingHelp}</p>
                              <p className="text-[10px] text-slate-500 uppercase tracking-wide">People needing help in ≥1 tool</p>
                            </div>
                            <div className="border border-slate-200 bg-white rounded-lg px-3 py-2.5">
                              <p className="text-sm font-semibold text-slate-800 truncate" title={insights.summary.topGapTool?.section}>{insights.summary.topGapTool?.section || '—'}</p>
                              <p className="text-[10px] text-slate-500 uppercase tracking-wide">Biggest skills gap ({insights.summary.topGapTool?.needsHelp.length || 0} people)</p>
                            </div>
                            <div className="border border-slate-200 bg-white rounded-lg px-3 py-2.5">
                              <p className="text-sm font-semibold text-slate-800 truncate" title={insights.summary.topSkillGap?.skill}>{insights.summary.topSkillGap?.skill || '—'}</p>
                              <p className="text-[10px] text-slate-500 uppercase tracking-wide">Most-wanted single skill ({insights.summary.topSkillGap?.count || 0} people, {insights.summary.topSkillGap?.tool})</p>
                            </div>
                            <div className="border border-slate-200 bg-white rounded-lg px-3 py-2.5">
                              <p className="text-sm font-semibold text-slate-800 truncate" title={insights.summary.topPriorityTool?.item}>{insights.summary.topPriorityTool?.item || '—'}</p>
                              <p className="text-[10px] text-slate-500 uppercase tracking-wide">#1 staff-ranked training priority</p>
                            </div>
                          </div>

                          {/* Priority ranking — from the closing ranking question, weighted by position. */}
                          {insights.priorityRanking.length > 0 && (
                            <div>
                              <p className="text-xs font-semibold text-slate-700 mb-1">Training Priority — by order respondents ranked them</p>
                              <p className="text-[11px] text-slate-400 mb-2">Score out of 100 — a #1 pick contributes 100, a last-place pick close to 0, averaged across everyone who included that tool at all (so a shorter list doesn&apos;t unfairly out-rank a longer one).</p>
                              <BarChart
                                labels={insights.priorityRanking.map((r) => `${r.item} (${r.votes})`)}
                                values={insights.priorityRanking.map((r) => Math.round(r.score))}
                                horizontal showLabels labelSuffix=""
                                height={Math.max(80, insights.priorityRanking.length * 32)}
                              />
                            </div>
                          )}

                          {/* Per-tool competency + need table — click a row for the named breakdown. */}
                          <div>
                            <p className="text-xs font-semibold text-slate-700 mb-2">Per-Tool Competency &amp; Need</p>
                            <div className="overflow-x-auto border border-slate-200 rounded-lg bg-white">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-slate-400 border-b border-slate-100 bg-slate-50">
                                    <th className="text-left font-medium py-2 px-3">Tool</th>
                                    <th className="text-right font-medium py-2 px-2">Users</th>
                                    <th className="text-right font-medium py-2 px-2 text-emerald-600">Advanced</th>
                                    <th className="text-right font-medium py-2 px-2 text-blue-600">Intermediate</th>
                                    <th className="text-right font-medium py-2 px-2 text-amber-600">Basic</th>
                                    <th className="text-right font-medium py-2 px-2 text-slate-500">Novice</th>
                                    <th className="text-right font-medium py-2 px-3 text-red-600">Needs Help</th>
                                    <th className="text-right font-medium py-2 px-3">Priority</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {insights.toolInsights.map((t) => (
                                    <tr
                                      key={t.section}
                                      onClick={() => setInsightsTool(insightsTool === t.section ? null : t.section)}
                                      className={`border-b border-slate-50 last:border-0 cursor-pointer hover:bg-slate-50 ${insightsTool === t.section ? 'bg-navy-50' : ''}`}
                                    >
                                      <td className="py-2 px-3 text-slate-700 font-medium">{t.section}</td>
                                      <td className="py-2 px-2 text-right tabular-nums text-slate-600">{t.applicable}</td>
                                      <td className="py-2 px-2 text-right tabular-nums text-emerald-700">{t.levelCounts.advanced}</td>
                                      <td className="py-2 px-2 text-right tabular-nums text-blue-700">{t.levelCounts.intermediate}</td>
                                      <td className="py-2 px-2 text-right tabular-nums text-amber-700">{t.levelCounts.basic}</td>
                                      <td className="py-2 px-2 text-right tabular-nums text-slate-500">{t.levelCounts.novice}</td>
                                      <td className="py-2 px-3 text-right tabular-nums font-semibold text-red-700">{t.needsHelp.length}</td>
                                      <td className="py-2 px-3 text-right tabular-nums text-slate-600">{t.priorityScore !== null ? t.priorityScore : '—'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>

                          {/* Deep dive for whichever tool row was clicked. */}
                          {insightsTool && (() => {
                            const t = insights.toolInsights.find((x) => x.section === insightsTool)
                            if (!t) return null
                            return (
                              <div className="border border-navy-200 rounded-lg p-3 bg-white space-y-4">
                                <div className="flex items-center justify-between">
                                  <p className="text-xs font-semibold text-navy-700">{t.section} — detail</p>
                                  <button onClick={() => setInsightsTool(null)} className="text-slate-400 hover:text-slate-700"><X className="w-3.5 h-3.5" /></button>
                                </div>

                                {t.skillGaps.length > 0 && (
                                  <div>
                                    <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-1.5">Specific skills most people are missing — what to actually build training for</p>
                                    <BarChart
                                      labels={t.skillGaps.map((g) => g.skill)}
                                      values={t.skillGaps.map((g) => g.count)}
                                      horizontal showLabels height={Math.max(60, t.skillGaps.length * 28)}
                                    />
                                  </div>
                                )}

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  <div>
                                    <p className="text-[11px] font-medium text-red-600 uppercase tracking-wide mb-1.5">Needs Help ({t.needsHelp.length}) — has a gap between what they can do and what they say would help</p>
                                    {t.needsHelp.length === 0 ? <p className="text-xs text-slate-400">Nobody — everyone who uses this tool already has the skills they said would help.</p> : (
                                      <ul className="space-y-1 max-h-56 overflow-y-auto">
                                        {t.needsHelp.map((p) => (
                                          <li key={p.name} className="text-xs text-slate-600 border-b border-slate-50 pb-1">
                                            <span className="font-medium text-slate-800">{p.name}</span>{p.businessUnit ? <span className="text-slate-400"> · {p.businessUnit}</span> : null}
                                            <br /><span className="text-slate-400">Missing: {p.missing.join(', ')}</span>
                                          </li>
                                        ))}
                                      </ul>
                                    )}
                                  </div>
                                  <div>
                                    <p className="text-[11px] font-medium text-emerald-600 uppercase tracking-wide mb-1.5">Advanced ({t.levelPeople.advanced.length}) — could mentor/peer-coach others</p>
                                    {t.levelPeople.advanced.length === 0 ? <p className="text-xs text-slate-400">Nobody at this level yet.</p> : (
                                      <ul className="space-y-1 max-h-56 overflow-y-auto">
                                        {t.levelPeople.advanced.map((p) => (
                                          <li key={p.name} className="text-xs text-slate-600 border-b border-slate-50 pb-1">
                                            <span className="font-medium text-slate-800">{p.name}</span>{p.businessUnit ? <span className="text-slate-400"> · {p.businessUnit}</span> : null}
                                          </li>
                                        ))}
                                      </ul>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )
                          })()}
                        </>
                      ) : (
                        <div className="space-y-4">
                          <p className="text-xs text-slate-400">This survey isn&apos;t shaped like a skills audit (no gate + can-do/would-help pair per section), so showing the raw answer distribution instead.</p>
                          {insights.questionDistributions.map(({ question, values, counts }) => (
                            <div key={question.id}>
                              <p className="text-xs text-slate-600 mb-1">
                                {question.section && <span className="text-slate-400">{question.section} — </span>}
                                {question.label}
                              </p>
                              <BarChart labels={values} values={counts} horizontal showLabels height={Math.max(80, values.length * 32)} />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {activeTab === 'responses' && (() => {
                    const total = detail.recipients.length
                    const sent = detail.recipients.filter((r) => r.sentAt).length
                    const filled = detail.recipients.filter((r) => r.respondedAt).length
                    const noEmail = detail.recipients.filter((r) => !r.email).length
                    const yetToFill = sent - filled
                    const stats: [string, number, string][] = [
                      ['Recipients', total, 'text-slate-700'],
                      ['Sent', sent, 'text-emerald-700'],
                      ['Filled', filled, 'text-blue-700'],
                      ['Yet to Fill', yetToFill, 'text-amber-700'],
                      ['No Email', noEmail, 'text-red-700'],
                    ]
                    return (
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                        {stats.map(([label, value, color]) => (
                          <div key={label} className="border border-slate-200 rounded-lg px-3 py-2 text-center">
                            <p className={`text-lg font-semibold tabular-nums ${color}`}>{value}</p>
                            <p className="text-[10px] text-slate-500 uppercase tracking-wide">{label}</p>
                          </div>
                        ))}
                      </div>
                    )
                  })()}

                  {activeTab === 'responses' && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-slate-400 border-b border-slate-100">
                          <th className="text-left font-medium py-1.5 pr-3">Name</th>
                          <th className="text-left font-medium py-1.5 pr-3">Email</th>
                          <th className="text-left font-medium py-1.5 pr-3">Status</th>
                          <th className="py-1.5"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.recipients.map((r) => (
                          <tr key={r.id} className="border-b border-slate-50">
                            <td className="py-1.5 pr-3 text-slate-700">{r.staffName}</td>
                            <td className="py-1.5 pr-3 text-slate-500">{r.email || '—'}</td>
                            <td className="py-1.5 pr-3">
                              {r.respondedAt ? <span className="text-blue-600">Filled {fmtDate(r.respondedAt)}</span>
                                : r.sentAt ? <span className="text-emerald-600">Sent {fmtDate(r.sentAt)}</span>
                                : <span className="text-slate-400">Not sent</span>}
                            </td>
                            <td className="py-1.5 text-right flex items-center justify-end gap-1">
                              {r.responses.length > 0 && (
                                <button onClick={() => setViewingResponse(viewingResponse === r.id ? null : r.id)} className="text-slate-400 hover:text-navy-600 p-1" title="View response">
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {r.email && !r.respondedAt && (
                                <button onClick={() => resend(r.id)} disabled={resendingId === r.id} className="text-slate-400 hover:text-navy-600 p-1 disabled:opacity-40" title={r.sentAt ? 'Resend' : 'Send'}>
                                  {resendingId === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {viewingResponse && (() => {
                      const r = detail.recipients.find((x) => x.id === viewingResponse)
                      const resp = r?.responses[0]
                      if (!resp) return null
                      const answers = JSON.parse(resp.answers) as Record<string, string | string[]>
                      return (
                        <div className="mt-2 border border-slate-200 rounded-lg p-3 space-y-1.5 bg-slate-50">
                          <p className="text-xs font-medium text-slate-700">{r?.staffName}&rsquo;s response</p>
                          {detail.questions.map((q) => (
                            <p key={q.id} className="text-xs text-slate-600">
                              <span className="text-slate-400">{q.label}:</span> {Array.isArray(answers[q.id]) ? (answers[q.id] as string[]).join(', ') : (answers[q.id] as string) || '—'}
                            </p>
                          ))}
                        </div>
                      )
                    })()}
                  </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

export function CustomSurveyPanel() {
  const [surveys, setSurveys] = useState<SurveySummary[]>([])
  const [loading, setLoading] = useState(true)
  const [roster, setRoster] = useState<RosterStaff[]>([])
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [showNewForm, setShowNewForm] = useState(false)

  // One shared mirror tab for every Custom Survey (not one per survey — see custom-survey-mirror.ts)
  // — stored on the same singleton SurveySettings row as the pre/post1/post2 mirror tabs, so saving
  // it must round-trip the OTHER settings fields too rather than overwrite them with defaults.
  const [allSettings, setAllSettings] = useState<Record<string, unknown> | null>(null)
  const [mirrorSheetName, setMirrorSheetName] = useState('')
  const [mirrorStatus, setMirrorStatus] = useState<{ success: boolean; message: string } | null>(null)
  const [savingMirror, setSavingMirror] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/custom-surveys')
      setSurveys(await res.json())
    } finally {
      setLoading(false)
    }
  }

  const loadMirrorSettings = async () => {
    const res = await fetch('/api/admin/survey-settings')
    const data = await res.json()
    setAllSettings(data)
    setMirrorSheetName(data.customSurveyMirrorSheetName || '')
    if (data.customSurveyMirrorStatus) {
      try { setMirrorStatus(JSON.parse(data.customSurveyMirrorStatus)) } catch { /* ignore */ }
    }
  }

  useEffect(() => {
    load()
    fetch('/api/admin/roster-directory').then((r) => r.json()).then(setRoster)
    loadMirrorSettings()
  }, [])

  const saveMirrorSheetName = async () => {
    if (!allSettings) return
    setSavingMirror(true)
    try {
      await fetch('/api/admin/survey-settings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...allSettings, customSurveyMirrorSheetName: mirrorSheetName }),
      })
    } finally {
      setSavingMirror(false)
    }
  }

  const createSurvey = async () => {
    if (!newTitle.trim()) return
    setCreating(true)
    try {
      const res = await fetch('/api/admin/custom-surveys', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: newTitle.trim() }),
      })
      if (res.ok) {
        setNewTitle('')
        setShowNewForm(false)
        await load()
      } else {
        const err = await res.json().catch(() => ({}))
        alert(err.error || 'Failed to create survey.')
      }
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-3">
          <ClipboardList className="w-5 h-5 text-slate-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-slate-800">Custom Surveys</p>
            <p className="text-xs text-slate-500 mt-0.5">
              One-off surveys not tied to a specific training — pick who to send it to (everyone, a department, a role, a
              Business Unit, or a hand-picked list), build the questions, and launch. Reminders go out daily until each
              person responds or the survey expires.
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowNewForm(!showNewForm)}
          className="flex items-center gap-1.5 text-xs font-medium text-navy-600 border border-navy-200 rounded-lg px-3 py-1.5 hover:bg-navy-50 shrink-0"
        >
          <Plus className="w-3.5 h-3.5" /> New Survey
        </button>
      </div>

      <div className="mb-4 border border-slate-200 rounded-lg p-3">
        <label className="block text-xs font-medium text-slate-600 mb-1">
          Google Sheet mirror tab (optional — shared by every Custom Survey)
        </label>
        <p className="text-[11px] text-slate-400 mb-1.5">
          Every Custom Survey response appends here, in the spreadsheet configured under Live Data Source — Timestamp,
          Survey Name, Employee Name, Business Unit, then Q1, Q2, … per that survey&rsquo;s own questions. Survey Name is
          what tells rows from different surveys apart.
        </p>
        <div className="flex items-center gap-2">
          <input
            value={mirrorSheetName}
            onChange={(e) => setMirrorSheetName(e.target.value)}
            onBlur={saveMirrorSheetName}
            placeholder="e.g. Custom Survey Responses"
            className="flex-1 border border-slate-300 rounded-md px-2.5 py-1.5 text-sm"
          />
          {savingMirror && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />}
        </div>
        {mirrorStatus && (
          <p className={`text-[11px] mt-1 ${mirrorStatus.success ? 'text-emerald-600' : 'text-red-600'}`}>
            Last sync: {mirrorStatus.message}
          </p>
        )}
      </div>

      {showNewForm && (
        <div className="mb-4 border border-dashed border-slate-300 rounded-lg p-3 flex items-center gap-2">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Survey title (e.g. Annual L&D Needs Assessment)"
            className="flex-1 border border-slate-300 rounded-md px-2.5 py-1.5 text-sm"
          />
          <button onClick={createSurvey} disabled={creating || !newTitle.trim()} className="flex items-center gap-1.5 text-xs font-medium text-white bg-navy-600 rounded-lg px-3 py-1.5 hover:bg-navy-700 disabled:opacity-50">
            {creating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Create Draft
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-xs text-slate-400">Loading…</p>
      ) : surveys.length === 0 ? (
        <p className="text-xs text-slate-400">No custom surveys yet.</p>
      ) : (
        <div className="space-y-2">
          {surveys.map((s) => <SurveyRow key={s.id} summary={s} roster={roster} onChanged={load} />)}
        </div>
      )}
    </div>
  )
}
