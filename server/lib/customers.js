// Land a buyer or lead in the admin customer list (users, role 'customer').
//
// Shared by the quote form and the DTF store checkout so every intake path
// creates the same kind of customer record. An existing user for the email
// is linked (and gets a phone if it had none); otherwise a customer row is
// created with a random password_hash — they can claim it through the
// forgot-password flow. Never throws: the caller's order must still save.
import pool from '../db.js';

/** Digits-only length check, so (555) 000-0000 passes and the raw string is stored. */
export function isValidPhone(phone) {
  const digits = typeof phone === 'string' ? phone.replace(/\D/g, '') : '';
  return digits.length >= 10 && digits.length <= 15;
}

/**
 * @param {{ name?: string, email: string, phone?: string,
 *           address?: { street?: string, city?: string, state?: string, zip?: string } }} c
 * @returns {Promise<number|null>} the user id, or null if it could not be saved
 */
export async function ensureCustomer({ name, email, phone, address }) {
  if (!email) return null;
  try {
    const existing = await pool.query(
      'SELECT id, phone FROM users WHERE LOWER(email) = LOWER($1)',
      [email],
    );
    if (existing.rows.length > 0) {
      const user = existing.rows[0];
      if (!user.phone && phone) {
        await pool.query('UPDATE users SET phone = $1 WHERE id = $2', [phone, user.id]);
      }
      return user.id;
    }
    const bcrypt = (await import('bcryptjs')).default;
    const hash = await bcrypt.hash(Math.random().toString(36).slice(2) + Date.now(), 10);
    const addr = address && typeof address === 'object' ? address : {};
    const created = await pool.query(
      `INSERT INTO users
         (name, email, phone, password_hash, role,
          address_street, address_city, address_state, address_zip)
       VALUES ($1, $2, $3, $4, 'customer', $5, $6, $7, $8)
       RETURNING id`,
      [
        name || null, email, phone || null, hash,
        addr.street || null, addr.city || null, addr.state || null, addr.zip || null,
      ],
    );
    return created.rows[0].id;
  } catch (err) {
    console.error('[customers] auto-add customer failed:', err.message);
    return null;
  }
}
