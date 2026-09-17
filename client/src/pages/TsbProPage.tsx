// T-Shirt Brothers Pro — the B2B program landing page. Route: /pro.
//
// Two clear paths:
//   1. ACCESS YOUR BUSINESS STORE — existing Pro customers get their
//      store links emailed (POST /api/pro/find-store; no enumeration).
//   2. BECOME A PRO CUSTOMER — short business intake that lands on the
//      admin Sales Prospects board (POST /api/pro/leads).
//
// Same visual language as /webstores: white ground, navy headlines,
// orange accents. Not a catalog page on purpose.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '@/components/layout/Layout';
import Seo from '@/components/Seo';
import {
  Store, RefreshCw, PenTool, ShieldCheck, MapPin, ArrowRight,
  Building2, Mail, CheckCircle2, Loader2, MessageCircle,
} from 'lucide-react';

const NAVY = '#1f2a44';

const BENEFITS = [
  {
    icon: Store,
    title: 'Your own business store',
    body: 'A permanent page inside tshirtbrothers.com that holds your company’s approved apparel — logo, name, and products, always there.',
  },
  {
    icon: RefreshCw,
    title: 'Reorder in minutes',
    body: 'New hire? Open your store, pick the approved polo, choose sizes, check out. No calls, no digging up old orders, no re-approving artwork.',
  },
  {
    icon: PenTool,
    title: 'New designs when you need them',
    body: 'Create something new in our Design Studio any time — once approved, it joins your store for next time.',
  },
  {
    icon: ShieldCheck,
    title: 'A partner, not a platform',
    body: 'We keep your artwork, decoration specs, and product history on file. Printed and embroidered locally in Fairburn, GA.',
  },
];

export default function TsbProPage() {
  return (
    <Layout>
      <Seo
        title="TSB Pro — Your Business Has a Home at T-Shirt Brothers"
        description="T-Shirt Brothers Pro gives your business its own branded web store. Your approved apparel lives there — reorder in minutes, create new designs when you need them."
        path="/pro"
      />

      {/* Hero */}
      <section className="bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-10 sm:pt-16 text-center">
          <p className="font-black uppercase tracking-[0.3em] text-orange-600 text-xs sm:text-sm">
            T-Shirt Brothers Pro
          </p>
          <h1 className="mt-2 font-black text-3xl sm:text-6xl leading-tight" style={{ color: NAVY }}>
            Your business has a<br className="sm:hidden" /> home here.
          </h1>
          <p className="mt-4 text-gray-600 text-sm sm:text-lg max-w-2xl mx-auto">
            Professional branded apparel made simple. TSB Pro gives your company its own
            web store inside T-Shirt Brothers — your approved shirts, polos, and hats live
            there, ready to reorder whenever you need more.
          </p>
        </div>
      </section>

      {/* Two paths */}
      <section className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 mt-10 sm:mt-14">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
          <AccessStoreCard />
          <BecomeProCard />
        </div>
      </section>

      {/* Benefits */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mt-14 sm:mt-20">
        <h2 className="font-black text-2xl sm:text-4xl text-center" style={{ color: NAVY }}>
          What Pro customers get
        </h2>
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {BENEFITS.map((b) => (
            <div key={b.title} className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm hover:shadow-md transition">
              <span className="inline-flex rounded-2xl p-3 text-white bg-orange-600">
                <b.icon className="h-6 w-6" />
              </span>
              <h3 className="mt-3 font-black text-lg" style={{ color: NAVY }}>{b.title}</h3>
              <p className="mt-1.5 text-sm text-gray-600">{b.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="mt-14 sm:mt-20 py-10 sm:py-16" style={{ background: NAVY }}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="font-black text-2xl sm:text-4xl text-white text-center">How it works</h2>
          <div className="mt-7 grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { n: '1', t: 'Tell us about your business', b: 'Name, logo, and what your team wears. If you’ve ordered from us before, your products are already on file.' },
              { n: '2', t: 'We open your store', b: 'Your approved apparel goes into your own branded store at tshirtbrothers.com — usually within a week.' },
              { n: '3', t: 'Reorder any time', b: 'Bookmark your store. When you hire, restock, or plan an event, your gear is two taps away.' },
            ].map((s) => (
              <div key={s.n} className="rounded-2xl bg-white/5 border border-white/10 p-5">
                <span className="h-9 w-9 rounded-full bg-orange-600 text-white font-black flex items-center justify-center">{s.n}</span>
                <h3 className="mt-2.5 font-black text-white">{s.t}</h3>
                <p className="mt-1 text-sm text-gray-300">{s.b}</p>
              </div>
            ))}
          </div>
          <p className="mt-8 text-center text-orange-200 text-xs flex items-center justify-center gap-3 flex-wrap">
            <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> Printed &amp; embroidered locally in Fairburn, GA</span>
            <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" /> No setup fees</span>
          </p>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 mt-12 sm:mt-16 mb-16 sm:mb-24 text-center">
        <p className="text-gray-600 text-sm sm:text-base">
          Run a school, team, church, or club instead?{' '}
          <Link to="/webstores" className="font-bold text-orange-700 hover:text-orange-800">
            See Web Stores for Organizations <ArrowRight className="inline h-4 w-4" />
          </Link>
        </p>
        <a
          href="sms:+14706221392?&body=I%27d%20like%20to%20set%20up%20a%20TSB%20Pro%20store%20for%20my%20business."
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-gray-900 px-6 py-3 font-black text-white hover:bg-gray-800 transition"
        >
          <MessageCircle className="h-4 w-4" /> Questions? Text (470) 622-1392
        </a>
      </section>
    </Layout>
  );
}

/* ── Path 1: access your store ─────────────────────────────────────────── */

function AccessStoreCard() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/pro/find-store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-3xl border-2 p-6 sm:p-8 bg-white" style={{ borderColor: NAVY }}>
      <span className="inline-flex rounded-2xl p-3 text-white" style={{ background: NAVY }}>
        <Store className="h-6 w-6" />
      </span>
      <h2 className="mt-3 font-black text-xl sm:text-2xl" style={{ color: NAVY }}>
        Access your business store
      </h2>
      <p className="mt-1.5 text-sm text-gray-600">
        Already a Pro customer? Enter your work email and we&rsquo;ll send you a direct
        link to your store and dashboard.
      </p>
      {sent ? (
        <div className="mt-5 flex items-start gap-2 rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-800">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <span>Check your inbox — if that email is on a store, your links are on the way.</span>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-5">
          <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">
            Work email
          </label>
          <div className="flex gap-2">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@yourbusiness.com"
              className="flex-1 min-w-0 border border-gray-300 rounded-xl px-3 py-2.5 text-sm"
            />
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-black text-white disabled:opacity-50 transition hover:opacity-90"
              style={{ background: NAVY }}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              Send link
            </button>
          </div>
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        </form>
      )}
    </div>
  );
}

/* ── Path 2: become a Pro customer ─────────────────────────────────────── */

function BecomeProCard() {
  const [open, setOpen] = useState(false);
  const [businessName, setBusinessName] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [businessType, setBusinessType] = useState('');
  const [website, setWebsite] = useState('');
  const [apparelNeeds, setApparelNeeds] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/pro/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_name: businessName,
          contact_name: contactName,
          email,
          phone,
          business_type: businessType,
          website,
          apparel_needs: apparelNeeds,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-3xl border-2 border-orange-600 p-6 sm:p-8 bg-white">
      <span className="inline-flex rounded-2xl p-3 text-white bg-orange-600">
        <Building2 className="h-6 w-6" />
      </span>
      <h2 className="mt-3 font-black text-xl sm:text-2xl" style={{ color: NAVY }}>
        Become a Pro customer
      </h2>
      <p className="mt-1.5 text-sm text-gray-600">
        Tell us a little about your business and we&rsquo;ll set up your store — if
        you&rsquo;ve ordered from us before, your approved products come with it.
      </p>

      {sent ? (
        <div className="mt-5 flex items-start gap-2 rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-800">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <span>Got it — we&rsquo;ll reach out shortly to get your store set up.</span>
        </div>
      ) : !open ? (
        <button
          onClick={() => setOpen(true)}
          className="mt-5 inline-flex items-center gap-2 rounded-full bg-orange-600 px-6 py-3 text-sm font-black text-white hover:bg-orange-700 transition"
        >
          Get started <ArrowRight className="h-4 w-4" />
        </button>
      ) : (
        <form onSubmit={submit} className="mt-5 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input required value={businessName} onChange={(e) => setBusinessName(e.target.value)}
              placeholder="Business name *"
              className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm" />
            <input value={contactName} onChange={(e) => setContactName(e.target.value)}
              placeholder="Your name"
              className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm" />
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="Email *"
              className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm" />
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
              placeholder="Phone"
              className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm" />
            <input value={businessType} onChange={(e) => setBusinessType(e.target.value)}
              placeholder="Type of business (restaurant, salon, contractor…)"
              className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm sm:col-span-2" />
            <input value={website} onChange={(e) => setWebsite(e.target.value)}
              placeholder="Website (optional)"
              className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm sm:col-span-2" />
          </div>
          <textarea value={apparelNeeds} onChange={(e) => setApparelNeeds(e.target.value)}
            placeholder="What does your team wear? (shirts, polos, hats, hoodies — anything you already order or want to)"
            rows={3}
            className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm" />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-orange-600 px-6 py-3 text-sm font-black text-white hover:bg-orange-700 disabled:opacity-50 transition"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Request my Pro store
          </button>
        </form>
      )}
    </div>
  );
}
