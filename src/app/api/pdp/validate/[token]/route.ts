import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { rateLimit } from '@/lib/rate-limit'
import type { PDPPrefillSnapshot } from '@/lib/pdp-prefill'
import { validatePDPFormAnswers, type PDPFormAnswers } from '@/lib/pdp-validate'
import { resolvePDPSections, resolveRespondentSections } from '@/lib/pdp-form'
import { sendPDPValidationCompleteEmails } from '@/lib/pdp-send'

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const limited = rateLimit(req, 'pdp-validate-get', 60, 60_000)
  if (limited) return limited

  try {
    const { token } = await params
    const validation = await prisma.pDPManagerValidation.findUnique({
      where: { surveyToken: token },
      include: { staffSurvey: { include: { cycle: true } } },
    })
    if (!validation) return NextResponse.json({ error: 'This link is invalid.' }, { status: 404 })

    const alreadyResponded = !!validation.respondedAt
    const prefill = JSON.parse(validation.staffSurvey.prefillSnapshot) as PDPPrefillSnapshot
    const staffAnswers = validation.staffSurvey.answers ? (JSON.parse(validation.staffSurvey.answers) as PDPFormAnswers) : null
    const cycle = validation.staffSurvey.cycle
    const respondentSections = await resolveRespondentSections(cycle.id)
    const validationSections = await resolvePDPSections(cycle.id, { onlyKeys: ['manager_validation'] })

    return NextResponse.json({
      valid: true,
      cycleTitle: cycle.title,
      staffName: validation.staffSurvey.staffName,
      managerName: validation.managerName,
      alreadyResponded,
      staffNotYetSubmitted: !staffAnswers,
      respondentSections,
      validationSections,
      prefill,
      staffAnswers,
      // The manager's editable working copy — starts as a clone of the staff's own submission the
      // first time this loads, so there's always something to compare against for "what changed".
      editedAnswers: validation.editedAnswers ? (JSON.parse(validation.editedAnswers) as PDPFormAnswers) : staffAnswers,
      answers: validation.answers ? (JSON.parse(validation.answers) as PDPFormAnswers) : null,
    })
  } catch (err) {
    console.error('[pdp/validate GET]', err)
    return NextResponse.json({ error: 'Something went wrong loading this review.' }, { status: 500 })
  }
}

// Draft autosave for the manager's edited copy of the respondent's answers — called as the
// manager moves between pages, mirroring the other tracks' draft-save endpoints. Unvalidated.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const limited = rateLimit(req, 'pdp-validate-save', 120, 60_000)
  if (limited) return limited

  try {
    const { token } = await params
    const validation = await prisma.pDPManagerValidation.findUnique({ where: { surveyToken: token } })
    if (!validation) return NextResponse.json({ error: 'This link is invalid.' }, { status: 404 })
    if (validation.respondedAt) return NextResponse.json({ error: 'This review has already been submitted.' }, { status: 400 })

    const body = (await req.json().catch(() => ({}))) as { editedAnswers?: PDPFormAnswers }
    if (!body.editedAnswers) return NextResponse.json({ error: 'Nothing to save.' }, { status: 400 })
    await prisma.pDPManagerValidation.update({ where: { id: validation.id }, data: { editedAnswers: JSON.stringify(body.editedAnswers) } })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[pdp/validate PUT]', err)
    return NextResponse.json({ error: 'Something went wrong saving your progress.' }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const limited = rateLimit(req, 'pdp-validate-submit', 20, 60_000)
  if (limited) return limited

  try {
    const { token } = await params
    const validation = await prisma.pDPManagerValidation.findUnique({ where: { surveyToken: token }, include: { staffSurvey: { include: { cycle: true } } } })
    if (!validation) return NextResponse.json({ error: 'This link is invalid.' }, { status: 404 })
    if (validation.respondedAt) return NextResponse.json({ error: 'This review has already been submitted.' }, { status: 400 })

    const body = (await req.json()) as { answers: PDPFormAnswers; editedAnswers: PDPFormAnswers }
    const cycle = validation.staffSurvey.cycle
    const validationSections = await resolvePDPSections(cycle.id, { onlyKeys: ['manager_validation'] })
    const validationError = validatePDPFormAnswers(body.answers, validationSections)
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 })

    await prisma.pDPManagerValidation.update({
      where: { id: validation.id },
      // `answers` (the Yes/Partly/No review question set) is stored separately from the staff
      // member's own submission — never overwrites PDPStaffSurvey.answers, so a second manager (or
      // the staff member looking back later) always sees what was originally submitted, unmodified.
      // `editedAnswers` is the manager's finalized/edited copy of the respondent's plan itself.
      data: { answers: JSON.stringify(body.answers), editedAnswers: JSON.stringify(body.editedAnswers), respondedAt: new Date() },
    })

    // Fire-and-forget — sends the finalized plan to BOTH the staff member and the manager, so
    // neither has to log back in to see what was actually agreed.
    sendPDPValidationCompleteEmails(validation.id).catch((err) => console.error('[pdp/validate submit] completion email failed', err))

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[pdp/validate submit]', err)
    return NextResponse.json({ error: 'Something went wrong submitting this review.' }, { status: 500 })
  }
}
