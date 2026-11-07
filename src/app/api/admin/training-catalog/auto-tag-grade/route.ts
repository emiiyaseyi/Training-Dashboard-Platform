import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

export const maxDuration = 30

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

export async function POST(req: NextRequest) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  const body = await req.json().catch(() => ({}))
  const offset = Number.isFinite(body.offset) ? Math.max(0, body.offset) : 0
  const limit = Number.isFinite(body.limit) && body.limit > 0 ? Math.min(body.limit, 300) : 150

  // Ordered by id over the WHOLE catalog (not just untagged rows) so offset/limit stays stable
  // across batches — filtering to minTier:null first would shift which rows land at a given
  // offset as earlier batches tag rows, silently skipping some.
  const all = await prisma.trainingCatalogCourse.findMany({
    select: { id: true, title: true, minTier: true },
    orderBy: { id: 'asc' },
  })
  const batch = all.slice(offset, offset + limit)
  const toTag = batch.filter((c) => c.minTier == null && isSeniorSignal(c.title))

  for (const c of toTag) {
    await prisma.trainingCatalogCourse.update({ where: { id: c.id }, data: { minTier: 4 } })
  }

  const nextOffset = offset + batch.length
  return NextResponse.json({
    success: true,
    tagged: toTag.length,
    titles: toTag.map((c) => c.title),
    nextOffset,
    total: all.length,
    done: nextOffset >= all.length,
  })
}
