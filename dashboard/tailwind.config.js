/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}', './public/index.html'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#fff8eb',
          100: '#f7e6c4',
          400: '#d4a256',
          500: '#c49145',
          600: '#a97832',
          700: '#8b6129',
          900: '#332413',
        },
        dark: {
          900: '#0a0a0f',
          800: '#14141d',
          700: '#1c1c28',
          600: '#343442',
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
