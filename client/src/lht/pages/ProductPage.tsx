import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ShoppingBag } from 'lucide-react';
import { toast } from 'sonner';
import { fetchProduct, startCheckout } from '../lib/api';
import { colorsFor, photoFor, usd } from '../lib/catalog';
import { sizeUpchargeCents } from '@/lib/sizeUpcharges';
import { useLhtBase, useLhtPath } from '../lib/base';
import { useLhtCart } from '../lib/cart';

export default function ProductPage() {
  const { slug = '' } = useParams();
  const [params] = useSearchParams();
  const p = useLhtPath();
  const base = useLhtBase();
  const cart = useLhtCart();

  const { data: product, isLoading, isError } = useQuery({
    queryKey: ['lht-product', slug],
    queryFn: () => fetchProduct(slug),
    enabled: !!slug,
  });

  const colors = colorsFor(slug);
  const variantColors = useMemo(
    () => (product?.variants_json.colors?.length
      ? colors.filter((c) => product.variants_json.colors!.some((l) => l.toLowerCase() === c.label.toLowerCase()))
      : colors),
    [product, colors],
  );
  const sizes = product?.variants_json.sizes ?? [];

  const [color, setColor] = useState<string | null>(null);
  const [size, setSize] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    if (!product) return;
    const requested = params.get('color');
    const match = requested
      ? variantColors.find((c) => c.label.toLowerCase() === requested.toLowerCase() || c.key === requested.toLowerCase())
      : null;
    setColor(match?.label ?? variantColors[0]?.label ?? null);
    setSize(sizes.length === 1 ? sizes[0] ?? null : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.slug]);

  if (isLoading) {
    return <div className="bg-lht-ink text-lht-stone min-h-[50vh] flex items-center justify-center font-lht-sans">Loading…</div>;
  }
  if (isError || !product) {
    return (
      <div className="bg-lht-ink text-lht-cream min-h-[50vh] flex flex-col items-center justify-center font-lht-sans gap-4">
        <p>That piece isn't in the collection.</p>
        <Link to={p('/#shop')} className="text-lht-cyan underline">Back to the shop</Link>
      </div>
    );
  }

  const image = photoFor(slug, color, product.cover_image);
  const upchargeCents = size ? sizeUpchargeCents(size) : 0;
  const totalCents = (product.retail_price_cents + upchargeCents) * qty;
  const needsSize = sizes.length > 0 && !size;
  const needsColor = variantColors.length > 0 && !color;
  const ready = !needsSize && !needsColor;

  const addToBag = () => {
    if (!ready) {
      toast.error(needsSize ? 'Choose a size first.' : 'Choose a color first.');
      return;
    }
    const ok = cart.add({
      productSlug: product.slug,
      title: product.title,
      image,
      unitCents: product.retail_price_cents,
      size,
      color,
      qty,
    });
    if (ok) toast.success(`${product.title} added to your bag.`);
    else toast.error(`Your bag holds up to 10 different items — check out and come back for more.`);
  };

  const buyNow = async () => {
    if (!ready) {
      toast.error(needsSize ? 'Choose a size first.' : 'Choose a color first.');
      return;
    }
    setPaying(true);
    try {
      const origin = window.location.origin;
      const { checkoutUrl } = await startCheckout({
        product_slug: product.slug,
        qty,
        variant: {
          fulfillment: 'ship',
          ...(size ? { size } : {}),
          ...(color ? { color } : {}),
        },
        success_url: `${origin}${base}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}${base}/product/${encodeURIComponent(product.slug)}`,
      });
      window.location.href = checkoutUrl;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Checkout failed — please try again.');
      setPaying(false);
    }
  };

  return (
    <div className="bg-lht-ink text-lht-cream font-lht-sans">
      <Helmet><title>{product.title} — Live Hard Truth</title></Helmet>
      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-10 py-10">
        <Link to={p('/#shop')} className="inline-flex items-center gap-2 text-sm text-lht-stone hover:text-lht-cyan">
          <ArrowLeft className="h-4 w-4" aria-hidden /> The collection
        </Link>
        <div className="mt-6 grid gap-10 lg:grid-cols-2 items-start">
          <div className="aspect-square bg-lht-ink-soft border border-lht-cream/10 overflow-hidden">
            {image && <img src={image} alt={`${product.title}${color ? ` in ${color}` : ''}`} className="h-full w-full object-cover" />}
          </div>
          <div>
            <h1 className="font-lht-display uppercase text-2xl sm:text-3xl">{product.title}</h1>
            <p className="mt-3 text-2xl">{usd(product.retail_price_cents)}</p>
            {product.description && <p className="mt-5 text-lht-cream/80 leading-relaxed">{product.description}</p>}

            {variantColors.length > 0 && (
              <>
                <p className="mt-8 text-xs font-bold uppercase tracking-[0.2em] text-lht-cyan">Color{color ? ` — ${color}` : ''}</p>
                <div className="mt-3 flex flex-wrap gap-2.5">
                  {variantColors.map((c) => (
                    <button
                      key={c.key}
                      type="button"
                      title={c.label}
                      aria-label={c.label}
                      aria-pressed={color === c.label}
                      onClick={() => setColor(c.label)}
                      className={`h-9 w-9 rounded-full border-2 transition-all ${color === c.label ? 'border-lht-cyan scale-110' : 'border-lht-cream/25 hover:border-lht-cream/60'}`}
                      style={{ backgroundColor: c.swatch }}
                    />
                  ))}
                </div>
              </>
            )}

            {sizes.length > 0 && (
              <>
                <p className="mt-8 text-xs font-bold uppercase tracking-[0.2em] text-lht-cyan">Size</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {sizes.map((s) => {
                    const up = sizeUpchargeCents(s);
                    return (
                      <button
                        key={s}
                        type="button"
                        aria-pressed={size === s}
                        onClick={() => setSize(s)}
                        className={`min-w-[3.25rem] px-3 py-2.5 text-sm font-semibold border transition-colors ${size === s ? 'bg-lht-cream text-lht-ink border-lht-cream' : 'border-lht-cream/25 text-lht-cream/85 hover:border-lht-cream/60'}`}
                      >
                        {s}{up > 0 && <span className="block text-[10px] font-normal opacity-70">+{usd(up)}</span>}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            <p className="mt-8 text-xs font-bold uppercase tracking-[0.2em] text-lht-cyan">Quantity</p>
            <div className="mt-3 inline-flex items-center border border-lht-cream/25">
              <button type="button" aria-label="Decrease quantity" onClick={() => setQty((q) => Math.max(1, q - 1))} className="px-4 py-2.5 hover:text-lht-cyan">−</button>
              <span className="px-4 py-2.5 min-w-[3rem] text-center">{qty}</span>
              <button type="button" aria-label="Increase quantity" onClick={() => setQty((q) => Math.min(100, q + 1))} className="px-4 py-2.5 hover:text-lht-cyan">+</button>
            </div>

            <div className="mt-10 flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={buyNow}
                disabled={paying}
                className="flex-1 bg-lht-cyan text-lht-ink font-bold uppercase tracking-[0.14em] text-sm px-7 py-4 hover:bg-lht-cyan-dark transition-colors disabled:opacity-60"
              >
                {paying ? 'Opening checkout…' : `Buy now — ${usd(totalCents)}`}
              </button>
              <button
                type="button"
                onClick={addToBag}
                className="flex-1 inline-flex items-center justify-center gap-2 border border-lht-cream/40 font-bold uppercase tracking-[0.14em] text-sm px-7 py-4 hover:border-lht-cyan hover:text-lht-cyan transition-colors"
              >
                <ShoppingBag className="h-4 w-4" aria-hidden /> Add to bag
              </button>
            </div>
            <p className="mt-4 text-xs text-lht-stone">
              Secure checkout by Stripe. Ships nationwide from Fairburn, GA —
              free local pickup available at checkout.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
