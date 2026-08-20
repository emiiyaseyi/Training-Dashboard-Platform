import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { MONTHS } from '@/lib/filter-types'
import { connectToSpreadsheet, appendMirrorRow, type MirrorField } from '@/lib/google-sheets'
import type { SurveyStageKey } from '@/lib/survey-questions'

const VALID_STAGES: SurveyStageKey[] = ['pre', 'post1', 'post2']

const RESPONDED_FIELD = {
  pre: 'preSurveyRespondedAt',
  post1: 'post1SurveyRespondedAt',
  post2: 'post2SurveyRespondedAt',
} as const

const MIRROR_SHEET_FIELD = {
  pre: 'preMirrorSheetName',
  post1: 'post1MirrorSheetName',
  post2: 'post2MirrorSheetName',
} as const

function currentMonthName(): string {
  return MONTHS[new Date().getMonth()]
}

async function getOrCreateNativeBatch(type: string, filename: string) {
  const existing = await prisma.uploadBatch.findFirst({ where: { type, filename } })
  if (existing) return existing
  return prisma.uploadBatch.create({ data: { type, filename, recordCount: 0 } })
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string; stage: string }> }) {
  try {
    const { token, stage } = await params
    if (!VALID_STAGES.includes(stage as SurveyStageKey)) {
      return NextResponse.json({ error: 'Unknown survey stage.' }, { status: 400 })
    }
    const stageKey = stage as SurveyStageKey

    const attendee = await prisma.trainingScheduleAttendee.findUnique({
      where: { surveyToken: token },
      include: { schedule: true },
    })
    if (!attendee) return NextResponse.json({ error: 'This survey link is invalid or has expired.' }, { status: 404 })
    if (attendee[RESPONDED_FIELD[stageKey]]) {
      return NextResponse.json({ error: 'This survey has already been submitted.' }, { status: 400 })
    }

    const { answers } = (await req.json()) as { answers: Record<string, string | string[]> }

    const questions = await prisma.surveyQuestion.findMany({ where: { stage: stageKey }, orderBy: { order: 'asc' } })

    // Validate required questions (skip auto-filled ones — those aren't asked of the respondent).
    const missing = questions.filter((q) => q.required && !q.autoFill && !answers[q.id]?.toString().trim())
    if (missing.length > 0) {
      return NextResponse.json({ error: `Please answer: ${missing.map((q) => q.label).join(', ')}` }, { status: 400 })
    }

    const asText = (v: string | string[] | undefined) => (Array.isArray(v) ? v.join(', ') : v || '')
    const asNumber = (v: string | string[] | undefined) => {
      const n = parseFloat(Array.isArray(v) ? '' : v || '')
      return isNaN(n) ? 0 : n
    }
    const fieldAnswer = (fieldKey: string) => {
      const q = questions.find((q) => q.fieldKey === fieldKey)
      return q ? answers[q.id] : undefined
    }

    // Save the raw, full-fidelity answer set regardless of stage.
    await prisma.surveyResponse.create({
      data: { attendeeId: attendee.id, stage: stageKey, answers: JSON.stringify(answers) },
    })
    await prisma.trainingScheduleAttendee.update({
      where: { id: attendee.id },
      data: { [RESPONDED_FIELD[stageKey]]: new Date() },
    })

    // Feed the structured metric this stage maps to.
    if (stageKey === 'post1') {
      const batch = await getOrCreateNativeBatch('feedback', 'Native Survey Responses (Post-1)')
      await prisma.feedbackRecord.create({
        data: {
          businessUnit: attendee.schedule.businessUnit,
          trainingTitle: attendee.schedule.trainingName,
          role: null,
          applicationResponse: asText(fieldAnswer('applicationResponse')),
          impactAlignment: asText(fieldAnswer('impactAlignment')),
          confidenceRating: asNumber(fieldAnswer('confidenceRating')),
          roleRelevance: asNumber(fieldAnswer('roleRelevance')),
          expectationsMet: asNumber(fieldAnswer('expectationsMet')),
          vendorRating: asNumber(fieldAnswer('vendorRating')),
          vendorName: asText(fieldAnswer('vendorName')),
          qualitativeResponse: asText(fieldAnswer('qualitativeResponse')),
          month: currentMonthName(),
          batchId: batch.id,
        },
      })
      await prisma.uploadBatch.update({ where: { id: batch.id }, data: { recordCount: { increment: 1 } } })
    } else if (stageKey === 'post2') {
      const batch = await getOrCreateNativeBatch('manager-review', 'Native Survey Responses (Post-2)')
      await prisma.managerReviewRecord.create({
        data: {
          staffId: attendee.staffId,
          staffName: attendee.staffName,
          businessUnit: attendee.schedule.businessUnit,
          training: attendee.schedule.trainingName,
          managerName: attendee.lineManagerName,
          impactScore: asNumber(fieldAnswer('impactScore')),
          comments: asText(fieldAnswer('comments')) || null,
          month: currentMonthName(),
          batchId: batch.id,
        },
      })
      await prisma.uploadBatch.update({ where: { id: batch.id }, data: { recordCount: { increment: 1 } } })
    }

    // Optionally mirror the full answer set into a Google Sheet tab. The mirror tab may be one an
    // admin already uses for bulk Excel uploads (its own pre-existing header row), so we build a
    // field list with the SAME header candidates the bulk parsers (excel-parser.ts) look for, and
    // let appendMirrorRow() align values to whatever headers are actually there — see its comment
    // for why a fixed column order would be unsafe here.
    try {
      const settings = await prisma.surveySettings.findFirst()
      const config = await prisma.googleSheetsConfig.findFirst()
      const sheetName = settings?.[MIRROR_SHEET_FIELD[stageKey]]
      if (sheetName && config?.spreadsheetUrl) {
        const connection = await connectToSpreadsheet(config.spreadsheetUrl)

        let fields: MirrorField[]
        if (stageKey === 'post1') {
          fields = [
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
          fields = [
            { label: 'Staff ID', candidates: ['staffid', 'staffno', 'employeeid', 'employeeno'], value: attendee.staffId },
            { label: 'Name', candidates: ['name', 'staffname', 'employeename', 'fullname'], value: attendee.staffName },
            { label: 'Business Unit', candidates: ['businessunit', 'businessunits', 'department', 'unit', 'bu'], value: attendee.schedule.businessUnit },
            { label: 'Training', candidates: ['trainingname', 'trainingtitle', 'course', 'programme'], value: attendee.schedule.trainingName },
            { label: 'Manager Name', candidates: ['linemanager', 'reviewedby', 'manager', 'supervisor'], value: attendee.lineManagerName || '' },
            { label: 'Impact Score', candidates: ['posttrainingimpactscore', 'impactscore', 'impactrating', 'managerrating'], value: asNumber(fieldAnswer('impactScore')) },
            { label: 'Comments', candidates: ['remarks', 'notes', 'observation'], value: asText(fieldAnswer('comments')) },
            { label: 'Month', candidates: ['reviewmonth', 'period'], value: currentMonthName() },
          ]
        } else {
          fields = [
            { label: 'Submitted At', candidates: [], value: new Date().toISOString() },
            { label: 'Employee Name', candidates: ['staffname', 'employeename', 'fullname'], value: attendee.staffName },
            { label: 'Training', candidates: ['trainingname', 'trainingtitle', 'course', 'programme'], value: attendee.schedule.trainingName },
            { label: 'Business Unit', candidates: ['businessunits', 'department', 'unit', 'bu'], value: attendee.schedule.businessUnit },
            ...questions.filter((q) => !q.autoFill).map((q) => ({ label: q.label, candidates: [] as string[], value: asText(answers[q.id]) })),
          ]
        }

        await appendMirrorRow(connection.spreadsheetId, sheetName, connection.accessToken, fields)
      }
    } catch (mirrorErr) {
      // Mirroring is best-effort — the database write above already succeeded, so log and move on
      // rather than failing the whole submission over a sheet-side issue.
      console.error('[survey submit] sheet mirror failed', mirrorErr)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[survey submit]', err)
    return NextResponse.json({ error: 'Failed to submit — please try again.' }, { status: 500 })
  }
}
