import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { rateLimit } from '@/lib/rate-limit'
import { loadRosterDirectory, resolveStaffLoose } from '@/lib/staff-directory'
import { normalizeStaffIdKey } from '@/lib/staff-id'
import { buildPDPPrefillIndex, getPDPPrefillForStaff } from '@/lib/pdp-prefill'

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const limited = rateLimit(req, 'pdp-manager-get', 60, 60_000)
  if (limited) return limited

  try {
    const { token } = await params
    const survey = await prisma.pDPManagerSurvey.findUnique({
      where: { surveyToken: token },
      include: { cycle: true, teamMembers: { orderBy: { staffName: 'asc' } } },
    })
    if (!survey) return NextResponse.json({ error: 'This link is invalid.' }, { status: 404 })

    return NextResponse.json({
      valid: true,
      cycleTitle: survey.cycle.title,
      managerName: survey.managerName,
      rosterConfirmed: !!survey.rosterConfirmedAt,
      alreadyResponded: !!survey.respondedAt,
      maxCapabilitiesPerPerson: survey.cycle.maxCapabilitiesPerPerson,
      teamMembers: survey.teamMembers.map((m) => ({
        id: m.id,
        staffId: m.staffId,
        staffName: m.staffName,
        businessUnit: m.businessUnit,
        role: m.role,
        status: m.status,
        prefill: m.prefillSnapshot ? JSON.parse(m.prefillSnapshot) : null,
        answers: m.answers ? JSON.parse(m.answers) : null,
        submitted: !!m.submittedAt,
      })),
    })
  } catch (err) {
    console.error('[pdp/manager GET]', err)
    return NextResponse.json({ error: 'Something went wrong loading your team.' }, { status: 500 })
  }
}

// Roster-review step: accept/decline the pre-built list, and/or add people who weren't on it.
// Computes prefill for every accepted/added member right here (not at launch time) since an
// "added" person wasn't known about when the survey was created.
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const limited = rateLimit(req, 'pdp-manager-confirm', 20, 60_000)
  if (limited) return limited

  try {
    const { token } = await params
    const survey = await prisma.pDPManagerSurvey.findUnique({ where: { surveyToken: token } })
    if (!survey) return NextResponse.json({ error: 'This link is invalid.' }, { status: 404 })

    const body = await req.json().catch(() => ({}))
    const acceptIds: string[] = Array.isArray(body.accept) ? body.accept : []
    const declineIds: string[] = Array.isArray(body.decline) ? body.decline : []
    const addIdentifiers: string[] = Array.isArray(body.add) ? body.add : []

    const prefillIndex = await buildPDPPrefillIndex()

    if (acceptIds.length > 0) {
      const toAccept = await prisma.pDPManagerTeamMemberEntry.findMany({ where: { id: { in: acceptIds }, managerSurveyId: survey.id } })
      for (const entry of toAccept) {
        await prisma.pDPManagerTeamMemberEntry.update({
          where: { id: entry.id },
          data: { status: 'accepted', prefillSnapshot: JSON.stringify(getPDPPrefillForStaff(prefillIndex, entry.staffId)) },
        })
      }
    }
    if (declineIds.length > 0) {
      await prisma.pDPManagerTeamMemberEntry.updateMany({ where: { id: { in: declineIds }, managerSurveyId: survey.id }, data: { status: 'declined' } })
    }

    if (addIdentifiers.length > 0) {
      const directory = await loadRosterDirectory()
      const existing = await prisma.pDPManagerTeamMemberEntry.findMany({ where: { managerSurveyId: survey.id }, select: { staffId: true } })
      const existingKeys = new Set(existing.map((e) => normalizeStaffIdKey(e.staffId)))
      for (const identifier of addIdentifiers) {
        const staff = resolveStaffLoose(identifier, directory)
        if (!staff || existingKeys.has(normalizeStaffIdKey(staff.staffId))) continue
        existingKeys.add(normalizeStaffIdKey(staff.staffId))
        await prisma.pDPManagerTeamMemberEntry.create({
          data: {
            managerSurveyId: survey.id,
            staffId: staff.staffId,
            staffName: staff.name,
            businessUnit: staff.businessUnit,
            role: staff.role,
            status: 'added',
            prefillSnapshot: JSON.stringify(getPDPPrefillForStaff(prefillIndex, staff.staffId)),
          },
        })
      }
    }

    if (!survey.rosterConfirmedAt) {
      await prisma.pDPManagerSurvey.update({ where: { id: survey.id }, data: { rosterConfirmedAt: new Date() } })
    }
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[pdp/manager POST]', err)
    return NextResponse.json({ error: 'Something went wrong confirming your team.' }, { status: 500 })
  }
}

// Saves one team member's page at a time — a manager with a large team shouldn't lose everything
// if they close the tab partway through. Once every accepted/added member has submittedAt, the
// whole PDPManagerSurvey is marked responded.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const limited = rateLimit(req, 'pdp-manager-save', 60, 60_000)
  if (limited) return limited

  try {
    const { token } = await params
    const survey = await prisma.pDPManagerSurvey.findUnique({ where: { surveyToken: token }, include: { teamMembers: true } })
    if (!survey) return NextResponse.json({ error: 'This link is invalid.' }, { status: 404 })
    if (survey.respondedAt) return NextResponse.json({ error: 'This has already been fully submitted.' }, { status: 400 })

    const body = await req.json().catch(() => ({}))
    const entryId = typeof body.entryId === 'string' ? body.entryId : ''
    const entry = survey.teamMembers.find((m) => m.id === entryId)
    if (!entry) return NextResponse.json({ error: 'Team member not found on this survey.' }, { status: 404 })

    const cycle = await prisma.pDPCycle.findUnique({ where: { id: survey.cycleId } })
    const max = cycle?.maxCapabilitiesPerPerson ?? null
    const answers = body.answers as { capabilities?: Record<string, { priority: string }>; customEntries?: unknown[] } | undefined
    const selectedCount = Object.values(answers?.capabilities || {}).filter((c) => c.priority !== 'not-needed').length + (answers?.customEntries?.length || 0)
    if (max != null && selectedCount > max) {
      return NextResponse.json({ error: `At most ${max} capabilities/needs can be selected — ${selectedCount} were selected.` }, { status: 400 })
    }

    await prisma.pDPManagerTeamMemberEntry.update({
      where: { id: entryId },
      data: { answers: JSON.stringify(body.answers), submittedAt: new Date() },
    })

    const remaining = survey.teamMembers.filter((m) => m.id !== entryId && (m.status === 'accepted' || m.status === 'added') && !m.submittedAt)
    if (remaining.length === 0) {
      await prisma.pDPManagerSurvey.update({ where: { id: survey.id }, data: { respondedAt: new Date() } })
    }
    return NextResponse.json({ success: true, allDone: remaining.length === 0 })
  } catch (err) {
    console.error('[pdp/manager PUT]', err)
    return NextResponse.json({ error: 'Something went wrong saving this page.' }, { status: 500 })
  }
}
