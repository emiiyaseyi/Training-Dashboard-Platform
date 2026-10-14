import { NextRequest, NextResponse } from 'next/server'
import { requireSession, buScopeFilter } from '@/lib/session-guard'
import { computeGroupAnalytics } from '@/lib/analytics'
import { computeSkillsGapReport } from '@/lib/skills-gap'
import { parsePeriodFilterFromParams, MONTHS, type PeriodFilter } from '@/lib/filter-types'
import {
  costImpactMismatches,
  budgetOverrunRisks,
  hoursComplianceRisks,
  talentMemberCoverageRisk,
  vendorRecommendations,
  budgetReallocationSuggestions,
  priorityInterventions,
} from '@/lib/ld-insights-metrics'

// Months elapsed in the active filter — used to project full-year budget run-rate. 'all'/'year'
// treat the whole year as elapsed (nothing to project against); 'ytd' uses the real current
// month; 'range' uses the span the caller picked.
function monthsElapsedFor(filter: PeriodFilter): number {
  if (filter.mode === 'ytd') return new Date().getMonth() + 1
  if (filter.mode === 'range' && filter.fromMonth && filter.toMonth) {
    const from = MONTHS.indexOf(filter.fromMonth)
    const to = MONTHS.indexOf(filter.toMonth)
    if (from !== -1 && to !== -1) return Math.max(1, to - from + 1)
  }
  return 12
}

export async function GET(req: NextRequest) {
  const session = await requireSession()
  if (session instanceof NextResponse) return session
  const scope = buScopeFilter(session)

  const sp = req.nextUrl.searchParams
  const stage = sp.get('stage')
  if (stage !== 'diagnostic' && stage !== 'predictive' && stage !== 'prescriptive') {
    return NextResponse.json({ error: 'stage must be diagnostic, predictive, or prescriptive.' }, { status: 400 })
  }
  const filter = parsePeriodFilterFromParams(sp)

  try {
    const analytics = await computeGroupAnalytics(filter, scope)

    if (stage === 'diagnostic') {
      const skillsGap = await computeSkillsGapReport(filter, scope)
      return NextResponse.json({
        availableYears: analytics.availableYears,
        coverageGaps: skillsGap,
        costImpact: costImpactMismatches(analytics.businessUnits),
        learningIntelligence: analytics.learningIntelligence,
      })
    }

    if (stage === 'predictive') {
      const monthsElapsed = monthsElapsedFor(filter)
      const hoursRisks = hoursComplianceRisks(analytics.hoursReport)
      return NextResponse.json({
        availableYears: analytics.availableYears,
        budgetRisks: budgetOverrunRisks(analytics.businessUnits, monthsElapsed),
        hoursRisks,
        totalStaffWithHours: analytics.hoursReport.staffDetail.length,
        talentMemberRisk: talentMemberCoverageRisk(analytics.talentMember),
      })
    }

    // prescriptive
    const skillsGap = await computeSkillsGapReport(filter, scope)
    const monthsElapsed = monthsElapsedFor(filter)
    const budgetRisks = budgetOverrunRisks(analytics.businessUnits, monthsElapsed)
    return NextResponse.json({
      availableYears: analytics.availableYears,
      vendorRecommendations: vendorRecommendations(analytics.vendorPerformance),
      budgetReallocations: budgetReallocationSuggestions(budgetRisks),
      priorityInterventions: priorityInterventions(skillsGap, analytics.learningIntelligence.redFlags),
    })
  } catch (err) {
    console.error('[analytics/insights]', err)
    return NextResponse.json({ error: 'Failed to compute insights.' }, { status: 500 })
  }
}
