import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

const VALID_TYPES = ['text', 'textarea', 'select', 'multiselect', 'rating', 'yesno']

export async function POST(req: NextRequest, { params }: { params: Promise<{ cycleId: string; sectionId: string }> }) {
  const gate = await requirePermission('pdp', 'admin')
  if (gate instanceof NextResponse) return gate

  const { cycleId, sectionId } = await params
  const body = await req.json().catch(() => ({}))
  const label = String(body.label || '').trim()
  const type = String(body.type || 'text')
  if (!label) return NextResponse.json({ error: 'A question label is required.' }, { status: 400 })
  if (!VALID_TYPES.includes(type)) return NextResponse.json({ error: 'Invalid question type.' }, { status: 400 })

  const maxOrder = await prisma.pDPQuestion.aggregate({ where: { sectionId }, _max: { order: true } })
  const question = await prisma.pDPQuestion.create({
    data: {
      cycleId,
      sectionId,
      order: (maxOrder._max.order ?? -1) + 1,
      label,
      description: body.description ? String(body.description).trim() : null,
      type,
      options: Array.isArray(body.options) && body.options.length > 0 ? JSON.stringify(body.options) : null,
      optionsSource: body.optionsSource === 'capabilities' ? 'capabilities' : null,
      ratingMax: Number(body.ratingMax) >= 2 && Number(body.ratingMax) <= 10 ? Math.round(Number(body.ratingMax)) : 5,
      required: !!body.required,
      searchable: !!body.searchable,
      maxSelect: Number.isFinite(Number(body.maxSelect)) && Number(body.maxSelect) > 0 ? Number(body.maxSelect) : null,
    },
  })
  return NextResponse.json(question)
}
