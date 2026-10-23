import type { PDPQuestion } from '@/components/pdp/PDPSectionRenderer'

export const TOOL_SECTION_KEYS = [
  'digital_skill_word', 'digital_skill_excel', 'digital_skill_powerpoint', 'digital_skill_outlook',
  'digital_skill_teams', 'digital_skill_powerbi', 'digital_skill_sql', 'digital_skill_power_automate',
  'digital_skill_ai', 'digital_skill_virtual_advisory',
]
const TOOL_GATE_KEY = 'digital_skill_tool_selection'

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

// Which tools the respondent picked on the gating question ("Which of these do you use, or
// expect to use…") — the one thing that decides which per-tool sections they see at all. A cycle
// seeded before this gate existed has no 'digital_skill_tool_selection' section; treating that as
// "everything selected" keeps an older, already-sent link's flow unchanged rather than suddenly
// hiding every tool section on it.
export function computeSelectedTools(sections: SectionLike[], answers: Record<string, string | string[]>): string[] {
  const gate = sections.find((s) => s.key === TOOL_GATE_KEY)
  const gateQuestion = gate?.questions[0]
  if (!gateQuestion) return sections.filter((s) => TOOL_SECTION_KEYS.includes(s.key)).map((s) => s.title)
  return asStringArray(answers[gateQuestion.id])
}

// Whether a given section should appear in the respondent's page flow at all — every non-tool
// section (gate, role alignment, confirmation, etc.) always does; a tool section only does if it
// was picked on the gating question.
export function isToolSectionVisible(section: SectionLike, allSections: SectionLike[], answers: Record<string, string | string[]>): boolean {
  if (!TOOL_SECTION_KEYS.includes(section.key)) return true
  return computeSelectedTools(allSections, answers).includes(section.title)
}

// Which tools still belong on the "Training Priority" ranking list — starts from only the tools
// the respondent actually selected on the gating question (a tool they never selected was never
// shown to them, so its frequency/rating questions are unanswered — nothing to rank), then
// narrows further: a tool they said they rarely/never use is excluded (same filtering the 2026
// Digital Skills Self-Assessment survey used), and a tool they rated themselves Advanced/Expert in
// is excluded too (new for the PDP — no point prioritizing training on something they're already
// okay at).
export function computeTrainingPriorityTools(sections: SectionLike[], answers: Record<string, string | string[]>): string[] {
  const selected = computeSelectedTools(sections, answers)
  const result: string[] = []
  for (const section of sections) {
    if (!TOOL_SECTION_KEYS.includes(section.key)) continue
    if (!selected.includes(section.title)) continue
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
