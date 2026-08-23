import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { normalizeBUName } from '@/lib/bu-normalizer'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const { id } = await params
    const body = await req.json() as {
      staffId?: string; staffName?: string; businessUnit?: string; training?: string; month?: string; year?: number
      cost?: number; hours?: number | null; trainingType?: string | null; capability?: string | null; vendor?: string | null
    }

    const record = await prisma.trainingRecord.update({
      where: { id },
      data: {
        ...(body.staffId !== undefined && { staffId: body.staffId.trim() }),
        ...(body.staffName !== undefined && { staffName: body.staffName.trim() }),
        ...(body.businessUnit !== undefined && { businessUnit: normalizeBUName(body.businessUnit.trim()) }),
        ...(body.training !== undefined && { training: body.training.trim() }),
        ...(body.month !== undefined && { month: body.month }),
        ...(body.year !== undefined && { year: Number(body.year) }),
        ...(body.cost !== undefined && { cost: Number(body.cost) }),
        ...(body.hours !== undefined && { hours: body.hours === null ? null : Number(body.hours) }),
        ...(body.trainingType !== undefined && { trainingType: body.trainingType || null }),
        ...(body.capability !== undefined && { capability: body.capability || null }),
        ...(body.vendor !== undefined && { vendor: body.vendor || null }),
      },
    })
    return NextResponse.json(record)
  } catch (err) {
    console.error('[admin/records/training/[id] PUT]', err)
    return NextResponse.json({ error: 'Failed to update record.' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const { id } = await params
    await prisma.trainingRecord.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[admin/records/training/[id] DELETE]', err)
    return NextResponse.json({ error: 'Failed to delete record.' }, { status: 500 })
  }
}
