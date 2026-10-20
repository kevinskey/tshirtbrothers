// Email → draft invoice. Turns a customer email sitting in the admin Mail
// inbox (mail_messages) into a DRAFT invoice the admin reviews, prices,
// and sends as the official branded quote — the AI never sets final
// pricing and nothing is emailed to the customer automatically.
//
// Parsing: DeepSeek (same account as routes/deepseek.js) extracts the
// customer identity and requested line items from the email body. When
// the model is unavailable or the body is unparseable we still create the
// draft with the raw email in notes — a blank-but-linked draft beats a
// hard failure, since the admin is editing it either way.

import OpenAI from 'openai';
import pool from '../db.js';
import { generateInvoiceNumber } from '../routes/invoices.js';

const MODEL = 'deepseek-chat';

const SYSTEM_PROMPT = `You turn customer emails sent to a custom-apparel shop (T-Shirt Brothers, Fairburn GA) into structured order drafts.

Return ONLY a JSON object, no markdown fences, with this shape:
{
  "customer_name": string,        // person and/or business, e.g. "James McNair (Herbo LLC)"
  "customer_phone": string|null,  // as written in the email, else null
  "items": [                      // one entry per distinct product/service requested
    {
      "quantity": number,         // best reading of the email; 1 if unstated
      "description": string       // product + decoration + colors/names/placement details, compact but complete
    }
  ],
  "open_questions": [string]      // anything production needs that the email does NOT answer (sizes, counts that conflict, colors, deadlines)
}

Rules:
- NEVER invent prices, products, or quantities not supported by the email.
- If the email's text and its described attachments disagree (e.g. different totals), use the text and add the conflict to open_questions.
- Keep descriptions production-ready: garment, decoration method if stated, placement, per-person breakdowns.
- If the email contains no discernible order, return {"customer_name": null, "items": [], "open_questions": ["No order details found in the email"]}.`;

async function parseWithAi(mail) {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) return null;
  const client = new OpenAI({ baseURL: 'https://api.deepseek.com', apiKey: key });
  const body = (mail.body_text || mail.snippet || '').slice(0, 6000);
  const attachmentNames = (Array.isArray(mail.attachments) ? mail.attachments : [])
    .map((a) => a.filename).filter(Boolean).join(', ');
  const completion = await client.chat.completions.create({
    model: MODEL,
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `From: ${mail.from_name || ''} <${mail.from_addr}>\nSubject: ${mail.subject || '(none)'}\n` +
          (attachmentNames ? `Attachments (images, not readable here): ${attachmentNames}\n` : '') +
          `\n${body}`,
      },
    ],
  });
  try {
    return JSON.parse(completion.choices?.[0]?.message?.content || 'null');
  } catch {
    return null;
  }
}

export async function createDraftInvoiceFromMail(mailId) {
  const { rows } = await pool.query('SELECT * FROM mail_messages WHERE id = $1', [mailId]);
  const mail = rows[0];
  if (!mail) return { error: 'Message not found', status: 404 };
  if (mail.outgoing) return { error: 'Cannot invoice an outgoing message', status: 400 };
  if (!mail.from_addr) return { error: 'Message has no sender address', status: 400 };

  let parsed = null;
  try {
    parsed = await parseWithAi(mail);
  } catch (err) {
    console.error('[mail-to-invoice] AI parse failed:', err.message);
  }

  const items = (parsed?.items || [])
    .filter((it) => it && it.description)
    .slice(0, 25)
    .map((it) => ({
      quantity: Math.max(1, Math.min(10000, parseInt(it.quantity, 10) || 1)),
      unit_price: 0, // pricing is the admin's job — drafts go out only after review
      total: 0,
      description: String(it.description).slice(0, 500),
    }));

  const attachments = Array.isArray(mail.attachments) ? mail.attachments : [];
  const noteLines = [
    `Drafted from email: "${mail.subject || '(no subject)'}" — ${mail.from_name || ''} <${mail.from_addr}>, ` +
      new Date(mail.msg_date || mail.created_at).toLocaleDateString('en-US') + ` (Mail #${mail.id}).`,
  ];
  const questions = (parsed?.open_questions || []).filter((q) => typeof q === 'string').slice(0, 10);
  if (questions.length) {
    noteLines.push('', 'CONFIRM BEFORE PRODUCTION:');
    for (const q of questions) noteLines.push(`- ${q.slice(0, 300)}`);
  }
  if (attachments.length) {
    noteLines.push('', 'Email attachments:');
    for (const a of attachments.slice(0, 10)) noteLines.push(`- ${a.filename}: ${a.url}`);
  }
  if (!items.length) {
    noteLines.push('', '--- ORIGINAL EMAIL (auto-parse found no line items) ---',
      (mail.body_text || '').slice(0, 2000));
  }
  noteLines.push('', 'PRICING NOT SET — review every line before sending.');

  const invoiceNumber = await generateInvoiceNumber();
  const customerName = (parsed?.customer_name || mail.from_name || mail.from_addr).slice(0, 255);
  const ins = await pool.query(
    `INSERT INTO invoices
       (invoice_number, customer_name, customer_email, customer_phone,
        items, subtotal, tax, shipping, discount, total, amount_paid, amount_due,
        notes, status, deposit_percent)
     VALUES ($1,$2,$3,$4,$5,0,0,0,0,0,0,0,$6,'draft',50)
     RETURNING id, invoice_number`,
    [
      invoiceNumber,
      customerName,
      mail.from_addr,
      parsed?.customer_phone ? String(parsed.customer_phone).slice(0, 40) : null,
      JSON.stringify(items),
      noteLines.join('\n'),
    ],
  );
  return { invoice: ins.rows[0], parsed_items: items.length, open_questions: questions };
}
