import type { GroupAnalytics } from './analytics'

export function generateExecutiveNarrative(data: GroupAnalytics): string[] {
  const insights: string[] = []

  if (data.totalLearningInvestment === 0) {
    return ['No data has been uploaded yet. Upload training cost and subscription data to generate insights.']
  }

  // Investment overview
  insights.push(
    `Total learning investment stands at ${fmt(data.totalLearningInvestment)}, ` +
    `comprising ${pct(data.trainingSharePct)} in formal training and ${pct(data.subscriptionSharePct)} in professional subscriptions.`
  )

  // Coverage
  if (data.totalStaffCount > 0) {
    const level = data.groupCoverageRatio >= 80 ? 'strong' : data.groupCoverageRatio >= 50 ? 'moderate' : 'low'
    insights.push(
      `Staff training coverage is ${level} at ${pct(data.groupCoverageRatio)} — ` +
      `${data.uniqueStaffTrained.toLocaleString()} of ${data.totalStaffCount.toLocaleString()} staff have received training this period.`
    )
  }

  // Impact
  if (data.avgImpactScore > 0) {
    const quality = data.avgImpactScore >= 4.0 ? 'high' : data.avgImpactScore >= 3.0 ? 'moderate' : 'low'
    insights.push(
      `Average training impact score is ${quality} at ${data.avgImpactScore.toFixed(1)}/5, based on participant confidence ratings.`
    )
  }

  // Budget risk
  if (data.totalBudget > 0) {
    if (data.budgetRisk === 'over-budget') {
      insights.push(
        `Budget alert: Projected annual training spend of ${fmt(data.forecastedSpend)} exceeds the approved budget of ${fmt(data.totalBudget)} — ` +
        `immediate review recommended.`
      )
    } else if (data.budgetRisk === 'at-risk') {
      insights.push(
        `Budget caution: Projected spend of ${fmt(data.forecastedSpend)} is approaching the annual budget of ${fmt(data.totalBudget)} — monitor closely.`
      )
    } else {
      insights.push(
        `Training spend is on track. Projected annual spend of ${fmt(data.forecastedSpend)} is within the approved budget of ${fmt(data.totalBudget)}.`
      )
    }
  }

  // BU standouts
  if (data.businessUnits.length > 0) {
    const highest = data.businessUnits[0]
    const lowest = data.businessUnits[data.businessUnits.length - 1]
    if (highest.name !== lowest.name) {
      insights.push(
        `${highest.name} leads total learning investment at ${fmt(highest.totalInvestment)}, ` +
        `while ${lowest.name} records the lowest at ${fmt(lowest.totalInvestment)}.`
      )
    }

    const overBudget = data.businessUnits.filter((b) => b.isOverBudget)
    if (overBudget.length > 0) {
      insights.push(
        `${overBudget.length} business unit${overBudget.length > 1 ? 's have' : ' has'} exceeded approved training budgets: ` +
        overBudget.map((b) => b.name).join(', ') + '.'
      )
    }

    const lowCoverage = data.businessUnits.filter((b) => b.totalStaff > 0 && b.coverageRatio < 30)
    if (lowCoverage.length > 0) {
      insights.push(
        `Learning equity alert: ${lowCoverage.map((b) => b.name).join(', ')} ` +
        `${lowCoverage.length > 1 ? 'have' : 'has'} coverage below 30% — consider targeted interventions.`
      )
    }
  }

  // Top membership org
  if (data.topMembershipOrgs.length > 0) {
    const top = data.topMembershipOrgs[0]
    const sharePct = data.totalSubscriptionCost > 0 ? (top.totalAmount / data.totalSubscriptionCost) * 100 : 0
    if (sharePct > 30) {
      insights.push(
        `${top.org} accounts for ${pct(sharePct)} of total subscription spend — consider diversifying professional body investments.`
      )
    }
  }

  // Per-staff investment
  if (data.investmentPerStaff > 0) {
    insights.push(`The organisation invests ${fmt(data.investmentPerStaff)} per staff member in total learning annually.`)
  }

  return insights
}

function fmt(n: number): string {
  return '₦' + n.toLocaleString('en-NG', { maximumFractionDigits: 0 })
}

function pct(n: number): string {
  return n.toFixed(1) + '%'
}
