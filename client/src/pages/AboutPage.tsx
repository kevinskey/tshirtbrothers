import { Link } from 'react-router-dom';
import Layout from '@/components/layout/Layout';
import Seo from '@/components/Seo';
import {
  MapPin, Clock, Phone, Mail, Shirt, Sparkles, Star, Heart,
  CheckCircle2, Printer, Layers, Scissors,
} from 'lucide-react';

// Photo URLs live on the same DO Spaces bucket as the logo. Upload
// the matching files (or change the keys here) once you have real
// shop / equipment / Kevin photos to drop in. Until then, onError
// hides the broken <img> and the styled gradient placeholder shows.
const CDN = 'https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com';
const PHOTOS = {
  storefront: `${CDN}/about-storefront.png`,
  shopInterior: `${CDN}/about-shop-interior.jpg`,
  pressInAction: `${CDN}/about-press.png`,
  embroideryMachine: `${CDN}/about-embroidery.jpg`,
  kevin: `${CDN}/about-kevin.jpg`,
  finishedWork: `${CDN}/about-finished-work.jpg`,
};

type PhotoTileProps = {
  src: string;
  alt: string;
  fallbackIcon: typeof Shirt;
  fallbackLabel: string;
  className?: string;
};
function PhotoTile({ src, alt, fallbackIcon: Icon, fallbackLabel, className }: PhotoTileProps) {
  return (
    <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 ${className || ''}`}>
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className="absolute inset-0 w-full h-full object-cover"
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
      />
      <div className="absolute inset-0 flex flex-col items-center justify-center text-white/70 p-4">
        <Icon className="h-10 w-10 text-orange-400/70 mb-2" strokeWidth={1.5} />
        <span className="text-xs font-semibold uppercase tracking-wider text-white/60 text-center">
          {fallbackLabel}
        </span>
      </div>
    </div>
  );
}

export default function AboutPage() {
  return (
    <Layout>
      <Seo
        title="About TShirt Brothers · Local Atlanta Custom Printing Shop in Fairburn, GA"
        description="Meet the team behind TShirt Brothers — a working custom print shop in Fairburn, GA serving Atlanta with screen printing, DTF, embroidery, and promo products since day one."
        path="/about"
      />

      {/* Hero */}
      <section className="bg-gray-950 text-white py-12 sm:py-16">
        <div className="container mx-auto px-4 text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-orange-500/10 border border-orange-500/30 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-orange-300 mb-3">
            <Heart className="h-3 w-3" /> Fairburn, GA · Local Shop
          </div>
          <h1
            className="text-3xl sm:text-5xl md:text-6xl text-white tracking-tight"
            style={{ fontFamily: "'Inter', system-ui, sans-serif", fontWeight: 900 }}
          >
            A real <span className="text-orange-500">print shop</span>,<br />run by real people.
          </h1>
          <p className="mt-4 text-base sm:text-lg text-gray-300 max-w-2xl mx-auto leading-relaxed">
            TShirt Brothers is a working custom apparel shop on Renaissance Parkway in
            Fairburn, GA — not a website that ships your job to a faceless warehouse. When
            you order, your shirts get printed here, by us, and you can stop in to pick
            them up.
          </p>
        </div>
      </section>

      {/* Story + photo */}
      <section className="py-12 sm:py-16">
        <div className="container mx-auto px-4 grid md:grid-cols-2 gap-8 sm:gap-12 items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-orange-600 mb-2">Our Story</p>
            <h2
              className="text-2xl sm:text-4xl text-gray-900 tracking-tight"
              style={{ fontFamily: "'Inter', system-ui, sans-serif", fontWeight: 900 }}
            >
              Built for the south Atlanta metro.
            </h2>
            <div className="mt-4 space-y-4 text-gray-700 leading-relaxed">
              <p>
                We started TShirt Brothers because the Atlanta metro deserved a print shop
                that does it the right way — quality blanks, prints that hold up, no
                minimums for the family reunion that only needs 12 shirts, and a real
                person on the other end of the phone.
              </p>
              <p>
                Every shirt that leaves this shop was printed on equipment we maintain
                ourselves. We're not a middleman dropshipping your job — we're the press,
                the cure, and the QC. That's why we can offer same-day rush on small DTF
                runs and why we can fix things when something doesn't go right.
              </p>
              <p>
                Whether you're a Tyrone family planning a reunion, a Peachtree City church
                ordering ministry shirts, an Atlanta sorority printing line tees, or a
                business needing branded polos — we're here for you.
              </p>
            </div>
          </div>
          <PhotoTile
            src={PHOTOS.storefront}
            alt="TShirt Brothers shop in Fairburn, GA"
            fallbackIcon={MapPin}
            fallbackLabel="The Fairburn shop"
            className="aspect-[4/3]"
          />
        </div>
      </section>

      {/* Equipment grid */}
      <section className="bg-gray-50 py-12 sm:py-16 border-y border-gray-200">
        <div className="container mx-auto px-4">
          <div className="text-center mb-8">
            <p className="text-xs font-bold uppercase tracking-wider text-orange-600 mb-2">Inside the Shop</p>
            <h2
              className="text-2xl sm:text-4xl text-gray-900 tracking-tight"
              style={{ fontFamily: "'Inter', system-ui, sans-serif", fontWeight: 900 }}
            >
              Real equipment. Real production.
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <PhotoTile
                src={PHOTOS.shopInterior}
                alt="TShirt Brothers shop floor"
                fallbackIcon={Shirt}
                fallbackLabel="Shop floor"
                className="aspect-[4/3]"
              />
              <p className="mt-2 text-sm font-semibold text-gray-900">Production Floor</p>
              <p className="text-xs text-gray-600 leading-relaxed">Press stations, curing, packing, and quality control all under one roof.</p>
            </div>
            <div>
              <PhotoTile
                src={PHOTOS.pressInAction}
                alt="Press in action"
                fallbackIcon={Printer}
                fallbackLabel="Press in action"
                className="aspect-[4/3]"
              />
              <p className="mt-2 text-sm font-semibold text-gray-900">Screen Print + DTF Press</p>
              <p className="text-xs text-gray-600 leading-relaxed">Six-station press for bulk screen runs and a dedicated heat-press setup for DTF transfers.</p>
            </div>
            <div>
              <PhotoTile
                src={PHOTOS.embroideryMachine}
                alt="Embroidery machine"
                fallbackIcon={Scissors}
                fallbackLabel="Embroidery machine"
                className="aspect-[4/3]"
              />
              <p className="mt-2 text-sm font-semibold text-gray-900">Embroidery</p>
              <p className="text-xs text-gray-600 leading-relaxed">Multi-needle embroidery for polos, caps, jackets, and uniforms.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Owner intro */}
      <section className="py-12 sm:py-16">
        <div className="container mx-auto px-4 grid md:grid-cols-[2fr_3fr] gap-8 sm:gap-12 items-center">
          <PhotoTile
            src={PHOTOS.kevin}
            alt="Kevin Johnson, TShirt Brothers"
            fallbackIcon={Heart}
            fallbackLabel="Meet Kevin"
            className="aspect-square max-w-sm w-full mx-auto"
          />
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-orange-600 mb-2">Meet The Team</p>
            <h2
              className="text-2xl sm:text-4xl text-gray-900 tracking-tight"
              style={{ fontFamily: "'Inter', system-ui, sans-serif", fontWeight: 900 }}
            >
              Hi, I'm Kevin.
            </h2>
            <div className="mt-4 space-y-3 text-gray-700 leading-relaxed">
              <p>
                I run TShirt Brothers out of Fairburn. If you call us, there's a good chance
                I'm the one picking up. If you email, I'm answering. If you come pick up an
                order, I'm probably the one handing it to you.
              </p>
              <p>
                I built this shop because I've watched too many people get burned by online
                print shops that promise the world and ship a shirt two weeks late with a
                cracked transfer. Custom apparel isn't complicated — it's just craft, and
                craft only happens when someone actually cares about what they're sending out.
              </p>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <a
                href="tel:+14706221392"
                className="inline-flex items-center gap-2 rounded-lg bg-orange-500 hover:bg-orange-600 px-4 py-2.5 text-sm font-bold text-white transition-colors"
              >
                <Phone className="h-4 w-4" /> (470) 622-1392
              </a>
              <a
                href="mailto:kevin@tshirtbrothers.com"
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 hover:border-orange-500 hover:text-orange-600 px-4 py-2.5 text-sm font-bold text-gray-700 transition"
              >
                <Mail className="h-4 w-4" /> Email Kevin
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Values strip */}
      <section className="bg-gray-50 py-12 sm:py-14 border-y border-gray-200">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { icon: CheckCircle2, title: 'No Minimums', body: 'One shirt or a thousand — every order is a real order.' },
              { icon: Clock, title: '2–7 Day Turnaround', body: 'Standard turnaround beats most chains. Rush options available.' },
              { icon: Star, title: '5.0 Stars · 40+ Reviews', body: 'Every order is one we want to be proud of. Read the Google reviews.' },
              { icon: MapPin, title: 'Atlanta Local', body: 'Real shop, real people. Pickup in Fairburn or shipped nationwide.' },
            ].map((v) => {
              const Icon = v.icon;
              return (
                <div key={v.title} className="rounded-2xl bg-white border border-gray-200 p-5">
                  <Icon className="h-6 w-6 text-orange-500 mb-2" />
                  <p className="text-sm font-bold text-gray-900">{v.title}</p>
                  <p className="mt-1 text-xs text-gray-600 leading-relaxed">{v.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Visit / contact card */}
      <section className="py-12 sm:py-16">
        <div className="container mx-auto px-4">
          <div className="rounded-2xl bg-gray-950 text-white p-6 sm:p-10 grid md:grid-cols-2 gap-8 items-center">
            <div>
              <h2
                className="text-2xl sm:text-3xl tracking-tight"
                style={{ fontFamily: "'Inter', system-ui, sans-serif", fontWeight: 900 }}
              >
                Stop by the <span className="text-orange-500">shop</span>.
              </h2>
              <p className="mt-3 text-gray-300 leading-relaxed">
                Pickup is free. Drop in to talk about a design, see the press in action,
                or just say hi.
              </p>
              <ul className="mt-5 space-y-2.5 text-sm">
                <li className="flex items-start gap-2.5 text-gray-300">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
                  6010 Renaissance Parkway, Fairburn, GA 30213
                </li>
                <li className="flex items-start gap-2.5 text-gray-300">
                  <Clock className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
                  Monday – Saturday, 8&thinsp;AM – 8&thinsp;PM
                </li>
                <li className="flex items-start gap-2.5 text-gray-300">
                  <Phone className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
                  <a href="tel:+14706221392" className="hover:text-white">(470) 622-1392</a>
                </li>
              </ul>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  to="/quote"
                  className="rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-bold px-5 py-2.5 text-sm shadow-md shadow-orange-500/25 transition-colors"
                >
                  Get a Free Quote
                </Link>
                <Link
                  to="/design"
                  className="rounded-lg border border-white/30 hover:bg-white/10 text-white font-bold px-5 py-2.5 text-sm transition-colors"
                >
                  <span className="inline-flex items-center gap-1.5"><Sparkles className="h-4 w-4" /> Start Designing</span>
                </Link>
              </div>
            </div>
            <PhotoTile
              src={PHOTOS.finishedWork}
              alt="Finished printed apparel"
              fallbackIcon={Layers}
              fallbackLabel="Recent Work"
              className="aspect-[4/3]"
            />
          </div>
        </div>
      </section>
    </Layout>
  );
}
