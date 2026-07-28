import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1280px',
      },
    },
    extend: {
      colors: {
        red: {
          DEFAULT: '#f97316',
          dark: '#ea580c',
          light: '#fff7ed',
        },
        // Swing & Fling venue palette — a deliberately playful, multi-color
        // set. Each nav tab / attraction card leans on a different one so the
        // homepage reads as fun-and-colorful (mini golf greens, sky blues,
        // sunny yellows, axe-throwing reds).
        fling: {
          green: '#16a34a',
          teal: '#14b8a6',
          blue: '#0ea5e9',
          yellow: '#facc15',
          orange: '#f97316',
          pink: '#ec4899',
          purple: '#8b5cf6',
          red: '#ef4444',
          ink: '#0f172a',
        },
        brand: {
          black: '#0a0a0a',
          gray: {
            50: '#fafafa',
            100: '#f5f5f5',
            200: '#e5e5e5',
            300: '#d4d4d4',
            400: '#a3a3a3',
            500: '#737373',
            600: '#525252',
            700: '#404040',
            800: '#262626',
            900: '#171717',
          },
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Space Grotesk', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
