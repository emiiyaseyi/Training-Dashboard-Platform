import { connectToSpreadsheet, appendMirrorRow, appendMirrorRows, type MirrorField } from '@/lib/google-sheets'
import { MONTHS } from '@/lib/filter-types'
import { prisma } from '@/lib/prisma'
import type { TrainingSchedule, TrainingScheduleAttendee } from '@prisma/client'

export interface TrainingDataMirrorResult {
  attempted: boolean
  success: boolean
  message: string
}

function attendeeMirrorFields(attendee: TrainingScheduleAttendee, schedule: TrainingSchedule): MirrorField[] {
  const month = MONTHS[schedule.startDate.getMonth()]
  return [
    { label: 'Staff ID', candidates: ['staffno', 'employeeid', 'employeeno'], value: attendee.staffId },
    { label: 'Name', candidates: ['staffname', 'employeename', 'fullname'], value: attendee.staffName },
    { label: 'Training', candidates: ['trainingname', 'trainingtitle', 'course', 'programme'], value: schedule.trainingName },
    { label: 'Business Units', candidates: ['businessunit', 'department', 'unit', 'bu'], value: schedule.businessUnit },
    { label: 'Month', candidates: ['period', 'trainingmonth'], value: month },
    { label: 'Cost', candidates: ['amount', 'fee', 'trainingcost', 'spend'], value: schedule.costPerAttendee ?? 0 },
    { label: 'Learning Hours', candidates: ['hoursoflearning', 'learningduration', 'traininghours', 'durationhours'], value: schedule.hours ?? 0 },
    { label: 'Differentiating Capability', candidates: ['capability', 'competency'], value: schedule.capability || '' },
    { label: 'Training Type', candidates: ['type', 'category'], value: schedule.trainingType || '' },
    { label: 'Vendor', candidates: ['vendor', 'provider', 'facilitator', 'trainer'], value: schedule.vendor || '' },
    { label: 'Start Date', candidates: [], value: schedule.startDate.toISOString().slice(0, 10) },
    { label: 'End Date', candidates: [], value: schedule.endDate.toISOString().slice(0, 10) },
  ]
}

// Batch sibling of mirrorAttendeeToTrainingData — mirroring N newly-added attendees one at a time
// meant N separate connect+read-headers+append round trips to Google Sheets, which is what made
// adding attendees to a schedule slow. This connects and resolves the sheet once, then appends
// every attendee's row in a single call. Returns a result per attendee (same shape as the single
// version) so the caller can persist success/failure per-row exactly as before.
export async function mirrorAttendeesToTrainingData(
  attendees: TrainingScheduleAttendee[],
  schedule: TrainingSchedule
): Promise<Map<string, TrainingDataMirrorResult>> {
  const results = new Map<string, TrainingDataMirrorResult>()
  if (attendees.length === 0) return results

  const config = await prisma.googleSheetsConfig.findFirst()
  if (!config?.spreadsheetUrl) {
    const result = { attempted: false, success: false, message: 'No spreadsheet configured under Admin -> Live Data Source.' }
    attendees.forEach((a) => results.set(a.id, result))
    return results
  }

  try {
    const connection = await connectToSpreadsheet(config.spreadsheetUrl)
    const sheetName = config.trainingSheetName
    await appendMirrorRows(connection.spreadsheetId, sheetName, connection.accessToken, attendees.map((a) => attendeeMirrorFields(a, schedule)))
    const result = { attempted: true, success: true, message: `Synced to "${sheetName}".` }
    attendees.forEach((a) => results.set(a.id, result))
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error.'
    console.error('[training-data-mirror] batch', err)
    const result = { attempted: true, success: false, message }
    attendees.forEach((a) => results.set(a.id, result))
  }

  return results
}

// Mirrors one attendee into the Training Data sheet (Admin -> Live Data Source -> Training Cost
// tab) so it flows into the same bulk-sync pipeline as any other row there. Attendance and
// Reason if No are deliberately left untouched — those two columns are filled in by hand, never
// by this. Shared by the attendee-add route (mirrors immediately) and the admin retry action.
export async function mirrorAttendeeToTrainingData(
  attendee: TrainingScheduleAttendee,
  schedule: TrainingSchedule
): Promise<TrainingDataMirrorResult> {
  const config = await prisma.googleSheetsConfig.findFirst()
  if (!config?.spreadsheetUrl) {
    return { attempted: false, success: false, message: 'No spreadsheet configured under Admin -> Live Data Source.' }
  }

  try {
    const connection = await connectToSpreadsheet(config.spreadsheetUrl)
    const sheetName = config.trainingSheetName
    await appendMirrorRow(connection.spreadsheetId, sheetName, connection.accessToken, attendeeMirrorFields(attendee, schedule))
    return { attempted: true, success: true, message: `Synced to "${sheetName}".` }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error.'
    console.error('[training-data-mirror]', err)
    return { attempted: true, success: false, message }
  }
}
