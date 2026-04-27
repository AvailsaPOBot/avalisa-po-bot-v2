/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}', './public/index.html'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#f5f3ff',
          100: '#ede9fe',
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
          700: '#6d28d9',
          900: '#2e1a3a',
        },
        dark: {
          900: '#0f0f23',
          800: '#1a1a2e',
          700: '#16213e',
          600: '#2d2d5b',
        },
        'bg-base': '#0a0a0f',
        'bg-surface': '#14141d',
        'bg-elevated': '#1c1c28',
        'text-primary': '#ededed',
        'text-muted': '#8a8a93',
        'accent-gold': '#d4a256',
        'accent-gold-soft': '#a37f3e',
        'accent-jade': '#4a9b7e',
        'accent-crimson': '#c44545',
        'accent-lifetime': '#a78bfa',
      },
      fontFamily: {
        display: ['Fraunces', 'serif'],
        sans: ['Geist', 'sans-serif'],
        mono: ['Geist Mono', 'monospace'],
      },
    },
  },
  plugins: [],
};
