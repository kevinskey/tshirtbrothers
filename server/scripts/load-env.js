// Load the server's .env no matter which directory the script was started
// from. Import this FIRST, before anything else.
//
// `import 'dotenv/config'` resolves .env against the CURRENT DIRECTORY, and
// the server's .env lives in server/ — so every script here worked from
// server/ and nowhere else. Run one the way its own usage line spells it,
// from the repo root, and it loaded no environment at all, then failed as
// though the database had rejected the password:
//
//   SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string
//
// which reads like a credentials problem rather than a path one.
//
// FIRST is load-bearing, not tidiness. A module that reads process.env while
// it is being evaluated must be imported after this one. ESM evaluates static
// imports in source order, so putting this line at the top is enough; that
// ordering is also the reason these scripts appeared to work at all from
// server/.
//
// Two of those modules, and they fail differently:
//   db.js      builds its connection Pool at import time, so a late env
//              means a Pool with no password — it dies, loudly.
//   spaces.js  exports SPACES_REGION and SPACES_BUCKET as top-level consts
//              with `|| 'default'` fallbacks, so a late env means it quietly
//              uses the WRONG BUCKET and nothing complains at all.
// The silent one is the reason to keep this rule rather than rely on the
// crash to tell you.

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env') });
