import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

export interface StrategicLearningsSummaryRow {
  training: string
  totalCost: number
  attendeeCount: number
  breakdown: { businessUnit: string; cost: number; attendeeCount: number }[]
}

// Auto-populated view of every training already classified as a Strategic Learning ("other"
// Training Type), with its total cost and per-Business-Unit split — read directly from whatever
// cost is already recorded on each TrainingRecord (including any cost the manual lump-sum tool
// below has already written). This is separate from that manual tool: this just shows what's
// already there, it doesn't distribute anything.
export async function GET() {
  const gate = await requirePermission('admin-settings', 'view')
  if (gate instanceof NextResponse) return gate

  try {
    const trainingTypes = await prisma.trainingType.findMany()
    const otherTypeNames = new Set(trainingTypes.filter((t) => t.classification === 'other').map((t) => t.name.toLowerCase()))
    if (otherTypeNames.size === 0) return NextResponse.json([])

    const records = await prisma.trainingRecord.findMany({
      where: { trainingType: { not: null } },
      select: { training: true, businessUnit: true, cost: true, trainingType: true },
    })
    const otherRecords = records.filter((r) => r.trainingType && otherTypeNames.has(r.trainingType.toLowerCase()))

    const byTraining = new Map<string, typeof otherRecords>()
    otherRecords.forEach((r) => {
      const name = r.training?.trim() || '(untitled)'
      if (!byTraining.has(name)) byTraining.set(name, [])
      byTraining.get(name)!.push(r)
    })

    const rows: StrategicLearningsSummaryRow[] = [...byTraining.entries()]
      .map(([training, recs]) => {
        const byBU = new Map<string, typeof recs>()
        recs.forEach((r) => {
          const bu = r.businessUnit || 'Unassigned'
          if (!byBU.has(bu)) byBU.set(bu, [])
          byBU.get(bu)!.push(r)
        })
        const breakdown = [...byBU.entries()]
          .map(([businessUnit, buRecs]) => ({
            businessUnit,
            cost: buRecs.reduce((s, r) => s + r.cost, 0),
            attendeeCount: buRecs.length,
          }))
          .sort((a, b) => b.cost - a.cost)
        return {
          training,
          totalCost: recs.reduce((s, r) => s + r.cost, 0),
          attendeeCount: recs.length,
          breakdown,
        }
      })
      .sort((a, b) => b.totalCost - a.totalCost)

    return NextResponse.json(rows)
  } catch (err) {
    console.error('[admin/strategic-learnings-summary GET]', err)
    return NextResponse.json({ error: 'Failed to load Strategic Learnings summary.' }, { status: 500 })
  }
}
