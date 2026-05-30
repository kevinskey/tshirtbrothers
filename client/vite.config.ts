import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Inline the main app CSS bundle into index.html so the page doesn't
// pay a render-blocking round-trip for it. At ~13 KiB it's small
// enough that the gzip-compressed HTML stays well under the SPA-shell
// budget, and on a SPA the HTML re-fetches on every visit anyway, so
// we're not losing meaningful repeat-visit cache value. Removes the
// emitted CSS file from the bundle so we don't pay double bytes.
function inlineAppCss(): Plugin {
  return {
    name: 'tsb-inline-app-css',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const htmlEntry = Object.values(bundle).find(
        (a) => a.type === 'asset' && a.fileName === 'index.html',
      );
      if (!htmlEntry || htmlEntry.type !== 'asset') return;
      let html = htmlEntry.source as string;

      const linkRegex = /<link[^>]+rel="stylesheet"[^>]+href="\/?([^"]+\.css)"[^>]*>/g;
      html = html.replace(linkRegex, (match, hrefPath: string) => {
        const fileName = hrefPath.startsWith('/') ? hrefPath.slice(1) : hrefPath;
        const cssAsset = bundle[fileName];
        if (!cssAsset || cssAsset.type !== 'asset') return match;
        const css = String(cssAsset.source);
        delete bundle[fileName];
        return `<style>${css}</style>`;
      });

      htmlEntry.source = html;
    },
  };
}

export default defineConfig({
  plugins: [react(), inlineAppCss()],
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
