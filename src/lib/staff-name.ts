// A middle name entered as just "-" (or similar placeholder punctuation, sometimes with stray
// whitespace around it) turns up across a lot of this app's roster data — almost certainly from a
// source sheet that used a dash to mean "no middle name", imported literally instead of as blank.
// Left as-is, it becomes a real word in anyone's built display name ("Onyekachi - Duru" instead of
// "Onyekachi Duru"), which then silently breaks any exact-string name match elsewhere (Talent
// Member roster/exemptions, custom survey audiences, etc.) against the same person typed normally.
function isBlankNamePart(part: string | null | undefined): boolean {
  return !part || /^[\s\-‐-―.]+$/.test(part)
}

export function buildFullName(firstName: string, middleName: string | null | undefined, lastName: string): string {
  return [firstName, isBlankNamePart(middleName) ? null : middleName, lastName].filter(Boolean).join(' ')
}

// Same real person named differently across two rows (a middle name present on one, dropped on
// the other — "Olabanjo John Igunnu" vs "Olabanjo Igunnu") still needs to match when there's no
// Staff ID to key off instead. Only the FIRST and LAST whitespace-separated tokens have to match —
// anything in between is treated as an optional middle name, same tolerance buildFullName gives
// dash-only middle names above.
export function firstLastNameKey(fullName: string): string {
  const tokens = fullName.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return ''
  if (tokens.length === 1) return tokens[0]
  return `${tokens[0]}|${tokens[tokens.length - 1]}`
}
