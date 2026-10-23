import { useQuery } from '@tanstack/react-query';
import { Star } from 'lucide-react';

/**
 * Inline "5.0 on Google · 46 reviews" chip, read from the live Google
 * Business Profile.
 *
 * Why this exists: the city and vertical landing pages hard-coded the
 * string "5.0 on Google". That happened to be true when the 2026-10-23
 * audit checked it (genuinely 5.0 across 46 reviews), but a hard-coded
 * rating is a claim that silently becomes false the first time someone
 * leaves four stars — on dozens of pages at once. Reading it from the
 * same endpoint that feeds the homepage reviews section means the claim
 * can't drift from reality.
 *
 * Renders NOTHING while loading or on error. A missing chip is a
 * non-event; a wrong rating is a false advertising claim, and an
 * invented fallback number would be worse than either.
 *
 * Shares the react-query key and staleTime with GoogleReviews, so a
 * landing page that also renders the reviews section costs one request,
 * not two.
 */

type ReviewsPayload = {
  rating: number;
  totalReviews: number;
};

async function fetchReviews(): Promise<ReviewsPayload> {
  const res = await fetch('/api/reviews/google');
  if (!res.ok) throw new Error('Failed to load reviews');
  return res.json();
}

export default function GoogleRatingChip({ className }: { className?: string }) {
  const { data } = useQuery({
    queryKey: ['google-reviews'],
    queryFn: fetchReviews,
    staleTime: 6 * 60 * 60 * 1000, // match server cache
    retry: 1,
  });

  if (!data?.rating) return null;

  return (
    <span className={className ?? 'flex items-center gap-1.5'}>
      <Star className="h-4 w-4 text-orange-500 fill-orange-500" />
      {data.rating.toFixed(1)} on Google
      {data.totalReviews ? ` · ${data.totalReviews} reviews` : ''}
    </span>
  );
}
