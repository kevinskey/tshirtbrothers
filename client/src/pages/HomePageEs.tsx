import { Link } from 'react-router-dom';
import Layout from '@/components/layout/Layout';
import Seo from '@/components/Seo';
import {
  Sparkles, Tag, Users, Clock, MapPin, Star, CheckCircle2,
  Shirt, Scissors, Layers, Trophy,
} from 'lucide-react';

// Spanish-language home page at /es. Mirror of HomePage's hero +
// services + CTAs but standalone — we're not introducing a full i18n
// framework yet, just capturing the Atlanta Hispanic-market search
// traffic ("playeras personalizadas atlanta", "estampados de
// camisetas atlanta") with a real Spanish landing surface.
//
// hreflang annotations are emitted via the <Seo> component's
// canonical + a small extra <link> below so Google understands the
// /es page is the Spanish counterpart of /.

export default function HomePageEs() {
  return (
    <Layout>
      <Seo
        title="Estampado de Camisetas Personalizadas en Atlanta · TShirt Brothers"
        description="Camisetas, sudaderas y ropa personalizada en Atlanta. Estampado serigráfico, DTF y bordado — sin mínimos, entrega en 2–7 días, recogida gratis en Fairburn, GA."
        path="/es"
        alternates={{ en: '/', es: '/es', 'x-default': '/' }}
      />

      {/* Hero */}
      <section className="bg-gray-50 py-12 sm:py-16">
        <div className="container mx-auto px-4 text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-orange-100 border border-orange-200 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-orange-700 mb-3">
            <MapPin className="h-3 w-3" /> Fairburn, GA · Atlanta
          </div>
          <h1
            className="text-3xl sm:text-5xl md:text-6xl text-gray-900 tracking-tight leading-[1.05]"
            style={{ fontFamily: "'Inter', system-ui, sans-serif", fontWeight: 900 }}
          >
            Apoya lo Local <span className="text-orange-500">Atlanta</span>,
            <span
              className="block my-2 sm:my-3 text-5xl sm:text-6xl md:text-7xl text-gray-900"
              style={{ fontFamily: "'Caveat', cursive", fontWeight: 700, letterSpacing: '0.01em' }}
            >
              Estampados Personalizados
            </span>
            <span className="text-orange-500">Hechos Bien.</span>
          </h1>
          <p className="mt-5 text-base sm:text-lg text-gray-600 max-w-2xl mx-auto">
            Tu tienda local de ropa personalizada · Recogida en Fairburn, GA · Envío a todo el país.
          </p>
          <div className="mt-7 flex items-center justify-center gap-3 flex-wrap">
            <Link
              to="/quote"
              className="inline-flex items-center gap-2 rounded-xl bg-orange-500 hover:bg-orange-600 px-6 py-3.5 text-base font-bold text-white shadow-lg shadow-orange-500/25 transition-colors"
            >
              <Tag className="h-4 w-4" /> Cotización Gratis
            </Link>
            <Link
              to="/design"
              className="inline-flex items-center gap-2 rounded-xl bg-gray-900 hover:bg-gray-800 px-6 py-3.5 text-base font-bold text-white transition-colors"
            >
              <Sparkles className="h-4 w-4" /> Diseña Aquí
            </Link>
          </div>
          <div className="mt-5 flex items-center justify-center gap-5 text-xs sm:text-sm text-gray-600 flex-wrap">
            <span className="flex items-center gap-1.5"><Users className="h-4 w-4 text-orange-500" /> Sin mínimos</span>
            <span className="flex items-center gap-1.5"><Clock className="h-4 w-4 text-orange-500" /> Entrega 2–7 días</span>
            <span className="flex items-center gap-1.5"><Star className="h-4 w-4 text-orange-500 fill-orange-500" /> 5.0 en Google</span>
          </div>
        </div>
      </section>

      {/* Services overview */}
      <section className="py-12 sm:py-16">
        <div className="container mx-auto px-4">
          <div className="text-center mb-8">
            <p className="text-xs font-bold uppercase tracking-wider text-orange-600 mb-2">Nuestros Servicios</p>
            <h2
              className="text-2xl sm:text-4xl text-gray-900 tracking-tight"
              style={{ fontFamily: "'Inter', system-ui, sans-serif", fontWeight: 900 }}
            >
              Lo que imprimimos para ti
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { icon: Shirt, title: 'Ropa Personalizada', body: 'Camisetas, sudaderas, polos y mangas largas con estampado de alta calidad.' },
              { icon: Scissors, title: 'Bordado', body: 'Polos, gorras, chaquetas y uniformes con bordado profesional duradero.' },
              { icon: Layers, title: 'Transferencias DTF', body: 'Películas DTF listas para prensar — sin mínimos, color completo.' },
              { icon: Trophy, title: 'Productos Promocionales', body: 'Trofeos, tazas, llaveros y regalos corporativos con grabado láser.' },
            ].map((svc) => {
              const Icon = svc.icon;
              return (
                <div key={svc.title} className="rounded-2xl border border-gray-200 p-5 hover:border-orange-300 hover:shadow-sm transition">
                  <Icon className="h-7 w-7 text-orange-500 mb-2" />
                  <h3
                    className="text-base text-gray-900"
                    style={{ fontFamily: "'Inter', system-ui, sans-serif", fontWeight: 700 }}
                  >
                    {svc.title}
                  </h3>
                  <p className="mt-1 text-sm text-gray-600 leading-relaxed">{svc.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Why us */}
      <section className="bg-gray-50 py-12 sm:py-16 border-y border-gray-200">
        <div className="container mx-auto px-4 max-w-3xl">
          <h2
            className="text-2xl sm:text-3xl text-gray-900 text-center tracking-tight"
            style={{ fontFamily: "'Inter', system-ui, sans-serif", fontWeight: 800 }}
          >
            ¿Por qué elegir TShirt Brothers?
          </h2>
          <div className="mt-6 space-y-3">
            {[
              { title: 'Una tienda real, no una página web genérica', body: 'Imprimimos aquí mismo en Fairburn, GA. Cuando llamas, contesta una persona real — yo. Cuando pasas por la tienda, ahí estoy.' },
              { title: 'Sin mínimos', body: 'Una camiseta o mil — todo pedido es un pedido real. Sin reglas de "tienes que comprar 12 para empezar."' },
              { title: 'Precio en tiempo real', body: 'Usa nuestra calculadora de cotización para ver el precio actualizarse al instante mientras eliges la prenda, el método y la cantidad.' },
              { title: 'Diseño en línea gratis', body: 'Sube tu arte, agrega texto, o genera ideas con IA. El boceto se transfiere a tu cotización con un clic.' },
              { title: 'Reseñas reales', body: '5.0 ★ en Google con más de 40 reseñas de familias, iglesias, escuelas y negocios del área metropolitana de Atlanta.' },
            ].map((row) => (
              <div key={row.title} className="flex items-start gap-3 rounded-xl bg-white border border-gray-200 p-4">
                <CheckCircle2 className="mt-0.5 h-5 w-5 text-orange-500 shrink-0" />
                <div>
                  <p className="text-sm sm:text-base font-bold text-gray-900">{row.title}</p>
                  <p className="mt-1 text-sm text-gray-600 leading-relaxed">{row.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Common use cases */}
      <section className="py-12 sm:py-16">
        <div className="container mx-auto px-4 max-w-4xl">
          <h2
            className="text-2xl sm:text-3xl text-gray-900 text-center tracking-tight"
            style={{ fontFamily: "'Inter', system-ui, sans-serif", fontWeight: 800 }}
          >
            Imprimimos para todo tipo de grupo
          </h2>
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              'Iglesias y ministerios',
              'Reuniones familiares',
              'Equipos deportivos',
              'Escuelas y graduaciones',
              'Quinceañeras',
              'Negocios y uniformes',
              'Cumpleaños y eventos',
              'Recaudaciones de fondos',
              'Conciertos y giras',
            ].map((u) => (
              <div key={u} className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2.5 text-sm font-medium text-gray-800 text-center">
                {u}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-gray-950 text-white py-12 sm:py-14 text-center">
        <div className="container mx-auto px-4">
          <h2
            className="text-2xl sm:text-3xl tracking-tight"
            style={{ fontFamily: "'Inter', system-ui, sans-serif", fontWeight: 900 }}
          >
            ¿Listo para empezar?
          </h2>
          <p className="mt-2 text-gray-300 text-sm sm:text-base max-w-lg mx-auto">
            Cotización en tiempo real, sin compromiso, sin email requerido.
          </p>
          <div className="mt-5 flex items-center justify-center gap-3 flex-wrap">
            <Link to="/quote" className="rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-bold px-6 py-3 text-sm shadow-md shadow-orange-500/25 transition-colors inline-flex items-center gap-2">
              <Tag className="h-4 w-4" /> Cotización Gratis
            </Link>
            <Link to="/design" className="rounded-lg border border-white/30 hover:bg-white/10 text-white font-bold px-6 py-3 text-sm transition-colors inline-flex items-center gap-2">
              <Sparkles className="h-4 w-4" /> Diseña Aquí
            </Link>
          </div>
          <p className="mt-6 text-xs text-gray-400">
            ¿Prefieres hablar en inglés?{' '}
            <Link to="/" className="text-orange-300 hover:text-orange-200 underline underline-offset-2">
              Switch to English →
            </Link>
          </p>
        </div>
      </section>

      {/* hreflang alternates so Google understands /es is the Spanish
          counterpart of / and vice versa. Without these, the two
          pages can compete with each other instead of serving the
          right one to the right language locale. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'WebPage',
            inLanguage: 'es',
            url: 'https://tshirtbrothers.com/es',
            name: 'Estampado de Camisetas Personalizadas en Atlanta · TShirt Brothers',
          }),
        }}
      />
    </Layout>
  );
}
