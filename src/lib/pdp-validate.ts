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

// Client-side, single-page check used by the public pages to block "Next"/"Submit" before the
// request even goes out — the same required/maxSelect rules validatePDPFormAnswers enforces
// server-side, scoped to just the questions on the page currently showing. Returns the first
// problem found, or null when the page is complete.
export function firstPageIssue(questions: PDPQuestionLike[], values: Record<string, string | string[]>): string | null {
  for (const q of questions) {
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
// Validates required fields, maxSelect caps, and the repeating 'development_needs' section
// (at least one need, each one fully answered, never more than the section's maxRepeats).
// Returns an error string, or null when valid.
export function validatePDPFormAnswers(formAnswers: PDPFormAnswers, sections: PDPSectionLike[]): string | null {
  for (const section of sections) {
    if (!section.enabled) continue

    if (section.key === 'development_needs') {
      const needs = formAnswers.developmentNeeds || []
      if (needs.length === 0) return 'At least one Development Need is required.'
      if (needs.length > section.maxRepeats) return `At most ${section.maxRepeats} Development Need(s) can be added — ${needs.length} were added.`
      for (let i = 0; i < needs.length; i++) {
        for (const q of section.questions) {
          if (q.required && isEmpty(needs[i][q.id])) return `Development Need ${i + 1}: "${q.label}" is required.`
          if (q.type === 'multiselect' && q.maxSelect != null) {
            const v = needs[i][q.id]
            if (Array.isArray(v) && v.length > q.maxSelect) return `Development Need ${i + 1}: "${q.label}" allows at most ${q.maxSelect} selection(s).`
          }
        }
      }
      continue
    }

    for (const q of section.questions) {
      const v = formAnswers.answers[q.id]
      if (q.required && isEmpty(v)) return `"${q.label}" is required.`
      if (q.type === 'multiselect' && q.maxSelect != null && Array.isArray(v) && v.length > q.maxSelect) {
        return `"${q.label}" allows at most ${q.maxSelect} selection(s).`
      }
    }
  }
  return null
}
