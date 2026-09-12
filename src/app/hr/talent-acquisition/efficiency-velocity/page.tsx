import { BarChart3, Clock, Zap, UserSearch } from 'lucide-react'
import { UnitPageHeader } from '@/components/hr/UnitPageHeader'
import { TaSubNav } from '@/components/hr/ta/TaSubNav'
import { TaFilterBar } from '@/components/hr/ta/TaFilterBar'
import { TaSampleDataBanner } from '@/components/hr/ta/TaSampleDataBanner'
import { BarChart } from '@/components/charts/BarChart'
import { getTaDashboardData, hasTaCredentials } from '@/lib/ta-sheets'
import { parseFilters, type SearchParams } from '@/lib/ta-filters'
import { agingRequisitions, applyFilters, buVelocityRanking, roleVelocityRanking, timeToHireDistribution, type VelocityRanking } from '@/lib/ta-metrics'

const AGING_WARNING_DAYS = 21

// Real port of the source repo's Efficiency & Velocity page — see
// /hr/talent-acquisition/page.tsx for the porting notes shared by all four TA views.
export default async function EfficiencyVelocityPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { records, config } = await getTaDashboardData()
  const filters = parseFilters(await searchParams)
  const filtered = applyFilters(records, filters)
  const usingSampleData = !hasTaCredentials()

  const distribution = timeToHireDistribution(filtered)
  const aging = agingRequisitions(filtered)
  const buRanking = buVelocityRanking(filtered)
  const roleRanking = roleVelocityRanking(filtered)

  return (
    <div>
      <UnitPageHeader title="Talent Acquisition" description="Hiring pipeline, time to fill, cost of hire" icon={UserSearch} />
      <TaSubNav />

      <div className="p-4 sm:p-8 space-y-6">
        {usingSampleData && <TaSampleDataBanner />}
        <h1 className="text-lg font-bold text-slate-800">Efficiency &amp; Velocity Metrics</h1>
        <TaFilterBar bus={config.bus} roles={config.roles} officeTypes={config.officeTypes} />

        <div className="bg-white border border-meristem-100 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="w-4 h-4 text-meristem-700" />
            <p className="text-sm font-bold text-slate-800">Time-to-Hire Distribution</p>
          </div>
          <BarChart labels={distribution.map((b) => b.label)} values={distribution.map((b) => b.count)} color="#5C8FB0" horizontal showLabels height={180} />
        </div>

        <div className="bg-white border border-meristem-100 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-4 h-4 text-meristem-700" />
            <p className="text-sm font-bold text-slate-800">Aging Requisitions (open pipeline)</p>
          </div>
          {aging.length === 0 ? (
            <p className="text-sm text-slate-400">No open requisitions in this range.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-400 uppercase tracking-wide border-b border-meristem-50">
                    <th className="py-2 pr-4 font-medium">Candidate</th>
                    <th className="py-2 pr-4 font-medium">Role</th>
                    <th className="py-2 pr-4 font-medium">BU</th>
                    <th className="py-2 pr-4 font-medium text-right">Days Elapsed</th>
                    <th className="py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {aging.map((r) => {
                    const level = r.daysElapsed >= AGING_WARNING_DAYS * 2 ? 'critical' : r.daysElapsed >= AGING_WARNING_DAYS ? 'warning' : 'good'
                    const styles = { good: 'text-meristem-700 border-meristem-200', warning: 'text-amber-600 border-amber-200', critical: 'text-rose-600 border-rose-200' } as const
                    const labels = { good: 'On track', warning: 'Aging', critical: 'Overdue' } as const
                    return (
                      <tr key={r.id} className="border-b border-meristem-50 last:border-0">
                        <td className="py-2 pr-4 text-slate-700 font-medium">{r.candidateName}</td>
                        <td className="py-2 pr-4 text-slate-600">{r.role}</td>
                        <td className="py-2 pr-4 text-slate-600">{r.bu}</td>
                        <td className="py-2 pr-4 text-right tabular-nums text-slate-600">{r.daysElapsed.toFixed(0)}</td>
                        <td className="py-2">
                          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium ${styles[level]}`}>{labels[level]}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <VelocityBlock title="BU Leaderboard — Fastest to Slowest" rows={buRanking} />
          <VelocityBlock title="Role Leaderboard — Fastest to Slowest" rows={roleRanking} />
        </div>
      </div>
    </div>
  )
}

function VelocityBlock({ title, rows }: { title: string; rows: VelocityRanking[] }) {
  return (
    <div className="bg-white border border-meristem-100 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Zap className="w-4 h-4 text-meristem-700" />
        <p className="text-sm font-bold text-slate-800">{title}</p>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-400">No completed hires in this range.</p>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-slate-400 uppercase tracking-wide border-b border-meristem-50">
              <th className="py-2 pr-2 font-medium">#</th>
              <th className="py-2 pr-4 font-medium">Name</th>
              <th className="py-2 pr-4 font-medium text-right">Avg Days</th>
              <th className="py-2 font-medium text-right">Hires</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.key} className="border-b border-meristem-50 last:border-0">
                <td className="py-2 pr-2 text-slate-400">{i + 1}</td>
                <td className="py-2 pr-4 text-slate-700 font-medium">{r.key}</td>
                <td className="py-2 pr-4 text-right tabular-nums text-slate-600">{r.avgDays.toFixed(0)}</td>
                <td className="py-2 text-right tabular-nums text-slate-600">{r.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
