import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

export async function GET() {
  const gate = await requirePermission('report-generation', 'view')
  if (gate instanceof NextResponse) return gate

  const logs = await prisma.bUReportSendLog.findMany({
    orderBy: { sentAt: 'desc' },
    take: 200,
  })
  return NextResponse.json(logs)
}
