import { Search, Clock, GitBranch, XCircle } from 'lucide-react'
import { UnitPageHeader } from '@/components/hr/UnitPageHeader'
import { TaSubNav } from '@/components/hr/ta/TaSubNav'
import { TaFilterBar } from '@/components/hr/ta/TaFilterBar'
import { TaPeriodFilter } from '@/components/hr/ta/TaPeriodFilter'
import { TaSampleDataBanner, TaConnectionErrorBanner } from '@/components/hr/ta/TaSampleDataBanner'
import { getTaDashboardData, hasTaCredentials } from '@/lib/ta-sheets'
import { parseFilters, distinctRequisitionYears, type SearchParams } from '@/lib/ta-filters'
import { formatTaCurrency } from '@/lib/ta-format'
import { applyFilters, sourceRoleBottlenecks, pipelineStageBottlenecks, declinedRateBySource } from '@/lib/ta-metrics'

// Diagnostic layer for Talent Acquisition — the first of four stages (Descriptive -> Diagnostic
// -> Predictive -> Prescriptive) this unit is being walked through. Deliberately a separate tab
// from the descriptive views (Executive Summary, Financial Insights, etc.) rather than folded
// into them — those answer "what happened"; this answers "why," by finding which specific
// combination of factors drives a blended average, which no single top-level number can show.
// Predictive and Prescriptive views land here later, once this diagnostic layer is confirmed useful.
export default async function TalentAcquisitionInsightsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { records: allRecords, pipeline, config, connectionError } = await getTaDashboardData()
  const filters = parseFilters(await searchParams)
  const records = applyFilters(allRecords, filters)
  const usingSampleData = !hasTaCredentials()
  const availableYears = distinctRequisitionYears(allRecords)

  const pipelineStages = config.pipelineStages.length > 0
    ? config.pipelineStages
    : ['Requisition', 'Psychometric Assessment', 'First Level with Hiring Team', 'Second Level with HBUs', 'Offer', 'Medical', 'Resumption']

  const bottlenecks = sourceRoleBottlenecks(records).slice(0, 10)
  const stageBottlenecks = pipelineStageBottlenecks(pipeline, pipelineStages)
  const declineRates = declinedRateBySource(records)

  return (
    <div>
      <UnitPageHeader
        title="Talent Acquisition"
        description="Hiring pipeline, time to fill, cost of hire"
        icon={<Search className="w-5 h-5 text-meristem-700" />}
        actions={<TaPeriodFilter availableYears={availableYears} />}
      />
      <TaSubNav />

      <div className="p-4 sm:p-8 space-y-6">
        {connectionError ? <TaConnectionErrorBanner message={connectionError} /> : usingSampleData && <TaSampleDataBanner />}
        <div>
          <h1 className="text-lg font-bold text-slate-800">Insights</h1>
          <p className="text-xs text-slate-500 mt-0.5">Diagnostic — finding WHY, not just reporting what happened. Predictive and prescriptive views follow once this layer earns its keep.</p>
        </div>
        <TaFilterBar bus={config.bus} roles={config.roles} officeTypes={config.officeTypes} />

        <div className="bg-white border border-meristem-100 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-meristem-700" />
            <p className="text-sm font-bold text-slate-800">Time to Fill &amp; Cost Bottlenecks</p>
          </div>
          <p className="text-xs text-slate-500 mb-4">A blended &quot;Average Time to Fill&quot; hides which specific Hiring Source + Role combination is actually slow. Ranked worst-first; combinations with fewer than 2 hires are excluded as too thin a sample to trust.</p>
          {bottlenecks.length === 0 ? (
            <p className="text-sm text-slate-400 py-6 text-center">No hiring-source + role combination has enough hires in this period/filter to rank.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-400 uppercase tracking-wide border-b border-meristem-50">
                    <th className="py-2 pr-4 font-medium">Hiring Source</th>
                    <th className="py-2 pr-4 font-medium">Role</th>
                    <th className="py-2 pr-4 font-medium text-right">Avg. Time to Fill</th>
                    <th className="py-2 pr-4 font-medium text-right">Avg. Cost</th>
                    <th className="py-2 font-medium text-right">Hires</th>
                  </tr>
                </thead>
                <tbody>
                  {bottlenecks.map((b, i) => (
                    <tr key={`${b.hiringSource}-${b.role}`} className="border-b border-meristem-50 last:border-0">
                      <td className="py-2 pr-4 text-slate-700 font-medium">{b.hiringSource}</td>
                      <td className="py-2 pr-4 text-slate-600">{b.role}</td>
                      <td className={`py-2 pr-4 text-right tabular-nums font-semibold ${i === 0 ? 'text-rose-600' : 'text-slate-700'}`}>{(b.avgTimeToFillDays / 7).toFixed(1)} weeks</td>
                      <td className="py-2 pr-4 text-right tabular-nums text-slate-600">{formatTaCurrency(b.avgCost)}</td>
                      <td className="py-2 text-right tabular-nums text-slate-500">{b.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-white border border-meristem-100 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <GitBranch className="w-4 h-4 text-meristem-700" />
            <p className="text-sm font-bold text-slate-800">Pipeline Stage Bottlenecks</p>
          </div>
          <p className="text-xs text-slate-500 mb-4">Where open requisitions are stuck RIGHT NOW, aggregated across every candidate by current stage — not just that some are aging, but which specific stage in the process is the real chokepoint.</p>
          {stageBottlenecks.length === 0 ? (
            <p className="text-sm text-slate-400 py-6 text-center">No open pipeline candidates in this period/filter.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-400 uppercase tracking-wide border-b border-meristem-50">
                    <th className="py-2 pr-4 font-medium">Stage</th>
                    <th className="py-2 pr-4 font-medium text-right">Candidates Currently Here</th>
                    <th className="py-2 font-medium text-right">Avg. Days Elapsed</th>
                  </tr>
                </thead>
                <tbody>
                  {stageBottlenecks.map((s, i) => (
                    <tr key={s.stage} className="border-b border-meristem-50 last:border-0">
                      <td className="py-2 pr-4 text-slate-700 font-medium">{s.stage}</td>
                      <td className="py-2 pr-4 text-right tabular-nums text-slate-600">{s.count}</td>
                      <td className={`py-2 text-right tabular-nums font-semibold ${i === 0 ? 'text-rose-600' : 'text-slate-700'}`}>{s.avgDaysElapsed.toFixed(0)} days</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-white border border-meristem-100 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <XCircle className="w-4 h-4 text-meristem-700" />
            <p className="text-sm font-bold text-slate-800">Decline Rate by Hiring Source</p>
          </div>
          <p className="text-xs text-slate-500 mb-4">A source that looks cheap or fast can still be producing weak-fit candidates if its decline rate is high — invisible in a single blended acceptance rate across all sources.</p>
          {declineRates.length === 0 ? (
            <p className="text-sm text-slate-400 py-6 text-center">No resolved offers (Accepted/Declined) with a Hiring Source in this period/filter.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-400 uppercase tracking-wide border-b border-meristem-50">
                    <th className="py-2 pr-4 font-medium">Hiring Source</th>
                    <th className="py-2 pr-4 font-medium text-right">Decline Rate</th>
                    <th className="py-2 font-medium text-right">Resolved Offers</th>
                  </tr>
                </thead>
                <tbody>
                  {declineRates.map((s, i) => (
                    <tr key={s.hiringSource} className="border-b border-meristem-50 last:border-0">
                      <td className="py-2 pr-4 text-slate-700 font-medium">{s.hiringSource}</td>
                      <td className={`py-2 pr-4 text-right tabular-nums font-semibold ${i === 0 && (s.declineRate ?? 0) > 0 ? 'text-rose-600' : 'text-slate-700'}`}>
                        {s.declineRate == null ? '—' : `${(s.declineRate * 100).toFixed(0)}%`}
                      </td>
                      <td className="py-2 text-right tabular-nums text-slate-500">{s.totalOffers} ({s.declined} declined)</td>
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
