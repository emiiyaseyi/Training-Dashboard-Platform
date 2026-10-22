export type PDPPriority = 'high' | 'medium' | 'low' | 'not-needed'

export interface PDPAnswers {
  capabilities: Record<string, { priority: PDPPriority; action: string }>
  customEntries: { label: string; priority: PDPPriority; action: string }[]
  questionAnswers?: Record<string, string | string[]>
}

export interface PDPQuestionLike {
  id: string
  label: string
  required: boolean
}

// Shared across all three submit routes (staff self-fill, manager validation, manager team-fill
// per-member save) so the same rules apply everywhere a PDPAnswers object is accepted — the cap on
// selected capabilities, the admin-configurable "Action required" toggle, and required extra
// questions. Returns an error string, or null when valid.
export function validatePDPAnswers(
  answers: PDPAnswers,
  opts: { maxCapabilities: number | null; actionRequired: boolean; questions: PDPQuestionLike[] }
): string | null {
  const selectedCount = Object.values(answers.capabilities || {}).filter((c) => c.priority !== 'not-needed').length + (answers.customEntries?.length || 0)
  if (opts.maxCapabilities != null && selectedCount > opts.maxCapabilities) {
    return `At most ${opts.maxCapabilities} capabilities/needs can be selected — ${selectedCount} were selected.`
  }

  if (opts.actionRequired) {
    for (const [name, c] of Object.entries(answers.capabilities || {})) {
      if (c.priority !== 'not-needed' && !c.action?.trim()) {
        return `A development action is required for "${name}".`
      }
    }
  }

  const qa = answers.questionAnswers || {}
  for (const q of opts.questions) {
    if (!q.required) continue
    const v = qa[q.id]
    const empty = v == null || (Array.isArray(v) ? v.length === 0 : !String(v).trim())
    if (empty) return `"${q.label}" is required.`
  }

  return null
}
