import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

// One-off, conservative pass tagging courses against Meristem's current Differentiating
// Capabilities (admin-configured — read live, never hardcoded). The catalog was extracted from
// provider calendars without knowledge of these capability names, so until this runs no course
// carries a capability tag at all, meaning the "Alignment with Meristem's Strategic Capabilities"
// signal in resolveNeedTrainingOptions (pdp-training-suggestions.ts) never contributes anything to
// scoring. Matching is plain keyword overlap between the capability's own significant words and
// the course's title + category — same "plain logic, no ML" approach as auto-tag-grade. Only adds
// tags to courses that don't already carry that capability tag; never removes an admin's own tag.
const STOPWORDS = new Set([
  'and', 'the', 'of', 'to', 'in', 'for', 'a', 'an', 'with', 'on', 'as', 'is', 'are', 'our', 'we',
  'management', 'services', 'solutions', 'systems', 'skills', 'capability', 'capabilities',
])

function significantWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w))
}

export async function POST() {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  const [capabilities, courses] = await Promise.all([
    prisma.differentiatingCapability.findMany({ orderBy: { order: 'asc' } }),
    prisma.trainingCatalogCourse.findMany({ select: { id: true, title: true, category: true, tags: true } }),
  ])
  if (capabilities.length === 0) {
    return NextResponse.json({ success: true, tagged: 0, titles: [], note: 'No Differentiating Capabilities are configured yet.' })
  }

  const capKeywords = capabilities.map((c) => ({ name: c.name, words: significantWords(c.name) })).filter((c) => c.words.length > 0)

  const toTag: { id: string; title: string; addedTags: string[] }[] = []
  for (const course of courses) {
    const existingTags: string[] = JSON.parse(course.tags)
    const courseWords = new Set(significantWords(`${course.title} ${course.category ?? ''}`))
    const matches = capKeywords
      .filter((cap) => !existingTags.includes(cap.name) && cap.words.some((w) => courseWords.has(w)))
      .map((cap) => cap.name)
    if (matches.length > 0) {
      const nextTags = [...existingTags, ...matches]
      await prisma.trainingCatalogCourse.update({ where: { id: course.id }, data: { tags: JSON.stringify(nextTags) } })
      toTag.push({ id: course.id, title: course.title, addedTags: matches })
    }
  }

  return NextResponse.json({ success: true, tagged: toTag.length, titles: toTag.map((t) => `${t.title} → ${t.addedTags.join(', ')}`) })
}
