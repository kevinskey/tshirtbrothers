import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, SlidersHorizontal } from 'lucide-react';
import { fetchConfig, fetchProducts } from '../lib/api';
import ProductCard from '../components/ProductCard';
import { useCgcPath } from '../lib/base';

const SORT_OPTIONS = [
  { value: 'name', label: 'Name A–Z' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
  { value: 'newest', label: 'Newest' },
];

const PRICE_BANDS = [
  { key: '', label: 'Any price' },
  { key: '0-2500', label: 'Under $25' },
  { key: '2500-5000', label: '$25 – $50' },
  { key: '5000-10000', label: '$50 – $100' },
  { key: '10000-', label: '$100 & Up' },
];

// /shop — the full assortment. Reads search/category/sort/page plus the
// gift-finder's recipient/occasion/budget keys straight from the URL, so
// finder results, nav links, and searches are all shareable addresses.
export default function ShopPage() {
  const p = useCgcPath();
  const [params, setParams] = useSearchParams();
  const search = params.get('search') ?? '';
  const category = params.get('category') ?? '';
  const sort = params.get('sort') ?? 'name';
  const page = Math.max(1, parseInt(params.get('page') ?? '1', 10) || 1);
  const priceBand = params.get('price') ?? '';
  const recipient = params.get('recipient') ?? '';
  const occasion = params.get('occasion') ?? '';
  const budget = params.get('budget') ?? '';

  const { data: config } = useQuery({ queryKey: ['cgc-config'], queryFn: fetchConfig });

  // Gift-finder keys resolve through /api/cgc/gift-finder once, then we
  // shop its resolved filters via the regular products endpoint.
  const finderActive = Boolean(recipient || occasion || budget);
  const { data: finder } = useQuery({
    queryKey: ['cgc-finder', recipient, occasion, budget],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (recipient) qs.set('recipient', recipient);
      if (occasion) qs.set('occasion', occasion);
      if (budget) qs.set('budget', budget);
      const res = await fetch(`/api/cgc/gift-finder?${qs}`);
      if (!res.ok) throw new Error('Gift finder failed');
      return res.json() as Promise<{
        resolved: { search: string; category: string; min_cents: number | ''; max_cents: number | '' };
        relaxed: boolean;
      }>;
    },
    enabled: finderActive,
  });

  const [bandMin, bandMax] = priceBand ? priceBand.split('-') : ['', ''];
  const effective = finderActive && finder
    ? finder.resolved
    : {
      search,
      category,
      min_cents: bandMin || '',
      max_cents: bandMax || '',
    };

  const { data, isLoading } = useQuery({
    queryKey: ['cgc-products', effective, sort, page],
    queryFn: () => fetchProducts({
      search: effective.search,
      category: effective.category,
      min_cents: effective.min_cents,
      max_cents: effective.max_cents,
      sort,
      page,
      limit: 24,
    }),
    enabled: !finderActive || Boolean(finder),
  });

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next);
  };

  const finderLabels = useMemo(() => {
    if (!config) return [];
    return [
      config.recipients.find((r) => r.key === recipient)?.label,
      config.occasions.find((o) => o.key === occasion)?.label,
      config.budgets.find((b) => b.key === budget)?.label,
    ].filter(Boolean) as string[];
  }, [config, recipient, occasion, budget]);

  const heading = finderActive
    ? `Gifts ${finderLabels.length ? `— ${finderLabels.join(' · ')}` : ''}`
    : search
      ? `Results for “${search}”`
      : category || 'Shop All';

  const selectClass =
    'rounded-full border border-cgc-cream-deep bg-white px-4 py-2 text-sm font-medium text-cgc-ink focus:outline-none focus:ring-2 focus:ring-cgc-orange';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <Helmet><title>{`${heading} — Custom Gift Club`}</title></Helmet>

      <nav className="text-sm text-cgc-stone mb-3" aria-label="Breadcrumb">
        <Link to={p('/')} className="hover:text-cgc-orange">Home</Link>
        <span aria-hidden> / </span>
        <span className="text-cgc-ink font-medium">{heading}</span>
      </nav>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-cgc-ink">{heading}</h1>
        <p className="text-sm text-cgc-stone">{data ? `${data.total.toLocaleString()} products` : '…'}</p>
      </div>

      {finderActive && finder?.relaxed && (
        <p className="mb-4 rounded-lg bg-cgc-cream px-4 py-3 text-sm text-cgc-charcoal">
          We didn’t find an exact match for every pick, so here are close ideas we think they’ll love.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-6">
        <SlidersHorizontal className="h-4 w-4 text-cgc-stone" aria-hidden />
        <label className="sr-only" htmlFor="filter-category">Category</label>
        <select id="filter-category" className={selectClass} value={finderActive ? '' : category}
          onChange={(e) => setParam('category', e.target.value)} disabled={finderActive}>
          <option value="">All categories</option>
          {(config?.categories ?? []).map((c) => (
            <option key={c} value={c}>
              {c}{data?.categories && !category ? ` (${data.categories[c] ?? 0})` : ''}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="filter-price">Price</label>
        <select id="filter-price" className={selectClass} value={finderActive ? '' : priceBand}
          onChange={(e) => setParam('price', e.target.value)} disabled={finderActive}>
          {PRICE_BANDS.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
        </select>
        <label className="sr-only" htmlFor="filter-sort">Sort</label>
        <select id="filter-sort" className={selectClass} value={sort}
          onChange={(e) => setParam('sort', e.target.value)}>
          {SORT_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        {finderActive && (
          <button
            type="button"
            onClick={() => setParams(new URLSearchParams())}
            className="text-sm font-semibold text-cgc-orange hover:text-cgc-orange-dark"
          >
            Clear gift finder
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="aspect-[3/4] rounded-xl bg-cgc-cream animate-pulse" />
          ))}
        </div>
      ) : data && data.products.length ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {data.products.map((product) => <ProductCard key={product.sku} product={product} />)}
          </div>
          {data.totalPages > 1 && (
            <nav className="mt-8 flex items-center justify-center gap-3" aria-label="Pagination">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setParam('page', String(page - 1))}
                className="inline-flex items-center gap-1 rounded-full border border-cgc-cream-deep px-4 py-2 text-sm font-semibold text-cgc-ink disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden /> Prev
              </button>
              <span className="text-sm text-cgc-stone">Page {data.page} of {data.totalPages}</span>
              <button
                type="button"
                disabled={page >= data.totalPages}
                onClick={() => setParam('page', String(page + 1))}
                className="inline-flex items-center gap-1 rounded-full border border-cgc-cream-deep px-4 py-2 text-sm font-semibold text-cgc-ink disabled:opacity-40"
              >
                Next <ChevronRight className="h-4 w-4" aria-hidden />
              </button>
            </nav>
          )}
        </>
      ) : (
        <div className="py-16 text-center">
          <p className="text-lg font-semibold text-cgc-ink">No products matched.</p>
          <p className="mt-1 text-sm text-cgc-stone">Try a different search or browse the full assortment.</p>
          <Link to={p('/shop')} className="mt-4 inline-flex rounded-lg bg-cgc-orange hover:bg-cgc-orange-dark text-white font-bold px-6 py-3">
            Shop All Products
          </Link>
        </div>
      )}
    </div>
  );
}
