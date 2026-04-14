import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
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
import QuotePage from '@/pages/QuotePage';
import DesignStudioPage from '@/pages/DesignStudioPage';
import AdminPage from '@/pages/AdminPage';
import AuthPage from '@/pages/AuthPage';
import NotFoundPage from '@/pages/NotFoundPage';
import BrandsPage from '@/pages/BrandsPage';
import BlogPage from '@/pages/BlogPage';
import BlogPostPage from '@/pages/BlogPostPage';
import AccountPage from '@/pages/AccountPage';
import GangSheetPage from '@/pages/GangSheetPage';
import MockupApprovalPage from '@/pages/MockupApprovalPage';
import InvoiceViewPage from '@/pages/InvoiceViewPage';
import { PaymentCheckout, PaymentSuccess, PaymentCancel } from '@/pages/PaymentPage';
import ChatWidget from '@/components/chat/ChatWidget';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ScrollToTop />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/services" element={<ServicesPage />} />
          <Route path="/shop" element={<ShopPage />} />
          <Route path="/brands" element={<BrandsPage />} />
          <Route path="/quote" element={<QuotePage />} />
          <Route path="/blog" element={<BlogPage />} />
          <Route path="/blog/:slug" element={<BlogPostPage />} />
          <Route path="/design" element={<DesignStudioPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/admin/gangsheet" element={<GangSheetPage />} />
          <Route path="/admin/gangsheet/:id" element={<GangSheetPage />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/mockup/:token" element={<MockupApprovalPage />} />
          <Route path="/invoice/view/:id" element={<InvoiceViewPage />} />
          <Route path="/payment/checkout" element={<PaymentCheckout />} />
          <Route path="/payment/success" element={<PaymentSuccess />} />
          <Route path="/payment/cancel" element={<PaymentCancel />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
        <ChatWidget />
      </BrowserRouter>
      <Toaster position="top-right" richColors />
    </QueryClientProvider>
  );
}

export default App;
