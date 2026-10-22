import { prisma } from './prisma'
import type { PDPCycle } from '@prisma/client'
import { sendMail, hasSmtpCredentials } from './mailer'
import { getAppBaseUrl } from './app-url'
import { loadRosterDirectory } from './staff-directory'
import { normalizeStaffIdKey } from './staff-id'
import { buildPDPPrefillIndex, getPDPPrefillForStaff } from './pdp-prefill'
import { getAllManagerStaffIds, getTeamMembersForManager } from './pdp-team'
import { buildPDPStaffEmail, buildPDPManagerValidationEmail, buildPDPManagerTeamEmail } from './pdp-email'

export interface PDPLaunchResult {
  created: number
  sent: number
  skipped: { name: string; reason: string }[]
}

// Track A — one PDPStaffSurvey per active staff member with a usable name, prefilled once (via
// the shared index, not a query per person — see pdp-prefill.ts) and emailed. Idempotent: skips
// anyone who already has a row for this cycle, same "createMany only for new rows" convention
// launchCustomSurvey uses, so retrying after a partial failure never re-creates/re-emails someone.
export async function sendPDPStaffSurvey(cycle: PDPCycle): Promise<PDPLaunchResult> {
  const directory = await loadRosterDirectory()
  const active = [...directory.values()].filter((s) => s.active && s.firstName.trim() && s.lastName.trim())

  const existing = await prisma.pDPStaffSurvey.findMany({ where: { cycleId: cycle.id }, select: { staffId: true } })
  const existingKeys = new Set(existing.map((r) => normalizeStaffIdKey(r.staffId)))
  const toCreate = active.filter((s) => !existingKeys.has(normalizeStaffIdKey(s.staffId)))

  const prefillIndex = await buildPDPPrefillIndex()
  if (toCreate.length > 0) {
    await prisma.pDPStaffSurvey.createMany({
      data: toCreate.map((s) => ({
        cycleId: cycle.id,
        staffId: s.staffId,
        staffName: s.name,
        email: s.email,
        businessUnit: s.businessUnit,
        department: null,
        role: s.role,
        prefillSnapshot: JSON.stringify(getPDPPrefillForStaff(prefillIndex, s.staffId)),
      })),
    })
  }

  const result: PDPLaunchResult = { created: toCreate.length, sent: 0, skipped: [] }
  if (!(await hasSmtpCredentials())) {
    result.skipped = toCreate.filter((s) => s.email).map((s) => ({ name: s.name, reason: 'SMTP is not configured yet.' }))
    return result
  }

  const baseUrl = getAppBaseUrl()
  const unsent = await prisma.pDPStaffSurvey.findMany({ where: { cycleId: cycle.id, sentAt: null } })
  for (const survey of unsent) {
    if (!survey.email) {
      result.skipped.push({ name: survey.staffName, reason: 'No email address on file.' })
      continue
    }
    const { subject, html } = buildPDPStaffEmail({ cycleTitle: cycle.title, recipientName: survey.staffName, formUrl: `${baseUrl}/survey/pdp/${survey.surveyToken}` })
    try {
      await sendMail({ to: survey.email, subject, html })
      await prisma.pDPStaffSurvey.update({ where: { id: survey.id }, data: { sentAt: new Date(), reminderAt: new Date() } })
      result.sent++
    } catch (err) {
      result.skipped.push({ name: survey.staffName, reason: err instanceof Error ? err.message : 'Send failed.' })
    }
  }
  return result
}

// Triggered once a PDPStaffSurvey is submitted (see the submit route) — one PDPManagerValidation
// row+email per line manager found for this staff member (their own lineManagerStaffId, plus any
// PDPManagerOverride second manager for this cycle), so a dual-reporting staff member's plan gets
// two independent validation links, neither overwriting the other.
export async function sendPDPManagerValidation(staffSurveyId: string): Promise<void> {
  const survey = await prisma.pDPStaffSurvey.findUnique({ where: { id: staffSurveyId } })
  if (!survey) return

  const directory = await loadRosterDirectory()
  const staff = directory.get(normalizeStaffIdKey(survey.staffId))
  const managerIds = new Set<string>()
  if (staff?.lineManagerStaffId) managerIds.add(normalizeStaffIdKey(staff.lineManagerStaffId))
  const overrides = await prisma.pDPManagerOverride.findMany({ where: { cycleId: survey.cycleId, staffId: survey.staffId } })
  for (const o of overrides) managerIds.add(normalizeStaffIdKey(o.secondManagerStaffId))
  if (managerIds.size === 0) return

  const existing = await prisma.pDPManagerValidation.findMany({ where: { staffSurveyId }, select: { managerStaffId: true } })
  const existingKeys = new Set(existing.map((r) => normalizeStaffIdKey(r.managerStaffId)))

  const cycle = await prisma.pDPCycle.findUnique({ where: { id: survey.cycleId } })
  if (!cycle) return
  const canSend = await hasSmtpCredentials()
  const baseUrl = getAppBaseUrl()

  for (const managerKey of managerIds) {
    if (existingKeys.has(managerKey)) continue
    const manager = directory.get(managerKey)
    const validation = await prisma.pDPManagerValidation.create({
      data: {
        staffSurveyId,
        managerStaffId: manager?.staffId ?? managerKey,
        managerName: manager?.name ?? null,
        email: manager?.email ?? null,
      },
    })
    if (!canSend || !manager?.email) continue
    const { subject, html } = buildPDPManagerValidationEmail({
      cycleTitle: cycle.title,
      staffName: survey.staffName,
      managerName: manager.name,
      formUrl: `${baseUrl}/survey/pdp-validate/${validation.surveyToken}`,
    })
    try {
      await sendMail({ to: manager.email, subject, html })
      await prisma.pDPManagerValidation.update({ where: { id: validation.id }, data: { sentAt: new Date(), reminderAt: new Date() } })
    } catch {
      // Left unsent — the admin panel surfaces rows with no sentAt as "not sent", and a later
      // manual resend / the daily cron can pick it up; a validation row with no email on file
      // behaves the same way (visible, never silently dropped).
    }
  }
}

// Track B — one PDPManagerSurvey per distinct manager, with one PDPManagerTeamMemberEntry per
// direct report found via getTeamMembersForManager (status "pending" until the manager accepts/
// declines them on the roster-review page). No staff self-fill prerequisite.
export async function sendPDPManagerSurvey(cycle: PDPCycle): Promise<PDPLaunchResult> {
  const directory = await loadRosterDirectory()
  const managerIds = await getAllManagerStaffIds(cycle.id)

  const existing = await prisma.pDPManagerSurvey.findMany({ where: { cycleId: cycle.id }, select: { managerStaffId: true } })
  const existingKeys = new Set(existing.map((r) => normalizeStaffIdKey(r.managerStaffId)))
  const toCreateKeys = managerIds.filter((k) => !existingKeys.has(k))

  const result: PDPLaunchResult = { created: 0, sent: 0, skipped: [] }
  for (const key of toCreateKeys) {
    const manager = directory.get(key)
    const team = await getTeamMembersForManager(cycle.id, key)
    if (team.length === 0) continue // nobody reports to this person for this cycle — nothing to send
    const survey = await prisma.pDPManagerSurvey.create({
      data: {
        cycleId: cycle.id,
        managerStaffId: manager?.staffId ?? key,
        managerName: manager?.name ?? key,
        email: manager?.email ?? null,
      },
    })
    await prisma.pDPManagerTeamMemberEntry.createMany({
      data: team.map((t) => ({
        managerSurveyId: survey.id,
        staffId: t.staffId,
        staffName: t.name,
        businessUnit: t.businessUnit,
        role: t.role,
        status: 'pending',
      })),
    })
    result.created++
  }

  if (!(await hasSmtpCredentials())) {
    const unsent = await prisma.pDPManagerSurvey.findMany({ where: { cycleId: cycle.id, sentAt: null } })
    result.skipped = unsent.map((s) => ({ name: s.managerName, reason: 'SMTP is not configured yet.' }))
    return result
  }

  const baseUrl = getAppBaseUrl()
  const unsent = await prisma.pDPManagerSurvey.findMany({ where: { cycleId: cycle.id, sentAt: null } })
  for (const survey of unsent) {
    if (!survey.email) {
      result.skipped.push({ name: survey.managerName, reason: 'No email address on file.' })
      continue
    }
    const { subject, html } = buildPDPManagerTeamEmail({ cycleTitle: cycle.title, managerName: survey.managerName, formUrl: `${baseUrl}/survey/pdp-manager/${survey.surveyToken}` })
    try {
      await sendMail({ to: survey.email, subject, html })
      await prisma.pDPManagerSurvey.update({ where: { id: survey.id }, data: { sentAt: new Date(), reminderAt: new Date() } })
      result.sent++
    } catch (err) {
      result.skipped.push({ name: survey.managerName, reason: err instanceof Error ? err.message : 'Send failed.' })
    }
  }
  return result
}

// Calendar-day cadence, same convention as sendCustomSurveyReminders and the Post-1/Post-2
// training-survey reminders — once per day the cron runs, for anyone sent-but-not-responded, until
// they respond. Covers all three PDP tracks in one call from the daily cron.
export async function sendPDPReminders(): Promise<{ sent: number }> {
  if (!(await hasSmtpCredentials())) return { sent: 0 }
  const todayKey = new Date().toISOString().slice(0, 10)
  let sent = 0
  const baseUrl = getAppBaseUrl()

  const staffDue = await prisma.pDPStaffSurvey.findMany({
    where: { sentAt: { not: null }, respondedAt: null, email: { not: null } },
    include: { cycle: true },
  })
  for (const s of staffDue) {
    const last = s.reminderAt || s.sentAt!
    if (last.toISOString().slice(0, 10) === todayKey) continue
    const { subject, html } = buildPDPStaffEmail({ cycleTitle: s.cycle.title, recipientName: s.staffName, formUrl: `${baseUrl}/survey/pdp/${s.surveyToken}`, isReminder: true })
    try {
      await sendMail({ to: s.email!, subject, html })
      await prisma.pDPStaffSurvey.update({ where: { id: s.id }, data: { reminderAt: new Date() } })
      sent++
    } catch { /* left for the next run */ }
  }

  const validationsDue = await prisma.pDPManagerValidation.findMany({
    where: { sentAt: { not: null }, respondedAt: null, email: { not: null } },
    include: { staffSurvey: { include: { cycle: true } } },
  })
  for (const v of validationsDue) {
    const last = v.reminderAt || v.sentAt!
    if (last.toISOString().slice(0, 10) === todayKey) continue
    const { subject, html } = buildPDPManagerValidationEmail({
      cycleTitle: v.staffSurvey.cycle.title, staffName: v.staffSurvey.staffName, managerName: v.managerName || 'there',
      formUrl: `${baseUrl}/survey/pdp-validate/${v.surveyToken}`, isReminder: true,
    })
    try {
      await sendMail({ to: v.email!, subject, html })
      await prisma.pDPManagerValidation.update({ where: { id: v.id }, data: { reminderAt: new Date() } })
      sent++
    } catch { /* left for the next run */ }
  }

  const managerSurveysDue = await prisma.pDPManagerSurvey.findMany({
    where: { sentAt: { not: null }, respondedAt: null, email: { not: null } },
    include: { cycle: true },
  })
  for (const m of managerSurveysDue) {
    const last = m.reminderAt || m.sentAt!
    if (last.toISOString().slice(0, 10) === todayKey) continue
    const { subject, html } = buildPDPManagerTeamEmail({ cycleTitle: m.cycle.title, managerName: m.managerName, formUrl: `${baseUrl}/survey/pdp-manager/${m.surveyToken}`, isReminder: true })
    try {
      await sendMail({ to: m.email!, subject, html })
      await prisma.pDPManagerSurvey.update({ where: { id: m.id }, data: { reminderAt: new Date() } })
      sent++
    } catch { /* left for the next run */ }
  }

  return { sent }
}
