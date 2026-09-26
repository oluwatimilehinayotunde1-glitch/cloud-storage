/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef4ff',
          100: '#d9e6ff',
          200: '#b3ccff',
          300: '#82abff',
          400: '#5083ff',
          500: '#2b5cf6',
          600: '#1c40db',
          700: '#1731ab',
          800: '#162a87',
          900: '#16266b',
        },
      },
    },
  },
  plugins: [],
};
