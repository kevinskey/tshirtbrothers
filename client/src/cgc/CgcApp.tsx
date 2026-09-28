// Custom Gift Club — sister-brand storefront. One route tree, two mounts:
//   <Route path="/gift-club/*">  on any TSB host (preview / default)
//   at "/"                       when served from a configured CGC host
//     (VITE_CGC_HOSTS) — that mount brings its own providers because it
//     replaces the whole TSB app rather than nesting inside it.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { Toaster } from 'sonner';

// The full TSB Design Studio, reused as CGC's studio. It renders its own
// full-screen chrome (rebranded via useStoreBrand → builtin "cgc"), so it
// mounts OUTSIDE the CGC Header/Footer wrapper.
import DesignStudioPage from '@/pages/DesignStudioPage';
import { CgcBaseContext } from './lib/base';
import { CgcCartProvider } from './lib/cart';
import Header from './components/Header';
import Footer from './components/Footer';
import HomePage from './pages/HomePage';
import ShopPage from './pages/ShopPage';
import ProductPage from './pages/ProductPage';
import CartPage from './pages/CartPage';
import SuccessPage from './pages/SuccessPage';
import BusinessPage from './pages/BusinessPage';
import FavoritesPage from './pages/FavoritesPage';
import AccountPage from './pages/AccountPage';
import HolidayPage from './pages/HolidayPage';
import HolidayCardsPage from './pages/HolidayCardsPage';
import CardDesignerPage from './pages/CardDesignerPage';
import HolidayProductPage from './pages/HolidayProductPage';
import HolidayAdminPage from './pages/HolidayAdminPage';
import QuotePage from './pages/QuotePage';

export function CgcRoutes({ base }: { base: string }) {
  return (
    <CgcBaseContext.Provider value={base}>
      <CgcCartProvider>
        <div className="min-h-screen flex flex-col bg-white font-sans text-cgc-ink">
          <Header />
          <main className="flex-1">
            <Routes>
              <Route index element={<HomePage />} />
              <Route path="shop" element={<ShopPage />} />
              <Route path="product/:sku" element={<ProductPage />} />
              <Route path="holiday" element={<HolidayPage />} />
              <Route path="holiday-cards" element={<HolidayCardsPage />} />
              <Route path="holiday-cards/:id/design" element={<CardDesignerPage />} />
              <Route path="holiday/:slug" element={<HolidayProductPage />} />
              <Route path="admin/holiday" element={<HolidayAdminPage />} />
              <Route path="cart" element={<CartPage />} />
              <Route path="success" element={<SuccessPage />} />
              <Route path="business" element={<BusinessPage />} />
              <Route path="quote" element={<QuotePage />} />
              <Route path="favorites" element={<FavoritesPage />} />
              <Route path="account" element={<AccountPage />} />
              {/* The studio's "Sign in to save" prompt links to /auth (a
                  TSB route). On CGC, the account page carries the login
                  form, so land there instead of the home redirect. */}
              <Route path="auth" element={<Navigate to={`${base}/account`} replace />} />
              <Route path="*" element={<Navigate to={base || '/'} replace />} />
            </Routes>
          </main>
          <Footer />
        </div>
      </CgcCartProvider>
    </CgcBaseContext.Provider>
  );
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5 * 60 * 1000, retry: 1 } },
});

// Standalone mount for dedicated CGC hostnames.
export default function CgcStandaloneApp() {
  return (
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Routes>
            {/* Full-screen Design Studio — no CGC header/footer. On TSB
                hosts /design is already served by the main app's route;
                this one makes it exist on customgiftclub.com too. */}
            <Route path="/design" element={<DesignStudioPage />} />
            <Route path="/*" element={<CgcRoutes base="" />} />
          </Routes>
        </BrowserRouter>
        <Toaster position="top-right" richColors duration={3000} />
      </QueryClientProvider>
    </HelmetProvider>
  );
}
