import { computeBUAnalytics } from '@/lib/analytics'
import type { BUSummary } from '@/lib/analytics'
import { MONTHS, type PeriodFilter, type Month } from '@/lib/filter-types'

// Read-only comparisons built by calling the existing, untouched computeBUAnalytics() twice (or
// four times, at quarter-end) with different single-period filters and diffing the results — this
// file adds NO new calculation logic to analytics.ts itself, just re-uses what's already there.

export interface MetricDelta {
  label: string
  current: number
  previous: number
  deltaAbs: number
  deltaPct: number | null // null when previous is 0 (percentage change is undefined)
}

const COMPARED_METRICS: { key: keyof BUSummary; label: string }[] = [
  { key: 'totalInvestment', label: 'Total Learning Investment' },
  { key: 'trainingCost', label: 'Formal Training Spend' },
  { key: 'otherInvestmentCost', label: 'Strategic Learnings Spend' },
  { key: 'subscriptionCost', label: 'Subscription Spend' },
  { key: 'staffTrained', label: 'Staff Trained' },
  { key: 'coverageRatio', label: 'Coverage %' },
  { key: 'avgImpactScore', label: 'Avg Impact Score' },
  { key: 'budgetUtilisation', label: 'Budget Utilisation %' },
]

function buildDeltas(current: BUSummary, previous: BUSummary): MetricDelta[] {
  return COMPARED_METRICS.map(({ key, label }) => {
    const c = Number(current[key]) || 0
    const p = Number(previous[key]) || 0
    return {
      label,
      current: c,
      previous: p,
      deltaAbs: c - p,
      deltaPct: p !== 0 ? ((c - p) / p) * 100 : null,
    }
  })
}

function monthFilter(year: number, monthIdx: number): PeriodFilter {
  const month = MONTHS[monthIdx] as Month
  return { mode: 'range', year, fromMonth: month, toMonth: month }
}

function quarterFilter(year: number, quarterIdx: number): PeriodFilter {
  const from = MONTHS[quarterIdx * 3] as Month
  const to = MONTHS[quarterIdx * 3 + 2] as Month
  return { mode: 'range', year, fromMonth: from, toMonth: to }
}

// Quarter-end months (index 2=Mar, 5=Jun, 8=Sep, 11=Dec) fold a quarterly comparison into that
// month's report, per the agreed design — no separate quarterly email.
function isQuarterEndMonth(monthIdx: number): boolean {
  return [2, 5, 8, 11].includes(monthIdx)
}

export interface BUReportComparison {
  businessUnit: string
  year: number
  monthIdx: number
  currentMonth: BUSummary
  previousMonth: BUSummary
  monthlyDeltas: MetricDelta[]
  quarterly?: {
    currentQuarter: BUSummary
    previousQuarter: BUSummary
    quarterlyDeltas: MetricDelta[]
    quarterLabel: string // e.g. "Q3 2026"
    previousQuarterLabel: string
  }
}

export async function computeBUReportComparison(businessUnit: string, year: number, monthIdx: number): Promise<BUReportComparison> {
  const prevMonthIdx = monthIdx === 0 ? 11 : monthIdx - 1
  const prevMonthYear = monthIdx === 0 ? year - 1 : year

  const [currentDetail, previousDetail] = await Promise.all([
    computeBUAnalytics(businessUnit, monthFilter(year, monthIdx)),
    computeBUAnalytics(businessUnit, monthFilter(prevMonthYear, prevMonthIdx)),
  ])

  const result: BUReportComparison = {
    businessUnit,
    year,
    monthIdx,
    currentMonth: currentDetail.bu,
    previousMonth: previousDetail.bu,
    monthlyDeltas: buildDeltas(currentDetail.bu, previousDetail.bu),
  }

  if (isQuarterEndMonth(monthIdx)) {
    const quarterIdx = Math.floor(monthIdx / 3) // 0=Q1 ... 3=Q4
    const prevQuarterIdx = quarterIdx === 0 ? 3 : quarterIdx - 1
    const prevQuarterYear = quarterIdx === 0 ? year - 1 : year

    const [currentQuarterDetail, previousQuarterDetail] = await Promise.all([
      computeBUAnalytics(businessUnit, quarterFilter(year, quarterIdx)),
      computeBUAnalytics(businessUnit, quarterFilter(prevQuarterYear, prevQuarterIdx)),
    ])

    result.quarterly = {
      currentQuarter: currentQuarterDetail.bu,
      previousQuarter: previousQuarterDetail.bu,
      quarterlyDeltas: buildDeltas(currentQuarterDetail.bu, previousQuarterDetail.bu),
      quarterLabel: `Q${quarterIdx + 1} ${year}`,
      previousQuarterLabel: `Q${prevQuarterIdx + 1} ${prevQuarterYear}`,
    }
  }

  return result
}
