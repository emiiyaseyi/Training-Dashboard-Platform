import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { resolveRespondentSections } from '@/lib/pdp-form'

// Admin-only, no token, nothing created or sent — exactly what a respondent's form currently
// looks like for this cycle, with placeholder prefill content standing in for a real person's
// data, so an admin can sanity-check the form before launching it to anyone.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ cycleId: string }> }) {
  const gate = await requirePermission('pdp', 'view')
  if (gate instanceof NextResponse) return gate

  const { cycleId } = await params
  const cycle = await prisma.pDPCycle.findUnique({ where: { id: cycleId } })
  if (!cycle) return NextResponse.json({ error: 'Cycle not found.' }, { status: 404 })

  const sections = await resolveRespondentSections(cycleId)

  return NextResponse.json({
    valid: true,
    cycleTitle: cycle.title,
    staffName: 'Sample Employee',
    sections,
    prefill: {
      businessUnit: 'Sample Business Unit',
      department: 'Sample Department',
      role: 'Sample Role',
      capabilities: [],
      recentFeedback: [],
      trainingHistory2026: [
        { trainingName: 'Example 2026 Training', capability: null, month: 'June' },
      ],
    },
  })
}
