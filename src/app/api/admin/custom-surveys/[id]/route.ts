import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission('admin-settings', 'view')
  if (gate instanceof NextResponse) return gate

  const { id } = await params
  const survey = await prisma.customSurvey.findUnique({
    where: { id },
    include: {
      questions: { orderBy: { order: 'asc' } },
      recipients: { orderBy: { createdAt: 'asc' }, include: { responses: true } },
    },
  })
  if (!survey) return NextResponse.json({ error: 'Survey not found.' }, { status: 404 })
  return NextResponse.json(survey)
}

// Only editable while still a draft — once launched, its audience has already been resolved and
// sent to, so changing title/audience/questions afterward would silently desync from what
// recipients actually received. Launched surveys can still have their expiry/mirror sheet
// adjusted (neither retroactively changes what was already sent).
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  const { id } = await params
  const survey = await prisma.customSurvey.findUnique({ where: { id } })
  if (!survey) return NextResponse.json({ error: 'Survey not found.' }, { status: 404 })

  try {
    const body = await req.json()
    const data: Record<string, unknown> = {}

    if (survey.status === 'draft') {
      if (body.title !== undefined) {
        const title = String(body.title).trim()
        if (!title) return NextResponse.json({ error: 'Title is required.' }, { status: 400 })
        data.title = title
      }
      if (body.description !== undefined) data.description = body.description ? String(body.description).trim() : null
      if (body.audienceType !== undefined) {
        if (!['all', 'department', 'role', 'businessUnit', 'selected'].includes(body.audienceType)) {
          return NextResponse.json({ error: 'Invalid audience type.' }, { status: 400 })
        }
        data.audienceType = body.audienceType
      }
      if (body.audienceValue !== undefined) data.audienceValue = body.audienceValue || null
    }

    if (body.expiryDays !== undefined) data.expiryDays = Math.max(1, Number(body.expiryDays) || 14)
    if (body.mirrorSheetName !== undefined) data.mirrorSheetName = body.mirrorSheetName ? String(body.mirrorSheetName).trim() : null

    const updated = await prisma.customSurvey.update({ where: { id }, data })
    return NextResponse.json(updated)
  } catch (err) {
    console.error('[admin/custom-surveys/[id] PUT]', err)
    return NextResponse.json({ error: 'Failed to update survey.' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  const { id } = await params
  await prisma.customSurvey.delete({ where: { id } }).catch(() => null)
  return NextResponse.json({ success: true })
}
