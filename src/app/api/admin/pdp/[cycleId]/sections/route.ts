import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

export async function POST(req: NextRequest, { params }: { params: Promise<{ cycleId: string }> }) {
  const gate = await requirePermission('pdp', 'admin')
  if (gate instanceof NextResponse) return gate

  const { cycleId } = await params
  const body = await req.json().catch(() => ({}))
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  if (!title) return NextResponse.json({ error: 'A section title is required.' }, { status: 400 })

  const maxOrder = await prisma.pDPSection.aggregate({ where: { cycleId }, _max: { order: true } })
  const section = await prisma.pDPSection.create({
    data: {
      cycleId,
      order: (maxOrder._max.order ?? -1) + 1,
      key: `custom_${Date.now()}`,
      title,
      description: body.description ? String(body.description).trim() : null,
      maxRepeats: Number.isFinite(Number(body.maxRepeats)) && Number(body.maxRepeats) > 0 ? Number(body.maxRepeats) : 1,
    },
  })
  return NextResponse.json(section)
}
