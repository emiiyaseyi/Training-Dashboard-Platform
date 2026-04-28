'use client'

import { useEffect, useState, useCallback } from 'react'
import { Building2, RefreshCw, Users, Target, TrendingUp, BadgeCheck, FileDown } from 'lucide-react'
import { NairaSign } from '@/components/ui/NairaSign'
import { KPICard } from '@/components/ui/KPICard'
import { DataTable } from '@/components/ui/DataTable'
import { AlertBadge } from '@/components/ui/AlertBadge'
import { PageHeader } from '@/components/ui/PageHeader'
import { PDFExportButton } from '@/components/ui/PDFExportButton'
import { FilterBar } from '@/components/ui/FilterBar'
import { SectionExport } from '@/components/ui/SectionExport'
import { BarChart } from '@/components/charts/BarChart'
import { LineChart } from '@/components/charts/LineChart'
import { PieChart } from '@/components/charts/PieChart'
import type { BUDetailAnalytics } from '@/lib/analytics'
import { type PeriodFilter, filterToQuery } from '@/lib/filter-types'
import { exportExcel, nairaNum } from '@/lib/export'

function fmt(n: number) {
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `₦${(n / 1_000).toFixed(1)}K`
  return `₦${n.toLocaleString()}`
}
function pct(n: number) { return `${n.toFixed(1)}%` }

interface BUSummaryRow {
  name: string; trainingCost: number; subscriptionCost: number; totalInvestment: number
  staffTrained: number; totalStaff: number; coverageRatio: number; avgImpactScore: number
  isOverBudget: boolean; budget: number; subscriptionRatio: number
}

async function exportBUExcel(buName: string, detail: BUDetailAnalytics) {
  exportExcel([
    {
      name: 'Monthly Training Spend',
      rows: detail.monthlyTrainingSpend.map((m) => ({ Month: m.month, 'Cost (₦)': nairaNum(m.cost) })),
    },
    {
      name: 'Top Training Programmes',
      rows: detail.topTrainings.map((t) => ({
        Programme: t.training,
        Participants: t.count,
        'Total Cost (₦)': nairaNum(t.totalCost),
        'Avg Cost per Participant (₦)': nairaNum(t.totalCost / t.count),
      })),
    },
    {
      name: 'Application Rates',
      rows: detail.feedbackSummary.applicationRates.map((a) => ({ Category: a.category, Count: a.count })),
    },
    {
      name: 'Membership Organisations',
      rows: detail.subscriptionBreakdown.map((s) => ({
        Organisation: s.org,
        Members: s.count,
        'Total Amount (₦)': nairaNum(s.totalAmount),
        'Avg Cost (₦)': nairaNum(s.totalAmount / s.count),
      })),
    },
    {
      name: 'Training Programmes',
      rows: detail.topTrainings.map((t) => ({
        Programme: t.training,
        Participants: t.count,
        'Total Cost (₦)': nairaNum(t.totalCost),
      })),
    },
    {
      name: 'Impact Alignment Areas',
      rows: detail.feedbackSummary.impactAreas.map((a) => ({ 'Impact Area': a.area, Responses: a.count })),
    },
  ], `${buName.replace(/\s+/g, '_')}_BU_Report`)
}

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

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const detail = buDetail?.bu

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Business Unit Insights"
        subtitle="Group overview and deep-dive analytics per business unit"
        actions={
          <div className="flex items-center gap-2">
            <FilterBar availableYears={availableYears} value={filter} onChange={setFilter} />
            <PDFExportButton reportTitle={selectedBU ? `${selectedBU} — Business Unit Report` : 'Business Units Overview'} />
            <button onClick={() => loadGroup(filter)} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
          </div>
        }
      />

      <div className="p-8 space-y-8">
        {buList.length === 0 ? (
          <AlertBadge variant="info" message="No business unit data found. Upload training or subscription data first." />
        ) : (
          <>
            {/* ── All BUs overview ── */}
            <section>
              <h2 className="text-base font-semibold text-slate-800 mb-4">All Business Units</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                {buList.map((bu) => {
                  const isSelected = selectedBU === bu.name
                  return (
                    <button
                      key={bu.name}
                      onClick={() => setSelectedBU(isSelected ? null : bu.name)}
                      className={`rounded-xl border p-4 text-left transition-all ${isSelected ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200' : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-slate-50'}`}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${isSelected ? 'bg-blue-100' : 'bg-slate-100'}`}>
                        <Building2 className={`w-4 h-4 ${isSelected ? 'text-blue-600' : 'text-slate-500'}`} />
                      </div>
                      <p className={`text-xs font-semibold leading-snug ${isSelected ? 'text-blue-800' : 'text-slate-700'}`}>{bu.name}</p>
                      <p className={`text-xs mt-1 ${isSelected ? 'text-blue-600' : 'text-slate-400'}`}>{fmt(bu.totalInvestment)}</p>
                    </button>
                  )
                })}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-slate-800">Total Learning Investment by BU</h3>
                    <SectionExport rows={buList.map((b) => ({ 'Business Unit': b.name, 'Total Investment (₦)': b.totalInvestment }))} filename="bu_total_investment" />
                  </div>
                  <BarChart labels={buList.map((b) => b.name)} values={buList.map((b) => b.totalInvestment)} color="#3b82f6" height={Math.max(200, buList.length * 40)} horizontal />
                </div>
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-slate-800">Staff Coverage by BU</h3>
                    <SectionExport rows={buList.map((b) => ({ 'Business Unit': b.name, 'Coverage %': b.coverageRatio.toFixed(1) }))} filename="bu_coverage" />
                  </div>
                  <BarChart labels={buList.map((b) => b.name)} values={buList.map((b) => b.coverageRatio)} color="#22c55e" height={Math.max(200, buList.length * 40)} horizontal />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-slate-800">Group Comparison</span>
                  <SectionExport rows={buList.map((b) => ({ 'Business Unit': b.name, 'Total Investment (₦)': b.totalInvestment, 'Training (₦)': b.trainingCost, 'Subscriptions (₦)': b.subscriptionCost, 'Coverage %': b.coverageRatio.toFixed(1), 'Impact %': b.avgImpactScore.toFixed(1) }))} filename="bu_comparison" />
                </div>
                <DataTable
                  columns={[
                    { key: 'name', header: 'Business Unit', render: (r) => (<button onClick={() => setSelectedBU(r.name as string)} className="text-blue-600 hover:text-blue-800 font-medium text-left">{r.name as string}</button>) },
                    { key: 'totalInvestment', header: 'Total Investment', align: 'right', render: (r) => fmt(r.totalInvestment as number) },
                    { key: 'trainingCost', header: 'Training', align: 'right', render: (r) => fmt(r.trainingCost as number) },
                    { key: 'subscriptionCost', header: 'Subscriptions', align: 'right', render: (r) => fmt(r.subscriptionCost as number) },
                    { key: 'coverageRatio', header: 'Coverage', align: 'right', render: (r) => { const v = r.coverageRatio as number; return <span className={`font-medium ${v >= 70 ? 'text-green-700' : v >= 40 ? 'text-amber-700' : 'text-red-700'}`}>{pct(v)}</span> } },
                    { key: 'avgImpactScore', header: 'Impact', align: 'right', render: (r) => pct(r.avgImpactScore as number) },
                  ]}
                  data={buList as unknown as Record<string, unknown>[]}
                />
              </div>
            </section>

            {/* ── Individual BU deep-dive ── */}
            {selectedBU && (
              <section className="border-t border-slate-200 pt-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center">
                    <Building2 className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-slate-800">{selectedBU}</h2>
                    <p className="text-xs text-slate-500">Business unit deep-dive</p>
                  </div>
                  <div className="ml-auto flex items-center gap-2 no-print">
                    {buDetail && (
                      <button
                        onClick={() => exportBUExcel(selectedBU, buDetail)}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-green-200 bg-green-50 text-green-700 text-sm font-medium hover:bg-green-100 transition-colors"
                      >
                        <FileDown className="w-4 h-4" />
                        Export to Excel
                      </button>
                    )}
                    <button onClick={() => setSelectedBU(null)} className="text-xs text-slate-400 hover:text-slate-600">Close ✕</button>
                  </div>
                </div>

                {detailLoading ? (
                  <div className="flex items-center gap-3 text-sm text-slate-500">
                    <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    Loading {selectedBU}…
                  </div>
                ) : detail && buDetail ? (
                  <>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                      <KPICard title="Training Spend" value={fmt(detail.trainingCost)} subtitle={`Budget: ${detail.budget > 0 ? fmt(detail.budget) : 'Not set'}`} icon={NairaSign} color="blue" alert={detail.isOverBudget} />
                      <KPICard title="Subscription Spend" value={fmt(detail.subscriptionCost)} subtitle="Professional memberships" icon={BadgeCheck} color="green" />
                      <KPICard title="Total Investment" value={fmt(detail.totalInvestment)} subtitle={`Sub ratio: ${pct(detail.subscriptionRatio)}`} icon={TrendingUp} color="purple" />
                      <KPICard title="Staff Coverage" value={pct(detail.coverageRatio)} subtitle={`${detail.staffTrained} of ${detail.totalStaff} trained`} icon={Users} color={detail.coverageRatio >= 70 ? 'green' : 'amber'} />
                    </div>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                      <KPICard title="Avg Impact Score" value={pct(detail.avgImpactScore)} subtitle="From feedback confidence ratings" icon={Target} color={detail.avgImpactScore >= 70 ? 'green' : 'amber'} />
                      <KPICard title="Budget Utilisation" value={detail.budget > 0 ? pct(detail.budgetUtilisation) : 'N/A'} subtitle={detail.isOverBudget ? 'Over budget' : 'Within budget'} icon={NairaSign} color={detail.isOverBudget ? 'red' : 'slate'} alert={detail.isOverBudget} />
                      <KPICard title="Subscription Members" value={detail.subscriptionStaff.toLocaleString()} subtitle="Staff with active memberships" icon={BadgeCheck} color="blue" />
                      <KPICard title="Learning Profile" value={detail.subscriptionRatio > 50 ? 'Accreditation' : detail.subscriptionRatio < 20 ? 'Skill Build' : 'Balanced'} subtitle="Based on investment split" icon={Building2} color={detail.subscriptionRatio > 50 ? 'blue' : detail.subscriptionRatio < 20 ? 'purple' : 'green'} />
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-sm font-semibold text-slate-800">Monthly Training Spend</h3>
                          <SectionExport rows={buDetail.monthlyTrainingSpend.map((m) => ({ Month: m.month, 'Cost (₦)': m.cost }))} filename={`${selectedBU}_monthly_spend`} />
                        </div>
                        {buDetail.monthlyTrainingSpend.length > 0
                          ? <LineChart labels={buDetail.monthlyTrainingSpend.map((m) => m.month)} values={buDetail.monthlyTrainingSpend.map((m) => m.cost)} height={220} />
                          : <p className="text-sm text-slate-400 py-8 text-center">No monthly data</p>}
                      </div>
                      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-sm font-semibold text-slate-800">Top Training Programmes</h3>
                          <SectionExport rows={buDetail.topTrainings.map((t) => ({ Programme: t.training, Participants: t.count, 'Cost (₦)': t.totalCost }))} filename={`${selectedBU}_top_trainings`} />
                        </div>
                        {buDetail.topTrainings.length > 0
                          ? <BarChart labels={buDetail.topTrainings.map((t) => t.training)} values={buDetail.topTrainings.map((t) => t.totalCost)} color="#a855f7" height={Math.max(200, buDetail.topTrainings.length * 38)} horizontal />
                          : <p className="text-sm text-slate-400 py-8 text-center">No training data</p>}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                      {buDetail.feedbackSummary.applicationRates.length > 0 && (
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-semibold text-slate-800">Application Rates</h3>
                            <SectionExport rows={buDetail.feedbackSummary.applicationRates.map((a) => ({ Category: a.category, Count: a.count }))} filename={`${selectedBU}_application_rates`} />
                          </div>
                          <PieChart labels={buDetail.feedbackSummary.applicationRates.map((a) => a.category)} values={buDetail.feedbackSummary.applicationRates.map((a) => a.count)} donut height={220} />
                        </div>
                      )}
                      {buDetail.subscriptionBreakdown.length > 0 && (
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-semibold text-slate-800">Membership Organisations</h3>
                            <SectionExport rows={buDetail.subscriptionBreakdown.map((s) => ({ Organisation: s.org, Members: s.count, 'Amount (₦)': s.totalAmount }))} filename={`${selectedBU}_membership_orgs`} />
                          </div>
                          <BarChart labels={buDetail.subscriptionBreakdown.map((s) => s.org)} values={buDetail.subscriptionBreakdown.map((s) => s.totalAmount)} color="#22c55e" height={Math.max(200, buDetail.subscriptionBreakdown.length * 36)} horizontal={buDetail.subscriptionBreakdown.length > 2} />
                        </div>
                      )}
                    </div>

                    {buDetail.topTrainings.length > 0 && (
                      <div className="mb-6">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-semibold text-slate-800">Training Programmes — {selectedBU}</span>
                          <SectionExport rows={buDetail.topTrainings.map((t) => ({ Programme: t.training, Participants: t.count, 'Total Cost (₦)': t.totalCost }))} filename={`${selectedBU}_programmes`} />
                        </div>
                        <DataTable
                          columns={[
                            { key: 'training', header: 'Programme' },
                            { key: 'count', header: 'Participants', align: 'right' },
                            { key: 'totalCost', header: 'Total Cost', align: 'right', render: (r) => fmt(r.totalCost as number) },
                          ]}
                          data={buDetail.topTrainings as unknown as Record<string, unknown>[]}
                        />
                      </div>
                    )}

                    {buDetail.feedbackSummary.impactAreas.length > 0 && (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-semibold text-slate-800">Impact Alignment Areas</span>
                          <SectionExport rows={buDetail.feedbackSummary.impactAreas.map((a) => ({ 'Impact Area': a.area, Responses: a.count }))} filename={`${selectedBU}_impact_areas`} />
                        </div>
                        <DataTable
                          columns={[
                            { key: 'area', header: 'Impact Area' },
                            { key: 'count', header: 'Responses', align: 'right' },
                          ]}
                          data={buDetail.feedbackSummary.impactAreas as unknown as Record<string, unknown>[]}
                        />
                      </div>
                    )}
                  </>
                ) : null}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}
