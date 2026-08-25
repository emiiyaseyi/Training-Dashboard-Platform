import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

export async function GET() {
  const gate = await requirePermission('report-generation', 'view')
  if (gate instanceof NextResponse) return gate

  const settings = await prisma.reportAutomationSettings.findFirst()
  return NextResponse.json({
    enabled: settings?.enabled ?? false,
    sendDay: settings?.sendDay ?? 1,
  })
}

export async function POST(req: NextRequest) {
  const gate = await requirePermission('report-generation', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const body = await req.json()
    const enabled = !!body.enabled
    const sendDay = Math.min(28, Math.max(1, Number(body.sendDay) || 1)) // capped at 28 so it fires every month, including February

    const existing = await prisma.reportAutomationSettings.findFirst()
    const updated = existing
      ? await prisma.reportAutomationSettings.update({ where: { id: existing.id }, data: { enabled, sendDay } })
      : await prisma.reportAutomationSettings.create({ data: { enabled, sendDay } })

    return NextResponse.json({ enabled: updated.enabled, sendDay: updated.sendDay })
  } catch (err) {
    console.error('[admin/report-automation POST]', err)
    return NextResponse.json({ error: 'Failed to save report automation settings.' }, { status: 500 })
  }
}
