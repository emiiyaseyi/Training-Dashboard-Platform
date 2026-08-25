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
      staffId?: string; staffName?: string; businessUnit?: string; membershipOrg?: string; amount?: number; month?: string | null; category?: string
    }
    const record = await prisma.subscriptionRecord.update({
      where: { id },
      data: {
        ...(body.staffId !== undefined && { staffId: body.staffId.trim() }),
        ...(body.staffName !== undefined && { staffName: body.staffName.trim() }),
        ...(body.businessUnit !== undefined && { businessUnit: normalizeBUName(body.businessUnit.trim()) }),
        ...(body.membershipOrg !== undefined && { membershipOrg: body.membershipOrg.trim() }),
        ...(body.amount !== undefined && { amount: Number(body.amount) }),
        ...(body.month !== undefined && { month: body.month || null }),
        ...(body.category !== undefined && { category: body.category === 'certification' ? 'certification' : 'membership' }),
      },
    })
    return NextResponse.json(record)
  } catch (err) {
    console.error('[admin/records/subscriptions/[id] PUT]', err)
    return NextResponse.json({ error: 'Failed to update record.' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const { id } = await params
    await prisma.subscriptionRecord.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[admin/records/subscriptions/[id] DELETE]', err)
    return NextResponse.json({ error: 'Failed to delete record.' }, { status: 500 })
  }
}
