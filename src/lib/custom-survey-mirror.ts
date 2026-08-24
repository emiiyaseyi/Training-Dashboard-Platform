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

// Mirrors one Custom Survey response into its configured Google Sheet tab — same best-effort,
// self-aligning-headers pattern as mirrorSurveyResponse (survey-mirror.ts). A failure here never
// blocks the submission itself; the database write is the source of truth.
export async function mirrorCustomSurveyResponse(
  survey: CustomSurvey,
  recipient: CustomSurveyRecipient,
  answers: Record<string, string | string[]>,
  questions: CustomSurveyQuestion[],
  submittedAt: Date
): Promise<MirrorResult> {
  const config = await prisma.googleSheetsConfig.findFirst()
  if (!survey.mirrorSheetName || !config?.spreadsheetUrl) {
    return { attempted: false, success: false, message: 'Mirroring not configured for this survey.' }
  }

  const recordStatus = async (success: boolean, message: string) => {
    await prisma.customSurvey.update({
      where: { id: survey.id },
      data: { mirrorStatus: JSON.stringify({ success, message, at: new Date().toISOString() }) },
    })
  }

  const fields: MirrorField[] = [
    { label: 'Submitted At', candidates: [], value: formatSubmittedAt(submittedAt) },
    { label: 'Staff Name', candidates: ['staffname', 'employeename', 'fullname', 'name'], value: recipient.staffName },
    { label: 'Business Unit', candidates: ['businessunit', 'businessunits', 'department', 'unit', 'bu'], value: recipient.businessUnit || '' },
    ...questions.map((q) => ({ label: q.label, candidates: [] as string[], value: asText(answers[q.id]) })),
  ]

  try {
    const connection = await connectToSpreadsheet(config.spreadsheetUrl)
    await appendMirrorRow(connection.spreadsheetId, survey.mirrorSheetName, connection.accessToken, fields)
    await recordStatus(true, `Synced to "${survey.mirrorSheetName}".`)
    return { attempted: true, success: true, message: `Synced to "${survey.mirrorSheetName}".` }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error.'
    await recordStatus(false, message)
    console.error('[custom-survey-mirror]', err)
    return { attempted: true, success: false, message }
  }
}
