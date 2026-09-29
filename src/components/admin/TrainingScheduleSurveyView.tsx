'use client'

import { useState } from 'react'
import { Eye, Loader2, ChevronDown, ChevronUp, ExternalLink, BarChart2, MessageSquare, Pencil } from 'lucide-react'
import { SurveyResponseEditModal } from './SurveyResponseEditModal'

type Stage = 'pre' | 'post1' | 'post2'
type Tab = 'responses' | 'insights'

interface Question {
  id: string
  section: string | null
  label: string
  type: string
  options: string[] | null
  ratingMax?: number
}

interface ResponseRow {
  id: string
  attendeeId: string
  staffId: string
  staffName: string
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

interface SurveyData {
  questions: Question[]
  responses: ResponseRow[]
  insights: Insight[]
  respondentCount: number
  attendeeCount: number
}

function answerText(v: string | string[] | undefined): string {
  if (v === undefined || v === null || v === '') return '—'
  return Array.isArray(v) ? v.join(', ') : String(v)
}

// Per-stage "Preview / Responses / Insights" drilldown for a Training Schedule's Pre/Post-1/Post-2
// survey — the same three views CustomSurveyPanel already offers for a Custom Survey, applied here
// to the fixed pre/post1/post2 question bank instead. Preview opens the read-only admin preview
// page in a new tab (same pattern as Custom Survey's "Preview Survey" link); Responses/Insights are
// fetched lazily on first expand, from the schedule's own attendee set.
export function TrainingScheduleSurveyView({ scheduleId, stage, stageLabel }: { scheduleId: string; stage: Stage; stageLabel: string }) {
  const [expanded, setExpanded] = useState(false)
  const [tab, setTab] = useState<Tab>('responses')
  const [data, setData] = useState<SurveyData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [openResponseId, setOpenResponseId] = useState<string | null>(null)
  const [editingResponse, setEditingResponse] = useState<ResponseRow | null>(null)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/training-schedule/${scheduleId}/survey-responses?stage=${stage}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to load responses.')
      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load responses.')
    } finally {
      setLoading(false)
    }
  }

  const saveEdit = async (answers: Record<string, string | string[]>) => {
    if (!editingResponse) return
    const res = await fetch(`/api/admin/training-schedule/survey-responses/${editingResponse.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json.error || 'Failed to save.')
    await load()
  }

  const toggle = () => {
    const next = !expanded
    setExpanded(next)
    if (next) load()
  }

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
      >
        <span className="flex items-center gap-1.5">
          <Eye className="w-3.5 h-3.5" />
          {stageLabel} — Preview, Responses &amp; Insights
        </span>
        {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>

      {expanded && (
        <div className="border-t border-slate-100 p-3 bg-slate-50/50">
          <div className="flex items-center gap-2 mb-3">
            <a
              href={`/survey/schedule-preview/${scheduleId}/${stage}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs font-medium text-navy-600 border border-navy-200 bg-white rounded-lg px-3 py-1.5 hover:bg-navy-50"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Preview Survey
            </a>
            <div className="ml-auto flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-0.5">
              <button
                onClick={() => setTab('responses')}
                className={`flex items-center gap-1 text-xs font-medium rounded-md px-2.5 py-1 ${tab === 'responses' ? 'bg-navy-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                <MessageSquare className="w-3 h-3" /> Responses
              </button>
              <button
                onClick={() => setTab('insights')}
                className={`flex items-center gap-1 text-xs font-medium rounded-md px-2.5 py-1 ${tab === 'insights' ? 'bg-navy-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                <BarChart2 className="w-3 h-3" /> Insights
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-navy-600" />
            </div>
          ) : error ? (
            <p className="text-xs text-red-600">{error}</p>
          ) : data ? (
            tab === 'responses' ? (
              <div className="space-y-2">
                <p className="text-xs text-slate-500">{data.respondentCount} of {data.attendeeCount} attendees have responded.</p>
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
                          <span className="text-xs font-medium text-slate-700">{r.staffName} <span className="text-slate-400 font-normal">({r.staffId})</span></span>
                          <span className="flex items-center gap-2 text-[11px] text-slate-400">
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
            ) : (
              <div className="space-y-2">
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
                              <span className="text-slate-600 w-32 truncate shrink-0">{d.option}</span>
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
            )
          ) : null}
        </div>
      )}

      {editingResponse && data && (
        <SurveyResponseEditModal
          title={`${editingResponse.staffName} — ${stageLabel}`}
          questions={data.questions.filter((q) => q.type !== 'file')}
          initialAnswers={editingResponse.answers}
          onSave={saveEdit}
          onClose={() => setEditingResponse(null)}
        />
      )}
    </div>
  )
}
