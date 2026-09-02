import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

const VALID_TYPES = ['text', 'textarea', 'select', 'multiselect', 'rating', 'date', 'yesno', 'file', 'ranking']

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  const { id } = await params
  const survey = await prisma.customSurvey.findUnique({ where: { id } })
  if (!survey) return NextResponse.json({ error: 'Survey not found.' }, { status: 404 })
  if (survey.status !== 'draft') {
    return NextResponse.json({ error: 'Questions can only be edited while the survey is still a draft.' }, { status: 400 })
  }

  try {
    const body = await req.json()
    // Accepts either a single question object or { questions: [...] } for bulk creation (e.g.
    // pasting a whole checklist of skill/task rows that all share the same type/options/section) —
    // same "single or array" convention as POST /api/admin/users.
    const inputs: Record<string, unknown>[] = Array.isArray(body.questions) ? body.questions : [body]

    const maxOrder = await prisma.customSurveyQuestion.aggregate({ where: { surveyId: id }, _max: { order: true } })
    let nextOrder = (maxOrder._max.order ?? -1) + 1

    const created = []
    const errors: string[] = []
    for (const input of inputs) {
      const label = String(input.label || '').trim()
      const type = String(input.type || 'text')
      if (!label) { errors.push('A question is missing a label.'); continue }
      if (!VALID_TYPES.includes(type)) { errors.push(`"${label}": invalid question type.`); continue }

      const question = await prisma.customSurveyQuestion.create({
        data: {
          surveyId: id,
          order: nextOrder++,
          section: input.section ? String(input.section).trim() : null,
          label,
          type,
          options: Array.isArray(input.options) && input.options.length > 0 ? JSON.stringify(input.options) : null,
          ratingMax: Number(input.ratingMax) >= 2 && Number(input.ratingMax) <= 10 ? Math.round(Number(input.ratingMax)) : 5,
          required: !!input.required,
          driveFolderId: input.driveFolderId ? String(input.driveFolderId).trim() : null,
          gatesSection: input.gatesSection ? String(input.gatesSection).trim() : null,
          skipSectionIfValues: Array.isArray(input.skipSectionIfValues) && input.skipSectionIfValues.length > 0
            ? JSON.stringify(input.skipSectionIfValues) : null,
        },
      })
      created.push(question)
    }
    return NextResponse.json({ questions: created, errors })
  } catch (err) {
    console.error('[admin/custom-surveys/[id]/questions POST]', err)
    return NextResponse.json({ error: 'Failed to add question(s).' }, { status: 500 })
  }
}
