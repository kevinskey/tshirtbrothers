import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Phone, Mail, MapPin, Clock, Send, CheckCircle2 } from 'lucide-react';

type FooterLang = 'en' | 'es';

// All user-visible footer strings, both languages. The /es pages pass
// lang="es" through Layout; everything else defaults to English.
const T = {
  en: {
    blurb: 'Premium custom apparel printing serving the south Atlanta metro area. From screen printing to DTF transfers, we bring your designs to life with quality you can feel.',
    alerts: 'Get sale alerts & print tips',
    emailPlaceholder: 'you@email.com',
    subscribe: 'Subscribe',
    thanks: "Thanks! We'll be in touch.",
    noSpam: 'No spam — just print tips, sales, and new product alerts.',
    subFailed: 'Subscription failed.',
    services: 'Services',
    quickLinks: 'Quick Links',
    contact: 'Contact',
    hours: 'Mon–Sat 8AM–8PM',
    serviceArea: 'Service Area',
    customShirts: (city: string) => `Custom Shirts ${city}`,
    shirtsFor: 'Shirts For',
    rights: '© 2026 TShirt Brothers. All rights reserved.',
    privacy: 'Privacy Policy',
    terms: 'Terms of Service',
    serviceLinks: [
      { label: 'Screen Printing', href: '/services#screen-printing' },
      { label: 'DTF Transfers', href: '/services#dtf' },
      { label: 'Embroidery', href: '/services#embroidery' },
      { label: 'Custom Vinyl', href: '/services#vinyl' },
    ],
    quick: [
      { label: 'Design Studio', href: '/design' },
      { label: 'Get a Quote', href: '/quote' },
      { label: 'Browse Catalog', href: '/shop' },
      { label: 'My Account', href: '/account' },
    ],
    verticals: [
      { slug: 'churches', name: 'Church Shirts' },
      { slug: 'family-reunions', name: 'Family Reunions' },
      { slug: 'teams', name: 'Team Jerseys' },
      { slug: 'schools', name: 'Schools' },
      { slug: 'businesses', name: 'Businesses' },
      { slug: 'greek-life', name: 'Greek Life' },
      { slug: 'fundraisers', name: 'Fundraisers' },
      { slug: 'birthdays', name: 'Birthdays' },
    ],
  },
  es: {
    blurb: 'Impresión de ropa personalizada de primera calidad para el sur del área metropolitana de Atlanta. De serigrafía a transferencias DTF, damos vida a tus diseños con calidad que se siente.',
    alerts: 'Recibe ofertas y consejos de impresión',
    emailPlaceholder: 'tu@correo.com',
    subscribe: 'Suscribirme',
    thanks: '¡Gracias! Estaremos en contacto.',
    noSpam: 'Sin spam — solo consejos de impresión, ofertas y productos nuevos.',
    subFailed: 'No se pudo suscribir.',
    services: 'Servicios',
    quickLinks: 'Enlaces Rápidos',
    contact: 'Contacto',
    hours: 'Lun–Sáb 8AM–8PM',
    serviceArea: 'Área de Servicio',
    customShirts: (city: string) => `Camisetas Personalizadas ${city}`,
    shirtsFor: 'Camisetas Para',
    rights: '© 2026 TShirt Brothers. Todos los derechos reservados.',
    privacy: 'Política de Privacidad',
    terms: 'Términos de Servicio',
    serviceLinks: [
      { label: 'Serigrafía', href: '/services#screen-printing' },
      { label: 'Transferencias DTF', href: '/services#dtf' },
      { label: 'Bordado', href: '/services#embroidery' },
      { label: 'Vinil Personalizado', href: '/services#vinyl' },
    ],
    quick: [
      { label: 'Estudio de Diseño', href: '/design' },
      { label: 'Obtener Cotización', href: '/es/cotizacion' },
      { label: 'Ver Catálogo', href: '/shop' },
      { label: 'Mi Cuenta', href: '/account' },
    ],
    verticals: [
      { slug: 'churches', name: 'Iglesias' },
      { slug: 'family-reunions', name: 'Reuniones Familiares' },
      { slug: 'teams', name: 'Equipos' },
      { slug: 'schools', name: 'Escuelas' },
      { slug: 'businesses', name: 'Negocios' },
      { slug: 'greek-life', name: 'Vida Griega' },
      { slug: 'fundraisers', name: 'Recaudación de Fondos' },
      { slug: 'birthdays', name: 'Cumpleaños' },
    ],
  },
} as const;

function NewsletterSignup({ lang }: { lang: FooterLang }) {
  const t = T[lang];
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
        throw new Error(body.error || t.subFailed);
      }
      setStatus('ok');
      setEmail('');
    } catch (err) {
      setStatus('err');
      setErrMsg(err instanceof Error ? err.message : t.subFailed);
    }
  }

  if (status === 'ok') {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-orange-400/30 bg-orange-500/10 px-3 py-2.5 text-sm text-orange-200">
        <CheckCircle2 className="h-4 w-4 text-orange-400" />
        {t.thanks}
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
          placeholder={t.emailPlaceholder}
          required
          className="flex-1 min-w-0 rounded-lg bg-white/5 border border-white/10 focus:border-orange-400 focus:ring-1 focus:ring-orange-400 outline-none px-3 py-2 text-sm text-white placeholder-gray-400"
          disabled={status === 'submitting'}
        />
        <button
          type="submit"
          disabled={status === 'submitting'}
          aria-label="Subscribe to newsletter"
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-orange-700 hover:bg-orange-800 disabled:opacity-50 px-3.5 py-2 text-sm font-bold text-white transition-colors"
        >
          <Send className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">{t.subscribe}</span>
        </button>
      </div>
      {status === 'err' && <p className="text-xs text-red-400">{errMsg}</p>}
      <p className="text-xs text-gray-400">{t.noSpam}</p>
    </form>
  );
}

export default function Footer({ lang = 'en' }: { lang?: FooterLang }) {
  const t = T[lang];
  const services = t.serviceLinks;
  const quickLinks = t.quick;
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
              {t.blurb}
            </p>
            <div className="mt-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-white mb-2">
                {t.alerts}
              </p>
              <NewsletterSignup lang={lang} />
            </div>
          </div>

          {/* Services column */}
          <div>
            <h3
              className="text-sm font-semibold uppercase tracking-wider text-white"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >
              {t.services}
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
              {t.quickLinks}
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
              {t.contact}
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
                <span>{t.hours}</span>
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
              {t.serviceArea}
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
                  {t.customShirts(c.name)}
                </Link>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2.5">
              {t.shirtsFor}
            </p>
            <div className="flex flex-wrap gap-2">
              {t.verticals.map((v) => (
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
          <p>{t.rights}</p>
          <div className="flex items-center gap-6">
            <Link to="/privacy" className="hover:text-white transition-colors">
              {t.privacy}
            </Link>
            <Link to="/terms" className="hover:text-white transition-colors">
              {t.terms}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
