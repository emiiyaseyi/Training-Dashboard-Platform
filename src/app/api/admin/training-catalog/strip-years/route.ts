import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

// One-off cleanup: no course/training title should carry a calendar year (e.g. "2026 Chief
// Information Officers' Continuous Education Programme"). The seed data file was already fixed at
// the source, but that alone never touches rows already loaded into the DB — this does the same
// strip against whatever's currently in the table. Keeps named-version titles where the year is
// part of the actual product name, not a "this year's programme" label (e.g. "COBIT 2019
// Foundation" — COBIT 2019 is the specific ISACA framework version, not a date), via the same
// explicit keep-list used when the seed data was cleaned.
const KEEP_TITLES = new Set(['COBIT 2019 Foundation', 'COBIT 2019 Design & Implementation'])

function stripYear(title: string): string {
  if (KEEP_TITLES.has(title)) return title
  let t = title.replace(/\b20\d{2}\b/g, '')
  t = t.replace(/\(\s+/g, '(').replace(/\s+\)/g, ')')
  t = t.replace(/\s{2,}/g, ' ').replace(/\s+([:,.])/g, '$1').trim()
  t = t.replace(/[-:]\s*$/, '').trim()
  // Dangling preposition left after the year it modified is gone — a trailing "for"/"in"/"on"
  // reads as an unfinished sentence, so it comes off too.
  t = t.replace(/\s+(for|in|on)$/i, '').trim()
  return t
}

export const maxDuration = 30

// Batched, client-driven (same shape as the seed route) — the full id+title list is cheap to
// re-read each call (no joins, no tags blob), so slicing it by offset/limit per batch gives the
// admin panel visible "batch X of Y" progress instead of one long silent request.
export async function POST(req: NextRequest) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  const body = await req.json().catch(() => ({}))
  const offset = Number.isFinite(body.offset) ? Math.max(0, body.offset) : 0
  const limit = Number.isFinite(body.limit) && body.limit > 0 ? Math.min(body.limit, 300) : 150

  const all = await prisma.trainingCatalogCourse.findMany({ select: { id: true, title: true }, orderBy: { id: 'asc' } })
  const batch = all.slice(offset, offset + limit)
  const toUpdate = batch
    .map((c) => ({ id: c.id, title: c.title, next: stripYear(c.title) }))
    .filter((c) => c.next !== c.title)

  for (const c of toUpdate) {
    await prisma.trainingCatalogCourse.update({ where: { id: c.id }, data: { title: c.next } })
  }

  const nextOffset = offset + batch.length
  return NextResponse.json({
    success: true,
    updated: toUpdate.length,
    changes: toUpdate.map((c) => ({ from: c.title, to: c.next })),
    nextOffset,
    total: all.length,
    done: nextOffset >= all.length,
  })
}
