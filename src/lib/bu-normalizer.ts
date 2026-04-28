/**
 * Canonical BU names and all known aliases/abbreviations.
 * Any name coming from an Excel upload passes through normalizeBUName()
 * before being stored so the entire database uses consistent identifiers.
 */

const CANONICAL_NAMES: Record<string, string> = {
  // --- Meristem Securities Limited ---
  'MSL':                               'Meristem Securities Limited',
  'MERISTEM SECURITIES LIMITED':       'Meristem Securities Limited',
  'Meristem Securities':               'Meristem Securities Limited',

  // --- Meristem Stockbrokers Limited ---
  'MSBL':                              'Meristem Stockbrokers Limited',
  'MERISTEM STOCKBROKERS LIMITED':     'Meristem Stockbrokers Limited',
  'Meristem Stockbrokers':             'Meristem Stockbrokers Limited',

  // --- Meristem Wealth Management Limited ---
  'MWML':                                          'Meristem Wealth Management Limited',
  'MERISTEM WEALTH MANAGEMENT LIMITED':            'Meristem Wealth Management Limited',
  'Meristem Wealth Manangement Limited':           'Meristem Wealth Management Limited',  // typo in source
  'MERISTEM WEALTH MANANGEMENT LIMITED':           'Meristem Wealth Management Limited',
  'Meristem Wealth Management':                    'Meristem Wealth Management Limited',

  // --- Meristem Registrars and Probate Services Limited ---
  'MRPSL':                                                    'Meristem Registrars and Probate Services Limited',
  'MERISTEM REGISTRARS AND PROBATE SERVICES LIMITED':         'Meristem Registrars and Probate Services Limited',
  'Meristem Registrars and Probate Services':                 'Meristem Registrars and Probate Services Limited',
  'Meristem Registrar and Probate Services Limited':          'Meristem Registrars and Probate Services Limited',

  // --- Meristem Capital Limited ---
  'MCL':                           'Meristem Capital Limited',
  'MERISTEM CAPITAL LIMITED':      'Meristem Capital Limited',
  'Meristem Capital':              'Meristem Capital Limited',

  // --- Meristem Finance Limited ---
  'MFL':                           'Meristem Finance Limited',
  'MERISTEM FINANCE LIMITED':      'Meristem Finance Limited',
  'Meristem Finance':              'Meristem Finance Limited',

  // --- Meristem Trustees Limited ---
  'MTL':                            'Meristem Trustees Limited',
  'MERISTEM TRUSTEES LIMITED':      'Meristem Trustees Limited',
  'Meristem Trustee Limited':       'Meristem Trustees Limited',   // typo in source (singular)
  'MERISTEM TRUSTEE LIMITED':       'Meristem Trustees Limited',
  'Meristem Trustee':               'Meristem Trustees Limited',

  // --- Meristem Family Office ---
  'MFO':                          'Meristem Family Office',
  'MERISTEM FAMILY OFFICE':       'Meristem Family Office',
}

export function normalizeBUName(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return trimmed

  // Direct lookup (handles abbreviations + exact strings)
  if (CANONICAL_NAMES[trimmed]) return CANONICAL_NAMES[trimmed]

  // Case-insensitive lookup
  const upper = trimmed.toUpperCase()
  for (const [alias, canonical] of Object.entries(CANONICAL_NAMES)) {
    if (alias.toUpperCase() === upper) return canonical
  }

  // Return original if no match found — keeps data from other organisations intact
  return trimmed
}
