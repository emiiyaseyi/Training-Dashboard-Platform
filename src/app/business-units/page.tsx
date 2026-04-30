'use client'

import { useEffect, useState, useCallback } from 'react'
import { Building2, RefreshCw, TrendingUp, Users, Target } from 'lucide-react'
import { DataTable } from '@/components/ui/DataTable'
import { AlertBadge } from '@/components/ui/AlertBadge'
import { PageHeader } from '@/components/ui/PageHeader'
import { PDFExportButton } from '@/components/ui/PDFExportButton'
import { FilterBar } from '@/components/ui/FilterBar'
import { SectionExport } from '@/components/ui/SectionExport'
import { BUDeepDivePanel } from '@/components/ui/BUDeepDivePanel'
import { BarChart } from '@/components/charts/BarChart'
import type { BUDetailAnalytics } from '@/lib/analytics'
import { type PeriodFilter, filterToQuery } from '@/lib/filter-types'

function fmt(n: number) {
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `₦${(n / 1_000).toFixed(1)}K`
  return `₦${n.toLocaleString()}`
}
function pct(n: number) { return `${n.toFixed(1)}%` }
function rating(n: number) { return n === 0 ? '—' : `${n.toFixed(1)}/5` }

interface BUSummaryRow {
  name: string
  trainingCost: number
  subscriptionCost: number
  totalInvestment: number
  staffTrained: number
  totalStaff: number
  coverageRatio: number
  avgImpactScore: number
  isOverBudget: boolean
  budget: number
  subscriptionRatio: number
  budgetUtilisation: number
  subscriptionStaff: number
}

// ── Expanded BU card shown on the main page ──────────────────────────────────
function BUCard({ bu, onClick }: { bu: BUSummaryRow; onClick: () => void }) {
  const profileLabel =
    bu.subscriptionRatio > 50 ? 'Accreditation-led' :
    bu.subscriptionRatio < 20 ? 'Skill-acquisition' : 'Balanced'

  const profileColor =
    bu.subscriptionRatio > 50 ? 'bg-blue-100 text-blue-700' :
    bu.subscriptionRatio < 20 ? 'bg-purple-100 text-purple-700' : 'bg-green-100 text-green-700'

  const coverageColor =
    bu.coverageRatio >= 70 ? 'text-green-700' :
    bu.coverageRatio >= 40 ? 'text-amber-700' : 'text-red-600'

  return (
    <div
      className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-blue-300 transition-all cursor-pointer group"
      onClick={onClick}
    >
      {/* Card header */}
      <div className="px-5 pt-5 pb-4 border-b border-slate-100 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-50 group-hover:bg-blue-100 flex items-center justify-center shrink-0 transition-colors mt-0.5">
            <Building2 className="w-4.5 h-4.5 text-blue-500" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800 leading-snug">{bu.name}</p>
            <span className={`inline-block mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${profileColor}`}>
              {profileLabel}
            </span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-slate-400">Total Investment</p>
          <p className="text-base font-bold text-blue-700 tabular-nums">{fmt(bu.totalInvestment)}</p>
        </div>
      </div>

      {/* Spend breakdown */}
      <div className="px-5 py-4 grid grid-cols-2 gap-4 border-b border-slate-100">
        <div>
          <p className="text-xs text-slate-400 mb-0.5">Training Spend</p>
          <p className="text-sm font-semibold text-slate-700 tabular-nums">{fmt(bu.trainingCost)}</p>
          {bu.budget > 0 && (
            <p className={`text-xs mt-0.5 ${bu.isOverBudget ? 'text-red-600 font-medium' : 'text-slate-400'}`}>
              {bu.isOverBudget ? '⚠ Over budget' : `${pct(bu.budgetUtilisation)} of budget`}
            </p>
          )}
        </div>
        <div>
          <p className="text-xs text-slate-400 mb-0.5">Subscription Spend</p>
          <p className="text-sm font-semibold text-slate-700 tabular-nums">{fmt(bu.subscriptionCost)}</p>
          <p className="text-xs text-slate-400 mt-0.5">{bu.subscriptionStaff} members</p>
        </div>
      </div>

      {/* Performance metrics */}
      <div className="px-5 py-4 grid grid-cols-3 gap-3">
        <div className="text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Users className="w-3 h-3 text-slate-400" />
            <p className="text-xs text-slate-400">Coverage</p>
          </div>
          <p className={`text-sm font-bold tabular-nums ${coverageColor}`}>
            {bu.totalStaff > 0 ? pct(bu.coverageRatio) : '—'}
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">{bu.staffTrained} trained</p>
        </div>
        <div className="text-center border-x border-slate-100">
          <div className="flex items-center justify-center gap-1 mb-1">
            <TrendingUp className="w-3 h-3 text-slate-400" />
            <p className="text-xs text-slate-400">Impact</p>
          </div>
          <p className={`text-sm font-bold tabular-nums ${
            bu.avgImpactScore >= 4.0 ? 'text-green-700' :
            bu.avgImpactScore >= 3.0 ? 'text-amber-700' : 'text-slate-400'
          }`}>
            {rating(bu.avgImpactScore)}
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">confidence</p>
        </div>
        <div className="text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Target className="w-3 h-3 text-slate-400" />
            <p className="text-xs text-slate-400">Budget</p>
          </div>
          <p className={`text-sm font-bold ${
            bu.isOverBudget ? 'text-red-600' :
            bu.budget > 0 ? 'text-green-700' : 'text-slate-400'
          }`}>
            {bu.isOverBudget ? 'Over' : bu.budget > 0 ? 'OK' : 'N/A'}
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">
            {bu.budget > 0 ? fmt(bu.budget) : 'not set'}
          </p>
        </div>
      </div>

      {/* Footer CTA */}
      <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 rounded-b-xl group-hover:bg-blue-50 transition-colors">
        <p className="text-xs text-blue-600 font-semibold group-hover:text-blue-700">
          Open full report →
        </p>
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function BusinessUnitsDashboard() {
  const [buList, setBuList] = useState<BUSummaryRow[]>([])
  const [availableYears, setAvailableYears] = useState<number[]>([])
  const [selectedBU, setSelectedBU] = useState<string | null>(null)
  const [buDetail, setBuDetail] = useState<BUDetailAnalytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [filter, setFilter] = useState<PeriodFilter>({ mode: 'all' })

  const loadGroup = useCallback(async (f: PeriodFilter) => {
    setLoading(true)
    try {
      const data = await (await fetch(`/api/analytics/group${filterToQuery(f)}`)).json()
      setBuList(data.businessUnits ?? [])
      setAvailableYears(data.availableYears ?? [])
    } finally { setLoading(false) }
  }, [])

  const loadBUDetail = useCallback(async (name: string) => {
    setDetailLoading(true)
    setBuDetail(null)
    try { setBuDetail(await (await fetch(`/api/analytics/bu?name=${encodeURIComponent(name)}`)).json()) }
    finally { setDetailLoading(false) }
  }, [])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadGroup(filter) }, [filter])
  useEffect(() => { if (selectedBU) loadBUDetail(selectedBU) }, [selectedBU, loadBUDetail])

  const openBU = (name: string) => setSelectedBU(name)
  const closeBU = () => { setSelectedBU(null); setBuDetail(null) }

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const exportRows = buList.map((b) => ({
    'Business Unit': b.name,
    'Total Investment (₦)': b.totalInvestment,
    'Training Spend (₦)': b.trainingCost,
    'Subscription Spend (₦)': b.subscriptionCost,
    'Staff Trained': b.staffTrained,
    'Total Staff': b.totalStaff,
    'Coverage %': b.totalStaff > 0 ? b.coverageRatio.toFixed(1) : '—',
    'Avg Impact (out of 5)': b.avgImpactScore.toFixed(1),
    'Budget (₦)': b.budget > 0 ? b.budget : '—',
    'Budget Utilisation %': b.budget > 0 ? b.budgetUtilisation.toFixed(1) : '—',
    'Budget Status': b.isOverBudget ? 'Over' : b.budget > 0 ? 'On Track' : 'Not Set',
    'Sub Ratio %': b.subscriptionRatio.toFixed(1),
    'Profile': b.subscriptionRatio > 50 ? 'Accreditation-led' : b.subscriptionRatio < 20 ? 'Skill-acquisition' : 'Balanced',
  }))

  return (
    <div className="flex flex-col bu-panel-host">
      <PageHeader
        title="Business Unit Insights"
        subtitle="Full overview of all business units — click any card to open the detailed report"
        actions={
          <div className="flex items-center gap-2">
            <FilterBar availableYears={availableYears} value={filter} onChange={setFilter} />
            <PDFExportButton reportTitle="Business Units Overview" />
            <button onClick={() => loadGroup(filter)} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
          </div>
        }
      />

      <div className="p-8 space-y-10">
        {buList.length === 0 ? (
          <AlertBadge variant="info" message="No business unit data found. Upload training or subscription data first." />
        ) : (
          <>
            {/* ── All BU Cards ── */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-bold text-slate-800">All Business Units</h2>
                <SectionExport rows={exportRows} filename="all_business_units" label="Export All" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {buList.map((bu) => (
                  <BUCard key={bu.name} bu={bu} onClick={() => openBU(bu.name)} />
                ))}
              </div>
            </section>

            {/* ── Group comparison charts ── */}
            <section>
              <h2 className="text-base font-bold text-slate-800 mb-4">Group Comparison</h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-slate-800">Total Learning Investment</h3>
                    <SectionExport rows={buList.map((b) => ({ 'Business Unit': b.name, 'Total Investment (₦)': b.totalInvestment }))} filename="bu_total_investment" />
                  </div>
                  <BarChart
                    labels={buList.map((b) => b.name)}
                    values={buList.map((b) => b.totalInvestment)}
                    color="#3b82f6"
                    height={Math.max(200, buList.length * 40)}
                    horizontal
                  />
                </div>
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-slate-800">Staff Coverage (%)</h3>
                    <SectionExport rows={buList.map((b) => ({ 'Business Unit': b.name, 'Coverage %': b.coverageRatio.toFixed(1) }))} filename="bu_coverage" />
                  </div>
                  <BarChart
                    labels={buList.map((b) => b.name)}
                    values={buList.map((b) => b.coverageRatio)}
                    color="#22c55e"
                    height={Math.max(200, buList.length * 40)}
                    horizontal
                  />
                </div>
              </div>
            </section>

            {/* ── Full comparison table ── */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-bold text-slate-800">Full Comparison Table</h2>
                <SectionExport rows={exportRows} filename="bu_full_comparison" />
              </div>
              <DataTable
                columns={[
                  {
                    key: 'name', header: 'Business Unit',
                    render: (r) => (
                      <button onClick={() => openBU(r.name as string)} className="text-blue-600 hover:underline font-medium text-left">
                        {r.name as string}
                      </button>
                    ),
                  },
                  { key: 'totalInvestment',   header: 'Total Investment',  align: 'right', render: (r) => fmt(r.totalInvestment as number) },
                  { key: 'trainingCost',       header: 'Training',          align: 'right', render: (r) => fmt(r.trainingCost as number) },
                  { key: 'subscriptionCost',   header: 'Subscriptions',     align: 'right', render: (r) => fmt(r.subscriptionCost as number) },
                  { key: 'staffTrained',       header: 'Trained',           align: 'right' },
                  {
                    key: 'coverageRatio', header: 'Coverage', align: 'right',
                    render: (r) => {
                      const v = r.coverageRatio as number
                      const ts = r.totalStaff as number
                      if (ts === 0) return <span className="text-slate-400">—</span>
                      return <span className={`font-semibold ${v >= 70 ? 'text-green-700' : v >= 40 ? 'text-amber-700' : 'text-red-600'}`}>{pct(v)}</span>
                    },
                  },
                  { key: 'avgImpactScore',     header: 'Impact',            align: 'right', render: (r) => rating(r.avgImpactScore as number) },
                  {
                    key: 'isOverBudget', header: 'Budget', align: 'center',
                    render: (r) => (
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        r.isOverBudget ? 'bg-red-100 text-red-700' :
                        (r.budget as number) === 0 ? 'bg-slate-100 text-slate-500' :
                        'bg-green-100 text-green-700'
                      }`}>
                        {r.isOverBudget ? 'Over' : (r.budget as number) === 0 ? 'Not set' : 'On track'}
                      </span>
                    ),
                  },
                ]}
                data={buList as unknown as Record<string, unknown>[]}
              />
            </section>
          </>
        )}
      </div>

      {/* ── BU deep-dive slide panel ── */}
      {selectedBU && (
        detailLoading ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-xl px-8 py-6 flex items-center gap-4 shadow-xl">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm font-medium text-slate-700">Loading {selectedBU}…</p>
            </div>
          </div>
        ) : buDetail ? (
          <BUDeepDivePanel buName={selectedBU} detail={buDetail} onClose={closeBU} filter={filter} />
        ) : null
      )}
    </div>
  )
}
