import { prisma } from '@/lib/prisma'
import type { CustomSurvey, CustomSurveyRecipient } from '@prisma/client'
import { sendMail, hasSmtpCredentials } from '@/lib/mailer'
import { buildCustomSurveyEmail } from '@/lib/custom-survey-email'
import { getAppBaseUrl } from '@/lib/app-url'
import { loadRosterDirectory, resolveStaffLoose } from '@/lib/staff-directory'
import { normalizeStaffIdKey } from '@/lib/staff-id'

export interface ResolvedAudienceMember {
  staffId: string
  staffName: string
  email: string | null
  businessUnit: string | null
}

// Snapshot-at-launch: resolves whatever the survey's audienceType/Value describe into a concrete
// list of staff, right now. Called once, at launch — the result becomes the CustomSurveyRecipient
// rows, not re-evaluated later, so a roster change after launch never adds/removes anyone from an
// already-live survey (create a new one instead).
export async function resolveAudience(
  audienceType: string,
  audienceValue: string | null
): Promise<ResolvedAudienceMember[]> {
  if (audienceType === 'selected') {
    const identifiers: string[] = audienceValue ? JSON.parse(audienceValue) : []
    const directory = await loadRosterDirectory()
    const seen = new Set<string>()
    const out: ResolvedAudienceMember[] = []
    for (const identifier of identifiers) {
      const staff = resolveStaffLoose(identifier, directory)
      if (!staff || !staff.active || seen.has(staff.staffId)) continue
      seen.add(staff.staffId)
      out.push({ staffId: staff.staffId, staffName: staff.name, email: staff.email, businessUnit: staff.businessUnit || null })
    }
    return out
  }

  // Roster uploads accumulate over time — always use each staffId's most recent record, same
  // convention as roster-analytics.ts and staff-directory.ts.
  const all = await prisma.staffRosterRecord.findMany({ orderBy: { createdAt: 'asc' } })
  const latestByStaffId = new Map<string, (typeof all)[number]>()
  for (const r of all) latestByStaffId.set(r.staffId, r)
  let roster = [...latestByStaffId.values()].filter((r) => r.active)

  if (audienceType === 'department') {
    roster = roster.filter((r) => (r.department || '').trim().toLowerCase() === (audienceValue || '').trim().toLowerCase())
  } else if (audienceType === 'role') {
    roster = roster.filter((r) => (r.role || '').trim().toLowerCase() === (audienceValue || '').trim().toLowerCase())
  } else if (audienceType === 'businessUnit') {
    roster = roster.filter((r) => r.businessUnit === audienceValue)
  } // 'all' — no further filtering

  return roster.map((r) => ({
    staffId: r.staffId,
    staffName: [r.firstName, r.middleName, r.lastName].filter(Boolean).join(' '),
    email: r.email,
    businessUnit: r.businessUnit,
  }))
}

export interface LaunchResult {
  recipientCount: number
  sent: number
  skipped: { staffName: string; reason: string }[]
}

// Resolves the audience, creates one CustomSurveyRecipient per person (skips anyone already a
// recipient, in case launch is retried after a partial failure), sends the initial email to
// everyone with an email on file, and marks the survey launched. Recipients with no email are
// still created (so they show up in the admin's recipient list as "no email on file") but can
// never be sent to or reminded.
export async function launchCustomSurvey(survey: CustomSurvey): Promise<LaunchResult> {
  const audience = await resolveAudience(survey.audienceType, survey.audienceValue)

  const existing = await prisma.customSurveyRecipient.findMany({ where: { surveyId: survey.id }, select: { staffId: true } })
  const existingIds = new Set(existing.map((r) => r.staffId))
  const toCreate = audience.filter((a) => !existingIds.has(a.staffId))

  if (toCreate.length > 0) {
    await prisma.customSurveyRecipient.createMany({
      data: toCreate.map((a) => ({
        surveyId: survey.id,
        staffId: a.staffId,
        staffName: a.staffName,
        email: a.email,
        businessUnit: a.businessUnit,
      })),
    })
  }

  await prisma.customSurvey.update({
    where: { id: survey.id },
    data: { status: 'launched', launchedAt: survey.launchedAt || new Date() },
  })

  const recipients = await prisma.customSurveyRecipient.findMany({ where: { surveyId: survey.id, sentAt: null } })
  const result: LaunchResult = { recipientCount: audience.length, sent: 0, skipped: [] }

  if (!(await hasSmtpCredentials())) {
    result.skipped = recipients.map((r) => ({ staffName: r.staffName, reason: 'SMTP is not configured yet.' }))
    return result
  }

  const baseUrl = getAppBaseUrl()
  for (const recipient of recipients) {
    if (!recipient.email) {
      result.skipped.push({ staffName: recipient.staffName, reason: 'No email address on file.' })
      continue
    }
    const { subject, html } = buildCustomSurveyEmail({
      title: survey.title,
      description: survey.description,
      recipientName: recipient.staffName,
      formUrl: `${baseUrl}/survey/custom/${recipient.surveyToken}`,
    })
    try {
      await sendMail({ to: recipient.email, subject, html })
      await prisma.customSurveyRecipient.update({
        where: { id: recipient.id },
        data: { sentAt: new Date(), reminderAt: new Date() },
      })
      result.sent++
    } catch (err) {
      result.skipped.push({ staffName: recipient.staffName, reason: err instanceof Error ? err.message : 'Send failed.' })
    }
  }

  return result
}

export interface AddRecipientsResult {
  added: string[]
  alreadyAdded: string[]
  notFound: string[]
  inactive: string[]
  noEmail: string[]
}

// Adds one or more people to a survey that's ALREADY launched — the original audience is only
// ever resolved once, at launch (see resolveAudience above), so this is the one place someone can
// be added afterward (e.g. a new hire, or someone missed the first time). Mirrors
// launchCustomSurvey's create-then-send shape, just for an ad-hoc identifier list instead of the
// survey's own audienceType/Value. Does not touch the survey's stored audienceType/audienceValue
// (that stays as a record of the original targeting rule) — CustomSurveyRecipient rows are
// already the real source of truth for "who's actually in this survey" post-launch.
export async function addCustomSurveyRecipients(survey: CustomSurvey, identifiers: string[]): Promise<AddRecipientsResult> {
  const directory = await loadRosterDirectory()
  const existing = await prisma.customSurveyRecipient.findMany({ where: { surveyId: survey.id }, select: { staffId: true } })
  const existingKeys = new Set(existing.map((r) => normalizeStaffIdKey(r.staffId)))

  const result: AddRecipientsResult = { added: [], alreadyAdded: [], notFound: [], inactive: [], noEmail: [] }
  const toCreate: ResolvedAudienceMember[] = []

  for (const raw of identifiers) {
    const identifier = raw.trim()
    if (!identifier) continue
    const staff = resolveStaffLoose(identifier, directory)
    if (!staff) { result.notFound.push(identifier); continue }
    if (!staff.active) { result.inactive.push(staff.name); continue }
    const key = normalizeStaffIdKey(staff.staffId)
    if (existingKeys.has(key)) { result.alreadyAdded.push(staff.name); continue }
    existingKeys.add(key)
    toCreate.push({ staffId: staff.staffId, staffName: staff.name, email: staff.email, businessUnit: staff.businessUnit || null })
  }

  if (toCreate.length === 0) return result

  await prisma.customSurveyRecipient.createMany({
    data: toCreate.map((a) => ({ surveyId: survey.id, staffId: a.staffId, staffName: a.staffName, email: a.email, businessUnit: a.businessUnit })),
  })
  result.added = toCreate.map((a) => a.staffName)

  if (!(await hasSmtpCredentials())) return result

  const created = await prisma.customSurveyRecipient.findMany({
    where: { surveyId: survey.id, staffId: { in: toCreate.map((a) => a.staffId) } },
  })
  const baseUrl = getAppBaseUrl()
  for (const recipient of created) {
    if (!recipient.email) { result.noEmail.push(recipient.staffName); continue }
    const { subject, html } = buildCustomSurveyEmail({
      title: survey.title,
      description: survey.description,
      recipientName: recipient.staffName,
      formUrl: `${baseUrl}/survey/custom/${recipient.surveyToken}`,
    })
    try {
      await sendMail({ to: recipient.email, subject, html })
      await prisma.customSurveyRecipient.update({ where: { id: recipient.id }, data: { sentAt: new Date(), reminderAt: new Date() } })
    } catch (err) {
      console.error('[custom-survey] addCustomSurveyRecipients send failed for', recipient.staffId, err)
    }
  }

  return result
}

const DAY_MS = 86400000

export interface ReminderResult {
  sent: number
  skipped: { staffName: string; reason: string }[]
}

// Same daily-calendar-day cadence and expiry semantics as sendSurveyReminders (survey-send.ts) —
// nudges anyone sent this survey who hasn't responded yet, once per day, until they respond or
// the survey's own expiryDays elapses since launch.
export async function sendCustomSurveyReminders(
  survey: CustomSurvey & { recipients: CustomSurveyRecipient[] },
  skipDefaultCc = false
): Promise<ReminderResult> {
  const result: ReminderResult = { sent: 0, skipped: [] }
  if (survey.status !== 'launched') return result
  if (!(await hasSmtpCredentials())) return result

  const now = Date.now()
  const todayKey = new Date(now).toISOString().slice(0, 10)
  const launchedAt = survey.launchedAt?.getTime() ?? now

  const due = survey.recipients.filter((r) => {
    if (!r.sentAt || r.respondedAt) return false
    if (now - launchedAt >= survey.expiryDays * DAY_MS) return false
    const lastNudge = r.reminderAt || r.sentAt
    return lastNudge.toISOString().slice(0, 10) !== todayKey
  })
  if (due.length === 0) return result

  const baseUrl = getAppBaseUrl()
  for (const recipient of due) {
    if (!recipient.email) continue
    const { subject, html } = buildCustomSurveyEmail({
      title: survey.title,
      description: survey.description,
      recipientName: recipient.staffName,
      formUrl: `${baseUrl}/survey/custom/${recipient.surveyToken}`,
      isReminder: true,
    })
    try {
      await sendMail({ to: recipient.email, subject, html, skipDefaultCc })
      await prisma.customSurveyRecipient.update({ where: { id: recipient.id }, data: { reminderAt: new Date() } })
      result.sent++
    } catch (err) {
      result.skipped.push({ staffName: recipient.staffName, reason: err instanceof Error ? err.message : 'Reminder send failed.' })
    }
  }

  return result
}

export function isCustomSurveyExpired(survey: CustomSurvey, sentAt: Date | null): boolean {
  if (!sentAt || !survey.launchedAt) return false
  return Date.now() - survey.launchedAt.getTime() >= survey.expiryDays * DAY_MS
}
