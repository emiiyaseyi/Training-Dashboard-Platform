import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/session-guard'
import { auditStaffQuality } from '@/lib/staff-quality'

export async function GET() {
  const gate = await requirePermission('admin-settings', 'view')
  if (gate instanceof NextResponse) return gate

  const audit = await auditStaffQuality()
  return NextResponse.json(audit)
}
