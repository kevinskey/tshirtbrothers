import { useQuery } from '@tanstack/react-query';
import { Star } from 'lucide-react';

// Surfaces our actual Google Business Profile rating + the latest reviews.
// Server endpoint caches the Places API result for 6h, so this query
// re-uses staleTime = same to avoid extra round-trips on SPA navigation.

type GoogleReview = {
  author: string;
  authorPhoto?: string;
  rating: number;
  text: string;
  relativeTime: string;
  time: string | null;
};

type ReviewsPayload = {
  name: string;
  address: string;
  rating: number;
  totalReviews: number;
  profileUrl: string;
  reviews: GoogleReview[];
};

async function fetchReviews(): Promise<ReviewsPayload> {
  const res = await fetch('/api/reviews/google');
  if (!res.ok) throw new Error('Failed to load reviews');
  return res.json();
}

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`h-4 w-4 ${
            n <= Math.round(rating) ? 'fill-amber-400 text-amber-400' : 'fill-gray-200 text-gray-200'
          }`}
        />
      ))}
    </div>
  );
}

export default function GoogleReviews() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['google-reviews'],
    queryFn: fetchReviews,
    staleTime: 6 * 60 * 60 * 1000, // match server cache
    retry: 1,
  });

  // Render nothing on error — the rest of the page should keep working. The
  // server already serves stale cache on Places API failures, so this
  // branch is only hit when the cache is cold AND Google is down.
  if (isError) return null;

  return (
    <section className="py-12 sm:py-16 bg-gray-50 border-y border-gray-200">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-orange-600 mb-2">
            <Star className="h-3.5 w-3.5 fill-orange-500 text-orange-500" />
            Google Reviews
          </div>
          <h2
            className="text-3xl sm:text-4xl text-gray-900 tracking-tight"
            style={{ fontFamily: "'Inter', system-ui, sans-serif", fontWeight: 900 }}
          >
            What Our <span className="text-orange-500">Customers Say</span>
          </h2>
          {data ? (
            <div className="mt-3 flex items-center justify-center gap-3 text-gray-700">
              <Stars rating={data.rating} />
              <span className="font-bold text-lg">{data.rating.toFixed(1)}</span>
              <span className="text-sm text-gray-500">
                · {data.totalReviews} Google reviews
              </span>
            </div>
          ) : (
            <div className="mt-3 h-6 animate-pulse bg-gray-200 rounded w-48 mx-auto" />
          )}
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {isLoading
            ? Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-2xl bg-white border border-gray-200 p-5 h-44 animate-pulse"
                />
              ))
            : data?.reviews.slice(0, 6).map((rv, i) => (
                <article
                  key={i}
                  className="rounded-2xl bg-white border border-gray-200 p-5 hover:border-orange-300 hover:shadow-md transition"
                >
                  <div className="flex items-center gap-3">
                    {rv.authorPhoto ? (
                      <img
                        src={rv.authorPhoto}
                        alt=""
                        referrerPolicy="no-referrer"
                        className="h-9 w-9 rounded-full object-cover bg-gray-100"
                      />
                    ) : (
                      <div className="h-9 w-9 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-sm font-bold">
                        {rv.author.slice(0, 1)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{rv.author}</p>
                      <p className="text-xs text-gray-500">{rv.relativeTime}</p>
                    </div>
                  </div>
                  <div className="mt-2"><Stars rating={rv.rating} /></div>
                  <p className="mt-2 text-sm text-gray-700 leading-relaxed line-clamp-5">
                    {rv.text}
                  </p>
                </article>
              ))}
        </div>

        {data && (
          <div className="mt-8 text-center">
            <a
              href={data.profileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 hover:border-orange-500 hover:text-orange-600 px-5 py-2.5 text-sm font-bold text-gray-700 transition"
            >
              Read all {data.totalReviews} reviews on Google →
            </a>
          </div>
        )}
      </div>

      {/* AggregateRating in JSON-LD so Google can render ⭐ stars in search
          results. Pulled from the same live data the page renders. */}
      {data && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'LocalBusiness',
              name: 'TShirt Brothers',
              url: 'https://tshirtbrothers.com',
              aggregateRating: {
                '@type': 'AggregateRating',
                ratingValue: data.rating,
                reviewCount: data.totalReviews,
                bestRating: 5,
                worstRating: 1,
              },
              review: data.reviews.slice(0, 5).map((rv) => ({
                '@type': 'Review',
                author: { '@type': 'Person', name: rv.author },
                reviewRating: {
                  '@type': 'Rating',
                  ratingValue: rv.rating,
                  bestRating: 5,
                },
                reviewBody: rv.text,
                datePublished: rv.time,
              })),
            }),
          }}
        />
      )}
    </section>
  );
}
