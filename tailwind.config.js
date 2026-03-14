/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,ts}', './index.html'],
  theme: {
    extend: {
      colors: {
        brand: {
          dark: '#020617', // Slate 950
          surface: '#0f172a', // Slate 900
          'surface-light': '#1e293b', // Slate 800
          primary: '#10b981', // Emerald 500 (Refined)
          secondary: '#38bdf8', // Sky 400
          accent: '#6366f1', // Indigo 500
          danger: '#f43f5e', // Rose 500
          warning: '#f59e0b', // Amber 500
          success: '#10b981', // Emerald 500
          muted: '#64748b', // Slate 500
        },
        obsidian: {
          DEFAULT: '#020617',
          light: '#0f172a',
          deep: '#010413',
        },
        silver: {
          DEFAULT: '#cbd5e1', // Slate 300
          bright: '#f8fafc', // Slate 50
          dim: '#94a3b8', // Slate 400
        },
        "primary": "#ec5b13",
        "background-light": "#f8f6f6",
        "background-dark": "#221610",
        "extreme-obsidian": "#0d0d0d",
        "extreme-titanium": "#2a2a2a",
        "accent-purple": "#a855f7",
        "accent-magenta": "#d946ef",
        "extreme-surface": "#3a2a1f",
        "extreme-panel": "#2d1e16",
        "extreme-titanium-dark": "#1a1a1a",
        vocal: {
          primary: '#9d00ff',
          'background-light': '#f7f5f8',
          'background-dark': '#0a060c',
          obsidian: '#140c1a',
          titanium: '#2d2433',
          oled: '#020102'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['Fira Code', 'monospace'],
        display: ["Public Sans", 'Inter', 'sans-serif'],
        display: ['Inter', 'sans-serif'],
        'vocal-display': ['Public Sans', 'sans-serif'],
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
    },
  },
  plugins: [],
};
