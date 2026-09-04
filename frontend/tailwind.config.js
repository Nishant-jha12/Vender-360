/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'brand-teal': 'rgb(var(--brand-teal) / <alpha-value>)',
        'brand-teal-dark': 'rgb(var(--brand-teal-dark) / <alpha-value>)',
        'brand-amber': 'rgb(var(--brand-amber) / <alpha-value>)',
        'brand-bg': 'rgb(var(--brand-bg) / <alpha-value>)',
        'brand-surface': 'rgb(var(--brand-surface) / <alpha-value>)',
        'brand-ink': 'rgb(var(--brand-ink) / <alpha-value>)',
        'brand-muted': 'rgb(var(--brand-muted) / <alpha-value>)',
        'brand-border': 'rgb(var(--brand-border) / <alpha-value>)',
        'brand-danger': 'rgb(var(--brand-danger) / <alpha-value>)',
      },
      fontFamily: {
        poppins: ['Poppins', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
