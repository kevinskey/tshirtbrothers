// Shop by Occasion collection page — one shared component, eight
// occasions (config in ../lib/occasions). Faithful implementation of the
// approved October 2026 reference design: cream hero with layered product
// shots, swipeable occasion tabs, type-chip shortcuts, a filter sheet
// (bottom sheet on phones, side panel on desktop), active-filter chips,
// and a 2/3/4-column product grid — all served by the live catalog
// through the existing /api/cgc/products contract.

import {
  useEffect, useMemo, useRef, useState,
} from 'react';
import {
  Link, Navigate, useParams, useSearchParams,
} from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useInfiniteQuery, useQueries, useQuery } from '@tanstack/react-query';
import {
  ArrowRight, ChevronDown, ChevronRight, Gift, Heart, Search,
  SlidersHorizontal, Sparkles, X,
} from 'lucide-react';
import type { CgcListResponse, CgcProduct } from '../lib/api';
import { fetchProducts, money } from '../lib/api';
import { useCgcPath } from '../lib/base';
import { useCgcFavorites } from '../lib/favorites';
import {
  OCCASIONS, OCCASION_BUDGETS, OCCASION_MATERIALS, OCCASION_SORTS,
  occasionBySlug, type OccasionConfig,
} from '../lib/occasions';

const PAGE_SIZE = 24;

interface Filters {
  q: string;
  types: string[]; // chip labels
  materials: string[]; // material labels
  budget: string; // OCCASION_BUDGETS key
  sort: string; // OCCASION_SORTS key
}

const readFilters = (params: URLSearchParams): Filters => ({
  q: params.get('q') ?? '',
  types: (params.get('type') ?? '').split('|').filter(Boolean),
  materials: (params.get('material') ?? '').split('|').filter(Boolean),
  budget: OCCASION_BUDGETS.some((b) => b.key === params.get('budget'))
    ? (params.get('budget') as string) : 'all',
  sort: OCCASION_SORTS.some((s) => s.key === params.get('sort'))
    ? (params.get('sort') as string) : 'featured',
});

const writeFilters = (f: Filters): URLSearchParams => {
  const params = new URLSearchParams();
  if (f.q.trim()) params.set('q', f.q.trim());
  if (f.types.length) params.set('type', f.types.join('|'));
  if (f.materials.length) params.set('material', f.materials.join('|'));
  if (f.budget !== 'all') params.set('budget', f.budget);
  if (f.sort !== 'featured') params.set('sort', f.sort);
  return params;
};

// Merge several |-alternation tokens into one ORed token. The products
// endpoint caps a term at 12 alternatives, so trim to that.
const mergeTokens = (tokens: string[]) =>
  [...new Set(tokens.flatMap((t) => t.split('|')))].slice(0, 12).join('|');

// The /products query for a filter set: AND of (type-or-collection token)
// × (material token) × (each word the shopper typed), plus price bounds.
function serverParams(occasion: OccasionConfig, f: Filters) {
  const typeToken = f.types.length
    ? mergeTokens(occasion.chips.filter((c) => f.types.includes(c.label)).map((c) => c.token))
    : occasion.token;
  const materialToken = f.materials.length
    ? mergeTokens(OCCASION_MATERIALS.filter((m) => f.materials.includes(m.label)).map((m) => m.token))
    : '';
  const budget = OCCASION_BUDGETS.find((b) => b.key === f.budget) ?? OCCASION_BUDGETS[0];
  const sort = f.sort === 'price-asc' ? 'price_asc' : f.sort === 'price-desc' ? 'price_desc' : 'name';
  return {
    search: [typeToken, materialToken, f.q.trim()].filter(Boolean).join(' '),
    min_cents: budget.min,
    max_cents: budget.max,
    sort,
  };
}

// Client-side mirror of the server's term matching, used only to decide
// which curated featured picks still belong under the active filters.
function matchesFilters(p: CgcProduct, occasion: OccasionConfig, f: Filters) {
  const hay = `${p.name} ${p.sku} ${p.description ?? ''}`.toLowerCase();
  const { search, min_cents, max_cents } = serverParams(occasion, f);
  const termsOk = search.split(/\s+/).filter(Boolean)
    .every((term) => term.split('|').some((alt) => alt && hay.includes(alt.toLowerCase())));
  const minOk = !min_cents || p.retail_price_cents >= parseInt(min_cents, 10);
  const maxOk = !max_cents || p.retail_price_cents <= parseInt(max_cents, 10);
  return termsOk && minOk && maxOk;
}

const filterCount = (f: Filters) =>
  f.types.length + f.materials.length + (f.budget !== 'all' ? 1 : 0);

export default function OccasionPage() {
  const { slug = '' } = useParams();
  const p = useCgcPath();
  const occasion = occasionBySlug(slug);
  if (!occasion) return <Navigate to={p('/shop')} replace />;
  return <OccasionCollection key={occasion.key} occasion={occasion} />;
}

function OccasionCollection({ occasion }: { occasion: OccasionConfig }) {
  const p = useCgcPath();
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => readFilters(params), [params]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [queryDraft, setQueryDraft] = useState(filters.q);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => { window.scrollTo(0, 0); }, [occasion.key]);
  useEffect(() => { setQueryDraft(filters.q); }, [filters.q]);

  const apply = (next: Filters) => setParams(writeFilters(next), { replace: true });

  // Debounced search-as-you-type, reference behavior.
  useEffect(() => {
    if (queryDraft === filters.q) return undefined;
    const t = setTimeout(() => apply({ ...filters, q: queryDraft }), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryDraft]);

  const query = serverParams(occasion, filters);
  const list = useInfiniteQuery({
    queryKey: ['cgc-occasion', occasion.key, query],
    queryFn: ({ pageParam }) => fetchProducts({ ...query, page: pageParam, limit: PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (last: CgcListResponse) =>
      (last.page < last.totalPages ? last.page + 1 : undefined),
  });

  // Curated featured picks (also the hero imagery). One lookup per
  // occasion; SKU search can substring-match, so keep exact SKUs only.
  const { data: featuredData } = useQuery({
    queryKey: ['cgc-occasion-featured', occasion.key],
    queryFn: () => fetchProducts({ search: occasion.featuredSkus.join('|'), limit: 48 }),
  });
  const featured = useMemo(() => {
    const bySku = new Map((featuredData?.products ?? []).map((x) => [x.sku, x]));
    return occasion.featuredSkus.map((sku) => bySku.get(sku)).filter(Boolean) as CgcProduct[];
  }, [featuredData, occasion]);

  const loaded = useMemo(() => (list.data?.pages ?? []).flatMap((pg) => pg.products), [list.data]);
  const total = list.data?.pages[0]?.total ?? 0;

  // "Featured picks" floats the curated items (those still matching the
  // active filters) ahead of the server pages, deduped by SKU.
  const products = useMemo(() => {
    if (filters.sort !== 'featured') return loaded;
    const lead = featured.filter((x) => matchesFilters(x, occasion, filters));
    const leadSkus = new Set(lead.map((x) => x.sku));
    return [...lead, ...loaded.filter((x) => !leadSkus.has(x.sku))];
  }, [loaded, featured, filters, occasion]);

  const heroProducts = featured.slice(0, 3);
  const active = filterCount(filters);
  const changed = active > 0 || Boolean(filters.q.trim());
  const Icon = occasion.icon;

  const removeFilter = (kind: 'q' | 'type' | 'material' | 'budget', value?: string) => {
    const next = { ...filters };
    if (kind === 'q') next.q = '';
    if (kind === 'type') next.types = filters.types.filter((t) => t !== value);
    if (kind === 'material') next.materials = filters.materials.filter((m) => m !== value);
    if (kind === 'budget') next.budget = 'all';
    apply(next);
  };

  const clearAll = () => apply({ q: '', types: [], materials: [], budget: 'all', sort: filters.sort });

  return (
    <div className="bg-white">
      <Helmet>
        <title>{`${occasion.label}${/Gifts$/.test(occasion.label) ? '' : ' Gifts'} | Custom Gift Club`}</title>
        <meta name="description" content={occasion.intro} />
      </Helmet>

      <OccasionTabs current={occasion.key} />

      <div className="max-w-7xl mx-auto px-3.5 min-[420px]:px-4 sm:px-6 lg:px-8">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 py-3 text-[11px] sm:text-xs text-cgc-stone whitespace-nowrap overflow-hidden" aria-label="Breadcrumb">
          <Link to={p('/')} className="hover:text-cgc-orange-dark">Home</Link>
          <ChevronRight className="h-3 w-3 shrink-0" aria-hidden />
          <Link to={p('/shop')} className="hover:text-cgc-orange-dark">Shop by occasion</Link>
          <ChevronRight className="h-3 w-3 shrink-0" aria-hidden />
          <span aria-current="page" className="text-cgc-charcoal font-medium truncate">{occasion.label}</span>
        </nav>

        {/* Hero */}
        <section
          aria-labelledby="occasion-heading"
          className="relative isolate overflow-hidden rounded-[22px] lg:rounded-3xl bg-cgc-cream min-h-[260px] sm:min-h-[315px] lg:min-h-[305px] lg:flex lg:items-center"
        >
          <div className="relative z-10 px-5 min-[420px]:px-6 sm:px-9 lg:px-11 py-6 sm:py-9 lg:w-[62%]">
            <p className="flex items-center gap-1.5 text-[10px] font-extrabold tracking-[0.12em] text-[#b94609]">
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {occasion.eyebrow}
            </p>
            <h1
              id="occasion-heading"
              className="mt-2.5 font-display font-bold text-cgc-ink text-[32px] min-[420px]:text-[35px] sm:text-[43px] lg:text-[46px] leading-[1.05] tracking-[-0.03em]"
            >
              {occasion.headline[0]}
              <span className="block text-[#df5a00]">{occasion.headline[1]}</span>
            </h1>
            <p className="mt-3 sm:mt-4 max-w-[57%] sm:max-w-[52%] lg:max-w-[435px] text-xs sm:text-sm text-[#5d5147] leading-relaxed">
              {occasion.intro}
            </p>
            <a
              href="#gift-collection"
              onClick={(e) => { e.preventDefault(); gridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
              className="hidden sm:inline-flex items-center gap-2 mt-4 lg:mt-5 rounded-[10px] bg-cgc-orange hover:bg-[#fb8a35] text-cgc-ink text-[13px] font-bold px-4 py-3"
            >
              Find their gift <ArrowRight className="h-4 w-4" aria-hidden />
            </a>
          </div>

          {/* Layered product visual */}
          <div className="absolute z-0 right-0 sm:right-4 lg:right-7 bottom-1 sm:bottom-7 lg:bottom-4 w-[43%] lg:w-[39%] h-[133px] sm:h-[240px] lg:h-[275px]" aria-hidden>
            <div className="absolute rounded-full bg-[#ffddbc] opacity-75 w-[155px] h-[155px] -right-4 bottom-0 sm:w-[220px] sm:h-[220px] sm:right-0 lg:w-[255px] lg:h-[255px] lg:right-[13%] lg:-bottom-5 before:content-[''] before:absolute before:-inset-2.5 before:rounded-full before:border before:border-[#edb681] before:opacity-50" />
            {heroProducts[0]?.image_url && (
              <img
                src={heroProducts[0].image_url}
                alt=""
                className="absolute object-contain mix-blend-multiply drop-shadow-[0_9px_5px_rgba(87,67,44,0.1)] -rotate-[8deg] left-[-5%] bottom-0 w-[60%] h-[84%] sm:left-0 sm:w-[57%] lg:left-[1%] lg:w-[40%] lg:h-[77%] z-30"
              />
            )}
            {heroProducts[1]?.image_url && (
              <img
                src={heroProducts[1].image_url}
                alt=""
                className="absolute object-contain mix-blend-multiply drop-shadow-[0_9px_5px_rgba(87,67,44,0.1)] rotate-[9deg] lg:rotate-[4deg] right-[-4%] bottom-3.5 w-[72%] h-[92%] sm:right-[2%] sm:w-[65%] lg:left-[25%] lg:right-auto lg:bottom-1 lg:w-[49%] lg:h-full z-10"
              />
            )}
            {heroProducts[2]?.image_url && (
              <img
                src={heroProducts[2].image_url}
                alt=""
                className="hidden lg:block absolute object-contain mix-blend-multiply drop-shadow-[0_9px_5px_rgba(87,67,44,0.1)] rotate-[10deg] right-[-2%] bottom-2 w-[40%] h-[74%] z-20"
              />
            )}
            <Sparkles className="absolute right-[10%] -top-1 lg:top-3 h-6 w-6 lg:h-9 lg:w-9 rotate-12 text-[#d46a22]" strokeWidth={1.25} aria-hidden />
            <span className="absolute right-1.5 bottom-0 sm:right-9 sm:-bottom-1.5 lg:right-[20%] z-40 flex items-center gap-1 -rotate-[5deg] rounded-full bg-white px-2 py-1 sm:px-3 sm:py-2 text-[8px] sm:text-[10px] font-bold text-[#934518] shadow-[0_3px_12px_rgba(83,57,20,0.08)]">
              <Heart className="h-2.5 w-2.5 sm:h-3.5 sm:w-3.5" aria-hidden /> A gift with meaning
            </span>
          </div>
        </section>

        {/* Occasion-scoped search */}
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            apply({ ...filters, q: queryDraft });
            gridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
          className="mt-4 sm:mt-5 max-w-xl"
        >
          <label htmlFor="occasion-search" className="sr-only">
            Search {occasion.label.toLowerCase()} gifts
          </label>
          <div className="relative flex items-center rounded-full border border-cgc-cream-deep bg-[#faf7f2] focus-within:border-cgc-orange focus-within:ring-2 focus-within:ring-cgc-orange/15 min-h-[46px] pl-4">
            <Search className="h-[18px] w-[18px] text-cgc-stone shrink-0" aria-hidden />
            <input
              id="occasion-search"
              type="search"
              enterKeyHint="search"
              autoComplete="off"
              value={queryDraft}
              onChange={(e) => setQueryDraft(e.target.value)}
              placeholder={`Search ${occasion.label.toLowerCase()} gifts…`}
              className="w-full bg-transparent border-0 outline-none text-base sm:text-sm text-cgc-ink placeholder:text-cgc-stone px-3 h-11 [&::-webkit-search-cancel-button]:hidden"
            />
            {queryDraft && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => { setQueryDraft(''); apply({ ...filters, q: '' }); }}
                className="p-2.5 mr-1 rounded-full text-cgc-charcoal hover:bg-cgc-cream"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            )}
          </div>
        </form>

        {/* Type-chip shortcuts */}
        <nav
          aria-label="Quick product filters"
          className="flex gap-2 lg:gap-2.5 overflow-x-auto whitespace-nowrap pt-4 pb-3.5 lg:pt-6 lg:pb-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <TypeChip
            label="All gifts"
            selected={!filters.types.length}
            onClick={() => apply({ ...filters, types: [] })}
          />
          {occasion.chips.map((chip) => (
            <TypeChip
              key={chip.label}
              label={chip.label}
              selected={filters.types.includes(chip.label)}
              onClick={() => apply({
                ...filters,
                // Tapping a chip picks that single type; tapping it again
                // (as the only selection) returns to the full collection.
                types: filters.types.length === 1 && filters.types[0] === chip.label ? [] : [chip.label],
              })}
            />
          ))}
        </nav>

        {/* Toolbar */}
        <div id="gift-collection" ref={gridRef} className="scroll-mt-20 flex items-center justify-between gap-2.5 border-y border-cgc-cream-deep py-3 lg:py-4">
          <div className="min-w-0 lg:flex lg:items-baseline lg:gap-3">
            <h2 className="font-display font-bold text-lg lg:text-2xl tracking-tight text-cgc-ink">Find their gift</h2>
            <p className="text-[11px] lg:text-xs text-cgc-stone mt-0.5 lg:mt-0" role="status" aria-live="polite">
              {list.isLoading
                ? 'Finding gifts…'
                : `${total.toLocaleString()} ${changed ? 'matching' : 'thoughtful'} gift${total === 1 ? '' : 's'}`}
            </p>
          </div>
          <div className="flex items-center gap-3 lg:gap-4 shrink-0">
            <label className="hidden lg:flex items-center gap-2 text-[11px] text-cgc-stone">
              Sort
              <select
                aria-label="Sort gifts"
                value={filters.sort}
                onChange={(e) => apply({ ...filters, sort: e.target.value })}
                className="bg-transparent text-xs font-semibold text-cgc-charcoal py-2 pr-1 focus:outline-none focus:ring-2 focus:ring-cgc-orange rounded"
              >
                {OCCASION_SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </label>
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              aria-haspopup="dialog"
              className="flex items-center gap-1.5 rounded-[9px] border border-[#dacfbe] bg-white hover:bg-cgc-cream px-3 lg:px-4 py-2.5 min-h-[43px] text-[11px] sm:text-xs lg:text-xs font-bold text-cgc-ink"
            >
              <SlidersHorizontal className="h-4 w-4" aria-hidden />
              Filter & sort
              {active > 0 && (
                <b className="grid place-items-center h-[17px] w-[17px] rounded-full bg-cgc-orange text-[10px] text-cgc-ink">{active}</b>
              )}
            </button>
          </div>
        </div>

        {/* Active filters */}
        {(changed) && (
          <div className="flex flex-wrap items-center gap-1.5 pt-3.5" aria-label="Applied filters">
            {filters.q.trim() && (
              <ActiveChip label={`“${filters.q.trim()}”`} onRemove={() => removeFilter('q')} />
            )}
            {filters.types.map((t) => (
              <ActiveChip key={t} label={t} onRemove={() => removeFilter('type', t)} />
            ))}
            {filters.materials.map((m) => (
              <ActiveChip key={m} label={m} onRemove={() => removeFilter('material', m)} />
            ))}
            {filters.budget !== 'all' && (
              <ActiveChip
                label={OCCASION_BUDGETS.find((b) => b.key === filters.budget)?.label ?? ''}
                onRemove={() => removeFilter('budget')}
              />
            )}
            <button type="button" onClick={clearAll} className="min-h-[36px] px-2 text-[11px] underline underline-offset-2 text-cgc-charcoal">
              Clear all
            </button>
          </div>
        )}

        <p className="mt-3.5 mb-4 lg:mb-5 text-[10px] lg:text-[11px] text-cgc-stone">
          Base item prices shown. Personalization options and final pricing on each product page.
        </p>

        {/* Grid */}
        {list.isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-3 gap-y-6 sm:gap-5 lg:gap-x-6 lg:gap-y-8">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="aspect-square rounded-2xl bg-cgc-cream animate-pulse" />
            ))}
          </div>
        ) : products.length ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-3 gap-y-6 sm:gap-5 lg:gap-x-6 lg:gap-y-8">
              {products.map((product, i) => (
                <OccasionCard key={product.sku} product={product} eager={i < 4} />
              ))}
            </div>
            <div className="flex flex-col items-center gap-3 pt-8">
              <p className="text-[11px] text-cgc-stone">
                {list.hasNextPage
                  ? `${products.length} of ${Math.max(total, products.length)} gifts`
                  : `You’ve seen all ${products.length} gifts in this collection.`}
              </p>
              {list.hasNextPage && (
                <button
                  type="button"
                  onClick={() => list.fetchNextPage()}
                  disabled={list.isFetchingNextPage}
                  className="inline-flex items-center gap-2 rounded-[10px] border border-cgc-ink bg-white hover:bg-cgc-cream px-7 py-3 text-[13px] font-bold text-cgc-ink disabled:opacity-50"
                >
                  {list.isFetchingNextPage ? 'Loading…' : 'Show more gifts'}
                  <ChevronDown className="h-4 w-4" aria-hidden />
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="rounded-2xl bg-[#faf7f2] px-5 py-11 text-center">
            <Search className="mx-auto mb-4 h-9 w-9 text-[#b94609]" aria-hidden />
            <h3 className="font-display text-xl sm:text-2xl font-bold text-cgc-ink">Let’s find a different kind of perfect.</h3>
            <p className="mx-auto mt-2 mb-5 max-w-[350px] text-[13px] text-cgc-stone">
              Try another word or clear a filter to see more gifts in this collection.
            </p>
            <button
              type="button"
              onClick={clearAll}
              className="inline-flex items-center gap-2 rounded-[10px] bg-cgc-orange hover:bg-[#fb8a35] px-5 py-3 text-[13px] font-bold text-cgc-ink"
            >
              See all {occasion.label.toLowerCase()} gifts <ArrowRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
        )}

        {/* Make it personal strip */}
        <section aria-label="Make it personal" className="mt-9 lg:mt-12 flex flex-wrap sm:flex-nowrap items-center gap-4 lg:gap-5 rounded-[18px] lg:rounded-[20px] bg-[#fff0df] px-5 py-6 lg:px-9 lg:py-7">
          <span className="grid h-10 w-10 lg:h-[52px] lg:w-[52px] shrink-0 place-items-center rounded-full bg-[#ffd7ad] text-[#a94006]">
            <Gift className="h-6 w-6 lg:h-7 lg:w-7" aria-hidden />
          </span>
          <div className="min-w-[200px] flex-1">
            <h2 className="font-display text-lg lg:text-2xl font-bold tracking-tight text-cgc-ink">A little thought. A lot of meaning.</h2>
            <p className="mt-1.5 text-xs lg:text-[13px] leading-relaxed text-[#735239]">
              A name, a date, an inside joke. The best part of the gift is what you add.
            </p>
          </div>
          <Link to="/design?store=cgc" className="ml-[54px] sm:ml-0 flex items-center gap-2.5 whitespace-nowrap text-xs lg:text-[13px] font-bold text-[#a43d00] min-h-[36px]">
            Explore the Design Studio <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </section>

        {/* Feature section */}
        <section className="grid gap-6 py-10 sm:grid-cols-2 sm:items-center sm:gap-9 lg:gap-16 lg:px-7 lg:py-16">
          <img
            src="/cgc-hero.jpg"
            alt="Personalized tumblers, boards, and keepsakes from Custom Gift Club"
            loading="lazy"
            className="h-52 w-full rounded-[20px] object-cover sm:h-72 lg:h-80"
          />
          <div>
            <p className="text-[10px] font-extrabold tracking-[0.12em] text-[#b94609]">THOUGHTFUL GIFTS. SHARED MOMENTS.</p>
            <h2 className="mt-2 max-w-[400px] font-display text-[29px] lg:text-[38px] font-bold leading-[1.1] tracking-tight text-cgc-ink">
              {occasion.feature.title}
            </h2>
            <p className="mt-3 max-w-[440px] text-[13px] lg:text-sm leading-relaxed text-cgc-stone">
              {occasion.feature.body}
            </p>
            <Link
              to={p('/quote')}
              className="mt-5 inline-flex items-center gap-2 rounded-[10px] border border-cgc-ink bg-white hover:bg-cgc-cream px-5 py-3 text-[13px] font-bold text-cgc-ink"
            >
              Let’s find your gift <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link to={p('/business')} className="mt-4 block text-[10px] lg:text-[11px] text-cgc-stone underline underline-offset-2">
              Gifting for a group? Explore business & bulk.
            </Link>
          </div>
        </section>
      </div>

      <FilterSheet
        open={sheetOpen}
        occasion={occasion}
        filters={filters}
        onClose={() => setSheetOpen(false)}
        onApply={(next) => { apply(next); setSheetOpen(false); }}
      />
    </div>
  );
}

// ── Pieces ───────────────────────────────────────────────────────────────

function OccasionTabs({ current }: { current: string }) {
  const p = useCgcPath();
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const nav = ref.current;
    const activeTab = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (nav && activeTab) {
      nav.scrollTo({ left: activeTab.offsetLeft - nav.offsetLeft - 24 });
    }
  }, [current]);

  return (
    <div className="border-b border-cgc-cream-deep bg-white">
      <nav
        ref={ref}
        aria-label="Shop by occasion"
        className="max-w-7xl mx-auto px-3.5 min-[420px]:px-4 sm:px-6 lg:px-8 flex lg:justify-center gap-6 lg:gap-8 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {OCCASIONS.map((o) => {
          const active = o.key === current;
          const TabIcon = o.icon;
          return (
            <Link
              key={o.key}
              to={p(`/occasions/${o.slug}`)}
              aria-current={active ? 'page' : undefined}
              className={`relative inline-flex items-center gap-1.5 py-3.5 lg:py-4 text-xs lg:text-[13px] font-semibold ${
                active
                  ? 'text-[#b94609] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[3px] after:rounded-t after:bg-cgc-orange'
                  : 'text-cgc-stone hover:text-[#b94609]'
              }`}
            >
              <TabIcon className="h-[17px] w-[17px]" strokeWidth={1.7} aria-hidden />
              {o.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function TypeChip({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`min-h-[42px] rounded-3xl border px-4 lg:px-5 py-2.5 text-xs leading-none ${
        selected
          ? 'border-[#f8ab76] bg-[#fff0e2] font-bold text-[#a84106]'
          : 'border-cgc-cream-deep bg-white font-medium text-cgc-ink hover:border-[#fba15b] hover:bg-[#fff7ef]'
      }`}
    >
      {label}
    </button>
  );
}

function ActiveChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      className="flex min-h-[36px] items-center gap-1.5 rounded-md bg-cgc-cream px-2.5 py-1.5 text-[11px] text-cgc-ink"
    >
      {label} <X className="h-3 w-3" aria-hidden />
      <span className="sr-only">— remove filter</span>
    </button>
  );
}

function OccasionCard({ product, eager }: { product: CgcProduct; eager: boolean }) {
  const p = useCgcPath();
  const { has, toggle } = useCgcFavorites();
  const fav = has(product.sku);
  const out = product.available_quantity === 0;

  return (
    <article className="min-w-0">
      <div className="relative aspect-square overflow-hidden rounded-[15px] lg:rounded-[19px] bg-[#f6f3ee]">
        <Link
          to={p(`/product/${encodeURIComponent(product.sku)}`)}
          className="group flex h-full w-full items-center justify-center p-4 sm:p-5 lg:p-6"
          aria-label={product.name.trim()}
        >
          {out && (
            <span className="absolute left-2 top-2 z-10 rounded-full bg-cgc-charcoal/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
              Out of stock
            </span>
          )}
          {product.image_url ? (
            <img
              src={product.image_url}
              alt=""
              loading={eager ? 'eager' : 'lazy'}
              decoding="async"
              className={`h-full w-full object-contain mix-blend-multiply transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:scale-[1.04]${out ? ' opacity-40 grayscale' : ''}`}
            />
          ) : (
            <span className="text-xs text-cgc-stone">No image</span>
          )}
        </Link>
        <button
          type="button"
          aria-label={fav ? `Remove ${product.name.trim()} from favorites` : `Save ${product.name.trim()} to favorites`}
          aria-pressed={fav}
          onClick={() => toggle(product.sku)}
          className={`absolute right-1 top-1 sm:right-1.5 sm:top-1.5 z-10 grid h-11 w-11 place-items-center rounded-full bg-white/85 ${fav ? 'text-[#b94609]' : 'text-cgc-charcoal'}`}
        >
          <Heart className={`h-[17px] w-[17px] lg:h-[19px] lg:w-[19px] ${fav ? 'fill-[#ffdbc2]' : ''}`} aria-hidden />
        </button>
      </div>
      {product.cgc_category && (
        <p className="mt-2.5 lg:mt-3.5 text-[9px] lg:text-[10px] tracking-wide text-cgc-stone">{product.cgc_category}</p>
      )}
      <h3 className="mt-1 min-h-[35px] lg:min-h-[42px] text-xs min-[420px]:text-[13px] lg:text-sm font-semibold leading-snug text-cgc-ink line-clamp-2">
        <Link to={p(`/product/${encodeURIComponent(product.sku)}`)} className="hover:underline underline-offset-2">
          {product.name.trim()}
        </Link>
      </h3>
      <div className="mt-1.5 flex items-baseline justify-between gap-1">
        <span className="text-[13px] min-[420px]:text-sm lg:text-base font-bold tracking-tight text-cgc-ink">
          {money(product.retail_price_cents)}
        </span>
        <Link
          to={`${p(`/product/${encodeURIComponent(product.sku)}`)}?personalize=1`}
          className="flex min-h-[32px] items-center gap-1 text-[10px] min-[420px]:text-[11px] lg:text-xs font-bold text-[#b94609] hover:underline"
          aria-label={`Personalize ${product.name.trim()}`}
        >
          Personalize <ArrowRight className="h-3 w-3 lg:h-3.5 lg:w-3.5" aria-hidden />
        </Link>
      </div>
    </article>
  );
}

// ── Filter sheet (bottom sheet on phones, side panel on sm+) ─────────────

function FilterSheet({
  open, occasion, filters, onClose, onApply,
}: {
  open: boolean;
  occasion: OccasionConfig;
  filters: Filters;
  onClose: () => void;
  onApply: (f: Filters) => void;
}) {
  const [draft, setDraft] = useState<Filters>(filters);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (open) setDraft(filters); }, [open, filters]);

  useEffect(() => {
    if (!open) return undefined;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  // Live result count for the Apply button + per-type counts, each a
  // 1-row query against the products endpoint (the server owns counting).
  const draftQuery = serverParams(occasion, draft);
  const { data: draftCount } = useQuery({
    queryKey: ['cgc-occasion-count', occasion.key, draftQuery],
    queryFn: () => fetchProducts({ ...draftQuery, limit: 1 }),
    enabled: open,
  });
  const typeCounts = useQueries({
    queries: occasion.chips.map((chip) => {
      const q = serverParams(occasion, { ...draft, types: [chip.label] });
      return {
        queryKey: ['cgc-occasion-count', occasion.key, q],
        queryFn: () => fetchProducts({ ...q, limit: 1 }),
        enabled: open,
        staleTime: 60_000,
      };
    }),
  });

  if (!open) return null;

  const toggleIn = (list: string[], value: string) =>
    (list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);
  const n = draftCount?.total;

  const check = 'h-[17px] w-[17px] shrink-0 accent-[#b94609]';
  const optionLabel = 'flex min-h-[37px] cursor-pointer items-center gap-2 text-[11px] sm:text-xs text-cgc-ink';

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Filter and sort gifts">
      <button type="button" aria-label="Close filters" onClick={onClose} className="absolute inset-0 bg-[#241b13]/35 backdrop-blur-[2px]" tabIndex={-1} />
      <div
        ref={panelRef}
        className="absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col rounded-t-3xl bg-white shadow-2xl sm:inset-x-auto sm:inset-y-0 sm:right-0 sm:h-full sm:max-h-full sm:w-[460px] sm:rounded-l-[20px] sm:rounded-tr-none"
      >
        <div className="mx-auto mt-2.5 h-[5px] w-9 shrink-0 rounded-full bg-cgc-cream-deep sm:hidden" aria-hidden />
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-cgc-cream-deep px-5 py-4 sm:px-6 sm:py-6">
          <div>
            <p className="text-[9px] font-extrabold tracking-[0.12em] text-[#b94609]">A LITTLE MORE PERSONAL</p>
            <h2 className="mt-1 font-display text-2xl font-bold tracking-tight text-cgc-ink">Find your kind of gift.</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close filters" autoFocus className="grid h-11 w-11 place-items-center rounded-full text-cgc-ink hover:bg-cgc-cream">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-5 sm:px-6 pb-4">
          <fieldset className="border-b border-cgc-cream-deep py-4">
            <legend className="float-left w-full pb-3 text-[13px] font-bold text-cgc-ink">Product type</legend>
            <div className="clear-both grid grid-cols-2 gap-x-3.5 gap-y-1">
              {occasion.chips.map((chip, i) => (
                <label key={chip.label} className={optionLabel}>
                  <input
                    type="checkbox"
                    className={check}
                    checked={draft.types.includes(chip.label)}
                    onChange={() => setDraft((d) => ({ ...d, types: toggleIn(d.types, chip.label) }))}
                  />
                  <span>{chip.label}</span>
                  <span className="ml-auto text-[10px] text-cgc-stone">
                    {typeCounts[i]?.data ? typeCounts[i].data.total.toLocaleString() : ''}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="border-b border-cgc-cream-deep py-4">
            <legend className="float-left w-full pb-3 text-[13px] font-bold text-cgc-ink">
              Budget <span className="font-normal text-cgc-stone">· Base item price</span>
            </legend>
            <div className="clear-both grid grid-cols-2 gap-x-3.5 gap-y-1">
              {OCCASION_BUDGETS.map((b) => (
                <label key={b.key} className={optionLabel}>
                  <input
                    type="radio"
                    name="occasion-budget"
                    className={check}
                    checked={draft.budget === b.key}
                    onChange={() => setDraft((d) => ({ ...d, budget: b.key }))}
                  />
                  <span>{b.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="border-b border-cgc-cream-deep py-4">
            <legend className="float-left w-full pb-3 text-[13px] font-bold text-cgc-ink">Material</legend>
            <div className="clear-both grid grid-cols-2 gap-x-3.5 gap-y-1">
              {OCCASION_MATERIALS.map((m) => (
                <label key={m.label} className={optionLabel}>
                  <input
                    type="checkbox"
                    className={check}
                    checked={draft.materials.includes(m.label)}
                    onChange={() => setDraft((d) => ({ ...d, materials: toggleIn(d.materials, m.label) }))}
                  />
                  <span>{m.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="py-4">
            <legend className="float-left w-full pb-3 text-[13px] font-bold text-cgc-ink">Sort gifts</legend>
            <select
              aria-label="Sort filtered gifts"
              value={draft.sort}
              onChange={(e) => setDraft((d) => ({ ...d, sort: e.target.value }))}
              className="clear-both w-full rounded-lg border border-cgc-cream-deep bg-white p-3 text-[13px] text-cgc-ink"
            >
              {OCCASION_SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </fieldset>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-6 border-t border-cgc-cream-deep bg-white px-5 sm:px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => setDraft({ q: draft.q, types: [], materials: [], budget: 'all', sort: 'featured' })}
            className="min-h-[44px] px-2 text-xs font-semibold underline underline-offset-2 text-cgc-ink"
          >
            Clear all
          </button>
          <button
            type="button"
            onClick={() => onApply(draft)}
            className="flex flex-1 items-center justify-center gap-2 rounded-[10px] bg-cgc-orange hover:bg-[#fb8a35] px-4 py-3.5 text-[13px] font-bold text-cgc-ink"
          >
            {n === undefined ? 'Show gifts' : `Show ${n.toLocaleString()} gift${n === 1 ? '' : 's'}`}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
