import { Users, Award, Calendar, Table2, UserSearch } from 'lucide-react'
import { UnitPageHeader } from '@/components/hr/UnitPageHeader'
import { TaSubNav } from '@/components/hr/ta/TaSubNav'
import { TaFilterBar } from '@/components/hr/ta/TaFilterBar'
import { TaSampleDataBanner } from '@/components/hr/ta/TaSampleDataBanner'
import { BarChart } from '@/components/charts/BarChart'
import { LineChart } from '@/components/charts/LineChart'
import { getTaDashboardData, hasTaCredentials } from '@/lib/ta-sheets'
import { parseFilters, type SearchParams } from '@/lib/ta-filters'
import { formatTaCurrency } from '@/lib/ta-format'
import { topNWithOther } from '@/lib/ta-chart-data'
import { applyFilters, headcountByBU, hiringSeasonality, monthlyBreakdown, roleConcentration } from '@/lib/ta-metrics'

// Real port of the source repo's BU & Role Demographics page — see
// /hr/talent-acquisition/page.tsx for the porting notes shared by all four TA views.
export default async function BuRoleDemographicsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { records, config } = await getTaDashboardData()
  const filters = parseFilters(await searchParams)
  const filtered = applyFilters(records, filters)
  const usingSampleData = !hasTaCredentials()

  const headcount = headcountByBU(filtered)
  const roles = topNWithOther(roleConcentration(filtered), 10)
  const seasonality = hiringSeasonality(filtered)
  const monthly = monthlyBreakdown(filtered)

  return (
    <div>
      <UnitPageHeader title="Talent Acquisition" description="Hiring pipeline, time to fill, cost of hire" icon={UserSearch} />
      <TaSubNav />

      <div className="p-4 sm:p-8 space-y-6">
        {usingSampleData && <TaSampleDataBanner />}
        <h1 className="text-lg font-bold text-slate-800">BU &amp; Role Demographics</h1>
        <TaFilterBar bus={config.bus} roles={config.roles} officeTypes={config.officeTypes} />

        <div className="grid gap-4 md:grid-cols-2">
          <ChartBlock title="Headcount by BU" icon={Users}>
            <BarChart labels={headcount.map((g) => g.key)} values={headcount.map((g) => g.count)} color="#2F6B2B" showLabels height={Math.max(180, headcount.length * 30)} horizontal />
          </ChartBlock>
          <ChartBlock title="Role Concentration" icon={Award}>
            <BarChart labels={roles.map((g) => g.key)} values={roles.map((g) => g.count)} color="#7A66B0" showLabels height={Math.max(180, roles.length * 30)} horizontal />
          </ChartBlock>
        </div>

        <ChartBlock title="Hiring Seasonality" icon={Calendar}>
          <LineChart labels={seasonality.map((p) => p.period)} values={seasonality.map((p) => p.count)} color="#3F7590" height={260} />
        </ChartBlock>

        <div className="bg-white border border-meristem-100 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Table2 className="w-4 h-4 text-meristem-700" />
            <p className="text-sm font-bold text-slate-800">Monthly Breakdown</p>
          </div>
          {monthly.length === 0 ? (
            <p className="text-sm text-slate-400">No offers in this range.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-400 uppercase tracking-wide border-b border-meristem-50">
                    <th className="py-2 pr-4 font-medium">Month</th>
                    <th className="py-2 pr-4 font-medium text-right">Offers Extended</th>
                    <th className="py-2 pr-4 font-medium text-right">Accepted</th>
                    <th className="py-2 pr-4 font-medium text-right">Declined</th>
                    <th className="py-2 pr-4 font-medium text-right">Avg Time to Fill</th>
                    <th className="py-2 font-medium text-right">Total Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {monthly.map((r) => (
                    <tr key={r.month} className="border-b border-meristem-50 last:border-0">
                      <td className="py-2 pr-4 text-slate-700 font-medium">{r.month}</td>
                      <td className="py-2 pr-4 text-right tabular-nums text-slate-600">{r.offersExtended}</td>
                      <td className="py-2 pr-4 text-right tabular-nums text-slate-600">{r.accepted}</td>
                      <td className="py-2 pr-4 text-right tabular-nums text-slate-600">{r.declined}</td>
                      <td className="py-2 pr-4 text-right tabular-nums text-slate-600">{r.avgTimeToFillDays == null ? '—' : `${r.avgTimeToFillDays.toFixed(0)}d`}</td>
                      <td className="py-2 text-right tabular-nums font-semibold text-slate-800">{formatTaCurrency(r.totalCost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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
