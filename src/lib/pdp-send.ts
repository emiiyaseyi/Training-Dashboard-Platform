import { prisma } from './prisma'
import type { PDPCycle } from '@prisma/client'
import { sendMail, hasSmtpCredentials } from './mailer'
import { getAppBaseUrl } from './app-url'
import { loadRosterDirectory } from './staff-directory'
import { normalizeStaffIdKey } from './staff-id'
import { buildPDPPrefillIndex, getPDPPrefillForStaff } from './pdp-prefill'
import { getAllManagerStaffIds, getTeamMembersForManager, filterStaffByAudience, type PDPAudience } from './pdp-team'
import { firstNameOf, formatDeadline, renderPDPEmail } from './pdp-email'
import { resolvePDPEmailTemplate } from './pdp-email-templates'
import { resolveRespondentSections } from './pdp-form'
import type { PDPFormAnswers } from './pdp-validate'

export interface PDPLaunchResult {
  created: number
  sent: number
  skipped: { name: string; reason: string }[]
}

const DAY_MS_LOCAL = 86400000
// The deadline shown in the email body — expiryDays from whenever this particular send/resend
// goes out, matching the "resending resets the expiry clock" behaviour already shown in the admin
// panel's tick tooltips.
function deadlineFromNow(expiryDays: number): Date {
  return new Date(Date.now() + expiryDays * DAY_MS_LOCAL)
}

// Track A — one PDPStaffSurvey per active staff member with a usable name, prefilled once (via
// the shared index, not a query per person — see pdp-prefill.ts) and emailed. Idempotent: skips
// anyone who already has a row for this cycle, same "createMany only for new rows" convention
// launchCustomSurvey uses, so retrying after a partial failure never re-creates/re-emails someone.
// `requireManagerValidation` is captured onto each new row as a snapshot of what the Launch panel
// had set at the moment of THIS launch — not re-read from the cycle later, so earlier and later
// launches of the same cycle can legitimately carry different settings.
export async function sendPDPStaffSurvey(cycle: PDPCycle, audience: PDPAudience = { type: 'all' }, requireManagerValidation = true): Promise<PDPLaunchResult> {
  const directory = await loadRosterDirectory()
  const activeAll = [...directory.values()].filter((s) => s.active && s.firstName.trim() && s.lastName.trim())
  const active = await filterStaffByAudience(activeAll, audience)

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
        requireManagerValidation,
      })),
    })
  }

  const result: PDPLaunchResult = { created: toCreate.length, sent: 0, skipped: [] }
  if (!(await hasSmtpCredentials())) {
    result.skipped = toCreate.filter((s) => s.email).map((s) => ({ name: s.name, reason: 'SMTP is not configured yet.' }))
    return result
  }

  const baseUrl = getAppBaseUrl()
  const template = await resolvePDPEmailTemplate(cycle.id, 'staffSurvey')
  const unsent = await prisma.pDPStaffSurvey.findMany({ where: { cycleId: cycle.id, sentAt: null } })
  for (const survey of unsent) {
    if (!survey.email) {
      result.skipped.push({ name: survey.staffName, reason: 'No email address on file.' })
      continue
    }
    const { subject, html } = renderPDPEmail('staffSurvey', template, {
      firstName: firstNameOf(survey.staffName), cycleTitle: cycle.title, deadline: formatDeadline(deadlineFromNow(cycle.expiryDays)),
    }, `${baseUrl}/survey/pdp/${survey.surveyToken}`)
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

// Triggered once a PDPStaffSurvey is submitted (see the submit route), and also callable directly
// by the admin panel's "Send/Resend Manager Validation Emails" bulk action for anyone who missed
// their auto-trigger. One PDPManagerValidation row+email per line manager found for this staff
// member (their own lineManagerStaffId, plus any PDPManagerOverride second manager for this
// cycle), so a dual-reporting staff member's plan gets two independent validation links, neither
// overwriting the other. A validation row that already exists but never actually sent (a prior
// send attempt failed) is retried here rather than skipped, so this is safe — and useful — to call
// again for the same staffSurveyId.
export async function sendPDPManagerValidation(staffSurveyId: string): Promise<{ sent: number; skipped: { name: string; reason: string }[] }> {
  const result = { sent: 0, skipped: [] as { name: string; reason: string }[] }
  const survey = await prisma.pDPStaffSurvey.findUnique({ where: { id: staffSurveyId } })
  if (!survey) return result

  const directory = await loadRosterDirectory()
  const staff = directory.get(normalizeStaffIdKey(survey.staffId))
  const managerIds = new Set<string>()
  if (staff?.lineManagerStaffId) managerIds.add(normalizeStaffIdKey(staff.lineManagerStaffId))
  const overrides = await prisma.pDPManagerOverride.findMany({ where: { cycleId: survey.cycleId, staffId: survey.staffId } })
  for (const o of overrides) managerIds.add(normalizeStaffIdKey(o.secondManagerStaffId))
  if (managerIds.size === 0) return result

  const existing = await prisma.pDPManagerValidation.findMany({ where: { staffSurveyId } })
  const existingByKey = new Map(existing.map((r) => [normalizeStaffIdKey(r.managerStaffId), r]))

  const cycle = await prisma.pDPCycle.findUnique({ where: { id: survey.cycleId } })
  if (!cycle) return result
  const canSend = await hasSmtpCredentials()
  if (!canSend) {
    result.skipped.push({ name: survey.staffName, reason: 'SMTP is not configured yet.' })
    return result
  }
  const baseUrl = getAppBaseUrl()
  const template = await resolvePDPEmailTemplate(cycle.id, 'managerValidation')

  for (const managerKey of managerIds) {
    const alreadySent = existingByKey.get(managerKey)
    if (alreadySent?.sentAt) continue // a real send already went out for this manager — never re-send silently here

    const manager = directory.get(managerKey)
    const validation = alreadySent ?? await prisma.pDPManagerValidation.create({
      data: {
        staffSurveyId,
        managerStaffId: manager?.staffId ?? managerKey,
        managerName: manager?.name ?? null,
        email: manager?.email ?? null,
      },
    })
    if (!manager?.email) {
      result.skipped.push({ name: manager?.name || survey.staffName, reason: 'No email address on file for this manager.' })
      continue
    }
    const { subject, html } = renderPDPEmail('managerValidation', template, {
      firstName: firstNameOf(manager.name), staffName: survey.staffName, cycleTitle: cycle.title, deadline: formatDeadline(deadlineFromNow(cycle.expiryDays)),
    }, `${baseUrl}/survey/pdp-validate/${validation.surveyToken}`)
    try {
      await sendMail({ to: manager.email, subject, html })
      await prisma.pDPManagerValidation.update({ where: { id: validation.id }, data: { sentAt: new Date(), reminderAt: new Date() } })
      result.sent++
    } catch (err) {
      result.skipped.push({ name: manager.name, reason: err instanceof Error ? err.message : 'Send failed.' })
    }
  }
  return result
}

// Track B — one PDPManagerSurvey per distinct manager, with one PDPManagerTeamMemberEntry per
// direct report found via getTeamMembersForManager (status "pending" until the manager accepts/
// declines them on the roster-review page). No staff self-fill prerequisite.
export async function sendPDPManagerSurvey(cycle: PDPCycle, audience: PDPAudience = { type: 'all' }): Promise<PDPLaunchResult> {
  const directory = await loadRosterDirectory()
  const managerIds = await getAllManagerStaffIds(cycle.id)
  // Audience filters WHICH MANAGERS get launched to, by the manager's own BU/department (or an
  // explicit selected list) — same filterStaffByAudience helper Track A uses, applied to the
  // manager's own roster entry rather than their team members'.
  const managerCandidates = managerIds.map((k) => directory.get(k)).filter((s): s is NonNullable<typeof s> => !!s)
  const filteredManagers = await filterStaffByAudience(managerCandidates, audience)
  const filteredKeys = new Set(filteredManagers.map((s) => normalizeStaffIdKey(s.staffId)))
  const audienceFilteredManagerIds = audience.type === 'all' ? managerIds : managerIds.filter((k) => filteredKeys.has(k))

  const existing = await prisma.pDPManagerSurvey.findMany({ where: { cycleId: cycle.id }, select: { managerStaffId: true } })
  const existingKeys = new Set(existing.map((r) => normalizeStaffIdKey(r.managerStaffId)))
  const toCreateKeys = audienceFilteredManagerIds.filter((k) => !existingKeys.has(k))

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
  const template = await resolvePDPEmailTemplate(cycle.id, 'managerTeam')
  const unsent = await prisma.pDPManagerSurvey.findMany({ where: { cycleId: cycle.id, sentAt: null } })
  for (const survey of unsent) {
    if (!survey.email) {
      result.skipped.push({ name: survey.managerName, reason: 'No email address on file.' })
      continue
    }
    const { subject, html } = renderPDPEmail('managerTeam', template, {
      firstName: firstNameOf(survey.managerName), cycleTitle: cycle.title, deadline: formatDeadline(deadlineFromNow(cycle.expiryDays)),
    }, `${baseUrl}/survey/pdp-manager/${survey.surveyToken}`)
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

const DAY_MS = 86400000

// Calendar-day cadence, same convention as sendCustomSurveyReminders and the Post-1/Post-2
// training-survey reminders — once per day the cron runs, for anyone sent-but-not-responded, until
// they respond or the cycle's expiryDays (default 30, same concept as Pre-Training's expiry)
// passes since their original send. Covers all three PDP tracks in one call from the daily cron.
export async function sendPDPReminders(): Promise<{ sent: number }> {
  if (!(await hasSmtpCredentials())) return { sent: 0 }
  const now = Date.now()
  const todayKey = new Date().toISOString().slice(0, 10)
  let sent = 0
  const baseUrl = getAppBaseUrl()
  const isExpired = (sentAt: Date, expiryDays: number) => now - sentAt.getTime() >= expiryDays * DAY_MS
  const templateCache = new Map<string, Awaited<ReturnType<typeof resolvePDPEmailTemplate>>>()
  const getTemplate = async (cycleId: string, kind: Parameters<typeof resolvePDPEmailTemplate>[1]) => {
    const key = `${cycleId}:${kind}`
    if (!templateCache.has(key)) templateCache.set(key, await resolvePDPEmailTemplate(cycleId, kind))
    return templateCache.get(key)!
  }

  const staffDue = await prisma.pDPStaffSurvey.findMany({
    where: { sentAt: { not: null }, respondedAt: null, email: { not: null } },
    include: { cycle: true },
  })
  for (const s of staffDue) {
    if (isExpired(s.sentAt!, s.cycle.expiryDays)) continue
    const last = s.reminderAt || s.sentAt!
    if (last.toISOString().slice(0, 10) === todayKey) continue
    const template = await getTemplate(s.cycleId, 'staffSurvey')
    const { subject, html } = renderPDPEmail('staffSurvey', template, {
      firstName: firstNameOf(s.staffName), cycleTitle: s.cycle.title, deadline: formatDeadline(deadlineFromNow(s.cycle.expiryDays)),
    }, `${baseUrl}/survey/pdp/${s.surveyToken}`, true)
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
    if (isExpired(v.sentAt!, v.staffSurvey.cycle.expiryDays)) continue
    const last = v.reminderAt || v.sentAt!
    if (last.toISOString().slice(0, 10) === todayKey) continue
    const template = await getTemplate(v.staffSurvey.cycleId, 'managerValidation')
    const { subject, html } = renderPDPEmail('managerValidation', template, {
      firstName: firstNameOf(v.managerName || 'there'), staffName: v.staffSurvey.staffName, cycleTitle: v.staffSurvey.cycle.title,
      deadline: formatDeadline(deadlineFromNow(v.staffSurvey.cycle.expiryDays)),
    }, `${baseUrl}/survey/pdp-validate/${v.surveyToken}`, true)
    try {
      await sendMail({ to: v.email!, subject, html })
      await prisma.pDPManagerValidation.update({ where: { id: v.id }, data: { reminderAt: new Date() } })
      sent++
    } catch { /* left for the next run */ }
  }

  const managerSurveysDue = await prisma.pDPManagerSurvey.findMany({
    where: { sentAt: { not: null }, respondedAt: null, email: { not: null }, disabled: false },
    include: { cycle: true },
  })
  for (const m of managerSurveysDue) {
    if (isExpired(m.sentAt!, m.cycle.expiryDays)) continue
    const last = m.reminderAt || m.sentAt!
    if (last.toISOString().slice(0, 10) === todayKey) continue
    const template = await getTemplate(m.cycleId, 'managerTeam')
    const { subject, html } = renderPDPEmail('managerTeam', template, {
      firstName: firstNameOf(m.managerName), cycleTitle: m.cycle.title, deadline: formatDeadline(deadlineFromNow(m.cycle.expiryDays)),
    }, `${baseUrl}/survey/pdp-manager/${m.surveyToken}`, true)
    try {
      await sendMail({ to: m.email!, subject, html })
      await prisma.pDPManagerSurvey.update({ where: { id: m.id }, data: { reminderAt: new Date() } })
      sent++
    } catch { /* left for the next run */ }
  }

  return { sent }
}

function recapValue(v: string | string[] | undefined): string {
  if (v == null) return '—'
  return Array.isArray(v) ? (v.join(', ') || '—') : v
}

// Flattens a finalized PDPFormAnswers into a simple HTML Q&A table for the completion email —
// the recipient's actual inbox copy of what was agreed, not a link to click through to (neither
// the staff member nor, after responding, the manager has a page left to view it on).
function renderPDPAnswersRecap(sections: Awaited<ReturnType<typeof resolveRespondentSections>>, answers: PDPFormAnswers): string {
  const rows: string[] = []
  for (const section of sections) {
    if (section.key === 'development_needs') {
      answers.developmentNeeds.forEach((need, i) => {
        rows.push(`<tr><td colspan="2" style="padding:10px 0 2px 0;font-weight:700;">Development Need ${i + 1}</td></tr>`)
        for (const q of section.questions) {
          rows.push(`<tr><td style="padding:2px 12px 2px 0;color:#6B7280;vertical-align:top;">${q.label}</td><td style="padding:2px 0;">${recapValue(need[q.id])}</td></tr>`)
        }
      })
    } else {
      rows.push(`<tr><td colspan="2" style="padding:10px 0 2px 0;font-weight:700;">${section.title}</td></tr>`)
      for (const q of section.questions) {
        rows.push(`<tr><td style="padding:2px 12px 2px 0;color:#6B7280;vertical-align:top;">${q.label}</td><td style="padding:2px 0;">${recapValue(answers.answers[q.id])}</td></tr>`)
      }
    }
  }
  return `<table style="width:100%;font-size:12px;border-collapse:collapse;">${rows.join('')}</table>`
}

// Sent once a line manager finalizes their review — a copy of the agreed plan to BOTH the staff
// member and the manager, so neither needs a live link to see what was actually submitted.
export async function sendPDPValidationCompleteEmails(validationId: string): Promise<void> {
  if (!(await hasSmtpCredentials())) return
  const validation = await prisma.pDPManagerValidation.findUnique({
    where: { id: validationId },
    include: { staffSurvey: { include: { cycle: true } } },
  })
  if (!validation || !validation.editedAnswers) return

  const editedAnswers = JSON.parse(validation.editedAnswers) as PDPFormAnswers
  const sections = await resolveRespondentSections(validation.staffSurvey.cycleId)
  const recap = renderPDPAnswersRecap(sections, editedAnswers)
  const subject = `${validation.staffSurvey.cycle.title} — Finalized for ${validation.staffSurvey.staffName}`
  const html = `
    <div style="font-family: Tahoma, Geneva, sans-serif; font-size: 12px; color: #1B1F3B; max-width: 620px;">
      <p style="margin:0 0 14px 0;">
        ${validation.managerName || 'The line manager'} has reviewed and finalized this Personal Development Plan. A copy of the agreed plan is below for your records.
      </p>
      ${recap}
      <p style="margin:14px 0 0 0;color:#6B7280;">Regards,<br/>Learning &amp; Development</p>
    </div>
  `
  // One email, both addressed on it (staff as primary "to", manager cc'd) — so each sees the
  // other was actually copied, rather than two separate unaware sends.
  const to = validation.staffSurvey.email
  const cc = validation.email ? [validation.email] : undefined
  if (!to && !cc) return
  try {
    await sendMail({ to: to || validation.email!, cc: to ? cc : undefined, subject, html })
  } catch (err) {
    console.error('[sendPDPValidationCompleteEmails]', err)
  }
}
