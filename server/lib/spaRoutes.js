// Which paths are real pages in the SPA.
//
// nginx served the client with `try_files $uri $uri/index.html /index.html`,
// so ANY unmatched path returned **HTTP 200** and the byte-identical
// prerendered homepage -- including its `<link rel="canonical" href="/">`.
// Verified live on /this-page-does-not-exist-xyz, /occasions/graduation and
// /shop/product/1002523: all 200, all 268,118 bytes. An infinite
// soft-duplicate surface that burns crawl budget and makes the real pages
// compete with copies of the homepage.
//
// A blanket 404 is not an option: most routes here are dynamic
// (/invoice/view/:id, /mockup/:token, /stores/:slug/product/:productSlug)
// and cannot be prerendered, so nginx has no file to find for them. Hence
// this list -- nginx now hands anything it can't serve from disk to Express,
// and Express answers 200 + the SPA shell for a real route and 404 for
// everything else.
//
// Kept in sync by lib/spaRoutes.test.js, which parses every path="..." out of
// client/src/App.tsx and fails if one isn't matched here. Add a route to the
// router and the test tells you to add it here too.

// React Router patterns, verbatim from client/src/App.tsx.
export const SPA_ROUTE_PATTERNS = [
  '/',
  '/about',
  '/account',
  '/admin',
  '/admin/customers/:id',
  '/admin/dtf-orders',
  '/admin/gangsheet',
  '/admin/gangsheet/:id',
  '/admin/group-stores',
  '/admin/group-stores/:id',
  '/admin/order/:quoteId',
  '/admin/post-office',
  '/admin/store-order/:id',
  '/admin/store-orders',
  '/admin/vendor-send',
  '/auth',
  '/awards',
  '/bling',
  '/blog',
  '/blog/:slug',
  '/brands',
  '/cart',
  '/compare',
  '/custom-shirts/:citySlug',
  '/design',
  '/drinkware',
  '/dtf',
  '/dtf/builder',
  '/dtf/builder/:id',
  '/dtf/success',
  '/embroidery',
  '/embroidery/thanks/:id',
  '/es',
  '/es/cotizacion',
  '/faq',
  '/favorites',
  '/gangsheet',
  '/gangsheet/:id',
  '/gangsheets',
  '/gangsheets/:id',
  '/gifts',
  '/holiday-cards',
  '/instant-quote',
  '/invoice/view/:id',
  '/local-businesses',
  '/mockup/:token',
  '/payment/cancel',
  '/payment/checkout',
  '/payment/success',
  '/privacy',
  '/pro',
  '/pro/login',
  '/product/:productSlug',
  '/quote',
  '/quote/accepted/:id',
  '/quote/artwork/:id',
  '/quote/classic',
  '/quote/decline/:id',
  '/quote/rhinestone',
  '/sale',
  '/services',
  '/shirts-for/:verticalSlug',
  '/shop',
  '/spiritwear',
  '/stitch-estimator',
  '/store/:slug',
  '/store/:slug/product/:productSlug',
  '/store/:slug/success',
  '/stores',
  '/stores/:slug',
  '/stores/:slug/admin',
  '/stores/:slug/cart',
  '/stores/:slug/product/:productSlug',
  '/stores/:slug/success',
  '/success',
  '/terms',
  '/webstores',
  '/webstores/business',

  // Sister-brand sub-apps mount a whole router under one prefix, so
  // everything below them is theirs to resolve (CGC renders its own
  // NotFound). On a configured CGC/APC/LHT host these same trees mount at
  // "/" instead, which the host-specific vhost handles.
  '/gift-club/*',
  '/print-club/*',
  '/live-hard-truth/*',
];

// Served by nginx or Express directly, never a SPA page. Listed so the
// catch-all can't accidentally claim them if ordering ever changes.
const NON_SPA_PREFIXES = ['/api/', '/uploads/', '/assets/'];

// Real files that live in the client build.
const STATIC_FILE = /\.(?:js|mjs|css|map|json|xml|txt|ico|png|jpe?g|gif|svg|webp|avif|woff2?|ttf|eot|pdf|webmanifest)$/i;

function toRegExp(pattern) {
  if (pattern.endsWith('/*')) {
    const prefix = pattern.slice(0, -2);
    return new RegExp(`^${escapeLiteral(prefix)}(?:/.*)?$`);
  }
  // :param matches one non-empty segment, exactly like React Router.
  const body = pattern
    .split('/')
    .map((seg) => (seg.startsWith(':') ? '[^/]+' : escapeLiteral(seg)))
    .join('/');
  return new RegExp(`^${body}$`);
}

function escapeLiteral(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const MATCHERS = SPA_ROUTE_PATTERNS.map(toRegExp);

/**
 * True when `pathname` is a page the SPA router can actually render.
 *
 * Trailing slashes are tolerated (/shop/ === /shop) because real links
 * carry them; everything else must match a declared route.
 */
export function isSpaRoute(pathname) {
  if (typeof pathname !== 'string' || !pathname.startsWith('/')) return false;
  if (NON_SPA_PREFIXES.some((p) => pathname.startsWith(p))) return false;
  if (STATIC_FILE.test(pathname)) return false;

  // Normalise one trailing slash, but never turn "/" into "".
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') || '/' : pathname;
  return MATCHERS.some((re) => re.test(path));
}
