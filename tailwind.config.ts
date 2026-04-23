import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        green: { DEFAULT: '#2CC84A', dark: '#1fa037' },
        red: { DEFAULT: '#FF4D4D', dark: '#cc3d3d' },
        amber: { DEFAULT: '#FFB800', dark: '#cc9300' },
        panel: '#111111',
        border: '#222222',
        'text-dim': '#888888',
        'input-bg': '#1A1A1A',
      },
      fontFamily: {
        mono: ['"IBM Plex Mono"', 'monospace'],
        sans: ['Assistant', 'sans-serif'],
      },
      backgroundColor: {
        dark: '#080808',
      },
    },
  },
  plugins: [],
}

export default config
