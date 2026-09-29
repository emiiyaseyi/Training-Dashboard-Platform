// Normalizes a training name for MATCHING/GROUPING purposes only (never for display — the
// original text is always what's shown). Different upload sources routinely spell the "same"
// training slightly differently in ways that are invisible on screen but break an exact-string
// match: a curly apostrophe (') from a pasted Word/Sheet title vs. a straight one (') from manual
// entry, doubled spaces, stray leading/trailing whitespace. Without this, the exact same training
// silently splits into separate cohorts (Trainings Missing Details, Possible Duplicate Trainings,
// the main records grouping) purely because of how the name happened to be typed that one time.
export function normalizeTrainingNameKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[‘’ʼ´`]/g, "'") // curly/alternate single quotes -> straight
    .replace(/[“”]/g, '"') // curly double quotes -> straight
    .replace(/\s+/g, ' ') // collapse runs of whitespace
}
