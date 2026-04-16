import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        serif: ['"Playfair Display"', 'Georgia', 'serif'],
      },
      colors: {
        // Kept for backward compat — now tuned to the garden theme
        ink: {
          50: '#f8faf2',
          100: '#eef2e2',
          200: '#d9e2c0',
          400: '#8a9472',
          600: '#4a5c40',
          800: '#2a3826',
          900: '#141a10',
        },
        accent: {
          DEFAULT: '#d4a845', // warm sun-gold
          hover: '#b8902f',
        },
        // Garden palette
        meadow: {
          50:  '#f8faf2',
          100: '#eef2e2',
          200: '#d9e2c0',
          300: '#b9cc98',
          400: '#8eb063',
          500: '#6b8f42',
          600: '#527132',
          700: '#3d5525',
          800: '#2a3826',
          900: '#141a10',
        },
        sun: {
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#f5c842',
          500: '#e6b020',
          600: '#c69209',
        },
        petal: {
          300: '#f2c6c6',
          400: '#e89b9b',
          500: '#dc7878',
        },
        sky_soft: {
          200: '#cfe7f2',
          300: '#a7d4e8',
          400: '#78bdd8',
        },
      },
      backgroundImage: {
        'garden-gradient': 'linear-gradient(180deg, #f8faf2 0%, #eef2e2 100%)',
        'sun-gradient': 'radial-gradient(ellipse at top, #fef3c7 0%, #f8faf2 55%)',
        'meadow-gradient': 'linear-gradient(180deg, #fef3c7 0%, #f8faf2 18%, #eef2e2 100%)',
      },
    },
  },
  plugins: [],
} satisfies Config;
