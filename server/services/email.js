import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@tshirtbrothers.com';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'kevin@tshirtbrothers.com';
const DOMAIN = process.env.DOMAIN || 'https://tshirtbrothers.com';

// ── Shared styles ────────────────────────────────────────────────────────────

const BRAND_ORANGE = '#f97316';
const BRAND_DARK = '#111827';

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
    <img src="https://tshirtbrothers.atl1.digitaloceanspaces.com/tsb-logo.png" alt="TShirt Brothers" style="height:48px;" />
  </td></tr>
  <!-- Body -->
  <tr><td style="padding:32px;">
    ${bodyHtml}
  </td></tr>
  <!-- Footer -->
  <tr><td style="background:#f9fafb;padding:24px 32px;border-top:1px solid #e5e7eb;">
    <p style="margin:0 0 4px;font-size:13px;color:#6b7280;text-align:center;">T-Shirt Brothers &mdash; Custom Apparel &amp; Screen Printing</p>
    <p style="margin:0 0 4px;font-size:13px;color:#6b7280;text-align:center;">Phone: (555) 123-4567 &bull; Email: info@tshirtbrothers.com</p>
    <p style="margin:0;font-size:13px;color:#9ca3af;text-align:center;">123 Print Ave, Dallas TX 75001</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

function formatCurrency(amount) {
  return `$${Number(amount).toFixed(2)}`;
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

    ${primaryButton('View in Admin Dashboard', `${DOMAIN}/admin`)}
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
export async function sendQuotePriceToCustomer(quote, priceDetails) {
  const { basePrice, printingCost, designFee, rushFee, total, message } = priceDetails;
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

  const priceRows =
    detailRow('Base Price (apparel)', formatCurrency(basePrice)) +
    detailRow('Printing Cost', formatCurrency(printingCost)) +
    (Number(designFee) > 0 ? detailRow('Design Fee', formatCurrency(designFee)) : '') +
    (Number(rushFee) > 0 ? detailRow('Rush Fee', formatCurrency(rushFee)) : '') +
    `<tr>
      <td style="padding:10px 12px;font-size:15px;color:${BRAND_DARK};font-weight:700;">Total</td>
      <td style="padding:10px 12px;font-size:15px;color:${BRAND_ORANGE};font-weight:700;">${formatCurrency(total)}</td>
    </tr>`;

  const body = `
    <h2 style="margin:0 0 8px;font-size:20px;color:${BRAND_DARK};">Your Custom Printing Quote</h2>
    <p style="margin:0 0 4px;font-size:15px;color:#6b7280;">Hi ${quote.customer_name},</p>
    <p style="margin:0 0 20px;font-size:15px;color:#6b7280;">Thank you for your interest! Here is your personalized quote from T-Shirt Brothers.</p>

    ${message ? `<div style="background:#f0fdf4;border-left:4px solid #22c55e;padding:12px 16px;border-radius:0 8px 8px 0;margin-bottom:20px;">
      <p style="margin:0;font-size:14px;color:#166534;">${message}</p>
    </div>` : ''}

    ${quote.design_url ? `
    <div style="text-align:center;margin-bottom:20px;">
      <p style="margin:0 0 8px;font-size:14px;font-weight:600;color:${BRAND_DARK};">Your Design</p>
      <img src="${quote.design_url}" alt="Your custom design" style="max-width:280px;width:100%;border-radius:12px;border:1px solid #e5e7eb;" />
    </div>
    ` : ''}

    <h3 style="margin:0 0 8px;font-size:16px;color:${BRAND_DARK};">Order Details</h3>
    ${detailsTable(
      detailRow('Product', quote.product_name || 'Custom Apparel') +
      (quote.color ? detailRow('Color', quote.color) : '') +
      detailRow('Quantity', quote.quantity) +
      detailRow('Sizes', sizesDisplay) +
      detailRow('Print Areas', printAreasDisplay) +
      detailRow('Design Type', quote.design_type || 'N/A')
    )}

    <h3 style="margin:0 0 8px;font-size:16px;color:${BRAND_DARK};">Price Breakdown</h3>
    ${detailsTable(priceRows)}

    <div style="background:#fef3c7;border-radius:8px;padding:16px;margin:20px 0;text-align:center;">
      <p style="margin:0 0 4px;font-size:15px;font-weight:600;color:#92400e;">50% Deposit Required to Begin</p>
      <p style="margin:0;font-size:22px;font-weight:700;color:${BRAND_DARK};">${formatCurrency(deposit)}</p>
    </div>

    ${primaryButton('Accept & Pay Deposit', acceptUrl)}

    <p style="text-align:center;margin:0;">
      <a href="${declineUrl}" style="color:#6b7280;font-size:13px;text-decoration:underline;">Decline this quote</a>
    </p>

    <p style="margin:24px 0 0;font-size:13px;color:#9ca3af;text-align:center;">This quote is valid for 30 days. If you have questions, reply to this email or call us.</p>
  `;

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: [quote.customer_email],
      subject: 'Your Custom Printing Quote from TShirt Brothers',
      html: baseLayout('Your Quote', body),
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

    ${primaryButton('View in Admin Dashboard', `${DOMAIN}/admin`)}
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

/**
 * Sends status update email to customer.
 */
export async function sendQuoteStatusUpdate(quote, newStatus) {
  const subjectMap = {
    approved: 'Your Quote Has Been Approved - TShirt Brothers',
    completed: 'Your Order Is Ready! - TShirt Brothers',
    rejected: 'Update on Your Quote Request - TShirt Brothers',
  };

  const headingMap = {
    approved: 'Your Quote Has Been Approved',
    completed: 'Your Order Is Ready!',
    rejected: 'Update on Your Quote Request',
  };

  const messageMap = {
    approved: `<p style="margin:0 0 16px;font-size:15px;color:#6b7280;">Great news! Your custom printing quote has been approved. We're ready to get started as soon as we receive your deposit.</p>`,
    completed: `<p style="margin:0 0 16px;font-size:15px;color:#6b7280;">Your order is complete and ready for pickup or shipping! We hope you love the finished product.</p>`,
    rejected: `<p style="margin:0 0 16px;font-size:15px;color:#6b7280;">Unfortunately, we were unable to fulfill your quote request at this time. Please feel free to reach out if you have any questions or would like to submit a new request.</p>`,
  };

  const subject = subjectMap[newStatus] || `Quote Update - TShirt Brothers`;
  const heading = headingMap[newStatus] || 'Quote Status Update';
  const statusMessage = messageMap[newStatus] || `<p style="margin:0 0 16px;font-size:15px;color:#6b7280;">Your quote status has been updated to: <strong>${newStatus}</strong>.</p>`;

  const body = `
    <h2 style="margin:0 0 8px;font-size:20px;color:${BRAND_DARK};">${heading}</h2>
    <p style="margin:0 0 16px;font-size:15px;color:#6b7280;">Hi ${quote.customer_name},</p>
    ${statusMessage}

    ${detailsTable(
      detailRow('Product', quote.product_name || 'Custom Apparel') +
      detailRow('Quantity', quote.quantity) +
      (quote.estimated_price ? detailRow('Total', formatCurrency(quote.estimated_price)) : '') +
      detailRow('Status', newStatus.charAt(0).toUpperCase() + newStatus.slice(1))
    )}

    ${newStatus === 'completed'
      ? `<p style="margin:16px 0 0;font-size:15px;color:#6b7280;text-align:center;">Thank you for choosing T-Shirt Brothers!</p>`
      : primaryButton('Contact Us', `mailto:info@tshirtbrothers.com`)
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
 * Sends balance payment request to customer.
 */
export async function sendBalanceDueToCustomer(quote, { total, depositPaid, balanceDue }) {
  const payUrl = `${DOMAIN}/payment/checkout?quote=${quote.id}&token=${quote.accept_token}&type=balance`;

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

    <p style="margin:24px 0 0;font-size:13px;color:#9ca3af;text-align:center;">If you have questions, reply to this email or call us at (470) 622-4845.</p>
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

export async function sendPaidInvoiceReceipt(invoice) {
  const items = Array.isArray(invoice.items) ? invoice.items : (() => { try { return JSON.parse(invoice.items || '[]'); } catch { return []; } })();
  const itemsHtml = items.map((it) => `
    <tr>
      <td style="padding:8px 12px;font-size:13px;color:#374151;">${it.description || '—'}</td>
      <td style="padding:8px 12px;font-size:13px;color:#6b7280;text-align:center;">${it.quantity || 1}</td>
      <td style="padding:8px 12px;font-size:13px;color:#6b7280;text-align:right;">${formatCurrency(Number(it.unit_price || 0))}</td>
      <td style="padding:8px 12px;font-size:13px;color:${BRAND_DARK};text-align:right;font-weight:600;">${formatCurrency(Number(it.total || 0))}</td>
    </tr>
  `).join('');

  const invoiceUrl = `${DOMAIN}/invoice/view/${invoice.id}`;
  const body = `
    <h2 style="margin:0 0 8px;font-size:20px;color:${BRAND_DARK};">Payment Received — Thank You!</h2>
    <p style="margin:0 0 4px;font-size:15px;color:#6b7280;">Hi ${invoice.customer_name || 'there'},</p>
    <p style="margin:0 0 20px;font-size:15px;color:#6b7280;">We've received your balance payment. Your order is paid in full and moving into production. Here's your receipt:</p>

    <div style="border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:16px 0;background:#f9fafb;">
      <p style="margin:0;font-size:13px;color:#6b7280;">Invoice</p>
      <p style="margin:0 0 12px;font-size:18px;font-weight:700;color:${BRAND_DARK};">${invoice.invoice_number}</p>
      <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
        <thead>
          <tr style="background:#f3f4f6;">
            <th style="padding:8px 12px;font-size:11px;text-transform:uppercase;color:#6b7280;text-align:left;">Item</th>
            <th style="padding:8px 12px;font-size:11px;text-transform:uppercase;color:#6b7280;">Qty</th>
            <th style="padding:8px 12px;font-size:11px;text-transform:uppercase;color:#6b7280;text-align:right;">Unit</th>
            <th style="padding:8px 12px;font-size:11px;text-transform:uppercase;color:#6b7280;text-align:right;">Total</th>
          </tr>
        </thead>
        <tbody>${itemsHtml || `<tr><td colspan="4" style="padding:12px;text-align:center;color:#9ca3af;font-size:13px;">—</td></tr>`}</tbody>
      </table>
      <div style="margin-top:12px;padding-top:12px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;">
        <span style="font-size:14px;color:#6b7280;">Paid</span>
        <span style="font-size:18px;font-weight:700;color:#16a34a;">${formatCurrency(Number(invoice.amount_paid || 0))}</span>
      </div>
    </div>

    ${primaryButton('View / Print Invoice', invoiceUrl)}

    <p style="margin:24px 0 0;font-size:13px;color:#9ca3af;text-align:center;">Keep this email as your receipt. Questions? Reply to this email or call (470) 622-4845.</p>
  `;
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: [invoice.customer_email],
      subject: `Receipt - TShirt Brothers Invoice ${invoice.invoice_number}`,
      html: baseLayout('Payment Received', body),
    });
    console.log('[Email] Paid invoice receipt sent to ' + invoice.customer_email);
  } catch (err) {
    console.error('[Email] Failed to send paid invoice receipt:', err);
    throw err;
  }
}

export async function sendMockupForApproval(mockup, approveUrl) {
  const productImg = mockup.product_image_url || '';
  const graphic = mockup.graphic_url || '';
  const placement = typeof mockup.placement === 'string' ? JSON.parse(mockup.placement) : (mockup.placement || { x: 35, y: 30, width: 30 });

  const body = `
    <h2 style="margin:0 0 8px;font-size:20px;color:${BRAND_DARK};">Mockup Ready for Your Approval</h2>
    <p style="margin:0 0 4px;font-size:15px;color:#6b7280;">Hi ${mockup.customer_name || 'there'},</p>
    <p style="margin:0 0 20px;font-size:15px;color:#6b7280;">We put together a mockup of your design on the product you picked. Please take a look and let us know if it's approved, or what you'd like changed.</p>

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

    <p style="margin:24px 0 0;font-size:13px;color:#9ca3af;text-align:center;">Questions? Reply to this email or call us at (470) 622-4845.</p>
  `;

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: [mockup.customer_email],
      subject: 'Mockup Approval - TShirt Brothers' + (mockup.name ? ` - ${mockup.name}` : ''),
      html: baseLayout('Mockup Approval', body),
    });
    console.log('[Email] Mockup approval sent to ' + mockup.customer_email);
  } catch (err) {
    console.error('[Email] Failed to send mockup approval:', err);
    throw err;
  }
}
