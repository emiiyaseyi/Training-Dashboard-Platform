import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const { id } = await params
    const body = await req.json()
    const { title, provider, category, tags, durationLabel, sourceUrl, minTier, active } = body as {
      title?: string; provider?: string; category?: string; tags?: string[]
      durationLabel?: string; sourceUrl?: string; minTier?: number | null; active?: boolean
    }

    const course = await prisma.trainingCatalogCourse.update({
      where: { id },
      data: {
        ...(title !== undefined && { title: title.trim() }),
        ...(provider !== undefined && { provider: provider.trim() }),
        ...(category !== undefined && { category: category.trim() || null }),
        ...(tags !== undefined && { tags: JSON.stringify(Array.isArray(tags) ? tags : []) }),
        ...(durationLabel !== undefined && { durationLabel: durationLabel.trim() || null }),
        ...(sourceUrl !== undefined && { sourceUrl: sourceUrl.trim() || null }),
        ...(minTier !== undefined && { minTier }),
        ...(active !== undefined && { active }),
      },
    })
    return NextResponse.json({ ...course, tags: JSON.parse(course.tags) as string[] })
  } catch (err) {
    console.error('[admin/training-catalog/[id] PUT]', err)
    return NextResponse.json({ error: 'Failed to update course.' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const { id } = await params
    await prisma.trainingCatalogCourse.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[admin/training-catalog/[id] DELETE]', err)
    return NextResponse.json({ error: 'Failed to delete course.' }, { status: 500 })
  }
}
