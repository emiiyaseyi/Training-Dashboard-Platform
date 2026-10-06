import { prisma } from './prisma'
import { MONTHS, type PeriodFilter } from './filter-types'
import { normalizeStaffIdKey } from './staff-id'
import { isEligibleForTrainingCoverage, effectiveYearForCoverage, latestRosterSnapshot } from './staff-training-eligibility'

// "Skills & Competency Gaps" — Phase 1 (low-coverage gaps, see src/lib/skills-gap.ts's own
// comment history / the conversation that scoped this): for each Differentiating Capability, how
// much of the ELIGIBLE staff pool (same population Coverage % uses everywhere else in this app —
// active, confirmed, non-intern, non-Meri-Mover, H2-hire-excluded) has actually been trained in
// it, broken down by Business Unit, Department, and Role so a low group-wide number isn't hiding
// which specific slice of the org is actually under-trained. Ranked worst-first within each
// breakdown. This is a coverage PROXY for "gap," not a true required-vs-actual gap — that needs an
// admin-defined "this role requires these capabilities" matrix, intentionally deferred (flagged as
// the next step) rather than guessed at here.

export type GapSeverity = 'critical' | 'moderate' | 'healthy'

export interface SkillsGapRow {
  groupValue: string
  capability: string
  totalStaff: number
  staffTrained: number
  coverageRatio: number
  severity: GapSeverity
}

export interface SkillsGapReport {
  hasRosterData: boolean
  availableYears: number[]
  thresholds: { criticalThreshold: number; moderateThreshold: number }
  byBusinessUnit: SkillsGapRow[]
  byDepartment: SkillsGapRow[]
  byRole: SkillsGapRow[]
  // Worst N rows across all three breakdowns combined, for a headline "here's what needs
  // attention" list — deliberately small and sorted, not meant to replace the full tables.
  topGaps: SkillsGapRow[]
}

function severityFor(ratio: number, criticalThreshold: number, moderateThreshold: number): GapSeverity {
  if (ratio <= criticalThreshold) return 'critical'
  if (ratio <= moderateThreshold) return 'moderate'
  return 'healthy'
}

function allowedMonths(filter: PeriodFilter): Set<string> | null {
  if (filter.mode === 'all' || filter.mode === 'year') return null
  const now = new Date()
  let indices: number[] = []
  if (filter.mode === 'ytd') {
    indices = Array.from({ length: now.getMonth() + 1 }, (_, i) => i)
  } else if (filter.mode === 'range' && filter.fromMonth && filter.toMonth) {
    const from = MONTHS.indexOf(filter.fromMonth as (typeof MONTHS)[number])
    const to = MONTHS.indexOf(filter.toMonth as (typeof MONTHS)[number])
    for (let i = Math.min(from, to); i <= Math.max(from, to); i++) indices.push(i)
  }
  return new Set(indices.map((i) => MONTHS[i]))
}

function buildBreakdown(
  dimension: 'businessUnit' | 'department' | 'role',
  eligibleRoster: { staffId: string; businessUnit: string; department: string | null; role: string | null }[],
  trainedKeysByCapability: Map<string, Set<string>>,
  capabilityNames: string[],
  criticalThreshold: number,
  moderateThreshold: number,
): SkillsGapRow[] {
  const groupOf = (s: { businessUnit: string; department: string | null; role: string | null }) => {
    const raw = dimension === 'businessUnit' ? s.businessUnit : dimension === 'department' ? s.department : s.role
    return raw?.trim() || 'Unspecified'
  }

  const staffByGroup = new Map<string, Set<string>>()
  for (const s of eligibleRoster) {
    const g = groupOf(s)
    const key = normalizeStaffIdKey(s.staffId)
    if (!staffByGroup.has(g)) staffByGroup.set(g, new Set())
    staffByGroup.get(g)!.add(key)
  }

  const rows: SkillsGapRow[] = []
  for (const [groupValue, staffKeys] of staffByGroup) {
    const totalStaff = staffKeys.size
    if (totalStaff === 0) continue
    for (const capability of capabilityNames) {
      const trainedKeys = trainedKeysByCapability.get(capability) ?? new Set()
      let staffTrained = 0
      for (const key of staffKeys) if (trainedKeys.has(key)) staffTrained++
      const coverageRatio = (staffTrained / totalStaff) * 100
      rows.push({
        groupValue,
        capability,
        totalStaff,
        staffTrained,
        coverageRatio,
        severity: severityFor(coverageRatio, criticalThreshold, moderateThreshold),
      })
    }
  }

  return rows.sort((a, b) => a.coverageRatio - b.coverageRatio || a.groupValue.localeCompare(b.groupValue))
}

export async function computeSkillsGapReport(filter: PeriodFilter = { mode: 'all' }, buScope?: string[] | null): Promise<SkillsGapReport> {
  const [rawRoster, rawTraining, capabilities, settings] = await Promise.all([
    prisma.staffRosterRecord.findMany(),
    prisma.trainingRecord.findMany({ select: { staffId: true, capability: true, year: true, month: true } }),
    prisma.differentiatingCapability.findMany({ orderBy: { order: 'asc' } }),
    prisma.skillsGapSettings.findFirst(),
  ])

  const criticalThreshold = settings?.criticalThreshold ?? 30
  const moderateThreshold = settings?.moderateThreshold ?? 60

  const availableYears = [...new Set(rawTraining.map((r) => r.year))].sort((a, b) => b - a)

  if (rawRoster.length === 0 || capabilities.length === 0) {
    return {
      hasRosterData: rawRoster.length > 0,
      availableYears,
      thresholds: { criticalThreshold, moderateThreshold },
      byBusinessUnit: [], byDepartment: [], byRole: [], topGaps: [],
    }
  }

  const coverageYear = effectiveYearForCoverage(filter)
  const latestRoster = latestRosterSnapshot(rawRoster)
  let eligibleRoster = latestRoster.filter((s) => isEligibleForTrainingCoverage(s, coverageYear))
  // Restricts a BU-scoped user to their own Business Unit(s) — same convention as every other
  // analytics endpoint (computeGroupAnalytics etc.); superadmins/unscoped callers pass null.
  if (buScope) eligibleRoster = eligibleRoster.filter((s) => buScope.includes(s.businessUnit))

  let trainingRecords = rawTraining
  if (filter.mode !== 'all' && filter.year) {
    trainingRecords = trainingRecords.filter((r) => r.year === filter.year)
  }
  const months = allowedMonths(filter)
  if (months) {
    trainingRecords = trainingRecords.filter((r) => months.has(r.month))
  }

  const trainedKeysByCapability = new Map<string, Set<string>>()
  for (const r of trainingRecords) {
    if (!r.capability) continue
    const key = normalizeStaffIdKey(r.staffId)
    if (!trainedKeysByCapability.has(r.capability)) trainedKeysByCapability.set(r.capability, new Set())
    trainedKeysByCapability.get(r.capability)!.add(key)
  }

  const capabilityNames = capabilities.map((c) => c.name)

  const byBusinessUnit = buildBreakdown('businessUnit', eligibleRoster, trainedKeysByCapability, capabilityNames, criticalThreshold, moderateThreshold)
  const byDepartment = buildBreakdown('department', eligibleRoster, trainedKeysByCapability, capabilityNames, criticalThreshold, moderateThreshold)
  const byRole = buildBreakdown('role', eligibleRoster, trainedKeysByCapability, capabilityNames, criticalThreshold, moderateThreshold)

  // Worst 15 across all three, deduplicated by (dimension label baked into groupValue isn't
  // unique across dimensions, so tag it) — small, sorted, for the headline section.
  const topGaps = [
    ...byBusinessUnit.map((r) => ({ ...r, groupValue: `${r.groupValue} (BU)` })),
    ...byDepartment.map((r) => ({ ...r, groupValue: `${r.groupValue} (Dept)` })),
    ...byRole.map((r) => ({ ...r, groupValue: `${r.groupValue} (Role)` })),
  ]
    .filter((r) => r.severity === 'critical')
    .sort((a, b) => a.coverageRatio - b.coverageRatio)
    .slice(0, 15)

  return {
    hasRosterData: true,
    availableYears,
    thresholds: { criticalThreshold, moderateThreshold },
    byBusinessUnit, byDepartment, byRole, topGaps,
  }
}
