import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

export async function GET() {
  const gate = await requirePermission('admin-settings', 'view')
  if (gate instanceof NextResponse) return gate

  const surveys = await prisma.customSurvey.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { questions: true, recipients: true } },
      recipients: { select: { sentAt: true, respondedAt: true } },
    },
  })

  return NextResponse.json(
    surveys.map((s) => {
      const { recipients, _count, ...rest } = s
      return {
        ...rest,
        questionCount: _count.questions,
        recipientCount: _count.recipients,
        sentCount: recipients.filter((r) => r.sentAt).length,
        respondedCount: recipients.filter((r) => r.respondedAt).length,
      }
    })
  )
}

export async function POST(req: NextRequest) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const body = await req.json()
    const title = String(body.title || '').trim()
    if (!title) return NextResponse.json({ error: 'Title is required.' }, { status: 400 })

    const survey = await prisma.customSurvey.create({
      data: {
        title,
        description: body.description ? String(body.description).trim() : null,
        audienceType: 'all',
        expiryDays: 14,
      },
    })
    return NextResponse.json(survey)
  } catch (err) {
    console.error('[admin/custom-surveys POST]', err)
    return NextResponse.json({ error: 'Failed to create survey.' }, { status: 500 })
  }
}
