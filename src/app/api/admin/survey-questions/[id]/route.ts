import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const { id } = await params
    const body = await req.json()
    const { section, label, type, options, required, autoFill, fieldKey, driveFolderId } = body as {
      section?: string; label?: string; type?: string
      options?: string[]; required?: boolean; autoFill?: string; fieldKey?: string; driveFolderId?: string
    }
    if (label !== undefined && !label.trim()) {
      return NextResponse.json({ error: 'Question label cannot be empty.' }, { status: 400 })
    }

    const question = await prisma.surveyQuestion.update({
      where: { id },
      data: {
        ...(section !== undefined && { section: section.trim() || null }),
        ...(label !== undefined && { label: label.trim() }),
        ...(type !== undefined && { type }),
        ...(options !== undefined && { options: options.length > 0 ? JSON.stringify(options) : null }),
        ...(required !== undefined && { required }),
        ...(autoFill !== undefined && { autoFill: autoFill || null }),
        ...(fieldKey !== undefined && { fieldKey: fieldKey.trim() || null }),
        ...(driveFolderId !== undefined && { driveFolderId: driveFolderId.trim() || null }),
      },
    })
    return NextResponse.json({ ...question, options: question.options ? JSON.parse(question.options) : null })
  } catch (err) {
    console.error('[admin/survey-questions PUT]', err)
    return NextResponse.json({ error: 'Failed to update question.' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  const { id } = await params
  await prisma.surveyQuestion.delete({ where: { id } }).catch(() => null)
  return NextResponse.json({ success: true })
}
