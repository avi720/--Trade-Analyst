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
        'text-main': '#E0E0E0',
        'text-dim': '#B0B0B0',
        'text-mute': '#888888',
        'text-fade': '#666666',
        'text-faint': '#444444',
        'input-bg': '#1A1A1A',
        'bg-dark': '#080808',
        'panel-2': '#0D0D0D',
        'panel-3': '#161616',
        'amber-tint': '#1A1200',
        'red-tint': '#1a0808',
        'red-shade': '#3a1212',
        'green-tint': '#0d1f12',
        'shade': '#333333',
        'shade-2': '#444444',
      },
      fontFamily: {
        mono: ['var(--font-ibm-plex-mono)', '"IBM Plex Mono"', 'monospace'],
        sans: ['var(--font-assistant)', 'Assistant', 'sans-serif'],
      },
      backgroundColor: {
        dark: '#080808',
      },
    },
  },
  plugins: [],
}

export default config
