import { prisma } from '@/lib/prisma'
import type { PeriodFilter } from '@/lib/filter-types'

// Supporting lib for the TM sub-nav's detail tabs (Mobility Trends / Promotion Trends /
// Committees & Performance) — same "active pool only" scoping as talent-management-dashboard.ts's
// Executive Summary numbers, so a person who's exited never counts toward any of these either.

// TM records are tracked at year (Promotion/Mobility) or half-year (Performance) granularity, not
// by month — so 'year', 'ytd', and 'range' all scope to filter.year (or the current year if
// unset); only 'all' shows every tracked year/period. Same simplification as
// talent-management-dashboard.ts's effectiveYear().
function effectiveYear(filter: PeriodFilter): number | null {
  if (filter.mode === 'all') return null
  return filter.year ?? new Date().getFullYear()
}

async function loadActiveRoster() {
  const members = await prisma.talentMemberInfo.findMany()
  const active = members.filter((m) => m.status !== 'Exited' && m.staffId)
  const byStaffId = new Map(active.map((m) => [m.staffId as string, m]))
  return { active, byStaffId }
}

// ---------- Mobility Trends ----------

export interface TMMobilityTrends {
  byYear: { year: number; movedCount: number; ratePct: number }[]
  byBU: { bu: string; movedCount: number }[]
  buToBu: { from: string; to: string; count: number }[]
  records: { staffId: string; name: string; year: number; fromBU: string | null; toBU: string | null; fromRole: string | null; toRole: string | null }[]
}

export async function computeTMMobilityTrends(filter: PeriodFilter): Promise<TMMobilityTrends> {
  const filteredYear = effectiveYear(filter)
  let years: number[]
  if (filteredYear) {
    years = [filteredYear]
  } else {
    // "All Time" — every year actually tracked (not a hardcoded [2025, 2026]), so a new year's
    // column on the sheet shows up here without a code change.
    const distinctYears = await prisma.mobilityRecord.findMany({ distinct: ['year'], select: { year: true }, orderBy: { year: 'asc' } })
    years = distinctYears.map((d) => d.year)
  }
  const { active, byStaffId } = await loadActiveRoster()
  const totalTMPool = active.length
  const mobility = await prisma.mobilityRecord.findMany({
    where: { employmentStatus: { not: 'Exited' }, changeStatus: 'Changed', year: { in: years } },
    orderBy: [{ year: 'asc' }, { staffId: 'asc' }],
  })
  const activeMobility = mobility.filter((m) => byStaffId.has(m.staffId))

  const byYear = years.map((year) => {
    const movedCount = new Set(activeMobility.filter((m) => m.year === year).map((m) => m.staffId)).size
    return { year, movedCount, ratePct: totalTMPool > 0 ? (movedCount / totalTMPool) * 100 : 0 }
  })

  const buCounts = new Map<string, number>()
  for (const m of activeMobility) {
    const bu = m.newBusinessUnit || byStaffId.get(m.staffId)?.businessUnit || 'Unassigned'
    buCounts.set(bu, (buCounts.get(bu) || 0) + 1)
  }
  const byBU = [...buCounts.entries()].map(([bu, movedCount]) => ({ bu, movedCount })).sort((a, b) => b.movedCount - a.movedCount)

  const pairCounts = new Map<string, number>()
  for (const m of activeMobility) {
    if (!m.previousBusinessUnit || !m.newBusinessUnit || m.previousBusinessUnit === m.newBusinessUnit) continue
    const key = `${m.previousBusinessUnit} -> ${m.newBusinessUnit}`
    pairCounts.set(key, (pairCounts.get(key) || 0) + 1)
  }
  const buToBu = [...pairCounts.entries()]
    .map(([key, count]) => { const [from, to] = key.split(' -> '); return { from, to, count } })
    .sort((a, b) => b.count - a.count)

  const records = activeMobility.map((m) => ({
    staffId: m.staffId,
    name: byStaffId.get(m.staffId)?.name || m.name || m.staffId,
    year: m.year,
    fromBU: m.previousBusinessUnit,
    toBU: m.newBusinessUnit,
    fromRole: null,
    toRole: m.newRole,
  }))

  return { byYear, byBU, buToBu, records }
}

// ---------- Promotion Trends ----------

export interface TMPromotionTrends {
  byYear: { year: number; promotedCount: number; ratePct: number }[]
  byBU: { bu: string; count: number }[]
  byTier: { tier: string; count: number }[]
  records: { staffId: string; name: string; year: number; previousGrade: string | null; newGrade: string | null }[]
}

export async function computeTMPromotionTrends(filter: PeriodFilter): Promise<TMPromotionTrends> {
  const filteredYear = effectiveYear(filter)
  let years: number[]
  if (filteredYear) {
    years = [filteredYear]
  } else {
    // "All Time" — every year actually tracked in the data (2023 onward, as the sheet gains
    // columns), not a hardcoded [2025, 2026].
    const distinctYears = await prisma.promotionRecord.findMany({ distinct: ['year'], select: { year: true }, orderBy: { year: 'asc' } })
    years = distinctYears.map((d) => d.year)
  }
  const { active, byStaffId } = await loadActiveRoster()
  const totalTMPool = active.length
  const promotions = await prisma.promotionRecord.findMany({
    where: { year: { in: years }, promoted: true },
    orderBy: [{ year: 'asc' }, { staffId: 'asc' }],
  })
  const activePromotions = promotions.filter((p) => byStaffId.has(p.staffId))

  const byYear = years.map((year) => {
    const promotedCount = new Set(activePromotions.filter((p) => p.year === year).map((p) => p.staffId)).size
    return { year, promotedCount, ratePct: totalTMPool > 0 ? (promotedCount / totalTMPool) * 100 : 0 }
  })

  const promotedStaffIds = new Set(activePromotions.map((p) => p.staffId))
  const buCounts = new Map<string, number>()
  const tierCounts = new Map<string, number>()
  for (const staffId of promotedStaffIds) {
    const member = byStaffId.get(staffId)
    const bu = member?.businessUnit || 'Unassigned'
    buCounts.set(bu, (buCounts.get(bu) || 0) + 1)
    const tier = member?.currentTier != null ? `Tier ${member.currentTier}` : 'Unassigned'
    tierCounts.set(tier, (tierCounts.get(tier) || 0) + 1)
  }
  const byBU = [...buCounts.entries()].map(([bu, count]) => ({ bu, count })).sort((a, b) => b.count - a.count)
  const byTier = [...tierCounts.entries()].map(([tier, count]) => ({ tier, count })).sort((a, b) => a.tier.localeCompare(b.tier))

  const records = activePromotions.map((p) => ({
    staffId: p.staffId,
    name: byStaffId.get(p.staffId)?.name || p.name || p.staffId,
    year: p.year,
    previousGrade: p.previousGrade,
    newGrade: p.newGrade,
  }))

  return { byYear, byBU, byTier, records }
}

// ---------- Committees & Performance ----------

export interface TMCommitteesPerformance {
  committeeBreakdown: { committee: string; count: number }[]
  performanceByBU: { bu: string; avgScorePct: number }[]
  scoreDistribution: { bucket: string; count: number }[]
  latestPeriod: string
  records: { staffId: string; name: string; score: number }[]
}

export async function computeTMCommitteesPerformance(filter: PeriodFilter): Promise<TMCommitteesPerformance> {
  const filteredYear = effectiveYear(filter)
  const { byStaffId } = await loadActiveRoster()
  const [committees, performance] = await Promise.all([
    prisma.strategicCommitteeRecord.findMany(),
    prisma.performanceAppraisalRecord.findMany(),
  ])

  // Committee membership is now year-tagged (e.g. "2026 Strategic Committee" on the sheet) — scope
  // to the filtered year when one's selected; "All Time" shows every tracked committee row,
  // including legacy rows imported before the year field existed (year: null).
  const committeeCounts = new Map<string, number>()
  for (const c of committees) {
    if (!c.staffId || !byStaffId.has(c.staffId)) continue
    if (filteredYear && c.year != null && c.year !== filteredYear) continue
    committeeCounts.set(c.committee, (committeeCounts.get(c.committee) || 0) + 1)
  }
  const committeeBreakdown = [...committeeCounts.entries()].map(([committee, count]) => ({ committee, count })).sort((a, b) => b.count - a.count)

  // Most recent tracked period — within the filtered year if one's selected (H2 if it has data,
  // else H1), otherwise the latest tracked period overall. H2 2026 is excluded everywhere here
  // because it hasn't happened yet, not because it's bad data.
  const allTrackedPeriods = ['H1 2025', 'H2 2025', 'H1 2026']
  const periodOrder = filteredYear
    ? allTrackedPeriods.filter((p) => p.endsWith(String(filteredYear)))
    : allTrackedPeriods
  const latestPeriod = periodOrder.length > 0 ? periodOrder[periodOrder.length - 1] : allTrackedPeriods[allTrackedPeriods.length - 1]
  const latestScores = performance.filter((p) => p.period === latestPeriod && p.staffId && byStaffId.has(p.staffId) && p.score != null)

  const buScores = new Map<string, number[]>()
  for (const p of latestScores) {
    const bu = byStaffId.get(p.staffId)?.businessUnit || 'Unassigned'
    if (!buScores.has(bu)) buScores.set(bu, [])
    buScores.get(bu)!.push(p.score as number)
  }
  const performanceByBU = [...buScores.entries()]
    .map(([bu, scores]) => ({ bu, avgScorePct: scores.reduce((a, b) => a + b, 0) / scores.length }))
    .sort((a, b) => b.avgScorePct - a.avgScorePct)

  const buckets = ['Below 60', '60–69', '70–79', '80–89', '90–100']
  const bucketCounts: Record<string, number> = { 'Below 60': 0, '60–69': 0, '70–79': 0, '80–89': 0, '90–100': 0 }
  for (const p of latestScores) {
    const score = p.score as number
    if (score < 60) bucketCounts['Below 60']++
    else if (score < 70) bucketCounts['60–69']++
    else if (score < 80) bucketCounts['70–79']++
    else if (score < 90) bucketCounts['80–89']++
    else bucketCounts['90–100']++
  }
  const scoreDistribution = buckets.map((bucket) => ({ bucket, count: bucketCounts[bucket] }))

  const records = latestScores
    .map((p) => ({ staffId: p.staffId, name: byStaffId.get(p.staffId)?.name || p.name || p.staffId, score: p.score as number }))
    .sort((a, b) => b.score - a.score)

  return { committeeBreakdown, performanceByBU, scoreDistribution, latestPeriod, records }
}
