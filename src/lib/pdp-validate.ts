import { TOOL_SECTION_KEYS } from './pdp-wrapup'

export interface PDPFormAnswers {
  // Every non-repeating section's answers, keyed by PDPQuestion.id.
  answers: Record<string, string | string[]>
  // One entry per "Development Need" the respondent added (the 'development_needs' section's
  // repeating block), each keyed by that section's own question ids.
  developmentNeeds: Record<string, string | string[]>[]
}

export interface PDPQuestionLike {
  id: string
  label: string
  type: string
  required: boolean
  maxSelect: number | null
  showIfQuestionId?: string | null
  showIfEquals?: string | null
}

export interface PDPSectionLike {
  key: string
  title: string
  enabled: boolean
  maxRepeats: number
  questions: PDPQuestionLike[]
}

function isEmpty(v: string | string[] | undefined): boolean {
  return v == null || (Array.isArray(v) ? v.length === 0 : !String(v).trim())
}

// A conditional question (e.g. "Which of these would help you most…", shown only after "Do you
// require training in Word?" is answered Yes) is skipped by both validators below when its
// condition isn't met — never required, never counted against maxSelect, exactly as if it weren't
// on the page at all.
function isVisible(q: PDPQuestionLike, values: Record<string, string | string[]>): boolean {
  if (!q.showIfQuestionId) return true
  return values[q.showIfQuestionId] === q.showIfEquals
}

function asStringArray(v: string | string[] | undefined): string[] {
  if (Array.isArray(v)) return v
  if (typeof v === 'string' && v) return [v]
  return []
}

const TOOL_GATE_KEY = 'digital_skill_tool_selection'

// A tool section the respondent never selected on the gating question ("Which of these do you
// use, or expect to use…") was never shown to them client-side — none of its questions were ever
// answerable. Without this check, server-side validation still demanded every tool section's
// required fields regardless of the gate, which made Submit permanently fail for anyone who
// deselected a tool (the exact bug this fixes). Mirrors isToolSectionVisible in pdp-wrapup.ts, but
// kept local since that one's typed against the client PDPQuestion shape, not PDPQuestionLike.
// A cycle seeded before the gate existed has no gate section at all — every tool section stays
// visible then, matching the client's own fallback.
function isSectionVisibleForGate(section: PDPSectionLike, allSections: PDPSectionLike[], answers: Record<string, string | string[]>): boolean {
  if (!TOOL_SECTION_KEYS.includes(section.key)) return true
  const gate = allSections.find((s) => s.key === TOOL_GATE_KEY)
  const gateQuestion = gate?.questions[0]
  if (!gateQuestion) return true
  return asStringArray(answers[gateQuestion.id]).includes(section.title)
}

// Client-side, single-page check used by the public pages to block "Next"/"Submit" before the
// request even goes out — the same required/maxSelect rules validatePDPFormAnswers enforces
// server-side, scoped to just the questions on the page currently showing. Returns the first
// problem found, or null when the page is complete.
export function firstPageIssue(questions: PDPQuestionLike[], values: Record<string, string | string[]>): string | null {
  for (const q of questions) {
    if (!isVisible(q, values)) continue
    if (q.required && isEmpty(values[q.id])) return `"${q.label}" is required.`
    if (q.type === 'multiselect' && q.maxSelect != null) {
      const v = values[q.id]
      if (Array.isArray(v) && v.length > q.maxSelect) return `"${q.label}" allows at most ${q.maxSelect} selection(s).`
    }
  }
  return null
}

// Shared across every submit route (staff self-fill, manager validation, manager team-fill
// per-member save) so the same rules apply everywhere a PDPFormAnswers object is accepted.
// Validates required fields, maxSelect caps, and any repeating section (maxRepeats > 1 — not
// just 'development_needs' by name, so a second repeating section like 'manager_need_review',
// which shares the same developmentNeeds array slot-for-slot with the respondent's own needs,
// gets the same at-least-one/never-more-than-maxRepeats/per-index rules for free).
// Returns an error string, or null when valid.
export function validatePDPFormAnswers(formAnswers: PDPFormAnswers, sections: PDPSectionLike[]): string | null {
  for (const section of sections) {
    if (!section.enabled) continue
    if (!isSectionVisibleForGate(section, sections, formAnswers.answers)) continue

    if (section.maxRepeats > 1) {
      const needs = formAnswers.developmentNeeds || []
      if (needs.length === 0) return `At least one "${section.title}" entry is required.`
      if (needs.length > section.maxRepeats) return `At most ${section.maxRepeats} "${section.title}" entries can be added — ${needs.length} were added.`
      for (let i = 0; i < needs.length; i++) {
        for (const q of section.questions) {
          if (!isVisible(q, needs[i])) continue
          if (q.required && isEmpty(needs[i][q.id])) return `${section.title} ${i + 1}: "${q.label}" is required.`
          if (q.type === 'multiselect' && q.maxSelect != null) {
            const v = needs[i][q.id]
            if (Array.isArray(v) && v.length > q.maxSelect) return `${section.title} ${i + 1}: "${q.label}" allows at most ${q.maxSelect} selection(s).`
          }
        }
      }
      continue
    }

    for (const q of section.questions) {
      if (!isVisible(q, formAnswers.answers)) continue
      const v = formAnswers.answers[q.id]
      if (q.required && isEmpty(v)) return `"${q.label}" is required.`
      if (q.type === 'multiselect' && q.maxSelect != null && Array.isArray(v) && v.length > q.maxSelect) {
        return `"${q.label}" allows at most ${q.maxSelect} selection(s).`
      }
    }
  }
  return null
}
