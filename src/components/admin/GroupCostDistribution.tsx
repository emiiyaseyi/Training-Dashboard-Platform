'use client'

import { useEffect, useState } from 'react'
import { Split, Loader2, AlertTriangle, CheckCircle } from 'lucide-react'

interface TrainingOption { name: string; count: number }
interface BreakdownRow { businessUnit: string; attendeeCount: number; share: number; perPersonAmount: number }
interface DistributionResult {
  training: string
  totalAmount: number
  totalAttendees: number
  applied: boolean
  classificationWarning: string | null
  breakdown: BreakdownRow[]
}

function fmt(n: number) {
  return `₦${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
}

export function GroupCostDistribution() {
  const [trainings, setTrainings] = useState<TrainingOption[]>([])
  const [selected, setSelected] = useState('')
  const [amount, setAmount] = useState('')
  const [previewing, setPreviewing] = useState(false)
  const [applying, setApplying] = useState(false)
  const [result, setResult] = useState<DistributionResult | null>(null)
  const [error, setError] = useState('')
  const [applied, setApplied] = useState(false)

  const load = () => {
    fetch('/api/admin/group-cost')
      .then((r) => r.json())
      .then((data) => setTrainings(Array.isArray(data) ? data : []))
      .catch(() => setTrainings([]))
  }
  useEffect(() => { load() }, [])

  const runDistribution = async (apply: boolean) => {
    setError('')
    setResult(null)
    if (apply) setApplying(true); else setPreviewing(true)
    try {
      const res = await fetch('/api/admin/group-cost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ training: selected, totalAmount: parseFloat(amount) || 0, apply }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Failed to distribute cost.')
        return
      }
      setResult(json)
      if (apply) {
        setApplied(true)
        setTimeout(() => setApplied(false), 3000)
      }
    } catch {
      setError('Failed to distribute cost.')
    } finally {
      setPreviewing(false)
      setApplying(false)
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5 space-y-4">
      <div className="flex items-center gap-3">
        <Split className="w-5 h-5 text-slate-400" />
        <div>
          <p className="text-sm font-semibold text-slate-800">Other Investment Budget</p>
          <p className="text-xs text-slate-500 mt-0.5">
            For a group-wide training (e.g. a Summit or Leadership Cafe already uploaded with attendees but no per-person cost), enter the total amount spent —
            it&apos;s distributed across Business Units proportional to each BU&apos;s attendee count for that training, and written back onto those records.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Training</label>
          <select
            value={selected}
            onChange={(e) => { setSelected(e.target.value); setResult(null); setError('') }}
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select a training…</option>
            {trainings.map((t) => (
              <option key={t.name} value={t.name}>{t.name} ({t.count} record{t.count !== 1 ? 's' : ''})</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Total Amount Spent (₦)</label>
          <input
            type="number"
            min="0"
            value={amount}
            onChange={(e) => { setAmount(e.target.value); setResult(null); setError('') }}
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 tabular-nums"
            placeholder="0"
          />
        </div>
        <div className="flex items-end">
          <button
            onClick={() => runDistribution(false)}
            disabled={!selected || !amount || previewing}
            className="w-full flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors"
          >
            {previewing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            Preview Distribution
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-3">
          {result.classificationWarning && (
            <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              {result.classificationWarning}
            </div>
          )}

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">Business Unit</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">Attendees</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">Share of Total</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">Per Person</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {result.breakdown.map((row) => (
                  <tr key={row.businessUnit}>
                    <td className="px-3 py-2 font-medium text-slate-800">{row.businessUnit}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600">{row.attendeeCount}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-navy-600">{fmt(row.share)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">{fmt(row.perPersonAmount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50">
                  <td className="px-3 py-2 font-semibold text-slate-800">Total ({result.totalAttendees} attendees)</td>
                  <td />
                  <td className="px-3 py-2 text-right font-semibold text-slate-800 tabular-nums">{fmt(result.totalAmount)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          {!result.applied && (
            <div className="flex items-center gap-3">
              <button
                onClick={() => runDistribution(true)}
                disabled={applying}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-navy-600 text-white text-sm font-semibold hover:bg-navy-500 disabled:opacity-50 transition-colors"
              >
                {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Confirm & Apply
              </button>
              <p className="text-xs text-slate-400">This writes the per-person amounts onto the {result.totalAttendees} matched training records.</p>
            </div>
          )}
          {applied && (
            <div className="flex items-center gap-2 text-sm text-green-700">
              <CheckCircle className="w-4 h-4" /> Applied — costs updated on {result.totalAttendees} records.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
