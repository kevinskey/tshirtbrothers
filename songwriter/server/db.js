import pg from 'pg';

const { Pool } = pg;

// Lazy pool — env vars aren't guaranteed to be loaded at import time
// because ES module imports hoist above dotenv.config() in index.js.
let pool = null;

function getPool() {
  if (pool) return pool;
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' && process.env.DATABASE_URL?.includes('sslmode=require')
      ? { rejectUnauthorized: false }
      : undefined,
  });
  pool.on('error', (err) => {
    console.error('[pg] unexpected idle client error', err);
  });
  return pool;
}

// Proxy so existing `pool.query(...)` and `pool.connect()` calls still work.
const poolProxy = {
  query: (...args) => getPool().query(...args),
  connect: (...args) => getPool().connect(...args),
  end: () => pool ? pool.end() : Promise.resolve(),
  on: (event, handler) => getPool().on(event, handler),
};

export default poolProxy;
