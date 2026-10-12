// All Print Club — sister-brand storefront (4over-fulfilled commercial
// print). One route tree, two mounts:
//   <Route path="/print-club/*">  on any TSB host (preview / default)
//   at "/"                        when served from a configured APC host
//     (VITE_APC_HOSTS) — that mount brings its own providers because it
//     replaces the whole TSB app rather than nesting inside it.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { Toaster } from 'sonner';

import { ApcBaseContext } from './lib/base';
import { ApcCartProvider } from './lib/cart';
import Header from './components/Header';
import Footer from './components/Footer';
import HomePage from './pages/HomePage';
import ShopPage from './pages/ShopPage';
import ProductPage from './pages/ProductPage';
import CartPage from './pages/CartPage';
import SuccessPage from './pages/SuccessPage';
import AccountPage from './pages/AccountPage';

export function ApcRoutes({ base }: { base: string }) {
  return (
    <ApcBaseContext.Provider value={base}>
      <ApcCartProvider>
        <div className="min-h-screen flex flex-col bg-white font-sans text-apc-ink">
          <Header />
          <main className="flex-1">
            <Routes>
              <Route index element={<HomePage />} />
              <Route path="shop" element={<ShopPage />} />
              <Route path="product/:code" element={<ProductPage />} />
              <Route path="cart" element={<CartPage />} />
              <Route path="success" element={<SuccessPage />} />
              <Route path="account" element={<AccountPage />} />
              <Route path="auth" element={<Navigate to={`${base}/account`} replace />} />
              <Route path="*" element={<Navigate to={base || '/'} replace />} />
            </Routes>
          </main>
          <Footer />
        </div>
      </ApcCartProvider>
    </ApcBaseContext.Provider>
  );
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5 * 60 * 1000, retry: 1 } },
});

// Standalone mount for dedicated APC hostnames (allprintclub.com).
export default function ApcStandaloneApp() {
  return (
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Routes>
            <Route path="/*" element={<ApcRoutes base="" />} />
          </Routes>
        </BrowserRouter>
        <Toaster position="top-right" richColors duration={3000} />
      </QueryClientProvider>
    </HelmetProvider>
  );
}
