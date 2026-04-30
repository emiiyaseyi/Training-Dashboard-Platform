import { prisma } from './prisma'
import { MONTHS, type PeriodFilter } from './filter-types'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BUSummary {
  name: string
  trainingCost: number
  subscriptionCost: number
  totalInvestment: number
  staffTrained: number
  subscriptionStaff: number
  totalStaff: number
  budget: number
  coverageRatio: number
  avgImpactScore: number
  subscriptionRatio: number
  budgetUtilisation: number
  isOverBudget: boolean
}

export interface StaffParticipation {
  oneTraining: number
  oneTrainingPct: number
  twoPlus: number
  twoPlusPct: number
  staffList: { staffId: string; staffName: string; count: number }[]
}

export interface GroupAnalytics {
  totalTrainingCost: number
  totalSubscriptionCost: number
  totalLearningInvestment: number
  uniqueStaffTrained: number
  uniqueSubscriptionStaff: number
  totalUniqueStaff: number
  totalStaffCount: number
  groupCoverageRatio: number
  avgImpactScore: number
  trainingSharePct: number
  subscriptionSharePct: number
  investmentPerStaff: number
  businessUnits: BUSummary[]
  monthlySpend: { month: string; cost: number }[]
  topTrainings: { training: string; count: number; totalCost: number }[]
  topMembershipOrgs: { org: string; count: number; totalAmount: number }[]
  impactDistribution: { range: string; count: number }[]
  applicationRates: { category: string; count: number }[]
  forecastedSpend: number
  budgetRisk: 'on-track' | 'at-risk' | 'over-budget'
  totalBudget: number
  dataQuality: { score: number; issues: string[] }
  trainingParticipation: StaffParticipation
  subscriptionParticipation: StaffParticipation
  availableYears: number[]
}

export interface BUDetailAnalytics {
  bu: BUSummary
  monthlyTrainingSpend: { month: string; cost: number }[]
  topTrainings: { training: string; count: number; totalCost: number }[]
  feedbackSummary: {
    avgConfidence: number
    applicationRates: { category: string; count: number }[]
    impactAreas: { area: string; count: number }[]
  }
  subscriptionBreakdown: { org: string; count: number; totalAmount: number }[]
  trainingParticipation: StaffParticipation
  subscriptionParticipation: StaffParticipation
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MONTH_ORDER = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
]

function monthIndex(m: string): number {
  return MONTH_ORDER.indexOf(m.toLowerCase())
}

function computeDataQuality(
  trainingCount: number,
  feedbackCount: number,
  subscriptionCount: number,
): { score: number; issues: string[] } {
  const issues: string[] = []
  let score = 100

  if (trainingCount === 0) { issues.push('No training cost data uploaded.'); score -= 40 }
  if (feedbackCount === 0) { issues.push('No feedback data uploaded — impact scores unavailable.'); score -= 30 }
  if (subscriptionCount === 0) { issues.push('No subscription data uploaded — total learning investment incomplete.'); score -= 15 }
  if (trainingCount > 0 && feedbackCount > 0 && feedbackCount < trainingCount * 0.2) {
    issues.push('Feedback coverage below 20% of training records.'); score -= 15
  }

  return { score: Math.max(0, score), issues }
}

// ─── Filter helper ────────────────────────────────────────────────────────────

function allowedMonths(filter: PeriodFilter): Set<string> | null {
  if (filter.mode === 'all') return null
  if (filter.mode === 'year') return null   // all months in the year
  const now = new Date()
  let indices: number[] = []
  if (filter.mode === 'ytd') {
    indices = Array.from({ length: now.getMonth() + 1 }, (_, i) => i)
  } else if (filter.mode === 'range' && filter.fromMonth && filter.toMonth) {
    const from = MONTHS.indexOf(filter.fromMonth as typeof MONTHS[number])
    const to = MONTHS.indexOf(filter.toMonth as typeof MONTHS[number])
    for (let i = Math.min(from, to); i <= Math.max(from, to); i++) indices.push(i)
  }
  return new Set(indices.map((i) => MONTHS[i]))
}

function computeParticipation(
  records: { staffId: string; staffName: string }[],
  totalTrained: number,
): StaffParticipation {
  const countMap = new Map<string, { staffName: string; count: number }>()
  for (const r of records) {
    const id = r.staffId.toUpperCase()
    const entry = countMap.get(id)
    if (entry) entry.count++
    else countMap.set(id, { staffName: r.staffName, count: 1 })
  }
  const entries = [...countMap.entries()]
  const one = entries.filter(([, v]) => v.count === 1).length
  const two = entries.filter(([, v]) => v.count >= 2).length
  const base = totalTrained > 0 ? totalTrained : 1
  return {
    oneTraining: one,
    oneTrainingPct: (one / base) * 100,
    twoPlus: two,
    twoPlusPct: (two / base) * 100,
    staffList: entries
      .map(([id, v]) => ({ staffId: id, staffName: v.staffName, count: v.count }))
      .sort((a, b) => b.count - a.count),
  }
}

// ─── Core analytics function ──────────────────────────────────────────────────

export async function computeGroupAnalytics(filter: PeriodFilter = { mode: 'all' }): Promise<GroupAnalytics> {
  const [
    allTraining,
    feedbackRecords,
    subscriptionRecords,
    businessUnits,
  ] = await Promise.all([
    prisma.trainingRecord.findMany(),
    prisma.feedbackRecord.findMany(),
    prisma.subscriptionRecord.findMany(),
    prisma.businessUnit.findMany(),
  ])

  // Collect all available years for the filter UI
  const availableYears = [...new Set(allTraining.map((r) => r.year))].sort((a, b) => b - a)

  // Apply year filter
  let trainingRecords = allTraining
  if (filter.mode !== 'all' && filter.year) {
    trainingRecords = trainingRecords.filter((r) => r.year === filter.year)
  }
  // Apply month filter
  const months = allowedMonths(filter)
  if (months) {
    trainingRecords = trainingRecords.filter((r) => months.has(r.month as typeof MONTHS[number]))
  }

  // ── Training aggregates ──
  const totalTrainingCost = trainingRecords.reduce((s, r) => s + r.cost, 0)
  const uniqueTrainedIds = new Set(trainingRecords.map((r) => r.staffId.toUpperCase()))
  const uniqueStaffTrained = uniqueTrainedIds.size

  // ── Subscription aggregates ──
  const totalSubscriptionCost = subscriptionRecords.reduce((s, r) => s + r.amount, 0)
  const uniqueSubIds = new Set(subscriptionRecords.map((r) => r.staffId.toUpperCase()))
  const uniqueSubscriptionStaff = uniqueSubIds.size

  // ── Combined ──
  const allUniqueIds = new Set([...uniqueTrainedIds, ...uniqueSubIds])
  const totalUniqueStaff = allUniqueIds.size
  const totalLearningInvestment = totalTrainingCost + totalSubscriptionCost
  const totalStaffCount = businessUnits.reduce((s, b) => s + b.staffCount, 0)
  const groupCoverageRatio = totalStaffCount > 0 ? (uniqueStaffTrained / totalStaffCount) * 100 : 0

  // ── Impact score — raw average on 0–5 scale ──
  const validFeedback = feedbackRecords.filter((f) => f.confidenceRating != null)
  const avgImpactScore =
    validFeedback.length > 0
      ? validFeedback.reduce((s, f) => s + (f.confidenceRating ?? 0), 0) / validFeedback.length
      : 0

  const trainingSharePct = totalLearningInvestment > 0 ? (totalTrainingCost / totalLearningInvestment) * 100 : 0
  const subscriptionSharePct = totalLearningInvestment > 0 ? (totalSubscriptionCost / totalLearningInvestment) * 100 : 0
  const investmentPerStaff = totalStaffCount > 0 ? totalLearningInvestment / totalStaffCount : 0

  // ── Monthly spend ──
  const monthMap: Record<string, number> = {}
  trainingRecords.forEach((r) => {
    const key = r.month || 'Unknown'
    monthMap[key] = (monthMap[key] ?? 0) + r.cost
  })
  const monthlySpend = Object.entries(monthMap)
    .map(([month, cost]) => ({ month, cost }))
    .sort((a, b) => monthIndex(a.month) - monthIndex(b.month))

  // ── Top trainings ──
  const trainingMap: Record<string, { count: number; totalCost: number }> = {}
  trainingRecords.forEach((r) => {
    const t = r.training || 'Unknown'
    if (!trainingMap[t]) trainingMap[t] = { count: 0, totalCost: 0 }
    trainingMap[t].count++
    trainingMap[t].totalCost += r.cost
  })
  const topTrainings = Object.entries(trainingMap)
    .map(([training, v]) => ({ training, ...v }))
    .sort((a, b) => b.totalCost - a.totalCost)
    .slice(0, 10)

  // ── Top membership orgs ──
  const orgMap: Record<string, { count: number; totalAmount: number }> = {}
  subscriptionRecords.forEach((r) => {
    const o = r.membershipOrg || 'Unknown'
    if (!orgMap[o]) orgMap[o] = { count: 0, totalAmount: 0 }
    orgMap[o].count++
    orgMap[o].totalAmount += r.amount
  })
  const topMembershipOrgs = Object.entries(orgMap)
    .map(([org, v]) => ({ org, ...v }))
    .sort((a, b) => b.totalAmount - a.totalAmount)
    .slice(0, 10)

  // ── Impact distribution (0–5 scale) ──
  const bands = [
    { range: '0–1', min: 0, max: 1 },
    { range: '1–2', min: 1, max: 2 },
    { range: '2–3', min: 2, max: 3 },
    { range: '3–4', min: 3, max: 4 },
    { range: '4–5', min: 4, max: 5 },
  ]
  const impactDistribution = bands.map(({ range, min, max }) => ({
    range,
    count: validFeedback.filter((f) => (f.confidenceRating ?? 0) >= min && (f.confidenceRating ?? 0) < max + 0.01).length,
  }))

  // ── Application rates ──
  const appMap: Record<string, number> = {}
  feedbackRecords.forEach((r) => {
    const cat = r.applicationResponse || 'Not specified'
    appMap[cat] = (appMap[cat] ?? 0) + 1
  })
  const applicationRates = Object.entries(appMap).map(([category, count]) => ({ category, count }))

  // ── Forecasting ──
  const completedMonths = monthlySpend.length > 0 ? monthlySpend.length : 1
  const avgMonthlySpend = totalTrainingCost / completedMonths
  const remainingMonths = Math.max(0, 12 - completedMonths)
  const forecastedSpend = totalTrainingCost + avgMonthlySpend * remainingMonths
  const totalBudget = businessUnits.reduce((s, b) => s + b.budget, 0)
  // Only calculate budget risk when at least one BU has a budget configured
  const budgetRisk: 'on-track' | 'at-risk' | 'over-budget' =
    totalBudget === 0 ? 'on-track' :
    forecastedSpend > totalBudget ? 'over-budget' :
    forecastedSpend > totalBudget * 0.85 ? 'at-risk' : 'on-track'

  // ── Business unit summaries ──
  const buNames = [
    ...new Set([
      ...trainingRecords.map((r) => r.businessUnit),
      ...subscriptionRecords.map((r) => r.businessUnit),
    ]),
  ]

  const businessUnitSummaries: BUSummary[] = buNames.map((buName) => {
    const tRecs = trainingRecords.filter((r) => r.businessUnit === buName)
    const sRecs = subscriptionRecords.filter((r) => r.businessUnit === buName)
    const fRecs = feedbackRecords.filter((r) => r.businessUnit === buName)
    const buConfig = businessUnits.find((b) => b.name.toLowerCase() === buName.toLowerCase())

    const trainingCost = tRecs.reduce((s, r) => s + r.cost, 0)
    const subscriptionCost = sRecs.reduce((s, r) => s + r.amount, 0)
    const totalInvestment = trainingCost + subscriptionCost
    const staffTrained = new Set(tRecs.map((r) => r.staffId.toUpperCase())).size
    const subscriptionStaff = new Set(sRecs.map((r) => r.staffId.toUpperCase())).size
    const totalStaff = buConfig?.staffCount ?? 0
    const budget = buConfig?.budget ?? 0
    const coverageRatio = totalStaff > 0 ? (staffTrained / totalStaff) * 100 : 0
    const validF = fRecs.filter((f) => f.confidenceRating != null)
    const avgImpact =
      validF.length > 0
        ? validF.reduce((s, f) => s + (f.confidenceRating ?? 0), 0) / validF.length
        : 0
    const subscriptionRatio = totalInvestment > 0 ? (subscriptionCost / totalInvestment) * 100 : 0
    const budgetUtilisation = budget > 0 ? (trainingCost / budget) * 100 : 0

    return {
      name: buName,
      trainingCost,
      subscriptionCost,
      totalInvestment,
      staffTrained,
      subscriptionStaff,
      totalStaff,
      budget,
      coverageRatio,
      avgImpactScore: avgImpact,
      subscriptionRatio,
      budgetUtilisation,
      isOverBudget: budget > 0 && trainingCost > budget,
    }
  })

  const dataQuality = computeDataQuality(trainingRecords.length, feedbackRecords.length, subscriptionRecords.length)
  const trainingParticipation = computeParticipation(trainingRecords, uniqueStaffTrained)
  const subscriptionParticipation = computeParticipation(
    subscriptionRecords.map((r) => ({ staffId: r.staffId, staffName: r.staffName })),
    uniqueSubscriptionStaff,
  )

  return {
    totalTrainingCost,
    totalSubscriptionCost,
    totalLearningInvestment,
    uniqueStaffTrained,
    uniqueSubscriptionStaff,
    totalUniqueStaff,
    totalStaffCount,
    groupCoverageRatio,
    avgImpactScore,
    trainingSharePct,
    subscriptionSharePct,
    investmentPerStaff,
    businessUnits: businessUnitSummaries.sort((a, b) => b.totalInvestment - a.totalInvestment),
    monthlySpend,
    topTrainings,
    topMembershipOrgs,
    impactDistribution,
    applicationRates,
    forecastedSpend,
    budgetRisk,
    totalBudget,
    dataQuality,
    trainingParticipation,
    subscriptionParticipation,
    availableYears,
  }
}

export async function computeBUAnalytics(buName: string): Promise<BUDetailAnalytics> {
  const [trainingRecords, feedbackRecords, subscriptionRecords, buConfig] = await Promise.all([
    prisma.trainingRecord.findMany({ where: { businessUnit: { equals: buName } } }),
    prisma.feedbackRecord.findMany({ where: { businessUnit: { equals: buName } } }),
    prisma.subscriptionRecord.findMany({ where: { businessUnit: { equals: buName } } }),
    prisma.businessUnit.findFirst({ where: { name: { equals: buName } } }),
  ])

  const trainingCost = trainingRecords.reduce((s, r) => s + r.cost, 0)
  const subscriptionCost = subscriptionRecords.reduce((s, r) => s + r.amount, 0)
  const totalInvestment = trainingCost + subscriptionCost
  const staffTrained = new Set(trainingRecords.map((r) => r.staffId.toUpperCase())).size
  const subscriptionStaff = new Set(subscriptionRecords.map((r) => r.staffId.toUpperCase())).size
  const totalStaff = buConfig?.staffCount ?? 0
  const budget = buConfig?.budget ?? 0
  const coverageRatio = totalStaff > 0 ? (staffTrained / totalStaff) * 100 : 0
  const validF = feedbackRecords.filter((f) => f.confidenceRating != null)
  const avgImpact = validF.length > 0
    ? validF.reduce((s, f) => s + (f.confidenceRating ?? 0), 0) / validF.length
    : 0

  const bu: BUSummary = {
    name: buName,
    trainingCost,
    subscriptionCost,
    totalInvestment,
    staffTrained,
    subscriptionStaff,
    totalStaff,
    budget,
    coverageRatio,
    avgImpactScore: avgImpact,
    subscriptionRatio: totalInvestment > 0 ? (subscriptionCost / totalInvestment) * 100 : 0,
    budgetUtilisation: budget > 0 ? (trainingCost / budget) * 100 : 0,
    isOverBudget: budget > 0 && trainingCost > budget,
  }

  // monthly spend
  const monthMap: Record<string, number> = {}
  trainingRecords.forEach((r) => {
    const key = r.month || 'Unknown'
    monthMap[key] = (monthMap[key] ?? 0) + r.cost
  })
  const monthlyTrainingSpend = Object.entries(monthMap)
    .map(([month, cost]) => ({ month, cost }))
    .sort((a, b) => monthIndex(a.month) - monthIndex(b.month))

  // top trainings
  const trainingMap: Record<string, { count: number; totalCost: number }> = {}
  trainingRecords.forEach((r) => {
    const t = r.training || 'Unknown'
    if (!trainingMap[t]) trainingMap[t] = { count: 0, totalCost: 0 }
    trainingMap[t].count++
    trainingMap[t].totalCost += r.cost
  })
  const topTrainings = Object.entries(trainingMap)
    .map(([training, v]) => ({ training, ...v }))
    .sort((a, b) => b.totalCost - a.totalCost)
    .slice(0, 8)

  // feedback summary
  const appMap: Record<string, number> = {}
  feedbackRecords.forEach((r) => {
    const cat = r.applicationResponse || 'Not specified'
    appMap[cat] = (appMap[cat] ?? 0) + 1
  })
  const impactAreaMap: Record<string, number> = {}
  feedbackRecords.forEach((r) => {
    if (!r.impactAlignment) return
    r.impactAlignment.split(/[,;|]/).map((s) => s.trim()).filter(Boolean).forEach((area) => {
      impactAreaMap[area] = (impactAreaMap[area] ?? 0) + 1
    })
  })

  const feedbackSummary = {
    avgConfidence: avgImpact,
    applicationRates: Object.entries(appMap).map(([category, count]) => ({ category, count })),
    impactAreas: Object.entries(impactAreaMap)
      .map(([area, count]) => ({ area, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8),
  }

  // subscription breakdown
  const orgMap: Record<string, { count: number; totalAmount: number }> = {}
  subscriptionRecords.forEach((r) => {
    const o = r.membershipOrg || 'Unknown'
    if (!orgMap[o]) orgMap[o] = { count: 0, totalAmount: 0 }
    orgMap[o].count++
    orgMap[o].totalAmount += r.amount
  })
  const subscriptionBreakdown = Object.entries(orgMap)
    .map(([org, v]) => ({ org, ...v }))
    .sort((a, b) => b.totalAmount - a.totalAmount)

  const trainingParticipation = computeParticipation(trainingRecords, staffTrained)
  const subscriptionParticipation = computeParticipation(
    subscriptionRecords.map((r) => ({ staffId: r.staffId, staffName: r.staffName })),
    subscriptionStaff,
  )

  return {
    bu,
    monthlyTrainingSpend,
    topTrainings,
    feedbackSummary,
    subscriptionBreakdown,
    trainingParticipation,
    subscriptionParticipation,
  }
}
