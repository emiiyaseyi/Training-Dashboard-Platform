import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { normalizeStaffIdKey } from '@/lib/staff-id'
import { loadRosterDirectory, resolveStaff } from '@/lib/staff-directory'

// Finds every group of 2+ SurveyResponses for the same person, same training, same stage —
// whichever schedule they're attached to, native submission or a "Legacy" import alike — for an
// admin to review and choose which to remove. Detection-only; nothing here deletes anything (see
// the DELETE handler in [responseId]/route.ts for the actual removal, which an admin triggers one
// entry at a time after looking at both).
export async function GET() {
  const gate = await requirePermission('admin-settings', 'view')
  if (gate instanceof NextResponse) return gate

  const attendees = await prisma.trainingScheduleAttendee.findMany({
    where: { responses: { some: {} } },
    include: {
      schedule: { select: { trainingName: true, sourcedFromHistoricalData: true } },
      responses: { select: { id: true, stage: true, submittedAt: true } },
    },
  })

  const directory = await loadRosterDirectory()

  interface Entry {
    responseId: string
    attendeeId: string
    staffId: string
    staffName: string
    businessUnit: string
    trainingName: string
    stage: string
    submittedAt: string
    isLegacyImport: boolean
  }

  const groups = new Map<string, Entry[]>()
  for (const a of attendees) {
    const staff = resolveStaff(a.staffId, directory)
    for (const r of a.responses) {
      const key = `${r.stage}|${normalizeStaffIdKey(a.staffId)}|${a.schedule.trainingName.trim().toLowerCase()}`
      const list = groups.get(key) || []
      list.push({
        responseId: r.id,
        attendeeId: a.id,
        staffId: a.staffId,
        staffName: a.staffName,
        businessUnit: staff?.businessUnit || '',
        trainingName: a.schedule.trainingName,
        stage: r.stage,
        submittedAt: r.submittedAt.toISOString(),
        isLegacyImport: a.schedule.sourcedFromHistoricalData,
      })
      groups.set(key, list)
    }
  }

  const duplicateGroups = [...groups.values()]
    .filter((entries) => entries.length > 1)
    .map((entries) => entries.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)))
    .sort((a, b) => a[0].trainingName.localeCompare(b[0].trainingName))

  return NextResponse.json({ groups: duplicateGroups, groupCount: duplicateGroups.length })
}
