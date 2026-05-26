import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    // Hand-rolled chunk splits. Without these, Vite occasionally
    // jams the big design-studio libs into the main vendor chunk and
    // every page (including the home page) pays for loading Fabric +
    // html2canvas. Pinning each big lib to its own chunk lets the
    // browser cache them independently and keeps the marketing
    // bundle slim.
    rollupOptions: {
      output: {
        manualChunks: {
          // Core React stays together — every page needs it.
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          // Data layer — used by most pages.
          'tanstack-query': ['@tanstack/react-query'],
          // Icons (lucide-react) used everywhere — keep them in one
          // long-cached chunk rather than inlined per route.
          'icons': ['lucide-react'],
          // SEO helmet — small but used on every page.
          'helmet': ['react-helmet-async'],
          // html2canvas is only used by the Design Studio capture
          // flow + the Save-to-Library flow. Pinning it here means
          // it doesn't tag along into the main bundle.
          'html2canvas': ['html2canvas'],
        },
      },
    },
    // 600KB → 1MB warning. The Design Studio chunk legitimately
    // crosses 600KB because Fabric is large; we don't want a
    // build-time warning every time we change something there.
    chunkSizeWarningLimit: 1000,
  },
});
