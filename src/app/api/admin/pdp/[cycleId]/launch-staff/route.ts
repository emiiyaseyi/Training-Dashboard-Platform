import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { sendPDPStaffSurvey } from '@/lib/pdp-send'
import type { PDPAudience } from '@/lib/pdp-team'

export const maxDuration = 60

export async function POST(req: NextRequest, { params }: { params: Promise<{ cycleId: string }> }) {
  const gate = await requirePermission('pdp', 'admin')
  if (gate instanceof NextResponse) return gate

  const { cycleId } = await params
  const cycle = await prisma.pDPCycle.findUnique({ where: { id: cycleId } })
  if (!cycle) return NextResponse.json({ error: 'Cycle not found.' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const audience: PDPAudience = body?.audience && ['all', 'businessUnit', 'department', 'selected'].includes(body.audience.type)
    ? body.audience
    : { type: 'all' }
  if (!Array.isArray(audience.excludeStaffIds)) audience.excludeStaffIds = undefined
  // Snapshot captured per launch, not read from the cycle — see PDPStaffSurvey.requireManagerValidation.
  const requireManagerValidation = body?.requireManagerValidation !== false
  // The client drives a batched loop for audiences that can run into the hundreds (see
  // sendPDPStaffSurvey's comment) — offset/limit are only present on batch calls.
  const offset = Number.isFinite(body?.offset) ? Math.max(0, body.offset) : 0
  const limit = Number.isFinite(body?.limit) && body.limit > 0 ? Math.min(body.limit, 100) : 25
  const batch = body?.batch === true ? { offset, limit } : undefined

  try {
    const result = await sendPDPStaffSurvey(cycle, audience, requireManagerValidation, batch)
    if (cycle.status === 'draft') {
      await prisma.pDPCycle.update({ where: { id: cycleId }, data: { status: 'launched', launchedAt: cycle.launchedAt || new Date() } })
    }
    return NextResponse.json(result)
  } catch (err) {
    console.error('[admin/pdp/[cycleId]/launch-staff]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to launch.' }, { status: 500 })
  }
}
