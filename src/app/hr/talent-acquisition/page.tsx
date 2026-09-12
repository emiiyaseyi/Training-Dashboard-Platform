import { Send, CheckCircle2, Clock, Wallet, UserSearch, Building2, GitBranch, Landmark, TrendingUp, Share2, BarChart3, Zap, Users, Award, Calendar } from 'lucide-react'
import { UnitPageHeader } from '@/components/hr/UnitPageHeader'
import { TaSubNav } from '@/components/hr/ta/TaSubNav'
import { TaStatTile } from '@/components/hr/ta/TaStatTile'
import { TaRingStat } from '@/components/hr/ta/TaRingStat'
import { TaSampleDataBanner } from '@/components/hr/ta/TaSampleDataBanner'
import { BarChart } from '@/components/charts/BarChart'
import { PieChart } from '@/components/charts/PieChart'
import { LineChart } from '@/components/charts/LineChart'
import { getTaDashboardData, hasTaCredentials } from '@/lib/ta-sheets'
import { parseFilters, type SearchParams } from '@/lib/ta-filters'
import { formatTaCurrency } from '@/lib/ta-format'
import { topNWithOther } from '@/lib/ta-chart-data'
import {
  applyFilters, averageCostOfHire, averageTimeToFillDays, averageTimeToFillWeeks, averageTimeToHireDays,
  costBreakdownByCategory, headcountByBU, hiringSeasonality, hiringSourceBreakdown, monthlyBreakdown,
  offerAcceptanceRate, pipelineByRole, roleConcentration, totalInvestmentByBU, totalOffersAccepted,
  totalOffersExtended, buVelocityRanking, timeToHireDistribution, withdrawalRate,
} from '@/lib/ta-metrics'

// Real port of github.com/emiiyaseyi/Talent-Recruitment-Dashboard's Executive Summary page —
// same metrics engine (lib/ta-metrics.ts), same Hires/Pipeline/Config sheet schema, restyled to
// this app's meristem look and its own Plotly-based chart components instead of the source
// repo's Recharts + CSS-variable theme. Falls back to sample data (banner shown) until
// TA_GOOGLE_SERVICE_ACCOUNT_EMAIL/TA_GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY/TA_GOOGLE_SHEET_ID are set.
export default async function TalentAcquisitionPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { records: allRecords, pipeline, config } = await getTaDashboardData()
  const filters = parseFilters(await searchParams)
  const records = applyFilters(allRecords, filters)
  const usingSampleData = !hasTaCredentials()

  const avgWeeks = averageTimeToFillWeeks(records)
  const avgDays = averageTimeToFillDays(records)
  const avgCost = averageCostOfHire(records)

  const officeTypes = config.officeTypes.length > 0 ? config.officeTypes : ['Front Office', 'Back Office']
  const segments = officeTypes.map((officeType) => {
    const segRecords = applyFilters(records, { officeType })
    return {
      officeType,
      avgDaysToHire: averageTimeToHireDays(segRecords),
      avgDaysToFill: averageTimeToFillDays(segRecords),
      acceptanceRate: offerAcceptanceRate(segRecords),
      withdrawalRate: withdrawalRate(segRecords),
    }
  })

  const pipelineStages = config.pipelineStages.length > 0
    ? config.pipelineStages
    : ['Requisition', 'Psychometric Assessment', 'First Level with Hiring Team', 'Second Level with HBUs', 'Offer', 'Medical', 'Resumption']
  const pipelineRows = pipelineByRole(pipeline, pipelineStages)

  const costBreakdown = costBreakdownByCategory(records)
  const buSpend = totalInvestmentByBU(records).slice(0, 6)
  const monthlyCosts = monthlyBreakdown(records).map((m) => ({ period: m.month, value: m.totalCost }))
  const hiringSources = hiringSourceBreakdown(records)
  const distribution = timeToHireDistribution(records)
  const buVelocity = buVelocityRanking(records).slice(0, 3)
  const headcount = topNWithOther(headcountByBU(records), 6)
  const topRoles = topNWithOther(roleConcentration(records), 5)
  const seasonality = hiringSeasonality(records)

  const asOf = new Date().toLocaleDateString('en-NG', { year: 'numeric', month: 'long', day: 'numeric' })

  return (
    <div>
      <UnitPageHeader title="Talent Acquisition" description="Hiring pipeline, time to fill, cost of hire" icon={UserSearch} />
      <TaSubNav />

      <div className="p-4 sm:p-8 space-y-6">
        {usingSampleData && <TaSampleDataBanner />}

        <p className="text-xs text-slate-400">As of {asOf}</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <TaStatTile label="Total Offers Extended" value={String(totalOffersExtended(records))} icon={Send} />
          <TaStatTile label="Total Offers Accepted" value={String(totalOffersAccepted(records))} icon={CheckCircle2} />
          <TaStatTile label="Average Time to Fill" value={avgWeeks == null ? '—' : `${avgWeeks.toFixed(1)} weeks`} sublabel={avgDays == null ? undefined : `${avgDays.toFixed(0)} days`} icon={Clock} />
          <TaStatTile label="Average Cost of Hire" value={avgCost == null ? '—' : formatTaCurrency(avgCost)} icon={Wallet} />
        </div>

        <div>
          <p className="text-sm font-bold text-slate-800 mb-3">Hiring by Office</p>
          <div className="grid gap-4 md:grid-cols-2">
            {segments.map((s) => (
              <div key={s.officeType} className="bg-white border border-meristem-100 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Building2 className="w-4 h-4 text-meristem-700" />
                  <p className="text-sm font-bold text-slate-800">{s.officeType} Hiring</p>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-xl font-bold text-slate-800 tabular-nums">{s.avgDaysToHire == null ? '—' : (s.avgDaysToHire / 7).toFixed(1)}</p>
                    <p className="text-[11px] text-slate-500">Avg. weeks to hire</p>
                    {s.avgDaysToHire != null && <p className="text-[10px] text-slate-400">{s.avgDaysToHire.toFixed(0)} days</p>}
                  </div>
                  <div>
                    <p className="text-xl font-bold text-slate-800 tabular-nums">{s.avgDaysToFill == null ? '—' : (s.avgDaysToFill / 7).toFixed(1)}</p>
                    <p className="text-[11px] text-slate-500">Avg. weeks to fill</p>
                    {s.avgDaysToFill != null && <p className="text-[10px] text-slate-400">{s.avgDaysToFill.toFixed(0)} days</p>}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-meristem-50">
                  <TaRingStat percent={s.acceptanceRate} label="Offer acceptance" color="#2F6B2B" icon={CheckCircle2} />
                  <TaRingStat percent={s.withdrawalRate} label="Withdrawal rate" sublabel="of resolved offers" color="#B0714F" />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-meristem-100 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <GitBranch className="w-4 h-4 text-meristem-700" />
            <p className="text-sm font-bold text-slate-800">Current Hiring Pipeline</p>
          </div>
          {pipelineRows.length === 0 ? (
            <p className="text-sm text-slate-400">No open roles in the pipeline right now.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-400 uppercase tracking-wide border-b border-meristem-50">
                    <th className="py-2 pr-4 font-medium">Role</th>
                    {pipelineStages.map((s) => <th key={s} className="py-2 pr-4 font-medium text-right">{s}</th>)}
                    <th className="py-2 font-medium text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {pipelineRows.map((row) => (
                    <tr key={row.role} className="border-b border-meristem-50 last:border-0">
                      <td className="py-2 pr-4 text-slate-700 font-medium">{row.role}</td>
                      {pipelineStages.map((s) => <td key={s} className="py-2 pr-4 text-right tabular-nums text-slate-600">{row.stageCounts[s] ?? 0}</td>)}
                      <td className="py-2 text-right tabular-nums font-semibold text-slate-800">{row.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div>
          <p className="text-sm font-bold text-slate-800 mb-3">Financial Snapshot</p>
          <div className="grid gap-4 md:grid-cols-2">
            <ChartBlock title="Cost Breakdown by Category" icon={Wallet}>
              <PieChart labels={costBreakdown.map((c) => c.category)} values={costBreakdown.map((c) => c.amount)} donut showAmounts height={260} />
            </ChartBlock>
            <ChartBlock title="Total Recruitment Investment by BU" icon={Landmark}>
              <BarChart labels={buSpend.map((g) => g.key)} values={buSpend.map((g) => g.total)} color="#2F6B2B" horizontal showLabels labelFormatter={formatTaCurrency} height={Math.max(180, buSpend.length * 36)} />
            </ChartBlock>
            <ChartBlock title="Recruitment Costs" icon={TrendingUp}>
              <LineChart labels={monthlyCosts.map((m) => m.period)} values={monthlyCosts.map((m) => m.value)} color="#2F6B2B" height={260} />
            </ChartBlock>
            <ChartBlock title="Top Hiring Sources" icon={Share2}>
              <BarChart labels={hiringSources.map((g) => g.key)} values={hiringSources.map((g) => g.count)} color="#B0714F" showLabels height={280} />
            </ChartBlock>
          </div>
        </div>

        <div>
          <p className="text-sm font-bold text-slate-800 mb-3">Efficiency Snapshot</p>
          <div className="grid gap-4 md:grid-cols-2">
            <ChartBlock title="Time-to-Hire Distribution" icon={BarChart3}>
              <BarChart labels={distribution.map((b) => b.label)} values={distribution.map((b) => b.count)} color="#5C8FB0" horizontal showLabels height={180} />
            </ChartBlock>
            <ChartBlock title="Fastest BUs to Onboard (top 3)" icon={Zap}>
              {buVelocity.length === 0 ? (
                <p className="text-sm text-slate-400">No completed hires yet.</p>
              ) : (
                <ul className="space-y-3">
                  {buVelocity.map((v, i) => (
                    <li key={v.key} className="flex items-center justify-between text-sm">
                      <span className="text-slate-600">{i + 1}. {v.key}</span>
                      <span className="tabular-nums text-slate-800 font-medium">{v.avgDays.toFixed(0)} days avg ({v.count} hires)</span>
                    </li>
                  ))}
                </ul>
              )}
            </ChartBlock>
          </div>
        </div>

        <div>
          <p className="text-sm font-bold text-slate-800 mb-3">Demographics Snapshot</p>
          <div className="grid gap-4 md:grid-cols-2">
            <ChartBlock title="Headcount by BU" icon={Users}>
              <BarChart labels={headcount.map((g) => g.key)} values={headcount.map((g) => g.count)} color="#2F6B2B" showLabels height={240} />
            </ChartBlock>
            <ChartBlock title="Top Roles by Concentration" icon={Award}>
              <BarChart labels={topRoles.map((g) => g.key)} values={topRoles.map((g) => g.count)} color="#7A66B0" showLabels height={240} />
            </ChartBlock>
          </div>
        </div>

        <div>
          <p className="text-sm font-bold text-slate-800 mb-3">Trend Snapshot</p>
          <ChartBlock title="Hiring Seasonality" icon={Calendar}>
            <LineChart labels={seasonality.map((p) => p.period)} values={seasonality.map((p) => p.count)} color="#3F7590" height={260} />
          </ChartBlock>
        </div>
      </div>
    </div>
  )
}

function ChartBlock({ title, icon: Icon, children }: { title: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-meristem-100 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-meristem-700" />
        <p className="text-sm font-bold text-slate-800">{title}</p>
      </div>
      {children}
    </div>
  )
}
