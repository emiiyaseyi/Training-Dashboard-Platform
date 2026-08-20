import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

export async function GET() {
  const gate = await requirePermission('admin-settings', 'view')
  if (gate instanceof NextResponse) return gate

  const settings = await prisma.surveySettings.findFirst()
  return NextResponse.json({
    post1MirrorSheetName: settings?.post1MirrorSheetName || '',
    post2MirrorSheetName: settings?.post2MirrorSheetName || '',
    preMirrorSheetName: settings?.preMirrorSheetName || '',
    preDaysBefore: settings?.preDaysBefore ?? 7,
    post1DaysAfter: settings?.post1DaysAfter ?? 1,
    post2DaysAfter: settings?.post2DaysAfter ?? 30,
    reminderIntervalHours: settings?.reminderIntervalHours ?? 24,
    expiryEnabled: settings?.expiryEnabled ?? true,
    expiryDays: settings?.expiryDays ?? 7,
  })
}

export async function POST(req: NextRequest) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const body = await req.json()
    const data = {
      post1MirrorSheetName: body.post1MirrorSheetName || null,
      post2MirrorSheetName: body.post2MirrorSheetName || null,
      preMirrorSheetName: body.preMirrorSheetName || null,
      preDaysBefore: Number.isFinite(Number(body.preDaysBefore)) ? Number(body.preDaysBefore) : 7,
      post1DaysAfter: Number.isFinite(Number(body.post1DaysAfter)) ? Number(body.post1DaysAfter) : 1,
      post2DaysAfter: Number.isFinite(Number(body.post2DaysAfter)) ? Number(body.post2DaysAfter) : 30,
      reminderIntervalHours: Number.isFinite(Number(body.reminderIntervalHours)) ? Number(body.reminderIntervalHours) : 24,
      expiryEnabled: !!body.expiryEnabled,
      expiryDays: Number.isFinite(Number(body.expiryDays)) ? Number(body.expiryDays) : 7,
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
