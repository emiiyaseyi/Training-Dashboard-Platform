import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ cycleId: string; sectionId: string; qid: string }> }) {
  const gate = await requirePermission('pdp', 'admin')
  if (gate instanceof NextResponse) return gate

  const { qid } = await params
  const body = await req.json().catch(() => ({}))
  const data: {
    label?: string; description?: string | null; required?: boolean; searchable?: boolean
    options?: string | null; order?: number; maxSelect?: number | null
  } = {}
  if (typeof body.label === 'string' && body.label.trim()) data.label = body.label.trim()
  if (body.description !== undefined) data.description = body.description ? String(body.description).trim() : null
  if (body.required !== undefined) data.required = !!body.required
  if (body.searchable !== undefined) data.searchable = !!body.searchable
  if (body.options !== undefined) data.options = Array.isArray(body.options) && body.options.length > 0 ? JSON.stringify(body.options) : null
  if (Number.isFinite(Number(body.order))) data.order = Number(body.order)
  if (body.maxSelect !== undefined) data.maxSelect = body.maxSelect === null ? null : Number(body.maxSelect)

  const question = await prisma.pDPQuestion.update({ where: { id: qid }, data })
  return NextResponse.json(question)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ cycleId: string; sectionId: string; qid: string }> }) {
  const gate = await requirePermission('pdp', 'admin')
  if (gate instanceof NextResponse) return gate

  const { qid } = await params
  await prisma.pDPQuestion.delete({ where: { id: qid } })
  return NextResponse.json({ success: true })
}
