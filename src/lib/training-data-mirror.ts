import { connectToSpreadsheet, appendMirrorRow, type MirrorField } from '@/lib/google-sheets'
import { MONTHS } from '@/lib/filter-types'
import { prisma } from '@/lib/prisma'
import type { TrainingSchedule, TrainingScheduleAttendee } from '@prisma/client'

export interface TrainingDataMirrorResult {
  attempted: boolean
  success: boolean
  message: string
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
    const month = MONTHS[schedule.startDate.getMonth()]
    const startDateStr = schedule.startDate.toISOString().slice(0, 10)
    const endDateStr = schedule.endDate.toISOString().slice(0, 10)

    const fields: MirrorField[] = [
      { label: 'Staff ID', candidates: ['staffno', 'employeeid', 'employeeno'], value: attendee.staffId },
      { label: 'Name', candidates: ['staffname', 'employeename', 'fullname'], value: attendee.staffName },
      { label: 'Training', candidates: ['trainingname', 'trainingtitle', 'course', 'programme'], value: schedule.trainingName },
      { label: 'Business Units', candidates: ['businessunit', 'department', 'unit', 'bu'], value: schedule.businessUnit },
      { label: 'Month', candidates: ['period', 'trainingmonth'], value: month },
      { label: 'Cost', candidates: ['amount', 'fee', 'trainingcost', 'spend'], value: schedule.costPerAttendee ?? 0 },
      { label: 'Learning Hours', candidates: ['hoursoflearning', 'learningduration', 'traininghours', 'durationhours'], value: schedule.hours ?? 0 },
      { label: 'Differentiating Capability', candidates: ['capability', 'competency'], value: schedule.capability || '' },
      { label: 'Training Type', candidates: ['type', 'category'], value: schedule.trainingType || '' },
      { label: 'Start Date', candidates: [], value: startDateStr },
      { label: 'End Date', candidates: [], value: endDateStr },
    ]
    await appendMirrorRow(connection.spreadsheetId, sheetName, connection.accessToken, fields)
    return { attempted: true, success: true, message: `Synced to "${sheetName}".` }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error.'
    console.error('[training-data-mirror]', err)
    return { attempted: true, success: false, message }
  }
}
