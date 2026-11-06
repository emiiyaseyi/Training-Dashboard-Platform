import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import seedData from '@/lib/training-catalog-seed-data.json'

// One-off, admin-triggered load of the initial Training Catalog — 993 courses extracted from 7
// providers' 2026 calendars (NIM, Lagos Business School, PwC Nigeria Finance Academy, PwC Nigeria
// Business School, POISE Nigeria, FITC, Phillips Consulting — local Nigerian deliveries only, PCL's
// overseas/international programmes deliberately excluded), each tagged against the same
// ROLE_RESPONSIBILITY_CATEGORIES/DEVELOPMENT_DRIVER_OPTIONS/BUSINESS_OUTCOME_OPTIONS taxonomies the
// PDP form uses. Safe to click more than once — matches by (title, provider), so re-running just
// confirms the data is current rather than creating duplicates. An approximation, not a perfect
// classification: spot-check/retag via the table below afterward as needed.
//
// An earlier version of this route did a findFirst + create/update round trip PER course in one
// request (993 courses = ~2000 sequential-ish DB calls against real Postgres, easily 30-60s+),
// which tripped Vercel's serverless timeout and left the admin panel's button spinning forever
// with no response ever coming back. This version processes one BATCH of `limit` courses per call
// (the client drives the loop — see TrainingCatalogPanel's seedCatalog), each batch doing one
// scoped read + one bulk createMany + a small number of updates, so any single request is fast and
// the admin sees live progress instead of a frozen spinner.
interface SeedCourse {
  title: string
  provider: string
  category: string | null
  tags: string[]
  durationLabel: string | null
}

export const maxDuration = 30

export async function POST(req: NextRequest) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  const body = await req.json().catch(() => ({}))
  const offset = Number.isFinite(body.offset) ? Math.max(0, body.offset) : 0
  const limit = Number.isFinite(body.limit) && body.limit > 0 ? Math.min(body.limit, 200) : 100

  const courses = seedData as SeedCourse[]
  const batch = courses.slice(offset, offset + limit)

  if (batch.length === 0) {
    return NextResponse.json({ success: true, created: 0, updated: 0, unchanged: 0, nextOffset: offset, total: courses.length, done: true })
  }

  // Scoped to just this batch's (title, provider) pairs — not a full-table read — so each request
  // stays cheap regardless of how large the catalog grows.
  const existing = await prisma.trainingCatalogCourse.findMany({
    where: { OR: batch.map((c) => ({ title: c.title, provider: c.provider })) },
    select: { id: true, title: true, provider: true, category: true, tags: true, durationLabel: true },
  })
  const existingByKey = new Map(existing.map((e) => [`${e.title}|${e.provider}`, e]))

  const toCreate: { title: string; provider: string; category: string | null; tags: string; durationLabel: string | null }[] = []
  const toUpdate: { id: string; data: { category: string | null; tags: string; durationLabel: string | null } }[] = []

  for (const course of batch) {
    const key = `${course.title}|${course.provider}`
    const match = existingByKey.get(key)
    const tagsJson = JSON.stringify(course.tags)
    if (!match) {
      toCreate.push({ title: course.title, provider: course.provider, category: course.category, tags: tagsJson, durationLabel: course.durationLabel })
    } else if (match.category !== course.category || match.tags !== tagsJson || match.durationLabel !== course.durationLabel) {
      toUpdate.push({ id: match.id, data: { category: course.category, tags: tagsJson, durationLabel: course.durationLabel } })
    }
  }

  // No skipDuplicates here — the local dev datasource (SQLite) doesn't support it at the type
  // level, and it isn't needed anyway: toCreate is already filtered against this batch's existing
  // rows above, so nothing in it should collide.
  if (toCreate.length > 0) {
    await prisma.trainingCatalogCourse.createMany({ data: toCreate })
  }
  for (const u of toUpdate) {
    await prisma.trainingCatalogCourse.update({ where: { id: u.id }, data: u.data })
  }

  const nextOffset = offset + batch.length
  return NextResponse.json({
    success: true,
    created: toCreate.length,
    updated: toUpdate.length,
    unchanged: batch.length - toCreate.length - toUpdate.length,
    nextOffset,
    total: courses.length,
    done: nextOffset >= courses.length,
  })
}
