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
      costPerAttendee: s.costPerAttendee,
      trainingType: s.trainingType,
      capability: s.capability,
      vendor: s.vendor,
      remindersEnabled: s.remindersEnabled,
      preEnabled: s.preEnabled,
      post1Enabled: s.post1Enabled,
      post2Enabled: s.post2Enabled,
      additionalCc: s.additionalCc,
      additionalCcMode: s.additionalCcMode,
      sourcedFromHistoricalData: s.sourcedFromHistoricalData,
      trainingMode: s.trainingMode,
      location: s.location,
      meetingLink: s.meetingLink,
      attendeeCount: s.attendees.length,
      preSent: s.attendees.filter((a) => a.preSurveySentAt).length,
      post1Sent: s.attendees.filter((a) => a.post1SurveySentAt).length,
      post2Sent: s.attendees.filter((a) => a.post2SurveySentAt).length,
      preFilled: s.attendees.filter((a) => a.preSurveyRespondedAt).length,
      post1Filled: s.attendees.filter((a) => a.post1SurveyRespondedAt).length,
      post2Filled: s.attendees.filter((a) => a.post2SurveyRespondedAt).length,
      attendees: s.attendees.map((a) => ({
        id: a.id,
        staffId: a.staffId,
        staffName: a.staffName,
        email: a.email,
        lineManagerName: a.lineManagerName,
        lineManagerEmail: a.lineManagerEmail,
        additionalCc: a.additionalCc,
        preSurveySentAt: a.preSurveySentAt,
        post1SurveySentAt: a.post1SurveySentAt,
        post2SurveySentAt: a.post2SurveySentAt,
        preSurveyRespondedAt: a.preSurveyRespondedAt,
        post1SurveyRespondedAt: a.post1SurveyRespondedAt,
        post2SurveyRespondedAt: a.post2SurveyRespondedAt,
      })),
    }))
  )
}

export async function POST(req: NextRequest) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const body = await req.json()
    const { trainingName, businessUnit, startDate, endDate, hours, costPerAttendee, trainingType, capability, vendor, remindersEnabled, preEnabled, post1Enabled, post2Enabled, additionalCc, additionalCcMode, sourcedFromHistoricalData, trainingMode, location, meetingLink } = body as {
      trainingName: string; businessUnit: string; startDate: string; endDate: string; hours?: number
      costPerAttendee?: number; trainingType?: string; capability?: string; vendor?: string
      remindersEnabled?: boolean; preEnabled?: boolean; post1Enabled?: boolean; post2Enabled?: boolean
      additionalCc?: string; additionalCcMode?: string; sourcedFromHistoricalData?: boolean
      trainingMode?: string; location?: string; meetingLink?: string
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
        costPerAttendee: costPerAttendee ? Number(costPerAttendee) : null,
        trainingType: trainingType?.trim() || null,
        capability: capability?.trim() || null,
        vendor: vendor?.trim() || null,
        remindersEnabled: remindersEnabled ?? true,
        preEnabled: preEnabled ?? true,
        post1Enabled: post1Enabled ?? true,
        post2Enabled: post2Enabled ?? true,
        additionalCc: additionalCc?.trim() || null,
        additionalCcMode: additionalCcMode === 'individual' ? 'individual' : 'all',
        sourcedFromHistoricalData: sourcedFromHistoricalData ?? false,
        trainingMode: ['physical', 'virtual', 'platform', 'hybrid'].includes(trainingMode || '') ? trainingMode! : 'physical',
        location: trainingMode === 'physical' || trainingMode === 'hybrid' ? (location?.trim() || null) : null,
        meetingLink: trainingMode === 'virtual' || trainingMode === 'platform' || trainingMode === 'hybrid' ? (meetingLink?.trim() || null) : null,
      },
    })
    return NextResponse.json(schedule)
  } catch (err) {
    console.error('[admin/training-schedule POST]', err)
    return NextResponse.json({ error: 'Failed to create training schedule.' }, { status: 500 })
  }
}
