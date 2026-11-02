import { prisma } from './prisma'
import { sendMail, hasSmtpCredentials } from './mailer'
import { getAppBaseUrl } from './app-url'
import { loadRosterDirectory, type ResolvedStaff } from './staff-directory'
import { getTaDashboardData } from './ta-sheets'
import type { HireRecord } from './ta-types'

const DAY_MS = 86400000
const DAYS_POST_JOIN = 7
const REMINDER_INTERVAL_DAYS = 5

export type NewHireQuestionType = 'single-choice' | 'textarea'

export interface NewHireQuestion {
  id: string
  label: string
  type: NewHireQuestionType
  required: true
  options?: string[]
}

// Verbatim from the "New Hire Experience Survey" the TA team supplied — wording and option order
// (including Q5's "Very good" as its last option) kept exactly as given, not corrected, since this
// is their survey content, not ours to edit.
export const NEW_HIRE_SURVEY_TITLE = 'New Hire Experience Survey'
export const NEW_HIRE_SURVEY_INTRO = 'This survey seeks to gather your feedback on your Talent Acquisition experience and identify areas for improvement.'

export const NEW_HIRE_QUESTIONS: NewHireQuestion[] = [
  {
    id: 'communication_clarity',
    label: 'How would you rate the clarity and timeliness of communication you received throughout the recruitment process?',
    type: 'single-choice',
    required: true,
    options: ['Excellent', 'Good', 'Average', 'Poor', 'Very poor'],
  },
  {
    id: 'role_culture_understanding',
    label: "To what extent did the recruitment process give you a clear understanding of the role, expectations, and Meristem's culture?",
    type: 'single-choice',
    required: true,
    options: ['5 – Completely', '4 – Very much', '3 – Moderately', '2 – Slightly', '1 – Not at all'],
  },
  {
    id: 'hiring_manager_experience',
    label: 'How would you rate your interaction and overall experience with the Hiring Manager(s) during the recruitment process?',
    type: 'single-choice',
    required: true,
    options: ['Excellent', 'Good', 'Average', 'Poor', 'Very Poor'],
  },
  {
    id: 'process_duration_satisfaction',
    label: 'How satisfied were you with the duration of the recruitment process, from application to receiving your offer?',
    type: 'single-choice',
    required: true,
    options: ['Very satisfied', 'Satisfied', 'Neutral', 'Dissatisfied', 'Very Dissatisfied'],
  },
  {
    id: 'offer_stage_experience',
    label: 'How would you rate your experience during the offer stage, including the clarity of the offer, communication, and responsiveness?',
    type: 'single-choice',
    required: true,
    options: ['Excellent', 'Good', 'Average', 'Poor', 'Very good'],
  },
  {
    id: 'improvement_suggestion',
    label: 'What is one thing you believe we could improve to make the recruitment experience better for future candidates?',
    type: 'textarea',
    required: true,
  },
  {
    id: 'culture_since_joining',
    label: 'Since joining Meristem, what cultural experiences have stood out to you, either positively or negatively, and what would you recommend we do differently to enhance the employee experience?',
    type: 'textarea',
    required: true,
  },
]

function normalizeNameKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

export interface NewHireSyncResult {
  created: number
  unmatched: { candidateName: string; role: string; hireDate: string }[]
}

// Pulls the TA Hires sheet, finds Accepted hires with a resumption (join) date that don't yet have
// a NewHireExperienceSurvey row (sourceHireRowId = the sheet row's own "id"), and matches each one
// by name against the staff roster to get a staffId/email/businessUnit/role — the Hires sheet has
// no staffId or email column of its own. A hire with no roster match yet (not uploaded to the staff
// list, or a name mismatch) is reported back, not silently dropped, so TA knows to follow up instead
// of just seeing nothing happen.
export async function syncNewHireExperienceSurveys(): Promise<NewHireSyncResult> {
  const { records } = await getTaDashboardData()
  const accepted = records.filter((r): r is HireRecord & { resumptionDate: Date } => r.offerStatus === 'Accepted' && r.resumptionDate !== null)

  const existing = await prisma.newHireExperienceSurvey.findMany({ select: { sourceHireRowId: true } })
  const existingIds = new Set(existing.map((r) => r.sourceHireRowId))
  const toMatch = accepted.filter((r) => !existingIds.has(r.id))

  const directory = await loadRosterDirectory()
  const byName = new Map<string, ResolvedStaff>()
  for (const staff of directory.values()) byName.set(normalizeNameKey(staff.name), staff)

  const unmatched: NewHireSyncResult['unmatched'] = []
  let created = 0
  for (const hire of toMatch) {
    const staff = byName.get(normalizeNameKey(hire.candidateName))
    if (!staff) {
      unmatched.push({ candidateName: hire.candidateName, role: hire.role, hireDate: hire.resumptionDate.toISOString().slice(0, 10) })
      continue
    }
    await prisma.newHireExperienceSurvey.create({
      data: {
        staffId: staff.staffId,
        staffName: staff.name,
        email: staff.email,
        businessUnit: staff.businessUnit,
        role: staff.role,
        hireDate: hire.resumptionDate,
        sourceHireRowId: hire.id,
        scheduledFor: new Date(hire.resumptionDate.getTime() + DAYS_POST_JOIN * DAY_MS),
      },
    })
    created++
  }
  return { created, unmatched }
}

function buildNewHireSurveyEmail(firstName: string, href: string): { subject: string; html: string } {
  const FONT = 'font-family:Tahoma,Geneva,sans-serif !important;font-size:12px !important;'
  const P = (html: string) => `<p style="margin:0 0 14px 0;line-height:1.5;${FONT}"><span style="${FONT}">${html}</span></p>`
  const BUTTON = (label: string) => P(`<a href="${href}" style="display:inline-block;background:#1E7145;color:#ffffff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;${FONT}">${label}</a>`)
  const html = `
    ${P(`Dear ${firstName},`)}
    ${P(`Congratulations again on joining Meristem! Now that you've settled in, we'd love to hear about your experience with our recruitment process.`)}
    ${P(NEW_HIRE_SURVEY_INTRO)}
    ${BUTTON('Share your feedback')}
    ${P('Best Regards,<br/>Meristem Talent Acquisition Team')}
  `
  return { subject: 'Your New Hire Experience Survey', html }
}

function firstNameOf(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || fullName
}

export interface NewHireSendResult {
  sent: number
  skipped: { name: string; reason: string }[]
}

// Sends the survey to anyone whose scheduledFor (hireDate + 7 days) has arrived and hasn't been
// sent yet — idempotent, same "due" pattern as every other survey sweep in this app.
export async function sendDueNewHireExperienceSurveys(): Promise<NewHireSendResult> {
  const result: NewHireSendResult = { sent: 0, skipped: [] }
  const due = await prisma.newHireExperienceSurvey.findMany({ where: { sentAt: null, scheduledFor: { lte: new Date() } } })
  if (due.length === 0) return result
  if (!(await hasSmtpCredentials())) {
    result.skipped = due.filter((s) => s.email).map((s) => ({ name: s.staffName, reason: 'SMTP is not configured yet.' }))
    return result
  }
  const baseUrl = getAppBaseUrl()
  for (const survey of due) {
    if (!survey.email) {
      result.skipped.push({ name: survey.staffName, reason: 'No email address on file.' })
      continue
    }
    const { subject, html } = buildNewHireSurveyEmail(firstNameOf(survey.staffName), `${baseUrl}/survey/new-hire/${survey.surveyToken}`)
    try {
      await sendMail({ to: survey.email, subject, html, skipDefaultCc: true })
      await prisma.newHireExperienceSurvey.update({ where: { id: survey.id }, data: { sentAt: new Date(), reminderAt: new Date() } })
      result.sent++
    } catch (err) {
      result.skipped.push({ name: survey.staffName, reason: err instanceof Error ? err.message : 'Send failed.' })
    }
  }
  return result
}

// Manual override for the admin panel's "Send now" — sends immediately regardless of
// scheduledFor, same as every other survey's manual-send button in this app.
export async function sendNewHireExperienceSurveyNow(id: string): Promise<{ ok: boolean; reason?: string }> {
  const survey = await prisma.newHireExperienceSurvey.findUnique({ where: { id } })
  if (!survey) return { ok: false, reason: 'Not found.' }
  if (!survey.email) return { ok: false, reason: 'No email address on file.' }
  if (!(await hasSmtpCredentials())) return { ok: false, reason: 'SMTP is not configured yet.' }
  const baseUrl = getAppBaseUrl()
  const { subject, html } = buildNewHireSurveyEmail(firstNameOf(survey.staffName), `${baseUrl}/survey/new-hire/${survey.surveyToken}`)
  try {
    await sendMail({ to: survey.email, subject, html, skipDefaultCc: true })
    await prisma.newHireExperienceSurvey.update({ where: { id: survey.id }, data: { sentAt: new Date(), reminderAt: new Date() } })
    return { ok: true }
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'Send failed.' }
  }
}

// Every REMINDER_INTERVAL_DAYS, nudge anyone sent a survey who hasn't responded yet — reminders
// always skip the platform-wide Default Cc, same unconditional rule every other reminder sweep in
// this app follows.
export async function sendNewHireExperienceSurveyReminders(): Promise<{ sent: number }> {
  const outstanding = await prisma.newHireExperienceSurvey.findMany({
    where: { sentAt: { not: null }, respondedAt: null, email: { not: null } },
  })
  const due = outstanding.filter((s) => Date.now() - (s.reminderAt ?? s.sentAt!).getTime() >= REMINDER_INTERVAL_DAYS * DAY_MS)
  if (due.length === 0 || !(await hasSmtpCredentials())) return { sent: 0 }
  const baseUrl = getAppBaseUrl()
  let sent = 0
  for (const survey of due) {
    const { subject, html } = buildNewHireSurveyEmail(firstNameOf(survey.staffName), `${baseUrl}/survey/new-hire/${survey.surveyToken}`)
    try {
      await sendMail({ to: survey.email!, subject: `Reminder: ${subject}`, html, skipDefaultCc: true })
      await prisma.newHireExperienceSurvey.update({ where: { id: survey.id }, data: { reminderAt: new Date() } })
      sent++
    } catch {
      // Same as other reminder sweeps — a failed reminder send isn't reported per-recipient, the
      // next day's sweep just retries.
    }
  }
  return { sent }
}
