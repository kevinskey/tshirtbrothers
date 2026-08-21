import twilio from 'twilio';

const client = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
  ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;

const FROM_PHONE = process.env.TWILIO_PHONE_NUMBER || '';
const ADMIN_PHONE = process.env.ADMIN_PHONE || '';

// Loose US-formatted numbers get an automatic +1; anything starting with +
// is left alone so international numbers still work.
function toE164(to) {
  const t = String(to).trim();
  return t.startsWith('+') ? t : '+1' + t.replace(/\D/g, '');
}

export async function sendSMS(to, body) {
  if (!client || !FROM_PHONE) {
    console.log('[SMS] Twilio not configured, skipping:', body);
    return null;
  }
  try {
    const message = await client.messages.create({
      body,
      from: FROM_PHONE,
      to: toE164(to),
    });
    console.log(`[SMS] Sent to ${to}: ${message.sid}`);
    return message.sid;
  } catch (err) {
    console.error('[SMS] Failed:', err.message);
    return null;
  }
}

// Same as sendSMS but bubbles up errors instead of swallowing them — used
// by the admin "share mockup" flow where the admin needs to know the SMS
// actually went out.
export async function sendSMSOrThrow(to, body) {
  if (!client || !FROM_PHONE) {
    throw new Error('Twilio not configured (set TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_PHONE_NUMBER).');
  }
  const message = await client.messages.create({
    body,
    from: FROM_PHONE,
    to: toE164(to),
  });
  console.log(`[SMS] Sent to ${to}: ${message.sid}`);
  return message.sid;
}

export async function sendMockupShareSms(phone, mockup, approveUrl, opts = {}) {
  const { message } = opts;
  const productName = mockup.product_name ? ` (${mockup.product_name})` : '';
  const prefix = message ? message.trim() + '\n\n' : '';
  const body = `${prefix}TShirt Brothers: Your mockup${productName} is ready. View & approve: ${approveUrl}`;
  return sendSMSOrThrow(phone, body);
}

// Notify admin of new quote request
export async function smsNewQuoteToAdmin(quote) {
  if (!ADMIN_PHONE) return;
  const msg = `New quote request from ${quote.customer_name || 'Customer'} (${quote.customer_email || ''}).\n\nProduct: ${quote.product_name || 'N/A'}\nQty: ${quote.quantity || 'TBD'}\n\nView in admin: ${process.env.DOMAIN || 'https://tshirtbrothers.com'}/admin`;
  await sendSMS(ADMIN_PHONE, msg);
}

// Notify customer that their quote price is ready
export async function smsQuotePriceToCustomer(quote, total) {
  const phone = quote.customer_phone;
  if (!phone) return;
  const deposit = (total / 2).toFixed(2);
  const msg = `Hi ${quote.customer_name || ''}! Your TShirt Brothers quote is ready.\n\nTotal: $${total.toFixed(2)}\n50% Deposit: $${deposit}\n\nCheck your email for details and to accept.`;
  await sendSMS(phone, msg);
}

// Notify admin that customer accepted
export async function smsQuoteAcceptedToAdmin(quote) {
  if (!ADMIN_PHONE) return;
  const msg = `Quote ACCEPTED by ${quote.customer_name || 'Customer'} (${quote.customer_email || ''}).\n\nProduct: ${quote.product_name || 'N/A'}\n\nDeposit received - ready to begin work!`;
  await sendSMS(ADMIN_PHONE, msg);
}

// Notify customer of status update
export async function smsStatusUpdateToCustomer(quote, newStatus) {
  const phone = quote.customer_phone;
  if (!phone) return;
  const messages = {
    approved: `Great news! Your TShirt Brothers order has been approved and is in production. We'll notify you when it's ready!`,
    awaiting_approval: `Your TShirt Brothers mockup is ready to review — check your email for the approval link. Reply with any changes!`,
    in_production: `Good news! Your artwork is approved and your TShirt Brothers order is on the press. We'll text when it's ready.`,
    ready: `Your TShirt Brothers order is ready! The remaining balance is due — check your email for the payment link. Pickup or delivery?`,
    completed: `Your TShirt Brothers order is complete and ready for pickup/delivery! Contact us at (470) 622-1392.`,
    rejected: `We have an update on your TShirt Brothers quote. Please check your email or call us at (470) 622-1392.`,
  };
  const msg = messages[newStatus];
  if (msg) await sendSMS(phone, msg);
}

// Follow-up: ask the customer to leave a Google review after their order
// is marked completed. Caller is responsible for ensuring this only fires
// once per order (see quotes.review_request_sent_at).
export async function smsReviewRequest(quote) {
  const phone = quote.customer_phone;
  if (!phone) return;
  const placeId = process.env.GOOGLE_PLACE_ID || 'ChIJ1wdXkcfp9IgRuigC9YYhM3I';
  const url = `https://search.google.com/local/writereview?placeid=${placeId}`;
  // Kept to ~2 segments: the review link is the ask that matters, the photo
  // request is the warm close. Anything longer and carriers split it badly.
  const msg = `Thank you for your business! If you loved it, would you take 30 sec to leave us a Google review? ${url} `
    + `And send us a pic of you wearing it — we love seeing it! Thank you for shopping with tshirtbrothers.com (Reply STOP to opt out.)`;
  await sendSMS(phone, msg);
}

/**
 * Same decision, texted to the shop.
 *
 * A rejection is time-critical — the job is stalled until it is redrawn — so
 * it goes to the phone, not just the inbox. The customer's note is truncated
 * rather than dropped: knowing roughly what they want is what decides whether
 * you open the laptop now or after lunch.
 */
export async function smsMockupDecisionToAdmin(mockup, action, note) {
  const to = process.env.ADMIN_SMS_TO || process.env.ADMIN_PHONE;
  if (!to) return;
  const approved = action === 'approved';
  const who = mockup.customer_name || mockup.customer_email || 'A customer';
  const ref = mockup.quote_id ? ` (Quote #${mockup.quote_id})` : '';
  const tail = !approved && note ? ` — "${note.slice(0, 90)}${note.length > 90 ? '…' : ''}"` : '';
  await sendSMS(
    to,
    approved
      ? `✅ ${who} approved the mockup${ref}. Ready for production.`
      : `✏️ ${who} requested changes${ref}${tail}`,
  );
}

/**
 * Deposit landed — tell the customer work has started and what comes next.
 *
 * The receipt email carries the detail; this is the reassurance that the
 * money arrived and someone is now doing something with it. Deliberately
 * names the mockup as the next contact, so an approval email a day later
 * arrives expected instead of looking like a stray marketing send.
 */
export async function smsDepositReceivedToCustomer(quote) {
  const phone = quote.customer_phone;
  if (!phone) return;
  await sendSMS(
    phone,
    `Thanks ${quote.customer_name || ''}! TShirt Brothers got your deposit and work has started. `
    + `Next up: we'll email you a mockup to approve — nothing prints until you say yes. (Reply STOP to opt out.)`,
  );
}

/**
 * Deposit landed — tell the SHOP the next action, not just the fact.
 *
 * smsQuoteAcceptedToAdmin says a quote was accepted, which is also true of a
 * balance payment. This one exists to say the thing that is actually owed:
 * make the mockup.
 */
export async function smsDepositPaidToAdmin(quote) {
  if (!ADMIN_PHONE) return;
  await sendSMS(
    ADMIN_PHONE,
    `\u{1F4B0} Deposit paid on Quote #${quote.id} (${quote.customer_name || 'customer'}). Next: build the mockup and send it for approval.`,
  );
}

// Send a paid-invoice receipt via SMS
export async function smsInvoiceReceiptToCustomer(invoice) {
  const phone = invoice.customer_phone;
  if (!phone) return;
  const domain = process.env.DOMAIN || 'https://tshirtbrothers.com';
  const amount = Number(invoice.amount_paid || invoice.total || 0).toFixed(2);
  const body = `TShirt Brothers: Payment received. Invoice ${invoice.invoice_number} paid in full ($${amount}). View/print: ${domain}/invoice/view/${invoice.id}`;
  await sendSMS(phone, body);
}

// Admin sends an invoice link via SMS on demand (open balance)
export async function smsInvoiceLinkToCustomer(invoice, viewUrl) {
  const phone = invoice.customer_phone;
  if (!phone) return null;
  const amount = Number(invoice.amount_due ?? invoice.total ?? 0).toFixed(2);
  const body = `TShirt Brothers: Invoice ${invoice.invoice_number} for $${amount}. View: ${viewUrl}`;
  return await sendSMS(phone, body);
}
