import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

const VALID_TYPES = ['text', 'textarea', 'select', 'multiselect', 'rating', 'yesno']

export async function GET(_req: NextRequest, { params }: { params: Promise<{ cycleId: string }> }) {
  const gate = await requirePermission('pdp', 'view')
  if (gate instanceof NextResponse) return gate

  const { cycleId } = await params
  const questions = await prisma.pDPQuestion.findMany({ where: { cycleId }, orderBy: { order: 'asc' } })
  return NextResponse.json(questions)
}

// Editing is allowed at any point (not locked to "draft" the way Custom Survey questions are) —
// a PDP cycle is deliberately tested with a handful of people first (see audience targeting on
// the launch routes), so the question set needs to stay editable between that test batch and the
// full rollout. Anyone who already submitted keeps their existing answers either way; a newly
// added question just won't have an answer for them yet.
export async function POST(req: NextRequest, { params }: { params: Promise<{ cycleId: string }> }) {
  const gate = await requirePermission('pdp', 'admin')
  if (gate instanceof NextResponse) return gate

  const { cycleId } = await params
  const cycle = await prisma.pDPCycle.findUnique({ where: { id: cycleId } })
  if (!cycle) return NextResponse.json({ error: 'Cycle not found.' }, { status: 404 })

  try {
    const body = await req.json()
    const inputs: Record<string, unknown>[] = Array.isArray(body.questions) ? body.questions : [body]

    const maxOrder = await prisma.pDPQuestion.aggregate({ where: { cycleId }, _max: { order: true } })
    let nextOrder = (maxOrder._max.order ?? -1) + 1

    const created = []
    const errors: string[] = []
    for (const input of inputs) {
      const label = String(input.label || '').trim()
      const type = String(input.type || 'text')
      if (!label) { errors.push('A question is missing a label.'); continue }
      if (!VALID_TYPES.includes(type)) { errors.push(`"${label}": invalid question type.`); continue }

      const question = await prisma.pDPQuestion.create({
        data: {
          cycleId,
          order: nextOrder++,
          label,
          description: input.description ? String(input.description).trim() : null,
          type,
          options: Array.isArray(input.options) && input.options.length > 0 ? JSON.stringify(input.options) : null,
          ratingMax: Number(input.ratingMax) >= 2 && Number(input.ratingMax) <= 10 ? Math.round(Number(input.ratingMax)) : 5,
          required: !!input.required,
        },
      })
      created.push(question)
    }
    return NextResponse.json({ questions: created, errors })
  } catch (err) {
    console.error('[admin/pdp/[cycleId]/questions POST]', err)
    return NextResponse.json({ error: 'Failed to add question(s).' }, { status: 500 })
  }
}
