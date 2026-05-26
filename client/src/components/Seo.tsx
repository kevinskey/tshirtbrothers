import { Helmet } from 'react-helmet-async';

/**
 * Per-route SEO tags. Sits at the top of every public page component.
 *
 * Why this exists: the site is a React SPA. Without per-route titles
 * Google sees every URL with the same <title> / <meta description>
 * shipped in index.html, which devalues every page that isn't the
 * home. Helmet patches the document head at render-time AND surfaces
 * the same tags when search engines run our JS.
 *
 *   <Seo
 *     title="Custom Screen Printing in Atlanta · TShirt Brothers"
 *     description="..."
 *     path="/services"
 *   />
 *
 * Pass `image` to override the default share image (OG/Twitter).
 * Pass `noindex` for utility pages we don't want crawled.
 */
type SeoProps = {
  title: string;
  description: string;
  path: string;
  image?: string;
  noindex?: boolean;
  // hreflang alternates so Google can match the right language to
  // each searcher. Pair up English ↔ Spanish (etc) versions of the
  // same content by passing { en: '/', es: '/es' } on both pages.
  alternates?: Record<string, string>;
};

const SITE = 'https://tshirtbrothers.com';
const DEFAULT_IMAGE = 'https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com/tsb-logo.png';

export default function Seo({ title, description, path, image, noindex, alternates }: SeoProps) {
  const url = `${SITE}${path.startsWith('/') ? path : `/${path}`}`;
  const ogImage = image || DEFAULT_IMAGE;
  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />
      {noindex && <meta name="robots" content="noindex, nofollow" />}
      {alternates && Object.entries(alternates).map(([lang, p]) => (
        <link key={lang} rel="alternate" hrefLang={lang} href={`${SITE}${p.startsWith('/') ? p : `/${p}`}`} />
      ))}
      {/* x-default points to the canonical (usually English) version
          so unmatched locales fall back gracefully. */}
      {alternates?.['x-default'] && (
        <link rel="alternate" hrefLang="x-default" href={`${SITE}${alternates['x-default']}`} />
      )}

      {/* Open Graph */}
      <meta property="og:type" content="website" />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:site_name" content="TShirt Brothers" />
      <meta property="og:locale" content="en_US" />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />
    </Helmet>
  );
}
