import { useEffect, lazy, Suspense } from 'react';
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

import NotFoundPage from '@/pages/NotFoundPage';

import { PaymentCheckout, PaymentSuccess, PaymentCancel } from '@/pages/PaymentPage';

import { getStoreSubdomain } from '@/lib/storeSubdomain';

// Route-level code splitting.
//
// Every page was a static import, so the entry chunk was 2,516 KB and a
// homepage visitor downloaded the whole admin surface (~31,600 LOC) and all
// three sister-brand storefronts (~9,000 LOC) before seeing anything. A
// group-store subdomain visitor downloaded AdminPage to render six routes.
//
// HomePage and NotFoundPage stay eager: the first is the LCP route, where an
// extra round trip is exactly what we are trying to avoid, and the second is
// what the prerendered 404.html renders.
const AboutPage = lazy(() => import('@/pages/AboutPage'));
const AccountPage = lazy(() => import('@/pages/AccountPage'));
const AdminDtfOrdersPage = lazy(() => import('@/pages/AdminDtfOrdersPage'));
const AdminGroupStoreDetailPage = lazy(() => import('@/pages/admin/AdminGroupStoreDetailPage'));
const AdminGroupStoresPage = lazy(() => import('@/pages/admin/AdminGroupStoresPage'));
const AdminOrderDetailPage = lazy(() => import('@/pages/AdminOrderDetailPage'));
const AdminPage = lazy(() => import('@/pages/AdminPage'));
const AdminStoreOrderPage = lazy(() => import('@/pages/admin/AdminStoreOrderPage'));
const AdminStoreOrdersPage = lazy(() => import('@/pages/admin/AdminStoreOrdersPage'));
const AdminVendorSendPage = lazy(() => import('@/pages/AdminVendorSendPage'));
const AuthPage = lazy(() => import('@/pages/AuthPage'));
const AwardsPage = lazy(() => import('@/pages/AwardsPage'));
const BlingPage = lazy(() => import('@/pages/BlingPage'));
const BlogPage = lazy(() => import('@/pages/BlogPage'));
const BlogPostPage = lazy(() => import('@/pages/BlogPostPage'));
const BrandsPage = lazy(() => import('@/pages/BrandsPage'));
const CityLandingPage = lazy(() => import('@/pages/CityLandingPage'));
const CustomerPage = lazy(() => import('@/pages/CustomerPage'));
const DesignStudioPage = lazy(() => import('@/pages/DesignStudioPage'));
const DrinkwarePage = lazy(() => import('@/pages/DrinkwarePage'));
const DtfBuilderPage = lazy(() => import('@/pages/DtfBuilderPage'));
const DtfStorePage = lazy(() => import('@/pages/DtfStorePage'));
const DtfSuccessPage = lazy(() => import('@/pages/DtfSuccessPage'));
const EasyQuotePage = lazy(() => import('@/pages/EasyQuotePage'));
const EmbroideryQuotePage = lazy(() => import('@/pages/EmbroideryQuotePage'));
const EmbroideryThanksPage = lazy(() => import('@/pages/EmbroideryThanksPage'));
const FaqPage = lazy(() => import('@/pages/FaqPage'));
const FavoritesPage = lazy(() => import('@/pages/FavoritesPage'));
const GangSheetPage = lazy(() => import('@/pages/GangSheetPage'));
const GiftsStorePage = lazy(() => import('@/pages/GiftsStorePage'));
const GroupStoreAdminPage = lazy(() => import('@/pages/stores/GroupStoreAdminPage'));
const GroupStoreCartPage = lazy(() => import('@/pages/stores/GroupStoreCartPage'));
const GroupStorePage = lazy(() => import('@/pages/stores/GroupStorePage'));
const GroupStoreProductPage = lazy(() => import('@/pages/stores/GroupStoreProductPage'));
const HolidayCardsPage = lazy(() => import('@/pages/HolidayCardsPage'));
const HomePageEs = lazy(() => import('@/pages/HomePageEs'));
const InstantQuotePage = lazy(() => import('@/pages/InstantQuotePage'));
const InvoiceViewPage = lazy(() => import('@/pages/InvoiceViewPage'));
const LocalBusinessesPage = lazy(() => import('@/pages/LocalBusinessesPage'));
const MockupApprovalPage = lazy(() => import('@/pages/MockupApprovalPage'));
const PostOfficePage = lazy(() => import('@/pages/admin/PostOfficePage'));
const PrivacyPage = lazy(() => import('@/pages/PrivacyPage'));
const ProLoginPage = lazy(() => import('@/pages/ProLoginPage'));
const QualityTiersPage = lazy(() => import('@/pages/QualityTiersPage'));
const QuoteAcceptedPage = lazy(() => import('@/pages/QuoteAcceptedPage'));
const QuoteArtworkPage = lazy(() => import('@/pages/QuoteArtworkPage'));
const QuoteDeclinePage = lazy(() => import('@/pages/QuoteDeclinePage'));
const RhinestoneQuotePage = lazy(() => import('@/pages/RhinestoneQuotePage'));
const SalePage = lazy(() => import('@/pages/SalePage'));
const ServicesPage = lazy(() => import('@/pages/ServicesPage'));
const ShopPage = lazy(() => import('@/pages/ShopPage'));
const StitchEstimatorPage = lazy(() => import('@/pages/StitchEstimatorPage'));
const StoreFrontPage = lazy(() => import('@/pages/StoreFrontPage'));
const StoreProductPage = lazy(() => import('@/pages/StoreProductPage'));
const StoreSuccessPage = lazy(() => import('@/pages/StoreSuccessPage'));
const StoresDirectoryPage = lazy(() => import('@/pages/stores/StoresDirectoryPage'));
const TermsPage = lazy(() => import('@/pages/TermsPage'));
const TsbProPage = lazy(() => import('@/pages/TsbProPage'));
const VerticalLandingPage = lazy(() => import('@/pages/VerticalLandingPage'));
const WebstoresBusinessPage = lazy(() => import('@/pages/WebstoresBusinessPage'));
const WebstoresPage = lazy(() => import('@/pages/WebstoresPage'));
import CgcStandaloneApp, { CgcRoutes } from '@/cgc/CgcApp';
import { isCgcHost } from '@/cgc/lib/brand';
import ApcStandaloneApp, { ApcRoutes } from '@/apc/ApcApp';
import { isApcHost } from '@/apc/lib/brand';
import LhtStandaloneApp, { LhtRoutes } from '@/lht/LhtApp';
import { isLhtHost } from '@/lht/lib/brand';

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
        <Suspense fallback={null}>
          {/* Deliberately empty.
            //
            // A spinner here would be captured by the prerenderer if a lazy
            // chunk resolved late, baking a loading state into the HTML
            // Google indexes. Rendering nothing means the worst case is a
            // blank frame for one paint instead of a page whose indexed
            // content is a spinner. Verified: prerendered pages still carry
            // their real titles and body copy. */}
        <Routes>
          <Route path="/" element={<GroupStorePage />} />
          <Route path="/product/:productSlug" element={<GroupStoreProductPage />} />
          <Route path="/cart" element={<GroupStoreCartPage />} />
          <Route path="/success" element={<StoreSuccessPage />} />
          <Route path="/admin" element={<GroupStoreAdminPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
        </Suspense>
      </BrowserRouter>
      <Toaster position="top-right" richColors />
    </QueryClientProvider>
    </HelmetProvider>
  );
}

function App() {
  // Custom Gift Club sister brand on its own (configurable) hostname —
  // checked before the store-subdomain branch so a CGC host under
  // *.tshirtbrothers.com can't be misread as a group store.
  if (isCgcHost()) return <CgcStandaloneApp />;
  // All Print Club — same sister-brand pattern, also ahead of the
  // store-subdomain branch for the same reason.
  if (isApcHost()) return <ApcStandaloneApp />;
  // Live Hard Truth — same sister-brand pattern, also ahead of the
  // store-subdomain branch for the same reason.
  if (isLhtHost()) return <LhtStandaloneApp />;
  if (getStoreSubdomain()) return <SubdomainApp />;
  return (
    <HelmetProvider>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ScrollToTop />
        <Suspense fallback={null}>
          {/* Deliberately empty.
            //
            // A spinner here would be captured by the prerenderer if a lazy
            // chunk resolved late, baking a loading state into the HTML
            // Google indexes. Rendering nothing means the worst case is a
            // blank frame for one paint instead of a page whose indexed
            // content is a spinner. Verified: prerendered pages still carry
            // their real titles and body copy. */}
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/es" element={<HomePageEs />} />
          <Route path="/services" element={<ServicesPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/faq" element={<FaqPage />} />
          <Route path="/shop" element={<ShopPage />} />
          <Route path="/sale" element={<SalePage />} />
          <Route path="/dtf" element={<DtfStorePage />} />
          <Route path="/dtf/builder" element={<DtfBuilderPage />} />
          <Route path="/dtf/builder/:id" element={<DtfBuilderPage />} />
          <Route path="/dtf/success" element={<DtfSuccessPage />} />
          <Route path="/admin/dtf-orders" element={<AdminDtfOrdersPage />} />
          <Route path="/admin/vendor-send" element={<AdminVendorSendPage />} />
          <Route path="/admin/order/:quoteId" element={<AdminOrderDetailPage />} />
          <Route path="/brands" element={<BrandsPage />} />
          <Route path="/drinkware" element={<DrinkwarePage />} />
          {/* Rhinestone / spiritwear. /spiritwear is the phrase schools
              actually search for, so it's a real route rather than a redirect. */}
          <Route path="/quote/rhinestone" element={<RhinestoneQuotePage />} />
          <Route path="/bling" element={<BlingPage />} />
          <Route path="/spiritwear" element={<BlingPage />} />
          <Route path="/awards" element={<AwardsPage />} />
          <Route path="/compare" element={<QualityTiersPage />} />
          <Route path="/webstores" element={<WebstoresPage />} />
          <Route path="/webstores/business" element={<WebstoresBusinessPage />} />
          {/* TSB Pro — B2B program landing (business web stores). */}
          <Route path="/pro" element={<TsbProPage />} />
          <Route path="/holiday-cards" element={<HolidayCardsPage />} />
          <Route path="/gifts" element={<GiftsStorePage />} />
          {/* Custom Gift Club — sister-brand storefront (path mount). */}
          <Route path="/gift-club/*" element={<CgcRoutes base="/gift-club" />} />
          {/* All Print Club — sister-brand storefront (path mount). */}
          <Route path="/print-club/*" element={<ApcRoutes base="/print-club" />} />
          {/* Live Hard Truth — sister-brand storefront (path mount). */}
          <Route path="/live-hard-truth/*" element={<LhtRoutes base="/live-hard-truth" />} />
          <Route path="/pro/login" element={<ProLoginPage />} />
          {/* /quote is now the live-pricing calculator (formerly /instant-quote).
              The old multi-step contact form was removed in favor of self-service.
              Keep /instant-quote as a redirect for any links already in the wild. */}
          {/* /quote is the mobile-first Easy Quote card wizard; the full
              live-pricing calculator survives at /quote/classic. */}
          <Route path="/quote" element={<EasyQuotePage />} />
          {/* Embroidery is quoted by stitch count after a paid digitization,
              so it gets its own path rather than a lane in the wizard. */}
          <Route path="/embroidery" element={<EmbroideryQuotePage />} />
          <Route path="/stitch-estimator" element={<StitchEstimatorPage />} />
          <Route path="/embroidery/thanks/:id" element={<EmbroideryThanksPage />} />
          {/* Token-gated customer actions linked from quote emails. */}
          <Route path="/quote/decline/:id" element={<QuoteDeclinePage />} />
          <Route path="/quote/artwork/:id" element={<QuoteArtworkPage />} />
          <Route path="/quote/accepted/:id" element={<QuoteAcceptedPage />} />
          <Route path="/es/cotizacion" element={<EasyQuotePage lang="es" />} />
          <Route path="/quote/classic" element={<InstantQuotePage />} />
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
          <Route path="/admin/customers/:id" element={<CustomerPage />} />
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
          <Route path="/stores/:slug/cart" element={<GroupStoreCartPage />} />
          <Route path="/stores/:slug/success" element={<StoreSuccessPage />} />
          <Route path="/stores/:slug/admin" element={<GroupStoreAdminPage />} />
          {/* TSB internal admin for group stores */}
          <Route path="/admin/group-stores" element={<AdminGroupStoresPage />} />
          <Route path="/admin/store-orders" element={<AdminStoreOrdersPage />} />
          <Route path="/admin/store-order/:id" element={<AdminStoreOrderPage />} />
          <Route path="/admin/post-office" element={<PostOfficePage />} />
          <Route path="/admin/group-stores/:id" element={<AdminGroupStoreDetailPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
        </Suspense>
      </BrowserRouter>
      <Toaster position="top-right" richColors />
    </QueryClientProvider>
    </HelmetProvider>
  );
}

export default App;
