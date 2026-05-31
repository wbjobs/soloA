/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        medical: {
          primary: '#1e40af',
          secondary: '#065f46',
          dark: '#0f172a',
          darker: '#020617',
        },
      },
    },
  },
  plugins: [],
};
