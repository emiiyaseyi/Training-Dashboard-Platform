import type { PDPQuestion } from '@/components/pdp/PDPSectionRenderer'

const TOOL_SECTION_KEYS = [
  'digital_skill_word', 'digital_skill_excel', 'digital_skill_powerpoint', 'digital_skill_outlook',
  'digital_skill_teams', 'digital_skill_powerbi', 'digital_skill_sql', 'digital_skill_power_automate',
  'digital_skill_ai', 'digital_skill_virtual_advisory',
]

interface SectionLike {
  key: string
  title: string
  questions: PDPQuestion[]
}

// Which tools still belong on the "Training Priority" ranking list — a tool the respondent said
// they rarely/never use is excluded (same filtering the 2026 Digital Skills Self-Assessment survey
// used), and a tool they rated themselves Advanced/Expert in is excluded too (new for the PDP —
// no point prioritizing training on something they're already okay at).
export function computeTrainingPriorityTools(sections: SectionLike[], answers: Record<string, string | string[]>): string[] {
  const result: string[] = []
  for (const section of sections) {
    if (!TOOL_SECTION_KEYS.includes(section.key)) continue
    const freqQ = section.questions.find((q) => q.type === 'select' && Array.isArray(q.options) && q.options.includes('Rarely or never'))
    if (freqQ && answers[freqQ.id] === 'Rarely or never') continue
    const overallQ = section.questions.find((q) => q.label.startsWith('Overall, how would you rate'))
    const overallVal = overallQ ? answers[overallQ.id] : undefined
    if (overallVal === 'Advanced' || overallVal === 'Expert') continue
    result.push(section.title)
  }
  return result
}

// The Wrap-Up section's ranking question ships with every tool as its fallback `options` (see
// PDP_DEFAULT_SECTIONS) — this swaps that in for the respondent's actual filtered shortlist right
// before rendering/validating, based on their own answers on the sections above it. Every other
// section passes through unchanged.
export function resolveWrapupSectionQuestions(
  section: SectionLike,
  allSections: SectionLike[],
  answers: Record<string, string | string[]>,
): PDPQuestion[] {
  if (section.key !== 'digital_skill_wrapup') return section.questions
  const tools = computeTrainingPriorityTools(allSections, answers)
  return section.questions.map((q) => (q.type === 'ranking' ? { ...q, options: tools } : q))
}
