/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'game-bg': '#0a0a1a',
        'game-primary': '#6366f1',
        'game-secondary': '#ec4899',
        'game-perfect': '#22c55e',
        'game-good': '#eab308',
        'game-miss': '#ef4444',
        'game-note': '#a855f7',
      },
      animation: {
        'note-fall': 'noteFall 2s linear',
        'pulse-fast': 'pulse 0.5s ease-in-out infinite',
        'glow': 'glow 1.5s ease-in-out infinite alternate',
      },
      keyframes: {
        noteFall: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' },
        },
        glow: {
          '0%': { boxShadow: '0 0 5px #6366f1, 0 0 10px #6366f1' },
          '100%': { boxShadow: '0 0 20px #6366f1, 0 0 30px #6366f1' },
        }
      }
    },
  },
  plugins: [],
}
