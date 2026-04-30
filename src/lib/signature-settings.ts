export interface SignatureSettings {
  primaryName: string
  primaryTitle: string
  secondaryName: string
  secondaryTitle: string
  organisationLine: string
}

export const DEFAULT_SIGNATURE: SignatureSettings = {
  primaryName: '',
  primaryTitle: 'Head, Learning & Development',
  secondaryName: '',
  secondaryTitle: 'Business Unit Head',
  organisationLine: 'Meristem Learning & Development',
}

const KEY = 'lid_signature_settings'

export function loadSignatureSettings(): SignatureSettings {
  if (typeof window === 'undefined') return DEFAULT_SIGNATURE
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...DEFAULT_SIGNATURE, ...JSON.parse(raw) } : DEFAULT_SIGNATURE
  } catch {
    return DEFAULT_SIGNATURE
  }
}

export function saveSignatureSettings(s: SignatureSettings): void {
  localStorage.setItem(KEY, JSON.stringify(s))
}
