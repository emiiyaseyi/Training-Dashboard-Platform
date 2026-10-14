// Talent Acquisition Insights — turns a ranked table into an actual plain-English diagnosis.
// A sorted table still just shows numbers; these functions generate the one-sentence "here's what
// this actually means" headline a human diagnosing the data would say out loud, computed fresh
// from whatever the current filter/period shows — never a static string.

import type { SourceRoleBottleneck, PipelineStageBottleneck, SourceDeclineRate, RequisitionRiskScore, RecommendedSource } from './ta-metrics'

// Below this ratio, the worst entry isn't meaningfully different from the norm — a flat "nothing
// stands out" headline is more honest than manufacturing a finding out of ordinary variance.
const NOTABLE_RATIO = 1.3

function ratio(value: number, baseline: number): number | null {
  if (baseline <= 0) return null
  return value / baseline
}

export function timeToFillHeadline(bottlenecks: SourceRoleBottleneck[], overallAvgDays: number | null): string {
  const worst = bottlenecks[0]
  if (!worst || overallAvgDays == null || overallAvgDays <= 0) {
    return 'Not enough hires with both a Hiring Source and a completed fill to diagnose a bottleneck yet.'
  }
  const r = ratio(worst.avgTimeToFillDays, overallAvgDays)
  if (r == null || r < NOTABLE_RATIO) {
    return `No single Hiring Source + Role combination stands out — Time to Fill is fairly even across the board, close to your overall average of ${(overallAvgDays / 7).toFixed(1)} weeks.`
  }
  return `${worst.hiringSource} hiring for ${worst.role} takes ${(worst.avgTimeToFillDays / 7).toFixed(1)} weeks — ${r.toFixed(1)}x your overall average of ${(overallAvgDays / 7).toFixed(1)} weeks, and your single biggest drag on Time to Fill right now.`
}

export function pipelineStageHeadline(stageBottlenecks: PipelineStageBottleneck[]): string {
  if (stageBottlenecks.length === 0) return 'No open pipeline candidates to diagnose yet — the Pipeline sheet has no active rows in this period/filter.'
  const worst = stageBottlenecks[0]
  const totalCandidates = stageBottlenecks.reduce((s, b) => s + b.count, 0)
  const overallAvgDays = stageBottlenecks.reduce((s, b) => s + b.avgDaysElapsed * b.count, 0) / totalCandidates
  const r = ratio(worst.avgDaysElapsed, overallAvgDays)
  if (r == null || r < NOTABLE_RATIO || stageBottlenecks.length === 1) {
    return `Candidates aren't piling up at any one stage in particular — "${worst.stage}" has the most (${worst.count}), averaging ${worst.avgDaysElapsed.toFixed(0)} days, close to the overall pace.`
  }
  return `"${worst.stage}" is where candidates get stuck the longest — ${worst.count} candidate${worst.count === 1 ? ' is' : 's are'} sitting there for ${worst.avgDaysElapsed.toFixed(0)} days on average, ${r.toFixed(1)}x longer than the typical stage. That's the real chokepoint in your pipeline right now.`
}

export function declineRateHeadline(declineRates: SourceDeclineRate[], overallDeclineRate: number | null): string {
  const notable = declineRates.filter((d) => d.declineRate != null && d.declineRate > 0)
  if (notable.length === 0 || overallDeclineRate == null) {
    return declineRates.length === 0
      ? 'No resolved offers with a Hiring Source recorded yet to diagnose decline patterns.'
      : `No Hiring Source shows a meaningfully elevated decline rate — every source is close to your overall rate of ${((overallDeclineRate ?? 0) * 100).toFixed(0)}%.`
  }
  const worst = notable[0]
  const r = worst.declineRate != null ? ratio(worst.declineRate, Math.max(overallDeclineRate, 0.01)) : null
  if (r == null || r < NOTABLE_RATIO) {
    return `No Hiring Source shows a meaningfully elevated decline rate — the highest, ${worst.hiringSource}, is close to your overall rate of ${(overallDeclineRate * 100).toFixed(0)}%.`
  }
  return `${worst.hiringSource} has the highest decline rate at ${((worst.declineRate ?? 0) * 100).toFixed(0)}% — ${r.toFixed(1)}x your overall rate of ${(overallDeclineRate * 100).toFixed(0)}%. Candidates sourced this way are declining offers notably more often than average.`
}

export function requisitionRiskHeadline(scores: RequisitionRiskScore[]): string {
  if (scores.length === 0) return 'No open (Pending) requisitions to score right now.'
  const atRisk = scores.filter((s) => s.risk === 'at-risk')
  const trendingLate = scores.filter((s) => s.risk === 'trending-late')
  if (atRisk.length === 0 && trendingLate.length === 0) {
    return `All ${scores.length} open requisition${scores.length === 1 ? '' : 's'} ${scores.length === 1 ? 'is' : 'are'} tracking close to the historical pace for their role and source — nothing flagged as at risk right now.`
  }
  if (atRisk.length > 0) {
    const worst = atRisk[0]
    return `${atRisk.length} of ${scores.length} open requisition${scores.length === 1 ? '' : 's'} ${atRisk.length === 1 ? 'is' : 'are'} at risk of missing their expected fill date — ${worst.candidateName} (${worst.role}, ${worst.bu}) has been open ${worst.daysElapsed.toFixed(0)} days against a typical ${worst.expectedDays?.toFixed(0) ?? '—'} for that role/source. Worth escalating before they slip further.`
  }
  const worst = trendingLate[0]
  return `${trendingLate.length} of ${scores.length} open requisition${scores.length === 1 ? '' : 's'} ${trendingLate.length === 1 ? 'is' : 'are'} trending late — none critical yet, but ${worst.candidateName} (${worst.role}) is already past the typical pace and worth a check-in.`
}

export function recommendedSourceHeadline(recommendations: RecommendedSource[]): string {
  if (recommendations.length === 0) {
    return 'Not enough roles with 2+ Hiring Sources tried, and 2+ hires per source, to compare sources against each other yet.'
  }
  const top = recommendations[0]
  const declineText = top.declineRate == null ? 'no decline data yet' : `a ${(top.declineRate * 100).toFixed(0)}% decline rate`
  return `${recommendations.length} role${recommendations.length === 1 ? '' : 's'} now ${recommendations.length === 1 ? 'has' : 'have'} enough history to compare sources. For ${top.role}, ${top.recommendedSource} is the best-performing source tried so far — ${(top.avgTimeToFillDays / 7).toFixed(1)} weeks to fill on average with ${declineText}, out of ${top.alternativesConsidered} sources compared.`
}
