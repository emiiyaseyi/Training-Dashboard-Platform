import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import seedData from '@/lib/training-catalog-seed-data.json'

// One-off, admin-triggered load of the initial Training Catalog — 993 courses extracted from 7
// providers' 2026 calendars (NIM, Lagos Business School, PwC Nigeria Finance Academy, PwC Nigeria
// Business School, POISE Nigeria, FITC, Phillips Consulting — local Nigerian deliveries only, PCL's
// overseas/international programmes deliberately excluded), each tagged against the same
// ROLE_RESPONSIBILITY_CATEGORIES/DEVELOPMENT_DRIVER_OPTIONS/BUSINESS_OUTCOME_OPTIONS taxonomies the
// PDP form uses. Safe to click more than once — upserts by (title, provider), so a second click
// just confirms the data is current rather than creating duplicates. An approximation, not a
// perfect classification: spot-check/retag via the table below afterward as needed.
interface SeedCourse {
  title: string
  provider: string
  category: string | null
  tags: string[]
  durationLabel: string | null
}

// 993 courses run sequentially, one DB round trip at a time, risks tripping a serverless function's
// execution time limit — bounded concurrency (same pattern as data-quality-audit.ts's
// backfillDataQualityFromRoster) cuts wall-clock roughly in proportion to the concurrency factor
// without opening enough connections to exhaust the pool.
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

export async function POST() {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  const courses = seedData as SeedCourse[]
  let created = 0
  let updated = 0

  await runConcurrent(courses, 15, async (course) => {
    const existing = await prisma.trainingCatalogCourse.findFirst({
      where: { title: course.title, provider: course.provider },
      select: { id: true },
    })
    const payload = {
      title: course.title,
      provider: course.provider,
      category: course.category,
      tags: JSON.stringify(course.tags),
      durationLabel: course.durationLabel,
    }
    if (existing) {
      await prisma.trainingCatalogCourse.update({ where: { id: existing.id }, data: payload })
      updated++
    } else {
      await prisma.trainingCatalogCourse.create({ data: payload })
      created++
    }
  })

  return NextResponse.json({ success: true, created, updated, total: courses.length })
}
