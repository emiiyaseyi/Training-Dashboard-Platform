import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { notifyPendingManagerTeams } from '@/lib/pdp-send'

interface Body { ids: string[] }

// Admin-triggered "Send Validation Emails" for selected submitted Track A plans. Managers are now
// notified automatically the moment a staff member submits (and by the daily sweep), so this is only
// a manual catch-up: it runs the same current mechanism — the line manager's single team-review link,
// with this person's plan prefilled — rather than the retired one-link-per-staff-member email.
// Safe to repeat: a manager is only emailed on a brand-new (or reopened) link.
export async function POST(req: NextRequest) {
  const gate = await requirePermission('pdp', 'admin')
  if (gate instanceof NextResponse) return gate

  const body = (await req.json().catch(() => ({}))) as Partial<Body>
  const ids = Array.isArray(body.ids) ? body.ids.filter((id): id is string => typeof id === 'string') : []
  if (ids.length === 0) return NextResponse.json({ error: 'No rows selected.' }, { status: 400 })

  const surveys = await prisma.pDPStaffSurvey.findMany({ where: { id: { in: ids }, respondedAt: { not: null } }, select: { id: true } })
  const { notified } = await notifyPendingManagerTeams(surveys.map((s) => s.id))
  const skipped: { name: string; reason: string }[] = []
  const notSubmitted = ids.length - surveys.length
  if (notSubmitted > 0) skipped.push({ name: `${notSubmitted} selected`, reason: "Hasn't submitted their own plan yet — nothing to validate." })

  // `sent` keeps its old meaning for the panel's message: plans pushed to a manager's review page.
  return NextResponse.json({ sent: notified, skipped })
}
