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
      <div className="flex items-center gap-2 rounded-lg border border-fling-green/30 bg-fling-green/10 px-3 py-2.5 text-sm text-fling-green">
        <CheckCircle2 className="h-4 w-4 text-fling-green" />
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
          className="flex-1 min-w-0 rounded-lg bg-white/5 border border-white/10 focus:border-fling-green focus:ring-1 focus:ring-fling-green outline-none px-3 py-2 text-sm text-white placeholder-gray-400"
          disabled={status === 'submitting'}
        />
        <button
          type="submit"
          disabled={status === 'submitting'}
          aria-label="Subscribe to newsletter"
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-fling-green hover:bg-fling-teal disabled:opacity-50 px-3.5 py-2 text-sm font-bold text-white transition-colors"
        >
          <Send className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">Subscribe</span>
        </button>
      </div>
      {status === 'err' && <p className="text-xs text-red-400">{errMsg}</p>}
      <p className="text-xs text-gray-400">No spam — just event news, specials, and party ideas.</p>
    </form>
  );
}

const attractions = [
  { label: '18-Hole Mini Golf', href: '/#attractions' },
  { label: 'Axe Throwing', href: '/#attractions' },
  { label: 'Ninja Stars', href: '/#attractions' },
  { label: 'Eats & Treats', href: '/#eats' },
];

const quickLinks = [
  { label: 'Plan Your Visit', href: '/#plan-visit' },
  { label: 'Book a Party/Event', href: '/#parties' },
  { label: 'Reviews', href: '/#reviews' },
  { label: 'My Account', href: '/account' },
];

export default function Footer() {
  return (
    <footer className="bg-fling-ink text-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
          {/* Brand column */}
          <div>
            <Link to="/" className="flex items-center gap-2" aria-label="Swing & Fling home">
              <span
                className="text-2xl tracking-tight"
                style={{ fontFamily: "'Fraunces', Georgia, serif", fontWeight: 900 }}
              >
                <span className="text-fling-green">Swing</span>
                <span className="mx-1 text-gray-500">&amp;</span>
                <span className="text-fling-pink">Fling</span>
              </span>
            </Link>
            <p className="mt-4 text-sm leading-relaxed text-gray-400">
              South Atlanta&rsquo;s premier outdoor entertainment venue — mini
              golf, axe throwing, ninja stars, and food truck bites. No
              reservations needed, just swing by!
            </p>
            <div className="mt-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-white mb-2">
                Get event news &amp; specials
              </p>
              <NewsletterSignup />
            </div>
          </div>

          {/* Attractions column */}
          <div>
            <h3
              className="text-sm font-semibold uppercase tracking-wider text-white"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >
              Attractions
            </h3>
            <ul className="mt-4 space-y-3">
              {attractions.map((item) => (
                <li key={item.label}>
                  <a
                    href={item.href}
                    className="text-sm text-gray-400 hover:text-fling-green transition-colors"
                  >
                    {item.label}
                  </a>
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
                <li key={item.label}>
                  <a
                    href={item.href}
                    className="text-sm text-gray-400 hover:text-fling-pink transition-colors"
                  >
                    {item.label}
                  </a>
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
                <a href="mailto:hello@swing-fling.com" className="hover:text-white transition-colors">
                  hello@swing-fling.com
                </a>
              </li>
              <li className="flex items-start gap-2.5 text-sm text-gray-400">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />
                <span>South Atlanta, GA</span>
              </li>
              <li className="flex items-start gap-2.5 text-sm text-gray-400">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />
                <span>Open daily &middot; Afternoons &amp; evenings</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-white/10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-400">
          <p>&copy; 2026 Swing &amp; Fling. All rights reserved.</p>
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
