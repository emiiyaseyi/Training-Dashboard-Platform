import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { rateLimit } from '@/lib/rate-limit'
import { sendPDPManagerValidation } from '@/lib/pdp-send'
import type { PDPPrefillSnapshot } from '@/lib/pdp-prefill'

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
    const prefill = JSON.parse(survey.prefillSnapshot) as PDPPrefillSnapshot

    return NextResponse.json({
      valid: true,
      cycleTitle: survey.cycle.title,
      staffName: survey.staffName,
      alreadyResponded,
      maxCapabilitiesPerPerson: survey.cycle.maxCapabilitiesPerPerson,
      prefill,
      answers: survey.answers ? JSON.parse(survey.answers) : null,
    })
  } catch (err) {
    console.error('[pdp/staff GET]', err)
    return NextResponse.json({ error: 'Something went wrong loading this plan.' }, { status: 500 })
  }
}

export interface PDPAnswers {
  capabilities: Record<string, { priority: 'high' | 'medium' | 'low' | 'not-needed'; action: string }>
  customEntries: { label: string; priority: 'high' | 'medium' | 'low' | 'not-needed'; action: string }[]
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const limited = rateLimit(req, 'pdp-staff-submit', 20, 60_000)
  if (limited) return limited

  try {
    const { token } = await params
    const survey = await prisma.pDPStaffSurvey.findUnique({ where: { surveyToken: token }, include: { cycle: true } })
    if (!survey) return NextResponse.json({ error: 'This link is invalid.' }, { status: 404 })
    if (survey.respondedAt) return NextResponse.json({ error: 'This plan has already been submitted.' }, { status: 400 })

    const body = (await req.json()) as PDPAnswers
    const max = survey.cycle.maxCapabilitiesPerPerson
    const selectedCount = Object.values(body.capabilities || {}).filter((c) => c.priority !== 'not-needed').length + (body.customEntries?.length || 0)
    if (max != null && selectedCount > max) {
      return NextResponse.json({ error: `You can select at most ${max} capabilities/needs — you selected ${selectedCount}.` }, { status: 400 })
    }

    await prisma.pDPStaffSurvey.update({
      where: { id: survey.id },
      data: { answers: JSON.stringify(body), respondedAt: new Date() },
    })

    // Fire-and-forget — the manager validation email going out shouldn't make the staff member's
    // own submit hang, and a failure there is still visible/recoverable from the admin panel.
    sendPDPManagerValidation(survey.id).catch((err) => console.error('[pdp/staff submit] manager validation send failed', err))

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[pdp/staff submit]', err)
    return NextResponse.json({ error: 'Something went wrong submitting this plan.' }, { status: 500 })
  }
}
