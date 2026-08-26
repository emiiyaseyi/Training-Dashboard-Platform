import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/session-guard'
import { sendSurveyStage, type SendSurveyResult } from '@/lib/survey-send'
import type { SurveyStage } from '@/lib/survey-email'

const VALID_STAGES: SurveyStage[] = ['pre', 'post1', 'post2']

// A "send/resend to everyone" on a schedule with more than a handful of attendees can take a
// while even with the pooled-connection reuse in mailer.ts — headroom beyond Vercel's default so
// it can actually finish instead of the request silently outliving its timeout. Capped at 60s: a
// maxDuration beyond what the Vercel plan allows fails the ENTIRE deployment at build time, not
// just this route.
export const maxDuration = 60

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const { id } = await params
    const { stage, attendeeIds } = (await req.json()) as { stage: string; attendeeIds?: string[] }
    if (!VALID_STAGES.includes(stage as SurveyStage)) {
      return NextResponse.json({ error: 'Invalid survey stage.' }, { status: 400 })
    }

    const result: SendSurveyResult = await sendSurveyStage(id, stage as SurveyStage, attendeeIds)
    return NextResponse.json(result)
  } catch (err) {
    console.error('[admin/training-schedule/send POST]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to send survey.' }, { status: 500 })
  }
}
