import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.mock factories are hoisted above regular `const` declarations, so any mock referenced inside
// one must itself come from vi.hoisted(). See https://vitest.dev/api/vi.html#vi-hoisted
const { findManyRoster, findManyTraining, findManySchedule } = vi.hoisted(() => ({
  findManyRoster: vi.fn(),
  findManyTraining: vi.fn(),
  findManySchedule: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    staffRosterRecord: { findMany: (...args: unknown[]) => findManyRoster(...args) },
    trainingRecord: { findMany: (...args: unknown[]) => findManyTraining(...args) },
    trainingSchedule: { findMany: (...args: unknown[]) => findManySchedule(...args) },
  },
}))

// vi.mock is hoisted above this import too, so computeYetToAttend below already resolves
// '@/lib/prisma' to the mock registered above.
import { computeYetToAttend } from './roster-analytics'

function rosterRow(overrides: Partial<{
  staffId: string
  firstName: string
  middleName: string | null
  lastName: string
  businessUnit: string
  confirmed: boolean
  employmentType: string | null
  createdAt: Date
  role: string | null
  department: string | null
  employmentDate: Date | null
}> = {}) {
  return {
    staffId: 'S1',
    firstName: 'Jane',
    middleName: null,
    lastName: 'Doe',
    businessUnit: 'Finance',
    confirmed: true,
    employmentType: 'Full-Time',
    createdAt: new Date('2026-01-01'),
    role: null,
    department: null,
    employmentDate: null,
    ...overrides,
  }
}

beforeEach(() => {
  findManyRoster.mockReset()
  findManyTraining.mockReset()
  findManySchedule.mockReset()
  findManySchedule.mockResolvedValue([])
})

describe('computeYetToAttend', () => {
  it('splits confirmed staff into attended vs yet-to-attend based on TrainingRecord', async () => {
    findManyRoster.mockResolvedValue([
      rosterRow({ staffId: 'S1', firstName: 'Jane', lastName: 'Doe', businessUnit: 'Finance' }),
      rosterRow({ staffId: 'S2', firstName: 'John', lastName: 'Smith', businessUnit: 'Finance' }),
    ])
    findManyTraining.mockResolvedValue([{ staffId: 'S1', year: 2026, month: 'March' }])

    const report = await computeYetToAttend({ mode: 'all' })

    expect(report.totalConfirmedStaff).toBe(2)
    expect(report.totalAttended).toBe(1)
    expect(report.totalYetToAttend).toBe(1)
    expect(report.list.map((s) => s.staffId)).toEqual(['S2'])
    expect(report.overallCoverageRatio).toBe(50)
  })

  it('excludes unconfirmed roster rows from the coverage numbers but still counts them separately', async () => {
    findManyRoster.mockResolvedValue([
      rosterRow({ staffId: 'S1', confirmed: true }),
      rosterRow({ staffId: 'S2', confirmed: false }),
    ])
    findManyTraining.mockResolvedValue([])

    const report = await computeYetToAttend({ mode: 'all' })

    expect(report.totalConfirmedStaff).toBe(1)
    expect(report.unconfirmedStaffCount).toBe(1)
  })

  it('dedupes multiple roster uploads for the same staffId, keeping the most recent', async () => {
    findManyRoster.mockResolvedValue([
      rosterRow({ staffId: 'S1', businessUnit: 'Finance', createdAt: new Date('2026-01-01') }),
      rosterRow({ staffId: 'S1', businessUnit: 'Operations', createdAt: new Date('2026-06-01') }),
    ])
    findManyTraining.mockResolvedValue([])

    const report = await computeYetToAttend({ mode: 'all' })

    expect(report.totalConfirmedStaff).toBe(1)
    expect(report.byBU).toEqual([
      expect.objectContaining({ businessUnit: 'Operations', totalConfirmed: 1 }),
    ])
  })

  it('unions TrainingSchedule attendees into "attended" alongside TrainingRecord', async () => {
    findManyRoster.mockResolvedValue([rosterRow({ staffId: 'S1' })])
    findManyTraining.mockResolvedValue([])
    findManySchedule.mockResolvedValue([
      { startDate: new Date('2026-02-01'), attendees: [{ staffId: 'S1' }] },
    ])

    const report = await computeYetToAttend({ mode: 'all' })

    expect(report.totalAttended).toBe(1)
    expect(report.totalYetToAttend).toBe(0)
  })

  it('applies a BU scope filter to both the roster and the byBU breakdown', async () => {
    findManyRoster.mockResolvedValue([
      rosterRow({ staffId: 'S1', businessUnit: 'Finance' }),
      rosterRow({ staffId: 'S2', businessUnit: 'Operations' }),
    ])
    findManyTraining.mockResolvedValue([])

    const report = await computeYetToAttend({ mode: 'all' }, ['Finance'])

    expect(report.totalConfirmedStaff).toBe(1)
    expect(report.byBU.map((b) => b.businessUnit)).toEqual(['Finance'])
  })

  it('filters TrainingRecord attendance to the requested year', async () => {
    findManyRoster.mockResolvedValue([rosterRow({ staffId: 'S1' })])
    findManyTraining.mockResolvedValue([{ staffId: 'S1', year: 2025, month: 'March' }])

    const report = await computeYetToAttend({ mode: 'year', year: 2026 })

    // The only training record is from 2025, so within the 2026 filter this staff member
    // should still show as not-yet-attended.
    expect(report.totalAttended).toBe(0)
    expect(report.totalYetToAttend).toBe(1)
  })

  it('returns zeroed-out numbers with no divide-by-zero when the roster is empty', async () => {
    findManyRoster.mockResolvedValue([])
    findManyTraining.mockResolvedValue([])

    const report = await computeYetToAttend({ mode: 'all' })

    expect(report.totalConfirmedStaff).toBe(0)
    expect(report.overallCoverageRatio).toBe(0)
    expect(report.hasRosterData).toBe(false)
  })
})
