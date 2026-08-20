import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { loadRosterDirectory, resolveStaff, resolveLineManager } from '@/lib/staff-directory'
import { connectToSpreadsheet, appendMirrorRow, type MirrorField } from '@/lib/google-sheets'
import { MONTHS } from '@/lib/filter-types'

// Accepts a list of Staff IDs or emails, resolves each against the roster (name, email, line
// manager name/email) and adds them as attendees. Unresolvable identifiers are reported back
// rather than silently skipped, since a missing email means that person can never be surveyed.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const { id } = await params
    const { identifiers } = (await req.json()) as { identifiers: string[] }
    if (!Array.isArray(identifiers) || identifiers.length === 0) {
      return NextResponse.json({ error: 'Provide at least one Staff ID or email.' }, { status: 400 })
    }

    const schedule = await prisma.trainingSchedule.findUnique({ where: { id } })
    if (!schedule) return NextResponse.json({ error: 'Training schedule not found.' }, { status: 404 })

    const directory = await loadRosterDirectory()
    const added: string[] = []
    const notFound: string[] = []
    const noEmail: string[] = []
    const addedStaff: { staffId: string; name: string }[] = []

    for (const raw of identifiers) {
      const identifier = raw.trim()
      if (!identifier) continue
      const staff = resolveStaff(identifier, directory)
      if (!staff) {
        notFound.push(identifier)
        continue
      }
      const manager = resolveLineManager(staff, directory)
      await prisma.trainingScheduleAttendee.create({
        data: {
          scheduleId: id,
          staffId: staff.staffId,
          staffName: staff.name,
          email: staff.email,
          lineManagerName: manager?.name || null,
          lineManagerEmail: manager?.email || null,
        },
      })
      added.push(staff.name)
      addedStaff.push({ staffId: staff.staffId, name: staff.name })
      if (!staff.email) noEmail.push(staff.name)
    }

    // Best-effort: mirror each newly-added attendee into the Training Cost sheet (Admin -> Live
    // Data Source) so the existing bulk-sync engine picks it up as regular training-cost data on
    // its next run — this schedule is just another way of getting rows into that same tab, not a
    // separate pipeline, so no direct TrainingRecord write or special dedup handling is needed.
    // Attendance/Reason if No aren't tracked here (per admin decision) — every row is written as
    // Attendance = Yes, Reason if No left blank.
    try {
      const config = await prisma.googleSheetsConfig.findFirst()
      if (config?.spreadsheetUrl && addedStaff.length > 0) {
        const connection = await connectToSpreadsheet(config.spreadsheetUrl)
        const sheetName = config.trainingSheetName
        const month = MONTHS[schedule.startDate.getMonth()]
        const startDateStr = schedule.startDate.toISOString().slice(0, 10)
        const endDateStr = schedule.endDate.toISOString().slice(0, 10)
        for (const staff of addedStaff) {
          const fields: MirrorField[] = [
            { label: 'Staff ID', candidates: ['staffno', 'employeeid', 'employeeno'], value: staff.staffId },
            { label: 'Name', candidates: ['staffname', 'employeename', 'fullname'], value: staff.name },
            { label: 'Training', candidates: ['trainingname', 'trainingtitle', 'course', 'programme'], value: schedule.trainingName },
            { label: 'Business Units', candidates: ['businessunit', 'department', 'unit', 'bu'], value: schedule.businessUnit },
            { label: 'Month', candidates: ['period', 'trainingmonth'], value: month },
            { label: 'Cost', candidates: ['amount', 'fee', 'trainingcost', 'spend'], value: schedule.costPerAttendee ?? 0 },
            { label: 'Learning Hours', candidates: ['hoursoflearning', 'learningduration', 'traininghours', 'durationhours'], value: schedule.hours ?? 0 },
            { label: 'Attendance', candidates: [], value: 'Yes' },
            { label: 'Reason if No', candidates: [], value: '' },
            { label: 'Differentiating Capability', candidates: ['capability', 'competency'], value: schedule.capability || '' },
            { label: 'Training Type', candidates: ['type', 'category'], value: schedule.trainingType || '' },
            { label: 'Start Date', candidates: [], value: startDateStr },
            { label: 'End Date', candidates: [], value: endDateStr },
          ]
          await appendMirrorRow(connection.spreadsheetId, sheetName, connection.accessToken, fields)
        }
      }
    } catch (mirrorErr) {
      console.error('[admin/training-schedule/attendees] training data sheet mirror failed', mirrorErr)
    }

    return NextResponse.json({ added: added.length, notFound, noEmail })
  } catch (err) {
    console.error('[admin/training-schedule/attendees POST]', err)
    return NextResponse.json({ error: 'Failed to add attendees.' }, { status: 500 })
  }
}
