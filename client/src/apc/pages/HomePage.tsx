import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, BadgeDollarSign, Clock, Truck } from 'lucide-react';
import { fetchConfig, fetchProducts } from '../lib/api';
import { useApcPath } from '../lib/base';
import ProductCard from '../components/ProductCard';

export default function HomePage() {
  const p = useApcPath();
  const { data: config } = useQuery({ queryKey: ['apc-config'], queryFn: fetchConfig });
  const { data } = useQuery({
    queryKey: ['apc-products', 'featured'],
    queryFn: () => fetchProducts({}),
  });
  const products = data?.products?.slice(0, 8) ?? [];

  return (
    <div>
      <Helmet>
        <title>All Print Club | Business Cards, Flyers, Signs & More</title>
        <meta
          name="description"
          content="Trade-quality commercial printing at club prices. Business cards, flyers, postcards, banners, stickers and more — printed fast, shipped nationwide."
        />
      </Helmet>

      {/* Hero */}
      <section className="bg-apc-ink text-white">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-10 py-16 lg:py-24 grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <p className="text-apc-accent font-bold uppercase tracking-[0.2em] text-xs">Welcome to the club</p>
            <h1 className="mt-3 font-display text-4xl lg:text-5xl font-bold tracking-tight">
              Print more.<br />Pay less.
            </h1>
            <p className="mt-4 text-lg text-white/75 max-w-lg">
              Trade-quality business cards, flyers, signs, stickers and banners
              at prices that make agencies jealous. Upload your art, pick your
              options, and we handle the rest.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to={p('/shop')}
                className="inline-flex items-center gap-2 rounded-lg bg-apc-blue hover:bg-apc-blue-dark text-white font-bold px-7 py-3.5 transition-colors"
              >
                Shop All Products <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <a
                href="https://tshirtbrothers.com/quote"
                className="inline-flex items-center rounded-lg border-2 border-white/30 hover:border-white text-white font-bold px-7 py-3.5 transition-colors"
              >
                Need something custom?
              </a>
            </div>
          </div>
          <div className="hidden lg:grid grid-cols-3 gap-3 text-sm">
            {[
              { icon: BadgeDollarSign, title: 'Club pricing', body: 'Wholesale-backed prices on every run.' },
              { icon: Clock, title: 'Fast turnaround', body: 'Most jobs print in 2–4 business days.' },
              { icon: Truck, title: 'Ships anywhere', body: 'Nationwide shipping or free Fairburn pickup.' },
            ].map((f) => (
              <div key={f.title} className="rounded-xl bg-white/5 border border-white/10 p-5">
                <f.icon className="h-6 w-6 text-apc-accent" aria-hidden />
                <div className="mt-3 font-bold">{f.title}</div>
                <p className="mt-1 text-white/60">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Categories */}
      {config?.categories?.length ? (
        <section className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-10 py-12">
          <h2 className="font-display text-2xl font-bold text-apc-ink">Shop by category</h2>
          <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {config.categories.map((c) => (
              <Link
                key={c.name}
                to={`${p('/shop')}?category=${encodeURIComponent(c.name)}`}
                className="rounded-xl border border-apc-paper-deep bg-apc-paper/50 hover:bg-white hover:border-apc-blue/40 hover:shadow-sm transition-all px-4 py-5 text-center"
              >
                <div className="font-semibold text-apc-ink text-sm">{c.name}</div>
                <div className="mt-1 text-xs text-apc-slate">{c.count} product{c.count === 1 ? '' : 's'}</div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {/* Featured products */}
      <section className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-10 pb-16">
        <div className="flex items-end justify-between">
          <h2 className="font-display text-2xl font-bold text-apc-ink">Popular products</h2>
          <Link to={p('/shop')} className="text-sm font-bold text-apc-blue hover:underline">View all →</Link>
        </div>
        <div className="mt-5 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {products.map((product) => <ProductCard key={product.code} product={product} />)}
        </div>
      </section>
    </div>
  );
}
