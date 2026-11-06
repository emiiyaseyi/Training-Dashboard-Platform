import { NextResponse } from 'next/server'
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

export async function POST() {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  const courses = await prisma.trainingCatalogCourse.findMany({ select: { id: true, title: true } })
  const toUpdate = courses
    .map((c) => ({ id: c.id, title: c.title, next: stripYear(c.title) }))
    .filter((c) => c.next !== c.title)

  for (const c of toUpdate) {
    await prisma.trainingCatalogCourse.update({ where: { id: c.id }, data: { title: c.next } })
  }

  return NextResponse.json({ success: true, updated: toUpdate.length, changes: toUpdate.map((c) => ({ from: c.title, to: c.next })) })
}
