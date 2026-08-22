import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/session-guard'

// Any authenticated user (not just admins) — IdleLogout is mounted for everyone and needs this
// value regardless of what the viewer has permission to see. Editing it is a separate,
// admin-only route (see /api/admin/security-settings).
export async function GET() {
  const session = await requireSession()
  if (session instanceof NextResponse) return session

  const settings = await prisma.securitySettings.findFirst()
  return NextResponse.json({ idleTimeoutSeconds: settings?.idleTimeoutSeconds ?? 90 })
}
