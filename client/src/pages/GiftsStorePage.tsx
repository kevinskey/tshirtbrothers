/**
 * Gifts & Awards store — curated JDS Industries blanks (tumblers, plaques,
 * awards, gifts) sold retail through Stripe Checkout. Products are
 * published from the admin Blanks (JDS) section; buying redirects to
 * Stripe and the webhook records the order for fulfillment.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Gift, Loader2, ShoppingBag, CheckCircle2 } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import Seo from '@/components/Seo';

interface JdsStoreProduct {
  id: number;
  sku: string;
  name: string;
  description: string | null;
  image_url: string | null;
  retail_price_cents: number;
}

export default function GiftsStorePage() {
  const [searchParams] = useSearchParams();
  const purchased = searchParams.get('purchased') === '1';
  const [buyingSku, setBuyingSku] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['jds-store-products'],
    queryFn: async () => {
      const r = await fetch('/api/jds-store/products');
      if (!r.ok) throw new Error('load failed');
      return r.json() as Promise<{ products: JdsStoreProduct[] }>;
    },
    staleTime: 60_000,
  });
  const products = data?.products ?? [];

  const buy = async (sku: string) => {
    if (buyingSku) return;
    setBuyingSku(sku);
    setError(null);
    try {
      const r = await fetch('/api/jds-store/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku, qty: 1 }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || 'Checkout failed');
      window.location.href = body.checkoutUrl;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Checkout failed');
      setBuyingSku(null);
    }
  };

  return (
    <Layout>
      <Seo
        title="Gifts & Awards · TShirt Brothers"
        description="Laser-engravable tumblers, plaques, awards, and gifts — customized in Atlanta and shipped or picked up in Fairburn, GA."
        path="/gifts"
      />
      <section className="py-8">
        <div className="container mx-auto px-4">
          <div className="mb-6 flex items-center gap-3">
            <Gift className="h-7 w-7 text-orange-600" />
            <div>
              <h1 className="font-display text-2xl sm:text-3xl font-bold">Gifts &amp; Awards</h1>
              <p className="text-sm text-gray-500">Tumblers, plaques, and keepsakes — personalized by TShirt Brothers.</p>
            </div>
          </div>

          {purchased && (
            <div className="mb-6 flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
              <CheckCircle2 className="h-5 w-5 shrink-0" />
              Order received! We&apos;ll email you when it ships (or is ready for pickup in Fairburn).
            </div>
          )}
          {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

          {isLoading ? (
            <div className="flex items-center gap-2 py-16 justify-center text-gray-500">
              <Loader2 className="h-5 w-5 animate-spin" /> Loading…
            </div>
          ) : products.length === 0 ? (
            <div className="py-16 text-center text-gray-400">
              <ShoppingBag className="mx-auto mb-3 h-12 w-12 text-gray-300" />
              <p className="text-lg font-medium">Nothing here yet</p>
              <p className="text-sm">Check back soon — new gifts are on the way.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
              {products.map((p) => (
                <div key={p.id} className="flex flex-col rounded-xl border border-gray-200 bg-white overflow-hidden">
                  <div className="aspect-square bg-gray-50 flex items-center justify-center">
                    {p.image_url ? (
                      <img src={p.image_url} alt={p.name} loading="lazy" className="h-full w-full object-contain p-4" />
                    ) : (
                      <Gift className="h-12 w-12 text-gray-300" />
                    )}
                  </div>
                  <div className="flex flex-1 flex-col p-3 sm:p-4">
                    <h3 className="text-sm font-semibold text-gray-900 line-clamp-2">{p.name}</h3>
                    {p.description && (
                      <p className="mt-1 text-xs text-gray-500 line-clamp-2">{p.description}</p>
                    )}
                    <div className="mt-auto flex items-center justify-between pt-3">
                      <span className="text-base font-bold text-gray-900">
                        ${(p.retail_price_cents / 100).toFixed(2)}
                      </span>
                      <button
                        type="button"
                        onClick={() => buy(p.sku)}
                        disabled={buyingSku !== null}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-orange-700 disabled:opacity-50 transition-colors"
                      >
                        {buyingSku === p.sku
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <ShoppingBag className="h-3.5 w-3.5" />}
                        Buy
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </Layout>
  );
}
