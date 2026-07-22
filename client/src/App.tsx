import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { Toaster } from 'sonner';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [pathname]);
  return null;
}

import HomePage from '@/pages/HomePage';
import ServicesPage from '@/pages/ServicesPage';
import ShopPage from '@/pages/ShopPage';
import InstantQuotePage from '@/pages/InstantQuotePage';
import DesignStudioPage from '@/pages/DesignStudioPage';
import AdminPage from '@/pages/AdminPage';
import AuthPage from '@/pages/AuthPage';
import NotFoundPage from '@/pages/NotFoundPage';
import BrandsPage from '@/pages/BrandsPage';
import BlogPage from '@/pages/BlogPage';
import BlogPostPage from '@/pages/BlogPostPage';
import AccountPage from '@/pages/AccountPage';
import FavoritesPage from '@/pages/FavoritesPage';
import GangSheetPage from '@/pages/GangSheetPage';
import MockupApprovalPage from '@/pages/MockupApprovalPage';
import InvoiceViewPage from '@/pages/InvoiceViewPage';
import LocalBusinessesPage from '@/pages/LocalBusinessesPage';
import CityLandingPage from '@/pages/CityLandingPage';
import VerticalLandingPage from '@/pages/VerticalLandingPage';
import AboutPage from '@/pages/AboutPage';
import FaqPage from '@/pages/FaqPage';
import HomePageEs from '@/pages/HomePageEs';
import { PaymentCheckout, PaymentSuccess, PaymentCancel } from '@/pages/PaymentPage';
import StoreFrontPage from '@/pages/StoreFrontPage';
import StoreProductPage from '@/pages/StoreProductPage';
import StoreSuccessPage from '@/pages/StoreSuccessPage';
import StoresDirectoryPage from '@/pages/stores/StoresDirectoryPage';
import GroupStorePage from '@/pages/stores/GroupStorePage';
import GroupStoreProductPage from '@/pages/stores/GroupStoreProductPage';
import GroupStoreAdminPage from '@/pages/stores/GroupStoreAdminPage';
import AdminGroupStoresPage from '@/pages/admin/AdminGroupStoresPage';
import AdminGroupStoreDetailPage from '@/pages/admin/AdminGroupStoreDetailPage';
import { getStoreSubdomain } from '@/lib/storeSubdomain';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
    },
  },
});

function GangSheetIdRedirect() {
  const { id } = useParams();
  return <Navigate to={`/admin/gangsheet/${id}`} replace />;
}

// When the hostname is a group-store subdomain like
// sandycreekpto.tshirtbrothers.com, mount a stripped-down route tree
// that renders the storefront at "/" — no /stores/<slug> prefix.
// getStoreSubdomain() reserves things like admin/api/www so the main
// site continues to work at its usual hostname.
function SubdomainApp() {
  return (
    <HelmetProvider>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ScrollToTop />
        <Routes>
          <Route path="/" element={<GroupStorePage />} />
          <Route path="/product/:productSlug" element={<GroupStoreProductPage />} />
          <Route path="/success" element={<StoreSuccessPage />} />
          <Route path="/admin" element={<GroupStoreAdminPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-right" richColors />
    </QueryClientProvider>
    </HelmetProvider>
  );
}

function App() {
  if (getStoreSubdomain()) return <SubdomainApp />;
  return (
    <HelmetProvider>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ScrollToTop />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/es" element={<HomePageEs />} />
          <Route path="/services" element={<ServicesPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/faq" element={<FaqPage />} />
          <Route path="/shop" element={<ShopPage />} />
          <Route path="/brands" element={<BrandsPage />} />
          {/* /quote is now the live-pricing calculator (formerly /instant-quote).
              The old multi-step contact form was removed in favor of self-service.
              Keep /instant-quote as a redirect for any links already in the wild. */}
          <Route path="/quote" element={<InstantQuotePage />} />
          <Route path="/instant-quote" element={<Navigate to="/quote" replace />} />
          <Route path="/blog" element={<BlogPage />} />
          <Route path="/local-businesses" element={<LocalBusinessesPage />} />
          <Route path="/custom-shirts/:citySlug" element={<CityLandingPage />} />
          <Route path="/shirts-for/:verticalSlug" element={<VerticalLandingPage />} />
          <Route path="/blog/:slug" element={<BlogPostPage />} />
          <Route path="/design" element={<DesignStudioPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/favorites" element={<FavoritesPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/admin/gangsheet" element={<GangSheetPage />} />
          <Route path="/admin/gangsheet/:id" element={<GangSheetPage />} />
          <Route path="/gangsheet" element={<Navigate to="/admin/gangsheet" replace />} />
          <Route path="/gangsheets" element={<Navigate to="/admin/gangsheet" replace />} />
          <Route path="/gangsheet/:id" element={<GangSheetIdRedirect />} />
          <Route path="/gangsheets/:id" element={<GangSheetIdRedirect />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/mockup/:token" element={<MockupApprovalPage />} />
          <Route path="/invoice/view/:id" element={<InvoiceViewPage />} />
          <Route path="/payment/checkout" element={<PaymentCheckout />} />
          <Route path="/payment/success" element={<PaymentSuccess />} />
          <Route path="/payment/cancel" element={<PaymentCancel />} />
          {/* Franchise store buyer routes — one storefront per store slug. */}
          <Route path="/store/:slug" element={<StoreFrontPage />} />
          <Route path="/store/:slug/product/:productSlug" element={<StoreProductPage />} />
          <Route path="/store/:slug/success" element={<StoreSuccessPage />} />
          {/* Group stores — TSB-curated white-label storefronts for schools/orgs. */}
          <Route path="/stores" element={<StoresDirectoryPage />} />
          <Route path="/stores/:slug" element={<GroupStorePage />} />
          <Route path="/stores/:slug/product/:productSlug" element={<GroupStoreProductPage />} />
          <Route path="/stores/:slug/success" element={<StoreSuccessPage />} />
          <Route path="/stores/:slug/admin" element={<GroupStoreAdminPage />} />
          {/* TSB internal admin for group stores */}
          <Route path="/admin/group-stores" element={<AdminGroupStoresPage />} />
          <Route path="/admin/group-stores/:id" element={<AdminGroupStoreDetailPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-right" richColors />
    </QueryClientProvider>
    </HelmetProvider>
  );
}

export default App;
