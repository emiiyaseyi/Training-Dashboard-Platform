import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

const RESPONDED_FIELD = {
  pre: 'preSurveyRespondedAt',
  post1: 'post1SurveyRespondedAt',
  post2: 'post2SurveyRespondedAt',
} as const

type Stage = keyof typeof RESPONDED_FIELD

// Manual, per-attendee, per-stage override: stops the daily reminder sweep from nudging THIS one
// person for THIS one stage, without touching anyone else on the schedule — everyone else still
// yet to respond keeps getting reminded exactly as before, and stops naturally the moment they
// respond, same as today.
//
// Reuses the exact same field sendSurveyReminders already checks (respondedAt) rather than adding
// a new "stopped" flag — sendSurveyReminders's own skip condition is `if (!sentAt ||
// a[respondedField]) continue`, so setting respondedAt is both necessary and sufficient to stop it,
// and keeps this admin override indistinguishable from a real response everywhere else in the app
// that reads this field (which is the point — the tick turns green, exactly like a real response).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; attendeeId: string }> }) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const { attendeeId } = await params
    const { stage } = (await req.json()) as { stage?: Stage }
    if (!stage || !(stage in RESPONDED_FIELD)) {
      return NextResponse.json({ error: 'stage must be one of: pre, post1, post2.' }, { status: 400 })
    }

    const field = RESPONDED_FIELD[stage]
    const attendee = await prisma.trainingScheduleAttendee.update({
      where: { id: attendeeId },
      data: { [field]: new Date() },
    })

    return NextResponse.json(attendee)
  } catch (err) {
    console.error('[admin/training-schedule/attendees/stop-reminders POST]', err)
    return NextResponse.json({ error: 'Failed to stop reminders for this attendee.' }, { status: 500 })
  }
}
