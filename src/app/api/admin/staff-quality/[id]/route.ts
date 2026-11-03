import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { normalizeBUName } from '@/lib/bu-normalizer'
import { invalidateComprehensiveStaffListCache } from '@/lib/staff-directory'
import { syncTalentMemberRosterForStaffId } from '@/lib/talent-member-roster-mirror'

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

    // Propagates this edit to every other admin page that keeps its own copy of this person
    // (currently just the Talent Member roster's name/email/Exited-status) — so marking someone
    // exited, or fixing their name, here is the only place an admin ever has to do it. Best-effort:
    // never fails the Employees-page edit itself if this secondary sync has a problem.
    if (active !== undefined || firstName !== undefined || middleName !== undefined || lastName !== undefined || email !== undefined) {
      await syncTalentMemberRosterForStaffId(record.staffId).catch((err) => {
        console.error('[admin/staff-quality/[id] PUT] TM roster sync failed', err)
      })
    }

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
