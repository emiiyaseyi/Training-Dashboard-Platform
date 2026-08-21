import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

export async function GET(req: NextRequest) {
  const gate = await requirePermission('admin-settings', 'view')
  if (gate instanceof NextResponse) return gate

  const scheduleId = req.nextUrl.searchParams.get('scheduleId')
  const limit = Math.min(200, parseInt(req.nextUrl.searchParams.get('limit') || '50') || 50)

  try {
    const log = await prisma.surveySendLog.findMany({
      where: scheduleId ? { scheduleId } : undefined,
      orderBy: { sentAt: 'desc' },
      take: limit,
    })
    return NextResponse.json(log)
  } catch (err) {
    console.error('[admin/survey-send-log GET]', err)
    return NextResponse.json({ error: 'Failed to fetch send log.' }, { status: 500 })
  }
}
