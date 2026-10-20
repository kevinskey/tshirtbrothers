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
        // All Print Club (sister brand, allprintclub.com) — working-press
        // blue + cool paper neutrals with a yellow accent. Scoped under
        // apc-* so TSB and CGC pages are untouched.
        apc: {
          blue: '#2563eb',
          'blue-dark': '#1d4ed8',
          paper: '#f1f5f9',
          'paper-deep': '#e2e8f0',
          ink: '#0f172a',
          charcoal: '#334155',
          slate: '#64748b',
          accent: '#facc15',
        },
        // Live Hard Truth (sister brand, livehardtruth.com) — dark luxe
        // streetwear: near-black ink surfaces, warm cream type, electric
        // cyan accent, plus the collection's signature colorways. Scoped
        // under lht-* so TSB, CGC and APC pages are untouched.
        lht: {
          cyan: '#00d6e4',
          'cyan-dark': '#00b6c2',
          ink: '#141212',
          'ink-soft': '#1d1a1a',
          cream: '#f7f3eb',
          stone: '#a39b8f',
          espresso: '#593f30',
          merlot: '#511f32',
          olive: '#4b5534',
          ember: '#a44725',
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
        // Live Hard Truth brand faces (loaded at runtime by LhtApp).
        'lht-display': ['"Archivo Black"', 'system-ui', 'sans-serif'],
        'lht-serif': ['"Playfair Display"', 'Georgia', 'serif'],
        'lht-sans': ['Hind', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
