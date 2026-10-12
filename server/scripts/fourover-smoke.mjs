// 4over API smoke test — run the moment FOUROVER_* keys land in server/.env:
//
//   cd server && node --env-file=.env scripts/fourover-smoke.mjs
//
// Verifies the auth scheme in services/fourover.js against the live API
// (the official reference is gated behind the API-license login). If this
// 401s, the signature derivation in fourover.js is the only suspect.

import { isFourOverConfigured, getCategories, getProducts } from '../services/fourover.js';

if (!isFourOverConfigured()) {
  console.error('FOUROVER_PUBLIC_KEY / FOUROVER_PRIVATE_KEY not set — nothing to test.');
  process.exit(1);
}

try {
  const categories = await getCategories();
  const catList = categories?.entities || (Array.isArray(categories) ? categories : []);
  console.log(`✓ auth OK — ${catList.length} categories`);
  console.log(JSON.stringify(catList.slice(0, 5), null, 2));

  const products = await getProducts({ max: 5, offset: 0 });
  const prodList = products?.entities || (Array.isArray(products) ? products : []);
  console.log(`✓ products feed OK — sample of ${prodList.length}:`);
  console.log(JSON.stringify(prodList, null, 2));
  console.log('\nNEXT: compare these field names against the parsing in services/apcCatalog.js (syncFourOverCatalog).');
} catch (err) {
  console.error('✗ 4over call failed:', err.message);
  process.exit(1);
}
