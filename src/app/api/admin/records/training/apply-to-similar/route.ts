import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

// After editing one TrainingRecord's name/type/cost/vendor, the admin can choose to apply that
// same change to every other record still filed under the training's ORIGINAL name — a
// vendor/type/cost correction usually applies to the training programme itself, wherever and
// whenever it ran, not just the one row that happened to get edited first. Matched in JS
// (case-insensitive), not the Prisma query, for the same sqlite/postgres consistency reason as
// elsewhere in this file's siblings.
export async function POST(req: NextRequest) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const { originalTrainingName, excludeId, changes } = await req.json() as {
      originalTrainingName: string
      excludeId: string
      changes: { training?: string; trainingType?: string | null; cost?: number; vendor?: string | null }
    }
    if (!originalTrainingName?.trim() || !changes || Object.keys(changes).length === 0) {
      return NextResponse.json({ error: 'originalTrainingName and changes are required.' }, { status: 400 })
    }

    const key = originalTrainingName.trim().toLowerCase()
    const candidates = await prisma.trainingRecord.findMany({ select: { id: true, training: true } })
    const ids = candidates.filter((r) => r.id !== excludeId && r.training.trim().toLowerCase() === key).map((r) => r.id)

    if (ids.length === 0) return NextResponse.json({ updated: 0 })

    const data: Record<string, unknown> = {}
    if (changes.training !== undefined) data.training = changes.training.trim()
    if (changes.trainingType !== undefined) data.trainingType = changes.trainingType || null
    if (changes.cost !== undefined) data.cost = Number(changes.cost)
    if (changes.vendor !== undefined) data.vendor = changes.vendor || null

    const result = await prisma.trainingRecord.updateMany({ where: { id: { in: ids } }, data })
    return NextResponse.json({ updated: result.count })
  } catch (err) {
    console.error('[admin/records/training/apply-to-similar POST]', err)
    return NextResponse.json({ error: 'Failed to apply to similar trainings.' }, { status: 500 })
  }
}
