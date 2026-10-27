import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { normalizeBUName } from '@/lib/bu-normalizer'
import { invalidateComprehensiveStaffListCache } from '@/lib/staff-directory'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const { id } = await params
    const body = await req.json()
    const { staffId, firstName, middleName, lastName, email, businessUnit, lineManagerStaffId, department, role, employmentType, active } = body as {
      staffId?: string; firstName?: string; middleName?: string; lastName?: string
      email?: string; businessUnit?: string; lineManagerStaffId?: string
      department?: string; role?: string; employmentType?: string; active?: boolean
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
        ...(department !== undefined && { department: department.trim() || null }),
        ...(role !== undefined && { role: role.trim() || null }),
        ...(employmentType !== undefined && { employmentType: employmentType.trim() || null }),
        ...(active !== undefined && { active }),
      },
    })
    invalidateComprehensiveStaffListCache() // this DB edit alone changes what loadRosterDirectory() returns, regardless of the sheet sync below

    // The database is the source of truth for staff — edits are NOT written back to the sheet.
    const sheetSync = { attempted: false, success: false }
    const statusSheetSync = { attempted: false, success: false }

    return NextResponse.json({ ...record, sheetSync, statusSheetSync })
  } catch (err) {
    console.error('[admin/staff-quality/[id] PUT]', err)
    return NextResponse.json({ error: 'Failed to update staff record.' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const { id } = await params
    await prisma.staffRosterRecord.delete({ where: { id } })
    invalidateComprehensiveStaffListCache()
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[admin/staff-quality/[id] DELETE]', err)
    return NextResponse.json({ error: 'Failed to delete staff record.' }, { status: 500 })
  }
}
