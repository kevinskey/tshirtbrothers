import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        serif: ['"Playfair Display"', 'Georgia', 'serif'],
      },
      colors: {
        ink: {
          50: '#f8f8f7',
          100: '#e9e8e4',
          200: '#d3d1c9',
          400: '#8a8679',
          600: '#4a4740',
          800: '#252320',
          900: '#14130f',
        },
        accent: {
          DEFAULT: '#c9a662',
          hover: '#b8964f',
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
