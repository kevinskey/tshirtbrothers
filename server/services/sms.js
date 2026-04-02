import twilio from 'twilio';

const client = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
  ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;

const FROM_PHONE = process.env.TWILIO_PHONE_NUMBER || '';
const ADMIN_PHONE = process.env.ADMIN_PHONE || '';

async function sendSMS(to, body) {
  if (!client || !FROM_PHONE) {
    console.log('[SMS] Twilio not configured, skipping:', body);
    return null;
  }
  try {
    const message = await client.messages.create({
      body,
      from: FROM_PHONE,
      to,
    });
    console.log(`[SMS] Sent to ${to}: ${message.sid}`);
    return message.sid;
  } catch (err) {
    console.error('[SMS] Failed:', err.message);
    return null;
  }
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
    completed: `Your TShirt Brothers order is complete and ready for pickup/delivery! Contact us at (470) 622-4845.`,
    rejected: `We have an update on your TShirt Brothers quote. Please check your email or call us at (470) 622-4845.`,
  };
  const msg = messages[newStatus];
  if (msg) await sendSMS(phone, msg);
}
