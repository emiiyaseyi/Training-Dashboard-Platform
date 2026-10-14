// Learning & Development Insights — Diagnostic / Predictive / Prescriptive layer built entirely
// on top of the aggregates computeGroupAnalytics() and computeSkillsGapReport() already compute
// (BUSummary[], vendorPerformance, hoursReport, learningIntelligence.redFlags, talentMember,
// skills-gap rows) — no new Prisma queries, just small composable derivations over data the
// dashboard already trusts, mirroring the style of src/lib/ta-metrics.ts.

import type { BUSummary, VendorPerformance, TrainingHoursReport, TalentMemberReport, RedFlag } from './analytics'
import type { SkillsGapReport, SkillsGapRow } from './skills-gap'

// ---------- Diagnostic ----------

export interface CostImpactMismatch {
  buName: string
  totalInvestment: number
  avgImpactScore: number
  investmentPerImpactPoint: number | null
}

const MIN_IMPACT_SCORE = 0.1

/** Investment per point of self-reported impact score, per BU — surfaces BUs spending heavily
 * relative to what staff say they're getting out of it, which a blended average investment figure
 * hides. BUs with no measurable impact score yet (investmentPerImpactPoint: null) are kept but
 * sorted last — "no data" isn't the same diagnosis as "poor return". */
export function costImpactMismatches(businessUnits: BUSummary[]): CostImpactMismatch[] {
  return businessUnits
    .filter((bu) => bu.totalInvestment > 0)
    .map((bu) => ({
      buName: bu.name,
      totalInvestment: bu.totalInvestment,
      avgImpactScore: bu.avgImpactScore,
      investmentPerImpactPoint: bu.avgImpactScore > MIN_IMPACT_SCORE ? bu.totalInvestment / bu.avgImpactScore : null,
    }))
    .sort((a, b) => (b.investmentPerImpactPoint ?? -1) - (a.investmentPerImpactPoint ?? -1))
}

// ---------- Predictive ----------

export interface BudgetOverrunRisk {
  buName: string
  budget: number
  spendToDate: number
  monthsElapsed: number
  projectedFullYearSpend: number
  projectedUtilisation: number
  risk: 'on-track' | 'at-risk' | 'over-budget'
}

const AT_RISK_UTILISATION_PCT = 85

/** Projects each BU's full-year spend from its spend-to-date and how many months of the year have
 * elapsed, so a BU on pace to breach its budget gets flagged BEFORE it actually breaches — not
 * just after, which is all `isOverBudget` on BUSummary can tell you. */
export function budgetOverrunRisks(businessUnits: BUSummary[], monthsElapsed: number): BudgetOverrunRisk[] {
  const months = monthsElapsed > 0 ? Math.min(monthsElapsed, 12) : 12
  return businessUnits
    .filter((bu) => bu.budget > 0)
    .map((bu) => {
      const projectedFullYearSpend = bu.totalInvestment * (12 / months)
      const projectedUtilisation = (projectedFullYearSpend / bu.budget) * 100
      const risk: BudgetOverrunRisk['risk'] =
        bu.isOverBudget || projectedUtilisation >= 100
          ? 'over-budget'
          : projectedUtilisation >= AT_RISK_UTILISATION_PCT
          ? 'at-risk'
          : 'on-track'
      return { buName: bu.name, budget: bu.budget, spendToDate: bu.totalInvestment, monthsElapsed: months, projectedFullYearSpend, projectedUtilisation, risk }
    })
    .sort((a, b) => b.projectedUtilisation - a.projectedUtilisation)
}

export interface HoursComplianceRisk {
  staffId: string
  staffName: string
  businessUnit: string
  totalHours: number
  threshold: number
  pctOfThreshold: number
  severity: 'critical' | 'warning'
}

const CRITICAL_HOURS_PCT = 50

/** Staff currently below the (period-scaled) hours threshold, i.e. trending to miss the annual
 * training-hours target if the rest of the year continues at their current pace. hoursReport's
 * own threshold is already pro-rated for the active filter period, so this is a direct read, not
 * a re-derivation — just ranked and severity-banded for the Insights view. */
export function hoursComplianceRisks(hoursReport: TrainingHoursReport): HoursComplianceRisk[] {
  if (!hoursReport.hasData || hoursReport.hoursThreshold <= 0) return []
  return hoursReport.staffDetail
    .filter((s) => !s.meets40h)
    .map((s) => {
      const pctOfThreshold = (s.totalHours / hoursReport.hoursThreshold) * 100
      return {
        staffId: s.staffId,
        staffName: s.staffName,
        businessUnit: s.businessUnit,
        totalHours: s.totalHours,
        threshold: hoursReport.hoursThreshold,
        pctOfThreshold,
        severity: pctOfThreshold < CRITICAL_HOURS_PCT ? ('critical' as const) : ('warning' as const),
      }
    })
    .sort((a, b) => a.pctOfThreshold - b.pctOfThreshold)
}

export interface TalentMemberCoverageRisk {
  totalHeadcount: number
  staffTrained: number
  staffNotTrained: number
  staffWithUpcomingTraining: number
  staffAtRisk: number
  coveragePct: number
  atRiskPct: number
}

/** Talent Members with neither a completed training nor one scheduled — the group actually at
 * risk of finishing the year uncovered, as distinct from staffNotTrained alone (which includes
 * people already booked and simply haven't attended yet). */
export function talentMemberCoverageRisk(tm: TalentMemberReport): TalentMemberCoverageRisk {
  const staffAtRisk = Math.max(0, tm.staffNotTrained - tm.staffWithUpcomingTraining)
  return {
    totalHeadcount: tm.totalHeadcount,
    staffTrained: tm.staffTrained,
    staffNotTrained: tm.staffNotTrained,
    staffWithUpcomingTraining: tm.staffWithUpcomingTraining,
    staffAtRisk,
    coveragePct: tm.coveragePct,
    atRiskPct: tm.totalHeadcount > 0 ? (staffAtRisk / tm.totalHeadcount) * 100 : 0,
  }
}

// ---------- Prescriptive ----------

export interface VendorRecommendation {
  training: string
  recommendedVendor: string | null
  avgRating: number
  alternativesConsidered: number
  action: string
}

const MIN_VENDOR_RESPONSES = 2
const LOW_RATING_THRESHOLD = 3
const NOTABLE_RATING_GAP = 0.5

/** For each training with 2+ vendors tried (enough responses to trust each), recommends
 * consolidating on the best-rated one. A training with only one vendor and a low rating is kept
 * too, but as a "go find an alternative" prompt rather than a head-to-head recommendation. */
export function vendorRecommendations(vendorPerformance: VendorPerformance[]): VendorRecommendation[] {
  const byTraining = new Map<string, VendorPerformance[]>()
  for (const v of vendorPerformance) {
    if (v.responses < MIN_VENDOR_RESPONSES || !v.vendorName) continue
    const arr = byTraining.get(v.training) ?? []
    arr.push(v)
    byTraining.set(v.training, arr)
  }

  const result: VendorRecommendation[] = []
  for (const [training, vendors] of byTraining.entries()) {
    const sorted = [...vendors].sort((a, b) => b.avgRating - a.avgRating)
    const best = sorted[0]
    const worst = sorted[sorted.length - 1]
    if (vendors.length >= 2 && best.avgRating - worst.avgRating >= NOTABLE_RATING_GAP) {
      result.push({
        training,
        recommendedVendor: best.vendorName,
        avgRating: best.avgRating,
        alternativesConsidered: vendors.length,
        action: `Consolidate on ${best.vendorName} (${best.avgRating.toFixed(1)}/5) over ${vendors.length - 1} lower-rated alternative${vendors.length - 1 === 1 ? '' : 's'}.`,
      })
    } else if (vendors.length === 1 && best.avgRating > 0 && best.avgRating < LOW_RATING_THRESHOLD) {
      result.push({
        training,
        recommendedVendor: null,
        avgRating: best.avgRating,
        alternativesConsidered: 1,
        action: `${best.vendorName} rates ${best.avgRating.toFixed(1)}/5 with no alternative tried yet — worth sourcing a second vendor to compare.`,
      })
    }
  }
  return result.sort((a, b) => a.avgRating - b.avgRating)
}

export interface BudgetReallocationSuggestion {
  fromBU: string
  toBU: string
  suggestedAmount: number
  reason: string
}

const SURPLUS_UTILISATION_PCT = 70

/** Pairs BUs projected to come in well under budget (real headroom) with BUs projected to breach
 * theirs, suggesting how much to move and why — turns the Predictive budget-risk list into a
 * concrete reallocation instead of just a warning. */
export function budgetReallocationSuggestions(risks: BudgetOverrunRisk[]): BudgetReallocationSuggestion[] {
  const surplusPool = risks
    .filter((r) => r.risk === 'on-track' && r.projectedUtilisation < SURPLUS_UTILISATION_PCT)
    .map((r) => ({ buName: r.buName, headroom: r.budget - r.projectedFullYearSpend }))
    .filter((r) => r.headroom > 0)
    .sort((a, b) => b.headroom - a.headroom)

  const deficits = risks
    .filter((r) => r.risk !== 'on-track')
    .map((r) => ({ buName: r.buName, gap: r.projectedFullYearSpend - r.budget, risk: r.risk }))
    .filter((r) => r.gap > 0)
    .sort((a, b) => b.gap - a.gap)

  const suggestions: BudgetReallocationSuggestion[] = []
  for (const d of deficits) {
    const donor = surplusPool.find((s) => s.headroom > 0)
    if (!donor) break
    const amount = Math.min(donor.headroom, d.gap)
    if (amount <= 0) continue
    suggestions.push({
      fromBU: donor.buName,
      toBU: d.buName,
      suggestedAmount: amount,
      reason: `${d.buName} is projected to ${d.risk === 'over-budget' ? 'exceed' : 'approach'} its budget by ₦${Math.round(d.gap).toLocaleString()}; ${donor.buName} is tracking well under budget with room to spare.`,
    })
    donor.headroom -= amount
  }
  return suggestions
}

export interface PriorityIntervention {
  area: string
  severity: 'critical' | 'warning'
  description: string
  recommendedAction: string
}

/** Merges the existing Learning Intelligence red flags with critical capability gaps into one
 * ranked action list — the single "what do I actually do first" view Prescriptive is for. */
export function priorityInterventions(skillsGap: SkillsGapReport, redFlags: RedFlag[]): PriorityIntervention[] {
  const items: PriorityIntervention[] = []
  for (const flag of redFlags) {
    items.push({
      area: flag.buName ?? 'Group-wide',
      severity: flag.severity,
      description: flag.message,
      recommendedAction: flag.severity === 'critical' ? 'Escalate to the BU head this cycle.' : 'Monitor next period and flag if it persists.',
    })
  }
  for (const gap of skillsGap.topGaps.filter((g: SkillsGapRow) => g.severity === 'critical')) {
    items.push({
      area: `${gap.groupValue} — ${gap.capability}`,
      severity: 'critical',
      description: `Only ${gap.coverageRatio.toFixed(0)}% of ${gap.groupValue} staff are covered on ${gap.capability} (${gap.staffTrained}/${gap.totalStaff}).`,
      recommendedAction: `Schedule ${gap.capability} training for ${gap.groupValue} next cycle.`,
    })
  }
  const order: Record<PriorityIntervention['severity'], number> = { critical: 0, warning: 1 }
  return items.sort((a, b) => order[a.severity] - order[b.severity])
}
