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
