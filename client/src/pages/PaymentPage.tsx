import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import Layout from '@/components/layout/Layout';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';

interface QuoteSummary {
  id: number;
  customer_name: string | null;
  product_name: string | null;
  estimated_price: number;
  deposit_amount: number;
}

// Checkout page — shows a choice between paying the 50% deposit OR
// paying the full balance in one shot when the customer arrives from
// the accept-quote email link. The balance email keeps direct redirect
// (`?type=balance`) so that "Pay remaining balance" button bypasses
// the choice screen.
export function PaymentCheckout() {
  const [searchParams] = useSearchParams();
  const quoteId = searchParams.get('quote');
  const token = searchParams.get('token');
  const type = searchParams.get('type'); // 'balance' | 'full' | 'deposit' | null
  const [error, setError] = useState<string | null>(null);
  const [quote, setQuote] = useState<QuoteSummary | null>(null);
  const [redirecting, setRedirecting] = useState(false);

  // Pre-decided types skip the choice screen and go straight to Stripe.
  const skipChoice = type === 'balance' || type === 'deposit' || type === 'full';

  // Start checkout for a given payment type by hitting the matching API.
  const beginCheckout = (paymentType: 'deposit' | 'full' | 'balance') => {
    if (!quoteId) return;
    setRedirecting(true);
    setError(null);
    const endpoint =
      paymentType === 'balance' ? '/api/payments/create-balance-checkout'
      : paymentType === 'full'  ? '/api/payments/create-full-checkout'
      :                            '/api/payments/create-checkout';
    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quoteId, token }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.checkoutUrl) {
          window.location.href = data.checkoutUrl;
        } else {
          setError(data.error || 'Failed to create checkout session');
          setRedirecting(false);
        }
      })
      .catch(() => {
        setError('Failed to connect to payment server');
        setRedirecting(false);
      });
  };

  useEffect(() => {
    if (!quoteId) {
      setError('Missing quote ID');
      return;
    }
    if (skipChoice) {
      beginCheckout((type as 'balance' | 'deposit' | 'full'));
      return;
    }
    // Load a lightweight quote summary so we can show the two amounts.
    fetch(`/api/quotes/${quoteId}/public?token=${encodeURIComponent(token || '')}`)
      .then((res) => res.json())
      .then((data) => {
        if (data?.id) {
          setQuote({
            id: data.id,
            customer_name: data.customer_name ?? null,
            product_name: data.product_name ?? null,
            estimated_price: Number(data.estimated_price || 0),
            deposit_amount: Number(data.deposit_amount || 0),
          });
        } else {
          setError(data?.error || 'Could not load quote');
        }
      })
      .catch(() => setError('Could not load quote'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteId, token, type]);

  const total = quote?.estimated_price ?? 0;
  const depositAmount = total * 0.5;
  const balanceAmount = total - depositAmount;
  const fmt = (n: number) => `$${n.toFixed(2)}`;

  return (
    <Layout>
      <div className="min-h-[60vh] flex items-center justify-center px-4 py-12">
        {error ? (
          <div className="text-center">
            <XCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
            <h1 className="text-2xl font-display font-bold text-gray-900 mb-2">Payment Error</h1>
            <p className="text-gray-500 mb-6">{error}</p>
            <Link to="/" className="text-blue-600 font-medium hover:underline">Return Home</Link>
          </div>
        ) : skipChoice || redirecting ? (
          <div className="text-center">
            <Loader2 className="h-12 w-12 animate-spin text-blue-600 mx-auto mb-4" />
            <h1 className="text-xl font-display font-bold text-gray-900 mb-2">Redirecting to Payment…</h1>
            <p className="text-gray-500">Please wait while we set up your secure payment.</p>
          </div>
        ) : !quote ? (
          <div className="text-center">
            <Loader2 className="h-12 w-12 animate-spin text-blue-600 mx-auto mb-4" />
            <p className="text-gray-500">Loading your quote…</p>
          </div>
        ) : (
          <div className="w-full max-w-xl">
            <div className="text-center mb-8">
              <h1 className="text-2xl md:text-3xl font-display font-bold text-gray-900 mb-2">
                How would you like to pay?
              </h1>
              <p className="text-gray-500">
                {quote.customer_name ? `Hi ${quote.customer_name}, ` : ''}your quote total is
                <span className="font-semibold text-gray-900"> {fmt(total)}</span>.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Pay deposit (50%) */}
              <button
                onClick={() => beginCheckout('deposit')}
                className="text-left bg-white border-2 border-gray-200 hover:border-blue-500 rounded-2xl p-5 transition shadow-sm hover:shadow-md"
              >
                <div className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Lock it in</div>
                <div className="text-2xl font-bold text-gray-900 mt-1">Pay deposit</div>
                <div className="text-3xl font-display font-bold text-blue-600 mt-3">{fmt(depositAmount)}</div>
                <div className="text-sm text-gray-500 mt-1">
                  50% today · {fmt(balanceAmount)} due when your order ships
                </div>
              </button>

              {/* Pay in full */}
              <button
                onClick={() => beginCheckout('full')}
                className="text-left bg-blue-600 hover:bg-blue-700 text-white rounded-2xl p-5 transition shadow-sm hover:shadow-md"
              >
                <div className="text-sm font-semibold text-blue-100 uppercase tracking-wide">Done in one step</div>
                <div className="text-2xl font-bold mt-1">Pay in full</div>
                <div className="text-3xl font-display font-bold mt-3">{fmt(total)}</div>
                <div className="text-sm text-blue-100 mt-1">
                  No balance email later — your order is paid and ready
                </div>
              </button>
            </div>

            <p className="text-center text-xs text-gray-400 mt-6">
              Secure payment by Stripe. Cards, Apple Pay, and Google Pay accepted.
            </p>
          </div>
        )}
      </div>
    </Layout>
  );
}

interface PaymentSuccessData {
  payment_type: string;
  business_name: string;
  customer_name?: string;
  product_name?: string;
  quote_id?: number | null;
  invoice_id?: number | null;
  invoice_number?: string | null;
  amount_total: number; // cents
  amount_due: number;
  paid_at: string;
  transaction_id: string | null;
  receipt_url: string | null;
  invoice_pdf_url: string | null;
  payment_method: { brand?: string; last4?: string | null; wallet?: string | null } | null;
}

function titleCase(s: string | undefined | null): string {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatPaymentMethod(pm: PaymentSuccessData['payment_method']): { primary: string; secondary?: string } {
  if (!pm) return { primary: 'Card' };
  const brandLast4 = pm.brand && pm.last4 ? `${titleCase(pm.brand)} ${pm.last4}` : undefined;
  if (pm.wallet === 'apple_pay') return { primary: 'Apple Pay', secondary: brandLast4 };
  if (pm.wallet === 'google_pay') return { primary: 'Google Pay', secondary: brandLast4 };
  if (brandLast4) return { primary: brandLast4 };
  if (pm.brand) return { primary: titleCase(pm.brand) };
  return { primary: 'Card' };
}

// Success page — QuickBooks-style summary with download buttons
export function PaymentSuccess() {
  const [searchParams] = useSearchParams();
  const quoteId = searchParams.get('quote');
  const invoiceId = searchParams.get('invoice');
  const sessionId = searchParams.get('session_id');
  const type = searchParams.get('type');
  const [data, setData] = useState<PaymentSuccessData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!quoteId && !invoiceId) { setLoading(false); return; }
    const params = new URLSearchParams();
    if (quoteId) params.set('quote', quoteId);
    if (invoiceId) params.set('invoice', invoiceId);
    if (sessionId) params.set('session_id', sessionId);
    if (type) params.set('type', type);
    fetch(`/api/payments/success?${params.toString()}`)
      .then(res => res.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [quoteId, invoiceId, sessionId, type]);

  if (loading) {
    return (
      <Layout>
        <div className="min-h-[60vh] flex items-center justify-center">
          <Loader2 className="h-10 w-10 animate-spin text-gray-400" />
        </div>
      </Layout>
    );
  }

  if (!data) {
    return (
      <Layout>
        <div className="min-h-[60vh] flex items-center justify-center text-center">
          <div>
            <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-900">Payment Successful</h1>
            <p className="text-gray-500 mt-2">We couldn't load the receipt details, but your payment went through.</p>
            <Link to="/" className="inline-block mt-6 text-orange-600 font-medium hover:underline">Return Home</Link>
          </div>
        </div>
      </Layout>
    );
  }

  const amount = (data.amount_total / 100).toFixed(2);
  const pm = formatPaymentMethod(data.payment_method);
  const paidDate = new Date(data.paid_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const isBalance = data.payment_type === 'balance';
  const isDeposit = data.payment_type === 'deposit';
  const remainingBalance = data.amount_due > 0 ? data.amount_due.toFixed(2) : null;

  return (
    <Layout>
      <div className="min-h-[60vh] bg-gray-50 py-10 px-4">
        <div className="max-w-md mx-auto">
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="h-1.5 bg-gradient-to-r from-green-500 via-emerald-500 to-green-600" />
            <div className="p-8">
              <h1 className="text-4xl font-bold text-green-600 text-center mb-8">Success!</h1>

              <dl className="space-y-4">
                <div className="flex justify-between items-start">
                  <dt className="text-gray-500">Business</dt>
                  <dd className="text-gray-900 font-medium text-right">{data.business_name}</dd>
                </div>
                <div className="flex justify-between items-start">
                  <dt className="text-gray-500">Payment method</dt>
                  <dd className="text-right">
                    <div className="text-gray-900 font-medium">{pm.primary}</div>
                    {pm.secondary && <div className="text-xs text-gray-400">{pm.secondary}</div>}
                  </dd>
                </div>
                {data.transaction_id && (
                  <div className="flex justify-between items-start">
                    <dt className="text-gray-500">Transaction ID</dt>
                    <dd className="text-gray-900 font-mono text-sm text-right break-all max-w-[60%]">{data.transaction_id.replace(/^(ch|pi)_/, '')}</dd>
                  </div>
                )}
                <div className="flex justify-between items-start">
                  <dt className="text-gray-500">{isDeposit ? 'Deposit date' : 'Paid date'}</dt>
                  <dd className="text-gray-900 font-medium">{paidDate}</dd>
                </div>
                {data.invoice_number && (
                  <div className="flex justify-between items-start">
                    <dt className="text-gray-500">Invoice</dt>
                    <dd className="text-gray-900 font-medium">{data.invoice_number}</dd>
                  </div>
                )}
                <div className="flex justify-between items-start">
                  <dt className="text-gray-500">{isDeposit ? 'Deposit amount' : 'Invoice amount'}</dt>
                  <dd className="text-gray-900 font-medium">${amount}</dd>
                </div>
                <div className="flex justify-between items-start pt-3 border-t border-gray-200">
                  <dt className="text-gray-900 font-bold">Total</dt>
                  <dd className="text-gray-900 font-bold">${amount}</dd>
                </div>
                {isDeposit && remainingBalance && (
                  <div className="flex justify-between items-start pt-1 text-sm">
                    <dt className="text-gray-500">Balance remaining</dt>
                    <dd className="text-orange-600 font-medium">${remainingBalance}</dd>
                  </div>
                )}
              </dl>

              <div className="mt-8 space-y-3">
                {data.receipt_url && (
                  <a
                    href={data.receipt_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full text-center px-6 py-3.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition"
                  >
                    Download receipt
                  </a>
                )}
                {data.invoice_pdf_url && (
                  <a
                    href={data.invoice_pdf_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full text-center px-6 py-3.5 bg-white border-2 border-gray-200 hover:border-gray-300 text-gray-900 rounded-lg font-semibold transition"
                  >
                    Download invoice
                  </a>
                )}
              </div>
            </div>
          </div>

          {isDeposit && (
            <p className="text-center text-sm text-gray-500 mt-6">
              Our team will start on your order. We'll email you when the balance of <strong>${remainingBalance}</strong> is ready to pay.
            </p>
          )}
          {isBalance && (
            <p className="text-center text-sm text-gray-500 mt-6">
              Your order is paid in full. We'll notify you when it's ready for pickup or shipping.
            </p>
          )}

          <div className="text-center mt-8">
            <Link to="/" className="text-sm text-gray-500 hover:text-gray-700">← Return to TShirt Brothers</Link>
          </div>

          <p className="text-center text-xs text-gray-400 mt-6">Questions? Call (470) 622-1392 or email kevin@tshirtbrothers.com</p>
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
            <a href="tel:4706221392" className="px-5 py-2.5 border border-gray-200 rounded-lg text-sm font-semibold hover:bg-gray-50 transition">
              Call Us
            </a>
          </div>
        </div>
      </div>
    </Layout>
  );
}
