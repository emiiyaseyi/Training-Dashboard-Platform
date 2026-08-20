import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

// Lists recent survey responses with their mirror-sync outcome, most-recently-submitted first —
// used by the admin panel to spot and retry failed Google Sheet mirrors.
export async function GET() {
  const gate = await requirePermission('admin-settings', 'view')
  if (gate instanceof NextResponse) return gate

  const responses = await prisma.surveyResponse.findMany({
    orderBy: { submittedAt: 'desc' },
    take: 200,
    include: { attendee: { include: { schedule: true } } },
  })

  return NextResponse.json(
    responses.map((r) => ({
      id: r.id,
      stage: r.stage,
      submittedAt: r.submittedAt,
      staffName: r.attendee.staffName,
      trainingName: r.attendee.schedule.trainingName,
      mirrorSyncedAt: r.mirrorSyncedAt,
      mirrorError: r.mirrorError,
    }))
  )
}
