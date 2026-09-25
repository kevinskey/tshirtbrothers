import { Resend } from 'resend';
import { TIER_PROMISES } from '../routes/gangsheetStore.js';
import * as theme from './emailTheme.js';

const resend = new Resend(process.env.RESEND_API_KEY);
// Compose RFC-5322 "Name <addr>" from FROM_NAME + FROM_EMAIL so inboxes
// show "T-Shirt Brothers" instead of the bare noreply@ address. If the
// env already includes a display name (contains "<"), pass it through.
const FROM_NAME_RAW = process.env.FROM_NAME || 'T-Shirt Brothers';
const FROM_EMAIL_RAW = process.env.FROM_EMAIL || 'noreply@tshirtbrothers.com';
const FROM_EMAIL = FROM_EMAIL_RAW.includes('<') ? FROM_EMAIL_RAW : `${FROM_NAME_RAW} <${FROM_EMAIL_RAW}>`;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'kevin@tshirtbrothers.com';
const DOMAIN = process.env.DOMAIN || 'https://tshirtbrothers.com';

// ── Shared styles ────────────────────────────────────────────────────────────

const BRAND_ORANGE = '#f97316';
const BRAND_DARK = '#111827';
// Same shop address baseLayout() prints in every email's footer — reused
// verbatim in the gang-sheet-order confirmation so a pickup customer sees
// it in the body, not just buried in the footer.
const SHOP_ADDRESS = '6010 Renaissance Parkway, Fairburn, GA 30213';
// Same hours quoted in the AI FAQ knowledge base (server/routes/deepseek.js
// TSB_KNOWLEDGE) — kept in sync so a "ready for pickup" email never
// contradicts what the assistant tells the same customer.
const SHOP_HOURS = '8am–8pm every day except Sunday (closed Sundays)';

function baseLayout(title, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
  <!-- Header -->
  <tr><td style="background:${BRAND_DARK};padding:24px 32px;text-align:center;">
    <img src="https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com/assets/v1/tsb-logo.png" alt="TShirt Brothers" style="height:48px;" />
  </td></tr>
  <!-- Body -->
  <tr><td style="padding:32px;">
    ${bodyHtml}
  </td></tr>
  <!-- Footer -->
  <tr><td style="background:#f9fafb;padding:24px 32px;border-top:1px solid #e5e7eb;">
    <p style="margin:0 0 4px;font-size:13px;color:#6b7280;text-align:center;">T-Shirt Brothers &mdash; Custom Apparel &amp; Screen Printing</p>
    <p style="margin:0 0 4px;font-size:13px;color:#6b7280;text-align:center;">Phone: (470) 622-1392 &bull; Email: info@tshirtbrothers.com</p>
    <p style="margin:0;font-size:13px;color:#9ca3af;text-align:center;">6010 Renaissance Parkway, Fairburn, GA 30213</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

function formatCurrency(amount) {
  return `$${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function detailRow(label, value) {
  return `<tr>
    <td style="padding:8px 12px;font-size:14px;color:#6b7280;border-bottom:1px solid #f3f4f6;width:160px;">${label}</td>
    <td style="padding:8px 12px;font-size:14px;color:${BRAND_DARK};border-bottom:1px solid #f3f4f6;font-weight:500;">${value}</td>
  </tr>`;
}

function detailsTable(rows) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin:16px 0;">
    ${rows}
  </table>`;
}

function primaryButton(text, href) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto;">
    <tr><td style="background:${BRAND_ORANGE};border-radius:8px;">
      <a href="${href}" target="_blank" style="display:inline-block;padding:14px 32px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;">${text}</a>
    </td></tr>
  </table>`;
}

// ── Email functions ──────────────────────────────────────────────────────────

/**
 * Sends notification to admin when a new quote is submitted.
 */
export async function sendQuoteRequestNotification(quote) {
  const sizesDisplay = (() => {
    const s = typeof quote.sizes === 'string' ? JSON.parse(quote.sizes) : quote.sizes;
    if (!s) return 'N/A';
    if (Array.isArray(s)) return s.map(x => typeof x === 'object' ? `${x.size}: ${x.quantity}` : x).join(', ');
    if (typeof s === 'object') return Object.entries(s).filter(([,v]) => v > 0).map(([k,v]) => `${k}: ${v}`).join(', ');
    return String(s);
  })();

  const printAreasDisplay = (() => {
    const pa = typeof quote.print_areas === 'string' ? JSON.parse(quote.print_areas) : quote.print_areas;
    if (Array.isArray(pa)) return pa.join(', ');
    return pa || 'N/A';
  })();

  const body = `
    <h2 style="margin:0 0 8px;font-size:20px;color:${BRAND_DARK};">New Quote Request</h2>
    <p style="margin:0 0 20px;font-size:15px;color:#6b7280;">A new custom printing quote has been submitted.</p>

    ${detailsTable(
      detailRow('Customer', quote.customer_name) +
      detailRow('Email', quote.customer_email) +
      detailRow('Phone', quote.customer_phone || 'N/A') +
      detailRow('Product', quote.product_name || quote.product_id || 'N/A') +
      detailRow('Quantity', quote.quantity) +
      detailRow('Sizes', sizesDisplay) +
      detailRow('Print Areas', printAreasDisplay) +
      detailRow('Design Type', quote.design_type || 'N/A') +
      detailRow('Notes', quote.notes || 'None')
    )}

    ${primaryButton('View in Admin Dashboard', `${DOMAIN}/admin?section=quotes&id=${quote.id}`)}
  `;

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: [ADMIN_EMAIL],
      subject: `New Quote Request from ${quote.customer_name}`,
      html: baseLayout('New Quote Request', body),
    });
    console.log(`[Email] Quote request notification sent for quote from ${quote.customer_name}`);
  } catch (err) {
    console.error('[Email] Failed to send quote request notification:', err);
  }
}

/**
 * Sends the quoted price to the customer.
 */
// Pure HTML builder — exported so admin previews can render it without
// sending. sendQuotePriceToCustomer wraps it.
export async function buildQuoteEmailHtml(quote, priceDetails) {
  const { basePrice, printingCost, designFee, rushFee, shipping, tax, taxExempt, taxRate, total, message, discountPct, discountReason, discountAmount } = priceDetails;
  const deposit = (Number(total) * 0.5).toFixed(2);

  const sizesDisplay = (() => {
    const s = typeof quote.sizes === 'string' ? JSON.parse(quote.sizes) : quote.sizes;
    if (!s) return 'N/A';
    if (Array.isArray(s)) return s.map(x => typeof x === 'object' ? `${x.size}: ${x.quantity}` : x).join(', ');
    if (typeof s === 'object') return Object.entries(s).filter(([,v]) => v > 0).map(([k,v]) => `${k}: ${v}`).join(', ');
    return String(s);
  })();

  const printAreasDisplay = (() => {
    const pa = typeof quote.print_areas === 'string' ? JSON.parse(quote.print_areas) : quote.print_areas;
    if (Array.isArray(pa)) return pa.join(', ');
    return pa || 'N/A';
  })();

  // Payment link goes to a page that creates a Stripe Checkout session
  const acceptUrl = `${DOMAIN}/payment/checkout?quote=${quote.id}&token=${quote.accept_token}`;
  const declineUrl = `${DOMAIN}/quote/decline/${quote.id}?token=${quote.accept_token}`;

  const taxLabel = taxRate ? `Sales Tax (${(Number(taxRate) * 100).toFixed(2)}%)` : 'Sales Tax';
  const priceRows =
    detailRow('Base Price (apparel)', formatCurrency(basePrice)) +
    detailRow('Printing Cost', formatCurrency(printingCost)) +
    (Number(designFee) > 0 ? detailRow('Design Fee', formatCurrency(designFee)) : '') +
    (Number(rushFee) > 0 ? detailRow('Rush Fee', formatCurrency(rushFee)) : '') +
    (Number(discountAmount) > 0 ? detailRow(
      `${escapeHtml(discountReason || 'Discount')} (${Number(discountPct) || 0}% off)`,
      `<span style="color:#16a34a;font-weight:700;">&minus;${formatCurrency(discountAmount)}</span>`) : '') +
    (Number(shipping) > 0 ? detailRow('Shipping', formatCurrency(shipping)) : '') +
    (taxExempt ? detailRow('Sales Tax', 'Exempt') : (Number(tax) > 0 ? detailRow(taxLabel, formatCurrency(tax)) : '')) +
    `<tr>
      <td style="padding:10px 12px;font-size:15px;color:${BRAND_DARK};font-weight:700;">Total</td>
      <td style="padding:10px 12px;font-size:15px;color:${BRAND_ORANGE};font-weight:700;">${formatCurrency(total)}</td>
    </tr>`;

  // 2026-09 branded redesign — same data, links, and pricing as before,
  // rendered with the shared theme (see emailTheme.js).
  const promo = await theme.getActivePromotion();
  const summaryRows = [
    { label: 'Base Price (apparel)', value: formatCurrency(basePrice) },
    { label: 'Printing Cost', value: formatCurrency(printingCost) },
    Number(designFee) > 0 ? { label: 'Design / Setup Fee', value: formatCurrency(designFee) } : null,
    Number(rushFee) > 0 ? { label: 'Rush Fee', value: formatCurrency(rushFee) } : null,
    Number(discountAmount) > 0 ? {
      label: `${escapeHtml(discountReason || 'Discount')} (${Number(discountPct) || 0}% off)`,
      value: `&minus;${formatCurrency(discountAmount)}`, color: '#16a34a', bold: true,
    } : null,
    Number(shipping) > 0 ? { label: 'Shipping', value: formatCurrency(shipping) } : null,
    taxExempt
      ? { label: 'Sales Tax', value: 'Exempt' }
      : (Number(tax) > 0 ? { label: taxRate ? `Sales Tax (${(Number(taxRate) * 100).toFixed(2)}%)` : 'Sales Tax', value: formatCurrency(tax) } : null),
  ];
  const shipAddr = typeof quote.shipping_address === 'string'
    ? (() => { try { return JSON.parse(quote.shipping_address); } catch { return null; } })()
    : quote.shipping_address;
  const shipLines = shipAddr
    ? [shipAddr.name, shipAddr.street, [shipAddr.city, shipAddr.state, shipAddr.zip].filter(Boolean).join(', ')].filter(Boolean).map(escapeHtml)
    : [];
  const html = theme.emailShell({
    title: 'Your Quote — T-Shirt Brothers',
    headerTr: theme.docHeader({
      metaLines: [
        `Quote <strong style="color:${BRAND_DARK};">#TSB-${quote.id}</strong>`,
        theme.fmtDate(quote.created_at || new Date()),
      ],
      pill: theme.statusPill('Quote Ready'),
    }),
    sections: [
      theme.hero({
        titleTop: 'Your Custom Apparel Quote',
        titleAccent: 'is Ready!',
        greeting: `Hi ${quote.customer_name || 'there'},`,
        copy: 'Thanks for choosing T-Shirt Brothers! Your custom apparel quote is ready for review. We&rsquo;re excited about the opportunity to bring your ideas to life.',
      }),
      theme.bodySection(`
        ${message ? `<div style="background:#f0fdf4;border-left:4px solid #22c55e;padding:12px 16px;border-radius:0 8px 8px 0;margin-bottom:20px;">
          <p style="margin:0;font-size:14px;color:#166534;">${message}</p>
        </div>` : ''}
        ${theme.sectionTitle('Quote Details')}
        ${theme.infoPanels([
          { label: 'Customer', lines: [escapeHtml(quote.customer_name || ''), escapeHtml(quote.customer_email || ''), escapeHtml(quote.customer_phone || '')] },
          { label: 'Quote Date', lines: [theme.fmtDate(quote.created_at || new Date())] },
          quote.date_needed ? { label: 'Needed By', lines: [theme.fmtDate(quote.date_needed)] } : null,
          { label: 'Shipping / Pickup', lines: [
            quote.shipping_method === 'pickup' ? 'Pickup at our shop'
            : quote.shipping_method === 'shipping' ? 'Shipping'
            : escapeHtml(String(quote.shipping_method || 'Pickup').replace(/^./, (c) => c.toUpperCase())),
          ] },
          shipLines.length ? { label: 'Shipping Address', lines: shipLines } : null,
          { label: 'Print Areas', lines: [escapeHtml(printAreasDisplay)] },
        ].filter(Boolean))}
      `),
      quote.design_url ? theme.bodySection(`
        <div style="text-align:center;">
          <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:${BRAND_DARK};">Your Design</p>
          <img src="${quote.design_url}" alt="Your custom design" style="max-width:280px;width:100%;border-radius:12px;border:1px solid #e5e7eb;" />
        </div>
      `) : '',
      theme.bodySection(`
        ${theme.sectionTitle('Order Items')}
        ${theme.itemsTable([{
          img: quote.design_url || null,
          name: quote.product_name || 'Custom Apparel',
          detail: quote.design_type ? `Decoration: ${quote.design_type}` : '',
          color: quote.color || '—',
          size: /,/.test(sizesDisplay) ? 'Multi' : sizesDisplay,
          qty: quote.quantity,
          // Product line = apparel + printing; fees/tax/shipping stay in the
          // summary so nothing is double-counted or recalculated.
          unit: Number(quote.quantity) > 0 ? (Number(basePrice) + Number(printingCost)) / Number(quote.quantity) : Number(basePrice) + Number(printingCost),
          subtotal: Number(basePrice) + Number(printingCost),
        }], { unitLabel: 'Unit Price' })}
        <p style="margin:8px 0 0;font-size:12px;color:#6b7280;"><strong>Size breakdown:</strong> ${escapeHtml(sizesDisplay)}</p>
      `),
      theme.bodySection(`
        ${theme.sectionTitle('Pricing Summary')}
        ${theme.summaryTable(summaryRows, { label: 'Grand Total (USD)', value: formatCurrency(total) })}
        <div style="background:#fef3c7;border-radius:10px;padding:14px;margin-top:14px;text-align:center;">
          <span style="font-size:14px;font-weight:700;color:#92400e;">50% Deposit Required to Begin — due upon receipt:</span>
          <span style="font-size:18px;font-weight:800;color:${BRAND_DARK};"> ${formatCurrency(deposit)}</span>
        </div>
      `),
      promo ? theme.bodySection(theme.couponPanel(promo)) : '',
      theme.bodySection(`
        ${theme.buttonRow([
          { label: '&#10003;&nbsp; Approve &amp; Pay Deposit', href: acceptUrl, style: 'primary' },
          { label: '&#63;&nbsp; Ask a Question', href: `mailto:${theme.SHOP_EMAIL}?subject=Question%20about%20Quote%20%23TSB-${quote.id}`, style: 'outline' },
        ])}
        <p style="text-align:center;margin:10px 0 0;">
          <a href="${declineUrl}" style="color:#6b7280;font-size:13px;text-decoration:underline;">Decline this quote</a>
        </p>
        <p style="margin:18px 0 20px;font-size:13px;color:#9ca3af;text-align:center;">This quote is valid for 30 days. We appreciate the opportunity to work with you — questions or changes? Just reply to this email. &mdash; The T-Shirt Brothers Team</p>
      `),
    ].filter(Boolean),
  });

  return html;
}

export async function sendQuotePriceToCustomer(quote, priceDetails) {
  const html = await buildQuoteEmailHtml(quote, priceDetails);
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: [quote.customer_email],
      subject: 'Your Custom Printing Quote from TShirt Brothers',
      html,
    });
    console.log(`[Email] Price quote sent to ${quote.customer_email}`);
  } catch (err) {
    console.error('[Email] Failed to send price quote:', err);
  }
}

/**
 * Sends notification to admin when customer accepts a quote.
 */
export async function sendQuoteAcceptedNotification(quote) {
  const deposit = quote.deposit_amount
    ? formatCurrency(quote.deposit_amount)
    : formatCurrency(Number(quote.estimated_price || 0) * 0.5);

  const body = `
    <h2 style="margin:0 0 8px;font-size:20px;color:#16a34a;">Quote Accepted!</h2>
    <p style="margin:0 0 20px;font-size:15px;color:#6b7280;">A customer has accepted their quote and a deposit is expected.</p>

    ${detailsTable(
      detailRow('Customer', quote.customer_name) +
      detailRow('Email', quote.customer_email) +
      detailRow('Phone', quote.customer_phone || 'N/A') +
      detailRow('Product', quote.product_name || 'Custom Apparel') +
      detailRow('Quantity', quote.quantity) +
      detailRow('Total Price', quote.estimated_price ? formatCurrency(quote.estimated_price) : 'N/A') +
      detailRow('Deposit Amount', deposit)
    )}

    ${primaryButton('View in Admin Dashboard', `${DOMAIN}/admin?section=quotes&id=${quote.id}`)}
  `;

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: [ADMIN_EMAIL],
      subject: `Quote Accepted! ${quote.customer_name} - Deposit Received`,
      html: baseLayout('Quote Accepted', body),
    });
    console.log(`[Email] Quote accepted notification sent for ${quote.customer_name}`);
  } catch (err) {
    console.error('[Email] Failed to send quote accepted notification:', err);
  }
}

// Customer-facing deposit receipt — fired right after the deposit webhook
// clears. Confirms the deposit, shows the balance still due, and gives the
// customer a permanent link they can come back to and pay the balance
// without waiting for the admin to send a reminder. This closes the gap
// where the deposit webhook only emailed the admin and the customer had
// no path to settle the rest of the order.
export async function sendDepositReceiptToCustomer(quote) {
  const total = Number(quote.estimated_price || 0);
  const depositPaid = Number(quote.deposit_amount || 0);
  const balanceDue = Math.max(0, total - depositPaid);
  const payBalanceUrl = `${DOMAIN}/payment/checkout?quote=${quote.id}&token=${quote.accept_token || ''}&type=balance`;
  const es = quoteLang(quote) === 'es';

  const bodyEs = `
    <h2 style="margin:0 0 8px;font-size:20px;color:#16a34a;">Depósito Recibido ✓</h2>
    <p style="margin:0 0 4px;font-size:15px;color:#6b7280;">Hola ${quote.customer_name || ''},</p>
    <p style="margin:0 0 16px;font-size:15px;color:#6b7280;">¡Gracias por tu pedido! Recibimos tu depósito y el trabajo ya comenzó oficialmente.</p>

    <div style="margin:0 0 20px;padding:14px 16px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;">
      <p style="margin:0 0 10px;font-size:13px;font-weight:700;color:${BRAND_DARK};text-transform:uppercase;letter-spacing:0.04em;">Qué sigue</p>
      <p style="margin:0 0 6px;font-size:14px;color:#374151;"><strong>1. Preparamos tu diseño de muestra.</strong> Nuestro equipo de arte coloca tu diseño en la prenda.</p>
      <p style="margin:0 0 6px;font-size:14px;color:#374151;"><strong>2. Tú lo apruebas.</strong> Te lo enviamos por correo — no imprimimos nada hasta que digas que sí. Pide cambios y lo ajustamos.</p>
      <p style="margin:0 0 6px;font-size:14px;color:#374151;"><strong>3. Imprimimos.</strong> Una vez aprobado, tu pedido entra a producción.</p>
      <p style="margin:0;font-size:14px;color:#374151;"><strong>4. Recogida o entrega.</strong> Te avisaremos en cuanto esté listo y ahí se paga el saldo restante.</p>
    </div>

    <p style="margin:0 0 20px;font-size:15px;color:#6b7280;">Aquí están tus totales — guarda este correo para pagar el saldo restante cuando estés listo.</p>

    ${detailsTable(
      detailRow('Pedido', `#${quote.id}`) +
      detailRow('Producto', quote.product_name || 'Ropa Personalizada') +
      detailRow('Cantidad', String(quote.quantity || 'N/A')) +
      detailRow('Total del Pedido', formatCurrency(total)) +
      detailRow('Depósito Pagado', '<span style="color:#16a34a;font-weight:700;">' + formatCurrency(depositPaid) + '</span>') +
      `<tr>
        <td style="padding:10px 12px;font-size:15px;color:${BRAND_DARK};font-weight:700;">Saldo Restante</td>
        <td style="padding:10px 12px;font-size:15px;color:${BRAND_ORANGE};font-weight:700;">${formatCurrency(balanceDue)}</td>
      </tr>`
    )}

    ${balanceDue > 0 ? primaryButton('Pagar Saldo Restante', payBalanceUrl) : ''}

    <p style="margin:24px 0 8px;font-size:13px;color:#6b7280;text-align:center;">Sin prisa — el saldo se paga cuando tu pedido esté listo. Pronto recibirás tu diseño de muestra.</p>
    <p style="margin:0;font-size:13px;color:#9ca3af;text-align:center;">¿Preguntas? Responde a este correo o llámanos al (470) 622-1392. Hablamos español.</p>
  `;

  if (es) {
    try {
      await resend.emails.send({
        from: FROM_EMAIL,
        to: [quote.customer_email],
        subject: `Depósito recibido — Confirmación del pedido #${quote.id}`,
        html: baseLayout('Depósito Recibido', bodyEs),
      });
      console.log(`[Email] Deposit receipt (es) sent to ${quote.customer_email}`);
    } catch (err) {
      console.error('[Email] Failed to send deposit receipt:', err);
    }
    return;
  }

  const body = `
    <h2 style="margin:0 0 8px;font-size:20px;color:#16a34a;">Deposit Received ✓</h2>
    <p style="margin:0 0 4px;font-size:15px;color:#6b7280;">Hi ${quote.customer_name || 'there'},</p>
    <p style="margin:0 0 16px;font-size:15px;color:#6b7280;">Thanks for your order! We've received your deposit and work has officially begun.</p>

    <div style="margin:0 0 20px;padding:14px 16px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;">
      <p style="margin:0 0 10px;font-size:13px;font-weight:700;color:${BRAND_DARK};text-transform:uppercase;letter-spacing:0.04em;">What happens next</p>
      <p style="margin:0 0 6px;font-size:14px;color:#374151;"><strong>1. We make your mockup.</strong> Our art team lays out your design on the garment.</p>
      <p style="margin:0 0 6px;font-size:14px;color:#374151;"><strong>2. You approve it.</strong> We email it over — nothing goes on the press until you say yes. Ask for changes and we'll redraw it.</p>
      <p style="margin:0 0 6px;font-size:14px;color:#374151;"><strong>3. We print.</strong> Once approved, your order goes into production.</p>
      <p style="margin:0;font-size:14px;color:#374151;"><strong>4. Pickup or delivery.</strong> We'll let you know the moment it's ready and settle the balance then.</p>
    </div>

    <p style="margin:0 0 20px;font-size:15px;color:#6b7280;">Below are your totals — save this email so you can pay the remaining balance whenever you're ready.</p>

    ${detailsTable(
      detailRow('Order', `#${quote.id}`) +
      detailRow('Product', quote.product_name || 'Custom Apparel') +
      detailRow('Quantity', String(quote.quantity || 'N/A')) +
      detailRow('Order Total', formatCurrency(total)) +
      detailRow('Deposit Paid', '<span style="color:#16a34a;font-weight:700;">' + formatCurrency(depositPaid) + '</span>') +
      `<tr>
        <td style="padding:10px 12px;font-size:15px;color:${BRAND_DARK};font-weight:700;">Balance Remaining</td>
        <td style="padding:10px 12px;font-size:15px;color:${BRAND_ORANGE};font-weight:700;">${formatCurrency(balanceDue)}</td>
      </tr>`
    )}

    ${balanceDue > 0 ? primaryButton('Pay Remaining Balance', payBalanceUrl) : ''}

    <p style="margin:24px 0 8px;font-size:13px;color:#6b7280;text-align:center;">No rush — the balance isn't due until your order is ready. Watch for your mockup; that's the next thing you'll hear from us.</p>
    <p style="margin:0;font-size:13px;color:#9ca3af;text-align:center;">Questions? Reply to this email or call us at (470) 622-1392.</p>
  `;

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: [quote.customer_email],
      subject: `Deposit received — Order #${quote.id} confirmation`,
      html: baseLayout('Deposit Received', body),
    });
    console.log(`[Email] Deposit receipt sent to ${quote.customer_email}`);
  } catch (err) {
    console.error('[Email] Failed to send deposit receipt:', err);
  }
}

/**
 * Sends status update email to customer.
 */
export async function sendQuoteStatusUpdate(quote, newStatus) {
  const es = quoteLang(quote) === 'es';

  const subjectMap = es ? {
    approved: 'Tu Cotización Fue Aprobada - TShirt Brothers',
    in_production: 'Tu Pedido Está En Producción - TShirt Brothers',
    ready: 'Tu Pedido Está Listo — Saldo Pendiente - TShirt Brothers',
    completed: '¡Tu Pedido Está Listo! - TShirt Brothers',
    rejected: 'Actualización de Tu Cotización - TShirt Brothers',
  } : {
    approved: 'Your Quote Has Been Approved - TShirt Brothers',
    in_production: 'Your Order Is In Production - TShirt Brothers',
    ready: 'Your Order Is Ready — Balance Due - TShirt Brothers',
    completed: 'Your Order Is Ready! - TShirt Brothers',
    rejected: 'Update on Your Quote Request - TShirt Brothers',
  };

  const headingMap = es ? {
    approved: 'Tu Cotización Fue Aprobada',
    in_production: 'Tu Pedido Está En Producción',
    ready: 'Tu Pedido Está Listo',
    completed: '¡Tu Pedido Está Listo!',
    rejected: 'Actualización de Tu Cotización',
  } : {
    approved: 'Your Quote Has Been Approved',
    in_production: 'Your Order Is In Production',
    ready: 'Your Order Is Ready',
    completed: 'Your Order Is Ready!',
    rejected: 'Update on Your Quote Request',
  };

  const messageMap = es ? {
    approved: `<p style="margin:0 0 16px;font-size:15px;color:#6b7280;">¡Buenas noticias! Tu cotización de impresión personalizada fue aprobada. Estamos listos para comenzar en cuanto recibamos tu depósito.</p>`,
    in_production: `<p style="margin:0 0 16px;font-size:15px;color:#6b7280;">Tu diseño fue aprobado y tu pedido está en la prensa. Te avisaremos en cuanto esté listo.</p>`,
    ready: `<p style="margin:0 0 16px;font-size:15px;color:#6b7280;">Tu pedido está terminado y quedó excelente. Para entregarlo se debe pagar el saldo restante — encontrarás el enlace de pago en el correo aparte que te acabamos de enviar. Responde y dinos si prefieres <strong>recogerlo</strong> o que te lo <strong>entreguemos</strong>.</p>`,
    completed: `<p style="margin:0 0 16px;font-size:15px;color:#6b7280;">¡Tu pedido está completo y listo para recoger o enviar! Esperamos que te encante el producto terminado.</p>`,
    rejected: `<p style="margin:0 0 16px;font-size:15px;color:#6b7280;">Lamentablemente no pudimos completar tu solicitud de cotización esta vez. No dudes en escribirnos si tienes preguntas o quieres enviar una nueva solicitud.</p>`,
  } : {
    approved: `<p style="margin:0 0 16px;font-size:15px;color:#6b7280;">Great news! Your custom printing quote has been approved. We're ready to get started as soon as we receive your deposit.</p>`,
    in_production: `<p style="margin:0 0 16px;font-size:15px;color:#6b7280;">Your artwork is approved and your order is on the press. We'll let you know the moment it's ready.</p>`,
    ready: `<p style="margin:0 0 16px;font-size:15px;color:#6b7280;">Your order is finished and looking great. The remaining balance is due to release it — you'll find a payment link in the separate email we just sent. Just reply and let us know whether you'd like to <strong>pick it up</strong> or have us <strong>deliver</strong> it.</p>`,
    completed: `<p style="margin:0 0 16px;font-size:15px;color:#6b7280;">Your order is complete and ready for pickup or shipping! We hope you love the finished product.</p>`,
    rejected: `<p style="margin:0 0 16px;font-size:15px;color:#6b7280;">Unfortunately, we were unable to fulfill your quote request at this time. Please feel free to reach out if you have any questions or would like to submit a new request.</p>`,
  };

  const subject = subjectMap[newStatus] || (es ? 'Actualización de Cotización - TShirt Brothers' : `Quote Update - TShirt Brothers`);
  const heading = headingMap[newStatus] || (es ? 'Actualización de Estado' : 'Quote Status Update');
  const statusMessage = messageMap[newStatus] || `<p style="margin:0 0 16px;font-size:15px;color:#6b7280;">${es ? 'El estado de tu cotización cambió a' : 'Your quote status has been updated to'}: <strong>${newStatus}</strong>.</p>`;

  const body = `
    <h2 style="margin:0 0 8px;font-size:20px;color:${BRAND_DARK};">${heading}</h2>
    <p style="margin:0 0 16px;font-size:15px;color:#6b7280;">${es ? 'Hola' : 'Hi'} ${quote.customer_name},</p>
    ${statusMessage}

    ${detailsTable(
      detailRow(es ? 'Producto' : 'Product', quote.product_name || (es ? 'Ropa Personalizada' : 'Custom Apparel')) +
      detailRow(es ? 'Cantidad' : 'Quantity', quote.quantity) +
      (quote.estimated_price ? detailRow('Total', formatCurrency(quote.estimated_price)) : '') +
      detailRow(es ? 'Estado' : 'Status', newStatus.charAt(0).toUpperCase() + newStatus.slice(1))
    )}

    ${newStatus === 'completed'
      ? `<p style="margin:16px 0 0;font-size:15px;color:#6b7280;text-align:center;">${es ? '¡Gracias por elegir T-Shirt Brothers!' : 'Thank you for choosing T-Shirt Brothers!'}</p>`
      : primaryButton(es ? 'Contáctanos' : 'Contact Us', `mailto:info@tshirtbrothers.com`)
    }
  `;

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: [quote.customer_email],
      subject,
      html: baseLayout(heading, body),
    });
    console.log(`[Email] Status update (${newStatus}) sent to ${quote.customer_email}`);
  } catch (err) {
    console.error('[Email] Failed to send status update:', err);
  }
}

/**
 * Sends an "are you still interested?" follow-up for quotes that were
 * saved but never locked in. Caller (job in services/scheduler.js)
 * checks follow_up_sent_at before invoking.
 */
export async function sendAbandonedQuoteFollowUp(quote) {
  const es = quoteLang(quote) === 'es';
  const lockInUrl = `${DOMAIN}/quote?id=${quote.id}&token=${quote.accept_token || ''}`;
  const total = quote.estimated_price ? formatCurrency(Number(quote.estimated_price)) : null;
  const body = es ? `
    <h2 style="margin:0 0 8px;font-size:22px;color:${BRAND_DARK};">¿Todavía lo estás pensando?</h2>
    <p style="margin:0 0 16px;font-size:15px;color:#6b7280;">Hola ${quote.customer_name || ''},</p>
    <p style="margin:0 0 16px;font-size:15px;color:#6b7280;">Guardamos la cotización que comenzaste ayer. Cuando estés listo, puedes retomarla — o ajustar el diseño, la cantidad o los colores y ver el precio actualizarse al instante.</p>
    ${total ? detailsTable(
      detailRow('Producto', quote.product_name || 'Ropa Personalizada') +
      detailRow('Cantidad', quote.quantity) +
      detailRow('Total Estimado', total)
    ) : ''}
    ${primaryButton('Abrir Mi Cotización', lockInUrl)}
    <p style="margin:24px 0 0;font-size:13px;color:#9ca3af;text-align:center;">¿Preguntas? Responde a este correo o llámanos al (470) 622-1392. Hablamos español. — Kevin</p>
  ` : `
    <h2 style="margin:0 0 8px;font-size:22px;color:${BRAND_DARK};">Still thinking it over?</h2>
    <p style="margin:0 0 16px;font-size:15px;color:#6b7280;">Hi ${quote.customer_name || 'there'},</p>
    <p style="margin:0 0 16px;font-size:15px;color:#6b7280;">We saved the custom-print quote you started yesterday. Whenever you're ready, you can pick it back up — or tweak the design, quantity, or colors and watch the price update live.</p>
    ${total ? detailsTable(
      detailRow('Product', quote.product_name || 'Custom Apparel') +
      detailRow('Quantity', quote.quantity) +
      detailRow('Estimated Total', total)
    ) : ''}
    ${primaryButton('Open My Quote', lockInUrl)}
    <p style="margin:24px 0 0;font-size:13px;color:#9ca3af;text-align:center;">Questions? Reply to this email or call us at (470) 622-1392. — Kevin</p>
  `;
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: [quote.customer_email],
      subject: es
        ? 'Tu cotización de TShirt Brothers está guardada · Cuando estés listo'
        : 'Your TShirt Brothers quote is saved · Ready when you are',
      html: baseLayout(es ? 'Cotización Guardada' : 'Quote Saved', body),
    });
    console.log(`[Email] Abandoned-quote follow-up sent to ${quote.customer_email}`);
  } catch (err) {
    console.error('[Email] Failed to send abandoned-quote follow-up:', err);
  }
}

/**
 * Sends a "leave us a Google review" follow-up email when an order is
 * marked completed. Designed to fire ONCE per quote — caller checks the
 * review_request_sent_at column before invoking.
 */
export async function sendReviewRequestEmail(quote) {
  const placeId = process.env.GOOGLE_PLACE_ID || 'ChIJ1wdXkcfp9IgRuigC9YYhM3I';
  const reviewUrl = `https://search.google.com/local/writereview?placeid=${placeId}`;
  const es = quoteLang(quote) === 'es';
  if (es) {
    const bodyEs = `
      <h2 style="margin:0 0 8px;font-size:22px;color:${BRAND_DARK};">¿Te encantó tu pedido? ¡Cuéntaselo a Google! ⭐⭐⭐⭐⭐</h2>
      <p style="margin:0 0 16px;font-size:15px;color:#6b7280;">Hola ${quote.customer_name || ''},</p>
      <p style="margin:0 0 16px;font-size:15px;color:#6b7280;">Muchas gracias por tu compra — de verdad apreciamos que nos hayas elegido.</p>
      <p style="margin:0 0 16px;font-size:15px;color:#6b7280;">Ahora que tienes tu pedido en tus manos, ¿nos regalas 30 segundos para dejarnos una reseña en Google? Es lo más útil que puedes hacer por un negocio pequeño — y ayuda a que más gente en Atlanta nos encuentre.</p>
      ${primaryButton('Dejar una Reseña en Google ⭐', reviewUrl)}
      <p style="margin:20px 0 0;font-size:15px;color:#6b7280;">Y una cosa más — ¡tómate una foto usándolo y envíanosla! Nos encanta ver nuestro trabajo por el mundo. 📸</p>
      <p style="margin:16px 0 0;font-size:15px;color:${BRAND_DARK};font-weight:600;">Gracias por comprar en tshirtbrothers.com</p>
      <p style="margin:24px 0 0;font-size:13px;color:#9ca3af;text-align:center;">¿No quedaste satisfecho con tu pedido? Responde a este correo y lo arreglamos. — Kevin</p>
    `;
    try {
      await resend.emails.send({
        from: FROM_EMAIL,
        to: [quote.customer_email],
        subject: 'Un favor rápido — ¿una reseña de 30 segundos en Google? · TShirt Brothers',
        html: baseLayout('Déjanos una Reseña', bodyEs),
      });
      console.log(`[Email] Review request (es) sent to ${quote.customer_email}`);
    } catch (err) {
      console.error('[Email] Failed to send review request:', err);
    }
    return;
  }
  const body = `
    <h2 style="margin:0 0 8px;font-size:22px;color:${BRAND_DARK};">Loved your order? Tell Google! ⭐⭐⭐⭐⭐</h2>
    <p style="margin:0 0 16px;font-size:15px;color:#6b7280;">Hi ${quote.customer_name || 'there'},</p>
    <p style="margin:0 0 16px;font-size:15px;color:#6b7280;">Thank you so much for your business — we truly appreciate you choosing us.</p>
    <p style="margin:0 0 16px;font-size:15px;color:#6b7280;">Now that your order is in your hands, would you take 30 seconds to leave us a quick Google review? It's the single most helpful thing you can do for a small business — and it helps other folks in Atlanta find us.</p>
    ${primaryButton('Leave a Google Review ⭐', reviewUrl)}
    <p style="margin:20px 0 0;font-size:15px;color:#6b7280;">And one more thing — snap a picture of yourself wearing it and send it our way! We love seeing our work out in the world. 📸</p>
    <p style="margin:16px 0 0;font-size:15px;color:${BRAND_DARK};font-weight:600;">Thank you for shopping with tshirtbrothers.com</p>
    <p style="margin:24px 0 0;font-size:13px;color:#9ca3af;text-align:center;">Not happy with your order? Just reply to this email and we'll make it right. — Kevin</p>
  `;
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: [quote.customer_email],
      subject: 'Quick favor — 30-second Google review? · TShirt Brothers',
      html: baseLayout('Leave Us a Review', body),
    });
    console.log(`[Email] Review request sent to ${quote.customer_email}`);
  } catch (err) {
    console.error('[Email] Failed to send review request:', err);
  }
}

/**
 * Sends balance payment request to customer.
 */
export async function sendBalanceDueToCustomer(quote, { total, depositPaid, balanceDue }) {
  const payUrl = `${DOMAIN}/payment/checkout?quote=${quote.id}&token=${quote.accept_token}&type=balance`;
  const es = quoteLang(quote) === 'es';
  if (es) {
    const bodyEs = `
      <h2 style="margin:0 0 8px;font-size:20px;color:${BRAND_DARK};">Saldo Restante Pendiente</h2>
      <p style="margin:0 0 4px;font-size:15px;color:#6b7280;">Hola ${quote.customer_name},</p>
      <p style="margin:0 0 20px;font-size:15px;color:#6b7280;">¡Gracias por tu depósito! Tu pedido está en proceso. Por favor paga el saldo restante para completar tu pedido.</p>

      ${detailsTable(
        detailRow('Producto', quote.product_name || 'Ropa Personalizada') +
        detailRow('Cantidad', String(quote.quantity)) +
        detailRow('Total del Pedido', formatCurrency(total)) +
        detailRow('Depósito Pagado', '<span style="color:#16a34a;font-weight:700;">' + formatCurrency(depositPaid) + '</span>') +
        `<tr>
          <td style="padding:10px 12px;font-size:15px;color:${BRAND_DARK};font-weight:700;">Saldo Pendiente</td>
          <td style="padding:10px 12px;font-size:15px;color:${BRAND_ORANGE};font-weight:700;">${formatCurrency(balanceDue)}</td>
        </tr>`
      )}

      ${primaryButton('Pagar Saldo Restante', payUrl)}

      <p style="margin:24px 0 0;font-size:13px;color:#9ca3af;text-align:center;">¿Preguntas? Responde a este correo o llámanos al (470) 622-1392. Hablamos español.</p>
    `;
    try {
      await resend.emails.send({
        from: FROM_EMAIL,
        to: [quote.customer_email],
        subject: `Saldo pendiente — Pedido #${quote.id} · TShirt Brothers`,
        html: baseLayout('Saldo Pendiente', bodyEs),
      });
      console.log(`[Email] Balance due (es) sent to ${quote.customer_email}`);
    } catch (err) {
      console.error('[Email] Failed to send balance due email:', err);
    }
    return;
  }

  const body = `
    <h2 style="margin:0 0 8px;font-size:20px;color:${BRAND_DARK};">Remaining Balance Due</h2>
    <p style="margin:0 0 4px;font-size:15px;color:#6b7280;">Hi ${quote.customer_name},</p>
    <p style="margin:0 0 20px;font-size:15px;color:#6b7280;">Thank you for your deposit! Your order is in progress. Please pay the remaining balance to complete your order.</p>

    ${detailsTable(
      detailRow('Product', quote.product_name || 'Custom Apparel') +
      detailRow('Quantity', String(quote.quantity)) +
      detailRow('Order Total', formatCurrency(total)) +
      detailRow('Deposit Paid', '<span style="color:#16a34a;font-weight:700;">' + formatCurrency(depositPaid) + '</span>') +
      `<tr>
        <td style="padding:10px 12px;font-size:15px;color:${BRAND_DARK};font-weight:700;">Balance Due</td>
        <td style="padding:10px 12px;font-size:15px;color:${BRAND_ORANGE};font-weight:700;">${formatCurrency(balanceDue)}</td>
      </tr>`
    )}

    ${primaryButton('Pay Remaining Balance', payUrl)}

    <p style="margin:24px 0 0;font-size:13px;color:#9ca3af;text-align:center;">If you have questions, reply to this email or call us at (470) 622-1392.</p>
  `;

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: [quote.customer_email],
      subject: 'Balance Due - TShirt Brothers Order #' + quote.id,
      html: baseLayout('Balance Due', body),
    });
    console.log('[Email] Balance due sent to ' + quote.customer_email);
  } catch (err) {
    console.error('[Email] Failed to send balance due:', err);
  }
}

// Informational update — used when the admin edits a quote after the deposit
// has been paid (added a print location, a product, switched to rush, etc.).
// Tells the customer the new total + remaining balance, but the balance is
// NOT charged now; it gets collected when the order is ready to ship.
export async function sendQuoteUpdatedToCustomer(quote, { total, depositPaid, balanceDue, adminNote }) {
  const body = `
    <h2 style="margin:0 0 8px;font-size:20px;color:${BRAND_DARK};">Your order has been updated</h2>
    <p style="margin:0 0 4px;font-size:15px;color:#6b7280;">Hi ${quote.customer_name || ''},</p>
    <p style="margin:0 0 20px;font-size:15px;color:#6b7280;">We've adjusted the details on your order. Here are the new totals. <strong>No action is needed right now</strong> — the remaining balance will be due when your order is ready to ship, and we'll email you a payment link then.</p>

    ${adminNote ? `<div style="margin:0 0 20px;padding:14px 16px;background:#fff7ed;border-left:4px solid ${BRAND_ORANGE};border-radius:4px;"><p style="margin:0;font-size:14px;color:${BRAND_DARK};white-space:pre-wrap;">${adminNote.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))}</p></div>` : ''}

    ${detailsTable(
      detailRow('Order', `#${quote.id}`) +
      detailRow('Product', quote.product_name || 'Custom Apparel') +
      detailRow('Quantity', String(quote.quantity)) +
      detailRow('Updated Total', `<strong>${formatCurrency(total)}</strong>`) +
      detailRow('Deposit Paid', '<span style="color:#16a34a;font-weight:700;">' + formatCurrency(depositPaid) + '</span>') +
      `<tr>
        <td style="padding:10px 12px;font-size:15px;color:${BRAND_DARK};font-weight:700;">Balance When Ready</td>
        <td style="padding:10px 12px;font-size:15px;color:${BRAND_ORANGE};font-weight:700;">${formatCurrency(balanceDue)}</td>
      </tr>`
    )}

    <p style="margin:24px 0 0;font-size:13px;color:#9ca3af;text-align:center;">Questions? Reply to this email or call us at (470) 622-1392.</p>
  `;

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: [quote.customer_email],
      subject: `Order #${quote.id} updated — TShirt Brothers`,
      html: baseLayout('Order Updated', body),
    });
    console.log('[Email] Quote update sent to ' + quote.customer_email);
  } catch (err) {
    console.error('[Email] Failed to send quote update:', err);
    throw err;
  }
}

// Pure HTML builder — exported for previews; sendPaidInvoiceReceipt wraps it.
export async function buildPaidReceiptHtml(invoice) {
  const items = Array.isArray(invoice.items) ? invoice.items : (() => { try { return JSON.parse(invoice.items || '[]'); } catch { return []; } })();
  const invoiceUrl = `${DOMAIN}/invoice/view/${invoice.id}`;
  const pdfUrl = `${DOMAIN}/api/invoices/${invoice.id}/pdf`;
  const placeId = process.env.GOOGLE_PLACE_ID || 'ChIJ1wdXkcfp9IgRuigC9YYhM3I';
  const reviewUrl = `https://search.google.com/local/writereview?placeid=${placeId}`;
  const promo = await theme.getActivePromotion();

  const itemRows = items.map((it) => ({
    name: it.description || '—',
    color: it.color || '—',
    size: it.size || '—',
    qty: it.quantity || 1,
    unit: Number(it.unit_price || 0),
    subtotal: it.total != null ? Number(it.total) : (Number(it.quantity || 1) * Number(it.unit_price || 0)),
  }));

  // Full breakdown — the receipt must mirror the invoice's real figures.
  const summaryRows = [
    { label: 'Product Subtotal', value: formatCurrency(invoice.subtotal) },
    Number(invoice.tax) > 0 ? { label: 'Tax', value: formatCurrency(invoice.tax) } : null,
    Number(invoice.shipping) > 0 ? { label: 'Shipping', value: formatCurrency(invoice.shipping) } : null,
    Number(invoice.discount) > 0 ? { label: 'Discount', value: `&minus;${formatCurrency(invoice.discount)}`, color: '#16a34a', bold: true } : null,
    { label: 'Invoice Total', value: formatCurrency(invoice.total), bold: true },
    { label: 'Payments Received', value: `&minus;${formatCurrency(invoice.amount_paid)}`, color: '#16a34a', bold: true },
  ];
  const balance = Math.max(0, Number(invoice.total || 0) - Number(invoice.amount_paid || 0));

  const html = theme.emailShell({
    title: `Receipt — Invoice ${invoice.invoice_number}`,
    headerTr: theme.docHeader({
      metaLines: [
        `Final Invoice <strong style="color:${BRAND_DARK};">${invoice.invoice_number}</strong>`,
        invoice.quote_id ? `Order #TSB-${invoice.quote_id}` : null,
        `Paid ${theme.fmtDate(new Date())}`,
      ],
      pill: theme.statusPill('Paid in Full', 'green'),
    }),
    sections: [
      theme.hero({
        titleTop: 'Your Order Is',
        titleAccent: 'Paid in Full!',
        greeting: `Hi ${invoice.customer_name || 'there'}, thank you for your business!`,
        copy: 'Your order is paid in full. We hope you and your team love your custom apparel — it means a lot to have you as part of the T-Shirt Brothers family!',
      }),
      theme.bodySection(`
        ${theme.sectionTitle('Final Invoice Summary')}
        ${theme.infoPanels([
          { label: 'Invoice #', lines: [String(invoice.invoice_number)] },
          invoice.quote_id ? { label: 'Order #', lines: [`TSB-${invoice.quote_id}`] } : null,
          { label: 'Payment Status', lines: ['Paid in Full'] },
        ].filter(Boolean))}
      `),
      theme.bodySection(`
        ${theme.sectionTitle('Order Items')}
        ${theme.itemsTable(itemRows, { unitLabel: 'Unit Price' })}
      `),
      theme.bodySection(`
        ${theme.summaryTable(summaryRows, {
          label: balance <= 0 ? 'Balance (USD)' : 'Balance Due (USD)',
          value: formatCurrency(balance),
          color: balance <= 0 ? '#16a34a' : undefined,
        })}
      `),
      theme.bodySection(`
        ${theme.sectionTitle("We'd Love to Hear From You!")}
        <p style="margin:0 0 12px;font-size:14px;color:#6b7280;">Your feedback helps our small business grow and inspire others.</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          ${theme.followUpCard({
            icon: '&#11088;',
            heading: "We'd Love Your Honest Review",
            copy: 'Thank you for supporting T-Shirt Brothers. Share your experience on Google and help others get to know our business.',
            button: { label: 'Leave a Google Review', href: reviewUrl },
          })}
          ${theme.followUpCard({
            icon: '&#128247;',
            heading: 'Show Us Your Look!',
            copy: "We'd love to see you or your team wearing your custom apparel. Send us a photo by replying to this email!",
            button: { label: 'Send Us Your Photo', href: `mailto:${theme.SHOP_EMAIL}?subject=My%20TSB%20look%20—%20Invoice%20${encodeURIComponent(invoice.invoice_number || '')}` },
            tone: 'blue',
          })}
        </tr></table>
      `),
      promo ? theme.bodySection(theme.couponPanel(promo)) : '',
      theme.bodySection(`
        ${theme.buttonRow([
          { label: '&#8681;&nbsp; Download PDF Receipt', href: pdfUrl, style: 'navy' },
          { label: 'View Invoice Online', href: invoiceUrl, style: 'outline' },
        ])}
        <p style="margin:16px 0 20px;font-size:13px;color:#9ca3af;text-align:center;">Keep this email as your receipt. Questions? Reply to this email or call ${theme.SHOP_PHONE}.</p>
      `),
    ].filter(Boolean),
  });

  return html;
}

export async function sendPaidInvoiceReceipt(invoice) {
  const html = await buildPaidReceiptHtml(invoice);
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: [invoice.customer_email],
      subject: `Receipt - TShirt Brothers Invoice ${invoice.invoice_number}`,
      html,
    });
    console.log('[Email] Paid invoice receipt sent to ' + invoice.customer_email);
  } catch (err) {
    console.error('[Email] Failed to send paid invoice receipt:', err);
    throw err;
  }
}

// Minimal HTML escape for admin-supplied custom messages so a stray < or "
// doesn't break the email layout (or worse).
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// Share a mockup with an arbitrary recipient (not necessarily the customer
// on file). Mirrors sendMockupForApproval but parameterizes the recipient
// and accepts an optional admin message that gets prepended to the body.
export async function sendMockupShareEmail(mockup, toEmail, approveUrl, opts = {}) {
  const { message, recipientName } = opts;
  const productImg = mockup.product_image_url || '';
  const graphic = mockup.graphic_url || '';
  const placement = typeof mockup.placement === 'string'
    ? JSON.parse(mockup.placement)
    : (mockup.placement || { x: 35, y: 30, width: 30 });

  const customMessageBlock = message
    ? `<div style="margin:0 0 20px;font-size:15px;color:#374151;background:#f9fafb;border-left:3px solid ${BRAND_ORANGE};padding:12px 16px;border-radius:4px;white-space:pre-wrap;">${escapeHtml(message)}</div>`
    : '';

  const greetingName = recipientName || mockup.customer_name || 'there';

  const body = `
    <h2 style="margin:0 0 8px;font-size:20px;color:${BRAND_DARK};">Your Mockup from T-Shirt Brothers</h2>
    <p style="margin:0 0 4px;font-size:15px;color:#6b7280;">Hi ${escapeHtml(greetingName)},</p>
    <p style="margin:0 0 20px;font-size:15px;color:#6b7280;">Here is the mockup of your design on the product. Take a look and let us know if it's approved, or what you'd like changed.</p>
    ${customMessageBlock}
    ${mockup.preview_image_url
      ? `<div style="text-align:center;margin:16px 0;"><img src="${mockup.preview_image_url}" alt="${mockup.name || 'Mockup'}" style="max-width:100%;border:1px solid #e5e7eb;border-radius:8px;" /></div>`
      : `
        <div style="position:relative;display:inline-block;margin:16px 0;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
          ${productImg ? `<img src="${productImg}" alt="${mockup.product_name || 'Product'}" style="display:block;max-width:480px;width:100%;" />` : ''}
          ${graphic ? `<img src="${graphic}" alt="Your design" style="position:absolute;left:${placement.x}%;top:${placement.y}%;width:${placement.width}%;" />` : ''}
        </div>
      `}
    <p style="margin:8px 0 4px;font-size:14px;color:#6b7280;"><strong>Product:</strong> ${mockup.product_name || 'Custom Apparel'}</p>
    ${mockup.notes ? `<p style="margin:0 0 16px;font-size:14px;color:#6b7280;"><strong>Notes:</strong> ${mockup.notes}</p>` : ''}
    ${primaryButton('View & Approve Mockup', approveUrl)}
    <p style="margin:24px 0 0;font-size:13px;color:#9ca3af;text-align:center;">Questions? Reply to this email or call us at (470) 622-1392.</p>
  `;

  await resend.emails.send({
    from: FROM_EMAIL,
    to: [toEmail],
    subject: 'Your Mockup - TShirt Brothers' + (mockup.name ? ` - ${mockup.name}` : ''),
    html: baseLayout('Your Mockup', body),
  });
  console.log(`[Email] Mockup share sent to ${toEmail}`);
}

export async function sendMockupForApproval(mockup, approveUrl, lang = 'en') {
  const productImg = mockup.product_image_url || '';
  const graphic = mockup.graphic_url || '';
  const placement = typeof mockup.placement === 'string' ? JSON.parse(mockup.placement) : (mockup.placement || { x: 35, y: 30, width: 30 });
  const es = lang === 'es';

  const previewBlock = mockup.preview_image_url
    ? `<div style="text-align:center;margin:16px 0;"><img src="${mockup.preview_image_url}" alt="${mockup.name || 'Mockup'}" style="max-width:100%;border:1px solid #e5e7eb;border-radius:8px;" /></div>`
    : `
      <div style="position:relative;display:inline-block;margin:16px 0;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        ${productImg ? `<img src="${productImg}" alt="${mockup.product_name || 'Product'}" style="display:block;max-width:480px;width:100%;" />` : ''}
        ${graphic ? `<img src="${graphic}" alt="${es ? 'Tu diseño' : 'Your design'}" style="position:absolute;left:${placement.x}%;top:${placement.y}%;width:${placement.width}%;" />` : ''}
      </div>
    `;

  const body = es ? `
    <h2 style="margin:0 0 8px;font-size:20px;color:${BRAND_DARK};">Tu Diseño de Muestra Está Listo para Aprobar</h2>
    <p style="margin:0 0 4px;font-size:15px;color:#6b7280;">Hola ${mockup.customer_name || ''},</p>
    <p style="margin:0 0 20px;font-size:15px;color:#6b7280;">Preparamos una muestra de tu diseño sobre el producto que elegiste. Revísala y dinos si la apruebas o qué te gustaría cambiar.</p>

    ${previewBlock}

    <p style="margin:8px 0 4px;font-size:14px;color:#6b7280;"><strong>Producto:</strong> ${mockup.product_name || 'Ropa Personalizada'}</p>
    ${mockup.notes ? `<p style="margin:0 0 16px;font-size:14px;color:#6b7280;"><strong>Notas:</strong> ${mockup.notes}</p>` : ''}

    ${primaryButton('Ver y Aprobar la Muestra', approveUrl)}

    <p style="margin:24px 0 0;font-size:13px;color:#9ca3af;text-align:center;">¿Preguntas? Responde a este correo o llámanos al (470) 622-1392. Hablamos español.</p>
  ` : `
    <h2 style="margin:0 0 8px;font-size:20px;color:${BRAND_DARK};">Mockup Ready for Your Approval</h2>
    <p style="margin:0 0 4px;font-size:15px;color:#6b7280;">Hi ${mockup.customer_name || 'there'},</p>
    <p style="margin:0 0 20px;font-size:15px;color:#6b7280;">We put together a mockup of your design on the product you picked. Please take a look and let us know if it's approved, or what you'd like changed.</p>

    ${previewBlock}

    <p style="margin:8px 0 4px;font-size:14px;color:#6b7280;"><strong>Product:</strong> ${mockup.product_name || 'Custom Apparel'}</p>
    ${mockup.notes ? `<p style="margin:0 0 16px;font-size:14px;color:#6b7280;"><strong>Notes:</strong> ${mockup.notes}</p>` : ''}

    ${primaryButton('View & Approve Mockup', approveUrl)}

    <p style="margin:24px 0 0;font-size:13px;color:#9ca3af;text-align:center;">Questions? Reply to this email or call us at (470) 622-1392.</p>
  `;

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: [mockup.customer_email],
      subject: es
        ? 'Aprobación de Muestra - TShirt Brothers' + (mockup.name ? ` - ${mockup.name}` : '')
        : 'Mockup Approval - TShirt Brothers' + (mockup.name ? ` - ${mockup.name}` : ''),
      html: baseLayout(es ? 'Aprobación de Muestra' : 'Mockup Approval', body),
    });
    console.log('[Email] Mockup approval sent to ' + mockup.customer_email);
  } catch (err) {
    console.error('[Email] Failed to send mockup approval:', err);
    throw err;
  }
}

/**
 * Acknowledge a mockup rejection to the customer. Without this the reject
 * button felt like shouting into a void — the shop got the note but the
 * customer got silence until a new mockup appeared.
 */
export async function sendMockupRejectedAckToCustomer(mockup, note, lang = 'en') {
  if (!mockup.customer_email) return;
  const es = lang === 'es';
  const body = es ? `
    <h2 style="margin:0 0 8px;font-size:20px;color:${BRAND_DARK};">Recibimos tus comentarios</h2>
    <p style="margin:0 0 4px;font-size:15px;color:#6b7280;">Hola ${mockup.customer_name || ''},</p>
    <p style="margin:0 0 16px;font-size:15px;color:#6b7280;">Gracias por revisar tu muestra. Estamos trabajando en los cambios y te enviaremos una nueva versión para aprobar muy pronto.</p>
    ${note ? `<div style="margin:0 0 16px;padding:12px;background:#f3f4f6;border-left:3px solid #9ca3af;">
        <p style="margin:0 0 4px;font-size:12px;color:#6b7280;font-weight:600;">Lo que pediste</p>
        <p style="margin:0;font-size:15px;color:#374151;">${escapeHtml(note)}</p>
      </div>` : ''}
    <p style="margin:24px 0 0;font-size:13px;color:#9ca3af;text-align:center;">¿Preguntas? Responde a este correo o llámanos al (470) 622-1392. Hablamos español.</p>
  ` : `
    <h2 style="margin:0 0 8px;font-size:20px;color:${BRAND_DARK};">We got your feedback</h2>
    <p style="margin:0 0 4px;font-size:15px;color:#6b7280;">Hi ${mockup.customer_name || 'there'},</p>
    <p style="margin:0 0 16px;font-size:15px;color:#6b7280;">Thanks for reviewing your mockup. We're working on the changes now and will send you a revised version to approve shortly.</p>
    ${note ? `<div style="margin:0 0 16px;padding:12px;background:#f3f4f6;border-left:3px solid #9ca3af;">
        <p style="margin:0 0 4px;font-size:12px;color:#6b7280;font-weight:600;">What you asked for</p>
        <p style="margin:0;font-size:15px;color:#374151;">${escapeHtml(note)}</p>
      </div>` : ''}
    <p style="margin:24px 0 0;font-size:13px;color:#9ca3af;text-align:center;">Questions? Reply to this email or call us at (470) 622-1392.</p>
  `;
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: [mockup.customer_email],
      subject: es ? 'Recibimos tus cambios - TShirt Brothers' : "We're on your mockup changes - TShirt Brothers",
      html: baseLayout(es ? 'Recibimos tus comentarios' : 'We got your feedback', body),
    });
  } catch (err) {
    console.error('[Email] Failed to send mockup rejection ack:', err);
  }
}

/**
 * Ask the customer for print-ready artwork, with a tokenized upload link so
 * they can drop files straight onto their quote without an account.
 */
export async function sendArtworkRequestToCustomer(quote, uploadUrl, { message, lang = 'en' } = {}) {
  const es = lang === 'es';
  const body = es ? `
    <h2 style="margin:0 0 8px;font-size:20px;color:${BRAND_DARK};">Necesitamos tu diseño</h2>
    <p style="margin:0 0 4px;font-size:15px;color:#6b7280;">Hola ${quote.customer_name || ''},</p>
    <p style="margin:0 0 16px;font-size:15px;color:#6b7280;">Para avanzar con tu pedido (Cotización #${quote.id}${quote.product_name ? ` — ${escapeHtml(quote.product_name)}` : ''}) necesitamos el archivo de tu diseño. Usa el botón para subirlo directamente a tu pedido.</p>
    ${message ? `<div style="margin:0 0 16px;padding:12px;background:#fff7ed;border-left:3px solid ${BRAND_ORANGE};">
        <p style="margin:0;font-size:15px;color:#374151;">${escapeHtml(message)}</p>
      </div>` : ''}
    ${primaryButton('Subir Mi Diseño', uploadUrl)}
    <p style="margin:0;font-size:13px;color:#9ca3af;">Formatos ideales: PNG con fondo transparente, alta resolución. ¿No tienes archivo? Responde a este correo y nuestro equipo de diseño te ayuda gratis.</p>
  ` : `
    <h2 style="margin:0 0 8px;font-size:20px;color:${BRAND_DARK};">We need your artwork</h2>
    <p style="margin:0 0 4px;font-size:15px;color:#6b7280;">Hi ${quote.customer_name || 'there'},</p>
    <p style="margin:0 0 16px;font-size:15px;color:#6b7280;">To keep your order moving (Quote #${quote.id}${quote.product_name ? ` — ${escapeHtml(quote.product_name)}` : ''}) we need your design file. Use the button below to upload it straight onto your order.</p>
    ${message ? `<div style="margin:0 0 16px;padding:12px;background:#fff7ed;border-left:3px solid ${BRAND_ORANGE};">
        <p style="margin:0;font-size:15px;color:#374151;">${escapeHtml(message)}</p>
      </div>` : ''}
    ${primaryButton('Upload My Artwork', uploadUrl)}
    <p style="margin:0;font-size:13px;color:#9ca3af;">Best formats: high-resolution PNG with a transparent background. Don't have a file? Reply to this email — our design team helps for free.</p>
  `;
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: [quote.customer_email],
      subject: es ? `Sube tu diseño - Cotización #${quote.id} - TShirt Brothers` : `Artwork needed for your order - Quote #${quote.id} - TShirt Brothers`,
      html: baseLayout(es ? 'Necesitamos tu diseño' : 'We need your artwork', body),
    });
  } catch (err) {
    console.error('[Email] Failed to send artwork request:', err);
    throw err;
  }
}

/** Tell the shop the customer uploaded artwork via the request link. */
export async function sendArtworkReceivedToAdmin(quote, urls) {
  const imgs = (urls || []).slice(0, 6).map((u) =>
    `<img src="${escapeHtml(u)}" alt="" style="max-width:160px;max-height:160px;border:1px solid #e5e7eb;border-radius:8px;margin:4px;" />`).join('');
  const body = `
    <h2 style="margin:0 0 8px;font-size:20px;color:#15803d;">🎨 Artwork received</h2>
    <p style="margin:0 0 16px;font-size:15px;color:#6b7280;"><strong>${escapeHtml(quote.customer_name || quote.customer_email || 'Customer')}</strong> uploaded ${urls.length === 1 ? 'a design file' : `${urls.length} design files`} to Quote #${quote.id}.</p>
    <div style="text-align:center;">${imgs}</div>
    ${primaryButton('Open the Quote', `${DOMAIN}/admin?section=quotes&id=${quote.id}`)}
  `;
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: [ADMIN_EMAIL],
      subject: `Artwork received · Quote #${quote.id} · ${quote.customer_name || quote.customer_email || ''}`,
      html: baseLayout('Artwork received', body),
    });
  } catch (err) {
    console.error('[Email] Failed to send artwork-received notice:', err);
  }
}

/** Tell the shop a customer declined their quote (and why, if they said). */
export async function sendQuoteDeclinedToAdmin(quote, reason) {
  const body = `
    <h2 style="margin:0 0 8px;font-size:20px;color:#b91c1c;">Quote declined</h2>
    <p style="margin:0 0 16px;font-size:15px;color:#6b7280;"><strong>${escapeHtml(quote.customer_name || quote.customer_email || 'A customer')}</strong> declined Quote #${quote.id}${quote.product_name ? ` (${escapeHtml(quote.product_name)})` : ''}${quote.estimated_price ? ` — ${formatCurrency(quote.estimated_price)}` : ''}.</p>
    ${reason ? `<div style="margin:0 0 16px;padding:12px;background:#fef2f2;border-left:3px solid #ef4444;">
        <p style="margin:0 0 4px;font-size:12px;color:#991b1b;font-weight:600;">Their reason</p>
        <p style="margin:0;font-size:15px;color:#374151;">${escapeHtml(reason)}</p>
      </div>` : ''}
    ${primaryButton('Open the Quote', `${DOMAIN}/admin?section=quotes&id=${quote.id}`)}
  `;
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: [ADMIN_EMAIL],
      subject: `Declined · Quote #${quote.id} · ${quote.customer_name || quote.customer_email || ''}`,
      html: baseLayout('Quote declined', body),
    });
  } catch (err) {
    console.error('[Email] Failed to send quote-declined notice:', err);
  }
}

/**
 * Nightly PO sweep found blanks that shipped. Without this, tracking only
 * surfaced when someone pressed the refresh button in admin.
 */
export async function sendPoShippedToAdmin(po) {
  const tracking = Array.isArray(po.tracking) ? po.tracking : [];
  const rows = tracking.map((t) =>
    detailRow(
      `Order ${t.orderNumber || ''}`,
      `${t.carrier || ''} ${t.method || ''} ${(t.trackingNumbers || []).join(', ') || 'no tracking number yet'}`.trim(),
    )).join('');
  const body = `
    <h2 style="margin:0 0 8px;font-size:20px;color:#15803d;">📦 Blanks shipped</h2>
    <p style="margin:0 0 16px;font-size:15px;color:#6b7280;">S&amp;S shipped PO <strong>${escapeHtml(po.po_number || String(po.id))}</strong>${po.quote_id ? ` (Quote #${po.quote_id})` : ''}.</p>
    ${rows ? detailsTable(rows) : ''}
    ${primaryButton('Open Purchasing', `${DOMAIN}/admin?section=purchasing`)}
  `;
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: [ADMIN_EMAIL],
      subject: `Blanks shipped · PO ${po.po_number || po.id}${po.quote_id ? ` · Quote #${po.quote_id}` : ''}`,
      html: baseLayout('Blanks shipped', body),
    });
  } catch (err) {
    console.error('[Email] Failed to send PO-shipped notice:', err);
  }
}

// Carrier tracking URL, or null for carriers we don't recognize (the email
// then shows the bare number, which every carrier's site accepts).
function trackingUrl(carrier, number) {
  if (!number) return null;
  const c = String(carrier || '').toLowerCase();
  if (c.includes('usps')) return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(number)}`;
  if (c.includes('ups')) return `https://www.ups.com/track?tracknum=${encodeURIComponent(number)}`;
  if (c.includes('fedex')) return `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(number)}`;
  return null;
}

function shipToLines(addr) {
  if (!addr || typeof addr !== 'object') return '';
  return [addr.name, addr.address || addr.address1, addr.address2, [addr.city, addr.state].filter(Boolean).join(', ') + (addr.zip ? ` ${addr.zip}` : '')]
    .filter((l) => l && String(l).trim())
    .map((l) => escapeHtml(String(l)))
    .join('<br/>');
}

/**
 * Balance cleared — tell the customer what happens next based on the
 * fulfillment choice they made on the payment page: pickup gets the shop
 * address + hours, shipping gets "tracking to follow".
 */
export async function sendBalancePaidConfirmation(quote, lang = 'en') {
  if (!quote.customer_email) return;
  const es = lang === 'es';
  const pickup = quote.fulfillment_method !== 'ship';
  const addrHtml = shipToLines(quote.shipping_address);

  const nextBlock = pickup ? (es ? `
    <div style="margin:16px 0;padding:16px;background:#f0fdf4;border-radius:8px;border:1px solid #bbf7d0;">
      <p style="margin:0 0 4px;font-size:14px;font-weight:600;color:#166534;">Recoge tu pedido aquí</p>
      <p style="margin:0;font-size:15px;color:#374151;">${SHOP_ADDRESS}</p>
      <p style="margin:4px 0 0;font-size:14px;color:#6b7280;">Horario: ${SHOP_HOURS}</p>
    </div>` : `
    <div style="margin:16px 0;padding:16px;background:#f0fdf4;border-radius:8px;border:1px solid #bbf7d0;">
      <p style="margin:0 0 4px;font-size:14px;font-weight:600;color:#166534;">Pick up your order here</p>
      <p style="margin:0;font-size:15px;color:#374151;">${SHOP_ADDRESS}</p>
      <p style="margin:4px 0 0;font-size:14px;color:#6b7280;">Hours: ${SHOP_HOURS}</p>
    </div>`) : (es ? `
    <div style="margin:16px 0;padding:16px;background:#eff6ff;border-radius:8px;border:1px solid #bfdbfe;">
      <p style="margin:0 0 4px;font-size:14px;font-weight:600;color:#1e40af;">Enviaremos tu pedido a</p>
      <p style="margin:0;font-size:15px;color:#374151;">${addrHtml || 'la dirección que nos diste'}</p>
      <p style="margin:8px 0 0;font-size:14px;color:#6b7280;">Te enviaremos el número de rastreo en cuanto salga.</p>
    </div>` : `
    <div style="margin:16px 0;padding:16px;background:#eff6ff;border-radius:8px;border:1px solid #bfdbfe;">
      <p style="margin:0 0 4px;font-size:14px;font-weight:600;color:#1e40af;">We'll ship your order to</p>
      <p style="margin:0;font-size:15px;color:#374151;">${addrHtml || 'the address you gave us'}</p>
      <p style="margin:8px 0 0;font-size:14px;color:#6b7280;">You'll get a tracking number the moment it goes out.</p>
    </div>`);

  const body = es ? `
    <h2 style="margin:0 0 8px;font-size:20px;color:#15803d;">¡Pagado por completo!</h2>
    <p style="margin:0 0 4px;font-size:15px;color:#6b7280;">Hola ${quote.customer_name || ''},</p>
    <p style="margin:0 0 8px;font-size:15px;color:#6b7280;">Recibimos el pago restante de tu pedido #${quote.id}${quote.product_name ? ` (${escapeHtml(quote.product_name)})` : ''}. ¡Gracias!</p>
    ${nextBlock}
    <p style="margin:16px 0 0;font-size:13px;color:#9ca3af;text-align:center;">¿Preguntas? Responde a este correo o llámanos al (470) 622-1392. Hablamos español.</p>
  ` : `
    <h2 style="margin:0 0 8px;font-size:20px;color:#15803d;">Paid in full!</h2>
    <p style="margin:0 0 4px;font-size:15px;color:#6b7280;">Hi ${quote.customer_name || 'there'},</p>
    <p style="margin:0 0 8px;font-size:15px;color:#6b7280;">We received the remaining balance on your order #${quote.id}${quote.product_name ? ` (${escapeHtml(quote.product_name)})` : ''}. Thank you!</p>
    ${nextBlock}
    <p style="margin:16px 0 0;font-size:13px;color:#9ca3af;text-align:center;">Questions? Reply to this email or call us at (470) 622-1392.</p>
  `;
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: [quote.customer_email],
      subject: es ? `Pedido #${quote.id} pagado — ${pickup ? 'listo para recoger' : 'lo enviamos pronto'}` : `Order #${quote.id} paid in full — ${pickup ? 'pickup details inside' : 'shipping soon'}`,
      html: baseLayout(es ? 'Pagado por completo' : 'Paid in full', body),
    });
  } catch (err) {
    console.error('[Email] Failed to send balance-paid confirmation:', err);
  }
}

/** Balance landed — tell the shop, with the customer's fulfillment choice. */
export async function sendBalancePaidToAdmin(quote, amount) {
  const pickup = quote.fulfillment_method !== 'ship';
  const body = `
    <h2 style="margin:0 0 8px;font-size:20px;color:#15803d;">💰 Balance paid</h2>
    <p style="margin:0 0 16px;font-size:15px;color:#6b7280;"><strong>${escapeHtml(quote.customer_name || quote.customer_email || 'Customer')}</strong> paid ${amount ? formatCurrency(amount) : 'the balance'} on Quote #${quote.id}${quote.product_name ? ` (${escapeHtml(quote.product_name)})` : ''}.</p>
    ${detailsTable(
      detailRow('Fulfillment', pickup ? 'PICKUP at the shop' : 'SHIP to customer') +
      (pickup ? '' : detailRow('Ship to', shipToLines(quote.shipping_address) || '⚠️ no address on file — contact the customer'))
    )}
    <p style="margin:0;font-size:14px;color:#6b7280;">${pickup ? 'They have the shop address and hours. Hand it over and hit Mark Picked Up.' : 'Ship it and hit Mark Shipped with the tracking number — the customer is expecting tracking.'}</p>
    ${primaryButton('Open the Quote', `${DOMAIN}/admin?section=quotes&id=${quote.id}`)}
  `;
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: [ADMIN_EMAIL],
      subject: `Balance paid · Quote #${quote.id} · ${pickup ? 'pickup' : 'SHIP'} · ${quote.customer_name || ''}`,
      html: baseLayout('Balance paid', body),
    });
  } catch (err) {
    console.error('[Email] Failed to send balance-paid admin notice:', err);
  }
}

/** Order went in the mail — tracking email to the customer. */
export async function sendOrderShippedToCustomer(quote, { carrier, trackingNumber } = {}, lang = 'en') {
  if (!quote.customer_email) return;
  const es = lang === 'es';
  const url = trackingUrl(carrier, trackingNumber);
  const trackBlock = trackingNumber ? `
    ${detailsTable(
      detailRow(es ? 'Transportista' : 'Carrier', escapeHtml(carrier || '—')) +
      detailRow(es ? 'Número de rastreo' : 'Tracking number', escapeHtml(trackingNumber))
    )}
    ${url ? primaryButton(es ? 'Rastrear Mi Paquete' : 'Track My Package', url) : ''}
  ` : `<p style="margin:0 0 16px;font-size:15px;color:#6b7280;">${es ? 'Tu paquete está en camino.' : 'Your package is on its way.'}</p>`;
  const body = es ? `
    <h2 style="margin:0 0 8px;font-size:20px;color:${BRAND_DARK};">📦 ¡Tu pedido va en camino!</h2>
    <p style="margin:0 0 16px;font-size:15px;color:#6b7280;">Hola ${quote.customer_name || ''}, tu pedido #${quote.id}${quote.product_name ? ` (${escapeHtml(quote.product_name)})` : ''} acaba de salir.</p>
    ${trackBlock}
    <p style="margin:16px 0 0;font-size:13px;color:#9ca3af;text-align:center;">¿Preguntas? Responde a este correo o llámanos al (470) 622-1392.</p>
  ` : `
    <h2 style="margin:0 0 8px;font-size:20px;color:${BRAND_DARK};">📦 Your order is on its way!</h2>
    <p style="margin:0 0 16px;font-size:15px;color:#6b7280;">Hi ${quote.customer_name || 'there'}, your order #${quote.id}${quote.product_name ? ` (${escapeHtml(quote.product_name)})` : ''} just shipped.</p>
    ${trackBlock}
    <p style="margin:16px 0 0;font-size:13px;color:#9ca3af;text-align:center;">Questions? Reply to this email or call us at (470) 622-1392.</p>
  `;
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: [quote.customer_email],
      subject: es ? `Tu pedido #${quote.id} va en camino 📦` : `Your order #${quote.id} has shipped 📦`,
      html: baseLayout(es ? 'Pedido enviado' : 'Order shipped', body),
    });
  } catch (err) {
    console.error('[Email] Failed to send order-shipped email:', err);
    throw err;
  }
}

// ── Marketing campaigns ──────────────────────────────────────────────────────

import crypto from 'crypto';

const UNSUB_SECRET = process.env.UNSUB_SECRET || process.env.JWT_SECRET || 'tsb-unsub-fallback';

export function unsubscribeToken(email) {
  return crypto.createHmac('sha256', UNSUB_SECRET).update(email.toLowerCase()).digest('hex').slice(0, 24);
}

// Tokens for open/click tracking — same pattern, separate purpose so a
// leaked unsubscribe token can't fake a click.
export function trackingToken(email, kind) {
  return crypto.createHmac('sha256', UNSUB_SECRET).update(`${kind}:${email.toLowerCase()}`).digest('hex').slice(0, 16);
}

// Rewrite every <a href="X"> in HTML to route through our click-tracking
// proxy. Skips mailto:, tel:, and the unsubscribe link itself (already
// signed and we don't want to inflate click counts on opt-outs).
function wrapLinksForTracking(html, campaignId, recipientEmail) {
  const tok = trackingToken(recipientEmail, 'click');
  const proxy = `${DOMAIN}/api/email/track/click?c=${campaignId}&e=${encodeURIComponent(recipientEmail)}&t=${tok}&u=`;
  return html.replace(/href="([^"]+)"/g, (match, url) => {
    if (/^(mailto:|tel:|#)/i.test(url)) return match;
    if (url.includes('/api/email/unsubscribe')) return match;
    if (url.includes('/api/email/track/')) return match;
    return `href="${proxy}${encodeURIComponent(url)}"`;
  });
}

/**
 * Wraps a campaign body in the standard brand layout, appends a row of
 * example images, and adds the legally-required unsubscribe footer.
 * bodyHtml is the admin-edited HTML (already drafted/edited by the user).
 */
export function buildCampaignHtml({ subject, bodyHtml, exampleImageUrls = [], recipientEmail, campaignId = 0 }) {
  const examplesHtml = exampleImageUrls.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
         <tr>${exampleImageUrls.slice(0, 6).map((u) => `
           <td width="33%" style="padding:4px;">
             <img src="${u}" alt="" style="width:100%;border-radius:8px;border:1px solid #e5e7eb;display:block;" />
           </td>`).join('')}
         </tr>
       </table>`
    : '';

  const token = unsubscribeToken(recipientEmail);
  const unsubUrl = `${DOMAIN}/api/email/unsubscribe?e=${encodeURIComponent(recipientEmail)}&t=${token}${campaignId ? `&c=${campaignId}` : ''}`;
  const unsubHtml = `
    <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;text-align:center;">
      You're getting this because you've worked with T-Shirt Brothers before.
      <a href="${unsubUrl}" style="color:#9ca3af;text-decoration:underline;">Unsubscribe</a>.
    </p>`;

  // 1×1 invisible pixel for open tracking. Uses a tracking token to
  // discourage someone from spoofing opens by hitting the URL directly.
  const openTok = trackingToken(recipientEmail, 'open');
  const openPixel = campaignId
    ? `<img src="${DOMAIN}/api/email/track/open?c=${campaignId}&e=${encodeURIComponent(recipientEmail)}&t=${openTok}" alt="" width="1" height="1" style="display:block;width:1px;height:1px;border:0;" />`
    : '';

  const inner = `
    <h1 style="margin:0 0 16px;font-size:24px;color:${BRAND_DARK};">${subject}</h1>
    <div style="font-size:15px;line-height:1.6;color:#374151;">${bodyHtml}</div>
    ${examplesHtml}
    ${primaryButton('Get a Free Quote', `${DOMAIN}/quote`)}
    ${unsubHtml}
    ${openPixel}
  `;
  // Rewrite links AFTER assembling the full layout so anchors inside
  // bodyHtml AND in the standard CTA button both go through tracking.
  const layout = baseLayout(subject, inner);
  return campaignId ? wrapLinksForTracking(layout, campaignId, recipientEmail) : layout;
}

/**
 * Sends a single campaign email. The caller is responsible for batching
 * and respecting Resend's per-second rate limit.
 */
/**
 * Tell the shop what the customer decided about a mockup.
 *
 * The approval page has always recorded the decision and the customer's note;
 * nothing ever announced it, so an approval sat unnoticed until someone
 * opened the mockup by chance. A rejection matters more — it carries the note
 * saying what to change, which is the whole point of asking.
 */
export async function sendMockupDecisionToAdmin(mockup, action, note) {
  const approved = action === 'approved';
  const who = mockup.customer_name || mockup.customer_email || 'A customer';
  const body = `
    <h2 style="margin:0 0 8px;font-size:22px;color:${approved ? '#15803d' : '#b91c1c'};">
      ${approved ? '✅ Mockup approved' : '✏️ Changes requested'}
    </h2>
    <p style="margin:0 0 16px;font-size:15px;color:#6b7280;">
      <strong>${escapeHtml(who)}</strong> ${approved ? 'approved' : 'asked for changes to'}
      ${escapeHtml(mockup.name || 'their mockup')}${mockup.quote_id ? ` (Quote #${escapeHtml(String(mockup.quote_id))})` : ''}.
    </p>
    ${note ? `<div style="margin:0 0 16px;padding:12px;background:#fef3c7;border-left:3px solid #f59e0b;">
        <p style="margin:0 0 4px;font-size:12px;color:#92400e;font-weight:600;">What they said</p>
        <p style="margin:0;font-size:15px;color:#374151;">${escapeHtml(note)}</p>
      </div>` : ''}
    ${mockup.preview_image_url ? `<img src="${escapeHtml(mockup.preview_image_url)}" alt="" style="max-width:100%;border-radius:8px;border:1px solid #e5e7eb;" />` : ''}
    <p style="margin:20px 0 0;font-size:14px;color:#6b7280;">
      ${approved ? 'Ready to go into production.' : 'Redraw it and send a new mockup for approval.'}
    </p>
    ${approved && mockup.quote_id ? `
      ${primaryButton('Order the Blanks (S&S)', `${DOMAIN}/admin?section=purchasing&quote=${mockup.quote_id}`)}
      <p style="margin:0;font-size:13px;color:#9ca3af;text-align:center;">
        Then <a href="${DOMAIN}/admin/vendor-send" style="color:#6b7280;">send the gang sheet to your vendor</a>
        and hit Start Production on <a href="${DOMAIN}/admin?section=quotes&id=${mockup.quote_id}" style="color:#6b7280;">Quote #${mockup.quote_id}</a>.
      </p>` : ''}
  `;
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: [ADMIN_EMAIL],
      subject: `${approved ? 'Approved' : 'Changes requested'}: ${mockup.name || 'mockup'}${mockup.quote_id ? ` · Quote #${mockup.quote_id}` : ''}`,
      html: baseLayout(approved ? 'Mockup Approved' : 'Changes Requested', body),
    });
  } catch (err) {
    console.error('[Email] Failed to send mockup decision:', err);
  }
}

/**
 * Send one newsletter email. The newsletter renderer produced the full
 * document; this injects the SAME per-recipient compliance + tracking the
 * classic campaign path uses (unsubscribe link, open pixel, click proxy)
 * so newsletters flow through the existing analytics untouched.
 */
export async function sendNewsletterEmail({ to, subject, renderHtml, campaignId }) {
  const token = unsubscribeToken(to);
  const unsubUrl = `${DOMAIN}/api/email/unsubscribe?e=${encodeURIComponent(to)}&t=${token}${campaignId ? `&c=${campaignId}` : ''}`;
  const unsubHtml = `
    <p style="margin:16px 0 0;font-size:12px;color:#9ca3af;text-align:center;font-family:Arial,sans-serif;">
      You're getting this because you've worked with T-Shirt Brothers before.
      <a href="${unsubUrl}" style="color:#9ca3af;text-decoration:underline;">Unsubscribe</a>.
    </p>`;
  const openTok = trackingToken(to, 'open');
  const openPixelHtml = campaignId
    ? `<img src="${DOMAIN}/api/email/track/open?c=${campaignId}&e=${encodeURIComponent(to)}&t=${openTok}" alt="" width="1" height="1" style="display:block;width:1px;height:1px;border:0;" />`
    : '';
  let html = renderHtml({ unsubHtml, openPixelHtml });
  if (campaignId) html = wrapLinksForTracking(html, campaignId, to);
  return resend.emails.send({ from: FROM_EMAIL, to: [to], subject, html });
}

export async function sendCampaignEmail({ to, subject, bodyHtml, exampleImageUrls = [], campaignId = 0 }) {
  const html = buildCampaignHtml({ subject, bodyHtml, exampleImageUrls, recipientEmail: to, campaignId });
  return resend.emails.send({
    from: FROM_EMAIL,
    to: [to],
    subject,
    html,
  });
}

// ── Instant Quote Calculator ────────────────────────────────────────────────

// Build the detailRow string for one line item in a multi-item quote.
function instantQuoteItemRows(item) {
  // Custom items skip the catalog-shaped rows — no method, sizes, or price.
  if (item.kind === 'custom' && item.custom) {
    let html = '';
    html += detailRow('Product', `Custom: ${item.custom.description}`);
    html += detailRow('Quantity', String(item.custom.quantity));
    if (item.custom.notes) html += detailRow('Notes', item.custom.notes);
    if (item.custom.service === 'press-only' && item.calc?.total > 0) {
      html += detailRow('Price', `$${item.calc.total.toFixed(2)} ($${item.calc.per_shirt.toFixed(2)}/each pressing — transfer printing, if any, quoted after art review)`);
    } else {
      html += detailRow('Price', 'To be quoted after review');
    }
    return html;
  }
  const { inputs, calc, pickedProductMeta } = item;
  const { num_locations, colors_per_location } = calc.breakdown;
  const locationsLabel = (() => {
    const locs = [];
    if (inputs.locations?.front) locs.push('Front');
    if (inputs.locations?.back) locs.push('Back');
    if (inputs.locations?.sleeve) locs.push('Sleeve');
    return locs.length ? locs.join(' + ') : `${num_locations} location${num_locations === 1 ? '' : 's'}`;
  })();
  const productLabel = pickedProductMeta
    ? `${pickedProductMeta.name} — ${inputs.methodName}`
    : `${inputs.qualityTier} ${inputs.garmentName} — ${inputs.methodName}`;
  let html = '';
  html += detailRow('Product', productLabel);
  if (inputs.color) html += detailRow('Color', inputs.color);
  html += detailRow('Quantity', String(calc.quantity));
  html += detailRow('Locations', locationsLabel);
  if (inputs.methodName === 'Screen Print') {
    html += detailRow('Colors per location', String(colors_per_location));
  }
  html += detailRow('Turnaround', inputs.rush
    ? `Rush — ${calc.turnaround_days} days`
    : `Standard — ${calc.turnaround_days} days`);
  html += detailRow('Per shirt', formatCurrency(calc.per_shirt));
  html += detailRow('Item total', formatCurrency(calc.total));
  return html;
}

// Render the full per-item section. Single item drops the header label.
function instantQuoteItemsHtml(items) {
  if (items.length === 1) {
    return detailsTable(instantQuoteItemRows(items[0]));
  }
  return items.map((item, i) =>
    `<p style="font-weight:600;color:${BRAND_DARK};margin:20px 0 6px;font-size:14px;">Item ${i + 1} of ${items.length}</p>` +
    detailsTable(instantQuoteItemRows(item)),
  ).join('');
}

// Grand-total table shown only when there's more than one item. For a
// custom-only multi-item quote the total would be $0.00 (misleading), so
// we omit the total row and show "To be quoted" instead.
function instantQuoteGrandTotalHtml({ grandTotal, grandQuantity, items }) {
  if (items.length === 1) return '';
  const customOnly = items.every((it) => it.kind === 'custom');
  return detailsTable(
    detailRow('Total pieces', String(grandQuantity)) +
    detailRow('Grand total', customOnly
      ? '<em>To be quoted after review</em>'
      : `<strong>${formatCurrency(grandTotal)}</strong>`),
  );
}

function instantQuoteItemNoun(items) {
  if (items.length === 1) {
    const it = items[0];
    if (it.kind === 'custom') {
      const q = it.custom?.quantity || it.calc.quantity;
      return `${q} custom item${q === 1 ? '' : 's'}`;
    }
    const g = it.inputs?.garmentName || 'shirt';
    return `${it.calc.quantity} ${g.toLowerCase()}${it.calc.quantity === 1 ? '' : 's'}`;
  }
  const totalQty = items.reduce((s, it) => s + it.calc.quantity, 0);
  return `${totalQty} pieces across ${items.length} products`;
}

// Quotes saved from the Spanish site (/es/cotizacion) carry lang:'es'
// inside inputs_json — every customer-facing email for that quote should
// then be written in Spanish. Admin emails always stay English.
export function quoteLang(quote) {
  try {
    const ij = typeof quote?.inputs_json === 'string' ? JSON.parse(quote.inputs_json) : quote?.inputs_json;
    return ij?.lang === 'es' ? 'es' : 'en';
  } catch {
    return 'en';
  }
}

export async function sendInstantQuoteToCustomer({ quote, items, grandTotal, grandQuantity, lang = 'en' }) {
  // Custom-only quotes have no auto-price and no lock-in path — this is
  // an acknowledgment ("we got it, price coming"), not a receipt of a
  // price the customer already saw.
  const customOnly = items.length > 0 && items.every((it) => it.kind === 'custom');
  const es = lang === 'es';

  const subject = customOnly
    ? (es ? 'Recibimos tu solicitud de cotización — precio en camino' : `We got your quote request — pricing coming shortly`)
    : (es
      ? `Tu cotización de T-Shirt Brothers — ${formatCurrency(grandTotal)}`
      : `Your T-Shirt Brothers quote — ${formatCurrency(grandTotal)} for ${instantQuoteItemNoun(items)}`);

  const intro = customOnly
    ? (es
      ? `<p>Gracias por enviar tu solicitud personalizada. Nuestro equipo revisará los detalles y te enviará un precio por correo — normalmente en un día hábil.</p>`
      : `<p>Thanks for sending your custom request. Our team will review the details below and email you a price — usually within one business day.</p>`)
    : (es
      ? `<p>Gracias por usar nuestra cotización instantánea — aquí está el precio que viste:</p>`
      : `<p>Thanks for using our instant-quote tool — here's the price you saw:</p>`);

  const footerNote = customOnly
    ? (es
      ? `<p style="font-size:13px;color:#6b7280;margin-top:18px;">Te enviaremos el precio junto con un enlace para aceptar y pagar un depósito del 50%. Responde a este correo si necesitas agregar algo.</p>`
      : `<p style="font-size:13px;color:#6b7280;margin-top:18px;">We'll follow up with a price + a link to accept and pay a 50% deposit. Reply to this email if you need to add anything.</p>`)
    : (es
      ? `<p style="font-size:13px;color:#6b7280;margin-top:18px;">Este es un estimado basado en la información anterior. Revisaremos tu diseño y confirmaremos el precio final antes de comenzar. Los impuestos y el envío se calculan al pagar.</p>`
      : `<p style="font-size:13px;color:#6b7280;margin-top:18px;">This is an estimate based on the inputs above. We'll review your artwork and confirm the final price before any work starts. Tax and shipping are calculated at checkout.</p>`);

  const cta = customOnly
    ? ''
    : primaryButton(es ? 'Confirmar mi pedido' : 'Lock in your order', `${DOMAIN}/instant-quote?quote=${quote.id}`);

  const body = `
    <p>${es ? 'Hola' : 'Hi'} ${quote.customer_name || (es ? '' : 'there')},</p>
    ${intro}
    ${instantQuoteItemsHtml(items)}
    ${instantQuoteGrandTotalHtml({ grandTotal, grandQuantity, items })}
    ${footerNote}
    <p style="font-size:13px;color:#6b7280;">${es ? 'Cotización' : 'Quote ID'}: <strong>#${quote.id}</strong> · ${es ? 'Guardada el' : 'Saved'} ${new Date().toLocaleDateString(es ? 'es-US' : 'en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
    ${cta}
    <p style="font-size:13px;color:#6b7280;margin-top:18px;">${es
      ? 'Responde a este correo y uno de nosotros te atenderá personalmente — hablamos español.'
      : 'Reply to this email and one of us will personally walk you through it.'}</p>
  `;
  return resend.emails.send({
    from: FROM_EMAIL,
    to: [quote.customer_email],
    subject,
    html: baseLayout(
      customOnly
        ? (es ? 'Recibimos tu solicitud' : 'We got your quote request')
        : (es ? 'Tu Cotización Instantánea' : 'Your Instant Quote'),
      body,
    ),
  });
}

export async function sendInstantQuoteToAdmin({ quote, items, grandTotal, grandQuantity }) {
  const subject = `New instant quote: ${quote.customer_name || quote.customer_email} — ${formatCurrency(grandTotal)}`;
  const body = `
    <p><strong>${quote.customer_name || '(no name)'} &lt;${quote.customer_email}&gt;</strong> just saved an instant quote.</p>
    ${instantQuoteItemsHtml(items)}
    ${instantQuoteGrandTotalHtml({ grandTotal, grandQuantity, items })}
    ${primaryButton('Open in Admin', `${DOMAIN}/admin?section=quotes&id=${quote.id}`)}
    <p style="font-size:13px;color:#6b7280;margin-top:18px;">Quote ID #${quote.id} · ${items.length} item${items.length === 1 ? '' : 's'} · design_type=instant-quote</p>
  `;
  return resend.emails.send({
    from: FROM_EMAIL,
    to: [ADMIN_EMAIL],
    replyTo: quote.customer_email,
    subject,
    html: baseLayout('New Instant Quote', body),
  });
}

// ── Gang sheet store (DTF) ──────────────────────────────────────────────────

// Live tier-promise copy, pulled from the settings row so an admin edit to
// the cutoffs shows up in outbound emails immediately rather than only in
// the storefront. Dynamic `import()` (not a top-level import) keeps this a
// function-body-only reach into routes/gangsheetStore.js — same established
// pattern used elsewhere in this file (see sendMockupForApproval's callers,
// server/routes/mockups.js) to avoid a hard module-load cycle between the
// route file and this service. An email must never fail to send just
// because the settings row couldn't be loaded, so any failure here falls
// back to the static TIER_PROMISES copy.
async function gangSheetTurnaround(tier) {
  try {
    const { loadSettings, tierPromises } = await import('../routes/gangsheetStore.js');
    const settings = await loadSettings();
    return tierPromises(settings)[tier] || tier;
  } catch (err) {
    console.error('[Email] gang sheet live settings unavailable, using static tier copy:', err.message);
    return TIER_PROMISES[tier] || tier;
  }
}

// ship_address is stored as JSONB but may arrive here as an already-parsed
// object (fresh query result) or, in principle, a JSON string — normalize
// either shape to a plain object, or null if it's neither / malformed.
function parseShipAddress(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return null; }
  }
  return null;
}

export async function sendGangSheetPaidToCustomer({ order }) {
  const total = formatCurrency((order.price_cents + order.shipping_cents) / 100);
  const deliveryValue = order.delivery === 'ship'
    ? 'Ships to you — we\'ll email tracking once it\'s on the way'
    : `Pickup — ${SHOP_ADDRESS}`;
  const turnaround = await gangSheetTurnaround(order.tier);
  const subject = `Order #${order.id} confirmed — DTF Gang Sheet 22in × ${order.length_ft} ft`;
  const body = `
    <p>Hi ${escapeHtml(order.customer_name || 'there')},</p>
    <p>Thanks for your order — we've got it and we're getting started.</p>
    ${detailsTable(
      detailRow('Order', `#${order.id}`) +
      detailRow('Size', `22in &times; ${order.length_ft} ft`) +
      detailRow('Turnaround', turnaround) +
      detailRow('Total', `<strong>${total}</strong>`) +
      detailRow('Delivery', deliveryValue)
    )}
    <p style="font-size:13px;color:#6b7280;margin-top:18px;">We'll email you again as soon as it's ready.</p>
  `;
  return resend.emails.send({
    from: FROM_EMAIL,
    to: [order.customer_email],
    subject,
    html: baseLayout('Order Confirmed', body),
  });
}

// Fired when an admin flips an order to `ready` (server/routes/gangsheetStore.js
// PATCH /admin/orders/:id). Pickup orders get the shop address + hours so
// the customer doesn't have to dig for them; ship orders just get told
// it's on the way — EasyPost tracking (if any) isn't wired to this order
// type yet, so we don't promise a tracking number.
export async function sendGangSheetReadyToCustomer({ order }) {
  const total = formatCurrency((order.price_cents + order.shipping_cents) / 100);
  const subject = `Your DTF transfers are ready! — Order #${order.id}`;
  const deliveryBlock = order.delivery === 'ship'
    ? `<p style="margin:0 0 16px;font-size:15px;color:#6b7280;">Your order has shipped! It's on its way to you — no action needed on your end.</p>`
    : `
      <div style="background:#fff7ed;border-radius:8px;padding:16px;margin:0 0 16px;">
        <p style="margin:0 0 4px;font-size:15px;font-weight:600;color:${BRAND_DARK};">Ready for pickup</p>
        <p style="margin:0 0 4px;font-size:14px;color:#374151;">${SHOP_ADDRESS}</p>
        <p style="margin:0;font-size:14px;color:#374151;">Hours: ${SHOP_HOURS}</p>
        <p style="margin:8px 0 0;font-size:13px;color:#6b7280;">The facility is secure — please call us at (470) 622-1392 when you arrive and we'll bring it right out.</p>
      </div>
    `;
  const body = `
    <p style="margin:0 0 4px;font-size:15px;color:#6b7280;">Hi ${escapeHtml(order.customer_name || 'there')},</p>
    <p style="margin:0 0 16px;font-size:15px;color:#6b7280;">Good news — your DTF gang sheet order is ready!</p>
    ${detailsTable(
      detailRow('Order', `#${order.id}`) +
      detailRow('Size', `22in &times; ${order.length_ft} ft`) +
      detailRow('Total', `<strong>${total}</strong>`)
    )}
    ${deliveryBlock}
    <p style="font-size:13px;color:#9ca3af;text-align:center;margin-top:18px;">Questions? Reply to this email or call us at (470) 622-1392.</p>
  `;
  return resend.emails.send({
    from: FROM_EMAIL,
    to: [order.customer_email],
    subject,
    html: baseLayout('Order Ready', body),
  });
}

// Quote / requote from the shop about a DTF gang sheet order — free-form
// admin message, optionally with a Stripe payment link for an adjustment
// amount (file fix fee, size change, etc.). replyTo is the admin inbox so
// the customer's answer lands somewhere monitored.
export async function sendGangSheetQuoteToCustomer({ order, message, amountCents = 0, payUrl = null }) {
  const paragraphs = String(message).split(/\n{2,}/).map((p) =>
    `<p style="margin:0 0 12px;font-size:15px;color:#374151;">${escapeHtml(p).replace(/\n/g, '<br/>')}</p>`
  ).join('');
  const payBlock = amountCents > 0 && payUrl
    ? `
      ${detailsTable(
        detailRow('Order', `#${order.id}`) +
        detailRow('Adjustment', `<strong>${formatCurrency(amountCents / 100)}</strong>`)
      )}
      ${primaryButton(`Pay ${formatCurrency(amountCents / 100)}`, payUrl)}
      <p style="font-size:13px;color:#6b7280;margin-top:12px;">Direct payment link: <a href="${payUrl}" style="color:${BRAND_ORANGE};word-break:break-all;">${payUrl}</a></p>
    `
    : detailsTable(detailRow('Order', `#${order.id}`));
  const body = `
    <p style="margin:0 0 4px;font-size:15px;color:#6b7280;">Hi ${escapeHtml(order.customer_name || 'there')},</p>
    ${paragraphs}
    ${payBlock}
    <p style="font-size:13px;color:#9ca3af;text-align:center;margin-top:18px;">Questions? Reply to this email or call us at (470) 622-1392.</p>
  `;
  return resend.emails.send({
    from: FROM_EMAIL,
    to: [order.customer_email],
    replyTo: ADMIN_EMAIL,
    bcc: [ADMIN_EMAIL],
    subject: `About your DTF order #${order.id}`,
    html: baseLayout('Your DTF Order', body),
  });
}

// Presigned-link handoff for a single gang sheet print file — used by the
// admin builder's File > Email Sheet action and the sheets-folder Email
// button. Lighter than the vendor email: no production spec table, just
// the file and its link.
export async function sendGangSheetLinkEmail({ to, sheetName, url, linkExpiresDays = 7 }) {
  const name = String(sheetName || 'Gang sheet').slice(0, 120);
  const body = `
    <p>Here is the print-ready gang sheet <strong>${escapeHtml(name)}</strong> from T-Shirt Brothers.</p>
    ${detailsTable(
      detailRow('Resolution', '300 DPI') +
      detailRow('Format', 'PNG, transparent background')
    )}
    ${primaryButton('Download print file', url)}
    <p style="font-size:13px;color:#6b7280;margin-top:12px;">Direct link: <a href="${url}" style="color:${BRAND_ORANGE};word-break:break-all;">${url}</a></p>
    <p style="font-size:13px;color:#b91c1c;margin-top:8px;">This download link expires in ${linkExpiresDays} days.</p>
  `;
  return resend.emails.send({
    from: FROM_EMAIL,
    to: [to],
    replyTo: ADMIN_EMAIL,
    bcc: [ADMIN_EMAIL],
    subject: `Gang sheet — ${name}`,
    html: baseLayout('Gang Sheet', body),
  });
}

// Outsource a gang sheet to a print vendor (KolorMatrix, TSTG, ...). The
// email is the production handoff, so it carries the full document spec —
// DPI, pixel + physical dimensions, print count, per-design breakdown —
// plus a download link. replyTo is the shop admin so vendor questions come
// back to a monitored inbox, not noreply@.
export async function sendGangSheetToVendor({
  vendorName,
  vendorEmail,
  reference,        // human label: 'Order #123' or the sheet name
  widthPx,
  heightPx,
  dpi = 300,
  totalPrints = null,
  designs = null,   // [{ name, quantity, printWidthInches }] when known
  downloadUrl,
  linkExpiresDays = null, // null => permanent public link
  note = null,
  fileFormat = 'PNG, transparent background',
}) {
  const widthIn = widthPx ? (widthPx / dpi) : null;
  const heightIn = heightPx ? (heightPx / dpi) : null;
  const sizeLabel = widthIn && heightIn
    ? `${widthIn.toFixed(1)}in &times; ${heightIn.toFixed(1)}in (${(heightIn / 12).toFixed(2)} ft long)`
    : 'see file';
  const designRows = Array.isArray(designs) && designs.length
    ? `
      <p style="margin:18px 0 6px;font-size:14px;font-weight:600;color:${BRAND_DARK};">Designs on this sheet</p>
      ${detailsTable(designs.map((d) => detailRow(
        escapeHtml(d.name || 'design'),
        `${Number(d.quantity) || 1} print${(Number(d.quantity) || 1) === 1 ? '' : 's'}${d.printWidthInches ? ` @ ${escapeHtml(String(d.printWidthInches))}in wide` : ''}`
      )).join(''))}
    `
    : '';
  const expiryLine = linkExpiresDays
    ? `<p style="font-size:13px;color:#b91c1c;margin-top:8px;">This download link expires in ${linkExpiresDays} days — please download promptly.</p>`
    : '';
  const subject = `DTF gang sheet order from T-Shirt Brothers — ${reference}`;
  const body = `
    <p>Hello${vendorName ? ` ${escapeHtml(vendorName)}` : ''},</p>
    <p>Please print the attached DTF gang sheet for T-Shirt Brothers. Full document specs below.</p>
    ${detailsTable(
      detailRow('Reference', escapeHtml(reference)) +
      detailRow('Resolution', `${dpi} DPI`) +
      detailRow('Print size', sizeLabel) +
      (widthPx && heightPx ? detailRow('Pixel dimensions', `${widthPx} &times; ${heightPx} px`) : '') +
      (totalPrints ? detailRow('Number of prints', String(totalPrints)) : '') +
      detailRow('File format', escapeHtml(fileFormat)) +
      (note ? detailRow('Notes', escapeHtml(note)) : '')
    )}
    ${designRows}
    ${primaryButton('Download print file', downloadUrl)}
    <p style="font-size:13px;color:#6b7280;margin-top:12px;">Direct link: <a href="${downloadUrl}" style="color:${BRAND_ORANGE};word-break:break-all;">${downloadUrl}</a></p>
    ${expiryLine}
    <p style="font-size:13px;color:#6b7280;margin-top:18px;">Questions? Reply to this email — it goes straight to Kevin at T-Shirt Brothers, or call (470) 622-1392.</p>
  `;
  return resend.emails.send({
    from: FROM_EMAIL,
    to: [vendorEmail],
    replyTo: ADMIN_EMAIL,
    bcc: [ADMIN_EMAIL],
    subject,
    html: baseLayout('Gang Sheet Print Order', body),
  });
}

// Multi-file variant of sendGangSheetToVendor — one email listing every
// uploaded file with its own presigned download link and per-file specs.
// Used by the admin "send files from my computer" lane.
export async function sendGangSheetVendorFiles({
  vendorName,
  vendorEmail,
  files, // [{ name, downloadUrl, widthPx, heightPx, format, bytes }]
  linkExpiresDays = null,
  note = null,
  dpi = 300,
}) {
  const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`;
  const fileBlocks = files.map((f, i) => {
    const size = f.widthPx && f.heightPx
      ? `${(f.widthPx / dpi).toFixed(1)}in &times; ${(f.heightPx / dpi).toFixed(1)}in (${(f.heightPx / dpi / 12).toFixed(2)} ft) at ${dpi} DPI — ${f.widthPx} &times; ${f.heightPx} px`
      : 'see file';
    return `
      <div style="border:1px solid #e5e7eb;border-radius:8px;padding:14px 16px;margin:0 0 10px;">
        <p style="margin:0 0 6px;font-size:14px;font-weight:600;color:${BRAND_DARK};">${i + 1}. ${escapeHtml(f.name)}</p>
        ${detailsTable(
          detailRow('Format', escapeHtml(f.format || 'see file')) +
          detailRow('Print size', size) +
          (f.bytes ? detailRow('File size', mb(f.bytes)) : '')
        )}
        <p style="margin:8px 0 0;font-size:13px;"><a href="${f.downloadUrl}" style="color:${BRAND_ORANGE};font-weight:600;">Download ${escapeHtml(f.name)}</a></p>
      </div>
    `;
  }).join('');
  const expiryLine = linkExpiresDays
    ? `<p style="font-size:13px;color:#b91c1c;margin-top:8px;">These download links expire in ${linkExpiresDays} days — please download promptly.</p>`
    : '';
  const subject = `DTF print order from T-Shirt Brothers — ${files.length} file${files.length === 1 ? '' : 's'}`;
  const body = `
    <p>Hello${vendorName ? ` ${escapeHtml(vendorName)}` : ''},</p>
    <p>Please print the following ${files.length === 1 ? 'file' : `${files.length} files`} for T-Shirt Brothers. Specs and a download link for each are below.</p>
    ${note ? detailsTable(detailRow('Notes', escapeHtml(note))) : ''}
    ${fileBlocks}
    ${expiryLine}
    <p style="font-size:13px;color:#6b7280;margin-top:18px;">Questions? Reply to this email — it goes straight to Kevin at T-Shirt Brothers, or call (470) 622-1392.</p>
  `;
  return resend.emails.send({
    from: FROM_EMAIL,
    to: [vendorEmail],
    replyTo: ADMIN_EMAIL,
    bcc: [ADMIN_EMAIL],
    subject,
    html: baseLayout('Print Order', body),
  });
}

export async function sendGangSheetPaidToAdmin({ order }) {
  const total = formatCurrency((order.price_cents + order.shipping_cents) / 100);
  const urgencyPrefix = order.tier === 'hot_rush' ? 'HOT RUSH — ' : order.tier === 'rush' ? 'RUSH — ' : '';
  const subject = `💰 ${urgencyPrefix}Gang sheet order #${order.id} (${order.length_ft} ft)`;
  const turnaround = await gangSheetTurnaround(order.tier);
  const shipAddr = order.delivery === 'ship' ? parseShipAddress(order.ship_address) : null;
  const body = `
    <p><strong>${escapeHtml(order.customer_name || '(no name)')} &lt;${escapeHtml(order.customer_email || 'no email')}&gt;</strong> just paid for a gang sheet order.</p>
    ${detailsTable(
      detailRow('Size', `22in &times; ${order.length_ft} ft`) +
      detailRow('Tier', turnaround) +
      detailRow('Delivery', order.delivery === 'ship' ? 'Ship' : 'Pickup') +
      (shipAddr ? detailRow('Ship to', escapeHtml(`${shipAddr.line1 || ''}, ${shipAddr.city || ''}, ${shipAddr.state || ''} ${shipAddr.zip || ''}`)) : '') +
      detailRow('Total', `<strong>${total}</strong>`) +
      (order.note ? detailRow('Note', escapeHtml(order.note)) : '')
    )}
    ${primaryButton('Open in Admin', `${DOMAIN}/admin/dtf-orders`)}
    <p style="font-size:13px;color:#6b7280;margin-top:18px;">Order ID #${order.id}</p>
  `;
  return resend.emails.send({
    from: FROM_EMAIL,
    to: [ADMIN_EMAIL],
    replyTo: order.customer_email || undefined,
    subject,
    html: baseLayout('Gang Sheet Order Paid', body),
  });
}

// Fired when the Stripe webhook confirms a gang-sheet checkout paid but the
// matching gang_sheet_orders row can't be found/updated (see
// server/routes/payments.js's checkout.session.completed handler). Money
// has moved and there is no order to fulfil it against — this needs a
// human immediately, not just a console.error that scrolls off a log.
export async function sendGangSheetOrphanPaymentAlert({ sessionId, orderId, amountCents }) {
  const amount = formatCurrency((amountCents || 0) / 100);
  const subject = '🚨 Stripe payment with no matching gang sheet order';
  const body = `
    <h2 style="margin:0 0 8px;font-size:20px;color:#dc2626;">Payment received, order not found</h2>
    <p style="margin:0 0 16px;font-size:15px;color:#6b7280;">A gang-sheet Stripe checkout completed, but the matching order row could not be marked paid. The customer's card was charged — find and fix this order manually.</p>
    ${detailsTable(
      detailRow('Stripe Session', escapeHtml(sessionId || 'unknown')) +
      detailRow('Order ID', escapeHtml(String(orderId))) +
      detailRow('Amount', amount)
    )}
    <p style="font-size:13px;color:#6b7280;margin-top:18px;">Check the Stripe Dashboard for this session, then the gang_sheet_orders table for order #${escapeHtml(String(orderId))}.</p>
  `;
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: [ADMIN_EMAIL],
      subject,
      html: baseLayout('Orphan Payment Alert', body),
    });
    console.log(`[Email] Gang sheet orphan payment alert sent for order ${orderId}`);
  } catch (err) {
    console.error('[Email] Failed to send gang sheet orphan payment alert:', err);
    throw err;
  }
}
