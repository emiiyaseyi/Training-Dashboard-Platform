'use client'

import { useEffect, useMemo, useState } from 'react'
import { Search, ChevronDown, ChevronUp } from 'lucide-react'

interface QuestionBreakdown {
  questionId: string
  label: string
  sectionTitle: string
  total: Record<string, number>
  byBusinessUnit: Record<string, Record<string, number>>
  byDepartment: Record<string, Record<string, number>>
}

interface PDPQuestion { id: string; label: string; type: string }
interface Section { id: string; key: string; title: string; questions: PDPQuestion[] }
interface Answers { answers: Record<string, string | string[]>; developmentNeeds: Record<string, string | string[]>[] }
interface Person { staffId: string; staffName: string; businessUnit: string; department: string | null; source: string; answers: Answers }

interface GroupOpportunity { area: string; businessUnit: string; count: number; people: string[] }

interface AnalysisData {
  totalPlans: number
  businessUnits: string[]
  departments: string[]
  capabilityDemand: QuestionBreakdown
  groupOpportunities: GroupOpportunity[]
  questions: QuestionBreakdown[]
  sections: Section[]
  people: Person[]
}

// Tabular AND graphical in one: a real table (Option / Count / Share) with an inline bar inside
// the Share cell, rather than choosing one presentation over the other.
function CountTable({ counts, max }: { counts: Record<string, number>; max: number }) {
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])
  if (sorted.length === 0) return <p className="text-[11px] text-slate-400">No data for this scope.</p>
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  return (
    <table className="w-full text-[11px]">
      <thead>
        <tr className="text-left text-slate-400 border-b border-slate-100">
          <th className="py-1 pr-2 font-medium">Option</th>
          <th className="py-1 pr-2 font-medium w-14 text-right">Count</th>
          <th className="py-1 font-medium">Share</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map(([label, count]) => (
          <tr key={label} className="border-b border-slate-50 last:border-0">
            <td className="py-1 pr-2 text-slate-600">{label}</td>
            <td className="py-1 pr-2 text-slate-700 text-right font-medium">{count}</td>
            <td className="py-1">
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-slate-100 rounded-full h-2.5 overflow-hidden min-w-[60px]">
                  <div className="bg-navy-500 h-2.5 rounded-full" style={{ width: `${(count / max) * 100}%` }} />
                </div>
                <span className="text-slate-400 w-8 shrink-0">{total > 0 ? Math.round((count / total) * 100) : 0}%</span>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function renderValue(v: string | string[] | undefined): string {
  return v == null ? '—' : Array.isArray(v) ? (v.join(', ') || '—') : v
}

function PersonRecap({ sections, answers }: { sections: Section[]; answers: Answers }) {
  const needsSection = sections.find((s) => s.key === 'development_needs')
  const otherSections = sections.filter((s) => s.key !== 'development_needs')
  return (
    <div className="space-y-3 mt-2">
      {otherSections.map((s) => (
        <div key={s.id}>
          <p className="text-[11px] font-semibold text-slate-600 mb-1">{s.title}</p>
          {s.questions.map((q) => (
            <p key={q.id} className="text-[11px] text-slate-600"><span className="text-slate-400">{q.label}:</span> {renderValue(answers.answers[q.id])}</p>
          ))}
        </div>
      ))}
      {needsSection && answers.developmentNeeds.map((need, i) => (
        <div key={i}>
          <p className="text-[11px] font-semibold text-slate-600 mb-1">Development Need {i + 1}</p>
          {needsSection.questions.map((q) => (
            <p key={q.id} className="text-[11px] text-slate-600"><span className="text-slate-400">{q.label}:</span> {renderValue(need[q.id])}</p>
          ))}
        </div>
      ))}
    </div>
  )
}

// Turns the filled-in PDP answers into an org-wide (optionally BU/Department-scoped) view of what
// people actually need — the data behind a 2027 Training Plan: which skill areas, capabilities,
// priorities and intervention types come up most, broken down the way L&D actually plans around
// (whole organisation, then by Business Unit, then by Department) — plus a per-person drill-down
// of each finalized plan in full.
export function PDPAnalysisPanel({ cycleId }: { cycleId: string }) {
  const [data, setData] = useState<AnalysisData | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'aggregate' | 'people'>('aggregate')
  const [scope, setScope] = useState<'all' | 'businessUnit' | 'department'>('all')
  const [scopeValue, setScopeValue] = useState('')
  const [peopleQuery, setPeopleQuery] = useState('')
  const [expandedStaffId, setExpandedStaffId] = useState<string | null>(null)

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

  const capabilityDemandScoped = useMemo(() => {
    if (!data) return null
    const counts = scope === 'businessUnit' ? (data.capabilityDemand.byBusinessUnit[scopeValue] || {}) : scope === 'department' ? (data.capabilityDemand.byDepartment[scopeValue] || {}) : data.capabilityDemand.total
    const max = Math.max(1, ...Object.values(counts))
    return { counts, max }
  }, [data, scope, scopeValue])

  const scopedGroupOpportunities = useMemo(() => {
    if (!data) return []
    if (scope === 'businessUnit') return data.groupOpportunities.filter((g) => g.businessUnit === scopeValue)
    return data.groupOpportunities
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

  const filteredPeople = useMemo(() => {
    if (!data) return []
    const q = peopleQuery.trim().toLowerCase()
    return data.people.filter((p) => !q || p.staffName.toLowerCase().includes(q) || p.staffId.toLowerCase().includes(q) || p.businessUnit.toLowerCase().includes(q))
  }, [data, peopleQuery])

  if (loading) return <p className="text-xs text-slate-400">Loading…</p>
  if (!data) return <p className="text-xs text-slate-400">Could not load analysis.</p>
  if (data.totalPlans === 0) return <p className="text-xs text-slate-400">No submitted plans yet — this fills in once people start completing their PDPs.</p>

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-1.5">
        <button onClick={() => setTab('aggregate')} className={`px-2.5 py-1 rounded-md text-xs font-medium ${tab === 'aggregate' ? 'bg-navy-600 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>Aggregate Counts</button>
        <button onClick={() => setTab('people')} className={`px-2.5 py-1 rounded-md text-xs font-medium ${tab === 'people' ? 'bg-navy-600 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>Per-Person ({data.people.length})</button>
      </div>

      {tab === 'aggregate' && (
        <>
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

          {capabilityDemandScoped && Object.keys(capabilityDemandScoped.counts).length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-700 mb-1">Total Needs per Capability</p>
              <p className="text-[11px] text-slate-400 mb-2">How many people have a need touching each of Meristem&apos;s strategic capabilities — Primary and Secondary combined, counted once per person.</p>
              <CountTable counts={capabilityDemandScoped.counts} max={capabilityDemandScoped.max} />
            </div>
          )}

          {scopedGroupOpportunities.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-700 mb-1">Group Training Opportunities</p>
              <p className="text-[11px] text-slate-400 mb-2">Same need area, same Business Unit, 2+ people — candidates for a shared intervention instead of individual training.</p>
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-left text-slate-400 border-b border-slate-100">
                    <th className="py-1 pr-2 font-medium">Need Area</th>
                    <th className="py-1 pr-2 font-medium">Business Unit</th>
                    <th className="py-1 pr-2 font-medium w-14 text-right">People</th>
                    <th className="py-1 font-medium">Who</th>
                  </tr>
                </thead>
                <tbody>
                  {scopedGroupOpportunities.map((g) => (
                    <tr key={`${g.area}::${g.businessUnit}`} className="border-b border-slate-50 last:border-0">
                      <td className="py-1 pr-2 text-slate-600">{g.area}</td>
                      <td className="py-1 pr-2 text-slate-500">{g.businessUnit}</td>
                      <td className="py-1 pr-2 text-slate-700 text-right font-medium">{g.count}</td>
                      <td className="py-1 text-slate-400">{g.people.join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {grouped.map(([sectionTitle, questions]) => (
            <div key={sectionTitle}>
              <p className="text-xs font-semibold text-slate-700 mb-2">{sectionTitle}</p>
              <div className="space-y-4">
                {questions.map((q) => (
                  <div key={q.questionId}>
                    <p className="text-[11px] font-medium text-slate-500 mb-1">{q.label}</p>
                    <CountTable counts={q.counts} max={q.max} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </>
      )}

      {tab === 'people' && (
        <div>
          <div className="relative max-w-xs mb-3">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              value={peopleQuery}
              onChange={(e) => setPeopleQuery(e.target.value)}
              placeholder="Search by name, Staff ID, or BU…"
              className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded-md text-xs"
            />
          </div>
          <div className="space-y-1.5">
            {filteredPeople.map((p) => (
              <div key={p.staffId} className="border border-slate-200 rounded-lg">
                <button onClick={() => setExpandedStaffId(expandedStaffId === p.staffId ? null : p.staffId)} className="w-full flex items-center justify-between px-3 py-2 text-left">
                  <div>
                    <p className="text-xs font-medium text-slate-700">{p.staffName} <span className="text-slate-400">({p.staffId})</span></p>
                    <p className="text-[11px] text-slate-400">{p.businessUnit}{p.department ? ` · ${p.department}` : ''} · {p.source}</p>
                  </div>
                  {expandedStaffId === p.staffId ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
                </button>
                {expandedStaffId === p.staffId && (
                  <div className="px-3 pb-3 border-t border-slate-100">
                    <PersonRecap sections={data.sections} answers={p.answers} />
                  </div>
                )}
              </div>
            ))}
            {filteredPeople.length === 0 && <p className="text-xs text-slate-400">No match.</p>}
          </div>
        </div>
      )}
    </div>
  )
}
