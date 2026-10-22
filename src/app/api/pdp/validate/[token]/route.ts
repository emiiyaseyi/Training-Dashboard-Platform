import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { rateLimit } from '@/lib/rate-limit'
import type { PDPPrefillSnapshot } from '@/lib/pdp-prefill'
import type { PDPAnswers } from '../../staff/[token]/route'

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
    const staffAnswers = validation.staffSurvey.answers ? (JSON.parse(validation.staffSurvey.answers) as PDPAnswers) : null

    return NextResponse.json({
      valid: true,
      cycleTitle: validation.staffSurvey.cycle.title,
      staffName: validation.staffSurvey.staffName,
      managerName: validation.managerName,
      alreadyResponded,
      staffNotYetSubmitted: !staffAnswers,
      maxCapabilitiesPerPerson: validation.staffSurvey.cycle.maxCapabilitiesPerPerson,
      prefill,
      staffAnswers,
      answers: validation.answers ? (JSON.parse(validation.answers) as PDPAnswers) : staffAnswers,
    })
  } catch (err) {
    console.error('[pdp/validate GET]', err)
    return NextResponse.json({ error: 'Something went wrong loading this review.' }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const limited = rateLimit(req, 'pdp-validate-submit', 20, 60_000)
  if (limited) return limited

  try {
    const { token } = await params
    const validation = await prisma.pDPManagerValidation.findUnique({ where: { surveyToken: token } })
    if (!validation) return NextResponse.json({ error: 'This link is invalid.' }, { status: 404 })
    if (validation.respondedAt) return NextResponse.json({ error: 'This review has already been submitted.' }, { status: 400 })

    const body = (await req.json()) as PDPAnswers
    await prisma.pDPManagerValidation.update({
      where: { id: validation.id },
      // The manager's copy is stored separately from the staff member's own answers — never
      // overwrites PDPStaffSurvey.answers, so a second manager (or the staff member themselves
      // looking back later) always sees what the staff member actually submitted, unmodified.
      data: { answers: JSON.stringify(body), respondedAt: new Date() },
    })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[pdp/validate submit]', err)
    return NextResponse.json({ error: 'Something went wrong submitting this review.' }, { status: 500 })
  }
}
