// Unified *@tshirtbrothers.com mailbox: IMAP sync from Purelymail into
// mail_messages, and SMTP sending as any alias on the domain.
//
// Credentials come from MAIL_IMAP_USER / MAIL_IMAP_PASS (a Purelymail app
// password). If they're not set, everything here no-ops so the rest of the
// app is unaffected. Transactional email (receipts, quote notifications)
// still goes through Resend in services/email.js — this module is only the
// admin-facing mailbox.

import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import nodemailer from 'nodemailer';
import pool from '../db.js';
import { uploadObject } from './spaces.js';

const IMAP_HOST = process.env.MAIL_IMAP_HOST || 'imap.purelymail.com';
const SMTP_HOST = process.env.MAIL_SMTP_HOST || 'smtp.purelymail.com';
const MAIL_DOMAIN = process.env.MAIL_DOMAIN || 'tshirtbrothers.com';

export function mailConfigured() {
  return !!(process.env.MAIL_IMAP_USER && process.env.MAIL_IMAP_PASS);
}

let syncing = false;
let lastSync = null;
let lastError = null;

export function mailStatus() {
  return { configured: mailConfigured(), syncing, lastSync, lastError };
}

function auth() {
  return { user: process.env.MAIL_IMAP_USER, pass: process.env.MAIL_IMAP_PASS };
}

// The @tshirtbrothers.com address this message was sent to — that's the
// "alias" the admin inbox groups by. Falls back to the first recipient.
function pickAlias(toList, ccList) {
  const all = [...toList, ...ccList];
  const ours = all.find((a) => a.toLowerCase().endsWith(`@${MAIL_DOMAIN}`));
  return (ours || all[0] || '').toLowerCase() || null;
}

function addrList(obj) {
  // mailparser address object -> ["a@b.com", ...] plus display map
  if (!obj || !Array.isArray(obj.value)) return [];
  return obj.value.map((v) => (v.address || '').toLowerCase()).filter(Boolean);
}

// Where archive copies of the site's transactional mail get filed. Resend
// BCCs outbox@ on every send (services/email.js); the catch-all routes those
// into this mailbox's INBOX, and Purelymail rewrites Delivered-To so the BCC
// address is unrecoverable there. The copies are still recognizable by
// shape: from our own domain but not addressed to the mailbox user in
// To/Cc — real correspondence (admin notifications, customer replies)
// always is.
const ARCHIVE_FOLDER = 'Site Outbox';
function isArchiveCopy(folder, fromAddr, to, cc) {
  if (folder !== 'INBOX') return false;
  if (!fromAddr || !fromAddr.endsWith(`@${MAIL_DOMAIN}`)) return false;
  const user = (process.env.MAIL_IMAP_USER || '').toLowerCase();
  return !to.includes(user) && !cc.includes(user);
}

// Pull new mail from a folder into mail_messages. Uses UID > max(stored)
// per folder so each run only fetches what's new.
async function syncFolder(client, folder, { outgoing = false } = {}) {
  const lock = await client.getMailboxLock(folder);
  try {
    const { rows } = await pool.query(
      'SELECT COALESCE(MAX(uid), 0) AS max_uid FROM mail_messages WHERE folder = $1',
      [folder]
    );
    const sinceUid = Number(rows[0].max_uid);
    // First ever sync: only pull the most recent 200 so we don't ingest
    // years of history in one go.
    let uids = await client.search({ uid: `${sinceUid + 1}:*` }, { uid: true });
    if (!Array.isArray(uids)) uids = [];
    uids = uids.filter((u) => u > sinceUid);
    if (sinceUid === 0 && uids.length > 200) uids = uids.slice(-200);
    if (uids.length === 0) return 0;

    let added = 0;
    for (const uid of uids) {
      try {
        const msg = await client.fetchOne(String(uid), { source: true, flags: true }, { uid: true });
        if (!msg?.source) continue;
        const parsed = await simpleParser(msg.source);

        const messageId = parsed.messageId || `${folder}-${uid}@local.tshirtbrothers.com`;
        const to = addrList(parsed.to);
        const cc = addrList(parsed.cc);
        const fromVal = parsed.from?.value?.[0] || {};
        // Postgres TEXT rejects NUL bytes, and spam occasionally carries
        // them — one such message made every sync of its folder fail (and
        // retry forever) with "invalid byte sequence for encoding UTF8".
        const deNul = (s) => (s ? s.replace(/\u0000/g, '') : s);
        const text = deNul((parsed.text || '').trim());
        const snippet = text.replace(/\s+/g, ' ').slice(0, 180);

        // Attachments -> DO Spaces (skip inline images over 15MB)
        const attachments = [];
        for (const att of parsed.attachments || []) {
          if (!att.content || att.size > 15 * 1024 * 1024) continue;
          try {
            const safeName = (att.filename || 'file').replace(/[^\w.\-]+/g, '_');
            const key = `mail/${encodeURIComponent(messageId).replace(/%/g, '')}/${Date.now()}-${safeName}`;
            const url = await uploadObject({ key, body: att.content, contentType: att.contentType || 'application/octet-stream' });
            attachments.push({ filename: att.filename || safeName, contentType: att.contentType || null, size: att.size || att.content.length, url });
          } catch (e) {
            console.error('[mail sync] attachment upload failed:', e.message);
          }
        }

        const seen = outgoing || (Array.isArray(msg.flags) ? msg.flags.includes('\\Seen') : msg.flags?.has?.('\\Seen')) || false;

        // File archive copies out of INBOX on the server too, so IMAP
        // clients (the iPhone) see them in the folder, not the inbox.
        const fromAddr = (fromVal.address || '').toLowerCase();
        let storeFolder = folder;
        let storeUid = uid;
        let storeSeen = seen;
        if (isArchiveCopy(folder, fromAddr, to, cc)) {
          try {
            const moved = await client.messageMove(String(uid), ARCHIVE_FOLDER, { uid: true });
            storeFolder = ARCHIVE_FOLDER;
            storeUid = moved?.uidMap?.get?.(uid) ?? null;
            storeSeen = true;
          } catch (e) {
            console.error('[mail sync] archive move failed:', e.message);
          }
        }

        // Archive copies count as outgoing: they're our own transactional
        // sends, so the admin Mail tab shows them under Sent, not Inbox.
        const storeOutgoing = outgoing || storeFolder === ARCHIVE_FOLDER;

        await pool.query(
          `INSERT INTO mail_messages
             (folder, uid, message_id, in_reply_to, from_name, from_addr,
              to_addrs, cc_addrs, alias, subject, snippet, body_text, body_html,
              attachments, msg_date, seen, outgoing)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
           ON CONFLICT (message_id) DO NOTHING`,
          [
            storeFolder, storeUid, messageId, parsed.inReplyTo || null,
            fromVal.name || null, fromAddr || null,
            JSON.stringify(to), JSON.stringify(cc),
            storeOutgoing ? fromAddr : pickAlias(to, cc),
            deNul(parsed.subject) || '(no subject)', snippet,
            text || null, deNul(parsed.html || '') || null,
            JSON.stringify(attachments),
            parsed.date || new Date(), storeSeen, storeOutgoing,
          ]
        );
        added++;
      } catch (e) {
        console.error(`[mail sync] ${folder} uid ${uid} failed:`, e.message);
      }
    }
    return added;
  } finally {
    lock.release();
  }
}

export async function syncMail() {
  if (!mailConfigured() || syncing) return { skipped: true };
  syncing = true;
  lastError = null;
  const client = new ImapFlow({
    host: IMAP_HOST,
    port: 993,
    secure: true,
    auth: auth(),
    logger: false,
  });
  try {
    await client.connect();
    const inbox = await syncFolder(client, 'INBOX');
    // Purelymail's sent folder; ignore if it doesn't exist.
    let sent = 0;
    try {
      sent = await syncFolder(client, 'Sent', { outgoing: true });
    } catch { /* folder may not exist yet */ }
    lastSync = new Date().toISOString();
    return { inbox, sent };
  } catch (e) {
    lastError = e.message;
    console.error('[mail sync] failed:', e.message);
    return { error: e.message };
  } finally {
    try { await client.logout(); } catch { /* already closed */ }
    syncing = false;
  }
}

let timer = null;
export function startMailSync() {
  if (!mailConfigured()) {
    console.log('[mail] MAIL_IMAP_USER/PASS not set — mailbox disabled');
    return;
  }
  if (timer) return;
  // First run shortly after boot, then every 2 minutes.
  setTimeout(() => void syncMail(), 10_000);
  timer = setInterval(() => void syncMail(), 2 * 60 * 1000);
  console.log('[mail] IMAP sync scheduled every 2 minutes');
}

// Send as any alias on the domain (Purelymail permits any From on owned
// domains). Records the message in mail_messages immediately; the Sent
// folder copy will also arrive on the next sync and dedupe by message_id.
export async function sendMail({ from, to, cc, subject, text, html, inReplyTo }) {
  if (!mailConfigured()) throw new Error('Mailbox not configured');
  const fromAddr = (from || process.env.MAIL_IMAP_USER).toLowerCase().trim();
  if (!fromAddr.endsWith(`@${MAIL_DOMAIN}`)) {
    throw new Error(`From address must be @${MAIL_DOMAIN}`);
  }
  const transport = nodemailer.createTransport({
    host: SMTP_HOST,
    port: 465,
    secure: true,
    auth: auth(),
  });
  const info = await transport.sendMail({
    from: fromAddr,
    to,
    cc: cc || undefined,
    subject,
    text: text || undefined,
    html: html || undefined,
    inReplyTo: inReplyTo || undefined,
    references: inReplyTo || undefined,
  });

  const toList = (Array.isArray(to) ? to : String(to).split(/[,;]/)).map((a) => a.trim().toLowerCase()).filter(Boolean);
  await pool.query(
    `INSERT INTO mail_messages
       (folder, message_id, in_reply_to, from_addr, to_addrs, alias, subject,
        snippet, body_text, body_html, msg_date, seen, outgoing)
     VALUES ('Sent', $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), TRUE, TRUE)
     ON CONFLICT (message_id) DO NOTHING`,
    [
      info.messageId || null, inReplyTo || null, fromAddr,
      JSON.stringify(toList), fromAddr, subject || '(no subject)',
      (text || '').replace(/\s+/g, ' ').slice(0, 180),
      text || null, html || null,
    ]
  );
  return info;
}
