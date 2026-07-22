// Outbound webhook dispatcher for franchise stores.
//
// Fires events to a store's registered order_webhook_url (see the
// franchise_webhooks_v1 migration). Payloads are JSON, signed with
// HMAC-SHA256(webhook_secret, timestamp + '.' + body). The receiving side
// verifies the signature to trust the sender.
//
// Delivery is best-effort with a bounded retry (3 attempts, exponential
// backoff) on network errors and 5xx responses. 4xx responses stop the
// retry — the store said "no thanks", not "try again". This function
// never throws to the caller; it logs and moves on so an event fire can
// never brick the parent operation (order capture, refund, etc.).

import crypto from 'node:crypto';
import pool from '../db.js';

const MAX_ATTEMPTS = 3;
const TIMEOUT_MS   = 8000;

/** Load webhook config for a store. Returns null if the store has no
 *  webhook configured (that's a valid state — pull-only stores). */
async function loadStoreWebhook(storeId) {
  const { rows } = await pool.query(
    `SELECT order_webhook_url, webhook_secret
       FROM stores
      WHERE id = $1 AND status = 'active'`,
    [storeId],
  );
  const cfg = rows[0];
  if (!cfg?.order_webhook_url || !cfg?.webhook_secret) return null;
  return cfg;
}

function signPayload(secret, timestamp, body) {
  const mac = crypto.createHmac('sha256', secret);
  mac.update(`${timestamp}.${body}`);
  return mac.digest('hex');
}

async function attemptDelivery(url, body, signature, timestamp) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-TSB-Webhook-Signature': signature,
        'X-TSB-Webhook-Timestamp': String(timestamp),
      },
      body,
      signal: controller.signal,
    });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, status: 0, error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Dispatch an event to a store's webhook. Fire-and-forget from the
 * caller's perspective — errors are logged, never re-thrown.
 *
 * @param {number} storeId
 * @param {string} eventType   e.g. 'order.created', 'order.shipped'
 * @param {object} data        event payload; whatever the receiver expects
 */
export async function dispatchStoreEvent(storeId, eventType, data) {
  try {
    const cfg = await loadStoreWebhook(storeId);
    if (!cfg) return; // store opted out of webhooks — nothing to do

    const timestamp = Math.floor(Date.now() / 1000);
    const body = JSON.stringify({
      event: eventType,
      timestamp,
      data,
    });
    const signature = signPayload(cfg.webhook_secret, timestamp, body);

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const result = await attemptDelivery(cfg.order_webhook_url, body, signature, timestamp);
      if (result.ok) return;
      // 4xx from receiver = "don't retry"; only retry on network fail / 5xx.
      const shouldRetry = result.status === 0 || result.status >= 500;
      if (!shouldRetry || attempt === MAX_ATTEMPTS) {
        console.warn(
          `[storeWebhook] ${eventType} store=${storeId} attempt ${attempt}/${MAX_ATTEMPTS} failed:`,
          result.status || result.error,
        );
        return;
      }
      // Backoff: 1s, 3s (before next attempt)
      await new Promise((r) => setTimeout(r, attempt * 2000 - 1000));
    }
  } catch (err) {
    console.error(`[storeWebhook] dispatch failed for ${eventType} store=${storeId}:`, err);
  }
}
