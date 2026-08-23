import { prisma } from '@/lib/prisma'
import { MONTHS } from '@/lib/filter-types'
import { connectToSpreadsheet, appendMirrorRow, appendMirrorRows, type MirrorField } from '@/lib/google-sheets'
import type { SurveyStageKey } from '@/lib/survey-questions'
import type { SurveyQuestion, TrainingSchedule, TrainingScheduleAttendee } from '@prisma/client'

const MIRROR_SHEET_FIELD = {
  pre: 'preMirrorSheetName',
  post1: 'post1MirrorSheetName',
  post2: 'post2MirrorSheetName',
} as const

const MIRROR_STATUS_FIELD = {
  pre: 'preMirrorStatus',
  post1: 'post1MirrorStatus',
  post2: 'post2MirrorStatus',
} as const

function currentMonthName(): string {
  return MONTHS[new Date().getMonth()]
}

const asText = (v: string | string[] | undefined) => (Array.isArray(v) ? v.join(', ') : v || '')
const asNumber = (v: string | string[] | undefined) => {
  const n = parseFloat(Array.isArray(v) ? '' : v || '')
  return isNaN(n) ? 0 : n
}

export interface MirrorResult {
  attempted: boolean // false = mirroring isn't configured for this stage, nothing to report
  success: boolean
  message: string
}

function buildMirrorFields(
  stageKey: SurveyStageKey,
  attendee: TrainingScheduleAttendee & { schedule: TrainingSchedule },
  answers: Record<string, string | string[]>,
  questions: SurveyQuestion[]
): MirrorField[] {
  const fieldAnswer = (fieldKey: string) => {
    const q = questions.find((q) => q.fieldKey === fieldKey)
    return q ? answers[q.id] : undefined
  }

  if (stageKey === 'post1') {
    return [
      { label: 'Business Unit', candidates: ['businessunit', 'businessunits', 'department', 'unit', 'bu'], value: attendee.schedule.businessUnit },
      { label: 'Training Title', candidates: ['trainingtitle', 'training', 'course', 'programme'], value: attendee.schedule.trainingName },
      { label: 'Role', candidates: ['role', 'jobtitle', 'position'], value: '' },
      { label: 'Application response', candidates: ['applicationresponse', 'application', 'applied'], value: asText(fieldAnswer('applicationResponse')) },
      { label: 'Impact alignment', candidates: ['impactalignment', 'impact', 'alignment', 'strategicalignment'], value: asText(fieldAnswer('impactAlignment')) },
      { label: 'Confidence rating', candidates: ['confidencerating', 'confidencelevel', 'basedonconfidence', 'confidence'], value: asNumber(fieldAnswer('confidenceRating')) },
      { label: 'Role Relevance', candidates: ['rolerelevance', 'trainingrelevance', 'relevanttorole', 'howrelevant', 'rolesuitability'], value: asNumber(fieldAnswer('roleRelevance')) },
      { label: 'Expectations Met', candidates: ['expectationsmet', 'expectationmet', 'metexpectations', 'extentmet', 'towhichextent'], value: asNumber(fieldAnswer('expectationsMet')) },
      { label: 'Vendor Rating', candidates: ['vendorrating', 'facilitatorrating', 'providerrating', 'trainerrating', 'facilitatorevaluation', 'instructorrating'], value: asNumber(fieldAnswer('vendorRating')) },
      { label: 'Vendor Name', candidates: ['vendorname', 'facilitatorname', 'providername', 'trainername', 'facilitator', 'trainer', 'provider'], value: asText(fieldAnswer('vendorName')) },
      { label: 'Qualitative responses', candidates: ['qualitativeresponse', 'qualitative', 'comments', 'feedback'], value: asText(fieldAnswer('qualitativeResponse')) },
      { label: 'Month', candidates: ['month', 'trainingmonth', 'period', 'feedbackmonth'], value: currentMonthName() },
    ]
  } else if (stageKey === 'post2') {
    return [
      { label: 'Staff ID', candidates: ['staffid', 'staffno', 'employeeid', 'employeeno'], value: attendee.staffId },
      { label: 'Name', candidates: ['name', 'staffname', 'employeename', 'fullname'], value: attendee.staffName },
      { label: 'Business Unit', candidates: ['businessunit', 'businessunits', 'department', 'unit', 'bu'], value: attendee.schedule.businessUnit },
      { label: 'Training', candidates: ['trainingname', 'trainingtitle', 'course', 'programme'], value: attendee.schedule.trainingName },
      { label: 'Manager Name', candidates: ['linemanager', 'reviewedby', 'manager', 'supervisor'], value: attendee.lineManagerName || '' },
      { label: 'Impact Score', candidates: ['posttrainingimpactscore', 'impactscore', 'impactrating', 'managerrating'], value: asNumber(fieldAnswer('impactScore')) },
      { label: 'Comments', candidates: ['remarks', 'notes', 'observation'], value: asText(fieldAnswer('comments')) },
      { label: 'Month', candidates: ['reviewmonth', 'period'], value: currentMonthName() },
    ]
  }
  return [
    { label: 'Submitted At', candidates: [], value: new Date().toISOString() },
    { label: 'Employee Name', candidates: ['staffname', 'employeename', 'fullname'], value: attendee.staffName },
    { label: 'Training', candidates: ['trainingname', 'trainingtitle', 'course', 'programme'], value: attendee.schedule.trainingName },
    { label: 'Business Unit', candidates: ['businessunits', 'department', 'unit', 'bu'], value: attendee.schedule.businessUnit },
    ...questions.filter((q) => !q.autoFill).map((q) => ({ label: q.label, candidates: [] as string[], value: asText(answers[q.id]) })),
  ]
}

// Mirrors one survey response into its configured Google Sheet tab (best-effort — a failure here
// never blocks the submission itself, since the database write is the source of truth). Shared by
// the submit route (mirrors immediately on submission) and the admin "Retry Sync" action (re-runs
// this exact same logic for an already-saved response, without re-creating its FeedbackRecord/
// ManagerReviewRecord or asking the respondent to fill the form again).
export async function mirrorSurveyResponse(
  stageKey: SurveyStageKey,
  attendee: TrainingScheduleAttendee & { schedule: TrainingSchedule },
  answers: Record<string, string | string[]>,
  questions: SurveyQuestion[]
): Promise<MirrorResult> {
  const settings = await prisma.surveySettings.findFirst()
  const config = await prisma.googleSheetsConfig.findFirst()
  const sheetName = settings?.[MIRROR_SHEET_FIELD[stageKey]]
  if (!sheetName || !config?.spreadsheetUrl) {
    return { attempted: false, success: false, message: 'Mirroring not configured for this stage.' }
  }

  const recordStatus = async (success: boolean, message: string) => {
    const statusField = MIRROR_STATUS_FIELD[stageKey]
    const existing = await prisma.surveySettings.findFirst()
    if (existing) {
      await prisma.surveySettings.update({
        where: { id: existing.id },
        data: { [statusField]: JSON.stringify({ success, message, at: new Date().toISOString() }) },
      })
    }
  }

  try {
    const connection = await connectToSpreadsheet(config.spreadsheetUrl)
    const fields = buildMirrorFields(stageKey, attendee, answers, questions)
    await appendMirrorRow(connection.spreadsheetId, sheetName, connection.accessToken, fields)
    await recordStatus(true, `Synced to "${sheetName}".`)
    return { attempted: true, success: true, message: `Synced to "${sheetName}".` }
  } catch (mirrorErr) {
    const message = mirrorErr instanceof Error ? mirrorErr.message : 'Unknown error.'
    await recordStatus(false, message)
    console.error('[survey-mirror]', mirrorErr)
    return { attempted: true, success: false, message }
  }
}

export interface MirrorBatchItem {
  responseId: string
  stageKey: SurveyStageKey
  attendee: TrainingScheduleAttendee & { schedule: TrainingSchedule }
  answers: Record<string, string | string[]>
  questions: SurveyQuestion[]
}

// Batch version for "Retry All" — retrying N unsynced responses one at a time meant N separate
// connect+read-headers+append round trips, the same slowdown pattern as the training-schedule and
// roster fixes. Groups by stage (each stage mirrors to a different sheet tab) and, within a stage,
// by the exact field-label shape (identical for post1/post2; the "pre" stage's shape can vary if
// survey questions were edited/reordered between responses, since it includes every question) —
// only rows sharing an identical shape can share one appendMirrorRows call.
export async function mirrorSurveyResponses(items: MirrorBatchItem[]): Promise<Map<string, MirrorResult>> {
  const results = new Map<string, MirrorResult>()
  if (items.length === 0) return results

  const [settings, config] = await Promise.all([prisma.surveySettings.findFirst(), prisma.googleSheetsConfig.findFirst()])

  const byStage = new Map<SurveyStageKey, MirrorBatchItem[]>()
  for (const item of items) {
    if (!byStage.has(item.stageKey)) byStage.set(item.stageKey, [])
    byStage.get(item.stageKey)!.push(item)
  }

  for (const [stageKey, stageItems] of byStage) {
    const sheetName = settings?.[MIRROR_SHEET_FIELD[stageKey]]
    const statusField = MIRROR_STATUS_FIELD[stageKey]
    if (!sheetName || !config?.spreadsheetUrl) {
      const result = { attempted: false, success: false, message: 'Mirroring not configured for this stage.' }
      stageItems.forEach((it) => results.set(it.responseId, result))
      continue
    }

    const withFields = stageItems.map((it) => ({ item: it, fields: buildMirrorFields(stageKey, it.attendee, it.answers, it.questions) }))
    const shapeKey = (fields: MirrorField[]) => fields.map((f) => f.label).join('|')

    const shapeGroups = new Map<string, typeof withFields>()
    for (const w of withFields) {
      const key = shapeKey(w.fields)
      if (!shapeGroups.has(key)) shapeGroups.set(key, [])
      shapeGroups.get(key)!.push(w)
    }

    try {
      const connection = await connectToSpreadsheet(config.spreadsheetUrl)
      for (const group of shapeGroups.values()) {
        await appendMirrorRows(connection.spreadsheetId, sheetName, connection.accessToken, group.map((g) => g.fields))
        const result = { attempted: true, success: true, message: `Synced to "${sheetName}".` }
        group.forEach((g) => results.set(g.item.responseId, result))
      }
      if (settings) {
        await prisma.surveySettings.update({
          where: { id: settings.id },
          data: { [statusField]: JSON.stringify({ success: true, message: `Synced to "${sheetName}".`, at: new Date().toISOString() }) },
        })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error.'
      console.error('[survey-mirror] batch', err)
      stageItems.forEach((it) => { if (!results.has(it.responseId)) results.set(it.responseId, { attempted: true, success: false, message }) })
      if (settings) {
        await prisma.surveySettings.update({
          where: { id: settings.id },
          data: { [statusField]: JSON.stringify({ success: false, message, at: new Date().toISOString() }) },
        })
      }
    }
  }

  return results
}
