import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { logAudit } from '@/lib/audit-log'

// Any signed-in user can log their own page view — this isn't a permission-gated action, it's the
// audit trail recording navigation for whoever happens to be looking at the app.
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })

  const { path } = (await req.json().catch(() => ({}))) as { path?: string }
  if (!path) return NextResponse.json({ error: 'Missing path.' }, { status: 400 })

  await logAudit({
    userId: session.user.id,
    userName: session.user.name,
    userEmail: session.user.email,
    action: 'page_view',
    detail: path,
  })
  return NextResponse.json({ success: true })
}
