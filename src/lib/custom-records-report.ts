import { prisma } from '@/lib/prisma'
import { MONTHS, type PeriodFilter } from '@/lib/filter-types'

// Ad-hoc record lookup for Report Generation — "pull every training/subscription record for this
// person / department / business unit" doesn't fit any of the fixed BU-or-group reports elsewhere
// on this page, so it's its own small query rather than a variant of computeGroupAnalytics.

export interface CustomRecordFilters {
  recordType: 'training' | 'subscription'
  staffName?: string
  businessUnit?: string
  department?: string
}

export interface CustomTrainingRow {
  id: string
  staffId: string
  staffName: string
  businessUnit: string
  department: string | null
  training: string
  month: string
  year: number
  cost: number
  vendor: string | null
}

export interface CustomSubscriptionRow {
  id: string
  staffId: string
  staffName: string
  businessUnit: string
  department: string | null
  membershipOrg: string
  category: string
  month: string | null
  amount: number
}

export interface CustomRecordsReport {
  recordType: 'training' | 'subscription'
  rows: (CustomTrainingRow | CustomSubscriptionRow)[]
  totalCost: number
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

export async function computeCustomRecordsReport(
  filters: CustomRecordFilters,
  period: PeriodFilter,
  buScope?: string[] | null
): Promise<CustomRecordsReport> {
  // Neither TrainingRecord nor SubscriptionRecord carries Department — joined here from the
  // roster (latest record per staffId, same convention as resolveAudience/custom-survey.ts)
  // rather than adding a schema column just for this one filter.
  const rosterRecords = await prisma.staffRosterRecord.findMany({ orderBy: { createdAt: 'asc' } })
  const latestByStaffId = new Map<string, (typeof rosterRecords)[number]>()
  for (const r of rosterRecords) latestByStaffId.set(r.staffId, r)
  const departmentOf = (staffId: string) => latestByStaffId.get(staffId)?.department || null

  const staffNameQuery = (filters.staffName || '').trim().toLowerCase()
  const departmentQuery = (filters.department || '').trim().toLowerCase()
  const months = allowedMonths(period)

  if (filters.recordType === 'training') {
    const all = await prisma.trainingRecord.findMany({ orderBy: [{ year: 'desc' }, { staffName: 'asc' }] })
    const rows: CustomTrainingRow[] = []
    let totalCost = 0
    for (const r of all) {
      if (period.mode !== 'all' && period.year && r.year !== period.year) continue
      if (months && !months.has(r.month)) continue
      if (buScope && !buScope.includes(r.businessUnit)) continue
      if (filters.businessUnit && r.businessUnit !== filters.businessUnit) continue
      if (staffNameQuery && !r.staffName.toLowerCase().includes(staffNameQuery)) continue
      const department = departmentOf(r.staffId)
      if (departmentQuery && (department || '').toLowerCase() !== departmentQuery) continue

      rows.push({
        id: r.id, staffId: r.staffId, staffName: r.staffName, businessUnit: r.businessUnit, department,
        training: r.training, month: r.month, year: r.year, cost: r.cost, vendor: r.vendor,
      })
      totalCost += r.cost
    }
    return { recordType: 'training', rows, totalCost }
  }

  const all = await prisma.subscriptionRecord.findMany({ orderBy: [{ staffName: 'asc' }] })
  const rows: CustomSubscriptionRow[] = []
  let totalCost = 0
  for (const r of all) {
    // SubscriptionRecord has no year field (see analytics.ts) — month-only filtering, same
    // convention as the rest of the app's subscription reporting.
    if (months && r.month && !months.has(r.month)) continue
    if (buScope && !buScope.includes(r.businessUnit)) continue
    if (filters.businessUnit && r.businessUnit !== filters.businessUnit) continue
    if (staffNameQuery && !r.staffName.toLowerCase().includes(staffNameQuery)) continue
    const department = departmentOf(r.staffId)
    if (departmentQuery && (department || '').toLowerCase() !== departmentQuery) continue

    rows.push({
      id: r.id, staffId: r.staffId, staffName: r.staffName, businessUnit: r.businessUnit, department,
      membershipOrg: r.membershipOrg, category: r.category, month: r.month, amount: r.amount,
    })
    totalCost += r.amount
  }
  return { recordType: 'subscription', rows, totalCost }
}
