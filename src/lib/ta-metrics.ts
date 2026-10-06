// Talent Acquisition — ported from github.com/emiiyaseyi/Talent-Recruitment-Dashboard
// (lib/metrics.ts), unchanged: every derived number the dashboard shows comes from here, and
// none of it depends on the framework, so it ports as-is.

import type { HireRecord, Filters, OfferStatus, PipelineRecord, InternalMobilityRecord, ConversionRecord, NotConvertedRecord, VacancyRecord } from './ta-types'

const DAY_MS = 1000 * 60 * 60 * 24

export function computedTotalCost(r: HireRecord): number {
  return r.medicalCost + r.airtimeCost + r.feedingCost
}

export function hasCostMismatch(r: HireRecord, toleranceNaira = 1): boolean {
  if (r.manualTotalCost == null) return false
  return Math.abs(r.manualTotalCost - computedTotalCost(r)) > toleranceNaira
}

export function timeToFillDays(r: HireRecord): number | null {
  if (r.offerStatus !== 'Accepted' || !r.resumptionDate) return null
  return (r.resumptionDate.getTime() - r.requisitionStartDate.getTime()) / DAY_MS
}

export function timeToFillWeeks(r: HireRecord): number | null {
  const days = timeToFillDays(r)
  return days == null ? null : days / 7
}

/** "Days to Hire" (offer accepted) vs. "Days to Fill" (candidate resumes) — preferred source is
 * the gap to Offer Extended Date; falls back to the manual `Time to Hire (week)` column for rows
 * that predate that field. */
export function timeToHireDays(r: HireRecord): number | null {
  if (r.offerStatus !== 'Accepted') return null
  if (r.offerExtendedDate) {
    return (r.offerExtendedDate.getTime() - r.requisitionStartDate.getTime()) / DAY_MS
  }
  if (r.manualTimeToHireWeeks != null) {
    return r.manualTimeToHireWeeks * 7
  }
  return null
}

export function hires(records: HireRecord[]): HireRecord[] {
  return records.filter((r) => r.offerStatus === 'Accepted')
}

export function applyFilters(records: HireRecord[], filters: Partial<Filters>): HireRecord[] {
  return records.filter((r) => {
    if (filters.from && r.requisitionStartDate < filters.from) return false
    if (filters.to && r.requisitionStartDate > filters.to) return false
    if (filters.bu && r.bu !== filters.bu) return false
    if (filters.role && r.role !== filters.role) return false
    if (filters.officeType && r.officeType !== filters.officeType) return false
    return true
  })
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((a, b) => a + b, 0) / values.length
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0)
}

// ---------- Executive Summary ----------

export function totalOffersExtended(records: HireRecord[]): number {
  return records.length
}

export function totalOffersAccepted(records: HireRecord[]): number {
  return hires(records).length
}

/** Accepted / (Accepted + Declined + Withdrawn) — Pending offers are excluded since their
 * outcome isn't known yet. */
export function offerAcceptanceRate(records: HireRecord[]): number | null {
  const resolved = records.filter((r) => r.offerStatus !== 'Pending')
  if (resolved.length === 0) return null
  const accepted = resolved.filter((r) => r.offerStatus === 'Accepted').length
  return accepted / resolved.length
}

export function withdrawalRate(records: HireRecord[]): number | null {
  const resolved = records.filter((r) => r.offerStatus !== 'Pending')
  if (resolved.length === 0) return null
  const withdrawn = resolved.filter((r) => r.offerStatus === 'Withdrawn').length
  return withdrawn / resolved.length
}

export function averageTimeToFillDays(records: HireRecord[]): number | null {
  const days = hires(records).map(timeToFillDays).filter((d): d is number => d != null)
  return avg(days)
}

export function averageTimeToFillWeeks(records: HireRecord[]): number | null {
  const days = averageTimeToFillDays(records)
  return days == null ? null : days / 7
}

export function averageTimeToHireDays(records: HireRecord[]): number | null {
  const days = hires(records).map(timeToHireDays).filter((d): d is number => d != null)
  return avg(days)
}

export function averageCostOfHire(records: HireRecord[]): number | null {
  return avg(hires(records).map(computedTotalCost))
}

/** Splits records by Office Type (Front Office / Back Office, or whatever Config!OfficeTypes
 * defines) so the executive summary can show the same KPI block per segment. */
export function byOfficeType(records: HireRecord[], officeTypes: string[]): { officeType: string; records: HireRecord[] }[] {
  return officeTypes.map((officeType) => ({
    officeType,
    records: records.filter((r) => r.officeType === officeType),
  }))
}

// ---------- Financial Insights ----------

export interface CostBreakdown {
  category: 'Medical' | 'Airtime' | 'Feeding'
  amount: number
  pct: number
}

export function costBreakdownByCategory(records: HireRecord[]): CostBreakdown[] {
  const h = hires(records)
  const medical = sum(h.map((r) => r.medicalCost))
  const airtime = sum(h.map((r) => r.airtimeCost))
  const feeding = sum(h.map((r) => r.feedingCost))
  const total = medical + airtime + feeding
  const pct = (v: number) => (total === 0 ? 0 : v / total)
  return [
    { category: 'Medical', amount: medical, pct: pct(medical) },
    { category: 'Airtime', amount: airtime, pct: pct(airtime) },
    { category: 'Feeding', amount: feeding, pct: pct(feeding) },
  ]
}

export interface GroupedSum {
  key: string
  total: number
  count: number
}

function groupSumBy(records: HireRecord[], keyFn: (r: HireRecord) => string): GroupedSum[] {
  const map = new Map<string, { total: number; count: number }>()
  for (const r of records) {
    const key = keyFn(r)
    const entry = map.get(key) ?? { total: 0, count: 0 }
    entry.total += computedTotalCost(r)
    entry.count += 1
    map.set(key, entry)
  }
  return [...map.entries()].map(([key, v]) => ({ key, total: v.total, count: v.count })).sort((a, b) => b.total - a.total)
}

export function totalInvestmentByBU(records: HireRecord[]): GroupedSum[] {
  return groupSumBy(hires(records), (r) => r.bu)
}

export interface GroupedAvg {
  key: string
  avg: number
  count: number
}

function groupAvgBy(records: HireRecord[], keyFn: (r: HireRecord) => string): GroupedAvg[] {
  const map = new Map<string, number[]>()
  for (const r of records) {
    const key = keyFn(r)
    const arr = map.get(key) ?? []
    arr.push(computedTotalCost(r))
    map.set(key, arr)
  }
  return [...map.entries()].map(([key, values]) => ({ key, avg: avg(values) ?? 0, count: values.length })).sort((a, b) => b.avg - a.avg)
}

export function costPerHireByRole(records: HireRecord[]): GroupedAvg[] {
  return groupAvgBy(hires(records), (r) => r.role)
}

export interface MonthPoint {
  month: string
  value: number
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function costPerHireTrend(records: HireRecord[]): MonthPoint[] {
  const h = hires(records).filter((r) => r.resumptionDate)
  const map = new Map<string, number[]>()
  for (const r of h) {
    const key = monthKey(r.resumptionDate as Date)
    const arr = map.get(key) ?? []
    arr.push(computedTotalCost(r))
    map.set(key, arr)
  }
  return [...map.entries()].map(([month, values]) => ({ month, value: avg(values) ?? 0 })).sort((a, b) => a.month.localeCompare(b.month))
}

// ---------- Efficiency & Velocity ----------

export interface AgingRequisition {
  id: string
  candidateName: string
  role: string
  bu: string
  daysElapsed: number
}

export function agingRequisitions(records: HireRecord[], asOf: Date = new Date()): AgingRequisition[] {
  return records
    .filter((r) => r.offerStatus === 'Pending')
    .map((r) => ({ id: r.id, candidateName: r.candidateName, role: r.role, bu: r.bu, daysElapsed: (asOf.getTime() - r.requisitionStartDate.getTime()) / DAY_MS }))
    .sort((a, b) => b.daysElapsed - a.daysElapsed)
}

export interface DistributionBucket {
  label: '0-2 weeks' | '2-4 weeks' | '4+ weeks'
  count: number
}

export function timeToHireDistribution(records: HireRecord[]): DistributionBucket[] {
  const weeks = hires(records).map(timeToFillWeeks).filter((w): w is number => w != null)
  const buckets: DistributionBucket[] = [
    { label: '0-2 weeks', count: 0 },
    { label: '2-4 weeks', count: 0 },
    { label: '4+ weeks', count: 0 },
  ]
  for (const w of weeks) {
    if (w < 2) buckets[0].count += 1
    else if (w < 4) buckets[1].count += 1
    else buckets[2].count += 1
  }
  return buckets
}

export interface VelocityRanking {
  key: string
  avgDays: number
  count: number
}

function velocityRankingBy(records: HireRecord[], keyFn: (r: HireRecord) => string): VelocityRanking[] {
  const map = new Map<string, number[]>()
  for (const r of hires(records)) {
    const days = timeToFillDays(r)
    if (days == null) continue
    const key = keyFn(r)
    const arr = map.get(key) ?? []
    arr.push(days)
    map.set(key, arr)
  }
  return [...map.entries()].map(([key, values]) => ({ key, avgDays: avg(values) ?? 0, count: values.length })).sort((a, b) => a.avgDays - b.avgDays)
}

export function buVelocityRanking(records: HireRecord[]): VelocityRanking[] {
  return velocityRankingBy(records, (r) => r.bu)
}

export function roleVelocityRanking(records: HireRecord[]): VelocityRanking[] {
  return velocityRankingBy(records, (r) => r.role)
}

// ---------- BU & Role Demographics ----------

export interface GroupedCount {
  key: string
  count: number
}

function groupCountBy(records: HireRecord[], keyFn: (r: HireRecord) => string): GroupedCount[] {
  const map = new Map<string, number>()
  for (const r of records) {
    const key = keyFn(r)
    map.set(key, (map.get(key) ?? 0) + 1)
  }
  return [...map.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count)
}

export function headcountByBU(records: HireRecord[]): GroupedCount[] {
  return groupCountBy(hires(records), (r) => r.bu)
}

export function roleConcentration(records: HireRecord[]): GroupedCount[] {
  return groupCountBy(hires(records), (r) => r.role)
}

export function hiringSourceBreakdown(records: HireRecord[]): GroupedCount[] {
  return groupCountBy(hires(records).filter((r) => r.hiringSource), (r) => r.hiringSource)
}

export interface SeasonalityPoint {
  period: string
  count: number
}

export function hiringSeasonality(records: HireRecord[], granularity: 'month' | 'quarter' = 'month'): SeasonalityPoint[] {
  const h = hires(records).filter((r) => r.resumptionDate)
  const map = new Map<string, number>()
  for (const r of h) {
    const d = r.resumptionDate as Date
    const key = granularity === 'month' ? monthKey(d) : `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`
    map.set(key, (map.get(key) ?? 0) + 1)
  }
  return [...map.entries()].map(([period, count]) => ({ period, count })).sort((a, b) => a.period.localeCompare(b.period))
}

export interface MonthlyBreakdownRow {
  month: string
  offersExtended: number
  accepted: number
  declined: number
  avgTimeToFillDays: number | null
  totalCost: number
}

export function monthlyBreakdown(records: HireRecord[]): MonthlyBreakdownRow[] {
  const map = new Map<string, HireRecord[]>()
  for (const r of records) {
    const key = monthKey(r.requisitionStartDate)
    const arr = map.get(key) ?? []
    arr.push(r)
    map.set(key, arr)
  }
  return [...map.entries()]
    .map(([month, rows]) => {
      const acceptedRows = rows.filter((r) => r.offerStatus === 'Accepted')
      return {
        month,
        offersExtended: rows.length,
        accepted: acceptedRows.length,
        declined: rows.filter((r) => r.offerStatus === 'Declined').length,
        avgTimeToFillDays: avg(acceptedRows.map(timeToFillDays).filter((d): d is number => d != null)),
        totalCost: sum(acceptedRows.map(computedTotalCost)),
      }
    })
    .sort((a, b) => a.month.localeCompare(b.month))
}

export function isOfferStatus(value: string): value is OfferStatus {
  return ['Accepted', 'Declined', 'Pending', 'Withdrawn'].includes(value)
}

// ---------- Pipeline (open roles) ----------

export function applyPipelineFilters(pipeline: PipelineRecord[], filters: Partial<Filters>): PipelineRecord[] {
  return pipeline.filter((r) => {
    if (filters.from && r.requisitionStartDate < filters.from) return false
    if (filters.to && r.requisitionStartDate > filters.to) return false
    if (filters.bu && r.bu !== filters.bu) return false
    if (filters.role && r.role !== filters.role) return false
    if (filters.officeType && r.officeType !== filters.officeType) return false
    return true
  })
}

export interface PipelineRow {
  role: string
  total: number
  stageCounts: Record<string, number>
}

export function pipelineByRole(pipeline: PipelineRecord[], stages: string[]): PipelineRow[] {
  const map = new Map<string, PipelineRow>()
  for (const r of pipeline) {
    const row = map.get(r.role) ?? { role: r.role, total: 0, stageCounts: Object.fromEntries(stages.map((s) => [s, 0])) }
    row.total += 1
    row.stageCounts[r.currentStage] = (row.stageCounts[r.currentStage] ?? 0) + 1
    map.set(r.role, row)
  }
  return [...map.values()].sort((a, b) => b.total - a.total)
}

export function pipelineAgingRequisitions(pipeline: PipelineRecord[], asOf: Date = new Date()): AgingRequisition[] {
  return pipeline
    .map((r) => ({ id: r.id, candidateName: r.candidateName, role: r.role, bu: r.bu, daysElapsed: (asOf.getTime() - r.requisitionStartDate.getTime()) / DAY_MS }))
    .sort((a, b) => b.daysElapsed - a.daysElapsed)
}

// ---------- Internal Mobility ----------
// Rate/headcount-based metrics (#1, #9) need the live staff roster (Postgres), not anything in
// this sheet — kept out of this file on purpose (framework-agnostic, sheet-data-only, see the
// file header) and passed in as plain numbers/sets by the API route that already has that data.

/** Internal Mobility Rate = moves in the period / total active headcount. activeHeadcount comes
 * from StaffRosterRecord, resolved by the caller. */
export function internalMobilityRate(mobility: InternalMobilityRecord[], activeHeadcount: number): number | null {
  if (activeHeadcount === 0) return null
  return mobility.length / activeHeadcount
}

export function mobilityByFunction(mobility: InternalMobilityRecord[]): GroupedCount[] {
  // "Function" = Current Role — the sheet has no separate Department/Function column, Role is the
  // closest available proxy.
  return countByKey(mobility, (r) => r.currentRole)
}

// No grade hierarchy is configured anywhere (Config has no Grades list), so "promotion" vs
// "lateral" can't be determined from direction of movement — only from whether the grade changed
// at all. Promotion = grade changed; Lateral = grade stayed the same. This is a stated assumption,
// not a verified one: a genuine demotion would be miscounted as a promotion under this rule, since
// there's no way to tell "Officer -> Manager" from "Manager -> Officer" is higher without an
// explicit order. Revisit if/when grades get a defined hierarchy.
export function promotionRate(mobility: InternalMobilityRecord[]): number | null {
  if (mobility.length === 0) return null
  const promoted = mobility.filter((r) => r.previousGrade && r.newGrade && r.previousGrade !== r.newGrade).length
  return promoted / mobility.length
}

export function lateralMobilityRate(mobility: InternalMobilityRecord[]): number | null {
  if (mobility.length === 0) return null
  const lateral = mobility.filter((r) => r.previousGrade && r.newGrade && r.previousGrade === r.newGrade).length
  return lateral / mobility.length
}

/** Share of people who moved (in the given mobility list) who are still active today.
 * activeStaffIds comes from StaffRosterRecord, resolved by the caller. */
export function retentionAfterMobility(mobility: InternalMobilityRecord[], activeStaffIds: Set<string>): number | null {
  if (mobility.length === 0) return null
  const retained = mobility.filter((r) => activeStaffIds.has(r.staffId.toUpperCase())).length
  return retained / mobility.length
}

/** Share of ALL filled vacancies (Filled Internally + Filled Externally) that were filled
 * internally — a current snapshot ratio only, since there's no Date Filled column to make this
 * trendable over time (see ta-types.ts's VacancyRecord comment). Time to Fill is NOT computable
 * at all without that column — deliberately not built as a function here rather than guessed. */
export function internalFillRate(vacancies: VacancyRecord[]): number | null {
  const filled = vacancies.filter((v) => v.status === 'Filled Internally' || v.status === 'Filled Externally')
  if (filled.length === 0) return null
  const internal = filled.filter((v) => v.status === 'Filled Internally').length
  return internal / filled.length
}

// ---------- Conversions ----------
// Reuses the GroupedCount shape already defined above (BU & Role Demographics section) — same
// { key, count } result, just needed for record types other than HireRecord, hence the separate
// generic helper name (groupCountBy above is narrowly typed to HireRecord only).

function countByKey<T>(records: T[], keyFn: (r: T) => string): GroupedCount[] {
  const map = new Map<string, number>()
  for (const r of records) {
    const key = keyFn(r) || 'Unspecified'
    map.set(key, (map.get(key) ?? 0) + 1)
  }
  return [...map.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count)
}

export function conversionsByBU(conversions: ConversionRecord[]): GroupedCount[] {
  return countByKey(conversions, (r) => r.bu)
}

export function conversionsByManager(conversions: ConversionRecord[]): GroupedCount[] {
  return countByKey(conversions, (r) => r.manager)
}

/** Converted interns / total interns (StaffRosterRecord.employmentType = "Intern"). Only as
 * reliable as that field being kept current on the Employees page — not something this function
 * can verify. internHeadcount is resolved by the caller. */
export function internToFullTimeConversionRate(conversions: ConversionRecord[], internHeadcount: number): number | null {
  if (internHeadcount === 0) return null
  return conversions.length / internHeadcount
}

/** Share of converted interns who are still active today. activeStaffIds comes from
 * StaffRosterRecord, resolved by the caller. */
export function internRetentionRate(conversions: ConversionRecord[], activeStaffIds: Set<string>): number | null {
  if (conversions.length === 0) return null
  const retained = conversions.filter((r) => activeStaffIds.has(r.staffId.toUpperCase())).length
  return retained / conversions.length
}

export function averageTimeToConversionDays(conversions: ConversionRecord[]): number | null {
  const days = conversions
    .filter((r) => r.internStartDate)
    .map((r) => (r.conversionEffectiveDate.getTime() - (r.internStartDate as Date).getTime()) / DAY_MS)
  return avg(days)
}

/** Converted / (Converted + declined-offer Not Converted). The Conversion sheet only ever lists
 * people who DID convert, so "offers made" has to come from pairing it with Not Converted rows
 * whose Reason text indicates a declined offer specifically — rows with other reasons (performance,
 * role no longer available, resigned before a decision) aren't offer declines and are excluded.
 * This is a text-matching heuristic against free-text Reason values, not a guaranteed-accurate
 * count — worth a second look if Reason values don't consistently say "declined". */
export function conversionOfferAcceptanceRate(conversions: ConversionRecord[], notConverted: NotConvertedRecord[]): number | null {
  const declinedOffers = notConverted.filter((r) => /declin/i.test(r.reason)).length
  const totalOffers = conversions.length + declinedOffers
  if (totalOffers === 0) return null
  return conversions.length / totalOffers
}

export function averageCostPerConversion(conversions: ConversionRecord[]): number | null {
  const costs = conversions.map((r) => r.costPerConversion).filter((c): c is number => c != null)
  return avg(costs)
}

export function conversionDropOffReasons(notConverted: NotConvertedRecord[]): GroupedCount[] {
  return countByKey(notConverted, (r) => r.reason)
}
