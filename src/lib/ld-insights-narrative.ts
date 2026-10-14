// L&D Insights — one plain-English headline per sub-tab, generated fresh from whatever the
// current filter/BU scope shows. Mirrors src/lib/ta-insights-narrative.ts's pattern: compare the
// worst finding to a baseline, and say "nothing stands out" honestly when nothing does rather
// than manufacturing a finding out of ordinary variance.

import type {
  CostImpactMismatch,
  BudgetOverrunRisk,
  HoursComplianceRisk,
  TalentMemberCoverageRisk,
  VendorRecommendation,
  BudgetReallocationSuggestion,
  PriorityIntervention,
} from './ld-insights-metrics'
import type { LearningIntelligence } from './analytics'
import type { SkillsGapReport } from './skills-gap'

const NOTABLE_RATIO = 1.3

function fmtNaira(n: number): string {
  return `₦${Math.round(n).toLocaleString()}`
}

// ---------- Diagnostic ----------

export function coverageGapHeadline(skillsGap: SkillsGapReport): string {
  if (!skillsGap.hasRosterData || skillsGap.topGaps.length === 0) {
    return 'No capability coverage gaps to diagnose yet — not enough roster/training data in this period/filter.'
  }
  const critical = skillsGap.topGaps.filter((g) => g.severity === 'critical')
  if (critical.length === 0) {
    return 'No business unit/role has a critical capability gap right now — the worst coverage ratios are still in the moderate range.'
  }
  const worst = critical[0]
  return `${critical.length} business unit/role combination${critical.length === 1 ? '' : 's'} ${critical.length === 1 ? 'has' : 'have'} a critical capability gap — ${worst.groupValue} is only ${worst.coverageRatio.toFixed(0)}% covered on ${worst.capability} (${worst.staffTrained}/${worst.totalStaff} staff). That's the most exposed combination right now.`
}

export function costImpactHeadline(mismatches: CostImpactMismatch[]): string {
  const scored = mismatches.filter((m) => m.investmentPerImpactPoint != null)
  if (scored.length === 0) {
    return 'Not enough business units with both spend and a measured impact score yet to diagnose cost-vs-impact mismatches.'
  }
  const avgPerPoint = scored.reduce((s, m) => s + (m.investmentPerImpactPoint ?? 0), 0) / scored.length
  const worst = scored[0]
  const r = avgPerPoint > 0 && worst.investmentPerImpactPoint != null ? worst.investmentPerImpactPoint / avgPerPoint : null
  if (r == null || r < NOTABLE_RATIO) {
    return 'No business unit is spending notably more per point of impact score than the rest — cost and impact are fairly proportionate across the board.'
  }
  return `${worst.buName} spends ${fmtNaira(worst.investmentPerImpactPoint ?? 0)} per point of impact score — ${r.toFixed(1)}x the typical rate — despite an average impact score of only ${worst.avgImpactScore.toFixed(1)}/5. Spend here isn't translating into reported impact the way it is elsewhere.`
}

export function redFlagHeadline(intelligence: LearningIntelligence): string {
  if (intelligence.redFlags.length === 0) {
    return 'No participation or feedback-credibility red flags are currently active — activity looks reasonably spread across staff.'
  }
  const critical = intelligence.redFlags.filter((f) => f.severity === 'critical')
  const worst = critical[0] ?? intelligence.redFlags[0]
  return `${intelligence.redFlags.length} red flag${intelligence.redFlags.length === 1 ? '' : 's'} active (${critical.length} critical) — most pressing: ${worst.message}`
}

// ---------- Predictive ----------

export function budgetRiskHeadline(risks: BudgetOverrunRisk[]): string {
  if (risks.length === 0) return 'No business unit has a budget set for this period, so projected overrun can’t be assessed yet.'
  const atRiskOrOver = risks.filter((r) => r.risk !== 'on-track')
  if (atRiskOrOver.length === 0) {
    return `All ${risks.length} business unit${risks.length === 1 ? '' : 's'} with a budget ${risks.length === 1 ? 'is' : 'are'} projected to stay within it at the current spend pace.`
  }
  const worst = risks[0]
  const verb = worst.risk === 'over-budget' ? 'has already breached' : 'is on pace to breach'
  return `${atRiskOrOver.length} business unit${atRiskOrOver.length === 1 ? '' : 's'} projected to exceed budget at the current pace — ${worst.buName} ${verb} its budget, projected to land at ${worst.projectedUtilisation.toFixed(0)}% utilisation (${fmtNaira(worst.projectedFullYearSpend)} of ${fmtNaira(worst.budget)}).`
}

export function hoursComplianceHeadline(risks: HoursComplianceRisk[], totalStaffWithHours: number): string {
  if (totalStaffWithHours === 0) return 'No staff hours data in this period/filter to assess 40-hour compliance risk yet.'
  if (risks.length === 0) return `All ${totalStaffWithHours} staff with recorded hours are on pace to meet the training-hours target for this period.`
  const critical = risks.filter((r) => r.severity === 'critical')
  const worst = risks[0]
  return `${risks.length} of ${totalStaffWithHours} staff are trending behind the training-hours target (${critical.length} critically so) — ${worst.staffName} (${worst.businessUnit}) is at only ${worst.pctOfThreshold.toFixed(0)}% of the ${worst.threshold.toFixed(0)}-hour target so far.`
}

export function talentMemberRiskHeadline(risk: TalentMemberCoverageRisk): string {
  if (risk.totalHeadcount === 0) return 'No Talent Member headcount on record for this period.'
  if (risk.staffAtRisk === 0) {
    return `Every Talent Member either has a completed training or one already scheduled — none are currently at risk of finishing the period uncovered.`
  }
  return `${risk.staffAtRisk} of ${risk.totalHeadcount} Talent Members (${risk.atRiskPct.toFixed(0)}%) have neither attended nor have a training scheduled — they're the ones at risk of finishing the period with no coverage at all, distinct from the ${risk.coveragePct.toFixed(0)}% overall coverage figure.`
}

// ---------- Prescriptive ----------

export function vendorRecommendationHeadline(recommendations: VendorRecommendation[]): string {
  if (recommendations.length === 0) {
    return 'Not enough trainings with 2+ vendors tried (or a clearly low-rated single vendor) to make a vendor recommendation yet.'
  }
  const switches = recommendations.filter((r) => r.recommendedVendor != null)
  const top = recommendations[0]
  if (top.recommendedVendor) {
    return `${switches.length} training${switches.length === 1 ? '' : 's'} ${switches.length === 1 ? 'has' : 'have'} a clear best vendor to consolidate on. Lowest-rated gap: for ${top.training}, switch toward ${top.recommendedVendor} (${top.avgRating.toFixed(1)}/5) over the alternatives tried.`
  }
  return `No training has two vendors to compare yet, but ${top.training}'s only vendor rates just ${top.avgRating.toFixed(1)}/5 — worth sourcing a second vendor to benchmark against.`
}

export function budgetReallocationHeadline(suggestions: BudgetReallocationSuggestion[]): string {
  if (suggestions.length === 0) {
    return 'No clear reallocation opportunity right now — either no business unit has meaningful budget headroom, or none is projected to need it.'
  }
  const totalMoved = suggestions.reduce((s, x) => s + x.suggestedAmount, 0)
  const top = suggestions[0]
  return `${suggestions.length} reallocation${suggestions.length === 1 ? '' : 's'} suggested, moving ${fmtNaira(totalMoved)} in total. Top priority: shift ${fmtNaira(top.suggestedAmount)} from ${top.fromBU} to ${top.toBU}.`
}

export function priorityInterventionHeadline(items: PriorityIntervention[]): string {
  if (items.length === 0) return 'No active red flags or critical capability gaps — nothing is flagged for immediate intervention right now.'
  const critical = items.filter((i) => i.severity === 'critical')
  const top = items[0]
  return `${items.length} item${items.length === 1 ? '' : 's'} on the intervention list (${critical.length} critical). Top priority — ${top.area}: ${top.recommendedAction}`
}
