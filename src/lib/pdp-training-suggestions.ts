import type { PDPQuestion } from '@/components/pdp/PDPSectionRenderer'
import { prisma } from './prisma'

export interface TrainingCatalogCourseLike {
  title: string
  provider: string
  tags: string[]
  minTier: number | null
}

// Every active catalog course, tags parsed — fetched once per page load (staff/manager/preview GET
// routes) and bundled into that route's response, same "fetch once server-side, compute client-side
// per-need as the respondent fills the form" split as capabilityNames/optionsSource:'capabilities'.
export async function getActiveTrainingCatalog(): Promise<TrainingCatalogCourseLike[]> {
  const rows = await prisma.trainingCatalogCourse.findMany({ where: { active: true }, orderBy: { title: 'asc' } })
  return rows.map((r) => ({ title: r.title, provider: r.provider, tags: JSON.parse(r.tags) as string[], minTier: r.minTier }))
}

interface SectionLike {
  key: string
  title: string
  questions: PDPQuestion[]
}

function asStringArray(v: string | string[] | undefined): string[] {
  if (Array.isArray(v)) return v
  if (typeof v === 'string' && v) return [v]
  return []
}

function answerForLabel(section: SectionLike | undefined, label: string, answers: Record<string, string | string[]>): string[] {
  const q = section?.questions.find((q) => q.label === label)
  if (!q) return []
  return asStringArray(answers[q.id])
}

// Deterministic weighted tag-overlap score for one catalog course against everything a respondent
// has told the form so far — same "plain logic, no ML" style as every other matching/prefill
// computation in this app (see skills-gap.ts, pdp-prefill.ts). Every signal is a flat set-overlap
// against the course's admin-assigned tags, not a text/fuzzy search.
function scoreCourse(
  course: TrainingCatalogCourseLike,
  signals: { skillArea: string[]; roleResponsibilities: string[]; developmentDrivers: string[]; businessOutcomes: string[]; capabilities: string[] }
): number {
  const tagSet = new Set(course.tags)
  const overlap = (values: string[]) => values.filter((v) => tagSet.has(v)).length
  // skillArea is enforced as a hard filter before this ever runs (see resolveNeedTrainingOptions),
  // so every candidate already matches it — the rest of the score is a tie-breaker across the
  // respondent's other, broader signals.
  let score = 0
  score += overlap(signals.roleResponsibilities) * 2
  score += overlap(signals.developmentDrivers) * 2
  score += overlap(signals.businessOutcomes) * 2
  score += overlap(signals.capabilities) * 2
  return score
}

// Up to 10 suggested real course titles for ONE Development Need, scored against that need's own
// "Skill or capability area" answer plus the respondent's role_alignment + capabilities answers
// (both answered once, before any Development Need block, per PDP_DEFAULT_SECTIONS' section
// order — see pdp-seed.ts). Same wiring pattern as resolveWrapupSectionQuestions in pdp-wrapup.ts:
// a pure function called at both render and validation time, overriding one question's seeded
// `options` with a per-respondent computed list; every other question passes through unchanged.
// 'Other' is always appended so the existing OtherTextField machinery (PDPSectionRenderer.tsx)
// gives free-text entry and "edit what I picked" for zero extra UI.
export function resolveNeedTrainingOptions(
  section: SectionLike,
  allSections: SectionLike[],
  needAnswers: Record<string, string | string[]>,
  answers: Record<string, string | string[]>,
  catalog: TrainingCatalogCourseLike[],
  // The RESPONDENT's own grade tier (see staff-grade.ts) — for Track B this is the team member
  // being filled for, never the manager doing the filling. A course with a minTier above this is
  // silently excluded before scoring; nothing about grade/tier is ever shown to the respondent.
  respondentTier: number,
): PDPQuestion[] {
  if (section.key !== 'development_needs') return section.questions

  const roleAlignment = allSections.find((s) => s.key === 'role_alignment')
  const capabilities = allSections.find((s) => s.key === 'capabilities')
  const signals = {
    skillArea: answerForLabel(section, 'Skill or capability area', needAnswers),
    roleResponsibilities: answerForLabel(roleAlignment, 'Primary Role Responsibilities', answers),
    developmentDrivers: [
      ...answerForLabel(roleAlignment, 'Primary Development Driver', answers),
      ...answerForLabel(roleAlignment, 'Secondary Development Driver', answers),
    ],
    businessOutcomes: answerForLabel(roleAlignment, 'Relevant Business Outcome', answers),
    capabilities: [
      ...answerForLabel(capabilities, 'Primary capability', answers),
      ...answerForLabel(capabilities, 'Secondary capability (if applicable)', answers),
    ],
  }

  // Nothing is suggested until the respondent has actually picked THIS need's own skill/capability
  // area — showing titles before that point felt premature and disconnected from what they'd just
  // filled in (reported directly by the user), so skillArea is a hard gate, not just a scoring bonus.
  const suggested = signals.skillArea.length === 0 ? [] : catalog
    .filter((course) => course.minTier == null || course.minTier <= respondentTier)
    .filter((course) => signals.skillArea.some((v) => course.tags.includes(v)))
    .map((course) => ({ course, score: scoreCourse(course, signals) }))
    .sort((a, b) => b.score - a.score || a.course.title.localeCompare(b.course.title))
    .slice(0, 10)
    .map((s) => s.course.title)

  return section.questions.map((q) => (q.label === 'Proposed Training Title' ? { ...q, options: [...suggested, 'Other'] } : q))
}
