import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { sendPDPStaffSurvey } from '@/lib/pdp-send'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ cycleId: string }> }) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  const { cycleId } = await params
  const cycle = await prisma.pDPCycle.findUnique({ where: { id: cycleId } })
  if (!cycle) return NextResponse.json({ error: 'Cycle not found.' }, { status: 404 })

  try {
    const result = await sendPDPStaffSurvey(cycle)
    if (cycle.status === 'draft') {
      await prisma.pDPCycle.update({ where: { id: cycleId }, data: { status: 'launched', launchedAt: cycle.launchedAt || new Date() } })
    }
    return NextResponse.json(result)
  } catch (err) {
    console.error('[admin/pdp/[cycleId]/launch-staff]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to launch.' }, { status: 500 })
  }
}
