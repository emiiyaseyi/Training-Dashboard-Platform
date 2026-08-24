import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

const VALID_TYPES = ['text', 'textarea', 'select', 'multiselect', 'rating', 'date', 'yesno', 'file']

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
    const label = String(body.label || '').trim()
    const type = String(body.type || 'text')
    if (!label) return NextResponse.json({ error: 'Question label is required.' }, { status: 400 })
    if (!VALID_TYPES.includes(type)) return NextResponse.json({ error: 'Invalid question type.' }, { status: 400 })

    const maxOrder = await prisma.customSurveyQuestion.aggregate({ where: { surveyId: id }, _max: { order: true } })

    const question = await prisma.customSurveyQuestion.create({
      data: {
        surveyId: id,
        order: (maxOrder._max.order ?? -1) + 1,
        section: body.section ? String(body.section).trim() : null,
        label,
        type,
        options: Array.isArray(body.options) && body.options.length > 0 ? JSON.stringify(body.options) : null,
        ratingMax: Number(body.ratingMax) >= 2 && Number(body.ratingMax) <= 10 ? Math.round(Number(body.ratingMax)) : 5,
        required: !!body.required,
        driveFolderId: body.driveFolderId ? String(body.driveFolderId).trim() : null,
      },
    })
    return NextResponse.json(question)
  } catch (err) {
    console.error('[admin/custom-surveys/[id]/questions POST]', err)
    return NextResponse.json({ error: 'Failed to add question.' }, { status: 500 })
  }
}
