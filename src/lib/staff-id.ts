// Canonical form for comparing Staff IDs *across* datasets that may have been entered with
// different punctuation/spacing conventions in different source files (e.g. "MSL-0091" vs
// "MSL0091" vs "msl 0091" — all the same person). Strips everything but letters/digits and
// uppercases, so any of those forms collapse to the same key.
//
// Also collapses leading zeros on the trailing numeric run (e.g. "MSL-0401" and "MSL-401" both
// become "MSL401") — confirmed via a real PDP launch where several people appeared as TWO
// separate roster entries, and so two separate survey rows, purely because one source file had
// them zero-padded and another didn't (e.g. "Laura Osemudianmen Ogundeji" as both MSBL-109 and
// MSBL-0109). Only the FIRST run of letters and the LEADING zeros immediately after it are
// touched — zeros elsewhere in the id (e.g. the "00" in "MSL1005") are left alone, since those
// aren't padding, they're part of the number itself. Used only for matching/lookup — the
// original value is still stored and displayed as-entered.
export function normalizeStaffIdKey(id: string | null | undefined): string {
  const stripped = (id || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  return stripped.replace(/^([A-Z]+)0*(\d+)$/, '$1$2')
}
