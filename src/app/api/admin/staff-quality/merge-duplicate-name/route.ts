import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/session-guard'
import { mergeDuplicateNameGroup } from '@/lib/staff-quality'
import { invalidateComprehensiveStaffListCache } from '@/lib/staff-directory'

export async function POST(req: NextRequest) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const { keepStaffId, mergeStaffIds } = (await req.json()) as { keepStaffId?: string; mergeStaffIds?: string[] }
    if (!keepStaffId?.trim() || !Array.isArray(mergeStaffIds) || mergeStaffIds.length === 0) {
      return NextResponse.json({ error: 'keepStaffId and at least one mergeStaffId are required.' }, { status: 400 })
    }

    const result = await mergeDuplicateNameGroup(keepStaffId.trim(), mergeStaffIds)
    invalidateComprehensiveStaffListCache()
    return NextResponse.json(result)
  } catch (err) {
    console.error('[admin/staff-quality/merge-duplicate-name POST]', err)
    return NextResponse.json({ error: 'Failed to merge these records.' }, { status: 500 })
  }
}
