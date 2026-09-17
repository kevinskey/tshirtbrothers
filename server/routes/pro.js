// TSB Pro — public endpoints for the B2B program landing page.
//
// Two jobs, both intentionally small:
//
//   POST /api/pro/leads       "Become a Pro customer" intake. Lands the
//                             lead on the existing admin Sales Prospects
//                             board (prospects table) and emails the shop.
//   POST /api/pro/find-store  "Access your business store." Looks the
//                             email up in store_admins and emails links
//                             to their store(s). Response is identical
//                             whether or not the email matches anything,
//                             so it can't be used to probe who our
//                             customers are.

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { Resend } from 'resend';
import pool from '../db.js';

const router = Router();
const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.FROM_EMAIL || 'T-Shirt Brothers <noreply@tshirtbrothers.com>';
const SHOP_EMAIL = process.env.SHOP_NOTIFY_EMAIL || 'kevin@tshirtbrothers.com';

const limiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — try again later.' },
});

const trim = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// ── POST /api/pro/leads ──────────────────────────────────────────────────
// Body: { business_name*, contact_name, email*, phone, address, website,
//         business_type, apparel_needs, notes }
router.post('/leads', limiter, async (req, res, next) => {
  try {
    const b = req.body ?? {};
    const businessName = trim(b.business_name, 255);
    const email = trim(b.email, 255);
    if (!businessName || !email) {
      return res.status(400).json({ error: 'business_name and email are required' });
    }
    const contactName = trim(b.contact_name, 160);
    const phone = trim(b.phone, 40);
    const address = trim(b.address, 255);
    const website = trim(b.website, 255);
    const businessType = trim(b.business_type, 120);
    const apparelNeeds = trim(b.apparel_needs, 2000);
    const notes = trim(b.notes, 2000);

    const noteLines = ['TSB Pro signup (from tshirtbrothers.com/pro)'];
    if (website) noteLines.push(`Website: ${website}`);
    if (apparelNeeds) noteLines.push(`Apparel needs: ${apparelNeeds}`);
    if (notes) noteLines.push(`Notes: ${notes}`);

    // prospects.name is unique — if the business is already on the board,
    // keep the curated row and just note the new inbound signup.
    await pool.query(
      `INSERT INTO prospects
         (tier, name, category, address, phone, product_angle, notes,
          status, contact_name, contact_email)
       VALUES ('A', $1, $2, $3, $4, 'TSB Pro business web store', $5, 'new', $6, $7)
       ON CONFLICT (name) DO UPDATE SET
         outreach_notes = COALESCE(prospects.outreach_notes || E'\\n\\n', '')
                          || 'Inbound TSB Pro signup ' || to_char(NOW(), 'YYYY-MM-DD')
                          || ' — ' || EXCLUDED.contact_email,
         contact_name  = COALESCE(prospects.contact_name, EXCLUDED.contact_name),
         contact_email = COALESCE(prospects.contact_email, EXCLUDED.contact_email),
         updated_at = NOW()`,
      [businessName, businessType || null, address || null, phone || null,
       noteLines.join('\n'), contactName || null, email],
    );

    if (process.env.RESEND_API_KEY) {
      const row = (k, v) => (v ? `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;">${k}</td><td style="padding:4px 0;font-weight:600;">${v}</td></tr>` : '');
      resend.emails.send({
        from: FROM,
        to: SHOP_EMAIL,
        subject: `TSB Pro lead: ${businessName}`,
        html: `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:24px;">
          <h2 style="margin:0 0 12px;">New TSB Pro signup</h2>
          <table style="font-size:14px;border-collapse:collapse;">
            ${row('Business', businessName)}
            ${row('Contact', contactName)}
            ${row('Email', email)}
            ${row('Phone', phone)}
            ${row('Address', address)}
            ${row('Website', website)}
            ${row('Type', businessType)}
            ${row('Apparel needs', apparelNeeds)}
            ${row('Notes', notes)}
          </table>
          <p style="margin:16px 0 0;color:#6b7280;font-size:13px;">Added to the Sales Prospects board (tier A, status new).</p>
        </div>`,
      }).catch((err) => console.error('[pro] lead email failed:', err.message));
    }

    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── POST /api/pro/find-store ─────────────────────────────────────────────
// Body: { email }
router.post('/find-store', limiter, async (req, res, next) => {
  try {
    const email = trim(req.body?.email, 255).toLowerCase();
    if (!email) return res.status(400).json({ error: 'email required' });

    const { rows } = await pool.query(
      `SELECT s.slug, s.subdomain, s.name
         FROM store_admins a
         JOIN stores s ON s.id = a.store_id
        WHERE lower(a.email) = $1
          AND s.status = 'active'
          AND s.store_type IN ('group', 'business')
        ORDER BY s.name ASC`,
      [email],
    );

    if (rows.length && process.env.RESEND_API_KEY) {
      const domain = process.env.DOMAIN || 'https://tshirtbrothers.com';
      const links = rows.map((s) => {
        const base = s.subdomain
          ? `https://${s.subdomain}.tshirtbrothers.com`
          : `${domain}/stores/${s.slug}`;
        const adminUrl = s.subdomain ? `${base}/admin` : `${base}/admin`;
        return `<li style="margin:8px 0;">
          <strong>${s.name}</strong><br/>
          <a href="${base}" style="color:#ea580c;">Storefront</a> ·
          <a href="${adminUrl}" style="color:#ea580c;">Store dashboard</a>
        </li>`;
      }).join('');
      resend.emails.send({
        from: FROM,
        to: email,
        subject: 'Your store at T-Shirt Brothers',
        html: `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:24px;">
          <h2 style="margin:0 0 12px;">Your business has a home at T-Shirt Brothers</h2>
          <p style="margin:0 0 12px;color:#4b5563;">Here ${rows.length === 1 ? 'is your store' : 'are your stores'}:</p>
          <ul style="padding-left:18px;margin:0;">${links}</ul>
          <p style="margin:16px 0 0;color:#6b7280;font-size:13px;">The dashboard signs you in with a one-time code sent to this address.</p>
        </div>`,
      }).catch((err) => console.error('[pro] find-store email failed:', err.message));
    } else if (rows.length) {
      console.log(`[pro] find-store for ${email}:`, rows.map((r) => r.slug).join(', '));
    }

    // Same answer whether we found anything or not.
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
