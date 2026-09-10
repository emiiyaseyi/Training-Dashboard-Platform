import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { normalizeBUName } from '@/lib/bu-normalizer'
import { MONTHS } from '@/lib/filter-types'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const { id } = await params
    const body = await req.json() as {
      staffId?: string; staffName?: string; businessUnit?: string; training?: string; month?: string; year?: number
      cost?: number; hours?: number | null; trainingType?: string | null; capability?: string | null; vendor?: string | null
    }

    const existing = await prisma.trainingRecord.findUnique({ where: { id }, select: { month: true, year: true } })

    const record = await prisma.trainingRecord.update({
      where: { id },
      data: {
        ...(body.staffId !== undefined && { staffId: body.staffId.trim() }),
        ...(body.staffName !== undefined && { staffName: body.staffName.trim() }),
        ...(body.businessUnit !== undefined && { businessUnit: normalizeBUName(body.businessUnit.trim()) }),
        ...(body.training !== undefined && { training: body.training.trim() }),
        ...(body.month !== undefined && { month: body.month }),
        ...(body.year !== undefined && { year: Number(body.year) }),
        ...(body.cost !== undefined && { cost: Number(body.cost) }),
        ...(body.hours !== undefined && { hours: body.hours === null ? null : Number(body.hours) }),
        ...(body.trainingType !== undefined && { trainingType: body.trainingType || null }),
        ...(body.capability !== undefined && { capability: body.capability || null }),
        ...(body.vendor !== undefined && { vendor: body.vendor || null }),
      },
    })

    // This record may be the auto-linked mirror of a TrainingSchedule attendee (see
    // training-schedule/[id]/attendees/route.ts) — if so, and its month/year actually changed,
    // move the schedule's own startDate/endDate too. The schedule (not this record) is what
    // Pre/Post survey send timing (survey-send.ts) actually reads, so leaving it behind would
    // silently desync "when this shows as scheduled" from "when reminders/surveys actually fire".
    const monthChanged = body.month !== undefined && existing && body.month !== existing.month
    const yearChanged = body.year !== undefined && existing && Number(body.year) !== existing.year
    if (monthChanged || yearChanged) {
      const attendee = await prisma.trainingScheduleAttendee.findFirst({
        where: { linkedTrainingRecordId: id },
        select: { schedule: { select: { id: true, startDate: true, endDate: true } } },
      })
      if (attendee) {
        const monthIdx = MONTHS.indexOf(record.month as (typeof MONTHS)[number])
        if (monthIdx !== -1) {
          // Same day-of-month offsets as before, just shifted to the new month/year — preserves a
          // multi-day training's length instead of collapsing it to a single day.
          const oldStart = attendee.schedule.startDate
          const oldEnd = attendee.schedule.endDate
          const dayLength = Math.round((oldEnd.getTime() - oldStart.getTime()) / 86400000)
          const newStart = new Date(record.year, monthIdx, oldStart.getDate())
          const newEnd = new Date(newStart.getTime() + dayLength * 86400000)
          await prisma.trainingSchedule.update({
            where: { id: attendee.schedule.id },
            data: { startDate: newStart, endDate: newEnd },
          })
        }
      }
    }

    return NextResponse.json(record)
  } catch (err) {
    console.error('[admin/records/training/[id] PUT]', err)
    return NextResponse.json({ error: 'Failed to update record.' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const { id } = await params
    await prisma.trainingRecord.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[admin/records/training/[id] DELETE]', err)
    return NextResponse.json({ error: 'Failed to delete record.' }, { status: 500 })
  }
}
