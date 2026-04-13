import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import Layout from '@/components/layout/Layout';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';

// Checkout page - redirects to Stripe (handles both deposit and balance)
export function PaymentCheckout() {
  const [searchParams] = useSearchParams();
  const quoteId = searchParams.get('quote');
  const token = searchParams.get('token');
  const type = searchParams.get('type'); // 'balance' or null (deposit)
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!quoteId) {
      setError('Missing quote ID');
      return;
    }

    const endpoint = type === 'balance'
      ? '/api/payments/create-balance-checkout'
      : '/api/payments/create-checkout';

    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quoteId, token }),
    })
      .then(res => res.json())
      .then(data => {
        if (data.checkoutUrl) {
          window.location.href = data.checkoutUrl;
        } else {
          setError(data.error || 'Failed to create checkout session');
        }
      })
      .catch(() => setError('Failed to connect to payment server'));
  }, [quoteId, token, type]);

  return (
    <Layout>
      <div className="min-h-[60vh] flex items-center justify-center">
        {error ? (
          <div className="text-center">
            <XCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
            <h1 className="text-2xl font-display font-bold text-gray-900 mb-2">Payment Error</h1>
            <p className="text-gray-500 mb-6">{error}</p>
            <Link to="/" className="text-blue-600 font-medium hover:underline">Return Home</Link>
          </div>
        ) : (
          <div className="text-center">
            <Loader2 className="h-12 w-12 animate-spin text-blue-600 mx-auto mb-4" />
            <h1 className="text-xl font-display font-bold text-gray-900 mb-2">Redirecting to Payment...</h1>
            <p className="text-gray-500">Please wait while we set up your secure payment.</p>
          </div>
        )}
      </div>
    </Layout>
  );
}

// Success page
export function PaymentSuccess() {
  const [searchParams] = useSearchParams();
  const quoteId = searchParams.get('quote');
  const sessionId = searchParams.get('session_id');
  const type = searchParams.get('type');
  const [quote, setQuote] = useState<{ customer_name: string; product_name: string; deposit_amount: number; estimated_price: number; payment_type?: string } | null>(null);

  const isBalance = type === 'balance' || quote?.payment_type === 'balance';

  useEffect(() => {
    if (quoteId) {
      const params = new URLSearchParams();
      params.set('quote', quoteId);
      if (sessionId) params.set('session_id', sessionId);
      if (type) params.set('type', type);
      fetch(`/api/payments/success?${params.toString()}`)
        .then(res => res.json())
        .then(data => setQuote(data))
        .catch(() => {});
    }
  }, [quoteId, sessionId, type]);

  return (
    <Layout>
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center max-w-md">
          <CheckCircle2 className="h-20 w-20 text-green-500 mx-auto mb-6" />
          <h1 className="text-3xl font-display font-bold text-gray-900 mb-3">Payment Successful!</h1>
          <p className="text-gray-500 mb-6">
            {isBalance ? (
              <>
                Thank you{quote?.customer_name ? `, ${quote.customer_name}` : ''}! Your remaining balance has been paid.
                Your order is now paid in full.
              </>
            ) : (
              <>
                Thank you{quote?.customer_name ? `, ${quote.customer_name}` : ''}! Your deposit
                {quote?.deposit_amount ? ` of $${Number(quote.deposit_amount).toFixed(2)}` : ''} has been received.
              </>
            )}
          </p>
          {quote?.product_name && (
            <p className="text-sm text-gray-400 mb-6">Order: {quote.product_name}</p>
          )}
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6">
            <p className="text-sm text-green-800 font-medium">
              {isBalance ? 'Order Paid in Full!' : 'What happens next?'}
            </p>
            <p className="text-sm text-green-700 mt-1">
              {isBalance
                ? 'Your order is fully paid. We\'ll notify you when it\'s ready for pickup or shipping.'
                : 'Our team will begin working on your order. We\'ll send you updates via email and SMS.'}
            </p>
          </div>
          <div className="flex gap-3 justify-center">
            <Link to="/" className="px-5 py-2.5 bg-gray-900 text-white rounded-lg text-sm font-semibold hover:bg-gray-800 transition">
              Return Home
            </Link>
            <Link to="/design" className="px-5 py-2.5 border border-gray-200 rounded-lg text-sm font-semibold hover:bg-gray-50 transition">
              Design Another
            </Link>
          </div>
          <p className="text-xs text-gray-400 mt-8">Questions? Call (470) 622-4845 or email kevin@tshirtbrothers.com</p>
        </div>
      </div>
    </Layout>
  );
}

// Cancel page
export function PaymentCancel() {
  return (
    <Layout>
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center max-w-md">
          <XCircle className="h-16 w-16 text-gray-400 mx-auto mb-6" />
          <h1 className="text-2xl font-display font-bold text-gray-900 mb-3">Payment Cancelled</h1>
          <p className="text-gray-500 mb-6">
            No worries! Your quote is still available. You can pay anytime by clicking the link in your email.
          </p>
          <div className="flex gap-3 justify-center">
            <Link to="/" className="px-5 py-2.5 bg-gray-900 text-white rounded-lg text-sm font-semibold hover:bg-gray-800 transition">
              Return Home
            </Link>
            <a href="tel:4706224845" className="px-5 py-2.5 border border-gray-200 rounded-lg text-sm font-semibold hover:bg-gray-50 transition">
              Call Us
            </a>
          </div>
        </div>
      </div>
    </Layout>
  );
}
