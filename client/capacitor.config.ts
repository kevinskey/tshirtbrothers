import type { CapacitorConfig } from '@capacitor/cli';

// iOS app ships the SPA build (dist/) inside the bundle — not a website
// wrapper (Kevin, 2026-10-14). src/lib/nativeApi.ts rewrites the app's
// relative '/api' fetches to https://tshirtbrothers.com at runtime, so the
// web build and the app build are the same artifact. Updating the app's UI
// means npm run build && npx cap sync ios && a new archive upload.
const config: CapacitorConfig = {
  appId: 'com.tshirtbrothers.app',
  appName: 'T-Shirt Brothers',
  webDir: 'dist',
  ios: {
    contentInset: 'automatic',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: '#111827',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
    },
  },
};

export default config;
