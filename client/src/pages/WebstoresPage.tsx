import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '@/components/layout/Layout';
import Seo from '@/components/Seo';
import {
  ChevronLeft, ChevronRight, Pause, Play, ArrowRight, Store,
  BarChart3, Truck, MapPin, Users, CreditCard, Paintbrush, HandCoins,
  ShieldCheck, Clock, PackageOpen, Sparkles, Check, MessageCircle,
} from 'lucide-react';

/**
 * /webstores — pitch page for TSB's white-label group webstores.
 * Custom-branded storefronts we build and run for schools, teams, choirs,
 * churches, and businesses. Live example: shop.tshirtbrothers.com (our own
 * house store runs on the exact same platform).
 */

const NAVY = '#1f2a44';

const USE_CASES = [
  {
    icon: Store,
    title: 'Merch Sales',
    body: 'A year-round branded shop for your members, fans, and alumni. Open 24/7 — no order forms, no collecting cash, no boxes of leftover shirts.',
    accent: '#ea580c',
  },
  {
    icon: HandCoins,
    title: 'Fundraising',
    body: 'Set your own markup on every item and watch the proceeds add up. Run season-long stores or short campaign windows with a closing date.',
    accent: '#16a34a',
  },
  {
    icon: Paintbrush,
    title: 'White-Label Opportunities',
    body: 'Your name, your logo, your colors, your subdomain. Buyers see YOUR store — we stay behind the scenes printing and shipping.',
    accent: '#7c3aed',
  },
];

const FEATURES = [
  { icon: BarChart3, title: 'Purchase analytics', body: 'Live dashboard of orders, best sellers, sizes, and proceeds — export anytime.' },
  { icon: Truck, title: 'Ship or local pickup', body: 'Buyers choose home delivery or free pickup at your location (or ours in Fairburn).' },
  { icon: Users, title: 'Unlimited admins', body: 'Add as many site administrators as you want — each signs in with a secure email link.' },
  { icon: CreditCard, title: 'Your choice of POS', body: 'Payments through Stripe out of the box, or connect the processor you already use — Square and other popular POS options supported.' },
  { icon: Sparkles, title: 'Custom management styles', body: 'Hands-on or hands-off — you curate products and pricing, or we manage everything and just send you the proceeds.' },
  { icon: ShieldCheck, title: 'Zero inventory risk', body: 'Everything is printed to order. No upfront purchase, no minimums, no leftover stock.' },
  { icon: Clock, title: 'Open year-round or by window', body: 'Keep the store always-on, or run order windows that close on a date you set.' },
  { icon: PackageOpen, title: 'Local Atlanta production', body: 'Printed in Fairburn, GA — faster turnaround than the national platforms, and you can see your product in person.' },
];

const COMPARISON: { label: string; tsb: string; others: string }[] = [
  { label: 'Setup cost', tsb: 'Free — we build it for you', others: 'Free–$$$, build it yourself' },
  { label: 'Minimums', tsb: 'None', others: 'None–12+ per item' },
  { label: 'Local pickup', tsb: 'Yes — your site or ours', others: 'Rarely offered' },
  { label: 'Who prints it', tsb: 'Us, locally in Fairburn GA', others: 'Outsourced national network' },
  { label: 'Admin seats', tsb: 'Unlimited', others: 'Often 1 account' },
  { label: 'Payment processor', tsb: 'Stripe, Square, or yours', others: 'Platform-locked' },
  { label: 'A real human to call', tsb: '(470) 622-1392', others: 'Support tickets' },
];

/* ── Pitch deck ────────────────────────────────────────────────────────── */

function useAutoAdvance(count: number, ms: number, paused: boolean) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % count), ms);
    return () => clearInterval(t);
  }, [count, ms, paused]);
  return [idx, setIdx] as const;
}

function PitchDeck() {
  const [paused, setPaused] = useState(false);
  const touchX = useRef<number | null>(null);

  const slides = useMemo(() => [
    {
      id: 'open',
      render: (active: boolean) => (
        <div className="h-full flex flex-col items-center justify-center text-center px-6" style={{ background: NAVY }}>
          <p className={`text-orange-400 font-black uppercase tracking-[0.3em] text-xs sm:text-sm transition-all duration-700 ${active ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            TSB Webstores
          </p>
          <h3 className={`mt-3 text-white font-black text-3xl sm:text-6xl leading-tight transition-all duration-700 delay-150 ${active ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            Your store.<br />Our press.
          </h3>
          <p className={`mt-4 text-gray-300 text-sm sm:text-lg max-w-md transition-all duration-700 delay-300 ${active ? 'opacity-100' : 'opacity-0'}`}>
            A branded online store for your organization — we print, pack, and ship every order. You collect the proceeds.
          </p>
        </div>
      ),
    },
    {
      id: 'problem',
      render: (active: boolean) => (
        <div className="h-full flex flex-col justify-center px-6 sm:px-14 bg-gray-100">
          <p className="text-xs sm:text-sm font-black uppercase tracking-[0.25em] text-orange-600">The old way</p>
          <h3 className="mt-2 font-black text-2xl sm:text-5xl leading-tight" style={{ color: NAVY }}>
            Paper order forms.<br />Collecting checks.<br />Boxes of leftovers.
          </h3>
          <p className={`mt-4 text-gray-600 text-sm sm:text-lg max-w-lg transition-all duration-700 delay-200 ${active ? 'opacity-100' : 'opacity-0'}`}>
            Someone volunteers, spends three weekends sorting sizes, and the group still eats the cost of unsold XXLs.
          </p>
        </div>
      ),
    },
    {
      id: 'solution',
      render: (active: boolean) => (
        <div className="h-full flex flex-col justify-center px-6 sm:px-14 bg-orange-600">
          <p className="text-xs sm:text-sm font-black uppercase tracking-[0.25em] text-orange-200">The TSB way</p>
          <h3 className="mt-2 font-black text-2xl sm:text-5xl leading-tight text-white">
            One link.<br />Everyone buys their own.<br />We handle the rest.
          </h3>
          <div className={`mt-5 flex flex-wrap gap-2 transition-all duration-700 delay-200 ${active ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}`}>
            {['Printed to order', 'No minimums', 'Ship or pickup', 'Proceeds to you'].map((c) => (
              <span key={c} className="rounded-full bg-white/20 px-3 py-1.5 text-xs sm:text-sm font-bold text-white">{c}</span>
            ))}
          </div>
        </div>
      ),
    },
    {
      id: 'money',
      render: (active: boolean) => (
        <div className="h-full flex flex-col justify-center px-6 sm:px-14" style={{ background: NAVY }}>
          <p className="text-xs sm:text-sm font-black uppercase tracking-[0.25em] text-orange-400">Fundraising math</p>
          <h3 className="mt-2 font-black text-2xl sm:text-5xl leading-tight text-white">
            200 hoodies ×<br />your $10 markup =<br /><span className="text-orange-400">$2,000 raised.</span>
          </h3>
          <p className={`mt-4 text-gray-300 text-sm sm:text-lg max-w-lg transition-all duration-700 delay-200 ${active ? 'opacity-100' : 'opacity-0'}`}>
            You set the price on every item. We take our print cost; everything above it is yours, tracked live in your dashboard.
          </p>
        </div>
      ),
    },
    {
      id: 'cta',
      render: (active: boolean) => (
        <div className="h-full flex flex-col items-center justify-center text-center px-6 bg-white">
          <h3 className={`font-black text-2xl sm:text-5xl leading-tight transition-all duration-700 ${active ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`} style={{ color: NAVY }}>
            Your store can be live<br />this week.
          </h3>
          <div className={`mt-6 flex flex-wrap justify-center gap-3 transition-all duration-700 delay-200 ${active ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            <a href="sms:+14706221392?&body=I%27d%20like%20to%20set%20up%20a%20webstore%20for%20my%20organization."
              className="inline-flex items-center gap-2 rounded-full bg-orange-600 hover:bg-orange-500 px-6 py-3 font-black text-white shadow-lg transition">
              <MessageCircle className="h-4 w-4" /> Text us to start
            </a>
            <a href="https://shop.tshirtbrothers.com" target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full border-2 border-gray-300 hover:border-orange-400 px-6 py-3 font-black text-gray-800 hover:text-orange-600 transition">
              See a live store <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      ),
    },
  ], []);

  const [idx, setIdx] = useAutoAdvance(slides.length, 6000, paused);

  return (
    <div
      className="relative rounded-3xl overflow-hidden shadow-2xl select-none"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={(e) => { touchX.current = e.touches[0]?.clientX ?? null; }}
      onTouchEnd={(e) => {
        if (touchX.current == null) return;
        const dx = (e.changedTouches[0]?.clientX ?? touchX.current) - touchX.current;
        if (dx < -40) setIdx((idx + 1) % slides.length);
        if (dx > 40) setIdx((idx - 1 + slides.length) % slides.length);
        touchX.current = null;
      }}
    >
      <div className="absolute top-3 left-4 right-4 z-20 flex gap-1.5">
        {slides.map((sl, i) => (
          <button key={sl.id} aria-label={`Slide ${i + 1}`} onClick={() => setIdx(i)} className="h-1.5 flex-1 rounded-full bg-black/15 overflow-hidden">
            <span className="block h-full bg-orange-500 rounded-full" style={{ width: i <= idx ? '100%' : '0%', transition: 'width 300ms' }} />
          </button>
        ))}
      </div>
      <div className="h-[380px] sm:h-[480px] relative">
        {slides.map((sl, i) => (
          <div key={sl.id} className={`absolute inset-0 transition-opacity duration-500 ${i === idx ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
            {sl.render(i === idx)}
          </div>
        ))}
      </div>
      <button aria-label="Previous slide" onClick={() => setIdx((idx - 1 + slides.length) % slides.length)}
        className="absolute left-2 top-1/2 -translate-y-1/2 z-20 rounded-full bg-black/30 hover:bg-black/50 text-white p-2 backdrop-blur-sm transition">
        <ChevronLeft className="h-5 w-5" />
      </button>
      <button aria-label="Next slide" onClick={() => setIdx((idx + 1) % slides.length)}
        className="absolute right-2 top-1/2 -translate-y-1/2 z-20 rounded-full bg-black/30 hover:bg-black/50 text-white p-2 backdrop-blur-sm transition">
        <ChevronRight className="h-5 w-5" />
      </button>
      <button aria-label={paused ? 'Play' : 'Pause'} onClick={() => setPaused((p) => !p)}
        className="absolute bottom-3 right-3 z-20 rounded-full bg-black/30 hover:bg-black/50 text-white p-2 backdrop-blur-sm transition">
        {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
      </button>
    </div>
  );
}

/* ── Page ──────────────────────────────────────────────────────────────── */

export default function WebstoresPage() {
  return (
    <Layout>
      <Seo
        title="Webstores for Organizations — Branded Online Merch Stores | TShirt Brothers"
        description="We build and run custom-branded webstores for schools, teams, churches, and businesses — merch sales, fundraising, and white-label stores with analytics, shipping or local pickup, unlimited admins, and your choice of payment processor."
        path="/webstores"
      />

      {/* Hero */}
      <section className="bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-8 sm:pt-12 text-center">
          <p className="font-black uppercase tracking-[0.3em] text-orange-600 text-xs sm:text-sm">For schools · teams · churches · businesses</p>
          <h1 className="mt-2 font-black text-3xl sm:text-6xl leading-tight" style={{ color: NAVY }}>
            A webstore for<br className="sm:hidden" /> your organization.
          </h1>
          <p className="mt-3 text-gray-600 text-sm sm:text-lg max-w-2xl mx-auto">
            Your members shop online, we print and deliver, you collect the proceeds.
            Management styles vary — every store is customized to suit your group's needs.
          </p>
        </div>
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 mt-6 sm:mt-10">
          <PitchDeck />
        </div>
      </section>

      {/* Use cases */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mt-12 sm:mt-20">
        <h2 className="font-black text-2xl sm:text-4xl text-center" style={{ color: NAVY }}>Three ways groups use it</h2>
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
          {USE_CASES.map((u) => (
            <div key={u.title} className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm hover:shadow-md transition">
              <span className="inline-flex rounded-2xl p-3 text-white" style={{ background: u.accent }}>
                <u.icon className="h-6 w-6" />
              </span>
              <h3 className="mt-3 font-black text-xl" style={{ color: NAVY }}>{u.title}</h3>
              <p className="mt-1.5 text-sm text-gray-600">{u.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Feature grid */}
      <section className="mt-12 sm:mt-20 py-10 sm:py-16" style={{ background: NAVY }}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="font-black text-2xl sm:text-4xl text-white text-center">Everything a modern team store should do</h2>
          <div className="mt-7 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-2xl bg-white/5 border border-white/10 p-5">
                <f.icon className="h-6 w-6 text-orange-400" />
                <h3 className="mt-2.5 font-black text-white">{f.title}</h3>
                <p className="mt-1 text-sm text-gray-300">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison */}
      <section className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 mt-12 sm:mt-20">
        <h2 className="font-black text-2xl sm:text-4xl text-center" style={{ color: NAVY }}>
          TSB vs. the big platforms
        </h2>
        <p className="mt-2 text-center text-gray-600 text-sm sm:text-base">
          How we stack up against the national team-store sites.
        </p>
        <div className="mt-6 overflow-x-auto rounded-2xl border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: NAVY }}>
                <th className="text-left text-white font-black px-4 py-3"></th>
                <th className="text-left text-orange-400 font-black px-4 py-3">TShirt Brothers</th>
                <th className="text-left text-gray-300 font-black px-4 py-3">Typical platform</th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map((row, i) => (
                <tr key={row.label} className={i % 2 ? 'bg-gray-50' : 'bg-white'}>
                  <td className="px-4 py-3 font-bold text-gray-700">{row.label}</td>
                  <td className="px-4 py-3 text-gray-900">
                    <span className="inline-flex items-start gap-1.5">
                      <Check className="h-4 w-4 mt-0.5 text-green-600 shrink-0" />{row.tsb}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{row.others}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mt-12 sm:mt-20">
        <h2 className="font-black text-2xl sm:text-4xl text-center" style={{ color: NAVY }}>Live in three steps</h2>
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
          {[
            { n: '1', t: 'Tell us about your group', b: 'Share your logo, colors, and what you want to sell. We design the products with you.' },
            { n: '2', t: 'We build your store', b: 'Your own branded storefront on your own web address, stocked and ready — usually within a week.' },
            { n: '3', t: 'Share the link', b: 'Members buy on their phones. We print and deliver every order; you watch the proceeds in your dashboard.' },
          ].map((s) => (
            <div key={s.n} className="relative rounded-3xl border border-gray-200 p-6 pt-8">
              <span className="absolute -top-4 left-6 h-9 w-9 rounded-full bg-orange-600 text-white font-black flex items-center justify-center">{s.n}</span>
              <h3 className="font-black text-lg" style={{ color: NAVY }}>{s.t}</h3>
              <p className="mt-1.5 text-sm text-gray-600">{s.b}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Demo + CTA */}
      <section className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 mt-12 sm:mt-20 mb-16 sm:mb-24">
        <div className="rounded-3xl bg-orange-600 px-6 sm:px-12 py-10 text-center">
          <h2 className="font-black text-2xl sm:text-4xl text-white">See it for yourself</h2>
          <p className="mt-2 text-orange-100 text-sm sm:text-base max-w-xl mx-auto">
            Our own shop runs on the exact platform your store would — browse it, then let's build yours.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <a href="https://shop.tshirtbrothers.com" target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 font-black text-orange-700 shadow-lg hover:scale-105 transition">
              <Store className="h-4 w-4" /> Visit the demo store
            </a>
            <Link to="/stores"
              className="inline-flex items-center gap-2 rounded-full border-2 border-white/60 px-6 py-3 font-black text-white hover:bg-white/10 transition">
              Browse group stores <ArrowRight className="h-4 w-4" />
            </Link>
            <a href="sms:+14706221392?&body=I%27d%20like%20to%20set%20up%20a%20webstore%20for%20my%20organization."
              className="inline-flex items-center gap-2 rounded-full bg-gray-900 px-6 py-3 font-black text-white hover:bg-gray-800 transition">
              <MessageCircle className="h-4 w-4" /> Text (470) 622-1392
            </a>
          </div>
          <p className="mt-4 text-orange-200 text-xs flex items-center justify-center gap-3 flex-wrap">
            <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> Printed locally in Fairburn, GA</span>
            <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" /> No setup fees · No minimums</span>
          </p>
        </div>
      </section>
    </Layout>
  );
}
