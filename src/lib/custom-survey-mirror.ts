import { prisma } from '@/lib/prisma'
import { connectToSpreadsheet, appendMirrorRow, type MirrorField } from '@/lib/google-sheets'
import type { CustomSurvey, CustomSurveyQuestion, CustomSurveyRecipient } from '@prisma/client'

const asText = (v: string | string[] | undefined) => (Array.isArray(v) ? v.join(', ') : v || '')

function formatSubmittedAt(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export interface MirrorResult {
  attempted: boolean
  success: boolean
  message: string
}

// Mirrors one Custom Survey response into a SINGLE shared tab used by EVERY Custom Survey (not
// one tab per survey) — same best-effort, self-aligning-headers pattern as mirrorSurveyResponse
// (survey-mirror.ts). Question columns are generic (Q1, Q2, ...) rather than the actual question
// text, since different surveys ask different questions but all share the same sheet — the
// Survey Name column is what tells rows from different surveys apart; the admin cross-references
// that survey's own question list (in-app) to know what Q1..Qn mean for that row. A failure here
// never blocks the submission itself; the database write is the source of truth.
export async function mirrorCustomSurveyResponse(
  survey: CustomSurvey,
  recipient: CustomSurveyRecipient,
  answers: Record<string, string | string[]>,
  questions: CustomSurveyQuestion[],
  submittedAt: Date
): Promise<MirrorResult> {
  const settings = await prisma.surveySettings.findFirst()
  const config = await prisma.googleSheetsConfig.findFirst()
  const sheetName = settings?.customSurveyMirrorSheetName
  if (!sheetName || !config?.spreadsheetUrl) {
    return { attempted: false, success: false, message: 'Mirroring not configured for Custom Surveys yet.' }
  }

  const recordStatus = async (success: boolean, message: string) => {
    const existing = await prisma.surveySettings.findFirst()
    if (existing) {
      await prisma.surveySettings.update({
        where: { id: existing.id },
        data: { customSurveyMirrorStatus: JSON.stringify({ success, message, at: new Date().toISOString() }) },
      })
    }
  }

  const fields: MirrorField[] = [
    { label: 'Timestamp', candidates: ['submittedat', 'datefilled', 'dateandtime'], value: formatSubmittedAt(submittedAt) },
    { label: 'Survey Name', candidates: ['surveytitle', 'survey'], value: survey.title },
    { label: 'Employee Name', candidates: ['staffname', 'employeename', 'fullname', 'name'], value: recipient.staffName },
    { label: 'Business Unit', candidates: ['businessunit', 'businessunits', 'department', 'unit', 'bu'], value: recipient.businessUnit || '' },
    ...questions.map((q, i) => ({ label: `Q${i + 1}`, candidates: [] as string[], value: asText(answers[q.id]) })),
  ]

  try {
    const connection = await connectToSpreadsheet(config.spreadsheetUrl)
    await appendMirrorRow(connection.spreadsheetId, sheetName, connection.accessToken, fields)
    await recordStatus(true, `Synced to "${sheetName}".`)
    return { attempted: true, success: true, message: `Synced to "${sheetName}".` }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error.'
    await recordStatus(false, message)
    console.error('[custom-survey-mirror]', err)
    return { attempted: true, success: false, message }
  }
}
