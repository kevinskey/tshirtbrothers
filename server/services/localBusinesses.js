// Ingest new business filings from a public Socrata-style open-data
// endpoint (e.g. data.cityofatlanta.gov, opendata.atlantaregional.com,
// data.fultoncountyga.gov). The dataset URL is configured via env so the
// admin can point this at whichever current dataset they want without a
// code change.
//
//   LOCAL_BUSINESS_DATA_URL  – full Socrata JSON endpoint, e.g.
//     https://data.cityofatlanta.gov/resource/abcd-1234.json
//   LOCAL_BUSINESS_APP_TOKEN – optional Socrata app token (recommended)
//   LOCAL_BUSINESS_FIELD_MAP – optional JSON object remapping fields
//     from the source dataset to our schema. Defaults to common Socrata
//     business-license column names.
//
// South Atlanta is defined by ZIP code. Override with env
// SOUTH_ATLANTA_ZIPS (comma-separated) if needed.

import pool from '../db.js';

const DEFAULT_SOUTH_ATL_ZIPS = [
  '30310', '30311', '30312', '30314', '30315',
  '30316', '30331', '30344', '30354',
];

const DEFAULT_FIELD_MAP = {
  external_id:   ['license_number', 'license_no', 'permit_number', 'record_id', ':id'],
  name:          ['business_name', 'dba_name', 'company_name', 'name', 'trade_name'],
  business_type: ['business_type', 'license_type', 'naics_description', 'category'],
  address:       ['address', 'street_address', 'business_address', 'site_address'],
  city:          ['city', 'business_city'],
  state:         ['state', 'business_state'],
  zip:           ['zip', 'zip_code', 'postal_code', 'business_zip'],
  latitude:      ['latitude', 'lat'],
  longitude:     ['longitude', 'lon', 'lng'],
  opened_at:     ['license_issue_date', 'issue_date', 'start_date', 'opened_date', 'effective_date'],
};

function pickField(record, candidates) {
  for (const key of candidates) {
    const v = record[key];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return null;
}

function getZips() {
  const env = process.env.SOUTH_ATLANTA_ZIPS;
  if (!env) return DEFAULT_SOUTH_ATL_ZIPS;
  return env.split(',').map((z) => z.trim()).filter(Boolean);
}

function getFieldMap() {
  const overrides = process.env.LOCAL_BUSINESS_FIELD_MAP;
  if (!overrides) return DEFAULT_FIELD_MAP;
  try {
    const parsed = JSON.parse(overrides);
    return { ...DEFAULT_FIELD_MAP, ...parsed };
  } catch {
    return DEFAULT_FIELD_MAP;
  }
}

function normalize(record, fieldMap) {
  const get = (key) => {
    const candidates = fieldMap[key];
    if (Array.isArray(candidates)) return pickField(record, candidates);
    if (typeof candidates === 'string') return record[candidates] ?? null;
    return null;
  };

  const zipRaw = get('zip');
  const zip = zipRaw ? String(zipRaw).trim().slice(0, 5) : null;

  const opened = get('opened_at');
  let openedDate = null;
  if (opened) {
    const d = new Date(opened);
    if (!Number.isNaN(d.getTime())) openedDate = d.toISOString().slice(0, 10);
  }

  return {
    external_id:   get('external_id') ? String(get('external_id')) : null,
    name:          get('name') ? String(get('name')).trim() : null,
    business_type: get('business_type'),
    address:       get('address'),
    city:          get('city'),
    state:         get('state'),
    zip,
    latitude:      get('latitude') !== null ? Number(get('latitude')) : null,
    longitude:     get('longitude') !== null ? Number(get('longitude')) : null,
    opened_at:     openedDate,
  };
}

// Fetch the dataset, filter to South Atlanta ZIPs, upsert into Postgres.
// Returns { fetched, inserted, updated, skipped }.
export async function refreshLocalBusinesses({ limit = 1000 } = {}) {
  const url = process.env.LOCAL_BUSINESS_DATA_URL;
  if (!url) {
    throw new Error('LOCAL_BUSINESS_DATA_URL is not configured');
  }

  const zips = getZips();
  const fieldMap = getFieldMap();

  // Build a Socrata SoQL query. Most Socrata endpoints accept $where /
  // $limit. If the source isn't Socrata, the caller can pre-bake a URL
  // with their own query string and we'll just append $limit.
  const u = new URL(url);
  if (!u.searchParams.has('$limit')) {
    u.searchParams.set('$limit', String(limit));
  }

  const headers = { Accept: 'application/json' };
  if (process.env.LOCAL_BUSINESS_APP_TOKEN) {
    headers['X-App-Token'] = process.env.LOCAL_BUSINESS_APP_TOKEN;
  }

  const resp = await fetch(u.toString(), { headers });
  if (!resp.ok) {
    throw new Error(`Open-data fetch failed: ${resp.status} ${resp.statusText}`);
  }

  const records = await resp.json();
  if (!Array.isArray(records)) {
    throw new Error('Open-data response was not a JSON array');
  }

  const zipSet = new Set(zips);
  const source = process.env.LOCAL_BUSINESS_SOURCE || 'atl_open_data';

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const raw of records) {
    const norm = normalize(raw, fieldMap);
    if (!norm.external_id || !norm.name) { skipped++; continue; }
    if (!norm.zip || !zipSet.has(norm.zip)) { skipped++; continue; }

    const result = await pool.query(
      `INSERT INTO local_businesses
        (source, external_id, name, business_type, address, city, state,
         zip, latitude, longitude, opened_at, raw)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (source, external_id) DO UPDATE SET
         name          = EXCLUDED.name,
         business_type = EXCLUDED.business_type,
         address       = EXCLUDED.address,
         city          = EXCLUDED.city,
         state         = EXCLUDED.state,
         zip           = EXCLUDED.zip,
         latitude      = EXCLUDED.latitude,
         longitude     = EXCLUDED.longitude,
         opened_at     = EXCLUDED.opened_at,
         raw           = EXCLUDED.raw,
         updated_at    = NOW()
       RETURNING (xmax = 0) AS inserted`,
      [
        source, norm.external_id, norm.name, norm.business_type,
        norm.address, norm.city, norm.state, norm.zip,
        norm.latitude, norm.longitude, norm.opened_at, raw,
      ]
    );
    if (result.rows[0]?.inserted) inserted++;
    else updated++;
  }

  return { fetched: records.length, inserted, updated, skipped };
}

export function getSouthAtlantaZips() {
  return getZips();
}
