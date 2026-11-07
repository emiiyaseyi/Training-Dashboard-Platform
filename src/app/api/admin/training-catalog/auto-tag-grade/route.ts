import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

// One-off, conservative pass over the already-loaded catalog: flags only CLEARLY board/C-suite-
// level titles (e.g. "Chief Information Officers' Continuous Education Programme") as Tier 4 (AVP
// and Above) — see staff-grade.ts. Deliberately narrow: a false negative (a senior-only course
// that stays visible to everyone) is a minor annoyance an admin can fix one row at a time via the
// table; a false positive (hiding a genuinely general-audience course from everyone below AVP) is
// worse, so this only matches explicit board/C-suite signals, never generic words like "executive"
// or "director" on their own (plenty of this catalog's titles use those words for roles that are
// NOT senior-only, e.g. "Executive Office Management" is for PAs/secretaries). Never touches a
// course that already has a minTier set — admin edits always win.
const SENIOR_SIGNAL_PATTERNS: RegExp[] = [
  /\bboard\b/i,
  /\bboardroom\b/i,
  /\b(ceo|cfo|coo|cio|cro|chro|clo)s?\b/i,
  /\bchief\s+[a-z]+\s+officers?\b/i,
  /\b(for|of)\s+directors\b/i,
  /\bnon-executive directors?\b/i,
  /\bpresident\b/i,
]

function isSeniorSignal(title: string): boolean {
  return SENIOR_SIGNAL_PATTERNS.some((re) => re.test(title))
}

export async function POST() {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  const candidates = await prisma.trainingCatalogCourse.findMany({
    where: { minTier: null },
    select: { id: true, title: true },
  })
  const toTag = candidates.filter((c) => isSeniorSignal(c.title))

  for (const c of toTag) {
    await prisma.trainingCatalogCourse.update({ where: { id: c.id }, data: { minTier: 4 } })
  }

  return NextResponse.json({ success: true, tagged: toTag.length, titles: toTag.map((c) => c.title) })
}
