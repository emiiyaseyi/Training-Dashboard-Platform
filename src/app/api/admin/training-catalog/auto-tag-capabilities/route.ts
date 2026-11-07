import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

export const maxDuration = 60

// Same bounded-concurrency helper as data-quality-audit.ts's roster backfill — awaiting one
// update at a time over ~1000 courses serialized into a multi-minute (apparently hung) request.
async function runConcurrent<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  async function worker() {
    while (next < items.length) {
      const item = items[next++]
      await fn(item)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
}

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
  const pending: { id: string; title: string; nextTags: string[]; addedTags: string[] }[] = []
  for (const course of courses) {
    const existingTags: string[] = JSON.parse(course.tags)
    const courseWords = new Set(significantWords(`${course.title} ${course.category ?? ''}`))
    const matches = capKeywords
      .filter((cap) => !existingTags.includes(cap.name) && cap.words.some((w) => courseWords.has(w)))
      .map((cap) => cap.name)
    if (matches.length > 0) {
      pending.push({ id: course.id, title: course.title, nextTags: [...existingTags, ...matches], addedTags: matches })
    }
  }

  await runConcurrent(pending, 10, async (c) => {
    await prisma.trainingCatalogCourse.update({ where: { id: c.id }, data: { tags: JSON.stringify(c.nextTags) } })
    toTag.push({ id: c.id, title: c.title, addedTags: c.addedTags })
  })

  return NextResponse.json({ success: true, tagged: toTag.length, titles: toTag.map((t) => `${t.title} → ${t.addedTags.join(', ')}`) })
}
