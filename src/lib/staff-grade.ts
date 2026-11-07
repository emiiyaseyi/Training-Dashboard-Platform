// Maps a staff member's roster "Pay group" value to a coarse 5-tier seniority band, used ONLY to
// decide which Training Catalog courses are eligible to be suggested as "Proposed Training Title"
// in the PDP form (see pdp-training-suggestions.ts) — e.g. an Intern or Associate never sees a
// course gated to "AVP and Above" (like a CIO Continuous Education Programme) in their suggestions.
//
// This grading is deliberately invisible to respondents: no tier, grade, or "why you don't see
// this" indicator is ever rendered in the staff-fill, manager-fill, or manager-validation pages —
// it only narrows which titles get suggested, silently, same as any other scoring input.
//
// Tiers, confirmed with the user, lowest to highest:
//   0 — Support Executives, MeriMovers, Contracts, Trainees, Graduate Intern, NYSC, Interns
//   1 — Analyst, Senior Analyst
//   2 — Associate, Senior Associate, Advisor
//   3 — Senior Advisor, Executive Advisor, Principal Advisor
//   4 — AVP and above (Assistant VP, VP, Senior VP, Executive VP, President, Executive Director)
export const GRADE_TIER_LABELS = [
  'Tier 0 — Support Executives / MeriMovers / Contracts / Trainees / Graduate Intern / NYSC / Interns',
  'Tier 1 — Analyst and Senior Analyst',
  'Tier 2 — Associate, Senior Associate and Advisor',
  'Tier 3 — Senior Advisor, Executive Advisor and Principal Advisor',
  'Tier 4 — AVP and Above',
] as const

export const MIN_GRADE_TIER_OPTIONS = [
  { value: null, label: 'No restriction — visible to every grade' },
  { value: 1, label: 'Tier 1 and above (Analyst and above)' },
  { value: 2, label: 'Tier 2 and above (Associate and above)' },
  { value: 3, label: 'Tier 3 and above (Senior Advisor and above)' },
  { value: 4, label: 'Tier 4 — AVP and Above only' },
] as const

// Checked longest/most-specific phrase first within each tier, and tiers checked highest-to-
// lowest overall, so e.g. "Senior Advisor" (tier 3) is never mis-matched as the generic "Advisor"
// (tier 2) substring check, and "Vice President" (tier 4) is checked before any lower-tier term
// that might coincidentally appear inside a longer title string.
const TIER_KEYWORDS: { tier: number; keywords: string[] }[] = [
  { tier: 4, keywords: ['executive director', 'president', 'executive vice president', 'senior vice president', 'senior vice-president', 'vice president', 'assistant vice president', 'avp', 'evp', 'svp', 'vp'] },
  { tier: 3, keywords: ['senior advisor', 'executive advisor', 'principal advisor'] },
  { tier: 2, keywords: ['senior associate', 'associate', 'advisor'] },
  { tier: 1, keywords: ['senior analyst', 'analyst'] },
]

// Defaults to the LOWEST tier (0) for a blank/unrecognized Pay group — the safer failure mode is
// "hide senior-only suggestions from someone whose grade we can't determine," not the reverse.
export function resolvePayGroupTier(payGroup: string | null | undefined): number {
  const normalized = (payGroup || '').trim().toLowerCase()
  if (!normalized) return 0
  for (const { tier, keywords } of TIER_KEYWORDS) {
    if (keywords.some((kw) => normalized.includes(kw))) return tier
  }
  return 0
}
