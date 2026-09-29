import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

// Sets the same vendor on every given TrainingRecord in one call — the "assign a vendor to this
// whole training cohort" action on the missing-vendor panel, instead of editing each attendee's
// record by hand.
export async function POST(req: NextRequest) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const { recordIds, vendor } = (await req.json()) as { recordIds?: string[]; vendor?: string }
    const name = vendor?.trim()
    if (!Array.isArray(recordIds) || recordIds.length === 0 || !name) {
      return NextResponse.json({ error: 'recordIds and a vendor name are required.' }, { status: 400 })
    }

    const { count } = await prisma.trainingRecord.updateMany({
      where: { id: { in: recordIds } },
      data: { vendor: name },
    })

    return NextResponse.json({ updated: count })
  } catch (err) {
    console.error('[admin/records/training/missing-vendor/bulk-set POST]', err)
    return NextResponse.json({ error: 'Failed to set vendor.' }, { status: 500 })
  }
}
