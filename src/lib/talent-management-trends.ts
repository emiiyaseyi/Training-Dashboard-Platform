import { prisma } from '@/lib/prisma'

// Supporting lib for the TM sub-nav's detail tabs (Mobility Trends / Promotion Trends /
// Committees & Performance) — same "active pool only" scoping as talent-management-dashboard.ts's
// Executive Summary numbers, so a person who's exited never counts toward any of these either.

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

export async function computeTMMobilityTrends(): Promise<TMMobilityTrends> {
  const { active, byStaffId } = await loadActiveRoster()
  const totalTMPool = active.length
  const mobility = await prisma.mobilityRecord.findMany({
    where: { employmentStatus: { not: 'Exited' }, changeStatus: 'Changed' },
    orderBy: [{ year: 'asc' }, { staffId: 'asc' }],
  })
  const activeMobility = mobility.filter((m) => byStaffId.has(m.staffId))

  const byYear = [2025, 2026].map((year) => {
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

export async function computeTMPromotionTrends(): Promise<TMPromotionTrends> {
  const { active, byStaffId } = await loadActiveRoster()
  const totalTMPool = active.length
  const promotions = await prisma.promotionRecord.findMany({
    where: { year: { in: [2025, 2026] }, promoted: true },
    orderBy: [{ year: 'asc' }, { staffId: 'asc' }],
  })
  const activePromotions = promotions.filter((p) => byStaffId.has(p.staffId))

  const byYear = [2025, 2026].map((year) => {
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

export async function computeTMCommitteesPerformance(): Promise<TMCommitteesPerformance> {
  const { byStaffId } = await loadActiveRoster()
  const [committees, performance] = await Promise.all([
    prisma.strategicCommitteeRecord.findMany(),
    prisma.performanceAppraisalRecord.findMany(),
  ])

  const committeeCounts = new Map<string, number>()
  for (const c of committees) {
    if (!c.staffId || !byStaffId.has(c.staffId)) continue
    committeeCounts.set(c.committee, (committeeCounts.get(c.committee) || 0) + 1)
  }
  const committeeBreakdown = [...committeeCounts.entries()].map(([committee, count]) => ({ committee, count })).sort((a, b) => b.count - a.count)

  // Most recent tracked period, by the same H1/H2-year ordering used everywhere else here.
  const periodOrder = ['H1 2025', 'H2 2025', 'H1 2026']
  const latestPeriod = periodOrder[periodOrder.length - 1]
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
