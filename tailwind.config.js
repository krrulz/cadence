/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // --- Aurora dark design system ---
        // Layered dark surfaces, hairline borders, and an ink text ramp.
        surface: {
          DEFAULT: '#080B14', // app canvas
          1: '#0E1424', // raised panel
          2: '#141C30', // card / popover
          3: '#1B2340', // hover / active
          border: 'rgba(255,255,255,0.09)',
          hover: 'rgba(255,255,255,0.05)',
        },
        ink: {
          DEFAULT: '#E7ECF5', // primary text
          muted: '#93A1C4', // secondary text
          faint: '#7E8AA8', // labels / captions
        },
        // Vibrant on-dark brand green (the light brand ramp reads too dark here).
        mint: {
          DEFAULT: '#00E28E',
          soft: '#3BE3B0',
          deep: '#00C27A',
        },
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
