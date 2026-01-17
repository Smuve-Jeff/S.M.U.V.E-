/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,ts}', './index.html'],
  theme: {
    extend: {
      colors: {
        obsidian: {
          DEFAULT: '#020205',
          light: '#05050d',
          deep: '#010103',
        },
        cyber: {
          cyan: '#00f2ff',
          pink: '#ff00ea',
          indigo: '#7000ff',
          green: '#00ffa3',
          yellow: '#ffe600',
          red: '#ff003c',
        }
      },
      animation: {
        'spin-slow': 'spin 12s linear infinite',
        'pulse-fast': 'pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'float': 'float 6s ease-in-out infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        }
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
      },
    },
  },
  plugins: [],
};
