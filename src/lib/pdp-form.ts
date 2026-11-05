import { prisma } from './prisma'
import { recommendedOrderIndex } from './pdp-seed'

export interface PDPFormQuestion {
  id: string
  order: number
  label: string
  description: string | null
  type: string
  options: string[] | null
  ratingMax: number
  required: boolean
  searchable: boolean
  maxSelect: number | null
  showIfQuestionId: string | null
  showIfEquals: string | null
}

export interface PDPFormSection {
  id: string
  key: string
  order: number
  title: string
  description: string | null
  enabled: boolean
  maxRepeats: number
  questions: PDPFormQuestion[]
}

// Shared by every public GET route (staff/validate/manager) and the validation helper — resolves
// a cycle's sections+questions with `optionsSource: "capabilities"` questions' options filled in
// live from Admin -> Taxonomies (never the stored `options`, which stays null for those), so the
// capability picker always matches whatever's currently configured without the admin having to
// keep two lists in sync. `onlyKey` narrows to one section (e.g. 'manager_validation', which only
// ever renders on the validate page) — omit it to get every enabled section in order.
export async function resolvePDPSections(cycleId: string, opts: { onlyKeys?: string[] } = {}): Promise<PDPFormSection[]> {
  const [sections, capabilities] = await Promise.all([
    prisma.pDPSection.findMany({
      where: { cycleId, enabled: true, ...(opts.onlyKeys ? { key: { in: opts.onlyKeys } } : {}) },
      orderBy: { order: 'asc' },
      include: { questions: { orderBy: { order: 'asc' } } },
    }),
    prisma.differentiatingCapability.findMany({ orderBy: { order: 'asc' }, select: { name: true } }),
  ])
  const capabilityNames = capabilities.map((c) => c.name)

  // Re-applies the canonical PDP-before-Digital-Skill-Assessment order at read time, rather than
  // trusting each cycle's stored `order` field — a cycle seeded or hand-reordered before that
  // canonical order existed (or drifted from it since) would otherwise keep rendering sections out
  // of order to respondents until an admin remembered to click "Reset to recommended order".
  // Stable sort preserves relative position among any custom admin-added sections (not in the
  // recommended list), which this never reorders.
  const ordered = [...sections].sort((a, b) => recommendedOrderIndex(a.key) - recommendedOrderIndex(b.key))

  return ordered.map((s) => ({
    id: s.id,
    key: s.key,
    order: s.order,
    title: s.title,
    description: s.description,
    enabled: s.enabled,
    maxRepeats: s.maxRepeats,
    questions: s.questions.map((q) => ({
      id: q.id,
      order: q.order,
      label: q.label,
      description: q.description,
      type: q.type,
      options: q.optionsSource === 'capabilities' ? capabilityNames : q.options ? JSON.parse(q.options) : null,
      ratingMax: q.ratingMax,
      required: q.required,
      searchable: q.searchable,
      maxSelect: q.maxSelect,
      showIfQuestionId: q.showIfQuestionId,
      showIfEquals: q.showIfEquals,
    })),
  }))
}

// Sections relevant to a respondent filling the form themselves (both tracks) — everything
// except 'manager_validation' and 'manager_need_review', which only ever appear on the separate
// validate page.
export async function resolveRespondentSections(cycleId: string): Promise<PDPFormSection[]> {
  const all = await resolvePDPSections(cycleId)
  return all.filter((s) => s.key !== 'manager_validation' && s.key !== 'manager_need_review')
}
