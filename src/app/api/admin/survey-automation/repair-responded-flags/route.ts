import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

const RESPONDED_FIELD = {
  pre: 'preSurveyRespondedAt',
  post1: 'post1SurveyRespondedAt',
  post2: 'post2SurveyRespondedAt',
} as const

// One-off repair for a window where survey submission wrote the response row and the attendee's/
// recipient's respondedAt timestamp as two separate, non-atomic database writes (now fixed in both
// submit routes to use a transaction). If the server process died between the two writes — a
// timeout, a cold-start kill, a transient DB error — the response itself was saved (so it shows up
// fine on the admin's Responses tab) but respondedAt stayed null. sendSurveyReminders and the
// custom survey reminder sweep both only ever check respondedAt, never the response table directly,
// so anyone caught in that gap kept getting nudged by reminders despite having already responded.
//
// Finds every attendee/recipient with a real response on file but a null respondedAt, and backfills
// it from that response's own submittedAt — stops the false reminders immediately for anyone
// already affected, without needing to touch every schedule/survey by hand.
export async function POST() {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    let trainingFixed = 0
    const trainingDetails: { staffName: string; stage: string }[] = []

    for (const stage of ['pre', 'post1', 'post2'] as const) {
      const field = RESPONDED_FIELD[stage]
      const orphaned = await prisma.trainingScheduleAttendee.findMany({
        where: { [field]: null, responses: { some: { stage } } },
        select: {
          id: true,
          staffName: true,
          responses: { where: { stage }, orderBy: { submittedAt: 'asc' }, take: 1, select: { submittedAt: true } },
        },
      })
      for (const a of orphaned) {
        const submittedAt = a.responses[0]?.submittedAt
        if (!submittedAt) continue
        await prisma.trainingScheduleAttendee.update({ where: { id: a.id }, data: { [field]: submittedAt } })
        trainingFixed++
        trainingDetails.push({ staffName: a.staffName, stage })
      }
    }

    const orphanedCustom = await prisma.customSurveyRecipient.findMany({
      where: { respondedAt: null, responses: { some: {} } },
      select: { id: true, staffName: true, responses: { orderBy: { submittedAt: 'asc' }, take: 1, select: { submittedAt: true } } },
    })
    let customFixed = 0
    const customDetails: { staffName: string }[] = []
    for (const r of orphanedCustom) {
      const submittedAt = r.responses[0]?.submittedAt
      if (!submittedAt) continue
      await prisma.customSurveyRecipient.update({ where: { id: r.id }, data: { respondedAt: submittedAt } })
      customFixed++
      customDetails.push({ staffName: r.staffName })
    }

    return NextResponse.json({ trainingFixed, customFixed, trainingDetails, customDetails })
  } catch (err) {
    console.error('[admin/survey-automation/repair-responded-flags POST]', err)
    return NextResponse.json({ error: 'Failed to repair responded flags.' }, { status: 500 })
  }
}
