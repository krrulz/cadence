/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Primary brand color — inspired by BNP Paribas Fortis' signature green.
        // Used for buttons, active nav state, key stats, and links.
        brand: {
          DEFAULT: '#00965E',
          50: '#E6F6EF',
          100: '#C0EBDA',
          200: '#8AD6B6',
          300: '#54C193',
          400: '#22AC72',
          500: '#00965E',
          600: '#007F4F',
          700: '#00693F',
          800: '#005230',
          900: '#003B22',
        },
        // Secondary accent — a professional violet in the spirit of Expleo's brand accent.
        // Used sparingly for badges, highlights, and section headers.
        accent: {
          DEFAULT: '#6B3FA0',
          50: '#F3EEF9',
          100: '#E4D6F0',
          200: '#C9ADE0',
          300: '#AE85D1',
          400: '#935CC1',
          500: '#6B3FA0',
          600: '#5F3690',
          700: '#5B2A86',
          800: '#452066',
          900: '#301747',
        },
      },
    },
  },
  plugins: [],
}
