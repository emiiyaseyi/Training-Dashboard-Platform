import { describe, it, expect, vi, beforeEach } from 'vitest'

// computeGroupAnalytics fans out to a wide set of Prisma models plus computeTalentMemberReport —
// mocked here so this test exercises only the cost/budget aggregation math itself (the
// highest-blast-radius part of this file: a silent miscalculation here is wrong numbers on every
// report, not a crash), not the DB layer or the (separately owned) Talent Member report.
//
// vi.mock factories are hoisted above regular `const` declarations, so anything referenced inside
// one must itself come from vi.hoisted(). See https://vitest.dev/api/vi.html#vi-hoisted
const { findMany, budgetSettingsFindFirst } = vi.hoisted(() => ({
  findMany: {
    trainingRecord: vi.fn(),
    feedbackRecord: vi.fn(),
    subscriptionRecord: vi.fn(),
    businessUnit: vi.fn(),
    kSSRecord: vi.fn(),
    trainingType: vi.fn(),
    differentiatingCapability: vi.fn(),
    managerReviewRecord: vi.fn(),
  },
  budgetSettingsFindFirst: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    trainingRecord: { findMany: (...a: unknown[]) => findMany.trainingRecord(...a) },
    feedbackRecord: { findMany: (...a: unknown[]) => findMany.feedbackRecord(...a) },
    subscriptionRecord: { findMany: (...a: unknown[]) => findMany.subscriptionRecord(...a) },
    businessUnit: { findMany: (...a: unknown[]) => findMany.businessUnit(...a) },
    kSSRecord: { findMany: (...a: unknown[]) => findMany.kSSRecord(...a) },
    trainingType: { findMany: (...a: unknown[]) => findMany.trainingType(...a) },
    differentiatingCapability: { findMany: (...a: unknown[]) => findMany.differentiatingCapability(...a) },
    managerReviewRecord: { findMany: (...a: unknown[]) => findMany.managerReviewRecord(...a) },
    budgetSettings: { findFirst: (...a: unknown[]) => budgetSettingsFindFirst(...a) },
  },
}))

vi.mock('@/lib/talent-member', () => ({
  computeTalentMemberReport: vi.fn().mockResolvedValue({
    totalTalentMembers: 0,
    staffTrained: 0,
    staffNotTrained: 0,
    staffExempted: 0,
    totalSpend: 0,
    coveragePct: 0,
  }),
}))

// vi.mock is hoisted above this import too, so computeGroupAnalytics below already resolves
// '@/lib/prisma' and '@/lib/talent-member' to the mocks registered above.
import { computeGroupAnalytics } from './analytics'

function trainingRecord(overrides: Partial<{
  staffId: string; staffName: string; businessUnit: string; training: string
  month: string; year: number; cost: number; trainingType: string | null
}> = {}) {
  return {
    staffId: 'S1', staffName: 'Jane Doe', businessUnit: 'Finance', training: 'Course A',
    month: 'March', year: 2026, cost: 0, trainingType: null,
    ...overrides,
  }
}

beforeEach(() => {
  Object.values(findMany).forEach((fn) => fn.mockReset())
  findMany.feedbackRecord.mockResolvedValue([])
  findMany.subscriptionRecord.mockResolvedValue([])
  findMany.kSSRecord.mockResolvedValue([])
  findMany.trainingType.mockResolvedValue([])
  findMany.differentiatingCapability.mockResolvedValue([])
  findMany.managerReviewRecord.mockResolvedValue([])
  budgetSettingsFindFirst.mockReset().mockResolvedValue({ countSubscriptionsInBudget: false })
})

describe('computeGroupAnalytics — cost & budget aggregation', () => {
  it('sums formal training cost per BU and flags a BU over its configured budget', async () => {
    findMany.businessUnit.mockResolvedValue([
      { name: 'Finance', budget: 1000, staffCount: 2 },
      { name: 'Operations', budget: 500, staffCount: 1 },
    ])
    findMany.trainingRecord.mockResolvedValue([
      trainingRecord({ staffId: 'S1', businessUnit: 'Finance', cost: 300 }),
      trainingRecord({ staffId: 'S2', businessUnit: 'Finance', cost: 500 }),
      trainingRecord({ staffId: 'S3', businessUnit: 'Operations', cost: 600 }),
    ])

    const result = await computeGroupAnalytics({ mode: 'all' })

    expect(result.totalTrainingCost).toBe(1400)
    expect(result.totalBudget).toBe(1500)

    const finance = result.businessUnits.find((b) => b.name === 'Finance')!
    expect(finance.trainingCost).toBe(800)
    expect(finance.budget).toBe(1000)
    expect(finance.budgetUtilisation).toBe(80)
    expect(finance.isOverBudget).toBe(false)

    const ops = result.businessUnits.find((b) => b.name === 'Operations')!
    expect(ops.trainingCost).toBe(600)
    expect(ops.budget).toBe(500)
    expect(ops.budgetUtilisation).toBe(120)
    expect(ops.isOverBudget).toBe(true)
  })

  it('splits formal vs "other" (Strategic Learning Initiative) cost by TrainingType classification', async () => {
    findMany.businessUnit.mockResolvedValue([{ name: 'Finance', budget: 0, staffCount: 5 }])
    findMany.trainingType.mockResolvedValue([
      { name: 'Internal Training', classification: 'formal' },
      { name: 'Summit', classification: 'other' },
    ])
    findMany.trainingRecord.mockResolvedValue([
      trainingRecord({ businessUnit: 'Finance', cost: 200, trainingType: 'Internal Training' }),
      trainingRecord({ businessUnit: 'Finance', cost: 100, trainingType: 'Summit' }),
    ])

    const result = await computeGroupAnalytics({ mode: 'all' })

    expect(result.totalTrainingCost).toBe(200)
    expect(result.totalOtherTrainingCost).toBe(100)
    expect(result.totalLearningInvestment).toBe(300)
  })

  it('treats a null/legacy trainingType as formal (Internal Training)', async () => {
    findMany.businessUnit.mockResolvedValue([{ name: 'Finance', budget: 0, staffCount: 1 }])
    findMany.trainingRecord.mockResolvedValue([
      trainingRecord({ businessUnit: 'Finance', cost: 250, trainingType: null }),
    ])

    const result = await computeGroupAnalytics({ mode: 'all' })

    expect(result.totalTrainingCost).toBe(250)
    expect(result.totalOtherTrainingCost).toBe(0)
  })

  it('excludes subscription cost from budget utilisation unless countSubscriptionsInBudget is enabled', async () => {
    findMany.businessUnit.mockResolvedValue([{ name: 'Finance', budget: 1000, staffCount: 1 }])
    findMany.trainingRecord.mockResolvedValue([trainingRecord({ businessUnit: 'Finance', cost: 400 })])
    findMany.subscriptionRecord.mockResolvedValue([
      { staffId: 'S1', staffName: 'Jane', businessUnit: 'Finance', membershipOrg: 'CFA', amount: 900, category: 'membership' },
    ])

    const withoutSubs = await computeGroupAnalytics({ mode: 'all' })
    const finance1 = withoutSubs.businessUnits.find((b) => b.name === 'Finance')!
    expect(finance1.totalInvestment).toBe(1300) // still counted in overall investment
    expect(finance1.budgetUtilisation).toBe(40) // but not against budget
    expect(finance1.isOverBudget).toBe(false)

    budgetSettingsFindFirst.mockResolvedValue({ countSubscriptionsInBudget: true })
    const withSubs = await computeGroupAnalytics({ mode: 'all' })
    const finance2 = withSubs.businessUnits.find((b) => b.name === 'Finance')!
    expect(finance2.budgetUtilisation).toBe(130)
    expect(finance2.isOverBudget).toBe(true)
  })

  it('counts unique staff trained once even with multiple training records for the same staffId', async () => {
    findMany.businessUnit.mockResolvedValue([{ name: 'Finance', budget: 0, staffCount: 10 }])
    findMany.trainingRecord.mockResolvedValue([
      trainingRecord({ staffId: 'S1', businessUnit: 'Finance', cost: 100 }),
      trainingRecord({ staffId: 'S1', businessUnit: 'Finance', cost: 50 }),
      trainingRecord({ staffId: 'S2', businessUnit: 'Finance', cost: 75 }),
    ])

    const result = await computeGroupAnalytics({ mode: 'all' })

    expect(result.uniqueStaffTrained).toBe(2)
    expect(result.groupCoverageRatio).toBe(20) // 2 of 10 staff
  })

  it('filters training records by year and month range without double-counting excluded periods', async () => {
    findMany.businessUnit.mockResolvedValue([{ name: 'Finance', budget: 0, staffCount: 1 }])
    findMany.trainingRecord.mockResolvedValue([
      trainingRecord({ businessUnit: 'Finance', cost: 100, year: 2025, month: 'March' }),
      trainingRecord({ businessUnit: 'Finance', cost: 200, year: 2026, month: 'March' }),
      trainingRecord({ businessUnit: 'Finance', cost: 400, year: 2026, month: 'August' }),
    ])

    const result = await computeGroupAnalytics({ mode: 'range', year: 2026, fromMonth: 'January', toMonth: 'June' })

    expect(result.totalTrainingCost).toBe(200)
  })

  it('scopes every total to the given buScope, matching a BU-restricted user', async () => {
    findMany.businessUnit.mockResolvedValue([
      { name: 'Finance', budget: 1000, staffCount: 2 },
      { name: 'Operations', budget: 500, staffCount: 1 },
    ])
    findMany.trainingRecord.mockResolvedValue([
      trainingRecord({ businessUnit: 'Finance', cost: 300 }),
      trainingRecord({ businessUnit: 'Operations', cost: 600 }),
    ])

    const result = await computeGroupAnalytics({ mode: 'all' }, ['Finance'])

    expect(result.totalTrainingCost).toBe(300)
    expect(result.totalBudget).toBe(1000)
    expect(result.businessUnits.map((b) => b.name)).toEqual(['Finance'])
  })

  it('returns zeroed totals with no NaN/divide-by-zero when there is no data at all', async () => {
    findMany.businessUnit.mockResolvedValue([])
    findMany.trainingRecord.mockResolvedValue([])

    const result = await computeGroupAnalytics({ mode: 'all' })

    expect(result.totalTrainingCost).toBe(0)
    expect(result.totalBudget).toBe(0)
    expect(result.groupCoverageRatio).toBe(0)
    expect(result.businessUnits).toEqual([])
    expect(Number.isNaN(result.investmentPerStaff)).toBe(false)
  })
})
