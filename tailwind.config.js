/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,ts}', './index.html'],
  theme: {
    extend: {
      colors: {
        primary: "#25f46a",
        "background-dark": "#050706",
        obsidian: "#080c09",
        silver: "#c0c0c0",
        gold: "#f2b90d",
        "danger-orange": "#f48525",
        "industrial-steel": "#2d2d2d",
        "neon-pink": "#f4258c",
        "electric-violet": "#af25f4",
      },
      fontFamily: {
        display: ["Space Grotesk", "sans-serif"]
      },
    },
  },
  plugins: [],
};
