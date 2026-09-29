import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { loadRosterDirectory, resolveStaff } from '@/lib/staff-directory'

// One-time correction for EXISTING ManagerReviewRecord rows created before the businessUnit
// resolution fix (see survey-structured-sync.ts) — those were stamped with the training
// schedule's one shared Business Unit at submission time instead of the reviewer's own current
// roster one, which is what every BU-filtered report (e.g. "Post-Training Impact") groups by.
// Safe to re-run any time: it only touches rows whose resolved BU actually differs from what's
// stored, and staffId (present on every ManagerReviewRecord regardless of source) is a reliable
// key here — unlike FeedbackRecord, which has no staff identifier at all and so can't be
// backfilled this way; those are only corrected going forward, via a new submission or an edited
// response's sourceResponseId link.
export async function POST() {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  const [records, directory] = await Promise.all([
    prisma.managerReviewRecord.findMany({ select: { id: true, staffId: true, businessUnit: true } }),
    loadRosterDirectory(),
  ])

  let updated = 0
  let unresolved = 0
  const batchSize = 100
  const toUpdate: { id: string; businessUnit: string }[] = []

  for (const r of records) {
    const staff = resolveStaff(r.staffId, directory)
    if (!staff) {
      unresolved++
      continue
    }
    if (staff.businessUnit && staff.businessUnit !== r.businessUnit) {
      toUpdate.push({ id: r.id, businessUnit: staff.businessUnit })
    }
  }

  for (let i = 0; i < toUpdate.length; i += batchSize) {
    const batch = toUpdate.slice(i, i + batchSize)
    await prisma.$transaction(batch.map((u) => prisma.managerReviewRecord.update({ where: { id: u.id }, data: { businessUnit: u.businessUnit } })))
    updated += batch.length
  }

  return NextResponse.json({ totalRecords: records.length, updated, unresolved })
}
