import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

// Sets any of Vendor/Cost/Hours/Training Type/Capability on every given TrainingRecord in one
// call — the "assign these details to this whole training cohort" action on the missing-details
// panel, instead of editing each attendee's record by hand. Only fields actually present in the
// body are written; omitting one leaves it untouched on every record.
export async function POST(req: NextRequest) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const body = (await req.json()) as {
      recordIds?: string[]
      vendor?: string
      cost?: number
      hours?: number
      trainingType?: string
      capability?: string
    }
    const { recordIds } = body
    if (!Array.isArray(recordIds) || recordIds.length === 0) {
      return NextResponse.json({ error: 'recordIds is required.' }, { status: 400 })
    }

    const data: { vendor?: string; cost?: number; hours?: number; trainingType?: string; capability?: string } = {}
    if (body.vendor?.trim()) data.vendor = body.vendor.trim()
    if (body.cost !== undefined && !isNaN(body.cost)) data.cost = body.cost
    if (body.hours !== undefined && !isNaN(body.hours)) data.hours = body.hours
    if (body.trainingType?.trim()) data.trainingType = body.trainingType.trim()
    if (body.capability?.trim()) data.capability = body.capability.trim()

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'At least one field (vendor, cost, hours, trainingType, capability) is required.' }, { status: 400 })
    }

    const { count } = await prisma.trainingRecord.updateMany({
      where: { id: { in: recordIds } },
      data,
    })

    return NextResponse.json({ updated: count })
  } catch (err) {
    console.error('[admin/records/training/missing-vendor/bulk-set POST]', err)
    return NextResponse.json({ error: 'Failed to set details.' }, { status: 500 })
  }
}
