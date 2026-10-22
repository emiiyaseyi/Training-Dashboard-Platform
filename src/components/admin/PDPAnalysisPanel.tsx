'use client'

import { useEffect, useMemo, useState } from 'react'

interface QuestionBreakdown {
  questionId: string
  label: string
  sectionTitle: string
  total: Record<string, number>
  byBusinessUnit: Record<string, Record<string, number>>
  byDepartment: Record<string, Record<string, number>>
}

interface AnalysisData {
  totalPlans: number
  businessUnits: string[]
  departments: string[]
  questions: QuestionBreakdown[]
}

function CountBars({ counts, max }: { counts: Record<string, number>; max: number }) {
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])
  if (sorted.length === 0) return <p className="text-[11px] text-slate-400">No data for this scope.</p>
  return (
    <div className="space-y-1">
      {sorted.map(([label, count]) => (
        <div key={label} className="flex items-center gap-2">
          <span className="text-[11px] text-slate-600 w-48 shrink-0 truncate" title={label}>{label}</span>
          <div className="flex-1 bg-slate-100 rounded-full h-3 overflow-hidden">
            <div className="bg-navy-500 h-3 rounded-full" style={{ width: `${(count / max) * 100}%` }} />
          </div>
          <span className="text-[11px] text-slate-500 w-6 text-right">{count}</span>
        </div>
      ))}
    </div>
  )
}

// Turns the filled-in PDP answers into an org-wide (optionally BU/Department-scoped) view of what
// people actually need — the data behind a 2027 Training Plan: which skill areas, capabilities,
// priorities and intervention types come up most, broken down the way L&D actually plans around
// (whole organisation, then by Business Unit, then by Department).
export function PDPAnalysisPanel({ cycleId }: { cycleId: string }) {
  const [data, setData] = useState<AnalysisData | null>(null)
  const [loading, setLoading] = useState(true)
  const [scope, setScope] = useState<'all' | 'businessUnit' | 'department'>('all')
  const [scopeValue, setScopeValue] = useState('')

  useEffect(() => {
    setLoading(true)
    fetch(`/api/admin/pdp/${cycleId}/analysis`)
      .then((r) => r.json())
      .then((d: AnalysisData) => {
        setData(d)
        if (d.businessUnits?.[0]) setScopeValue((v) => v || d.businessUnits[0])
      })
      .finally(() => setLoading(false))
  }, [cycleId])

  const scopedQuestions = useMemo(() => {
    if (!data) return []
    return data.questions.map((q) => {
      const counts = scope === 'businessUnit' ? (q.byBusinessUnit[scopeValue] || {}) : scope === 'department' ? (q.byDepartment[scopeValue] || {}) : q.total
      const max = Math.max(1, ...Object.values(counts))
      return { ...q, counts, max }
    })
  }, [data, scope, scopeValue])

  const grouped = useMemo(() => {
    const bySection = new Map<string, typeof scopedQuestions>()
    for (const q of scopedQuestions) {
      const arr = bySection.get(q.sectionTitle) ?? []
      arr.push(q)
      bySection.set(q.sectionTitle, arr)
    }
    return [...bySection.entries()]
  }, [scopedQuestions])

  if (loading) return <p className="text-xs text-slate-400">Loading…</p>
  if (!data) return <p className="text-xs text-slate-400">Could not load analysis.</p>
  if (data.totalPlans === 0) return <p className="text-xs text-slate-400">No submitted plans yet — this fills in once people start completing their PDPs.</p>

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-[11px] text-slate-500">{data.totalPlans} finalized plan(s) analyzed.</p>
        <select value={scope} onChange={(e) => setScope(e.target.value as typeof scope)} className="border border-slate-300 rounded-md px-2 py-1 text-xs">
          <option value="all">Whole organisation</option>
          <option value="businessUnit">By Business Unit</option>
          <option value="department">By Department</option>
        </select>
        {scope === 'businessUnit' && (
          <select value={scopeValue} onChange={(e) => setScopeValue(e.target.value)} className="border border-slate-300 rounded-md px-2 py-1 text-xs">
            {data.businessUnits.map((bu) => <option key={bu} value={bu}>{bu}</option>)}
          </select>
        )}
        {scope === 'department' && (
          <select value={scopeValue} onChange={(e) => setScopeValue(e.target.value)} className="border border-slate-300 rounded-md px-2 py-1 text-xs">
            {data.departments.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        )}
      </div>

      {grouped.map(([sectionTitle, questions]) => (
        <div key={sectionTitle}>
          <p className="text-xs font-semibold text-slate-700 mb-2">{sectionTitle}</p>
          <div className="space-y-4">
            {questions.map((q) => (
              <div key={q.questionId}>
                <p className="text-[11px] font-medium text-slate-500 mb-1">{q.label}</p>
                <CountBars counts={q.counts} max={q.max} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
