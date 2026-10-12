/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['"Noto Sans Thai"', 'Inter', 'system-ui', 'sans-serif'] },
      colors: { navy: { 900: '#0b2a5b', 800: '#10357a', 700: '#1a4799' } },
    },
  },
  plugins: [],
};
