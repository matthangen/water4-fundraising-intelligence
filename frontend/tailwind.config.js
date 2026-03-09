/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        teal:  { DEFAULT: '#1B4D5C', light: '#2A6B7E', bright: '#3A8FA5', dim: '#E8F2F5' },
        gold:  { DEFAULT: '#C4963E', light: '#D4AD5A', dim: '#FDF3E3' },
        cream: '#FDF8F0',
      },
      fontFamily: {
        serif: ['"DM Serif Display"', 'Georgia', 'serif'],
        sans:  ['"DM Sans"', 'system-ui', 'sans-serif'],
        mono:  ['"JetBrains Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
}
