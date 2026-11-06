import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

export async function GET() {
  const gate = await requirePermission('admin-settings', 'view')
  if (gate instanceof NextResponse) return gate

  const courses = await prisma.trainingCatalogCourse.findMany({ orderBy: [{ provider: 'asc' }, { title: 'asc' }] })
  return NextResponse.json(courses.map((c) => ({ ...c, tags: JSON.parse(c.tags) as string[] })))
}

export async function POST(req: NextRequest) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const body = await req.json()
    const { title, provider, category, tags, durationLabel, sourceUrl, active } = body as {
      title?: string; provider?: string; category?: string; tags?: string[]
      durationLabel?: string; sourceUrl?: string; active?: boolean
    }
    if (!title?.trim() || !provider?.trim()) {
      return NextResponse.json({ error: 'Title and Provider are required.' }, { status: 400 })
    }

    const course = await prisma.trainingCatalogCourse.create({
      data: {
        title: title.trim(),
        provider: provider.trim(),
        category: category?.trim() || null,
        tags: JSON.stringify(Array.isArray(tags) ? tags : []),
        durationLabel: durationLabel?.trim() || null,
        sourceUrl: sourceUrl?.trim() || null,
        active: active !== false,
      },
    })
    return NextResponse.json({ ...course, tags: JSON.parse(course.tags) as string[] })
  } catch (err) {
    console.error('[admin/training-catalog POST]', err)
    return NextResponse.json({ error: 'Failed to add course.' }, { status: 500 })
  }
}
