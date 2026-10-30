/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,ts}', './index.html'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // S.M.U.V.E Composer Ivory + Teal DAW Theme
        ivory: {
          50: '#FBF7EC',
          100: '#F5EFE0',
          200: '#EBE3CF',
          300: '#DCD0B5',
          400: '#C2B295',
          500: '#9E8E76',
        },
        teal: {
          50: '#E6F5F4',
          100: '#C2E8E6',
          200: '#8FD2CE',
          300: '#5DC4C2',
          400: '#2BA09C',
          500: '#0E7C7B',
          600: '#0A5F5E',
          700: '#08504F',
          800: '#06403F',
          900: '#04302F',
        },
        espresso: {
          50: '#7E7259',
          100: '#5C513E',
          200: '#3D352A',
          300: '#2D271F',
          400: '#1F1A12',
          500: '#14110B',
        },
        // Channel colors (FL Mobile style, harmonized with teal)
        ch: {
          kick: '#EAB308',
          snare: '#F97316',
          clap: '#0EA5E9',
          hat: '#10B981',
          tom: '#84CC16',
          crash: '#EC4899',
          perc: '#A855F7',
        },
        // Legacy aliases (re-mapped to palette) for migration safety
        'fl-blue': '#0E7C7B',
        'brand-primary': '#0E7C7B',
        'brand-secondary': '#5DC4C2',
        'brand-surface': 'var(--ivory-panel, #14192E)',
        'brand-surface-light': 'var(--color-surface-bright, #28304F)',
        'brand-dark': 'var(--ivory-bg, #0B0E1F)',
        'brand-accent': '#D97706',
        'hv-primary': '#D97706',
        'hv-secondary': '#7C3AED',
        'hv-obsidian': '#1F1A12',
        'brand-danger': '#B91C1C',
        'brand-warning': '#D97706',
        'brand-success': '#0E7C7B',
        'brand-muted': '#7E7259',
        // Dim silver helper text (used with /NN opacity variants across
        // the auth card and dashboards — was only ever defined as a CSS
        // var in component styles, so Tailwind never generated it).
        //
        // Text colours resolve through CSS variables so a token can never
        // contradict the surface it lands on: the palette is a night palette
        // in every theme, and these used to be hard-coded light-theme values
        // (#1F1A12 on a #0B0E1F page is invisible). The hex fallbacks match
        // the stylesheet's :root values.
        'silver-dim': 'var(--silver-dim, #E2E9F9)',
        primary: '#0E7C7B',
        secondary: '#5DC4C2',
        accent: '#D97706',
        // Surfaces and borders resolve through the same CSS variables the rest
        // of the stylesheet uses. They were still the old Ivory (cream) hexes,
        // so a page built with `bg-background` rendered a cream sheet inside
        // the night shell and every `text-white` on it disappeared.
        background: 'var(--ivory-bg, #0B0E1F)',
        'background-alt': 'var(--ivory-panel, #14192E)',
        surface: 'var(--ivory-paper, #1A2040)',
        'surface-bright': 'var(--color-surface-bright, #28304F)',
        'text-main': 'var(--text-main, #F4F7FF)',
        'text-dim': 'var(--text-dim, #BCCBE6)',
        border: 'var(--espresso-line, rgba(180, 200, 255, 0.16))',
        'border-bright': 'var(--color-border-bright, rgba(180, 200, 255, 0.26))',
        // Vocal Suite — Neural Lab palette (CSS-var driven for theme)
        'vocal-obsidian': 'var(--vs-obsidian, #07070a)',
        'vocal-oled': 'var(--vs-oled, #0a0a0d)',
        'vocal-titanium': 'var(--vs-titanium, #111116)',
        'vocal-primary': 'var(--vs-primary, #a855f7)',
        'vocal-fl-blue': 'var(--vs-fl-blue, #3b82f6)',
        'fl-border': 'var(--vs-border, rgba(255,255,255,0.06))',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
        display: ['Public Sans', 'Inter', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out',
        'slide-up': 'slideUp 0.4s cubic-bezier(0, 0, 0.2, 1)',
        'pulse-subtle': 'pulseSubtle 3s ease-in-out infinite',
        'pulse-warm': 'pulseWarm 1.2s ease-in-out infinite',
        'teal-glow': 'tealGlow 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        pulseSubtle: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.8' },
        },
        pulseWarm: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(217,119,6,0.5)' },
          '50%': { boxShadow: '0 0 0 12px rgba(217,119,6,0)' },
        },
        tealGlow: {
          '0%, 100%': {
            boxShadow:
              '0 0 0 0 rgba(14,124,123,0.6), 0 0 18px rgba(14,124,123,0.4)',
          },
          '50%': {
            boxShadow:
              '0 0 0 8px rgba(14,124,123,0), 0 0 28px rgba(14,124,123,0.7)',
          },
        },
      },
      boxShadow: {
        'ivory-sm': '0 1px 2px rgba(61,53,42,0.10)',
        'ivory-md': '0 2px 6px rgba(61,53,42,0.14)',
        'ivory-lg': '0 8px 22px rgba(61,53,42,0.18)',
        'ivory-xl': '0 16px 40px rgba(61,53,42,0.24)',
        'teal-glow':
          '0 0 0 2px rgba(14,124,123,0.25), 0 0 16px rgba(14,124,123,0.45)',
        'teal-soft':
          '0 0 0 1px rgba(14,124,123,0.30), 0 2px 8px rgba(14,124,123,0.20)',
        'inset-warm': 'inset 0 2px 6px rgba(61,53,42,0.20)',
        'v42-sm': '0 1px 3px 0 rgba(61,53,42,0.10)',
        'v42-md': '0 4px 10px rgba(61,53,42,0.14)',
        'v42-lg': '0 10px 22px rgba(61,53,42,0.18)',
        'v42-xl': '0 20px 40px rgba(61,53,42,0.24)',
      },
    },
  },
  plugins: [],
};
