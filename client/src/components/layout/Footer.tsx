import { Link } from 'react-router-dom';
import { Phone, Mail, MapPin, Clock } from 'lucide-react';

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
  { label: 'My Account', href: '/auth' },
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
                src="https://tshirtbrothers.atl1.digitaloceanspaces.com/tsb-logo.png"
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
                <a href="tel:+14706224845" className="hover:text-white transition-colors">
                  (470) 622-4845
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

      {/* Bottom bar */}
      <div className="border-t border-gray-800">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-500">
          <p>&copy; 2026 TShirt Brothers. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <Link to="/services" className="hover:text-white transition-colors">
              Our Services
            </Link>
            <Link to="/quote" className="hover:text-white transition-colors">
              Get a Quote
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
