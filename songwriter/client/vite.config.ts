import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icon.svg', 'favicon.svg'],
      manifest: {
        name: 'Songwriter',
        short_name: 'Songwriter',
        description: 'A sunlit place for lyricists — write, rhyme, and find inspiration.',
        theme_color: '#6b8f42',
        background_color: '#f8faf2',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          // Cache uploaded source PDFs (spirituals, etc.) — immutable files,
          // large; keep them once fetched so score viewing works offline.
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/uploads/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'sw-uploads',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
              rangeRequests: true,
            },
          },
          // Cache Bible/Psalm passage fetches — public-domain text never changes
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/psalms/') && !url.pathname.includes('/search') && !url.pathname.includes('/adapt'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'sw-scripture',
              expiration: { maxEntries: 2000, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // Dictionary word definitions — rarely change
          {
            urlPattern: ({ url }) => url.pathname.match(/^\/api\/dictionary\/[^/]+$/),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'sw-dictionary',
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          // Google Fonts
          {
            urlPattern: /^https:\/\/fonts\.(gstatic|googleapis)\.com\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'sw-google-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
