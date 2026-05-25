// Public endpoint that surfaces our real Google Business Profile rating +
// the latest reviews to the website. The Google Places API returns at most
// 5 reviews per call (Places (legacy) Details with `reviews` field), so we
// just expose what Google gives us — no pagination required.
//
// Caching: Google's TOS requires that we don't hammer the API on every
// page load. We keep an in-memory cache for 6 hours, which is also Google's
// recommended TTL. On startup the cache is cold; the first request triggers
// a fetch, every subsequent request inside the window is a no-op.

import express from 'express';

const router = express.Router();

const PLACE_ID = process.env.GOOGLE_PLACE_ID || 'ChIJ1wdXkcfp9IgRuigC9YYhM3I';
const API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

// Comma-separated list of author names to hide from the public block
// (case-insensitive, leading/trailing whitespace trimmed). The aggregate
// rating + total count still come straight from Google — this only
// affects which individual review cards we render.
const HIDDEN_AUTHORS = (process.env.GOOGLE_REVIEWS_HIDE_AUTHORS || 'Hazel Lucious')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

let cache = { fetchedAt: 0, payload: null };

async function fetchGooglePlaceDetails() {
  if (!API_KEY) {
    throw new Error('GOOGLE_MAPS_API_KEY not set');
  }
  const params = new URLSearchParams({
    place_id: PLACE_ID,
    // Trimmed to the fields we actually render. Cheaper SKU than asking
    // for the full Place object.
    fields: 'name,rating,user_ratings_total,reviews,url,formatted_address',
    // Most-recent ordering matches what people see on the actual Maps
    // listing; "most_relevant" is Google's default but tends to surface
    // older reviews on small profiles.
    reviews_sort: 'newest',
    key: API_KEY,
  });
  const url = `https://maps.googleapis.com/maps/api/place/details/json?${params.toString()}`;
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok || body.status !== 'OK') {
    throw new Error(`Places API: ${body.status} ${body.error_message || ''}`);
  }
  const r = body.result || {};
  // Normalize to a small public shape — drop internal fields, never
  // expose the raw API key path or html_attributions to the client.
  // Author-name filter removes reviewers we don't want on the public
  // block (e.g. competitor / nuisance reviews). Aggregate count + rating
  // are NOT adjusted — they come directly from Google's official totals.
  const filteredReviews = (r.reviews || [])
    .filter((rv) => !HIDDEN_AUTHORS.includes((rv.author_name || '').trim().toLowerCase()))
    .map((rv) => ({
      author: rv.author_name,
      authorPhoto: rv.profile_photo_url,
      rating: rv.rating,
      text: rv.text || '',
      relativeTime: rv.relative_time_description,
      // ISO timestamp from the unix seconds Google returns.
      time: rv.time ? new Date(rv.time * 1000).toISOString() : null,
    }));
  return {
    name: r.name,
    address: r.formatted_address,
    rating: r.rating,
    totalReviews: r.user_ratings_total,
    profileUrl: r.url,
    reviews: filteredReviews,
  };
}

// GET /api/reviews/google — cached, public
router.get('/google', async (_req, res) => {
  try {
    const now = Date.now();
    if (cache.payload && now - cache.fetchedAt < CACHE_TTL_MS) {
      return res.json({ ...cache.payload, cached: true });
    }
    const payload = await fetchGooglePlaceDetails();
    cache = { fetchedAt: now, payload };
    res.json({ ...payload, cached: false });
  } catch (err) {
    // On error, serve the stale cache rather than 500-ing the homepage.
    if (cache.payload) {
      return res.json({ ...cache.payload, cached: true, stale: true });
    }
    console.error('[reviews/google] failed:', err.message);
    res.status(502).json({ error: 'Could not load reviews', detail: err.message });
  }
});

export default router;
