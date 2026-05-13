'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, KeyRound } from 'lucide-react'

interface MetricRow {
  metric: string
  measures: string
  target: string
  targetClass: string
}

const METRICS: MetricRow[] = [
  {
    metric: 'Staff Coverage',
    measures: '% of total configured headcount who received at least one training or subscription.',
    target: '≥ 80%',
    targetClass: 'text-green-700 bg-green-50',
  },
  {
    metric: 'Avg Impact Score',
    measures: 'Staff self-rated confidence post-training on a 0–5 scale. Reflects perceived learning effectiveness.',
    target: '≥ 4.0 / 5',
    targetClass: 'text-green-700 bg-green-50',
  },
  {
    metric: 'Role Relevance',
    measures: 'Staff rating of how relevant training was to their current role (1–5 scale).',
    target: '≥ 4.0 / 5',
    targetClass: 'text-green-700 bg-green-50',
  },
  {
    metric: 'Expectations Met',
    measures: 'Staff rating of the extent to which training met their pre-training expectations (1–5 scale).',
    target: '≥ 4.0 / 5',
    targetClass: 'text-green-700 bg-green-50',
  },
  {
    metric: 'Vendor Rating',
    measures: 'Average evaluator score for the facilitator or provider who delivered the training (0–5 scale).',
    target: '≥ 4.0 / 5',
    targetClass: 'text-green-700 bg-green-50',
  },
  {
    metric: '40-Hour Compliance',
    measures: '% of staff who accumulated ≥ 40 learning hours in the period (formal training + KSS combined).',
    target: '≥ 80%',
    targetClass: 'text-green-700 bg-green-50',
  },
  {
    metric: 'LCI (Learning Culture Index)',
    measures: 'Composite 0–100 score weighted across coverage (30%), impact (25%), feedback credibility (20%), learning depth (15%), and role relevance (10%).',
    target: '≥ 71 (Mature)',
    targetClass: 'text-blue-700 bg-blue-50',
  },
  {
    metric: 'Feedback Credibility',
    measures: '% of training participants who provided post-training feedback. Higher coverage makes impact scores more reliable.',
    target: '≥ 50%',
    targetClass: 'text-green-700 bg-green-50',
  },
  {
    metric: 'Participation Inequality',
    measures: '% of total learning activity accounted for by the top 20% of most active staff. Lower is more equitable.',
    target: '≤ 40%',
    targetClass: 'text-amber-700 bg-amber-50',
  },
  {
    metric: 'Budget Utilisation',
    measures: 'Actual training spend as a % of the approved annual budget. Tracks spend discipline.',
    target: '≤ 100% (On Track)',
    targetClass: 'text-blue-700 bg-blue-50',
  },
  {
    metric: 'Learning Depth',
    measures: 'Average number of training sessions per trained staff member. Indicates re-engagement and breadth of learning.',
    target: '≥ 2.0×',
    targetClass: 'text-purple-700 bg-purple-50',
  },
]

export function MetricsKey() {
  const [open, setOpen] = useState(false)

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden no-print">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-slate-50 transition-colors"
      >
        <KeyRound className="w-4 h-4 text-slate-400 shrink-0" />
        <span className="text-sm font-semibold text-slate-700">Metrics Key &amp; Targets</span>
        <span className="text-xs text-slate-400 ml-1">— definitions and benchmarks for all dashboard indicators</span>
        <span className="ml-auto text-slate-400">
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </span>
      </button>

      {open && (
        <div className="border-t border-slate-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-left w-44">Metric</th>
                <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-left">What It Measures</th>
                <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-left w-40">Target</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {METRICS.map((m) => (
                <tr key={m.metric} className="hover:bg-slate-50">
                  <td className="px-5 py-3 font-semibold text-slate-800 align-top">{m.metric}</td>
                  <td className="px-5 py-3 text-slate-600 leading-relaxed align-top">{m.measures}</td>
                  <td className="px-5 py-3 align-top">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${m.targetClass}`}>
                      {m.target}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
