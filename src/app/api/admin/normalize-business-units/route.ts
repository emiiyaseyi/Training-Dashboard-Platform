import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { normalizeBUName } from '@/lib/bu-normalizer'

// One-off (re-runnable, idempotent) cleanup: normalizeBUName() is applied at upload/sync time,
// but aliases added AFTER a row was already imported (e.g. "NESI" -> "Meristem Wealth Management
// Limited") leave the old raw string sitting in already-stored rows until this runs. Walks every
// table that stores businessUnit as a free string and rewrites any value whose normalized form
// differs from what's stored.
async function normalizeTable<T extends { id: string; businessUnit: string }>(
  rows: T[],
  update: (id: string, businessUnit: string) => Promise<unknown>
): Promise<number> {
  let updated = 0
  for (const row of rows) {
    const normalized = normalizeBUName(row.businessUnit)
    if (normalized !== row.businessUnit) {
      await update(row.id, normalized)
      updated++
    }
  }
  return updated
}

export async function POST() {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  const results: { table: string; updated: number }[] = []

  results.push({
    table: 'Training',
    updated: await normalizeTable(
      await prisma.trainingRecord.findMany({ select: { id: true, businessUnit: true } }),
      (id, businessUnit) => prisma.trainingRecord.update({ where: { id }, data: { businessUnit } })
    ),
  })
  results.push({
    table: 'Feedback',
    updated: await normalizeTable(
      await prisma.feedbackRecord.findMany({ select: { id: true, businessUnit: true } }),
      (id, businessUnit) => prisma.feedbackRecord.update({ where: { id }, data: { businessUnit } })
    ),
  })
  results.push({
    table: 'Subscription',
    updated: await normalizeTable(
      await prisma.subscriptionRecord.findMany({ select: { id: true, businessUnit: true } }),
      (id, businessUnit) => prisma.subscriptionRecord.update({ where: { id }, data: { businessUnit } })
    ),
  })
  results.push({
    table: 'KSS',
    updated: await normalizeTable(
      await prisma.kSSRecord.findMany({ select: { id: true, businessUnit: true } }),
      (id, businessUnit) => prisma.kSSRecord.update({ where: { id }, data: { businessUnit } })
    ),
  })
  results.push({
    table: 'Manager Review',
    updated: await normalizeTable(
      await prisma.managerReviewRecord.findMany({ select: { id: true, businessUnit: true } }),
      (id, businessUnit) => prisma.managerReviewRecord.update({ where: { id }, data: { businessUnit } })
    ),
  })
  results.push({
    table: 'Staff Roster',
    updated: await normalizeTable(
      await prisma.staffRosterRecord.findMany({ select: { id: true, businessUnit: true } }),
      (id, businessUnit) => prisma.staffRosterRecord.update({ where: { id }, data: { businessUnit } })
    ),
  })
  results.push({
    table: 'Training Schedule',
    updated: await normalizeTable(
      await prisma.trainingSchedule.findMany({ select: { id: true, businessUnit: true } }),
      (id, businessUnit) => prisma.trainingSchedule.update({ where: { id }, data: { businessUnit } })
    ),
  })

  return NextResponse.json({ results, totalUpdated: results.reduce((sum, r) => sum + r.updated, 0) })
}
