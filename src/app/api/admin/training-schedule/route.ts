import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { normalizeBUName } from '@/lib/bu-normalizer'

export async function GET() {
  const gate = await requirePermission('admin-settings', 'view')
  if (gate instanceof NextResponse) return gate

  const schedules = await prisma.trainingSchedule.findMany({
    orderBy: { startDate: 'desc' },
    include: { attendees: true },
  })

  return NextResponse.json(
    schedules.map((s) => ({
      id: s.id,
      trainingName: s.trainingName,
      businessUnit: s.businessUnit,
      startDate: s.startDate,
      endDate: s.endDate,
      hours: s.hours,
      attendeeCount: s.attendees.length,
      preSent: s.attendees.filter((a) => a.preSurveySentAt).length,
      post1Sent: s.attendees.filter((a) => a.post1SurveySentAt).length,
      post2Sent: s.attendees.filter((a) => a.post2SurveySentAt).length,
      attendees: s.attendees.map((a) => ({
        id: a.id,
        staffId: a.staffId,
        staffName: a.staffName,
        email: a.email,
        lineManagerName: a.lineManagerName,
        lineManagerEmail: a.lineManagerEmail,
        preSurveySentAt: a.preSurveySentAt,
        post1SurveySentAt: a.post1SurveySentAt,
        post2SurveySentAt: a.post2SurveySentAt,
      })),
    }))
  )
}

export async function POST(req: NextRequest) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const body = await req.json()
    const { trainingName, businessUnit, startDate, endDate, hours } = body as {
      trainingName: string; businessUnit: string; startDate: string; endDate: string; hours?: number
    }
    if (!trainingName?.trim()) return NextResponse.json({ error: 'Training name is required.' }, { status: 400 })
    if (!businessUnit?.trim()) return NextResponse.json({ error: 'Business Unit is required.' }, { status: 400 })
    if (!startDate || !endDate) return NextResponse.json({ error: 'Start and end dates are required.' }, { status: 400 })

    const schedule = await prisma.trainingSchedule.create({
      data: {
        trainingName: trainingName.trim(),
        businessUnit: normalizeBUName(businessUnit),
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        hours: hours ? Number(hours) : null,
      },
    })
    return NextResponse.json(schedule)
  } catch (err) {
    console.error('[admin/training-schedule POST]', err)
    return NextResponse.json({ error: 'Failed to create training schedule.' }, { status: 500 })
  }
}
