/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,ts}', './index.html'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // S.M.U.V.E 4.2 Professional Palette (Explicit for JIT)
        'primary': '#10b981',
        'secondary': '#6366f1',
        'accent': '#f59e0b',
        'background': 'var(--color-bg)',
        'background-alt': 'var(--color-bg-alt)',
        'surface': 'var(--color-surface)',
        'surface-bright': 'var(--color-surface-bright)',
        'text-main': 'var(--color-text)',
        'text-dim': 'var(--color-text-dim)',
        'border': 'var(--color-border)',
        'border-bright': 'var(--color-border-bright)',

        // Brand Legacy compatibility (Flattened for better JIT support)
        'brand-dark': '#020617',
        'brand-surface': '#0f172a',
        'brand-surface-light': '#1e293b',
        'brand-primary': '#10b981',
        'brand-secondary': '#38bdf8',
        'brand-accent': '#6366f1',
        'brand-danger': '#f43f5e',
        'brand-warning': '#f59e0b',
        'brand-success': '#10b981',
        'brand-muted': '#64748b',

        // Legacy/Specialized View Support
        'hv-primary': '#ec5b13',
        'hv-secondary': '#a855f7',
        'hv-obsidian': '#050505'
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['Fira Code', 'monospace'],
        display: ['Public Sans', 'Inter', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out',
        'slide-up': 'slideUp 0.4s cubic-bezier(0, 0, 0.2, 1)',
        'pulse-subtle': 'pulseSubtle 3s ease-in-out infinite',
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
        }
      },
      boxShadow: {
        'v42-sm': 'var(--shadow-sm)',
        'v42-md': 'var(--shadow-md)',
        'v42-lg': 'var(--shadow-lg)',
        'v42-xl': 'var(--shadow-xl)',
      }
    },
  },
  plugins: [],
};
