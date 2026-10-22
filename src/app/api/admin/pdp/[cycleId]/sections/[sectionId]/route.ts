import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ cycleId: string; sectionId: string }> }) {
  const gate = await requirePermission('pdp', 'admin')
  if (gate instanceof NextResponse) return gate

  const { sectionId } = await params
  const body = await req.json().catch(() => ({}))
  const data: { title?: string; description?: string | null; enabled?: boolean; order?: number; maxRepeats?: number } = {}
  if (typeof body.title === 'string' && body.title.trim()) data.title = body.title.trim()
  if (body.description !== undefined) data.description = body.description ? String(body.description).trim() : null
  if (body.enabled !== undefined) data.enabled = !!body.enabled
  if (Number.isFinite(Number(body.order))) data.order = Number(body.order)
  if (Number.isFinite(Number(body.maxRepeats)) && Number(body.maxRepeats) > 0) data.maxRepeats = Number(body.maxRepeats)

  const section = await prisma.pDPSection.update({ where: { id: sectionId }, data })
  return NextResponse.json(section)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ cycleId: string; sectionId: string }> }) {
  const gate = await requirePermission('pdp', 'admin')
  if (gate instanceof NextResponse) return gate

  const { sectionId } = await params
  await prisma.pDPSection.delete({ where: { id: sectionId } })
  return NextResponse.json({ success: true })
}
