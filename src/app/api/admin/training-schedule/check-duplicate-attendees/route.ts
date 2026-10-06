import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { normalizeStaffIdKey } from '@/lib/staff-id'

export interface DuplicateAttendeeRow {
  attendeeId: string
  staffId: string
  staffName: string
  preSentAt: string | null
  preRespondedAt: string | null
  post1SentAt: string | null
  post1RespondedAt: string | null
  post2SentAt: string | null
  post2RespondedAt: string | null
}

export interface DuplicateAttendeeGroup {
  scheduleId: string
  trainingName: string
  rows: DuplicateAttendeeRow[]
}

// Tests a specific theory: an admin sees one attendee row for a real person showing green
// (responded), but that person still reports getting reminders — only explainable if there's a
// SEPARATE attendee row for the same real person on the same schedule that's still unresponded and
// still being reminded independently (its own surveyToken, its own email). The schedule-level
// unique constraint is on (scheduleId, staffId) as a literal string, so two rows for the same real
// person only slip through if their staffId was entered with different punctuation/casing (e.g.
// "MSL-0100" vs "MSL0100") — this groups by the same NORMALIZED key every other part of the app
// already uses for staffId matching, which catches exactly that case.
export async function GET() {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const attendees = await prisma.trainingScheduleAttendee.findMany({
      select: {
        id: true, scheduleId: true, staffId: true, staffName: true,
        preSurveySentAt: true, preSurveyRespondedAt: true,
        post1SurveySentAt: true, post1SurveyRespondedAt: true,
        post2SurveySentAt: true, post2SurveyRespondedAt: true,
        schedule: { select: { trainingName: true } },
      },
    })

    const byKey = new Map<string, typeof attendees>()
    for (const a of attendees) {
      const key = `${a.scheduleId}|${normalizeStaffIdKey(a.staffId)}`
      const list = byKey.get(key) || []
      list.push(a)
      byKey.set(key, list)
    }

    const groups: DuplicateAttendeeGroup[] = [...byKey.values()]
      .filter((list) => list.length > 1)
      .map((list) => ({
        scheduleId: list[0].scheduleId,
        trainingName: list[0].schedule.trainingName,
        rows: list.map((a) => ({
          attendeeId: a.id,
          staffId: a.staffId,
          staffName: a.staffName,
          preSentAt: a.preSurveySentAt?.toISOString() ?? null,
          preRespondedAt: a.preSurveyRespondedAt?.toISOString() ?? null,
          post1SentAt: a.post1SurveySentAt?.toISOString() ?? null,
          post1RespondedAt: a.post1SurveyRespondedAt?.toISOString() ?? null,
          post2SentAt: a.post2SurveySentAt?.toISOString() ?? null,
          post2RespondedAt: a.post2SurveyRespondedAt?.toISOString() ?? null,
        })),
      }))

    return NextResponse.json({ groupCount: groups.length, groups })
  } catch (err) {
    console.error('[admin/training-schedule/check-duplicate-attendees GET]', err)
    return NextResponse.json({ error: 'Failed to check for duplicate attendees.' }, { status: 500 })
  }
}
