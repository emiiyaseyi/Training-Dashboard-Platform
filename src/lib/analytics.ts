import { prisma } from './prisma'
import { MONTHS, type PeriodFilter } from './filter-types'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RedFlag {
  severity: 'critical' | 'warning'
  message: string
  buName?: string
}

export interface BUBenchmark {
  name: string
  lci: number
  lciLabel: 'Emerging' | 'Developing' | 'Mature'
}

export interface LearningIntelligence {
  // Row 1 — Core
  learningDepth: number
  lci: number
  lciLabel: 'Emerging' | 'Developing' | 'Mature'
  feedbackCredibility: number
  feedbackCredibilityLabel: 'High Confidence' | 'Moderate' | 'Low'
  investmentFairness: number
  // Row 2 — Risk
  participationInequality: number
  subscriptionActivationRate: number
  subscriptionCostPerMember: number
  redFlags: RedFlag[]
  topBU: BUBenchmark | null
  bottomBU: BUBenchmark | null
  // Row 3 — Narrative
  narrative: string[]
  // New feedback dimensions
  avgRoleRelevance: number
  avgExpectationsMet: number
}

export interface StaffHoursRow {
  staffId: string
  staffName: string
  businessUnit: string
  formalHours: number
  kssHours: number
  totalHours: number
  trainingCount: number
  meets40h: boolean
  trainingItems: { training: string; hours: number; month: string }[]
  kssItems: { hours: number; month: string }[]
}

export interface TrainingHoursReport {
  hasData: boolean
  hoursThreshold: number  // compliance target (40h for full year, scaled for partial periods)
  totalFormalHours: number
  totalKSSHours: number
  totalHours: number
  avgHoursPerStaff: number
  staffMeeting40h: number
  staffMeeting40hPct: number
  staffBelow40h: number
  hoursDistribution: { range: string; count: number }[]
  staffDetail: StaffHoursRow[]
  costPerHour: number     // total training cost / total hours
}

export interface VendorPerformance {
  training: string
  vendorName: string
  avgRating: number
  responses: number
}

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
  avgRoleRelevance: number
  avgExpectationsMet: number
  avgVendorRating: number
  vendorPerformance: VendorPerformance[]
  learningIntelligence: LearningIntelligence
  hoursReport: TrainingHoursReport
}

export interface StaffAttendanceRow {
  staffId: string
  staffName: string
  trainingCount: number
  programmes: string[]  // unique training names attended
}

export interface TrainingRoster {
  training: string
  staff: { staffId: string; staffName: string }[]
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
  avgRoleRelevance: number
  avgExpectationsMet: number
  avgVendorRating: number
  vendorPerformance: VendorPerformance[]
  intelligence: LearningIntelligence
  hoursReport: TrainingHoursReport
  staffAttendance: StaffAttendanceRow[]
  trainingRosters: TrainingRoster[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MONTH_ORDER = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
]

function monthIndex(m: string): number {
  return MONTH_ORDER.indexOf(m.toLowerCase())
}

function filterMonthCount(filter: PeriodFilter): number {
  if (filter.mode === 'all' || filter.mode === 'year') return 12
  if (filter.mode === 'ytd') return new Date().getMonth() + 1
  if (filter.mode === 'range' && filter.fromMonth && filter.toMonth) {
    const from = MONTHS.indexOf(filter.fromMonth as typeof MONTHS[number])
    const to   = MONTHS.indexOf(filter.toMonth   as typeof MONTHS[number])
    if (from !== -1 && to !== -1) return Math.max(1, to - from + 1)
  }
  return 12
}

function computeHoursReport(
  trainingRecords: { staffId: string; staffName: string; businessUnit: string; hours: number | null; cost: number; training: string; month: string }[],
  kssRecords: { staffId: string; staffName: string; businessUnit: string; durationMinutes: number; month?: string | null }[],
  threshold = 40,
): TrainingHoursReport {
  const hasTrainingHours = trainingRecords.some((r) => r.hours && r.hours > 0)
  const hasKSS = kssRecords.length > 0
  if (!hasTrainingHours && !hasKSS) {
    return {
      hasData: false, hoursThreshold: threshold, totalFormalHours: 0, totalKSSHours: 0, totalHours: 0,
      avgHoursPerStaff: 0, staffMeeting40h: 0, staffMeeting40hPct: 0, staffBelow40h: 0,
      hoursDistribution: [], staffDetail: [], costPerHour: 0,
    }
  }

  const staffMap = new Map<string, { staffName: string; businessUnit: string; formalH: number; kssH: number; count: number }>()
  const trainingItemsMap = new Map<string, { training: string; hours: number; month: string }[]>()
  const kssItemsMap = new Map<string, { hours: number; month: string }[]>()

  for (const r of trainingRecords) {
    const id = r.staffId.toUpperCase()
    if (!staffMap.has(id)) staffMap.set(id, { staffName: r.staffName, businessUnit: r.businessUnit, formalH: 0, kssH: 0, count: 0 })
    const e = staffMap.get(id)!
    const h = r.hours ?? 0
    e.formalH += h
    e.count++
    if (h > 0) {
      if (!trainingItemsMap.has(id)) trainingItemsMap.set(id, [])
      trainingItemsMap.get(id)!.push({ training: r.training || 'Unknown', hours: h, month: r.month })
    }
  }
  for (const r of kssRecords) {
    const id = r.staffId.toUpperCase()
    if (!staffMap.has(id)) staffMap.set(id, { staffName: r.staffName, businessUnit: r.businessUnit, formalH: 0, kssH: 0, count: 0 })
    const h = r.durationMinutes / 60
    staffMap.get(id)!.kssH += h
    if (h > 0) {
      if (!kssItemsMap.has(id)) kssItemsMap.set(id, [])
      kssItemsMap.get(id)!.push({ hours: Math.round(h * 100) / 100, month: r.month || '' })
    }
  }

  const entries = [...staffMap.entries()]
  const totalFormalHours = entries.reduce((s, [, v]) => s + v.formalH, 0)
  const totalKSSHours = entries.reduce((s, [, v]) => s + v.kssH, 0)
  const totalHours = totalFormalHours + totalKSSHours
  const totalCost = trainingRecords.reduce((s, r) => s + r.cost, 0)

  const staffDetail: StaffHoursRow[] = entries
    .map(([id, v]) => ({
      staffId: id, staffName: v.staffName, businessUnit: v.businessUnit,
      formalHours: Math.round(v.formalH * 10) / 10,
      kssHours:    Math.round(v.kssH    * 10) / 10,
      totalHours:  Math.round((v.formalH + v.kssH) * 10) / 10,
      trainingCount: v.count,
      meets40h: (v.formalH + v.kssH) >= threshold,
      trainingItems: trainingItemsMap.get(id) ?? [],
      kssItems: kssItemsMap.get(id) ?? [],
    }))
    .sort((a, b) => b.totalHours - a.totalHours)

  const staffMeeting40h = staffDetail.filter((s) => s.meets40h).length
  const avgHoursPerStaff = staffDetail.length > 0 ? totalHours / staffDetail.length : 0

  const q = threshold / 4
  const bands = [
    { range: `0–${q} hrs`,        min: 0,     max: q },
    { range: `${q}–${q*2} hrs`,   min: q,     max: q * 2 },
    { range: `${q*2}–${q*3} hrs`, min: q * 2, max: q * 3 },
    { range: `${q*3}–${threshold} hrs`, min: q * 3, max: threshold },
    { range: `${threshold}+ hrs`, min: threshold, max: Infinity },
  ]
  const hoursDistribution = bands.map(({ range, min, max }) => ({
    range, count: staffDetail.filter((s) => s.totalHours >= min && s.totalHours < max).length,
  }))

  return {
    hasData: true,
    hoursThreshold: threshold,
    totalFormalHours: Math.round(totalFormalHours * 10) / 10,
    totalKSSHours:    Math.round(totalKSSHours * 10) / 10,
    totalHours:       Math.round(totalHours * 10) / 10,
    avgHoursPerStaff: Math.round(avgHoursPerStaff * 10) / 10,
    staffMeeting40h,
    staffMeeting40hPct: staffDetail.length > 0 ? (staffMeeting40h / staffDetail.length) * 100 : 0,
    staffBelow40h: staffDetail.length - staffMeeting40h,
    hoursDistribution,
    staffDetail,
    costPerHour: totalHours > 0 ? totalCost / totalHours : 0,
  }
}

function computeVendorPerformance(
  feedbackRecords: { trainingTitle: string; vendorRating: number | null; vendorName?: string | null }[],
): { avgVendorRating: number; vendorPerformance: VendorPerformance[] } {
  const vendorMap = new Map<string, { sum: number; count: number; names: Map<string, number> }>()
  for (const f of feedbackRecords) {
    if (!f.vendorRating || f.vendorRating <= 0) continue
    const t = f.trainingTitle || 'Unknown'
    if (!vendorMap.has(t)) vendorMap.set(t, { sum: 0, count: 0, names: new Map() })
    const e = vendorMap.get(t)!
    e.sum += f.vendorRating
    e.count++
    const vn = (f.vendorName || '').trim()
    if (vn) e.names.set(vn, (e.names.get(vn) ?? 0) + 1)
  }
  const vendorPerformance: VendorPerformance[] = [...vendorMap.entries()]
    .map(([training, v]) => {
      const topName = [...v.names.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
      return { training, vendorName: topName, avgRating: Math.round((v.sum / v.count) * 10) / 10, responses: v.count }
    })
    .sort((a, b) => b.avgRating - a.avgRating)

  const allValid = feedbackRecords.filter((f) => f.vendorRating && f.vendorRating > 0)
  const avgVendorRating = allValid.length > 0
    ? Math.round((allValid.reduce((s, f) => s + (f.vendorRating ?? 0), 0) / allValid.length) * 10) / 10
    : 0

  return { avgVendorRating, vendorPerformance }
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

// ─── LCI & Intelligence helpers ──────────────────────────────────────────────

function computeLCI(
  coverageRatio: number,
  avgImpactScore: number,
  feedbackCoverage: number,
  learningDepth: number,
  avgRoleRelevance: number,
): number {
  const coverage  = (Math.min(coverageRatio, 100) / 100) * 30
  const impact    = (avgImpactScore / 5) * 25
  const feedback  = (Math.min(feedbackCoverage, 100) / 100) * 20
  const depth     = Math.min(learningDepth / 3, 1) * 15
  const relevance = avgRoleRelevance > 0 ? (avgRoleRelevance / 5) * 10 : 5
  return Math.round(coverage + impact + feedback + depth + relevance)
}

function lciLabel(lci: number): 'Emerging' | 'Developing' | 'Mature' {
  if (lci >= 71) return 'Mature'
  if (lci >= 41) return 'Developing'
  return 'Emerging'
}

function feedbackCredibilityLabel(pct: number): 'High Confidence' | 'Moderate' | 'Low' {
  if (pct >= 50) return 'High Confidence'
  if (pct >= 20) return 'Moderate'
  return 'Low'
}

function participationInequalityPct(trainingRecords: { staffId: string }[]): number {
  const countMap = new Map<string, number>()
  for (const r of trainingRecords) {
    const id = r.staffId.toUpperCase()
    countMap.set(id, (countMap.get(id) ?? 0) + 1)
  }
  const sorted = [...countMap.values()].sort((a, b) => b - a)
  const totalStaff = sorted.length
  if (totalStaff === 0) return 0
  const top20n = Math.max(1, Math.ceil(totalStaff * 0.2))
  const top20activity = sorted.slice(0, top20n).reduce((s, c) => s + c, 0)
  const totalActivity = sorted.reduce((s, c) => s + c, 0)
  return totalActivity > 0 ? (top20activity / totalActivity) * 100 : 0
}

function avgOfValid(records: { value: number | null }[]): number {
  const valid = records.filter((r) => r.value != null && r.value > 0)
  if (valid.length === 0) return 0
  return valid.reduce((s, r) => s + (r.value ?? 0), 0) / valid.length
}

function buildRedFlags(params: {
  businessUnits: BUSummary[]
  budgetRisk: string
  avgImpactScore: number
  feedbackCredibility: number
}): RedFlag[] {
  const flags: RedFlag[] = []
  const { businessUnits, budgetRisk, avgImpactScore, feedbackCredibility } = params

  const lowCovBUs = businessUnits.filter((b) => b.totalStaff > 0 && b.coverageRatio < 30)
  for (const bu of lowCovBUs) {
    flags.push({ severity: 'critical', message: `${bu.name} has low staff coverage (${bu.coverageRatio.toFixed(0)}%)`, buName: bu.name })
  }
  if (budgetRisk !== 'on-track') {
    flags.push({ severity: budgetRisk === 'over-budget' ? 'critical' : 'warning', message: budgetRisk === 'over-budget' ? 'Projected annual spend exceeds approved budget' : 'Projected spend approaching budget limit' })
  }
  if (avgImpactScore > 0 && avgImpactScore < 3.5) {
    flags.push({ severity: 'critical', message: `Average impact score is low at ${avgImpactScore.toFixed(1)}/5` })
  }
  if (feedbackCredibility < 20) {
    flags.push({ severity: 'warning', message: `Feedback coverage is low at ${feedbackCredibility.toFixed(0)}% — impact data may be unreliable` })
  }
  return flags
}

function buildBUBenchmarks(
  businessUnits: BUSummary[],
  allTraining: { staffId: string; businessUnit: string }[],
  allFeedback: { businessUnit: string; confidenceRating: number | null; roleRelevance: number | null }[],
): { top: BUBenchmark | null; bottom: BUBenchmark | null; buLCIs: Map<string, number> } {
  const buLCIs = new Map<string, number>()
  for (const bu of businessUnits) {
    if (bu.totalInvestment === 0) continue
    const buTraining = allTraining.filter((r) => r.businessUnit === bu.name)
    const buFeedback = allFeedback.filter((r) => r.businessUnit === bu.name)
    const learningDepth = bu.staffTrained > 0 ? buTraining.length / bu.staffTrained : 0
    const feedbackCov = buTraining.length > 0 ? (buFeedback.length / buTraining.length) * 100 : 0
    const avgRelArr = buFeedback.map((f) => ({ value: f.roleRelevance }))
    const avgRel = avgOfValid(avgRelArr)
    const lci = computeLCI(bu.coverageRatio, bu.avgImpactScore, feedbackCov, learningDepth, avgRel)
    buLCIs.set(bu.name, lci)
  }
  if (buLCIs.size === 0) return { top: null, bottom: null, buLCIs }
  const sorted = [...buLCIs.entries()].sort((a, b) => b[1] - a[1])
  const [topName, topLCI]      = sorted[0]
  const [btmName, btmLCI]      = sorted[sorted.length - 1]
  return {
    top:    { name: topName, lci: topLCI, lciLabel: lciLabel(topLCI) },
    bottom: topName !== btmName ? { name: btmName, lci: btmLCI, lciLabel: lciLabel(btmLCI) } : null,
    buLCIs,
  }
}

function generateIntelligenceNarrative(li: LearningIntelligence): string[] {
  const s: string[] = []

  // Learning depth
  if (li.learningDepth < 1.5) {
    s.push(`Learning depth is shallow at ${li.learningDepth.toFixed(1)}x per staff — most employees attended only one programme, indicating limited repeat engagement.`)
  } else if (li.learningDepth >= 3) {
    s.push(`Strong learning depth at ${li.learningDepth.toFixed(1)}x per staff signals active re-engagement and a growing learning culture.`)
  } else {
    s.push(`Learning depth stands at ${li.learningDepth.toFixed(1)}x per staff — moderate engagement with meaningful room to deepen participation.`)
  }

  // Feedback credibility
  if (li.feedbackCredibility < 20) {
    s.push(`Only ${li.feedbackCredibility.toFixed(0)}% of training participants provided feedback, significantly limiting confidence in reported impact scores.`)
  } else if (li.feedbackCredibility < 50) {
    s.push(`Feedback coverage at ${li.feedbackCredibility.toFixed(0)}% is moderate — improving response rates would sharpen the quality of insight generated.`)
  } else {
    s.push(`Feedback coverage is strong at ${li.feedbackCredibility.toFixed(0)}%, providing high confidence in the impact and relevance data reported.`)
  }

  // Participation inequality
  if (li.participationInequality > 50) {
    s.push(`The top 20% of staff account for ${li.participationInequality.toFixed(0)}% of all learning activity — a concentration risk signalling unequal access to development opportunities.`)
  } else {
    s.push(`Learning participation is relatively distributed, with the top 20% of staff accounting for ${li.participationInequality.toFixed(0)}% of training activity.`)
  }

  // LCI
  s.push(`The organisation's Learning Culture Index (LCI) of ${li.lci}/100 places it in the ${li.lciLabel} stage — ${
    li.lciLabel === 'Emerging'   ? 'foundational investment is in place but cultural embedding requires deliberate acceleration.' :
    li.lciLabel === 'Developing' ? 'strong foundations are present with growing breadth and depth of learning activity.' :
                                    'learning is deeply embedded and consistently delivering strategic value.'
  }`)

  // Role relevance
  if (li.avgRoleRelevance > 0) {
    s.push(`Staff rate training relevance to their role at ${li.avgRoleRelevance.toFixed(1)}/5 — ${
      li.avgRoleRelevance >= 4.0 ? 'a strong signal of targeted, role-aligned learning investment.' :
      li.avgRoleRelevance >= 3.0 ? 'reasonable alignment with room to sharpen programme targeting.' :
                                    'a signal to review whether training selections closely match role requirements.'
    }`)
  }

  return s.slice(0, 5)
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
    allFeedbackRecords,
    allSubscriptionRecords,
    businessUnits,
    allKSS,
  ] = await Promise.all([
    prisma.trainingRecord.findMany(),
    prisma.feedbackRecord.findMany(),
    prisma.subscriptionRecord.findMany(),
    prisma.businessUnit.findMany(),
    prisma.kSSRecord.findMany(),
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

  // Apply filter to KSS records
  let kssRecords = allKSS
  if (filter.mode !== 'all' && filter.year) {
    kssRecords = kssRecords.filter((r) => r.year === filter.year)
  }
  if (months) {
    kssRecords = kssRecords.filter((r) => !r.month || months.has(r.month as typeof MONTHS[number]))
  }

  // Apply month filter to subscription records (no year field on SubscriptionRecord)
  let subscriptionRecords = allSubscriptionRecords
  if (months) {
    subscriptionRecords = allSubscriptionRecords.filter(
      (r) => !r.month || months.has(r.month as typeof MONTHS[number])
    )
  }

  // Apply month filter to feedback records
  let feedbackRecords = allFeedbackRecords
  if (months) {
    feedbackRecords = allFeedbackRecords.filter(
      (r) => !r.month || months.has(r.month as typeof MONTHS[number])
    )
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

  // ── New feedback dimensions ──
  const avgRoleRelevance = avgOfValid(validFeedback.map((f) => ({ value: f.roleRelevance })))
  const avgExpectationsMet = avgOfValid(validFeedback.map((f) => ({ value: f.expectationsMet })))

  // ── Learning Intelligence ──
  const feedbackCoverage = trainingRecords.length > 0
    ? (feedbackRecords.length / trainingRecords.length) * 100 : 0
  const learningDepth = uniqueStaffTrained > 0 ? trainingRecords.length / uniqueStaffTrained : 0
  const groupLCI = computeLCI(groupCoverageRatio, avgImpactScore, feedbackCoverage, learningDepth, avgRoleRelevance)
  const subscriptionActivationRate = totalUniqueStaff > 0 ? (uniqueSubscriptionStaff / totalUniqueStaff) * 100 : 0
  const subscriptionCostPerMember = uniqueSubscriptionStaff > 0 ? totalSubscriptionCost / uniqueSubscriptionStaff : 0
  const participationInequality = participationInequalityPct(trainingRecords)
  const redFlags = buildRedFlags({ businessUnits: businessUnitSummaries, budgetRisk, avgImpactScore, feedbackCredibility: feedbackCoverage })

  const { top: topBU, bottom: bottomBU } = buildBUBenchmarks(
    businessUnitSummaries,
    trainingRecords,
    feedbackRecords,
  )

  const liBase: LearningIntelligence = {
    learningDepth,
    lci: groupLCI,
    lciLabel: lciLabel(groupLCI),
    feedbackCredibility: feedbackCoverage,
    feedbackCredibilityLabel: feedbackCredibilityLabel(feedbackCoverage),
    investmentFairness: investmentPerStaff,
    participationInequality,
    subscriptionActivationRate,
    subscriptionCostPerMember,
    redFlags,
    topBU,
    bottomBU,
    narrative: [],
    avgRoleRelevance,
    avgExpectationsMet,
  }
  const learningIntelligence: LearningIntelligence = { ...liBase, narrative: generateIntelligenceNarrative(liBase) }

  // ── Hours + Vendor ──
  const hoursThreshold = Math.max(1, Math.round((filterMonthCount(filter) / 12) * 40))
  const hoursReport = computeHoursReport(trainingRecords, kssRecords, hoursThreshold)
  const { avgVendorRating, vendorPerformance } = computeVendorPerformance(feedbackRecords)

  const sortedBUs = businessUnitSummaries.sort((a, b) => b.totalInvestment - a.totalInvestment)

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
    businessUnits: sortedBUs,
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
    avgRoleRelevance,
    avgExpectationsMet,
    avgVendorRating,
    vendorPerformance,
    learningIntelligence,
    hoursReport,
  }
}

export async function computeBUAnalytics(
  buName: string,
  filter: PeriodFilter = { mode: 'all' },
): Promise<BUDetailAnalytics> {
  const [allTraining, allFeedback, allSubscriptions, buConfig,
         groupAllTraining, groupAllFeedback, groupAllBUConfigs, buKSS] = await Promise.all([
    prisma.trainingRecord.findMany({ where: { businessUnit: { equals: buName } } }),
    prisma.feedbackRecord.findMany({ where: { businessUnit: { equals: buName } } }),
    prisma.subscriptionRecord.findMany({ where: { businessUnit: { equals: buName } } }),
    prisma.businessUnit.findFirst({ where: { name: { equals: buName } } }),
    prisma.trainingRecord.findMany(),
    prisma.feedbackRecord.findMany(),
    prisma.businessUnit.findMany(),
    prisma.kSSRecord.findMany({ where: { businessUnit: { equals: buName } } }),
  ])

  // Apply period filter to training records (same logic as group analytics)
  let trainingRecords = allTraining
  if (filter.mode !== 'all' && filter.year) {
    trainingRecords = trainingRecords.filter((r) => r.year === filter.year)
  }
  const months = allowedMonths(filter)
  if (months) {
    trainingRecords = trainingRecords.filter((r) =>
      months.has(r.month as typeof MONTHS[number])
    )
  }

  // Apply month filter to feedback (uses the new month field)
  let feedbackRecords = allFeedback
  if (months) {
    feedbackRecords = feedbackRecords.filter((r) =>
      !r.month || months.has(r.month as typeof MONTHS[number])
    )
  }

  // Apply month filter to subscriptions (uses the new month field)
  let subscriptionRecords = allSubscriptions
  if (months) {
    subscriptionRecords = subscriptionRecords.filter((r) =>
      !r.month || months.has(r.month as typeof MONTHS[number])
    )
  }

  // Filter KSS records for this BU
  let kssRecords = buKSS
  if (filter.mode !== 'all' && filter.year) {
    kssRecords = kssRecords.filter((r) => r.year === filter.year)
  }
  if (months) {
    kssRecords = kssRecords.filter((r) => !r.month || months.has(r.month as typeof MONTHS[number]))
  }

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

  // ── BU-level new feedback dimensions ──
  const buAvgRoleRelevance = avgOfValid(validF.map((f) => ({ value: f.roleRelevance })))
  const buAvgExpectationsMet = avgOfValid(validF.map((f) => ({ value: f.expectationsMet })))

  // ── BU-level intelligence ──
  const buFeedbackCoverage = trainingRecords.length > 0 ? (feedbackRecords.length / trainingRecords.length) * 100 : 0
  const buLearningDepth = staffTrained > 0 ? trainingRecords.length / staffTrained : 0
  const buLCI = computeLCI(coverageRatio, avgImpact, buFeedbackCoverage, buLearningDepth, buAvgRoleRelevance)
  const buSubActivation = (staffTrained + subscriptionStaff) > 0 ? (subscriptionStaff / Math.max(staffTrained, 1)) * 100 : 0
  const buSubCostPerMember = subscriptionStaff > 0 ? subscriptionCost / subscriptionStaff : 0
  const buParticipationInequality = participationInequalityPct(trainingRecords)
  const buRedFlags = buildRedFlags({
    businessUnits: [bu],
    budgetRisk: budget > 0 && trainingCost > budget ? 'over-budget' : budget > 0 && trainingCost > budget * 0.85 ? 'at-risk' : 'on-track',
    avgImpactScore: avgImpact,
    feedbackCredibility: buFeedbackCoverage,
  })

  // ── Group-level benchmarking (compare all BUs so the panel can show top/bottom) ──
  const groupBuNames = [...new Set(groupAllTraining.map((r) => r.businessUnit))]
  const groupBUSummaries: BUSummary[] = groupBuNames.map((name) => {
    const tRecs = groupAllTraining.filter((r) => r.businessUnit === name)
    const fRecs = groupAllFeedback.filter((r) => r.businessUnit === name)
    const cfg   = groupAllBUConfigs.find((b) => b.name === name)
    const tc    = tRecs.reduce((s, r) => s + r.cost, 0)
    const st    = new Set(tRecs.map((r) => r.staffId.toUpperCase())).size
    const ts    = cfg?.staffCount ?? 0
    const vF    = fRecs.filter((f) => f.confidenceRating != null)
    const ai    = vF.length > 0 ? vF.reduce((s, f) => s + (f.confidenceRating ?? 0), 0) / vF.length : 0
    return {
      name,
      trainingCost: tc, subscriptionCost: 0, totalInvestment: tc,
      staffTrained: st, subscriptionStaff: 0,
      totalStaff: ts, budget: cfg?.budget ?? 0,
      coverageRatio: ts > 0 ? (st / ts) * 100 : 0,
      avgImpactScore: ai,
      subscriptionRatio: 0, budgetUtilisation: 0, isOverBudget: false,
    } as BUSummary
  })
  const { top: topBU, bottom: bottomBU } = buildBUBenchmarks(
    groupBUSummaries,
    groupAllTraining,
    groupAllFeedback,
  )

  const buLIBase: LearningIntelligence = {
    learningDepth: buLearningDepth,
    lci: buLCI,
    lciLabel: lciLabel(buLCI),
    feedbackCredibility: buFeedbackCoverage,
    feedbackCredibilityLabel: feedbackCredibilityLabel(buFeedbackCoverage),
    investmentFairness: totalStaff > 0 ? (trainingCost + subscriptionCost) / totalStaff : 0,
    participationInequality: buParticipationInequality,
    subscriptionActivationRate: buSubActivation,
    subscriptionCostPerMember: buSubCostPerMember,
    redFlags: buRedFlags,
    topBU,
    bottomBU,
    narrative: [],
    avgRoleRelevance: buAvgRoleRelevance,
    avgExpectationsMet: buAvgExpectationsMet,
  }
  const buIntelligence: LearningIntelligence = { ...buLIBase, narrative: generateIntelligenceNarrative(buLIBase) }

  // ── Staff attendance list (filtered period) ──────────────────────────────
  const staffMap = new Map<string, { staffName: string; programmes: Set<string> }>()
  for (const r of trainingRecords) {
    const id = r.staffId.toUpperCase()
    if (!staffMap.has(id)) staffMap.set(id, { staffName: r.staffName, programmes: new Set() })
    staffMap.get(id)!.programmes.add(r.training || 'Unknown')
  }
  const staffAttendance: StaffAttendanceRow[] = [...staffMap.entries()]
    .map(([staffId, v]) => ({
      staffId,
      staffName: v.staffName,
      trainingCount: v.programmes.size,
      programmes: [...v.programmes].sort(),
    }))
    .sort((a, b) => b.trainingCount - a.trainingCount || a.staffName.localeCompare(b.staffName))

  // ── Training rosters (who attended each programme) ───────────────────────
  const rosterMap = new Map<string, Map<string, string>>() // training → Map<staffId, staffName>
  for (const r of trainingRecords) {
    const t = r.training || 'Unknown'
    if (!rosterMap.has(t)) rosterMap.set(t, new Map())
    rosterMap.get(t)!.set(r.staffId.toUpperCase(), r.staffName)
  }
  const trainingRosters: TrainingRoster[] = [...rosterMap.entries()]
    .map(([training, staffMap2]) => ({
      training,
      staff: [...staffMap2.entries()]
        .map(([staffId, staffName]) => ({ staffId, staffName }))
        .sort((a, b) => a.staffName.localeCompare(b.staffName)),
    }))
    .sort((a, b) => b.staff.length - a.staff.length)

  // ── BU-level hours + vendor ──
  const buHoursThreshold = Math.max(1, Math.round((filterMonthCount(filter) / 12) * 40))
  const buHoursReport = computeHoursReport(trainingRecords, kssRecords, buHoursThreshold)
  const { avgVendorRating: buAvgVendorRating, vendorPerformance: buVendorPerformance } = computeVendorPerformance(feedbackRecords)

  return {
    bu,
    monthlyTrainingSpend,
    topTrainings,
    feedbackSummary,
    subscriptionBreakdown,
    trainingParticipation,
    subscriptionParticipation,
    avgRoleRelevance: buAvgRoleRelevance,
    avgExpectationsMet: buAvgExpectationsMet,
    avgVendorRating: buAvgVendorRating,
    vendorPerformance: buVendorPerformance,
    intelligence: buIntelligence,
    hoursReport: buHoursReport,
    staffAttendance,
    trainingRosters,
  }
}
