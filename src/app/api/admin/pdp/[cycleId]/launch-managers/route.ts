import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { sendPDPManagerSurvey } from '@/lib/pdp-send'
import type { PDPAudience } from '@/lib/pdp-team'

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

  try {
    const result = await sendPDPManagerSurvey(cycle, audience)
    if (cycle.status === 'draft') {
      await prisma.pDPCycle.update({ where: { id: cycleId }, data: { status: 'launched', launchedAt: cycle.launchedAt || new Date() } })
    }
    return NextResponse.json(result)
  } catch (err) {
    console.error('[admin/pdp/[cycleId]/launch-managers]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to launch.' }, { status: 500 })
  }
}
