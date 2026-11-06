import { prisma } from '@/lib/prisma'
import { sendMail, parseCcList } from '@/lib/mailer'
import { loadRosterDirectory, resolveStaff, resolveStaffLooseAny } from '@/lib/staff-directory'
import { normalizeStaffIdKey } from '@/lib/staff-id'

// Talent Management's Celebrations mail — birthday and work-anniversary emails to active Talent
// Members, on an admin-editable template, sent automatically once a day (folded into the existing
// daily cron sweep, not its own scheduled trigger) and idempotent per person/type/calendar-year
// via TMCelebrationSendLog, so a cron re-run never double-sends.

export const DEFAULT_SENDER_NAME = 'Human Resources'
export const DEFAULT_FROM_ADDRESS = 'hr@meristemng.com'

export const DEFAULT_BIRTHDAY_SUBJECT = 'Talent Management Birthday Celebration!!!'
export const DEFAULT_BIRTHDAY_BODY = `Dear {firstname},

On behalf of the Talent Management Programme (TMP), we wish you a very happy birthday and a beautiful year ahead.

As a small token of our appreciation, we would love for you to take some time to celebrate and enjoy your special day. A sum of ₦150,000 has been set aside towards your birthday celebration, and you may choose to celebrate at any restaurant of your choice. You can send the receipt to us after your celebration, and we will take care of the reimbursement.

We hope you have a lovely celebration filled with laughter, and moments to remember. You deserve to be celebrated, and we are pleased to share a little part of your special day with you.

Wishing you a fulfilling year ahead, and many more reasons to celebrate.

Warm regards,
Talent Management Secretariat`

// Draft, per the user's request ("do a draft for me") — editable in the admin panel like the
// birthday template. {years} is the whole number of years since dojMeristem (or, if that's unset
// for this person, StaffRosterRecord.employmentDate).
export const DEFAULT_ANNIVERSARY_SUBJECT = 'Happy Work Anniversary from the Talent Management Programme!'
export const DEFAULT_ANNIVERSARY_BODY = `Dear {firstname},

Today marks {years} year(s) since you joined Meristem, and the Talent Management Programme (TMP) would like to join in celebrating this milestone with you.

Thank you for the commitment, growth, and impact you've brought to the organisation over this time. We're proud to have you as part of the Talent Management family and look forward to seeing even more of what you'll achieve in the year ahead.

Here's to more growth, more wins, and many more years of a fulfilling journey with Meristem.

Congratulations, and happy work anniversary!

Warm regards,
Talent Management Secretariat`

export type CelebrationType = 'birthday' | 'anniversary'

export interface CelebrationSettings {
  id: string
  senderName: string
  fromAddress: string | null
  ccEmails: string | null
  birthdaySubject: string
  birthdayBody: string
  birthdayEnabled: boolean
  anniversarySubject: string
  anniversaryBody: string
  anniversaryEnabled: boolean
}

export async function getCelebrationSettings(): Promise<CelebrationSettings> {
  const existing = await prisma.tMCelebrationSettings.findFirst()
  if (existing) return existing
  return prisma.tMCelebrationSettings.create({
    data: {
      senderName: DEFAULT_SENDER_NAME,
      fromAddress: DEFAULT_FROM_ADDRESS,
      birthdaySubject: DEFAULT_BIRTHDAY_SUBJECT,
      birthdayBody: DEFAULT_BIRTHDAY_BODY,
      anniversarySubject: DEFAULT_ANNIVERSARY_SUBJECT,
      anniversaryBody: DEFAULT_ANNIVERSARY_BODY,
    },
  })
}

export async function saveCelebrationSettings(data: {
  senderName: string
  fromAddress: string | null
  ccEmails: string | null
  birthdaySubject: string
  birthdayBody: string
  birthdayEnabled: boolean
  anniversarySubject: string
  anniversaryBody: string
  anniversaryEnabled: boolean
}): Promise<CelebrationSettings> {
  const existing = await getCelebrationSettings()
  return prisma.tMCelebrationSettings.update({ where: { id: existing.id }, data })
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function renderTemplate(body: string, vars: Record<string, string>): string {
  let out = body
  for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(v)
  return out
}

// Plain-text template (blank line = new paragraph, single newline = line break within one) ->
// the HTML fragment mailer.ts's wrapHtmlDocument expects — matches how every admin-editable body
// in this codebase is authored (a textarea, not a rich-text editor).
function textToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((para) => `<p>${escapeHtml(para).split('\n').join('<br/>')}</p>`)
    .join('\n')
}

// Africa/Lagos (WAT) has no DST — a fixed UTC+1 offset is exact, not an approximation.
function lagosTodayMonthDay(): { month: number; day: number } {
  const lagos = new Date(Date.now() + 60 * 60 * 1000)
  return { month: lagos.getUTCMonth() + 1, day: lagos.getUTCDate() }
}

function matchesMonthDay(d: Date | null, month: number, day: number): boolean {
  if (!d) return false
  return d.getUTCMonth() + 1 === month && d.getUTCDate() === day
}

interface Candidate {
  staffId: string
  firstName: string
  email: string | null
  dateOfBirth: Date | null
  anniversaryDate: Date | null
}

// Every active (non-Exited) Talent Member, resolved against the current Staff Roster for the
// fields that roster alone carries (date of birth) — same resolution the rest of the TM roster
// already relies on (resolveStaffLooseAny), so a person only shows up here if they'd also show up
// as a current Talent Member anywhere else in the app.
async function getActiveCandidates(): Promise<Candidate[]> {
  const [entries, directory, rosterRecords] = await Promise.all([
    prisma.talentMemberInfo.findMany({ where: { status: { not: 'Exited' } } }),
    loadRosterDirectory(),
    prisma.staffRosterRecord.findMany({ orderBy: { createdAt: 'asc' } }),
  ])
  const latestRosterByKey = new Map<string, (typeof rosterRecords)[number]>()
  for (const r of rosterRecords) latestRosterByKey.set(normalizeStaffIdKey(r.staffId), r)

  const out: Candidate[] = []
  const seen = new Set<string>()
  for (const e of entries) {
    const match = resolveStaffLooseAny(e, directory)
    if (!match) continue
    const key = normalizeStaffIdKey(match.staffId)
    if (seen.has(key)) continue
    seen.add(key)
    const roster = latestRosterByKey.get(key)
    out.push({
      staffId: match.staffId,
      firstName: match.firstName || match.name.split(' ')[0] || match.name,
      email: match.email,
      dateOfBirth: roster?.dateOfBirth ?? null,
      anniversaryDate: e.dojMeristem ?? roster?.employmentDate ?? null,
    })
  }
  return out
}

async function buildAndSend(
  settings: CelebrationSettings,
  type: CelebrationType,
  to: string,
  vars: Record<string, string>
): Promise<void> {
  const subject = type === 'birthday' ? settings.birthdaySubject : settings.anniversarySubject
  const body = type === 'birthday' ? settings.birthdayBody : settings.anniversaryBody
  await sendMail({
    to,
    cc: parseCcList(settings.ccEmails),
    subject: renderTemplate(subject, vars),
    html: textToHtml(renderTemplate(body, vars)),
    fromName: settings.senderName,
    fromAddress: settings.fromAddress || undefined,
    skipDefaultCc: true, // this section's own Cc list stands in for the platform default, same convention as the New Hire Experience Survey
  })
}

// If `to` is a real employee's email, the test uses their actual first name (and, for anniversary,
// their actual years of service) instead of a generic placeholder — so what the admin sees in the
// test is a true preview of what that person would actually receive, not just the template shape.
export async function sendTestCelebrationEmail(type: CelebrationType, to: string): Promise<void> {
  const settings = await getCelebrationSettings()
  const directory = await loadRosterDirectory()
  const match = resolveStaff(to, directory)

  let vars: Record<string, string>
  if (!match) {
    vars = type === 'birthday' ? { firstname: 'Test' } : { firstname: 'Test', years: '3' }
  } else {
    const firstname = match.firstName || match.name.split(' ')[0] || match.name
    if (type === 'birthday') {
      vars = { firstname }
    } else {
      const key = normalizeStaffIdKey(match.staffId)
      const [tmEntries, roster] = await Promise.all([
        prisma.talentMemberInfo.findMany(),
        prisma.staffRosterRecord.findFirst({ where: { staffId: match.staffId }, orderBy: { createdAt: 'desc' } }),
      ])
      const tmEntry = tmEntries.find((e) => normalizeStaffIdKey(resolveStaffLooseAny(e, directory)?.staffId || '') === key)
      const anniversaryDate = tmEntry?.dojMeristem ?? roster?.employmentDate ?? null
      const years = anniversaryDate ? Math.max(1, new Date().getUTCFullYear() - anniversaryDate.getUTCFullYear()) : 3
      vars = { firstname, years: String(years) }
    }
  }
  await buildAndSend(settings, type, to, vars)
}

export interface CelebrationSweepResult {
  birthdaysSent: number
  anniversariesSent: number
  errors: string[]
}

// The daily sweep — folded into the existing cron rather than a dedicated trigger (confirmed
// acceptable: ~8am WAT, not exactly 9am). Evaluates every active Talent Member every time it
// runs; TMCelebrationSendLog's (staffId, type, year) unique constraint is what actually prevents
// a duplicate send, not the sweep's own daily cadence.
export async function sendDueTMCelebrationEmails(): Promise<CelebrationSweepResult> {
  const { month, day } = lagosTodayMonthDay()
  const year = new Date(Date.now() + 60 * 60 * 1000).getUTCFullYear()
  const [settings, candidates] = await Promise.all([getCelebrationSettings(), getActiveCandidates()])

  let birthdaysSent = 0
  let anniversariesSent = 0
  const errors: string[] = []

  for (const c of candidates) {
    if (!c.email) continue

    if (settings.birthdayEnabled && matchesMonthDay(c.dateOfBirth, month, day)) {
      try {
        // Claims the idempotency slot BEFORE sending — a unique-constraint failure here means
        // this person's birthday mail already went out this year (expected, silent), so the send
        // is skipped entirely rather than risking a duplicate.
        await prisma.tMCelebrationSendLog.create({ data: { staffId: c.staffId, staffName: c.firstName, type: 'birthday', year } })
        await buildAndSend(settings, 'birthday', c.email, { firstname: c.firstName })
        birthdaysSent++
      } catch (err) {
        if (!isUniqueConstraintError(err)) {
          errors.push(`Birthday mail to ${c.staffId}: ${err instanceof Error ? err.message : 'failed'}`)
          // The send itself may have failed after the slot was claimed (e.g. SMTP error) — clear
          // it so tomorrow's sweep retries instead of silently skipping this person for the year.
          await prisma.tMCelebrationSendLog.deleteMany({ where: { staffId: c.staffId, type: 'birthday', year } }).catch(() => {})
        }
      }
    }

    if (settings.anniversaryEnabled && matchesMonthDay(c.anniversaryDate, month, day)) {
      const years = year - (c.anniversaryDate as Date).getUTCFullYear()
      if (years > 0) {
        try {
          await prisma.tMCelebrationSendLog.create({ data: { staffId: c.staffId, staffName: c.firstName, type: 'anniversary', year } })
          await buildAndSend(settings, 'anniversary', c.email, { firstname: c.firstName, years: String(years) })
          anniversariesSent++
        } catch (err) {
          if (!isUniqueConstraintError(err)) {
            errors.push(`Anniversary mail to ${c.staffId}: ${err instanceof Error ? err.message : 'failed'}`)
            await prisma.tMCelebrationSendLog.deleteMany({ where: { staffId: c.staffId, type: 'anniversary', year } }).catch(() => {})
          }
        }
      }
    }
  }

  await prisma.tMCelebrationSweepRun.create({
    data: { birthdaysSent, anniversariesSent, errors: errors.length > 0 ? errors.join('; ') : null },
  })

  return { birthdaysSent, anniversariesSent, errors }
}

export interface UpcomingCelebration {
  staffId: string
  name: string
  month: number
  day: number
  daysAway: number
}

export interface UpcomingAnniversary extends UpcomingCelebration {
  years: number
}

const DAY_MS = 24 * 60 * 60 * 1000

// Next occurrence of a (month, day) from "today" (Lagos midnight) — 0 if it's today, otherwise
// days until it next comes around (wrapping to next year if this year's date has already passed).
// Returns the occurrence's own calendar year too, since the anniversary "years" count depends on
// which year it next falls in, not just how many days away it is.
function nextOccurrence(month: number, day: number, today: Date): { daysAway: number; year: number } {
  const todayAtMidnight = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
  let next = new Date(Date.UTC(todayAtMidnight.getUTCFullYear(), month - 1, day))
  if (next.getTime() < todayAtMidnight.getTime()) next = new Date(Date.UTC(todayAtMidnight.getUTCFullYear() + 1, month - 1, day))
  return { daysAway: Math.round((next.getTime() - todayAtMidnight.getTime()) / DAY_MS), year: next.getUTCFullYear() }
}

// Powers the Celebrations panel's "coming up" lists — same candidate set as the daily sweep
// (active Talent Members resolvable against the Staff Roster), just sorted by days-to-next-
// occurrence instead of filtered to "today."
export async function getUpcomingCelebrations(limit = 5): Promise<{ birthdays: UpcomingCelebration[]; anniversaries: UpcomingAnniversary[] }> {
  const candidates = await getActiveCandidates()
  const today = new Date(Date.now() + 60 * 60 * 1000)

  const birthdays: UpcomingCelebration[] = []
  const anniversaries: UpcomingAnniversary[] = []

  for (const c of candidates) {
    if (c.dateOfBirth) {
      const month = c.dateOfBirth.getUTCMonth() + 1
      const day = c.dateOfBirth.getUTCDate()
      const { daysAway } = nextOccurrence(month, day, today)
      birthdays.push({ staffId: c.staffId, name: c.firstName, month, day, daysAway })
    }
    if (c.anniversaryDate) {
      const month = c.anniversaryDate.getUTCMonth() + 1
      const day = c.anniversaryDate.getUTCDate()
      const { daysAway, year } = nextOccurrence(month, day, today)
      const years = year - c.anniversaryDate.getUTCFullYear()
      if (years > 0) anniversaries.push({ staffId: c.staffId, name: c.firstName, month, day, daysAway, years })
    }
  }

  birthdays.sort((a, b) => a.daysAway - b.daysAway)
  anniversaries.sort((a, b) => a.daysAway - b.daysAway)

  return { birthdays: birthdays.slice(0, limit), anniversaries: anniversaries.slice(0, limit) }
}

export interface CelebrationHistoryEntry {
  staffId: string
  staffName: string
  type: CelebrationType
  year: number
  sentAt: Date
}

export async function getRecentCelebrationSendLog(limit = 20): Promise<CelebrationHistoryEntry[]> {
  const rows = await prisma.tMCelebrationSendLog.findMany({ orderBy: { sentAt: 'desc' }, take: limit })
  return rows.map((r) => ({ staffId: r.staffId, staffName: r.staffName, type: r.type as CelebrationType, year: r.year, sentAt: r.sentAt }))
}

export interface SweepRunEntry {
  ranAt: Date
  birthdaysSent: number
  anniversariesSent: number
  errors: string | null
}

export async function getRecentSweepRuns(limit = 5): Promise<SweepRunEntry[]> {
  return prisma.tMCelebrationSweepRun.findMany({ orderBy: { ranAt: 'desc' }, take: limit })
}

function isUniqueConstraintError(err: unknown): boolean {
  return !!err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === 'P2002'
}
