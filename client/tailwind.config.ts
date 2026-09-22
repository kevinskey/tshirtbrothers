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
        // Custom Gift Club (sister brand) — same TSB orange, plus the
        // cream/warm-neutral surfaces and charcoal ink of the approved
        // CGC design. Scoped under cgc-* so TSB pages are untouched.
        cgc: {
          orange: '#f97316',
          'orange-dark': '#ea580c',
          cream: '#f7f1e8',
          'cream-deep': '#efe6d8',
          ink: '#141210',
          charcoal: '#2b2420',
          stone: '#6f655c',
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
