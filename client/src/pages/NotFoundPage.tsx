import { Link } from 'react-router-dom';
import { Home, Search, Phone } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import Seo from '@/components/Seo';

// Prerendered to dist/404.html by client/scripts/prerender.mjs, which is what
// the server sends (with a real 404 status) for an unknown path. Before that,
// nginx answered every unknown path with 200 and the homepage.
export default function NotFoundPage() {
  return (
    <Layout>
      <Seo
        title="Page not found — TShirt Brothers"
        description="That page doesn't exist. Browse our shop, start a quote, or call the Fairburn shop at (470) 622-1392."
        path="/404"
        noindex
      />
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
        <p className="text-8xl font-display font-bold text-gray-200">404</p>
        <h1 className="mt-4 text-2xl font-display font-bold text-gray-900">Page not found</h1>
        <p className="mt-2 text-gray-600 max-w-md">
          That page doesn&rsquo;t exist &mdash; but we&rsquo;re still here in Fairburn and still printing.
        </p>
        {/* A 404 that only offers "Go Home" wastes the visit. These are the
            three things someone who mistyped a URL actually wanted. */}
        <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <Link
            to="/quote"
            className="inline-flex items-center justify-center gap-2 bg-orange-600 hover:bg-orange-700 text-white px-6 py-3 rounded-lg text-sm font-semibold transition-colors"
          >
            Get a quote
          </Link>
          <Link
            to="/shop"
            className="inline-flex items-center justify-center gap-2 border border-gray-300 hover:border-gray-400 text-gray-900 px-6 py-3 rounded-lg text-sm font-semibold transition-colors"
          >
            <Search className="w-4 h-4" />
            Browse the shop
          </Link>
          <Link
            to="/"
            className="inline-flex items-center justify-center gap-2 text-gray-600 hover:text-gray-900 px-4 py-3 text-sm font-medium transition-colors"
          >
            <Home className="w-4 h-4" />
            Home
          </Link>
        </div>
        <a
          href="tel:+14706221392"
          className="mt-6 inline-flex items-center gap-2 text-sm text-gray-600 hover:text-orange-700"
        >
          <Phone className="w-4 h-4" />
          Or just call us: (470) 622-1392
        </a>
      </div>
    </Layout>
  );
}
