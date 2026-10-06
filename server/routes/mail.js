import { Router } from 'express';
import pool from '../db.js';
import { authenticate, adminOnly } from '../middleware/auth.js';
import { mailStatus, syncMail, sendMail } from '../services/mailbox.js';

const router = Router();
router.use(authenticate, adminOnly);

// GET /status — is the mailbox configured, when did it last sync
router.get('/status', (req, res) => res.json(mailStatus()));

// POST /sync — manual "check mail now"
router.post('/sync', async (req, res, next) => {
  try {
    res.json(await syncMail());
  } catch (err) {
    next(err);
  }
});

// GET /aliases — every @tshirtbrothers.com address that has received mail,
// with unread counts, for the inbox filter chips.
router.get('/aliases', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT alias, COUNT(*) AS total, COUNT(*) FILTER (WHERE NOT seen AND NOT outgoing) AS unread
         FROM mail_messages
        WHERE alias IS NOT NULL AND NOT deleted
        GROUP BY alias
        ORDER BY MAX(msg_date) DESC`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET / — message list. Filters: alias, q (from/subject search), unread=1,
// folder (inbox|sent|drafts|all), limit/offset.
router.get('/', async (req, res, next) => {
  try {
    const { alias, q, unread, folder = 'inbox' } = req.query;
    const limit = Math.min(100, parseInt(req.query.limit, 10) || 50);
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);

    const conditions = ['NOT deleted'];
    const params = [];
    let i = 1;
    if (folder === 'inbox') conditions.push('NOT outgoing');
    else if (folder === 'sent') conditions.push(`outgoing AND folder <> 'Drafts'`);
    else if (folder === 'drafts') conditions.push(`folder = 'Drafts'`);
    if (alias) { conditions.push(`alias = $${i++}`); params.push(String(alias).toLowerCase()); }
    if (unread === '1') conditions.push('NOT seen AND NOT outgoing');
    if (q) {
      conditions.push(`(from_addr ILIKE $${i} OR from_name ILIKE $${i} OR subject ILIKE $${i} OR snippet ILIKE $${i})`);
      params.push(`%${q}%`);
      i++;
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT id, folder, from_name, from_addr, to_addrs, alias, subject, snippet,
              attachments, msg_date, seen, outgoing
         FROM mail_messages ${where}
        ORDER BY msg_date DESC NULLS LAST
        LIMIT $${i++} OFFSET $${i}`,
      [...params, limit, offset]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /:id — full message (marks it read)
router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `UPDATE mail_messages SET seen = TRUE WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Message not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// PUT /:id — toggle read/unread
router.put('/:id', async (req, res, next) => {
  try {
    const { seen } = req.body;
    const { rows } = await pool.query(
      `UPDATE mail_messages SET seen = $2 WHERE id = $1 RETURNING id, seen`,
      [req.params.id, !!seen]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Message not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// DELETE /:id — soft-delete: hides the message from the TSB inbox. The
// copy in the Purelymail mailbox is untouched, and the row is kept so the
// IMAP sync high-water mark can't slip backward and re-import it.
router.delete('/:id', async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      'UPDATE mail_messages SET deleted = TRUE, seen = TRUE WHERE id = $1',
      [req.params.id]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Message not found' });
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
});

// POST /send — compose or reply. body: {from, to, cc?, subject, text, replyToId?}
// Save an email as a draft — nothing is sent. Drafts live in mail_messages
// with folder='Drafts' (excluded from the Sent filter above) so they show
// up in the Mail section next to everything else.
router.post('/draft', async (req, res, next) => {
  try {
    const { from, to, subject, text } = req.body;
    const fromAddr = String(from || '').toLowerCase().trim() || null;
    const toList = String(to || '')
      .split(/[,;]/).map((a) => a.trim().toLowerCase()).filter(Boolean);
    const { rows } = await pool.query(
      `INSERT INTO mail_messages
         (folder, message_id, from_addr, to_addrs, alias, subject,
          snippet, body_text, msg_date, seen, outgoing)
       VALUES ('Drafts', $1, $2, $3, $2, $4, $5, $6, NOW(), TRUE, TRUE)
       RETURNING id`,
      [
        `draft-${Date.now()}-${Math.random().toString(36).slice(2)}@local`,
        fromAddr,
        JSON.stringify(toList),
        subject || '(no subject)',
        (text || '').replace(/\s+/g, ' ').slice(0, 180),
        text || null,
      ]
    );
    res.status(201).json({ id: rows[0].id, saved: true });
  } catch (err) {
    next(err);
  }
});

router.post('/send', async (req, res, next) => {
  try {
    const { from, to, cc, subject, text, replyToId } = req.body;
    if (!to || !String(to).trim()) return res.status(400).json({ error: 'Recipient required' });
    if (!text || !String(text).trim()) return res.status(400).json({ error: 'Message body required' });

    let inReplyTo = null;
    if (replyToId) {
      const orig = await pool.query('SELECT message_id FROM mail_messages WHERE id = $1', [replyToId]);
      inReplyTo = orig.rows[0]?.message_id || null;
    }

    const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;white-space:pre-wrap;">${String(text)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>`;

    const info = await sendMail({ from, to, cc, subject, text, html, inReplyTo });
    res.status(201).json({ sent: true, messageId: info.messageId });
  } catch (err) {
    if (/From address must be|Mailbox not configured/.test(err.message)) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

export default router;
