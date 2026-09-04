/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'brand-primary': 'rgb(var(--brand-primary) / <alpha-value>)',
        'brand-primary-dark': 'rgb(var(--brand-primary-dark) / <alpha-value>)',
        'brand-on-primary': 'rgb(var(--brand-on-primary) / <alpha-value>)',
        'brand-bg': 'rgb(var(--brand-bg) / <alpha-value>)',
        'brand-surface': 'rgb(var(--brand-surface) / <alpha-value>)',
        'brand-ink': 'rgb(var(--brand-ink) / <alpha-value>)',
        'brand-muted': 'rgb(var(--brand-muted) / <alpha-value>)',
        'brand-border': 'rgb(var(--brand-border) / <alpha-value>)',
        'brand-danger': 'rgb(var(--brand-danger) / <alpha-value>)',
        'brand-amber': 'rgb(var(--brand-amber) / <alpha-value>)',
        'brand-success': 'rgb(var(--brand-success) / <alpha-value>)',
      },
      fontFamily: {
        inter: ['Inter', 'sans-serif'],
        roboto: ['Roboto', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
