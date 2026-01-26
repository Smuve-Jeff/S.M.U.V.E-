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
          primary: '#10b981', // Emerald 500
          secondary: '#38bdf8', // Sky 400
          accent: '#8b5cf6', // Violet 500
          danger: '#ef4444', // Red 500
          warning: '#f59e0b', // Amber 500
          success: '#22c55e', // Green 500
        },
        obsidian: {
          DEFAULT: '#020617',
          light: '#0f172a',
          deep: '#010413',
        },
        cyber: {
          cyan: '#10b981', // Map old cyber colors to new brand colors for compatibility
          pink: '#8b5cf6',
          indigo: '#6366f1',
          green: '#22c55e',
          yellow: '#f59e0b',
          red: '#ef4444',
        },
      },
      animation: {
        'spin-slow': 'spin 12s linear infinite',
        'pulse-fast': 'pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        float: 'float 6s ease-in-out infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic':
          'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
      },
    },
  },
  plugins: [],
};
