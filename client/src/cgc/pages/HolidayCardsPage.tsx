import { Fragment, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Check, ChevronDown, Sparkles, SlidersHorizontal, Upload, X } from 'lucide-react';
import {
  CARD_HERO_PRICE, CARD_PRICE_TIERS, CARD_TEMPLATES, FILTER_GROUPS, FOLDED_UPCHARGE_CENTS,
  type CardTemplate, type FilterGroup,
} from '../lib/cardTemplates';
import CardTemplatePreview from '../components/CardTemplatePreview';
import { money } from '../lib/api';
import { useCgcPath } from '../lib/base';

const SWATCHES: Record<string, string> = {
  Red: '#b3202f', Green: '#2f5d3a', Blue: '#22456b', White: '#ffffff', Cream: '#efe6d4',
  Black: '#141210', Gold: '#c9a24b', Pink: '#f4b8c4', Gray: '#8b8f98',
};

type Selections = Record<FilterGroup['key'], string[]>;

// /holiday-cards — Vistaprint-style template gallery. Every filter pick
// lives in the URL (?photos=2,3&color=Red) so filtered views are
// shareable links, same pattern as ShopPage.
export default function HolidayCardsPage() {
  const p = useCgcPath();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<string[]>(['photos', 'color', 'greeting']);
  const [quickView, setQuickView] = useState<CardTemplate | null>(null);

  const selections = useMemo<Selections>(() => {
    const out = {} as Selections;
    for (const g of FILTER_GROUPS) {
      out[g.key] = (params.get(g.key) ?? '').split(',').filter(Boolean);
    }
    return out;
  }, [params]);

  const activeCount = FILTER_GROUPS.reduce((n, g) => n + selections[g.key].length, 0);

  const matchesGroup = (t: CardTemplate, g: FilterGroup) =>
    selections[g.key].length === 0 || selections[g.key].some((o) => g.matches(t, o));

  const results = useMemo(
    () => CARD_TEMPLATES.filter((t) => FILTER_GROUPS.every((g) => matchesGroup(t, g))),
    [selections], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Facet counts ignore the option's own group so unpicked options in an
  // active group still show what adding them would return.
  const facetCount = (group: FilterGroup, option: string) =>
    CARD_TEMPLATES.filter(
      (t) => group.matches(t, option) && FILTER_GROUPS.every((g) => g.key === group.key || matchesGroup(t, g)),
    ).length;

  const toggleOption = (group: FilterGroup, option: string) => {
    const current = selections[group.key];
    const next = current.includes(option)
      ? current.filter((o) => o !== option)
      : group.multi ? [...current, option] : [option];
    const nextParams = new URLSearchParams(params);
    if (next.length) nextParams.set(group.key, next.join(','));
    else nextParams.delete(group.key);
    setParams(nextParams);
  };

  const clearAll = () => setParams(new URLSearchParams());

  const startOrder = (t: CardTemplate) => {
    setQuickView(null);
    navigate(`${p('/business')}?interest=holiday-cards&design=${encodeURIComponent(t.id)}&name=${encodeURIComponent(t.name)}`);
  };

  const filterPanel = (
    <div className="space-y-1">
      {FILTER_GROUPS.map((group) => {
        const open = openGroups.includes(group.key);
        return (
          <div key={group.key} className="border-b border-cgc-cream-deep pb-1">
            <button
              type="button"
              className="w-full flex items-center justify-between py-2.5 text-sm font-bold text-cgc-ink"
              aria-expanded={open}
              onClick={() => setOpenGroups((g) => (open ? g.filter((k) => k !== group.key) : [...g, group.key]))}
            >
              <span>
                {group.label}
                {selections[group.key].length > 0 && (
                  <span className="ml-2 inline-flex items-center justify-center rounded-full bg-cgc-orange text-white text-[11px] font-bold min-w-[18px] h-[18px] px-1">
                    {selections[group.key].length}
                  </span>
                )}
              </span>
              <ChevronDown className={`h-4 w-4 text-cgc-stone transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
            </button>
            {open && group.key === 'color' && (
              <div className="flex flex-wrap gap-2 pb-3">
                {group.options.map((o) => {
                  const on = selections[group.key].includes(o);
                  return (
                    <button
                      key={o} type="button" onClick={() => toggleOption(group, o)}
                      title={`${o} (${facetCount(group, o)})`} aria-pressed={on}
                      className={`relative h-8 w-8 rounded-full border ${on ? 'ring-2 ring-cgc-orange ring-offset-1' : ''} ${o === 'White' ? 'border-cgc-cream-deep' : 'border-transparent'}`}
                      style={{ backgroundColor: SWATCHES[o] }}
                    >
                      <span className="sr-only">{o}</span>
                      {on && <Check className={`absolute inset-0 m-auto h-4 w-4 ${['White', 'Cream', 'Pink', 'Gold', 'Gray'].includes(o) ? 'text-cgc-ink' : 'text-white'}`} aria-hidden />}
                    </button>
                  );
                })}
              </div>
            )}
            {open && group.key === 'photos' && (
              <div className="flex flex-wrap gap-2 pb-3">
                {group.options.map((o) => {
                  const on = selections[group.key].includes(o);
                  return (
                    <button
                      key={o} type="button" onClick={() => toggleOption(group, o)} aria-pressed={on}
                      className={`h-9 min-w-[2.5rem] px-2 rounded-full border text-sm font-semibold ${on ? 'bg-cgc-ink text-white border-cgc-ink' : 'border-cgc-cream-deep text-cgc-ink hover:border-cgc-stone'}`}
                    >
                      {o}
                    </button>
                  );
                })}
              </div>
            )}
            {open && group.key !== 'color' && group.key !== 'photos' && (
              <div className="space-y-1 pb-3">
                {group.options.map((o) => {
                  const on = selections[group.key].includes(o);
                  const count = facetCount(group, o);
                  return (
                    <label key={o} className={`flex items-center gap-2.5 py-1 text-sm cursor-pointer ${count === 0 && !on ? 'opacity-40' : ''}`}>
                      <input
                        type="checkbox" checked={on} onChange={() => toggleOption(group, o)}
                        className="h-4 w-4 rounded border-cgc-cream-deep text-cgc-orange focus:ring-cgc-orange"
                      />
                      <span className="text-cgc-charcoal">{o}</span>
                      <span className="ml-auto text-xs text-cgc-stone">{count}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      {activeCount > 0 && (
        <button type="button" onClick={clearAll} className="mt-3 text-sm font-semibold text-cgc-orange hover:text-cgc-orange-dark">
          Clear all ({activeCount})
        </button>
      )}
    </div>
  );

  const uploadTile = (
    <Link
      to={`${p('/business')}?interest=holiday-cards&design=custom-upload`}
      className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-cgc-cream-deep bg-cgc-cream/40 aspect-[5/7] p-6 text-center hover:border-cgc-orange transition-colors"
    >
      <span className="rounded-full bg-white p-3 shadow-sm"><Upload className="h-6 w-6 text-cgc-orange" aria-hidden /></span>
      <span className="font-bold text-cgc-ink">Upload your own design</span>
      <span className="text-sm text-cgc-stone">Have finished artwork? We’ll print it exactly as-is.</span>
    </Link>
  );

  const designerTile = (
    <Link
      to={`${p('/business')}?interest=holiday-cards&design=design-service`}
      className="flex flex-col items-center justify-center gap-3 rounded-xl bg-cgc-ink aspect-[5/7] p-6 text-center hover:opacity-95 transition-opacity"
    >
      <span className="rounded-full bg-cgc-orange/20 p-3"><Sparkles className="h-6 w-6 text-cgc-orange" aria-hidden /></span>
      <span className="font-bold text-white">Work with our designers</span>
      <span className="text-sm text-cgc-cream/80">Send us your photos and greeting — get a custom card designed for you, free with your order.</span>
    </Link>
  );

  return (
    <div>
      <Helmet><title>Christmas Card Templates — Custom Gift Club</title></Helmet>

      {/* Hero */}
      <div className="bg-cgc-cream/60 border-b border-cgc-cream-deep">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
          <nav className="text-sm text-cgc-stone mb-3" aria-label="Breadcrumb">
            <Link to={p('/')} className="hover:text-cgc-orange">Home</Link>
            <span aria-hidden> / </span>
            <Link to={p('/holiday')} className="hover:text-cgc-orange">Holiday</Link>
            <span aria-hidden> / </span>
            <span className="text-cgc-ink font-medium">Christmas Cards</span>
          </nav>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-cgc-ink">Christmas Card Templates</h1>
          <p className="mt-2 max-w-2xl text-cgc-charcoal">
            The perfect holiday card at the perfect price. Pick a design, send us your photos and greeting, and we handle the rest — free design proof with every order.
          </p>
          <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-white border border-cgc-cream-deep px-4 py-2 text-sm font-semibold text-cgc-ink">
            <span className="text-cgc-orange font-extrabold">{money(CARD_HERO_PRICE.cents)} each</span>
            at {CARD_HERO_PRICE.qty}+ cards · envelopes included
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Mobile filter bar */}
        <div className="lg:hidden flex items-center justify-between mb-4">
          <button
            type="button" onClick={() => setDrawerOpen(true)}
            className="inline-flex items-center gap-2 rounded-full border border-cgc-cream-deep px-4 py-2 text-sm font-semibold text-cgc-ink"
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
            Filters{activeCount > 0 ? ` (${activeCount})` : ''}
          </button>
          <p className="text-sm text-cgc-stone">{results.length} designs</p>
        </div>

        <div className="flex gap-8">
          {/* Desktop sidebar */}
          <aside className="hidden lg:block w-64 shrink-0">
            <div className="sticky top-36">
              <h2 className="text-lg font-bold text-cgc-ink mb-2">Filters</h2>
              {filterPanel}
            </div>
          </aside>

          {/* Grid */}
          <div className="flex-1">
            <p className="hidden lg:block text-sm text-cgc-stone mb-4">{results.length} designs</p>
            {results.length === 0 ? (
              <div className="py-16 text-center">
                <p className="text-lg font-semibold text-cgc-ink">No designs match those filters.</p>
                <p className="mt-1 text-sm text-cgc-stone">Try removing a filter or two — or send us your idea and we’ll design it.</p>
                <button type="button" onClick={clearAll} className="mt-4 inline-flex rounded-lg bg-cgc-orange hover:bg-cgc-orange-dark text-white font-bold px-6 py-3">
                  Clear all filters
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 sm:gap-5">
                {uploadTile}
                {results.map((t, i) => (
                  <Fragment key={t.id}>
                    <button
                      type="button" onClick={() => setQuickView(t)}
                      className="group block w-full self-start rounded-xl border border-cgc-cream-deep bg-white p-3 shadow-sm hover:shadow-md hover:border-cgc-stone transition-all text-left"
                    >
                      <CardTemplatePreview template={t} className="w-full h-auto rounded-lg" />
                      <div className="mt-3 flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-cgc-ink text-sm group-hover:text-cgc-orange">{t.name}</p>
                          <p className="text-xs text-cgc-stone mt-0.5">{t.fold} · {t.size}{t.photos ? ` · ${t.photos} photo${t.photos > 1 ? 's' : ''}` : ''}</p>
                        </div>
                        {t.foil !== 'None' && (
                          <span className="shrink-0 rounded-full bg-cgc-cream px-2 py-0.5 text-[11px] font-semibold text-cgc-charcoal">{t.foil}</span>
                        )}
                      </div>
                    </button>
                    {i === 7 && designerTile}
                  </Fragment>
                ))}
                {results.length <= 7 && designerTile}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile filter drawer */}
      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawerOpen(false)} aria-hidden />
          <div className="absolute inset-y-0 left-0 w-[85%] max-w-sm bg-white shadow-xl flex flex-col">
            <div className="flex items-center justify-between border-b border-cgc-cream-deep px-4 py-3">
              <h2 className="text-lg font-bold text-cgc-ink">Filters</h2>
              <button type="button" onClick={() => setDrawerOpen(false)} aria-label="Close filters" className="p-2 text-cgc-ink">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3">{filterPanel}</div>
            <div className="border-t border-cgc-cream-deep p-4">
              <button
                type="button" onClick={() => setDrawerOpen(false)}
                className="w-full rounded-lg bg-cgc-orange hover:bg-cgc-orange-dark text-white font-bold py-3"
              >
                Show {results.length} designs
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick view */}
      {quickView && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={quickView.name}>
          <div className="absolute inset-0 bg-black/50" onClick={() => setQuickView(null)} aria-hidden />
          <div className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <button
              type="button" onClick={() => setQuickView(null)} aria-label="Close"
              className="absolute right-3 top-3 z-10 rounded-full bg-white/90 p-2 text-cgc-ink shadow"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="grid sm:grid-cols-2 gap-6 p-6">
              <div className="bg-cgc-cream/50 rounded-xl p-4 flex items-center justify-center">
                <CardTemplatePreview template={quickView} className="w-full h-auto max-h-[60vh] rounded-lg shadow-md" />
              </div>
              <div>
                <h2 className="text-2xl font-extrabold tracking-tight text-cgc-ink">{quickView.name}</h2>
                <p className="mt-1 text-sm text-cgc-stone">
                  {quickView.fold} · {quickView.size} · {quickView.orientation}
                  {quickView.photos ? ` · ${quickView.photos} photo${quickView.photos > 1 ? 's' : ''}` : ' · No photos'}
                  {quickView.foil !== 'None' ? ` · ${quickView.foil}` : ''}
                </p>
                <table className="mt-4 w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-cgc-stone">
                      <th className="py-1.5 font-semibold">Quantity</th>
                      <th className="py-1.5 font-semibold text-right">Price each</th>
                    </tr>
                  </thead>
                  <tbody>
                    {CARD_PRICE_TIERS.map((tier) => {
                      const cents = tier.cents + (quickView.fold === 'Folded' ? FOLDED_UPCHARGE_CENTS : 0);
                      return (
                        <tr key={tier.qty} className="border-t border-cgc-cream-deep">
                          <td className="py-1.5 text-cgc-charcoal">{tier.qty}+</td>
                          <td className="py-1.5 text-right font-semibold text-cgc-ink">{money(cents)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="mt-2 text-xs text-cgc-stone">Blank envelopes included. Personalization (your photos, names, and greeting) is free — we email a proof before anything prints.</p>
                <button
                  type="button" onClick={() => startOrder(quickView)}
                  className="mt-5 w-full rounded-lg bg-cgc-orange hover:bg-cgc-orange-dark text-white font-bold py-3"
                >
                  Start my order with this design
                </button>
                <p className="mt-2 text-center text-xs text-cgc-stone">Tell us quantity + photos on the next page — no payment yet.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
