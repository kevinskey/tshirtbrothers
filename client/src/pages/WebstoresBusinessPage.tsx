// Web Stores → For Businesses. Route: /webstores/business.
//
// The B2B sibling of /webstores (organizations). Speaks to business
// owners — restaurants, contractors, salons, shops, offices — and funnels
// to the TSB Pro landing page (/pro) for both entry paths. Same visual
// language as /webstores: white ground, navy headlines, orange accents.
import { Link } from 'react-router-dom';
import Layout from '@/components/layout/Layout';
import Seo from '@/components/Seo';
import {
  Store, RefreshCw, PenTool, ShieldCheck, MapPin, ArrowRight, Clock,
  Smartphone, Users, MessageCircle, Building2,
} from 'lucide-react';

const NAVY = '#1f2a44';

const AUDIENCES = [
  'Restaurants', 'Contractors', 'Salons & barbershops', 'Retail shops',
  'Landscapers', 'Cleaning companies', 'Transportation', 'Professional offices',
  'Food trucks', 'Local employers',
];

const FEATURES = [
  {
    icon: Store,
    title: 'A permanent home',
    body: 'Your own store page inside tshirtbrothers.com with your logo, name, and location — the same address every time you need it.',
  },
  {
    icon: RefreshCw,
    title: 'Only your products',
    body: 'Your approved company shirt, embroidered polo, work shirt, hats — not a giant catalog. Here are YOUR products; what do you need?',
  },
  {
    icon: Clock,
    title: 'Reorders in minutes',
    body: 'Two new hires? Open your store, pick 2 Medium and 1 Large of the approved polo, check out. Artwork and specs are already on file.',
  },
  {
    icon: Smartphone,
    title: 'Built for your phone',
    body: 'Big product cards, simple size and quantity pickers, fast checkout — made for a business owner ordering between jobs.',
  },
  {
    icon: PenTool,
    title: 'New designs on tap',
    body: 'Need an event shirt or a new crew hoodie? Jump into our Design Studio — approved products join your store for next time.',
  },
  {
    icon: Users,
    title: 'We run it for you',
    body: 'T-Shirt Brothers prints, embroiders, and fulfills every order locally. No platform to manage, no inventory to hold.',
  },
];

export default function WebstoresBusinessPage() {
  return (
    <Layout>
      <Seo
        title="Web Stores for Businesses — TSB Pro | T-Shirt Brothers"
        description="Give your business its own apparel store at T-Shirt Brothers. Your approved uniforms and branded gear live there — reorder in minutes, no minimums, printed locally in Fairburn, GA."
        path="/webstores/business"
      />

      {/* Hero */}
      <section className="bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-8 sm:pt-12 text-center">
          <p className="font-black uppercase tracking-[0.3em] text-orange-600 text-xs sm:text-sm">
            Web Stores · For Businesses
          </p>
          <h1 className="mt-2 font-black text-3xl sm:text-6xl leading-tight" style={{ color: NAVY }}>
            Your company&rsquo;s apparel,<br className="sm:hidden" /> already here.
          </h1>
          <p className="mt-3 text-gray-600 text-sm sm:text-lg max-w-2xl mx-auto">
            This isn&rsquo;t &ldquo;buy some T-shirts.&rdquo; It&rsquo;s a permanent home for your
            business inside T-Shirt Brothers — your approved uniforms and branded gear,
            ready whenever you need more.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link to="/pro"
              className="inline-flex items-center gap-2 rounded-full bg-orange-600 px-6 py-3 font-black text-white hover:bg-orange-700 transition">
              <Building2 className="h-4 w-4" /> Become a Pro customer
            </Link>
            <Link to="/pro"
              className="inline-flex items-center gap-2 rounded-full border-2 px-6 py-3 font-black transition hover:bg-gray-50"
              style={{ borderColor: NAVY, color: NAVY }}>
              Access your business store <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Who it's for */}
      <section className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 mt-10 sm:mt-14 text-center">
        <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Built for businesses like yours</p>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {AUDIENCES.map((a) => (
            <span key={a} className="rounded-full border border-gray-200 bg-gray-50 px-3.5 py-1.5 text-sm text-gray-700">
              {a}
            </span>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mt-12 sm:mt-16">
        <h2 className="font-black text-2xl sm:text-4xl text-center" style={{ color: NAVY }}>
          How a Business Web Store works for you
        </h2>
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm hover:shadow-md transition">
              <span className="inline-flex rounded-2xl p-3 text-white bg-orange-600">
                <f.icon className="h-6 w-6" />
              </span>
              <h3 className="mt-3 font-black text-lg" style={{ color: NAVY }}>{f.title}</h3>
              <p className="mt-1.5 text-sm text-gray-600">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA band */}
      <section className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 mt-12 sm:mt-20 mb-16 sm:mb-24">
        <div className="rounded-3xl px-6 sm:px-12 py-10 text-center" style={{ background: NAVY }}>
          <h2 className="font-black text-2xl sm:text-4xl text-white">
            Your business has a home at T-Shirt Brothers.
          </h2>
          <p className="mt-2 text-gray-300 text-sm sm:text-base max-w-xl mx-auto">
            Already ordered from us? Your approved products can be in your store this week.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Link to="/pro"
              className="inline-flex items-center gap-2 rounded-full bg-orange-600 px-6 py-3 font-black text-white hover:bg-orange-700 transition">
              Get started with TSB Pro <ArrowRight className="h-4 w-4" />
            </Link>
            <a href="sms:+14706221392?&body=I%27d%20like%20a%20TSB%20Pro%20web%20store%20for%20my%20business."
              className="inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/30 px-6 py-3 font-black text-white hover:bg-white/20 transition">
              <MessageCircle className="h-4 w-4" /> Text (470) 622-1392
            </a>
          </div>
          <p className="mt-4 text-gray-400 text-xs flex items-center justify-center gap-3 flex-wrap">
            <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> Printed locally in Fairburn, GA</span>
            <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" /> No setup fees · No minimums</span>
          </p>
        </div>
        <p className="mt-6 text-center text-sm text-gray-500">
          Running a school, team, church, or nonprofit?{' '}
          <Link to="/webstores" className="font-bold text-orange-700 hover:text-orange-800">
            Web Stores for Organizations →
          </Link>
        </p>
      </section>
    </Layout>
  );
}
