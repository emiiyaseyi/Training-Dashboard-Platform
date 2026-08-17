// Shared design tokens for the L&D Investment Report visual system.
// Extracted from the source deck's theme XML and slide fill colors — see plan for provenance.
// Used by React components (Tailwind navy-*/gold-* scale mirrors these) and the PPTX export engine.

export const REPORT_COLORS = {
  navy: '#1E2761',
  navyDark: '#1B1F3B',
  navyLight: '#CADCFC',
  gray: '#6B7280',
  panelBg: '#E2E6F0',
  pageBg: '#F5F7FC',
  green: '#1F9D6C',
  gold: '#C9A24B',
  red: '#C0392B',
  white: '#FFFFFF',
} as const

// Ordered palette for multi-slice charts — leads with the deck's core three, then extends
// with muted variants so charts with more categories (e.g. top membership orgs) stay distinct.
export const REPORT_PALETTE = [
  REPORT_COLORS.navy,
  REPORT_COLORS.gold,
  REPORT_COLORS.green,
  REPORT_COLORS.red,
  '#5C6690', // navy-400
  '#9C7A2F', // gold-600
  '#3D4670', // navy-500
  '#D8B75F', // gold-300
  '#9AA5C7', // navy-300
  '#7C6125', // gold-700
]

// Same hex values without the leading '#', for pptxgenjs (which expects bare hex strings)
export const REPORT_COLORS_HEX = Object.fromEntries(
  Object.entries(REPORT_COLORS).map(([k, v]) => [k, v.replace('#', '')])
) as Record<keyof typeof REPORT_COLORS, string>

export const REPORT_FONT_SERIF = 'var(--font-report-serif, Georgia, serif)'
export const REPORT_FONT_SANS = 'var(--font-inter, Inter, system-ui, sans-serif)'
