import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { normalizeBUName } from '@/lib/bu-normalizer'
import { archiveDeletedRecord } from '@/lib/deleted-records'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const { id } = await params
    const body = await req.json() as {
      staffId?: string; staffName?: string; businessUnit?: string; durationMinutes?: number; month?: string | null; year?: number | null
    }
    const record = await prisma.kSSRecord.update({
      where: { id },
      data: {
        ...(body.staffId !== undefined && { staffId: body.staffId.trim() }),
        ...(body.staffName !== undefined && { staffName: body.staffName.trim() }),
        ...(body.businessUnit !== undefined && { businessUnit: normalizeBUName(body.businessUnit.trim()) }),
        ...(body.durationMinutes !== undefined && { durationMinutes: Number(body.durationMinutes) }),
        ...(body.month !== undefined && { month: body.month || null }),
        ...(body.year !== undefined && { year: body.year === null ? null : Number(body.year) }),
      },
    })
    return NextResponse.json(record)
  } catch (err) {
    console.error('[admin/records/kss/[id] PUT]', err)
    return NextResponse.json({ error: 'Failed to update record.' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const { id } = await params
    const record = await prisma.kSSRecord.findUnique({ where: { id } })
    if (!record) return NextResponse.json({ error: 'Record not found.' }, { status: 404 })

    const { sheetMoved, sheetMoveError } = await archiveDeletedRecord(
      'kss',
      record,
      { name: gate.user.name, email: gate.user.email },
      [
        { columnCandidates: ['staffid', 'staffno', 'employeeid', 'id'], value: record.staffId },
        { columnCandidates: ['month', 'period', 'sessionmonth'], value: record.month || '' },
      ],
    )

    await prisma.kSSRecord.delete({ where: { id } })
    return NextResponse.json({ success: true, sheetMoved, sheetMoveError })
  } catch (err) {
    console.error('[admin/records/kss/[id] DELETE]', err)
    return NextResponse.json({ error: 'Failed to delete record.' }, { status: 500 })
  }
}
