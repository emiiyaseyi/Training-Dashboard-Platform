import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { normalizeBUName } from '@/lib/bu-normalizer'

// Lets an already-created schedule's details be corrected (wrong date, missing vendor, etc.)
// without deleting and re-creating it — which would also wipe its attendee list and survey
// send history. Attendees are managed separately (add/remove attendee endpoints).
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const { id } = await params
    const body = await req.json()
    const { trainingName, businessUnit, startDate, endDate, hours, costPerAttendee, trainingType, capability, vendor, remindersEnabled, post1Enabled, post2Enabled } = body as {
      trainingName: string; businessUnit: string; startDate: string; endDate: string; hours?: number
      costPerAttendee?: number; trainingType?: string; capability?: string; vendor?: string
      remindersEnabled?: boolean; post1Enabled?: boolean; post2Enabled?: boolean
    }
    if (!trainingName?.trim()) return NextResponse.json({ error: 'Training name is required.' }, { status: 400 })
    if (!businessUnit?.trim()) return NextResponse.json({ error: 'Business Unit is required.' }, { status: 400 })
    if (!startDate || !endDate) return NextResponse.json({ error: 'Start and end dates are required.' }, { status: 400 })

    const schedule = await prisma.trainingSchedule.update({
      where: { id },
      data: {
        trainingName: trainingName.trim(),
        businessUnit: normalizeBUName(businessUnit),
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        hours: hours ? Number(hours) : null,
        costPerAttendee: costPerAttendee ? Number(costPerAttendee) : null,
        trainingType: trainingType?.trim() || null,
        capability: capability?.trim() || null,
        vendor: vendor?.trim() || null,
        ...(remindersEnabled !== undefined ? { remindersEnabled } : {}),
        ...(post1Enabled !== undefined ? { post1Enabled } : {}),
        ...(post2Enabled !== undefined ? { post2Enabled } : {}),
      },
    })
    return NextResponse.json(schedule)
  } catch (err) {
    console.error('[admin/training-schedule PUT]', err)
    return NextResponse.json({ error: 'Failed to update training schedule.' }, { status: 500 })
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const { id } = await params
    await prisma.trainingSchedule.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[admin/training-schedule DELETE]', err)
    return NextResponse.json({ error: 'Failed to delete training schedule.' }, { status: 500 })
  }
}
