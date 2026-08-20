import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Tag } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import Seo from '@/components/Seo';

const SALE_PCT = 0.15;

type SaleProduct = {
  id: number | string;
  ss_id?: string;
  name: string;
  brand?: string;
  category?: string;
  image_url?: string;
  imageUrl?: string;
  style_number?: string;
  base_price?: number | string;
  colors?: Array<{ name?: string; hex?: string } | string>;
};

// Retail mirrors the shop's convention: wholesale piece price doubled.
// products.base_price is 0 for most rows, so each card pulls live S&S
// pricing from /api/products/pricing/:ssId (server caches it for 6h).
function useRetailPrice(p: SaleProduct): number {
  const { data } = useQuery<number>({
    queryKey: ['sale-pricing', p.ss_id],
    queryFn: async () => {
      const r = await fetch(`/api/products/pricing/${encodeURIComponent(p.ss_id || '')}`);
      if (!r.ok) return 0;
      const body = await r.json();
      const wholesale = Number(body?.pricing?.customerPrice || body?.pricing?.piecePrice || 0);
      return wholesale * 2;
    },
    enabled: !!p.ss_id,
    staleTime: 60 * 60 * 1000,
  });
  const fallback = Number(p.base_price || 0) * 2;
  return data && data > 0 ? data : fallback;
}

function useSaleProducts(categoryLike: string) {
  return useQuery<SaleProduct[]>({
    queryKey: ['sale-products', categoryLike],
    queryFn: async () => {
      const r = await fetch(
        `/api/products?brand=Gildan&category=${encodeURIComponent(categoryLike)}&limit=60`,
      );
      if (!r.ok) throw new Error('Failed to load sale products');
      const body = await r.json();
      return Array.isArray(body.products) ? body.products : [];
    },
    staleTime: 5 * 60 * 1000,
  });
}

function SaleCard({ product }: { product: SaleProduct }) {
  const img = product.image_url || product.imageUrl;
  const retail = useRetailPrice(product);
  const sale = retail * (1 - SALE_PCT);
  // Quote builder is the purchase path — the card drops the customer into
  // /quote with this product attached.
  const quoteHref = product.ss_id
    ? `/quote?product=${encodeURIComponent(product.ss_id)}`
    : '/quote';
  return (
    <Link
      to={quoteHref}
      className="group relative block overflow-hidden rounded-2xl border border-gray-200 bg-white transition hover:border-orange-400 hover:shadow-md"
    >
      <span className="absolute left-3 top-3 z-10 inline-flex items-center gap-1 rounded-full bg-orange-600 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white shadow">
        <Tag className="h-3 w-3" /> 15% off
      </span>
      <div className="flex aspect-square items-center justify-center overflow-hidden bg-gray-100">
        {img ? (
          <img
            src={img}
            alt={product.name}
            className="h-full w-full object-contain p-4 transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <span className="text-sm font-medium text-gray-400">{product.category}</span>
        )}
      </div>
      <div className="p-4">
        <span className="text-[10px] font-medium uppercase tracking-wider text-gray-400">
          {product.brand}{product.style_number ? ` · ${product.style_number}` : ''}
        </span>
        <h3 className="mt-0.5 font-display text-sm font-semibold leading-tight text-gray-900">
          {product.name}
        </h3>
        {retail > 0 && (
          <p className="mt-2 text-sm">
            <span className="text-gray-400 line-through">${retail.toFixed(2)}</span>{' '}
            <span className="font-bold text-orange-700">${sale.toFixed(2)}</span>
          </p>
        )}
        <p className="mt-1 text-[11px] text-gray-500">Tap to quote at the sale price</p>
      </div>
    </Link>
  );
}

function SaleSection({ title, categoryLike }: { title: string; categoryLike: string }) {
  const { data, isLoading, isError } = useSaleProducts(categoryLike);
  return (
    <section className="mt-8 sm:mt-10">
      <h2 className="font-display text-xl sm:text-2xl font-bold text-gray-900">{title}</h2>
      {isLoading && (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      )}
      {isError && (
        <p className="py-10 text-sm text-gray-500">
          Couldn't load these products — refresh, or{' '}
          <Link to="/shop?brand=Gildan" className="text-orange-700 underline">browse the catalog</Link>.
        </p>
      )}
      {data && data.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
          {data.map((p) => <SaleCard key={p.id} product={p} />)}
        </div>
      )}
      {data && data.length === 0 && (
        <p className="py-10 text-sm text-gray-500">Nothing in this rack right now — check back soon.</p>
      )}
    </section>
  );
}

export default function SalePage() {
  return (
    <Layout>
      <Seo
        title="Sale · 15% Off All Gildan Tees & Hoodies · TShirt Brothers"
        description="Limited-time sale: 15% off every Gildan t-shirt and hoodie. Prices as marked — get a free custom printing quote at the sale price."
        path="/sale"
      />
      {/* Sale hero — compact, cards above the fold like the rest of the site */}
      <section className="bg-gray-900 text-white">
        <div className="container mx-auto max-w-6xl px-4 py-6 sm:py-8 text-center">
          <p className="text-[11px] sm:text-xs font-bold uppercase tracking-[0.2em] text-orange-400">Limited-time sale</p>
          <h1 className="mt-1 font-display text-2xl sm:text-4xl font-bold">
            15% Off All Gildan <span className="text-orange-500">Tees &amp; Hoodies</span>
          </h1>
          <p className="mt-2 text-xs sm:text-sm text-gray-300">
            Prices as marked · applied to your quote automatically · while the sale lasts
          </p>
        </div>
      </section>

      <main className="container mx-auto max-w-6xl px-4 pb-12">
        <SaleSection title="Gildan T-Shirts" categoryLike="T-Shirts" />
        <SaleSection title="Gildan Hoodies" categoryLike="Hood" />

        <p className="mt-10 text-center text-xs text-gray-500">
          <sup>*</sup>Sale prices shown per blank garment before printing. Your final quote reflects
          quantity, print locations, and artwork — the 15% garment discount is honored on every
          Gildan tee and hoodie quote while the sale runs.
        </p>
      </main>
    </Layout>
  );
}
