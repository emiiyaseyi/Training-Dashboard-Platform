import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { rateLimit } from '@/lib/rate-limit'
import { notifyManagerOfTeamUpdate, ensureTeamMemberViewToken } from '@/lib/pdp-send'
import type { PDPPrefillSnapshot } from '@/lib/pdp-prefill'
import { validatePDPFormAnswers, type PDPFormAnswers } from '@/lib/pdp-validate'
import { resolveRespondentSections } from '@/lib/pdp-form'

// Public, unauthenticated — the token itself (an unguessable cuid) is the access control, same
// convention as /api/custom-survey/[token] and /api/survey/[token]/[stage].
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const limited = rateLimit(req, 'pdp-staff-get', 60, 60_000)
  if (limited) return limited

  try {
    const { token } = await params
    const survey = await prisma.pDPStaffSurvey.findUnique({ where: { surveyToken: token }, include: { cycle: true } })
    if (!survey) return NextResponse.json({ error: 'This link is invalid.' }, { status: 404 })

    const alreadyResponded = !!survey.respondedAt

    // A line manager can finalize (review or fill) this person's plan before they ever self-fill
    // it themselves, via the consolidated Track B-style link — once that's happened, this link is
    // no longer theirs to fill; they're pointed to the read-only copy of what was finalized.
    let finalizedByManager: { managerName: string; viewToken: string } | null = null
    if (!alreadyResponded) {
      const finalizedEntry = await prisma.pDPManagerTeamMemberEntry.findFirst({
        where: { staffId: survey.staffId, submittedAt: { not: null }, managerSurvey: { cycleId: survey.cycleId } },
        include: { managerSurvey: true },
      })
      if (finalizedEntry) {
        const viewToken = await ensureTeamMemberViewToken(finalizedEntry.id, finalizedEntry.viewToken)
        finalizedByManager = { managerName: finalizedEntry.managerSurvey.managerName, viewToken }
      }
    }

    const prefill = JSON.parse(survey.prefillSnapshot) as PDPPrefillSnapshot
    const sections = await resolveRespondentSections(survey.cycleId)

    return NextResponse.json({
      valid: true,
      cycleTitle: survey.cycle.title,
      staffName: survey.staffName,
      alreadyResponded,
      finalizedByManager,
      sections,
      prefill,
      answers: survey.answers ? JSON.parse(survey.answers) : null,
    })
  } catch (err) {
    console.error('[pdp/staff GET]', err)
    return NextResponse.json({ error: 'Something went wrong loading this plan.' }, { status: 500 })
  }
}

// Draft autosave — called as the respondent moves between pages, so closing the tab and coming
// back later resumes from where they left off (GET above already returns survey.answers as the
// prefilled form state). Deliberately unvalidated: a draft can be partial by definition.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const limited = rateLimit(req, 'pdp-staff-save', 120, 60_000)
  if (limited) return limited

  try {
    const { token } = await params
    const survey = await prisma.pDPStaffSurvey.findUnique({ where: { surveyToken: token } })
    if (!survey) return NextResponse.json({ error: 'This link is invalid.' }, { status: 404 })
    if (survey.respondedAt) return NextResponse.json({ error: 'This plan has already been submitted.' }, { status: 400 })

    const body = (await req.json()) as PDPFormAnswers
    await prisma.pDPStaffSurvey.update({ where: { id: survey.id }, data: { answers: JSON.stringify(body) } })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[pdp/staff PUT]', err)
    return NextResponse.json({ error: 'Something went wrong saving your progress.' }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const limited = rateLimit(req, 'pdp-staff-submit', 20, 60_000)
  if (limited) return limited

  try {
    const { token } = await params
    const survey = await prisma.pDPStaffSurvey.findUnique({ where: { surveyToken: token }, include: { cycle: true } })
    if (!survey) return NextResponse.json({ error: 'This link is invalid.' }, { status: 404 })
    if (survey.respondedAt) return NextResponse.json({ error: 'This plan has already been submitted.' }, { status: 400 })

    // Defensive — matches the GET route's check. A manager could in principle finalize this
    // person's entry in the brief window between the GET that loaded this form and this submit.
    const finalizedEntry = await prisma.pDPManagerTeamMemberEntry.findFirst({
      where: { staffId: survey.staffId, submittedAt: { not: null }, managerSurvey: { cycleId: survey.cycleId } },
    })
    if (finalizedEntry) return NextResponse.json({ error: 'Your line manager has already completed this for you.' }, { status: 400 })

    const body = (await req.json()) as PDPFormAnswers
    const sections = await resolveRespondentSections(survey.cycleId)
    const validationError = validatePDPFormAnswers(body, sections)
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 })

    await prisma.pDPStaffSurvey.update({
      where: { id: survey.id },
      data: { answers: JSON.stringify(body), respondedAt: new Date() },
    })

    // Fire-and-forget — getting this in front of the line manager shouldn't make the staff
    // member's own submit hang, and a failure there is still visible/recoverable from the admin
    // panel. Reads the snapshot captured when THIS survey was launched, not the cycle's current
    // setting (which may have changed since) — see PDPStaffSurvey.requireManagerValidation.
    if (survey.requireManagerValidation) {
      notifyManagerOfTeamUpdate(survey.id).catch((err) => console.error('[pdp/staff submit] manager notify failed', err))
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[pdp/staff submit]', err)
    return NextResponse.json({ error: 'Something went wrong submitting this plan.' }, { status: 500 })
  }
}
