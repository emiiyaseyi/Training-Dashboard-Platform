import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

export async function GET() {
  const gate = await requirePermission('admin-settings', 'view')
  if (gate instanceof NextResponse) return gate

  const settings = await prisma.surveySettings.findFirst()
  return NextResponse.json({
    preSurveyFormUrl: settings?.preSurveyFormUrl || '',
    post1SurveyFormUrl: settings?.post1SurveyFormUrl || '',
    post2SurveyFormUrl: settings?.post2SurveyFormUrl || '',
  })
}

export async function POST(req: NextRequest) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const body = await req.json()
    const data = {
      preSurveyFormUrl: body.preSurveyFormUrl || null,
      post1SurveyFormUrl: body.post1SurveyFormUrl || null,
      post2SurveyFormUrl: body.post2SurveyFormUrl || null,
    }
    const existing = await prisma.surveySettings.findFirst()
    const updated = existing
      ? await prisma.surveySettings.update({ where: { id: existing.id }, data })
      : await prisma.surveySettings.create({ data })
    return NextResponse.json(updated)
  } catch (err) {
    console.error('[admin/survey-settings POST]', err)
    return NextResponse.json({ error: 'Failed to save survey settings.' }, { status: 500 })
  }
}
