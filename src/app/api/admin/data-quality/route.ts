import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/session-guard'
import { runDataQualityAudit } from '@/lib/data-quality-audit'

export async function GET() {
  const gate = await requirePermission('admin-settings', 'view')
  if (gate instanceof NextResponse) return gate

  try {
    const audit = await runDataQualityAudit()
    return NextResponse.json(audit)
  } catch (err) {
    console.error('[admin/data-quality]', err)
    return NextResponse.json({ error: 'Failed to run data quality audit.' }, { status: 500 })
  }
}
