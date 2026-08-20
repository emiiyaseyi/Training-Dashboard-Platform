import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

export async function GET() {
  const gate = await requirePermission('admin-settings', 'view')
  if (gate instanceof NextResponse) return gate

  try {
    const history = await prisma.groupCostDistribution.findMany({ orderBy: { appliedAt: 'desc' } })
    return NextResponse.json(history.map((h) => ({
      id: h.id,
      training: h.training,
      totalAmount: h.totalAmount,
      appliedAt: h.appliedAt,
      breakdown: JSON.parse(h.breakdown),
    })))
  } catch (err) {
    console.error('[admin/group-cost/history GET]', err)
    return NextResponse.json({ error: 'Failed to fetch history.' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const { id } = await req.json() as { id: string }
    if (!id) return NextResponse.json({ error: 'ID is required.' }, { status: 400 })
    await prisma.groupCostDistribution.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[admin/group-cost/history DELETE]', err)
    return NextResponse.json({ error: 'Failed to delete history entry.' }, { status: 500 })
  }
}
