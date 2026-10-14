import type { CapacitorConfig } from '@capacitor/cli';

// iOS app = native shell over the live site. server.url means the WKWebView
// loads https://tshirtbrothers.com directly: every web deploy updates the
// app with no App Store release. To switch to bundled mode (offline boot,
// App Store 4.2 safety), delete `server` and add a fetch shim for /api.
const config: CapacitorConfig = {
  appId: 'com.tshirtbrothers.app',
  appName: 'T-Shirt Brothers',
  webDir: 'dist',
  server: {
    url: 'https://tshirtbrothers.com',
  },
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
