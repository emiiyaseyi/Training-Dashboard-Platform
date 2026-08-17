import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
        // Report design system — extracted from the Meristem L&D Investment Report deck theme
        navy: {
          50:  '#F5F7FC',
          100: '#E2E6F0',
          200: '#CADCFC',
          300: '#9AA5C7',
          400: '#5C6690',
          500: '#3D4670',
          600: '#1E2761',
          700: '#1B1F3B',
          800: '#151833',
          900: '#0F1224',
        },
        gold: {
          50:  '#FBF6EA',
          100: '#F3E5C0',
          200: '#E6CD8F',
          300: '#D8B75F',
          400: '#C9A24B',
          500: '#B8903A',
          600: '#9C7A2F',
          700: '#7C6125',
          800: '#5E491C',
          900: '#403213',
        },
        report: {
          green: '#1F9D6C',
          red: '#C0392B',
          gray: '#6B7280',
        },
        sidebar: '#0f172a',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        serif: ['var(--font-report-serif)', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
}

export default config
