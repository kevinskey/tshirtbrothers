/**
 * Guided product picker for the Catalogue — "answer two questions, get a
 * recommendation." Built on the Instant Quote 3-tier method: every garment
 * type is priced/classified as Standard / Premium / Ultra in
 * instant_quote_garments, and each garment × tier row carries a
 * default_ss_id pointing at its recommended blank.
 *
 * Flow: pick a garment type → pick what matters (maps to a tier) → we show
 * that tier's recommended blank with design/quote CTAs, plus a one-click
 * filter to browse everything similar in the catalogue below.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Sparkles, X, ArrowLeft, Palette, Tag, LayoutGrid, Loader2 } from 'lucide-react';

interface GarmentTier {
  id: number;
  name: string;
  quality_tier: 'Standard' | 'Premium' | 'Ultra';
  base_cost: number;
  image_url: string | null;
  default_ss_id: string | null;
}

interface RecommendedProduct {
  id: number | string;
  ss_id?: string;
  name: string;
  brand: string;
  category?: string;
  image_url?: string;
  imageUrl?: string;
  base_price?: number | string;
}

const TIER_COPY: Record<GarmentTier['quality_tier'], { tagline: string; blurb: string; price: string }> = {
  Standard: {
    tagline: 'Keep it affordable',
    blurb: 'Reliable workhorse blanks — perfect for events, giveaways, and big team orders.',
    price: '$',
  },
  Premium: {
    tagline: 'Soft, retail feel',
    blurb: 'Noticeably softer fabric and a better fit — the sweet spot for everyday merch.',
    price: '$$',
  },
  Ultra: {
    tagline: 'Top of the line',
    blurb: 'The best blanks we print on — heavyweight, garment-dyed, built to be kept.',
    price: '$$$',
  },
};

const GARMENT_EMOJI: Record<string, string> = {
  'T-shirt': '👕', Hoodie: '🧥', Sweatshirt: '🧶', 'Long-sleeve': '👔',
  Polo: '🎽', Tank: '🎽', Hat: '🧢',
};

// Garment name → catalogue filter to apply for "see everything similar".
// Category values are the retail labels /api/products understands.
const SIMILAR_FILTER: Record<string, { category?: string; search?: string }> = {
  'T-shirt':     { category: 'T-Shirts' },
  'Long-sleeve': { category: 'Long Sleeve Tees' },
  Hoodie:        { category: 'Hoodies' },
  Sweatshirt:    { category: 'Crewneck Sweatshirts' },
  Polo:          { category: 'Polos' },
  Hat:           { category: 'Headwear' },
  Tank:          { search: 'tank' },
};

export default function ProductFinder({ onBrowseSimilar }: {
  /** Apply catalogue filters (category and/or search) for the picked garment. */
  onBrowseSimilar: (filter: { category?: string; search?: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [garment, setGarment] = useState<string | null>(null);
  const [tier, setTier] = useState<GarmentTier['quality_tier'] | null>(null);

  const { data: options } = useQuery({
    queryKey: ['instant-quote-options'],
    queryFn: async () => {
      const r = await fetch('/api/quote/options');
      if (!r.ok) throw new Error('options failed');
      return r.json() as Promise<{ garments: GarmentTier[] }>;
    },
    staleTime: 1000 * 60 * 30,
    enabled: open,
  });

  const garments = options?.garments ?? [];
  const garmentNames = [...new Set(garments.map((g) => g.name))];
  const picked = garment && tier
    ? garments.find((g) => g.name === garment && g.quality_tier === tier) ?? null
    : null;

  const { data: product, isLoading: productLoading } = useQuery({
    queryKey: ['finder-product', picked?.default_ss_id],
    queryFn: async () => {
      const r = await fetch(`/api/products/by-ssid/${encodeURIComponent(picked!.default_ss_id!)}`);
      if (!r.ok) throw new Error('product failed');
      return r.json() as Promise<RecommendedProduct>;
    },
    enabled: !!picked?.default_ss_id,
    staleTime: 1000 * 60 * 30,
  });

  const reset = () => { setGarment(null); setTier(null); };
  const similar = garment ? SIMILAR_FILTER[garment] ?? { search: garment } : {};

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mb-4 sm:mb-6 inline-flex items-center gap-2 rounded-full border border-red-600/30 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 transition-colors"
      >
        <Sparkles className="h-4 w-4" />
        Not sure what to pick? Answer 2 quick questions
      </button>
    );
  }

  return (
    <div className="mb-4 sm:mb-6 rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          {(garment || tier) && (
            <button
              type="button"
              onClick={() => (tier ? setTier(null) : setGarment(null))}
              aria-label="Back"
              className="p-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <h2 className="text-sm font-bold text-gray-900 truncate">
            {!garment
              ? 'What are you making?'
              : !tier
                ? `What matters most for your ${garment.toLowerCase()}?`
                : 'Our pick for you'}
          </h2>
        </div>
        <button
          type="button"
          onClick={() => { reset(); setOpen(false); }}
          aria-label="Close finder"
          className="p-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Step 1 — garment type */}
      {!garment && (
        <div className="flex flex-wrap gap-2">
          {(garmentNames.length ? garmentNames : ['T-shirt']).map((name) => {
            const img = garments.find((g) => g.name === name && g.image_url)?.image_url;
            return (
              <button
                key={name}
                type="button"
                onClick={() => setGarment(name)}
                className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:border-red-500 hover:bg-red-50 transition-colors"
              >
                {img
                  ? <img src={img} alt="" className="h-7 w-7 rounded object-contain bg-gray-50" />
                  : <span className="text-lg">{GARMENT_EMOJI[name] ?? '👕'}</span>}
                {name}
              </button>
            );
          })}
        </div>
      )}

      {/* Step 2 — tier (the 3-tier method) */}
      {garment && !tier && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
          {(['Standard', 'Premium', 'Ultra'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTier(t)}
              className="rounded-xl border border-gray-200 p-3 text-left hover:border-red-500 hover:bg-red-50 transition-colors"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-bold text-gray-900">{TIER_COPY[t].tagline}</span>
                <span className="text-xs font-semibold text-gray-400">{TIER_COPY[t].price}</span>
              </div>
              <p className="text-xs text-gray-500">{TIER_COPY[t].blurb}</p>
            </button>
          ))}
        </div>
      )}

      {/* Step 3 — recommendation */}
      {picked && (
        <div>
          {productLoading && (
            <div className="flex items-center gap-2 text-sm text-gray-500 py-4">
              <Loader2 className="h-4 w-4 animate-spin" /> Finding your match…
            </div>
          )}
          {product && (
            <div className="flex flex-col sm:flex-row items-stretch gap-4">
              <img
                src={product.image_url || product.imageUrl}
                alt={product.name}
                className="h-36 w-36 rounded-xl border border-gray-200 bg-gray-50 object-contain self-center sm:self-auto"
              />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-red-600">
                  {picked.quality_tier} pick · {TIER_COPY[picked.quality_tier].tagline}
                </p>
                <p className="text-xs text-gray-400">{product.brand}</p>
                <h3 className="text-base font-bold text-gray-900">{product.name}</h3>
                <p className="mt-1 text-xs text-gray-500">{TIER_COPY[picked.quality_tier].blurb}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    to={`/design?product=${encodeURIComponent(product.ss_id ?? picked.default_ss_id ?? '')}`}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white hover:bg-red-700 transition-colors"
                  >
                    <Palette className="h-3.5 w-3.5" /> Start designing
                  </Link>
                  <Link
                    to="/quote"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <Tag className="h-3.5 w-3.5" /> Get a price
                  </Link>
                  <button
                    type="button"
                    onClick={() => { onBrowseSimilar(similar); reset(); setOpen(false); }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <LayoutGrid className="h-3.5 w-3.5" /> Browse all similar
                  </button>
                </div>
              </div>
            </div>
          )}
          {/* Tier row has no linked blank (hats, polos) — jump straight to
              the filtered catalogue instead of dead-ending. */}
          {!picked.default_ss_id && (
            <div className="py-2">
              <p className="text-sm text-gray-600 mb-3">
                Great choice — here&apos;s everything we print in that range.
              </p>
              <button
                type="button"
                onClick={() => { onBrowseSimilar(similar); reset(); setOpen(false); }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white hover:bg-red-700 transition-colors"
              >
                <LayoutGrid className="h-3.5 w-3.5" /> Show {garment?.toLowerCase()}s
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
