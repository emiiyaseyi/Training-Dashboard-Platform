import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { normalizeBUName } from '@/lib/bu-normalizer'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const { id } = await params
    const body = await req.json()
    const { staffId, firstName, middleName, lastName, email, businessUnit, lineManagerStaffId } = body as {
      staffId?: string; firstName?: string; middleName?: string; lastName?: string
      email?: string; businessUnit?: string; lineManagerStaffId?: string
    }

    const record = await prisma.staffRosterRecord.update({
      where: { id },
      data: {
        ...(staffId !== undefined && { staffId: staffId.trim() }),
        ...(firstName !== undefined && { firstName: firstName.trim() }),
        ...(middleName !== undefined && { middleName: middleName.trim() || null }),
        ...(lastName !== undefined && { lastName: lastName.trim() }),
        ...(email !== undefined && { email: email.trim() || null }),
        ...(businessUnit !== undefined && { businessUnit: normalizeBUName(businessUnit.trim()) }),
        ...(lineManagerStaffId !== undefined && { lineManagerStaffId: lineManagerStaffId.trim() || null }),
      },
    })
    return NextResponse.json(record)
  } catch (err) {
    console.error('[admin/staff-quality/[id] PUT]', err)
    return NextResponse.json({ error: 'Failed to update staff record.' }, { status: 500 })
  }
}
