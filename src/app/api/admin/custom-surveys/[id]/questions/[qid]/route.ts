import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

const VALID_TYPES = ['text', 'textarea', 'select', 'multiselect', 'rating', 'date', 'yesno', 'file', 'ranking']

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string; qid: string }> }) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  const { id, qid } = await params
  const survey = await prisma.customSurvey.findUnique({ where: { id } })
  if (!survey) return NextResponse.json({ error: 'Survey not found.' }, { status: 404 })
  if (survey.status !== 'draft') {
    return NextResponse.json({ error: 'Questions can only be edited while the survey is still a draft.' }, { status: 400 })
  }

  try {
    const body = await req.json()
    const data: Record<string, unknown> = {}
    if (body.section !== undefined) data.section = body.section ? String(body.section).trim() : null
    if (body.label !== undefined) {
      const label = String(body.label).trim()
      if (!label) return NextResponse.json({ error: 'Question label is required.' }, { status: 400 })
      data.label = label
    }
    if (body.type !== undefined) {
      if (!VALID_TYPES.includes(body.type)) return NextResponse.json({ error: 'Invalid question type.' }, { status: 400 })
      data.type = body.type
    }
    if (body.options !== undefined) data.options = Array.isArray(body.options) && body.options.length > 0 ? JSON.stringify(body.options) : null
    if (body.ratingMax !== undefined && Number(body.ratingMax) >= 2 && Number(body.ratingMax) <= 10) data.ratingMax = Math.round(Number(body.ratingMax))
    if (body.required !== undefined) data.required = !!body.required
    if (body.driveFolderId !== undefined) data.driveFolderId = body.driveFolderId ? String(body.driveFolderId).trim() : null
    if (body.gatesSection !== undefined) data.gatesSection = body.gatesSection ? String(body.gatesSection).trim() : null
    if (body.skipSectionIfValues !== undefined) {
      data.skipSectionIfValues = Array.isArray(body.skipSectionIfValues) && body.skipSectionIfValues.length > 0
        ? JSON.stringify(body.skipSectionIfValues) : null
    }

    const question = await prisma.customSurveyQuestion.update({ where: { id: qid }, data })
    return NextResponse.json(question)
  } catch (err) {
    console.error('[admin/custom-surveys/[id]/questions/[qid] PUT]', err)
    return NextResponse.json({ error: 'Failed to update question.' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; qid: string }> }) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  const { id, qid } = await params
  const survey = await prisma.customSurvey.findUnique({ where: { id } })
  if (!survey) return NextResponse.json({ error: 'Survey not found.' }, { status: 404 })
  if (survey.status !== 'draft') {
    return NextResponse.json({ error: 'Questions can only be edited while the survey is still a draft.' }, { status: 400 })
  }

  await prisma.customSurveyQuestion.delete({ where: { id: qid } }).catch(() => null)
  return NextResponse.json({ success: true })
}
