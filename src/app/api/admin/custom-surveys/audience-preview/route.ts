import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/session-guard'
import { resolveAudience } from '@/lib/custom-survey'

// Lets the admin see who a draft's current audience selection would resolve to before launching
// (launch itself re-resolves at that moment — this is a preview, not a lock).
export async function POST(req: NextRequest) {
  const gate = await requirePermission('admin-settings', 'view')
  if (gate instanceof NextResponse) return gate

  try {
    const body = await req.json()
    const audienceType = String(body.audienceType || 'all')
    const audienceValue = body.audienceValue ?? null
    const audience = await resolveAudience(audienceType, audienceValue)
    const missing = audience.filter((a) => !a.email)
    return NextResponse.json({
      count: audience.length,
      sample: audience.slice(0, 5).map((a) => a.staffName),
      missingEmail: missing.length,
      missingEmailSample: missing.slice(0, 5).map((a) => a.staffName),
    })
  } catch (err) {
    console.error('[admin/custom-surveys/audience-preview POST]', err)
    return NextResponse.json({ error: 'Failed to preview audience.' }, { status: 500 })
  }
}
