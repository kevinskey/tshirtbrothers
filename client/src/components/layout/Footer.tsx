import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Phone, Mail, MapPin, Clock, Send, CheckCircle2 } from 'lucide-react';

function NewsletterSignup() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'ok' | 'err'>('idle');
  const [errMsg, setErrMsg] = useState('');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || status === 'submitting') return;
    setStatus('submitting');
    setErrMsg('');
    try {
      const r = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), source: 'footer' }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error || 'Subscription failed.');
      }
      setStatus('ok');
      setEmail('');
    } catch (err) {
      setStatus('err');
      setErrMsg(err instanceof Error ? err.message : 'Subscription failed.');
    }
  }

  if (status === 'ok') {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-orange-400/30 bg-orange-500/10 px-3 py-2.5 text-sm text-orange-200">
        <CheckCircle2 className="h-4 w-4 text-orange-400" />
        Thanks! We&rsquo;ll be in touch.
      </div>
    );
  }
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@email.com"
          required
          className="flex-1 min-w-0 rounded-lg bg-white/5 border border-white/10 focus:border-orange-400 focus:ring-1 focus:ring-orange-400 outline-none px-3 py-2 text-sm text-white placeholder-gray-400"
          disabled={status === 'submitting'}
        />
        <button
          type="submit"
          disabled={status === 'submitting'}
          aria-label="Subscribe to newsletter"
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-orange-600 hover:bg-orange-700 disabled:opacity-50 px-3.5 py-2 text-sm font-bold text-white transition-colors"
        >
          <Send className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">Subscribe</span>
        </button>
      </div>
      {status === 'err' && <p className="text-xs text-red-400">{errMsg}</p>}
      <p className="text-xs text-gray-400">No spam — just print tips, sales, and new product alerts.</p>
    </form>
  );
}

const services = [
  { label: 'Screen Printing', href: '/services#screen-printing' },
  { label: 'DTF Transfers', href: '/services#dtf' },
  { label: 'Embroidery', href: '/services#embroidery' },
  { label: 'Custom Vinyl', href: '/services#vinyl' },
];

const quickLinks = [
  { label: 'Design Studio', href: '/design' },
  { label: 'Get a Quote', href: '/quote' },
  { label: 'Browse Catalog', href: '/shop' },
  { label: 'My Account', href: '/account' },
];

export default function Footer() {
  return (
    <footer className="bg-gray-950 text-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
          {/* Brand column */}
          <div>
            <Link to="/" className="flex items-center gap-2">
              <img
                src="https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com/assets/v1/tsb-logo.png"
                alt="TShirt Brothers"
                className="h-10 w-10 object-contain"
              />
              <span
                className="text-lg font-bold text-white"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                TShirt Brothers
              </span>
            </Link>
            <p className="mt-4 text-sm leading-relaxed text-gray-400">
              Premium custom apparel printing serving the south Atlanta
              metro area. From screen printing to DTF transfers, we bring
              your designs to life with quality you can feel.
            </p>
            <div className="mt-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-white mb-2">
                Get sale alerts &amp; print tips
              </p>
              <NewsletterSignup />
            </div>
          </div>

          {/* Services column */}
          <div>
            <h3
              className="text-sm font-semibold uppercase tracking-wider text-white"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >
              Services
            </h3>
            <ul className="mt-4 space-y-3">
              {services.map((item) => (
                <li key={item.href}>
                  <Link
                    to={item.href}
                    className="text-sm text-gray-400 hover:text-white transition-colors"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Quick Links column */}
          <div>
            <h3
              className="text-sm font-semibold uppercase tracking-wider text-white"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >
              Quick Links
            </h3>
            <ul className="mt-4 space-y-3">
              {quickLinks.map((item) => (
                <li key={item.href}>
                  <Link
                    to={item.href}
                    className="text-sm text-gray-400 hover:text-white transition-colors"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact column */}
          <div>
            <h3
              className="text-sm font-semibold uppercase tracking-wider text-white"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >
              Contact
            </h3>
            <ul className="mt-4 space-y-3">
              <li className="flex items-start gap-2.5 text-sm text-gray-400">
                <Phone className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />
                <a href="tel:+14706221392" className="hover:text-white transition-colors">
                  (470) 622-1392
                </a>
              </li>
              <li className="flex items-start gap-2.5 text-sm text-gray-400">
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />
                <a href="mailto:kevin@tshirtbrothers.com" className="hover:text-white transition-colors">
                  kevin@tshirtbrothers.com
                </a>
              </li>
              <li className="flex items-start gap-2.5 text-sm text-gray-400">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />
                <span>6010 Renaissance Pkwy, Fairburn, GA 30213</span>
              </li>
              <li className="flex items-start gap-2.5 text-sm text-gray-400">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />
                <span>Mon&ndash;Sat 8AM&ndash;8PM</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Service-area cities + use-case verticals — internal links so
          Google understands the relationship between the landing pages
          and crawls them. */}
      <div className="border-t border-gray-800/60">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 grid gap-6 md:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2.5">
              Service Area
            </p>
            <div className="flex flex-wrap gap-2">
              {[
                { slug: 'atlanta',        name: 'Atlanta' },
                { slug: 'fairburn',       name: 'Fairburn' },
                { slug: 'tyrone',         name: 'Tyrone' },
                { slug: 'peachtree-city', name: 'Peachtree City' },
                { slug: 'fayetteville',   name: 'Fayetteville' },
                { slug: 'newnan',         name: 'Newnan' },
                { slug: 'college-park',   name: 'College Park' },
                { slug: 'union-city',     name: 'Union City' },
              ].map((c) => (
                <Link
                  key={c.slug}
                  to={`/custom-shirts/${c.slug}`}
                  className="inline-flex items-center min-h-[28px] rounded-md px-2 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                >
                  Custom Shirts {c.name}
                </Link>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2.5">
              Shirts For
            </p>
            <div className="flex flex-wrap gap-2">
              {[
                { slug: 'churches',        name: 'Church Shirts' },
                { slug: 'family-reunions', name: 'Family Reunions' },
                { slug: 'teams',           name: 'Team Jerseys' },
                { slug: 'schools',         name: 'Schools' },
                { slug: 'businesses',      name: 'Businesses' },
                { slug: 'greek-life',      name: 'Greek Life' },
                { slug: 'fundraisers',     name: 'Fundraisers' },
                { slug: 'birthdays',       name: 'Birthdays' },
              ].map((v) => (
                <Link
                  key={v.slug}
                  to={`/shirts-for/${v.slug}`}
                  className="inline-flex items-center min-h-[28px] rounded-md px-2 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                >
                  {v.name}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-gray-800">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-400">
          <p>&copy; 2026 TShirt Brothers. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <Link to="/privacy" className="hover:text-white transition-colors">
              Privacy Policy
            </Link>
            <Link to="/terms" className="hover:text-white transition-colors">
              Terms of Service
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
