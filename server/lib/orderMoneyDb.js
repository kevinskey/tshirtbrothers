// Database side of resolveOrderMoney: load a job's rows, then resolve.
// Kept apart from orderMoney.js so the decision itself stays pure and
// testable without a database.

import pool from '../db.js';
import { resolveOrderMoney } from './orderMoney.js';

/**
 * What does this job cost, and what has been collected?
 *
 * @param {object|number|string} quoteOrId a quotes row (saves a query) or its id
 * @returns {Promise<ReturnType<typeof resolveOrderMoney>>}
 */
export async function loadOrderMoney(quoteOrId) {
  const isRow = quoteOrId && typeof quoteOrId === 'object';
  const id = isRow ? quoteOrId.id : quoteOrId;
  if (id == null) return resolveOrderMoney(null, []);

  let quote = isRow ? quoteOrId : null;
  if (!quote) {
    const { rows } = await pool.query('SELECT * FROM quotes WHERE id = $1', [id]);
    quote = rows[0] || null;
  }

  const { rows: invoices } = await pool.query(
    `SELECT id, invoice_number, status, total, amount_paid
       FROM invoices WHERE quote_id = $1 ORDER BY id`,
    [id],
  );
  return resolveOrderMoney(quote, invoices);
}
