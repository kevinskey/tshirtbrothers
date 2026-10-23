// Live Hard Truth — sister-brand storefront (streetwear, fulfilled through
// the shared store-shop system as store `live-hard-truth`). One route tree,
// two mounts:
//   <Route path="/live-hard-truth/*">  on any TSB host (preview / default)
//   at "/"                             when served from a configured LHT host
//     (VITE_LHT_HOSTS) — that mount brings its own providers because it
//     replaces the whole TSB app rather than nesting inside it.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Helmet, HelmetProvider } from 'react-helmet-async';
import { Toaster } from 'sonner';

import GroupStoreAdminPage from '@/pages/stores/GroupStoreAdminPage';
import { LhtBaseContext } from './lib/base';
import { STORE_SLUG } from './lib/catalog';
import { LhtCartProvider } from './lib/cart';
import Header from './components/Header';
import Footer from './components/Footer';
import HomePage from './pages/HomePage';
import ProductPage from './pages/ProductPage';
import CartPage from './pages/CartPage';
import SuccessPage from './pages/SuccessPage';
import TruthPage from './pages/TruthPage';
import GuidePage from './pages/GuidePage';

// Brand faces load at runtime so both mounts get them without touching the
// TSB shell: Archivo Black (display), Hind (body), Playfair Display (the
// Truth Session serif).
function LhtFonts() {
  return (
    <Helmet>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Hind:wght@300;400;500;600;700&family=Playfair+Display:wght@400;500;600;700&display=swap"
      />
    </Helmet>
  );
}

export function LhtRoutes({ base }: { base: string }) {
  return (
    <LhtBaseContext.Provider value={base}>
      <LhtCartProvider>
        <LhtFonts />
        <div className="min-h-screen flex flex-col bg-lht-ink font-lht-sans text-lht-cream">
          <Header />
          <main className="flex-1">
            <Routes>
              <Route index element={<HomePage />} />
              <Route path="product/:slug" element={<ProductPage />} />
              <Route path="cart" element={<CartPage />} />
              <Route path="success" element={<SuccessPage />} />
              <Route path="truth" element={<TruthPage />} />
              <Route path="guide" element={<GuidePage />} />
              <Route path="shop" element={<Navigate to={`${base}/#shop`} replace />} />
              <Route path="*" element={<Navigate to={base || '/'} replace />} />
            </Routes>
          </main>
          <Footer />
        </div>
      </LhtCartProvider>
    </LhtBaseContext.Provider>
  );
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5 * 60 * 1000, retry: 1 } },
});

// Standalone mount for dedicated LHT hostnames (livehardtruth.com).
export default function LhtStandaloneApp() {
  return (
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Routes>
            {/* Taking over an LHT host displaces the generic store-subdomain
                route tree, so keep its store-admin door open. */}
            <Route path="/admin" element={<GroupStoreAdminPage slug={STORE_SLUG} />} />
            <Route path="/*" element={<LhtRoutes base="" />} />
          </Routes>
        </BrowserRouter>
        <Toaster position="top-right" richColors duration={3000} />
      </QueryClientProvider>
    </HelmetProvider>
  );
}
