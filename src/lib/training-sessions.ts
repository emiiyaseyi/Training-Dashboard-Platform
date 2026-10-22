export interface TrainingSession {
  date: string // YYYY-MM-DD
  startTime?: string | null // free text, e.g. "10:00 AM"
  endTime?: string | null
}

export function parseSessionDates(raw: string | null | undefined): TrainingSession[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((s): s is TrainingSession => !!s && typeof s.date === 'string' && !Number.isNaN(new Date(s.date).getTime()))
      .sort((a, b) => a.date.localeCompare(b.date))
  } catch {
    return []
  }
}

// A multi-session training's startDate/endDate are kept as the min/max of its session list (first
// session / last session) so every piece of Pre/Post-1/Post-2 timing logic elsewhere in this
// codebase (which only knows about startDate/endDate) keeps working unchanged — this is the one
// place that derivation happens, called from both the create and update training-schedule routes.
export function deriveDateRangeFromSessions(sessions: TrainingSession[]): { startDate: Date; endDate: Date } | null {
  if (sessions.length === 0) return null
  const dates = sessions.map((s) => new Date(s.date).getTime())
  return { startDate: new Date(Math.min(...dates)), endDate: new Date(Math.max(...dates)) }
}
