import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/session-guard'
import { cleanDuplicateStaffRecords } from '@/lib/staff-quality'
import { invalidateComprehensiveStaffListCache } from '@/lib/staff-directory'

// Deletes older shadowed rows for any Staff ID with more than one roster record, keeping only
// the most recent upload's row for each. Does not touch rows with no duplicates.
export async function POST() {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  const removed = await cleanDuplicateStaffRecords()
  invalidateComprehensiveStaffListCache()
  return NextResponse.json({ removed })
}
