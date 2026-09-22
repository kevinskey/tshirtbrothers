import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, Loader2, Minus, Plus, ShoppingBag } from 'lucide-react';
import { fetchConfig, fetchHolidayProduct, money } from '../lib/api';
import type { CgcPersonalization } from '../lib/api';
import { useCgcPath } from '../lib/base';
import { useCgcCart } from '../lib/cart';

// Holiday launch PDP. Everything the buyer chooses is defined by the
// launch config (server/lib/cgcHoliday.js): color variant (a real JDS
// SKU), one of three engraving layouts, personalization fields with
// visible limits, quantity, and an optional gift message. Until the
// product is published the buy button is replaced with honest
// launching-soon copy — nothing here promises production or delivery
// times that haven't been confirmed.
export default function HolidayProductPage() {
  const { slug = '' } = useParams();
  const p = useCgcPath();
  const { add } = useCgcCart();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['cgc-holiday-product', slug],
    queryFn: () => fetchHolidayProduct(slug),
  });
  const { data: config } = useQuery({ queryKey: ['cgc-config'], queryFn: fetchConfig });

  const [variantIdx, setVariantIdx] = useState(0);
  const [designKey, setDesignKey] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [qty, setQty] = useState(1);
  const [giftMessage, setGiftMessage] = useState('');
  const [added, setAdded] = useState(false);

  const product = data?.product;
  const feeCents = config?.personalization_fee_cents ?? 1000;
  const variant = product?.variants[variantIdx] ?? product?.variants[0];
  const design = product?.designs.find((d) => d.key === designKey) ?? null;
  // Mockup-backed variants have no price until the launch selling price
  // is set — such products are always unpublished, so the PDP just
  // withholds the price line rather than inventing one.
  const priced = variant != null && variant.retail_price_cents != null;
  const unitCents = priced ? (variant!.retail_price_cents as number) + feeCents : 0;

  const personalization: CgcPersonalization | null = useMemo(() => {
    if (!product || !design) return null;
    const lines = product.fields
      .map((f) => {
        const v = (values[f.key] || '').trim().slice(0, f.max);
        return v ? `${f.label}: ${v}` : '';
      })
      .filter(Boolean);
    if (!lines.length) return null;
    return {
      lines,
      font: '',
      notes: '',
      artUrl: '',
      design: design.label,
      ...(giftMessage.trim() ? { gift_message: giftMessage.trim().slice(0, 300) } : {}),
    };
  }, [product, design, values, giftMessage]);

  const addToBag = () => {
    if (!product || !variant || !product.available || !priced) return;
    if (!design) { toast.error('Pick an engraving layout first.'); return; }
    const missing = product.fields.find((f) => f.required && !(values[f.key] || '').trim());
    if (missing || !personalization) {
      toast.error(`Add the ${(missing?.label || 'personalization').toLowerCase()} to engrave.`);
      return;
    }
    add({
      sku: variant.sku,
      name: `${product.title} — ${variant.label}`,
      image: variant.image_url,
      priceCents: unitCents,
      qty,
      personalization,
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
    toast.success('Added to your bag', { duration: 3000 });
  };

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-20 flex justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-cgc-orange" aria-label="Loading product" />
      </div>
    );
  }
  if (isError || !product) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-20 text-center">
        <p className="text-lg font-semibold text-cgc-ink">We couldn’t find that product.</p>
        <Link to={p('/holiday')} className="mt-4 inline-flex rounded-lg bg-cgc-orange text-white font-bold px-6 py-3">
          Back to Holiday Gifts
        </Link>
      </div>
    );
  }

  const inputCls =
    'w-full rounded-lg border border-cgc-cream-deep px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-cgc-orange';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <Helmet><title>{`${product.title} — Holiday Gifts — Custom Gift Club`}</title></Helmet>

      <nav className="text-sm text-cgc-stone mb-4" aria-label="Breadcrumb">
        <Link to={p('/')} className="hover:text-cgc-orange">Home</Link>
        <span aria-hidden> / </span>
        <Link to={p('/holiday')} className="hover:text-cgc-orange">Holiday Gifts</Link>
        <span aria-hidden> / </span>
        <span className="text-cgc-ink font-medium">{product.title}</span>
      </nav>

      <div className="grid lg:grid-cols-2 gap-8 lg:gap-12">
        <div className="rounded-2xl bg-cgc-cream p-8 flex items-center justify-center min-h-[320px] lg:min-h-[480px] self-start">
          {(variant?.image_url || product.image_url) ? (
            <img src={variant?.image_url || product.image_url || ''} alt={variant?.name || product.title} className="max-h-[420px] max-w-full object-contain mix-blend-multiply" />
          ) : (
            <span className="text-cgc-stone">No image available</span>
          )}
        </div>

        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-cgc-ink">{product.title}</h1>
          <p className="mt-2 text-cgc-charcoal">{product.intro}</p>
          {priced && (
            <p className="mt-4 text-2xl font-extrabold text-cgc-ink">
              {money(unitCents)}
              <span className="ml-2 text-sm font-medium text-cgc-stone">
                (includes {money(feeCents)} engraving)
              </span>
            </p>
          )}

          {/* Color / variant — each option is its own supplier SKU */}
          {product.variants.length > 1 && (
            <fieldset className="mt-6">
              <legend className="text-sm font-bold uppercase tracking-wide text-cgc-ink mb-2">Color</legend>
              <div className="flex flex-wrap gap-2">
                {product.variants.map((v, i) => (
                  <button
                    key={v.sku}
                    type="button"
                    onClick={() => setVariantIdx(i)}
                    aria-pressed={i === variantIdx}
                    className={`rounded-full border-2 px-4 py-2 text-sm font-semibold transition-colors ${i === variantIdx ? 'border-cgc-orange bg-cgc-cream text-cgc-ink' : 'border-cgc-cream-deep text-cgc-charcoal hover:border-cgc-stone'}`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          {/* Engraving layout */}
          <fieldset className="mt-6">
            <legend className="text-sm font-bold uppercase tracking-wide text-cgc-ink mb-2">Choose a design</legend>
            <div className="grid sm:grid-cols-3 gap-3">
              {product.designs.map((d) => (
                <button
                  key={d.key}
                  type="button"
                  onClick={() => setDesignKey(d.key)}
                  aria-pressed={d.key === designKey}
                  className={`rounded-xl border-2 p-3 text-left text-sm font-semibold transition-colors ${d.key === designKey ? 'border-cgc-orange bg-cgc-cream text-cgc-ink' : 'border-cgc-cream-deep text-cgc-charcoal hover:border-cgc-stone'}`}
                >
                  {d.label}
                  <span className="block font-normal text-xs mt-1 text-cgc-stone">{d.desc}</span>
                </button>
              ))}
            </div>
          </fieldset>

          {/* Personalization fields with visible limits */}
          <div className="mt-5 space-y-3 rounded-xl border border-cgc-cream-deep p-4">
            {product.fields.map((f) => (
              <div key={f.key}>
                <label htmlFor={`hp-${f.key}`} className="block text-sm font-semibold text-cgc-ink mb-1">
                  {f.label}{f.required ? ' *' : ''}
                  <span className="ml-2 font-normal text-xs text-cgc-stone">
                    {(values[f.key] || '').length}/{f.max}
                  </span>
                </label>
                <input
                  id={`hp-${f.key}`}
                  type="text"
                  maxLength={f.max}
                  required={f.required}
                  value={values[f.key] || ''}
                  onChange={(e) => setValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
                  className={inputCls}
                />
                <p className="mt-1 text-xs text-cgc-stone">{f.help}</p>
              </div>
            ))}
            <p className="text-xs text-cgc-stone border-t border-cgc-cream-deep pt-3">{product.limits}</p>
          </div>

          {/* Gift message — packed with the order, not engraved */}
          <div className="mt-4">
            <label htmlFor="hp-gift" className="block text-sm font-semibold text-cgc-ink mb-1">
              Gift message (optional)
              <span className="ml-2 font-normal text-xs text-cgc-stone">{giftMessage.length}/300</span>
            </label>
            <textarea
              id="hp-gift"
              rows={2}
              maxLength={300}
              value={giftMessage}
              onChange={(e) => setGiftMessage(e.target.value)}
              placeholder="We’ll include this note with the package — it is not engraved."
              className={inputCls}
            />
          </div>

          {/* Qty + buy (or honest launching-soon state) */}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <div className="flex items-center rounded-full border border-cgc-cream-deep">
              <button type="button" aria-label="Decrease quantity" onClick={() => setQty((q) => Math.max(1, q - 1))}
                className="p-3 text-cgc-ink disabled:opacity-40" disabled={qty <= 1}>
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-10 text-center font-bold text-cgc-ink" aria-live="polite">{qty}</span>
              <button type="button" aria-label="Increase quantity" onClick={() => setQty((q) => Math.min(100, q + 1))}
                className="p-3 text-cgc-ink">
                <Plus className="h-4 w-4" />
              </button>
            </div>
            {product.available ? (
              <button
                type="button"
                onClick={addToBag}
                className="flex-1 min-w-[200px] inline-flex items-center justify-center gap-2 rounded-lg bg-cgc-orange hover:bg-cgc-orange-dark text-white font-bold px-6 py-3.5 transition-colors"
              >
                {added ? <Check className="h-5 w-5" aria-hidden /> : <ShoppingBag className="h-5 w-5" aria-hidden />}
                {added ? 'Added!' : `Add to Bag — ${money(unitCents * qty)}`}
              </button>
            ) : (
              <div className="flex-1 min-w-[200px] rounded-lg border-2 border-cgc-cream-deep bg-cgc-cream/60 px-6 py-3.5 text-center">
                <span className="font-bold text-cgc-ink">Launching soon</span>
                <span className="block text-xs text-cgc-stone mt-0.5">
                  We’re confirming pricing and an engraved sample before this goes on sale.
                </span>
              </div>
            )}
          </div>

          {/* Production & shipping — only confirmed facts render here */}
          <div className="mt-6 rounded-xl border border-cgc-cream-deep p-4 text-sm">
            <h2 className="font-bold uppercase tracking-wide text-cgc-ink text-xs mb-2">Production &amp; shipping</h2>
            <p className="text-cgc-charcoal">
              {product.production_note
                || 'Engraved to order in Fairburn, GA. Production time for this product is being finalized — we’ll confirm it before it goes on sale.'}
            </p>
            <p className="mt-2 text-cgc-charcoal">
              Shipping is calculated at checkout, with free local pickup in Fairburn, GA.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
