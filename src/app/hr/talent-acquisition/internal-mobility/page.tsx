import { ArrowLeftRight, TrendingUp, Shuffle, Repeat, UserCheck, Briefcase } from 'lucide-react'
import { UnitPageHeader } from '@/components/hr/UnitPageHeader'
import { TaSubNav } from '@/components/hr/ta/TaSubNav'
import { TaStatTile } from '@/components/hr/ta/TaStatTile'
import { TaSampleDataBanner, TaConnectionErrorBanner } from '@/components/hr/ta/TaSampleDataBanner'
import { BarChart } from '@/components/charts/BarChart'
import { getTaDashboardData, hasTaCredentials } from '@/lib/ta-sheets'
import { internalMobilityRate, mobilityByFunction, promotionRate, lateralMobilityRate, retentionAfterMobility, internalFillRate } from '@/lib/ta-metrics'
import { prisma } from '@/lib/prisma'
import { latestRosterSnapshot } from '@/lib/staff-training-eligibility'
import { normalizeStaffIdKey } from '@/lib/staff-id'

function pctLabel(v: number | null): string {
  return v == null ? '—' : `${(v * 100).toFixed(1)}%`
}

export default async function InternalMobilityPage() {
  const [{ internalMobility, vacancies, connectionError }, rawRoster] = await Promise.all([
    getTaDashboardData(),
    prisma.staffRosterRecord.findMany(),
  ])
  const usingSampleData = !hasTaCredentials()

  const latestRoster = latestRosterSnapshot(rawRoster)
  const activeRoster = latestRoster.filter((r) => r.active)
  const activeHeadcount = activeRoster.length
  const activeStaffIds = new Set(activeRoster.map((r) => normalizeStaffIdKey(r.staffId)))

  const mobilityRate = internalMobilityRate(internalMobility, activeHeadcount)
  const byFunction = mobilityByFunction(internalMobility).slice(0, 8)
  const promoRate = promotionRate(internalMobility)
  const lateralRate = lateralMobilityRate(internalMobility)
  const retentionRate = retentionAfterMobility(internalMobility, activeStaffIds)
  const fillRate = internalFillRate(vacancies)

  const asOf = new Date().toLocaleDateString('en-NG', { year: 'numeric', month: 'long', day: 'numeric' })

  return (
    <div>
      <UnitPageHeader title="Talent Acquisition" description="Internal moves, promotions, and vacancy fill rate" icon={<ArrowLeftRight className="w-5 h-5 text-meristem-700" />} />
      <TaSubNav />

      <div className="p-4 sm:p-8 space-y-6">
        {connectionError ? <TaConnectionErrorBanner message={connectionError} /> : usingSampleData && <TaSampleDataBanner />}
        <p className="text-xs text-slate-400">As of {asOf}</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <TaStatTile label="Internal Mobility Rate" value={pctLabel(mobilityRate)} sublabel={`${internalMobility.length} moves / ${activeHeadcount} active staff`} icon={ArrowLeftRight} />
          <TaStatTile label="Promotion Rate" value={pctLabel(promoRate)} sublabel="Share of moves with a grade change — see note below" icon={TrendingUp} />
          <TaStatTile label="Lateral Mobility Rate" value={pctLabel(lateralRate)} sublabel="Share of moves at the same grade" icon={Shuffle} />
          <TaStatTile label="Retention After Mobility" value={pctLabel(retentionRate)} sublabel="Still active today, of everyone who moved" icon={Repeat} />
          <TaStatTile label="Internal Fill Rate" value={pctLabel(fillRate)} sublabel="Of all filled vacancies — snapshot only, see note" icon={Briefcase} />
          <TaStatTile label="Total Internal Moves" value={String(internalMobility.length)} icon={UserCheck} />
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800 space-y-1.5">
          <p><strong>Promotion vs. Lateral:</strong> no grade hierarchy is configured anywhere, so these are based only on whether the grade text changed, not which direction it moved — a genuine demotion would currently be counted as a promotion. Flag if this needs a real grade order.</p>
          <p><strong>Internal Fill Rate</strong> is a current snapshot only (filled internally ÷ all filled vacancies) — it can&apos;t be tracked over time, and <strong>Time to Fill</strong> can&apos;t be computed at all, until the Vacancies 2026 sheet has a Date Filled column.</p>
        </div>

        <div className="bg-white border border-meristem-100 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Briefcase className="w-4 h-4 text-meristem-700" />
            <p className="text-sm font-bold text-slate-800">Internal Mobility by Function (Role)</p>
          </div>
          {byFunction.length === 0 ? (
            <p className="text-sm text-slate-400">No internal mobility records yet.</p>
          ) : (
            <BarChart labels={byFunction.map((g) => g.key)} values={byFunction.map((g) => g.count)} color="#2F6B2B" horizontal showLabels height={Math.max(220, byFunction.length * 40)} />
          )}
        </div>
      </div>
    </div>
  )
}
