'use client'

import { useEffect, useState } from 'react'
import { Split, Loader2, AlertTriangle, CheckCircle, Plus, Trash2, History, Download } from 'lucide-react'
import { SectionCard } from '@/components/ui/SectionCard'
import { usePagePermission } from '@/lib/use-page-permission'

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
interface HistoryEntry {
  id: string
  training: string
  totalAmount: number
  appliedAt: string
  breakdown: BreakdownRow[]
}
interface DuplicateInfo { totalAmount: number; appliedAt: string }

function fmt(n: number) {
  return `₦${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
}
function fmtDate(d: string) {
  return new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function GroupCostDistribution() {
  const { canExport } = usePagePermission()
  const [trainings, setTrainings] = useState<TrainingOption[]>([])
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [selected, setSelected] = useState('')
  const [amount, setAmount] = useState('')
  const [previewing, setPreviewing] = useState(false)
  const [applying, setApplying] = useState(false)
  const [result, setResult] = useState<DistributionResult | null>(null)
  const [error, setError] = useState('')
  const [applied, setApplied] = useState(false)
  const [duplicates, setDuplicates] = useState<DuplicateInfo[] | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  const exportAll = async () => {
    setExporting(true)
    try {
      const res = await fetch('/api/admin/strategic-initiatives-export')
      const data = await res.json()
      if (!res.ok) { alert(data.error || 'Export failed.'); return }
      if (!data.rows || data.rows.length === 0) { alert('No records currently classified as a Strategic Learning Initiative / Other Investment Budget training.'); return }
      const { exportExcel } = await import('@/lib/export')
      await exportExcel(
        [{ name: 'Strategic Initiatives', rows: data.rows }],
        `strategic_learning_initiatives_${new Date().toISOString().slice(0, 10)}`
      )
    } finally {
      setExporting(false)
    }
  }

  const load = () => {
    fetch('/api/admin/group-cost')
      .then((r) => r.json())
      .then((data) => setTrainings(Array.isArray(data) ? data : []))
      .catch(() => setTrainings([]))
    loadHistory()
  }
  const loadHistory = () => {
    fetch('/api/admin/group-cost/history')
      .then((r) => r.json())
      .then((data) => setHistory(Array.isArray(data) ? data : []))
      .catch(() => setHistory([]))
  }
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const resetForm = () => {
    setSelected('')
    setAmount('')
    setResult(null)
    setError('')
    setApplied(false)
    setDuplicates(null)
  }

  const runDistribution = async (apply: boolean, confirmDuplicate = false) => {
    setError('')
    setDuplicates(null)
    if (!confirmDuplicate) setResult(null)
    if (apply) setApplying(true); else setPreviewing(true)
    try {
      const res = await fetch('/api/admin/group-cost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ training: selected, totalAmount: parseFloat(amount) || 0, apply, confirmDuplicate }),
      })
      const json = await res.json()
      if (res.status === 409 && json.duplicate) {
        setDuplicates(json.priorApplications)
        return
      }
      if (!res.ok) {
        setError(json.error ?? 'Failed to distribute cost.')
        return
      }
      setResult(json)
      if (apply) {
        setApplied(true)
        loadHistory()
        load()
      }
    } catch {
      setError('Failed to distribute cost.')
    } finally {
      setPreviewing(false)
      setApplying(false)
    }
  }

  const deleteHistoryEntry = async (id: string) => {
    if (!confirm('Delete this distribution record? This does not revert the costs already written to training records.')) return
    setDeletingId(id)
    try {
      await fetch('/api/admin/group-cost/history', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      await loadHistory()
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <SectionCard
      icon={Split}
      title="Other Investment Budget"
      description="For a group-wide training (e.g. a Summit or Leadership Cafe already uploaded with attendees but no per-person cost), enter the total amount spent — it's distributed across Business Units proportional to each BU's attendee count for that training, and written back onto those records."
      headerActions={
        canExport ? (
          <button
            onClick={(e) => { e.stopPropagation(); exportAll() }}
            disabled={exporting}
            title="Export every training record currently classified as a Strategic Learning Initiative"
            className="flex items-center gap-1.5 text-xs font-medium text-slate-500 border border-slate-200 rounded-lg px-2.5 py-1.5 hover:bg-slate-50 disabled:opacity-50"
          >
            {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            Export All (Excel)
          </button>
        ) : undefined
      }
    >
      <div className="space-y-4">
      {!applied ? (
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
      ) : (
        <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg p-3">
          <div className="flex items-center gap-2 text-sm text-green-700">
            <CheckCircle className="w-4 h-4" /> Applied — costs updated on {result?.totalAttendees} records for &quot;{result?.training}&quot;.
          </div>
          <button
            onClick={resetForm}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-green-300 text-green-700 text-xs font-semibold hover:bg-green-100 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Add Another
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {duplicates && (
        <div className="space-y-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">A group cost has already been applied to &quot;{selected}&quot; before:</p>
              <ul className="mt-1 space-y-0.5">
                {duplicates.map((d, i) => (
                  <li key={i}>• {fmt(d.totalAmount)} on {fmtDate(d.appliedAt)}</li>
                ))}
              </ul>
              <p className="mt-1">Applying again will overwrite the per-person cost on these records based on the new amount. Proceed only if this is intentional (e.g. a correction).</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => runDistribution(true, true)}
              disabled={applying}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-semibold hover:bg-amber-500 disabled:opacity-50 transition-colors"
            >
              {applying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Proceed Anyway
            </button>
            <button onClick={() => setDuplicates(null)} className="text-xs text-slate-500 hover:text-slate-700">Cancel</button>
          </div>
        </div>
      )}

      {result && !applied && (
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
        </div>
      )}

      {history.length > 0 && (
        <div className="pt-2 border-t border-slate-100">
          <div className="flex items-center gap-2 mb-2">
            <History className="w-4 h-4 text-slate-400" />
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Previously Applied</p>
          </div>
          <div className="space-y-2">
            {history.map((h) => (
              <div key={h.id} className="flex items-center justify-between px-3 py-2 rounded-lg border border-slate-100 bg-slate-50">
                <div>
                  <p className="text-sm font-medium text-slate-800">{h.training}</p>
                  <p className="text-xs text-slate-400">{fmt(h.totalAmount)} across {h.breakdown.length} BU{h.breakdown.length !== 1 ? 's' : ''} · {fmtDate(h.appliedAt)}</p>
                </div>
                <button
                  onClick={() => deleteHistoryEntry(h.id)}
                  disabled={deletingId === h.id}
                  className="p-1.5 text-slate-400 hover:text-red-600 transition-colors disabled:opacity-50"
                  title="Delete this history record (does not revert costs)"
                >
                  {deletingId === h.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      </div>
    </SectionCard>
  )
}
