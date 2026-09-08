// Google-backed address assistance for every address field on the site.
// Proxies the Places Autocomplete (New), Place Details (New), and Address
// Validation APIs so the browser never sees the API key.
//
//   POST /api/address/autocomplete  { input }        → { suggestions: [{ placeId, text }] }
//   GET  /api/address/place/:placeId                 → { line1, city, state, zip, formatted }
//   POST /api/address/validate      { line1, city, state, zip }
//        → { verdict: 'ok'|'fixed'|'unconfirmed'|'unknown', formatted, components }
//
// The key lives in GOOGLE_MAPS_API_KEY (same one the reviews block uses).

import express from 'express';

const router = express.Router();
const KEY = process.env.GOOGLE_MAPS_API_KEY;

router.post('/autocomplete', async (req, res) => {
  const input = String(req.body?.input || '').trim();
  if (!KEY || input.length < 4) return res.json({ suggestions: [] });
  try {
    const r = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': KEY },
      body: JSON.stringify({
        input,
        includedRegionCodes: ['us'],
        // Bias toward metro Atlanta so short inputs surface local streets
        // first; results are NOT restricted to this circle.
        locationBias: { circle: { center: { latitude: 33.57, longitude: -84.58 }, radius: 50000 } },
      }),
    });
    const d = await r.json();
    const suggestions = (d.suggestions || [])
      .map((s) => s.placePrediction)
      .filter(Boolean)
      .slice(0, 5)
      .map((p) => ({ placeId: p.placeId, text: p.text?.text || '' }));
    res.json({ suggestions });
  } catch (err) {
    console.error('address autocomplete failed:', err.message);
    res.json({ suggestions: [] });
  }
});

router.get('/place/:placeId', async (req, res) => {
  if (!KEY) return res.status(503).json({ error: 'address service unavailable' });
  try {
    const r = await fetch(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(req.params.placeId)}`,
      { headers: { 'X-Goog-Api-Key': KEY, 'X-Goog-FieldMask': 'addressComponents,formattedAddress' } },
    );
    const d = await r.json();
    const get = (type, short = false) => {
      const c = (d.addressComponents || []).find((x) => x.types?.includes(type));
      return c ? (short ? c.shortText : c.longText) || '' : '';
    };
    const streetNumber = get('street_number');
    const route = get('route');
    res.json({
      line1: [streetNumber, route].filter(Boolean).join(' '),
      city: get('locality') || get('sublocality') || get('postal_town'),
      state: get('administrative_area_level_1', true),
      zip: get('postal_code'),
      formatted: d.formattedAddress || '',
    });
  } catch (err) {
    console.error('address place lookup failed:', err.message);
    res.status(502).json({ error: 'place lookup failed' });
  }
});

router.post('/validate', async (req, res) => {
  const { line1 = '', city = '', state = '', zip = '' } = req.body || {};
  if (!KEY || !String(line1).trim()) return res.json({ verdict: 'unknown' });
  try {
    const r = await fetch(`https://addressvalidation.googleapis.com/v1:validateAddress?key=${KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address: {
          regionCode: 'US',
          addressLines: [String(line1).trim(), [city, state, zip].filter(Boolean).join(' ').trim()].filter(Boolean),
        },
      }),
    });
    const d = await r.json();
    const v = d.result?.verdict;
    const pa = d.result?.address?.postalAddress;
    if (!v || !pa) return res.json({ verdict: 'unknown' });

    const components = {
      line1: (pa.addressLines || [])[0] || String(line1).trim(),
      city: pa.locality || city,
      state: pa.administrativeArea || state,
      // Keep ZIP to 5 digits — the +4 confuses shipping labels people retype.
      zip: String(pa.postalCode || zip).slice(0, 5),
    };
    const goodGranularity = ['PREMISE', 'SUB_PREMISE'].includes(v.validationGranularity);
    const verdict = v.hasUnconfirmedComponents || !goodGranularity
      ? 'unconfirmed'
      : v.hasReplacedComponents || v.hasInferredComponents || v.hasSpellCorrectedComponents
        ? 'fixed'
        : 'ok';
    res.json({ verdict, formatted: d.result?.address?.formattedAddress || '', components });
  } catch (err) {
    console.error('address validation failed:', err.message);
    res.json({ verdict: 'unknown' });
  }
});

export default router;
