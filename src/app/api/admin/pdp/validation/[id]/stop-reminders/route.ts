import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission('pdp', 'admin')
  if (gate instanceof NextResponse) return gate

  const { id } = await params
  const validation = await prisma.pDPManagerValidation.update({ where: { id }, data: { respondedAt: new Date() } })
  return NextResponse.json(validation)
}
