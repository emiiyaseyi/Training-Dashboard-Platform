import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

// Bulk-uploaded TrainingRecord rows don't carry a vendor column at all — this fills it in after
// the fact for a specific row, e.g. from the Talent Members report's TM-attended table where a
// vendor is known but wasn't part of the original upload.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission('talent-members', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const { id } = await params
    const { vendor } = await req.json() as { vendor?: string }
    const record = await prisma.trainingRecord.update({
      where: { id },
      data: { vendor: vendor?.trim() || null },
    })
    return NextResponse.json({ id: record.id, vendor: record.vendor })
  } catch (err) {
    console.error('[admin/training-record/[id]/vendor PATCH]', err)
    return NextResponse.json({ error: 'Failed to update vendor.' }, { status: 500 })
  }
}
