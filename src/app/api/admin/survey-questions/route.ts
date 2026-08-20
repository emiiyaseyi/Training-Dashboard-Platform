import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { getStageQuestions, type SurveyStageKey } from '@/lib/survey-questions'

const VALID_STAGES: SurveyStageKey[] = ['pre', 'post1', 'post2']

export async function GET(req: NextRequest) {
  const gate = await requirePermission('admin-settings', 'view')
  if (gate instanceof NextResponse) return gate

  const stage = req.nextUrl.searchParams.get('stage') as SurveyStageKey | null
  if (!stage || !VALID_STAGES.includes(stage)) {
    return NextResponse.json({ error: 'Unknown or missing stage.' }, { status: 400 })
  }

  const questions = await getStageQuestions(stage)
  return NextResponse.json(
    questions.map((q) => ({
      ...q,
      options: q.options ? JSON.parse(q.options) : null,
    }))
  )
}

export async function POST(req: NextRequest) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const body = await req.json()
    const { stage, section, label, type, options, required, autoFill, fieldKey, driveFolderId } = body as {
      stage: string; section?: string; label: string; type: string
      options?: string[]; required?: boolean; autoFill?: string; fieldKey?: string; driveFolderId?: string
    }
    if (!VALID_STAGES.includes(stage as SurveyStageKey)) {
      return NextResponse.json({ error: 'Unknown stage.' }, { status: 400 })
    }
    if (!label?.trim()) return NextResponse.json({ error: 'Question label is required.' }, { status: 400 })

    // Ensure the stage's rows exist (self-seeds defaults on first touch) before appending.
    await getStageQuestions(stage as SurveyStageKey)
    const max = await prisma.surveyQuestion.aggregate({ where: { stage }, _max: { order: true } })

    const question = await prisma.surveyQuestion.create({
      data: {
        stage,
        order: (max._max.order ?? -1) + 1,
        section: section?.trim() || null,
        label: label.trim(),
        type,
        options: options && options.length > 0 ? JSON.stringify(options) : null,
        required: !!required,
        autoFill: autoFill || null,
        fieldKey: fieldKey?.trim() || null,
        driveFolderId: driveFolderId?.trim() || null,
      },
    })
    return NextResponse.json({ ...question, options: question.options ? JSON.parse(question.options) : null })
  } catch (err) {
    console.error('[admin/survey-questions POST]', err)
    return NextResponse.json({ error: 'Failed to create question.' }, { status: 500 })
  }
}
