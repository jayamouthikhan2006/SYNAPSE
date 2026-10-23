/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'sans-serif'] },
      colors: {
        navy: { 950: '#0a1230', 900: '#0f1b3d', 800: '#16254f', 700: '#1f3166' },
        brand: { DEFAULT: '#2f5bea', 50: '#eef3ff', 100: '#dde7ff', 600: '#2549c9', 700: '#1d3aa3' },
        ink: { DEFAULT: '#1e2a44', soft: '#5b6b8c', faint: '#8a97b2' },
        line: '#e6eaf2',
        surface: '#f4f6fb',
      },
      boxShadow: { card: '0 1px 2px rgba(16,24,40,.04), 0 1px 3px rgba(16,24,40,.06)', pop: '0 10px 30px rgba(16,24,40,.12)' },
    },
  },
  plugins: [],
}
