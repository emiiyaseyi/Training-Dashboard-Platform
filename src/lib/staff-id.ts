// Canonical form for comparing Staff IDs *across* datasets that may have been entered with
// different punctuation/spacing conventions in different source files (e.g. "MSL-0091" vs
// "MSL0091" vs "msl 0091" — all the same person). Strips everything but letters/digits and
// uppercases, so any of those forms collapse to the same key. Used only for matching/lookup —
// the original value is still stored and displayed as-entered.
export function normalizeStaffIdKey(id: string | null | undefined): string {
  return (id || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}
