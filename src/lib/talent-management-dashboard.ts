import { prisma } from '@/lib/prisma'
import { computeTalentMemberReport } from '@/lib/talent-member'
import type { PeriodFilter } from '@/lib/filter-types'

// All TM dashboard metrics are scoped to the ACTIVE pool only (TalentMemberInfo.status !== 'Exited')
// — this is what makes Promotion Rate and Internal Mobility Rate finally share one consistent
// denominator instead of the 41-vs-43 mismatch the source workbook had.

// TM records are tracked at year (Promotion/Mobility) or half-year (Performance) granularity,
// never by month — so a PeriodFilter's fromMonth/toMonth (YTD/range) can't be honored any more
// precisely than "the selected year": 'year', 'ytd', and 'range' all scope to filter.year (or the
// current year if unset); only 'all' shows every tracked year/period, as before.
function effectiveYear(filter: PeriodFilter): number | null {
  if (filter.mode === 'all') return null
  return filter.year ?? new Date().getFullYear()
}

export interface TMDashboardData {
  totalTMPool: number
  memberNames: { staffId: string; name: string }[]
  filteredYear: number | null // null = all tracked years

  promotedCount: number
  promotionRatePct: number

  mobilityCount: number
  mobilityRatePct: number

  averageTenureYears: number
  tenureBuckets: { labels: string[]; values: number[] }

  performanceByPeriod: { period: string; avgScorePct: number; avgScoreOutOf5: number }[]

  committeeInvolvedCount: number
  committeeInvolvementRatePct: number
  committeeBreakdown: { committee: string; count: number }[]

  tierComposition: { tier: string; count: number }[]
  buComposition: { bu: string; count: number }[]
  genderComposition: { gender: string; count: number }[]

  trainingCoveragePct: number
  staffTrained: number
}

function yearsBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
}

function tenureBucket(years: number): '0–2 yrs' | '3–5 yrs' | '6–10 yrs' | '10+ yrs' {
  if (years < 3) return '0–2 yrs'
  if (years < 6) return '3–5 yrs'
  if (years < 11) return '6–10 yrs'
  return '10+ yrs'
}

export async function computeTMDashboard(filter: PeriodFilter): Promise<TMDashboardData> {
  const filteredYear = effectiveYear(filter)
  const promotionYears = filteredYear ? [filteredYear] : [2025, 2026]

  const allMembers = await prisma.talentMemberInfo.findMany()
  const activeMembers = allMembers.filter((m) => m.status !== 'Exited' && m.staffId)
  const activeStaffIds = new Set(activeMembers.map((m) => m.staffId as string))
  const totalTMPool = activeMembers.length

  const [promotions, mobility, performance, committees, trainingReport] = await Promise.all([
    prisma.promotionRecord.findMany({ where: { year: { in: promotionYears } } }),
    prisma.mobilityRecord.findMany({ where: { employmentStatus: { not: 'Exited' }, ...(filteredYear ? { year: filteredYear } : {}) } }),
    prisma.performanceAppraisalRecord.findMany(),
    prisma.strategicCommitteeRecord.findMany(),
    computeTalentMemberReport(filter),
  ])

  // --- Promotion Rate ---
  const promotedStaffIds = new Set(
    promotions.filter((p) => p.promoted && activeStaffIds.has(p.staffId)).map((p) => p.staffId)
  )
  const promotedCount = promotedStaffIds.size
  const promotionRatePct = totalTMPool > 0 ? (promotedCount / totalTMPool) * 100 : 0

  // --- Internal Mobility Rate ---
  // Every active member now gets a MobilityRecord for both years (see tm-sheets-import.ts), "No
  // Change" included, so this must filter to changeStatus === 'Changed' — without it, everyone
  // having a row at all would read as 100% moved.
  const movedStaffIds = new Set(
    mobility.filter((m) => m.changeStatus === 'Changed' && activeStaffIds.has(m.staffId)).map((m) => m.staffId)
  )
  const mobilityCount = movedStaffIds.size
  const mobilityRatePct = totalTMPool > 0 ? (mobilityCount / totalTMPool) * 100 : 0

  // --- Tenure (computed live from DOJ Meristem, never trusted as a stored number) ---
  const now = new Date()
  const bucketCounts: Record<string, number> = { '0–2 yrs': 0, '3–5 yrs': 0, '6–10 yrs': 0, '10+ yrs': 0 }
  let tenureSum = 0
  let tenureN = 0
  for (const m of activeMembers) {
    if (!m.dojMeristem) continue
    const yrs = yearsBetween(m.dojMeristem, now)
    bucketCounts[tenureBucket(yrs)]++
    tenureSum += yrs
    tenureN++
  }
  const averageTenureYears = tenureN > 0 ? tenureSum / tenureN : 0
  const tenureBuckets = {
    labels: ['0–2 yrs', '3–5 yrs', '6–10 yrs', '10+ yrs'],
    values: ['0–2 yrs', '3–5 yrs', '6–10 yrs', '10+ yrs'].map((l) => bucketCounts[l]),
  }

  // --- Performance (stored 0–100; displayed as % bold + /5 small) ---
  // H2 2026 isn't excluded because it's bad data — it just hasn't happened yet (the sheet only
  // ever tracked up to H1 2026) — filtered out rather than shown as an always-empty bar.
  const periods = (filteredYear ? [`H1 ${filteredYear}`, `H2 ${filteredYear}`] : ['H1 2025', 'H2 2025', 'H1 2026']).filter((p) => p !== 'H2 2026')
  const performanceByPeriod = periods.map((period) => {
    const scores = performance.filter((p) => p.period === period && activeStaffIds.has(p.staffId) && p.score != null).map((p) => p.score as number)
    const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0
    return { period, avgScorePct: avg, avgScoreOutOf5: avg / 20 }
  })

  // --- Strategic Committee Involvement ---
  const involvedStaffIds = new Set(committees.filter((c) => c.staffId && activeStaffIds.has(c.staffId)).map((c) => c.staffId as string))
  const committeeInvolvedCount = involvedStaffIds.size
  const committeeInvolvementRatePct = totalTMPool > 0 ? (committeeInvolvedCount / totalTMPool) * 100 : 0
  const committeeCounts = new Map<string, number>()
  for (const c of committees) {
    if (!c.staffId || !activeStaffIds.has(c.staffId)) continue
    committeeCounts.set(c.committee, (committeeCounts.get(c.committee) || 0) + 1)
  }
  const committeeBreakdown = [...committeeCounts.entries()].map(([committee, count]) => ({ committee, count })).sort((a, b) => b.count - a.count)

  // --- Talent Pool Composition (by Tier), BU composition, Gender composition ---
  const tierCounts = new Map<string, number>()
  const buCounts = new Map<string, number>()
  const genderCounts = new Map<string, number>()
  for (const m of activeMembers) {
    const tier = m.currentTier != null ? `Tier ${m.currentTier}` : 'Unassigned'
    tierCounts.set(tier, (tierCounts.get(tier) || 0) + 1)
    const bu = m.businessUnit || 'Unassigned'
    buCounts.set(bu, (buCounts.get(bu) || 0) + 1)
    const gender = m.gender || 'Unspecified'
    genderCounts.set(gender, (genderCounts.get(gender) || 0) + 1)
  }
  const tierComposition = [...tierCounts.entries()].map(([tier, count]) => ({ tier, count })).sort((a, b) => a.tier.localeCompare(b.tier))
  const buComposition = [...buCounts.entries()].map(([bu, count]) => ({ bu, count })).sort((a, b) => b.count - a.count)
  const genderComposition = [...genderCounts.entries()].map(([gender, count]) => ({ gender, count }))

  return {
    totalTMPool,
    memberNames: activeMembers.map((m) => ({ staffId: m.staffId as string, name: m.name || m.staffId as string })).sort((a, b) => a.name.localeCompare(b.name)),
    filteredYear,
    promotedCount,
    promotionRatePct,
    mobilityCount,
    mobilityRatePct,
    averageTenureYears,
    tenureBuckets,
    performanceByPeriod,
    committeeInvolvedCount,
    committeeInvolvementRatePct,
    committeeBreakdown,
    tierComposition,
    buComposition,
    genderComposition,
    trainingCoveragePct: trainingReport.coveragePct,
    staffTrained: trainingReport.staffTrained,
  }
}
