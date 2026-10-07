import { Wallet, Landmark, Users, TrendingUp, UserSearch, Repeat2 } from 'lucide-react'
import { UnitPageHeader } from '@/components/hr/UnitPageHeader'
import { TaSubNav } from '@/components/hr/ta/TaSubNav'
import { TaFilterBar } from '@/components/hr/ta/TaFilterBar'
import { TaStatTile } from '@/components/hr/ta/TaStatTile'
import { TaSampleDataBanner, TaConnectionErrorBanner } from '@/components/hr/ta/TaSampleDataBanner'
import { BarChart } from '@/components/charts/BarChart'
import { PieChart } from '@/components/charts/PieChart'
import { LineChart } from '@/components/charts/LineChart'
import { getTaDashboardData, hasTaCredentials } from '@/lib/ta-sheets'
import { parseFilters, distinctRequisitionYears, type SearchParams } from '@/lib/ta-filters'
import { formatTaCurrency } from '@/lib/ta-format'
import { applyFilters, averageCostOfHire, averageCostPerConversion, costBreakdownByCategory, costPerHireByRole, costPerHireTrend, totalInvestmentByBU } from '@/lib/ta-metrics'

// Real port of the source repo's Financial Insights page — see /hr/talent-acquisition/page.tsx
// for the porting notes shared by all four TA views.
export default async function FinancialInsightsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { records, conversions, config, connectionError } = await getTaDashboardData()
  const filters = parseFilters(await searchParams)
  const filtered = applyFilters(records, filters)
  const usingSampleData = !hasTaCredentials()
  const availableYears = distinctRequisitionYears(records)

  const avgCost = averageCostOfHire(filtered)
  const avgCostPerConversion = averageCostPerConversion(conversions)
  const breakdown = costBreakdownByCategory(filtered)
  const byBU = totalInvestmentByBU(filtered)
  const byRole = costPerHireByRole(filtered)
  const trend = costPerHireTrend(filtered)

  return (
    <div>
      <UnitPageHeader title="Talent Acquisition" description="Hiring pipeline, time to fill, cost of hire" icon={<UserSearch className="w-5 h-5 text-meristem-700" />} />
      <TaSubNav />

      <div className="p-4 sm:p-8 space-y-6">
        {connectionError ? <TaConnectionErrorBanner message={connectionError} /> : usingSampleData && <TaSampleDataBanner />}
        <h1 className="text-lg font-bold text-slate-800">Financial Insights</h1>
        <TaFilterBar bus={config.bus} roles={config.roles} officeTypes={config.officeTypes} availableYears={availableYears} />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TaStatTile label="Average Cost of Hire" value={avgCost == null ? '—' : formatTaCurrency(avgCost)} icon={Wallet} />
          <TaStatTile label="Average Cost per Conversion" value={avgCostPerConversion == null ? '—' : formatTaCurrency(avgCostPerConversion)} sublabel={`${conversions.length} conversion${conversions.length === 1 ? '' : 's'}`} icon={Repeat2} />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <ChartBlock title="Cost Breakdown by Category" icon={Wallet}>
            {breakdown.every((c) => c.amount === 0) ? <NoData /> : <PieChart labels={breakdown.map((c) => c.category)} values={breakdown.map((c) => c.amount)} donut showAmounts height={260} />}
          </ChartBlock>
          <ChartBlock title="Total Recruitment Investment by BU" icon={Landmark}>
            {byBU.length === 0 ? <NoData /> : <BarChart labels={byBU.map((g) => g.key)} values={byBU.map((g) => g.total)} color="#2F6B2B" horizontal showLabels labelText={byBU.map((g) => formatTaCurrency(g.total))} height={Math.max(180, byBU.length * 36)} />}
          </ChartBlock>
          <ChartBlock title="Cost per Hire by Role" icon={Users}>
            {byRole.length === 0 ? <NoData /> : <BarChart labels={byRole.map((g) => g.key)} values={byRole.map((g) => g.avg)} color="#7A66B0" horizontal showLabels labelText={byRole.map((g) => formatTaCurrency(g.avg))} height={Math.max(180, byRole.length * 36)} />}
          </ChartBlock>
          <ChartBlock title="Cost per Hire Trend" icon={TrendingUp}>
            {trend.length === 0 ? <NoData /> : <LineChart labels={trend.map((p) => p.month)} values={trend.map((p) => p.value)} color="#3F7590" height={260} />}
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

function NoData() {
  return <p className="text-sm text-slate-400 py-8 text-center">No data for this period/filter.</p>
}
