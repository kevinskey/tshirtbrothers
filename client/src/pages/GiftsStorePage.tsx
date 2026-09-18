/**
 * Gifts & Awards store — curated JDS Industries blanks (tumblers, plaques,
 * awards, gifts) sold retail through Stripe Checkout. Products are
 * published from the admin Blanks (JDS) section; buying redirects to
 * Stripe and the webhook records the order for fulfillment.
 */

import { useEffect, useRef, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Gift, Loader2, ShoppingBag, CheckCircle2, Search } from 'lucide-react';
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

// Quick filter chips — each is just a search term against the catalog.
const QUICK_CHIPS = ['Tumbler', 'Water Bottle', 'Award', 'Plaque', 'Cutting Board', 'Ornament', 'Keychain', 'Frame', 'Flask', 'Coaster'];

interface GiftsPage {
  products: JdsStoreProduct[];
  total: number;
  page: number;
  totalPages: number;
}

export default function GiftsStorePage() {
  const [searchParams] = useSearchParams();
  const purchased = searchParams.get('purchased') === '1';
  const [buyingSku, setBuyingSku] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // ?search= lets menu links land pre-filtered (Engraved Drinkware →
  // /gifts?search=tumbler).
  const urlSearch = searchParams.get('search') || '';
  const [searchInput, setSearchInput] = useState(urlSearch);
  const [search, setSearch] = useState(urlSearch);
  useEffect(() => { setSearchInput(urlSearch); setSearch(urlSearch); }, [urlSearch]);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Debounce typing so we don't hammer the API per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery<GiftsPage>({
    queryKey: ['jds-store-products', search],
    queryFn: async ({ pageParam = 1 }) => {
      const q = new URLSearchParams({ page: String(pageParam), limit: '48' });
      if (search) q.set('search', search);
      const r = await fetch(`/api/jds-store/products?${q}`);
      if (!r.ok) throw new Error('load failed');
      return r.json() as Promise<GiftsPage>;
    },
    getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
    initialPageParam: 1,
    staleTime: 60_000,
  });
  const products = data?.pages.flatMap((p) => p.products) ?? [];
  const total = data?.pages[0]?.total ?? 0;

  // Infinite scroll
  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting && hasNextPage && !isFetchingNextPage) fetchNextPage();
    }, { threshold: 0.1 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

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

          {/* Search + quick chips */}
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search tumblers, plaques, awards, ornaments…"
                className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
                style={{ fontSize: '16px' }}
              />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {QUICK_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => setSearchInput(search === chip.toLowerCase() ? '' : chip.toLowerCase())}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${search === chip.toLowerCase() ? 'bg-orange-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >
                  {chip}
                </button>
              ))}
              {!isLoading && (
                <span className="ml-auto text-xs text-gray-400">{total.toLocaleString()} items</span>
              )}
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
              <p className="text-lg font-medium">{search ? `No matches for "${search}"` : 'Nothing here yet'}</p>
              <p className="text-sm">{search ? 'Try a different word — or browse the quick filters above.' : 'Check back soon — new gifts are on the way.'}</p>
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

          {/* Infinite-scroll sentinel */}
          <div ref={loadMoreRef} className="h-8" />
          {isFetchingNextPage && (
            <div className="flex items-center justify-center gap-2 py-4 text-gray-400 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading more…
            </div>
          )}
        </div>
      </section>
    </Layout>
  );
}
