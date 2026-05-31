/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        space: {
          950: '#0a0a1a',
          900: '#0f0f2a',
          800: '#1a1a3a',
          700: '#252550',
          600: '#353570'
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Monaco', 'Consolas', 'monospace']
      }
    }
  },
  plugins: []
};
