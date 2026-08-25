import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission('report-generation', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const { id } = await params
    const { active } = (await req.json()) as { active?: boolean }
    const recipient = await prisma.bUReportRecipient.update({ where: { id }, data: { ...(active !== undefined && { active }) } })
    return NextResponse.json(recipient)
  } catch (err) {
    console.error('[admin/bu-report-recipients/[id] PUT]', err)
    return NextResponse.json({ error: 'Failed to update recipient.' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission('report-generation', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const { id } = await params
    await prisma.bUReportRecipient.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[admin/bu-report-recipients/[id] DELETE]', err)
    return NextResponse.json({ error: 'Failed to delete recipient.' }, { status: 500 })
  }
}
