import { Repeat2, Users, Clock, CheckCircle2, Wallet, Building2, UserCog } from 'lucide-react'
import { UnitPageHeader } from '@/components/hr/UnitPageHeader'
import { TaSubNav } from '@/components/hr/ta/TaSubNav'
import { TaStatTile } from '@/components/hr/ta/TaStatTile'
import { TaSampleDataBanner, TaConnectionErrorBanner } from '@/components/hr/ta/TaSampleDataBanner'
import { BarChart } from '@/components/charts/BarChart'
import { getTaDashboardData, hasTaCredentials } from '@/lib/ta-sheets'
import { formatTaCurrency } from '@/lib/ta-format'
import {
  conversionsByBU, conversionsByManager, internToFullTimeConversionRate, internRetentionRate,
  averageTimeToConversionDays, conversionOfferAcceptanceRate, averageCostPerConversion, conversionDropOffReasons,
} from '@/lib/ta-metrics'
import { prisma } from '@/lib/prisma'
import { latestRosterSnapshot } from '@/lib/staff-training-eligibility'
import { normalizeStaffIdKey } from '@/lib/staff-id'

function pctLabel(v: number | null): string {
  return v == null ? '—' : `${(v * 100).toFixed(1)}%`
}

export default async function ConversionsPage() {
  const [{ conversions, notConverted, connectionError }, rawRoster] = await Promise.all([
    getTaDashboardData(),
    prisma.staffRosterRecord.findMany(),
  ])
  const usingSampleData = !hasTaCredentials()

  const latestRoster = latestRosterSnapshot(rawRoster)
  const activeStaffIds = new Set(latestRoster.filter((r) => r.active).map((r) => normalizeStaffIdKey(r.staffId)))
  const internHeadcount = latestRoster.filter((r) => (r.employmentType || '').toLowerCase().includes('intern')).length

  const conversionRate = internToFullTimeConversionRate(conversions, internHeadcount)
  const retentionRate = internRetentionRate(conversions, activeStaffIds)
  const avgDays = averageTimeToConversionDays(conversions)
  const acceptanceRate = conversionOfferAcceptanceRate(conversions, notConverted)
  const avgCost = averageCostPerConversion(conversions)
  const byBU = conversionsByBU(conversions)
  const byManager = conversionsByManager(conversions).slice(0, 8)
  const dropOffReasons = conversionDropOffReasons(notConverted)

  const asOf = new Date().toLocaleDateString('en-NG', { year: 'numeric', month: 'long', day: 'numeric' })

  return (
    <div>
      <UnitPageHeader title="Talent Acquisition" description="Intern-to-full-time conversion pipeline" icon={<Repeat2 className="w-5 h-5 text-meristem-700" />} />
      <TaSubNav />

      <div className="p-4 sm:p-8 space-y-6">
        {connectionError ? <TaConnectionErrorBanner message={connectionError} /> : usingSampleData && <TaSampleDataBanner />}
        <p className="text-xs text-slate-400">As of {asOf}</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <TaStatTile label="Intern-to-Full-Time Conversion Rate" value={pctLabel(conversionRate)} sublabel={`${conversions.length} converted / ${internHeadcount} interns on roster`} icon={Repeat2} />
          <TaStatTile label="Intern Retention Rate" value={pctLabel(retentionRate)} sublabel="Still active today, of everyone converted" icon={Users} />
          <TaStatTile label="Avg. Time to Conversion" value={avgDays == null ? '—' : `${(avgDays / 7).toFixed(1)} weeks`} sublabel={avgDays == null ? undefined : `${avgDays.toFixed(0)} days`} icon={Clock} />
          <TaStatTile label="Offer Acceptance Rate" value={pctLabel(acceptanceRate)} sublabel="Converted vs. declined-offer drop-offs — see note" icon={CheckCircle2} />
          <TaStatTile label="Avg. Cost per Conversion" value={avgCost == null ? '—' : formatTaCurrency(avgCost)} icon={Wallet} />
          <TaStatTile label="Total Conversions" value={String(conversions.length)} icon={UserCog} />
          <TaStatTile label="Total Not Converted" value={String(notConverted.length)} icon={Users} />
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800 space-y-1.5">
          <p><strong>Intern-to-Full-Time Conversion Rate</strong> depends on the Employees page keeping Employment Type = &quot;Intern&quot; current — worth a quick check that interns are actually tagged that way consistently.</p>
          <p><strong>Offer Acceptance Rate</strong> pairs conversions against Not Converted rows whose Reason text contains &quot;declined&quot; — a text-matching heuristic, not a guaranteed-accurate count. Worth a second look if Reason values don&apos;t consistently say that.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="bg-white border border-meristem-100 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Building2 className="w-4 h-4 text-meristem-700" />
              <p className="text-sm font-bold text-slate-800">Conversions by Business Unit</p>
            </div>
            {byBU.length === 0 ? (
              <p className="text-sm text-slate-400">No conversion records yet.</p>
            ) : (
              <BarChart labels={byBU.map((g) => g.key)} values={byBU.map((g) => g.count)} color="#2F6B2B" showLabels height={240} />
            )}
          </div>
          <div className="bg-white border border-meristem-100 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <UserCog className="w-4 h-4 text-meristem-700" />
              <p className="text-sm font-bold text-slate-800">Conversions by Manager</p>
            </div>
            {byManager.length === 0 ? (
              <p className="text-sm text-slate-400">No conversion records yet.</p>
            ) : (
              <BarChart labels={byManager.map((g) => g.key)} values={byManager.map((g) => g.count)} color="#7A66B0" horizontal showLabels height={Math.max(220, byManager.length * 36)} />
            )}
          </div>
        </div>

        <div className="bg-white border border-meristem-100 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-4 h-4 text-meristem-700" />
            <p className="text-sm font-bold text-slate-800">Conversion Reason / Drop-off</p>
          </div>
          {dropOffReasons.length === 0 ? (
            <p className="text-sm text-slate-400">No &quot;Not Converted&quot; records yet.</p>
          ) : (
            <BarChart labels={dropOffReasons.map((g) => g.key)} values={dropOffReasons.map((g) => g.count)} color="#B0714F" horizontal showLabels height={Math.max(180, dropOffReasons.length * 40)} />
          )}
        </div>
      </div>
    </div>
  )
}
