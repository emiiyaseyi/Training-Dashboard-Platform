import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

export async function POST(req: NextRequest) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const { idleTimeoutSeconds } = await req.json() as { idleTimeoutSeconds?: number }
    const seconds = Number(idleTimeoutSeconds)
    if (!Number.isFinite(seconds) || seconds < 10 || seconds > 3600) {
      return NextResponse.json({ error: 'Idle timeout must be between 10 and 3600 seconds.' }, { status: 400 })
    }

    const existing = await prisma.securitySettings.findFirst()
    const updated = existing
      ? await prisma.securitySettings.update({ where: { id: existing.id }, data: { idleTimeoutSeconds: seconds } })
      : await prisma.securitySettings.create({ data: { idleTimeoutSeconds: seconds } })

    return NextResponse.json({ idleTimeoutSeconds: updated.idleTimeoutSeconds })
  } catch (err) {
    console.error('[admin/security-settings POST]', err)
    return NextResponse.json({ error: 'Failed to save security settings.' }, { status: 500 })
  }
}
