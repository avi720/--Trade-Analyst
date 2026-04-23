/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        green: { DEFAULT: '#2CC84A' },
        red: { DEFAULT: '#FF4D4D' },
        amber: { DEFAULT: '#FFB800' },
      },
      fontFamily: {
        mono: ['"IBM Plex Mono"', 'monospace'],
        sans: ['Assistant', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
