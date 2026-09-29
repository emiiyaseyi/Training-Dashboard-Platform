import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { invalidateComprehensiveStaffListCache } from '@/lib/staff-directory'

// Bulk-rewrites every row across every businessUnit-holding table from one mismatched value to a
// chosen canonical one — the actual fix behind the review list in business-unit-mismatches/
// route.ts. Exact-string match only (same as that list), so this only ever touches rows an admin
// has explicitly reviewed and confirmed the mapping for.
export async function POST(req: NextRequest) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  const { from, to } = (await req.json()) as { from?: string; to?: string }
  if (!from?.trim() || !to?.trim()) {
    return NextResponse.json({ error: 'Both "from" and "to" are required.' }, { status: 400 })
  }

  const canonical = await prisma.businessUnit.findFirst({ where: { name: to } })
  if (!canonical) {
    return NextResponse.json({ error: `"${to}" isn't a recognized Business Unit.` }, { status: 400 })
  }

  const results: { table: string; updated: number }[] = []
  const updateOne = async (table: string, run: () => Promise<{ count: number }>) => {
    const { count } = await run()
    results.push({ table, updated: count })
  }

  await updateOne('Training', () => prisma.trainingRecord.updateMany({ where: { businessUnit: from }, data: { businessUnit: to } }))
  await updateOne('Feedback', () => prisma.feedbackRecord.updateMany({ where: { businessUnit: from }, data: { businessUnit: to } }))
  await updateOne('Subscription', () => prisma.subscriptionRecord.updateMany({ where: { businessUnit: from }, data: { businessUnit: to } }))
  await updateOne('KSS', () => prisma.kSSRecord.updateMany({ where: { businessUnit: from }, data: { businessUnit: to } }))
  await updateOne('Manager Review', () => prisma.managerReviewRecord.updateMany({ where: { businessUnit: from }, data: { businessUnit: to } }))
  await updateOne('Staff Roster', () => prisma.staffRosterRecord.updateMany({ where: { businessUnit: from }, data: { businessUnit: to } }))
  await updateOne('Training Schedule', () => prisma.trainingSchedule.updateMany({ where: { businessUnit: from }, data: { businessUnit: to } }))

  // Staff Roster rows feed the cached comprehensive-staff-list/roster-directory that the schedule
  // creation form's attendee search reads from — without this, a just-fixed BU wouldn't show up
  // there until the cache's own TTL expired on its own.
  invalidateComprehensiveStaffListCache()

  return NextResponse.json({ results, totalUpdated: results.reduce((sum, r) => sum + r.updated, 0) })
}
