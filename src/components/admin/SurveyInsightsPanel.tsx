'use client'

import { useEffect, useState } from 'react'
import { Loader2, ChevronDown, ChevronUp, BarChart2, MessageSquare, Building2, Pencil, Wrench } from 'lucide-react'
import { SurveyResponseEditModal } from './SurveyResponseEditModal'

type Stage = 'pre' | 'post1' | 'post2'
type Tab = 'insights' | 'responses'

const STAGE_LABELS: Record<Stage, string> = {
  pre: 'Pre-Training Survey',
  post1: 'Post-1 (Day 1, employee)',
  post2: 'Post-2 (1-Month, manager)',
}

interface ResponseRow {
  id: string
  attendeeId: string
  staffId: string
  staffName: string
  businessUnit: string
  trainingName: string
  submittedAt: string
  answers: Record<string, string | string[]>
}

interface Insight {
  questionId: string
  label: string
  type: string
  responseCount: number
  average?: number
  distribution?: { option: string; count: number }[]
}

interface Question {
  id: string
  section: string | null
  label: string
  type: string
  options?: string[] | null
  ratingMax?: number
}

interface InsightsData {
  questions: Question[]
  responses: ResponseRow[]
  insights: Insight[]
  respondentCount: number
  businessUnitCounts: { name: string; count: number }[]
}

function answerText(v: string | string[] | undefined): string {
  if (v === undefined || v === null || v === '') return '—'
  return Array.isArray(v) ? v.join(', ') : String(v)
}

// Group-wide (every schedule, not just one) survey insights, filterable by Business Unit — lets an
// admin verify a reported aggregate (e.g. a Post-Training Impact score on a Business Unit's report
// card) against the actual individual responses that fed it, using each attendee's CURRENT roster
// Business Unit (not the training schedule's shared one) — same resolution the live survey form
// itself uses, so this view answers "was the right data filled and used" directly.
export function SurveyInsightsPanel() {
  const [stage, setStage] = useState<Stage>('pre')
  const [businessUnit, setBusinessUnit] = useState('all')
  const [tab, setTab] = useState<Tab>('insights')
  const [data, setData] = useState<InsightsData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [openResponseId, setOpenResponseId] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [editingResponse, setEditingResponse] = useState<ResponseRow | null>(null)
  const [reloadTick, setReloadTick] = useState(0)
  const [backfilling, setBackfilling] = useState(false)
  const [backfillResult, setBackfillResult] = useState('')

  useEffect(() => {
    if (!expanded) return
    setLoading(true)
    setError('')
    fetch(`/api/admin/training-schedule/survey-insights?stage=${stage}&businessUnit=${encodeURIComponent(businessUnit)}`)
      .then(async (res) => {
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Failed to load survey insights.')
        setData(json)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load survey insights.'))
      .finally(() => setLoading(false))
  }, [expanded, stage, businessUnit, reloadTick])

  const saveEdit = async (answers: Record<string, string | string[]>) => {
    if (!editingResponse) return
    const res = await fetch(`/api/admin/training-schedule/survey-responses/${editingResponse.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json.error || 'Failed to save.')
    setReloadTick((t) => t + 1)
  }

  const runBackfill = async () => {
    if (!confirm(
      "This corrects every existing Manager Review's Business Unit to match each reviewer's CURRENT roster BU (fixing 'Post-Training Impact' scores that were grouped under a stale/wrong BU). It does not touch Post-1 feedback (Avg Impact Score) — those have no staff identifier to safely re-match. Continue?"
    )) return
    setBackfilling(true)
    setBackfillResult('')
    try {
      const res = await fetch('/api/admin/training-schedule/backfill-manager-review-bu', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Backfill failed.')
      setBackfillResult(`Checked ${json.totalRecords} manager reviews — corrected ${json.updated}${json.unresolved > 0 ? `, ${json.unresolved} staff ID(s) not found in the roster` : ''}.`)
      setReloadTick((t) => t + 1)
    } catch (err) {
      setBackfillResult(err instanceof Error ? err.message : 'Backfill failed.')
    } finally {
      setBackfilling(false)
    }
  }

  return (
    <div className="mb-5 border border-slate-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-sm font-semibold text-navy-700 bg-slate-50 hover:bg-slate-100"
      >
        <span className="flex items-center gap-1.5">
          <BarChart2 className="w-4 h-4" />
          Survey Insights — all sent surveys, by Business Unit
        </span>
        {expanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>

      {expanded && (
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <button
              onClick={runBackfill}
              disabled={backfilling}
              className="flex items-center gap-1.5 text-xs font-medium text-amber-700 border border-amber-200 bg-amber-50 rounded-lg px-3 py-1.5 hover:bg-amber-100 disabled:opacity-60"
            >
              {backfilling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wrench className="w-3.5 h-3.5" />}
              Fix Business Unit on all existing Manager Reviews
            </button>
            {backfillResult && <p className="text-xs text-slate-500">{backfillResult}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
              {(['pre', 'post1', 'post2'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setStage(s)}
                  className={`text-xs font-medium rounded-md px-2.5 py-1.5 ${stage === s ? 'bg-navy-600 text-white' : 'text-slate-600 hover:bg-white'}`}
                >
                  {STAGE_LABELS[s]}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5 ml-2">
              <Building2 className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={businessUnit}
                onChange={(e) => setBusinessUnit(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 text-slate-600"
              >
                <option value="all">All Business Units</option>
                {(data?.businessUnitCounts ?? []).map((bu) => (
                  <option key={bu.name} value={bu.name}>{bu.name} ({bu.count})</option>
                ))}
              </select>
            </div>
            <div className="ml-auto flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-0.5">
              <button
                onClick={() => setTab('insights')}
                className={`flex items-center gap-1 text-xs font-medium rounded-md px-2.5 py-1 ${tab === 'insights' ? 'bg-navy-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                <BarChart2 className="w-3 h-3" /> Insights
              </button>
              <button
                onClick={() => setTab('responses')}
                className={`flex items-center gap-1 text-xs font-medium rounded-md px-2.5 py-1 ${tab === 'responses' ? 'bg-navy-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                <MessageSquare className="w-3 h-3" /> Responses
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-navy-600" />
            </div>
          ) : error ? (
            <p className="text-xs text-red-600">{error}</p>
          ) : data ? (
            <>
              <p className="text-xs text-slate-500">
                {data.respondentCount} response{data.respondentCount === 1 ? '' : 's'} for {STAGE_LABELS[stage]}{businessUnit !== 'all' ? ` in ${businessUnit}` : ' across all Business Units'}.
              </p>
              {tab === 'insights' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {data.insights.length === 0 ? (
                    <p className="text-xs text-slate-400 py-3">No rating, select, or yes/no questions on this stage to summarize.</p>
                  ) : (
                    data.insights.map((ins) => (
                      <div key={ins.questionId} className="bg-white border border-slate-200 rounded-lg p-3">
                        <p className="text-xs font-medium text-slate-700">{ins.label}</p>
                        <p className="text-[11px] text-slate-400 mb-1.5">{ins.responseCount} response{ins.responseCount === 1 ? '' : 's'}</p>
                        {ins.average !== undefined ? (
                          <p className="text-lg font-bold text-navy-700">{ins.average.toFixed(1)}<span className="text-xs font-normal text-slate-400"> / 5 avg</span></p>
                        ) : ins.distribution ? (
                          <div className="space-y-1">
                            {ins.distribution.map((d) => (
                              <div key={d.option} className="flex items-center gap-2 text-xs">
                                <span className="text-slate-600 w-28 truncate shrink-0">{d.option}</span>
                                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                                  <div className="h-full bg-navy-500" style={{ width: `${ins.responseCount > 0 ? (d.count / ins.responseCount) * 100 : 0}%` }} />
                                </div>
                                <span className="text-slate-400 w-6 text-right shrink-0">{d.count}</span>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
              ) : (
                <div className="space-y-2 max-h-[28rem] overflow-y-auto">
                  {data.responses.length === 0 ? (
                    <p className="text-xs text-slate-400 py-3">No responses yet.</p>
                  ) : (
                    data.responses.map((r) => {
                      const isOpen = openResponseId === r.attendeeId
                      return (
                        <div key={r.id} className="bg-white border border-slate-200 rounded-lg">
                          <button
                            onClick={() => setOpenResponseId(isOpen ? null : r.attendeeId)}
                            className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left"
                          >
                            <span className="text-xs">
                              <span className="font-medium text-slate-700">{r.staffName}</span>{' '}
                              <span className="text-slate-400">({r.staffId} · {r.businessUnit})</span>
                              <span className="block text-[11px] text-slate-400">{r.trainingName}</span>
                            </span>
                            <span className="flex items-center gap-2 text-[11px] text-slate-400 shrink-0">
                              {new Date(r.submittedAt).toLocaleString()}
                              {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            </span>
                          </button>
                          {isOpen && (
                            <div className="px-3 pb-3 border-t border-slate-100 pt-2 space-y-2">
                              {data.questions.map((q) => (
                                <div key={q.id}>
                                  <p className="text-[11px] text-slate-400">{q.label}</p>
                                  <p className="text-xs text-slate-700">{answerText(r.answers[q.id])}</p>
                                </div>
                              ))}
                              <button
                                onClick={() => setEditingResponse(r)}
                                className="flex items-center gap-1.5 text-xs font-medium text-navy-600 border border-navy-200 rounded-lg px-3 py-1.5 hover:bg-navy-50 mt-1"
                              >
                                <Pencil className="w-3.5 h-3.5" /> Edit Response
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>
              )}
            </>
          ) : null}
        </div>
      )}

      {editingResponse && data && (
        <SurveyResponseEditModal
          title={`${editingResponse.staffName} — ${STAGE_LABELS[stage]}`}
          questions={data.questions.filter((q) => q.type !== 'file')}
          initialAnswers={editingResponse.answers}
          onSave={saveEdit}
          onClose={() => setEditingResponse(null)}
        />
      )}
    </div>
  )
}
