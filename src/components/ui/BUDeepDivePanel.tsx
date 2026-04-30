'use client'

import { useEffect, useState } from 'react'
import { X, FileDown, Printer } from 'lucide-react'
import type { BUDetailAnalytics } from '@/lib/analytics'
import { BarChart } from '@/components/charts/BarChart'
import { LineChart } from '@/components/charts/LineChart'
import { PieChart } from '@/components/charts/PieChart'
import { SectionExport } from './SectionExport'
import { ParticipationCard } from './ParticipationCard'
import { PDFOptionsModal, type PDFPrintOptions } from './PDFOptionsModal'
import { exportBUToExcel } from '@/lib/bu-excel-export'
import { loadSignatureSettings } from '@/lib/signature-settings'
import { filterLabel, type PeriodFilter } from '@/lib/filter-types'

interface Props {
  buName: string
  detail: BUDetailAnalytics
  onClose: () => void
  filter?: PeriodFilter
}

function fmt(n: number) {
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `₦${(n / 1_000).toFixed(1)}K`
  return `₦${n.toLocaleString()}`
}
function pct(n: number) { return `${n.toFixed(1)}%` }
function rating(n: number) { return n === 0 ? '—' : `${n.toFixed(1)}/5` }

function MiniKPI({ label, value, sub, accent, alert }: {
  label: string; value: string; sub?: string; accent?: string; alert?: boolean
}) {
  return (
    <div className={`rounded-xl border p-4 ${alert ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white'}`}>
      <p className="text-xs text-slate-500 font-medium leading-tight">{label}</p>
      <p className={`text-xl font-bold tabular-nums mt-1 ${alert ? 'text-red-700' : accent ?? 'text-slate-800'}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5 leading-tight">{sub}</p>}
    </div>
  )
}

function Section({ title, rows, filename, children, empty }: {
  title: string; rows: Record<string, unknown>[]; filename: string; children: React.ReactNode; empty?: string
}) {
  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-bold text-slate-600 uppercase tracking-widest">{title}</h3>
        <SectionExport rows={rows} filename={filename} label="CSV" />
      </div>
      {rows.length > 0 ? children : (
        <p className="text-sm text-slate-400 py-3">{empty ?? 'No data available.'}</p>
      )}
    </section>
  )
}

export function BUDeepDivePanel({ buName, detail, onClose, filter }: Props) {
  const bu = detail.bu
  const [showPDFOptions, setShowPDFOptions] = useState(false)
  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
  const periodLabel = filter ? filterLabel(filter) : 'All Time'
  const sig = typeof window !== 'undefined' ? loadSignatureSettings() : null

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !showPDFOptions) onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose, showPDFOptions])

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  function handlePDFConfirm(opts: PDFPrintOptions) {
    setShowPDFOptions(false)
    const prevTitle = document.title
    document.title = `${buName} — Business Unit Report`
    document.body.setAttribute('data-print-orientation', opts.orientation)
    document.body.setAttribute('data-print-scale', opts.scale)
    document.body.classList.add('bu-printing')

    // Inject a dynamic @page rule (body-selector @page not widely supported)
    const pageStyle = document.createElement('style')
    pageStyle.id = 'bu-dynamic-page'
    pageStyle.textContent = `@media print { @page { size: A4 ${opts.orientation}; margin: ${opts.orientation === 'portrait' ? '14mm 12mm' : '12mm 14mm'}; } }`
    document.head.appendChild(pageStyle)

    setTimeout(() => {
      window.print()
      document.body.classList.remove('bu-printing')
      document.body.removeAttribute('data-print-orientation')
      document.body.removeAttribute('data-print-scale')
      document.title = prevTitle
      document.getElementById('bu-dynamic-page')?.remove()
    }, 150)
  }

  async function handleExcel() {
    await exportBUToExcel(buName, detail)
  }

  const budgetUsed = bu.budget > 0 ? pct(bu.budgetUtilisation) : null
  const trainingPct = bu.trainingCost > 0 && bu.totalInvestment > 0
    ? (bu.trainingCost / bu.totalInvestment) * 100 : 0

  return (
    <>
      <div className="bu-panel-backdrop fixed inset-0 bg-black/50 z-40 no-print" onClick={onClose} />

      <div id="bu-deep-dive-panel" className="bu-panel-animate fixed top-0 right-0 h-screen w-full max-w-3xl bg-slate-50 z-50 flex flex-col shadow-2xl">

        {/* ── Screen header (hidden in print) ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white shrink-0 no-print">
          <div>
            <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-widest">Business Unit Report</p>
            <h2 className="text-lg font-bold text-slate-900 leading-tight mt-0.5">{buName}</h2>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleExcel}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-green-200 bg-green-50 text-green-700 text-xs font-semibold hover:bg-green-100 transition-colors">
              <FileDown className="w-3.5 h-3.5" /> Export Excel
            </button>
            <button onClick={() => setShowPDFOptions(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 text-xs font-semibold hover:bg-blue-100 transition-colors">
              <Printer className="w-3.5 h-3.5" /> Export PDF
            </button>
            <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ── Print-only full header ── */}
        <div className="bu-print-header px-0 pt-0 pb-4 border-b-2 border-slate-800 mb-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-1">
                Meristem Learning &amp; Development
              </p>
              <h1 className="text-2xl font-black text-slate-900 leading-tight">Business Unit Report</h1>
              <h2 className="text-lg font-bold text-blue-700 mt-0.5">{buName}</h2>
            </div>
            <div className="text-right text-xs text-slate-500 space-y-0.5">
              <p><span className="font-semibold">Period:</span> {periodLabel}</p>
              <p><span className="font-semibold">Generated:</span> {today}</p>
              <p><span className="font-semibold">Total Investment:</span> {fmt(bu.totalInvestment)}</p>
            </div>
          </div>
        </div>

        {/* ── Scrollable body ── */}
        <div className="bu-panel-body flex-1 overflow-y-auto px-6 py-6 space-y-8">

          {/* ═══ Executive Summary ═══ */}
          <section>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Executive Summary</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
              <MiniKPI label="Total Learning Investment" value={fmt(bu.totalInvestment)} sub={`${pct(trainingPct)} training · ${pct(bu.subscriptionRatio)} subscriptions`} accent="text-blue-700" />
              <MiniKPI label="Training Spend" value={fmt(bu.trainingCost)} sub={budgetUsed ? `Utilisation: ${budgetUsed}` : 'No budget configured'} accent="text-purple-700" />
              <MiniKPI label="Subscription Spend" value={fmt(bu.subscriptionCost)} sub="Professional memberships" accent="text-green-700" />
              <MiniKPI label="Investment per Trained Staff" value={bu.staffTrained > 0 ? fmt(bu.totalInvestment / bu.staffTrained) : '—'} sub={`${bu.staffTrained} trained staff`} accent="text-amber-700" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MiniKPI label="Staff Coverage" value={bu.totalStaff > 0 ? pct(bu.coverageRatio) : '—'} sub={`${bu.staffTrained} of ${bu.totalStaff || '?'} trained`} accent={bu.coverageRatio >= 70 ? 'text-green-700' : bu.coverageRatio >= 40 ? 'text-amber-700' : 'text-red-700'} alert={bu.coverageRatio < 30 && bu.totalStaff > 0} />
              <MiniKPI label="Avg Impact Score" value={rating(bu.avgImpactScore)} sub="Avg confidence rating (max 5)" accent={bu.avgImpactScore >= 4.0 ? 'text-green-700' : bu.avgImpactScore >= 3.0 ? 'text-amber-700' : 'text-slate-500'} />
              <MiniKPI label="Budget Status" value={bu.budget > 0 ? (bu.isOverBudget ? 'Over Budget' : 'On Track') : 'Not Set'} sub={bu.budget > 0 ? `Budget: ${fmt(bu.budget)}` : 'Set in Admin Settings'} accent={bu.isOverBudget ? 'text-red-700' : bu.budget > 0 ? 'text-green-700' : 'text-slate-400'} alert={bu.isOverBudget} />
              <MiniKPI label="Subscription Members" value={bu.subscriptionStaff.toLocaleString()} sub="Staff with active memberships" accent="text-blue-700" />
            </div>
            {bu.totalInvestment > 0 && (
              <div className={`mt-3 rounded-xl border px-4 py-3 ${bu.subscriptionRatio > 50 ? 'border-blue-100 bg-blue-50' : bu.subscriptionRatio < 20 ? 'border-purple-100 bg-purple-50' : 'border-green-100 bg-green-50'}`}>
                <p className={`text-xs font-semibold ${bu.subscriptionRatio > 50 ? 'text-blue-700' : bu.subscriptionRatio < 20 ? 'text-purple-700' : 'text-green-700'}`}>
                  Learning Profile:{' '}
                  {bu.subscriptionRatio > 50 ? 'Accreditation-led — Professional body investment dominates' : bu.subscriptionRatio < 20 ? 'Skill-acquisition led — Formal training dominates' : 'Balanced — Mature mix of training and professional memberships'}
                </p>
              </div>
            )}
          </section>

          {/* ═══ Participation ═══ */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ParticipationCard title="Training Participation" participation={detail.trainingParticipation} totalStaff={bu.totalStaff} />
            <ParticipationCard title="Subscription Participation" participation={detail.subscriptionParticipation} totalStaff={bu.totalStaff} />
          </div>

          <hr className="border-slate-200" />

          {/* ═══ 1. Monthly Training Spend ═══ */}
          <Section title="Monthly Training Spend" rows={detail.monthlyTrainingSpend.map((m) => ({ Month: m.month, 'Cost (₦)': m.cost }))} filename={`${buName}_monthly_spend`} empty="No monthly training spend data found.">
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <LineChart labels={detail.monthlyTrainingSpend.map((m) => m.month)} values={detail.monthlyTrainingSpend.map((m) => m.cost)} height={220} />
            </div>
          </Section>

          {/* ═══ 2. Top Training Programmes ═══ */}
          <Section title="Top Training Programmes" rows={detail.topTrainings.map((t) => ({ Programme: t.training, Participants: t.count, 'Total Cost (₦)': t.totalCost }))} filename={`${buName}_top_trainings`} empty="No training programme data found.">
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <BarChart labels={detail.topTrainings.map((t) => t.training)} values={detail.topTrainings.map((t) => t.totalCost)} color="#a855f7" height={Math.max(180, detail.topTrainings.length * 38)} horizontal />
            </div>
          </Section>

          {/* ═══ 3. Application Rates ═══ */}
          <Section title="Application Rates" rows={detail.feedbackSummary.applicationRates.map((a) => ({ Category: a.category, Count: a.count }))} filename={`${buName}_application_rates`} empty="No feedback data found.">
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <PieChart labels={detail.feedbackSummary.applicationRates.map((a) => a.category)} values={detail.feedbackSummary.applicationRates.map((a) => a.count)} donut height={240} />
            </div>
          </Section>

          {/* ═══ 4. Membership Organisations ═══ */}
          <Section title="Membership Organisations" rows={detail.subscriptionBreakdown.map((s) => ({ Organisation: s.org, Members: s.count, 'Amount (₦)': s.totalAmount }))} filename={`${buName}_membership_orgs`} empty="No subscription data found.">
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <BarChart labels={detail.subscriptionBreakdown.map((s) => s.org)} values={detail.subscriptionBreakdown.map((s) => s.totalAmount)} color="#22c55e" height={Math.max(160, detail.subscriptionBreakdown.length * 38)} horizontal={detail.subscriptionBreakdown.length > 2} />
            </div>
          </Section>

          {/* ═══ 5. Training Programmes (table) ═══ */}
          <Section title={`Training Programmes — ${buName}`} rows={detail.topTrainings.map((t) => ({ Programme: t.training, Participants: t.count, 'Total Cost (₦)': t.totalCost, 'Avg Cost per Participant (₦)': Math.round(t.totalCost / t.count) }))} filename={`${buName}_programmes`} empty="No training records found.">
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    {['Programme', 'Participants', 'Total Cost (₦)', 'Avg Cost (₦)'].map((h) => (
                      <th key={h} className={`px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider ${h === 'Programme' ? 'text-left' : 'text-right'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {detail.topTrainings.map((t, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-700">{t.training}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">{t.count}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">{fmt(t.totalCost)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">{fmt(t.totalCost / t.count)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          {/* ═══ 6. Impact Alignment Areas ═══ */}
          <Section title="Impact Alignment Areas" rows={detail.feedbackSummary.impactAreas.map((a) => ({ 'Impact Area': a.area, Responses: a.count }))} filename={`${buName}_impact_areas`} empty="No impact alignment data found.">
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-left">Impact Area</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Responses</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {detail.feedbackSummary.impactAreas.map((a, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-700">{a.area}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">{a.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          {/* ═══ Print-only signature footer ═══ */}
          {sig && (
            <div className="bu-print-footer mt-10 pt-6 border-t-2 border-slate-300">
              <div className="grid grid-cols-2 gap-12 mb-6">
                <div>
                  <div className="border-b border-slate-400 mb-2 pb-6" />
                  <p className="text-xs font-bold text-slate-700">{sig.primaryTitle}</p>
                  {sig.primaryName && <p className="text-xs text-slate-500">{sig.primaryName}</p>}
                </div>
                {sig.secondaryTitle && (
                  <div>
                    <div className="border-b border-slate-400 mb-2 pb-6" />
                    <p className="text-xs font-bold text-slate-700">{sig.secondaryTitle}</p>
                    {sig.secondaryName && <p className="text-xs text-slate-500">{sig.secondaryName}</p>}
                  </div>
                )}
              </div>
              <p className="text-xs text-slate-500 text-center font-medium">{sig.organisationLine}</p>
            </div>
          )}

          <div className="h-8" />
        </div>
      </div>

      {/* PDF options modal */}
      {showPDFOptions && (
        <PDFOptionsModal
          title={`${buName} — Business Unit Report`}
          subtitle={`Period: ${periodLabel}`}
          onConfirm={handlePDFConfirm}
          onClose={() => setShowPDFOptions(false)}
        />
      )}
    </>
  )
}
