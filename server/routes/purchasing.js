import { Router } from 'express';
import pool from '../db.js';
import { authenticate, adminOnly } from '../middleware/auth.js';
import {
  fetchStyleSkus,
  fetchStyleInventory,
  placeSsOrder,
  fetchSsOrders,
  fetchPaymentProfiles,
  fetchSsOrderHistory,
} from '../services/ssActivewear.js';

const router = Router();
router.use(authenticate, adminOnly);

// Shop address — default ship-to for restock POs. The builder lets the
// admin override this per-order (e.g. drop-ship to a customer).
const SHOP_ADDRESS = {
  customer: 'T-Shirt Brothers',
  attn: 'Receiving',
  address: '6010 Renaissance Parkway',
  city: 'Fairburn',
  state: 'GA',
  zip: '30213',
  residential: false,
};

router.get('/defaults', (req, res) => {
  res.json({ shipTo: SHOP_ADDRESS });
});

// GET /payment-profiles?email= — saved cards/bank accounts on the S&S
// account. Accounts without Net terms must attach one to every order.
router.get('/payment-profiles', async (req, res, next) => {
  try {
    const email = (req.query.email || '').toString().trim();
    if (!email) return res.status(400).json({ error: 'email is required' });
    res.json(await fetchPaymentProfiles(email));
  } catch (err) {
    next(err);
  }
});

// GET /skus/:styleId — every orderable SKU for a style with live price and
// per-warehouse stock, so the builder can show a color/size grid.
router.get('/skus/:styleId', async (req, res, next) => {
  try {
    const { styleId } = req.params;
    const [skus, inventory] = await Promise.all([
      fetchStyleSkus(styleId),
      fetchStyleInventory(styleId),
    ]);
    res.json(
      skus.map((s) => ({
        ...s,
        stock: inventory[s.sku]?.total ?? 0,
        warehouses: inventory[s.sku]?.warehouses ?? {},
      }))
    );
  } catch (err) {
    next(err);
  }
});

// GET /quote-lines/:quoteId — a quote's items shaped for PO prefill:
// one entry per (style, color, size) with the S&S style id when the
// product is linked to the catalog. The client resolves each to a SKU
// via /skus/:styleId.
router.get('/quote-lines/:quoteId', async (req, res, next) => {
  try {
    const { quoteId } = req.params;
    const quote = await pool.query(
      'SELECT id, customer_name, customer_email FROM quotes WHERE id = $1',
      [quoteId]
    );
    if (quote.rows.length === 0) return res.status(404).json({ error: 'Quote not found' });

    const { rows: items } = await pool.query(
      `SELECT qi.product_name, qi.color, qi.sizes, qi.quantity, p.ss_id
         FROM quote_items qi
         LEFT JOIN products p ON p.id = qi.product_id
        WHERE qi.quote_id = $1
        ORDER BY qi.position`,
      [quoteId]
    );

    let source = items;
    if (source.length === 0) {
      // Legacy single-product quotes: derive one item from the quote row.
      const { rows } = await pool.query(
        `SELECT COALESCE(p.name, 'Product') AS product_name, q.color, q.sizes, q.quantity, p.ss_id
           FROM quotes q LEFT JOIN products p ON p.id = q.product_id
          WHERE q.id = $1`,
        [quoteId]
      );
      source = rows;
    }

    const lines = [];
    for (const item of source) {
      const sizes = typeof item.sizes === 'string' ? JSON.parse(item.sizes) : (item.sizes || []);
      const perSize = Array.isArray(sizes) ? sizes.filter((s) => s && s.size && Number(s.quantity) > 0) : [];
      if (perSize.length > 0) {
        for (const s of perSize) {
          lines.push({
            styleId: item.ss_id || null,
            productName: item.product_name || '',
            color: item.color || '',
            size: s.size,
            qty: Number(s.quantity),
          });
        }
      } else if (Number(item.quantity) > 0) {
        lines.push({
          styleId: item.ss_id || null,
          productName: item.product_name || '',
          color: item.color || '',
          size: '',
          qty: Number(item.quantity),
        });
      }
    }

    res.json({ quote: quote.rows[0], lines });
  } catch (err) {
    next(err);
  }
});

// GET /invoice-lines/:invoiceId — an invoice's items shaped for PO prefill.
// Invoice items carry no product_id, only free-text description (+ optional
// color/size), so the S&S style is resolved by best-effort name match
// against the catalog; unmatched lines come back with styleId null and the
// builder lets the admin link a product manually.
router.get('/invoice-lines/:invoiceId', async (req, res, next) => {
  try {
    const { invoiceId } = req.params;
    const invQ = await pool.query(
      'SELECT id, invoice_number, customer_name, items FROM invoices WHERE id = $1',
      [invoiceId]
    );
    if (invQ.rows.length === 0) return res.status(404).json({ error: 'Invoice not found' });
    const inv = invQ.rows[0];
    const items = typeof inv.items === 'string' ? JSON.parse(inv.items) : (inv.items || []);

    const { rows: catalog } = await pool.query(
      "SELECT ss_id, name, brand FROM products WHERE ss_id IS NOT NULL AND ss_id <> ''"
    );
    const matchStyle = (description) => {
      const desc = (description || '').toLowerCase();
      if (!desc) return null;
      let best = null;
      let bestLen = 0;
      for (const p of catalog) {
        const name = (p.name || '').toLowerCase();
        const branded = `${(p.brand || '').toLowerCase()} ${name}`.trim();
        // Either string containing the other counts; prefer the longest
        // matched name so "Heavy Blend Hooded Sweatshirt" beats "T-Shirt".
        if (
          (name.length >= 6 && (desc.includes(name) || name.includes(desc))) ||
          (branded.length >= 6 && (desc.includes(branded) || branded.includes(desc)))
        ) {
          if (name.length > bestLen) {
            best = p;
            bestLen = name.length;
          }
        }
      }
      return best ? { styleId: best.ss_id, matchedName: `${best.brand ? `${best.brand} ` : ''}${best.name}` } : null;
    };

    const lines = [];
    for (const item of Array.isArray(items) ? items : []) {
      const qty = Number(item.quantity) || 0;
      if (qty <= 0) continue;
      const match = matchStyle(item.description);
      lines.push({
        styleId: match?.styleId || null,
        productName: match?.matchedName || item.description || '',
        color: (item.color || '').trim(),
        size: (item.size || '').trim(),
        qty,
      });
    }

    res.json({
      invoice: { id: inv.id, invoice_number: inv.invoice_number, customer_name: inv.customer_name },
      lines,
    });
  } catch (err) {
    next(err);
  }
});

// POST /orders — place the PO with S&S and record it.
// body: { lines: [{sku, qty, note?}], shipTo, shippingMethod?, poNumber?,
//         testOrder?, quoteId?, notes?, warehouse? }
router.post('/orders', async (req, res, next) => {
  try {
    const {
      lines, shipTo, shippingMethod = '1', poNumber, testOrder = false,
      quoteId, invoiceId, notes, warehouse, paymentProfile,
    } = req.body;

    const cleanLines = (Array.isArray(lines) ? lines : [])
      .map((l) => ({ sku: String(l.sku || '').trim(), qty: parseInt(l.qty, 10) || 0 }))
      .filter((l) => l.sku && l.qty > 0);
    if (cleanLines.length === 0) {
      return res.status(400).json({ error: 'At least one line with a SKU and qty is required' });
    }
    const addr = shipTo && shipTo.address ? shipTo : SHOP_ADDRESS;
    if (!addr.address || !addr.city || !addr.state || !addr.zip) {
      return res.status(400).json({ error: 'Ship-to address, city, state, and zip are required' });
    }

    const po = poNumber?.trim() || `TSB-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now() % 10000}`;

    const payload = {
      shippingAddress: {
        customer: addr.customer || 'T-Shirt Brothers',
        attn: addr.attn || '',
        address: addr.address,
        city: addr.city,
        state: addr.state,
        zip: String(addr.zip),
        residential: addr.residential !== false,
      },
      shippingMethod: String(shippingMethod || '1'),
      poNumber: po,
      testOrder: !!testOrder,
      ...(paymentProfile?.profileID && paymentProfile?.email
        ? { paymentProfile: { email: paymentProfile.email, profileID: Number(paymentProfile.profileID) } }
        : {}),
      autoselectWarehouse: !warehouse,
      rejectLineErrors: true,
      lines: cleanLines.map((l) => ({
        identifier: l.sku,
        qty: l.qty,
        ...(warehouse ? { warehouseAbbr: warehouse } : {}),
      })),
    };

    const ssOrders = await placeSsOrder(payload);

    const summarize = (o) => ({
      orderNumber: o.orderNumber,
      guid: o.guid,
      warehouseAbbr: o.warehouseAbbr,
      orderStatus: o.orderStatus,
      expectedDeliveryDate: o.expectedDeliveryDate,
      subtotal: Number(o.subtotal) || 0,
      shipping: Number(o.shipping) || 0,
      tax: Number(o.tax) || 0,
      total: Number(o.total) || 0,
    });
    const sums = ssOrders.map(summarize);
    const totals = sums.reduce(
      (acc, s) => ({
        subtotal: acc.subtotal + s.subtotal,
        shipping: acc.shipping + s.shipping,
        tax: acc.tax + s.tax,
        total: acc.total + s.total,
      }),
      { subtotal: 0, shipping: 0, tax: 0, total: 0 }
    );
    const expected = sums
      .map((s) => s.expectedDeliveryDate)
      .filter(Boolean)
      .sort()
      .pop() || null;

    const { rows } = await pool.query(
      `INSERT INTO purchase_orders
         (quote_id, invoice_id, po_number, is_test, status, ship_to, shipping_method,
          lines, ss_orders, subtotal, shipping, tax, total, expected_delivery,
          notes, placed_by)
       VALUES ($1,$16,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING *`,
      [
        quoteId || null, po, !!testOrder,
        testOrder ? 'test' : 'submitted',
        JSON.stringify(payload.shippingAddress), payload.shippingMethod,
        JSON.stringify(req.body.lines || cleanLines), JSON.stringify(sums),
        totals.subtotal, totals.shipping, totals.tax, totals.total,
        expected ? expected.slice(0, 10) : null,
        notes || null, req.user?.email || null,
        invoiceId || null,
      ]
    );

    res.status(201).json({ purchaseOrder: rows[0], ssOrders: sums });
  } catch (err) {
    if (err.ssResponse !== undefined) {
      return res.status(422).json({ error: err.message, ssResponse: err.ssResponse });
    }
    next(err);
  }
});

// POST /import-history — pull past S&S orders (placed on their website,
// by phone, or via the API) into purchase_orders. Walks backward in
// 90-day invoice-date windows, deduping on S&S order number. body:
// {months?: number} (default 12, max 36).
router.post('/import-history', async (req, res, next) => {
  try {
    const months = Math.min(36, Math.max(1, parseInt(req.body?.months, 10) || 12));

    // Every S&S order number we already have, from any PO's ss_orders array.
    const { rows: existing } = await pool.query(
      `SELECT DISTINCT jsonb_array_elements(ss_orders)->>'orderNumber' AS num FROM purchase_orders`
    );
    const known = new Set(existing.map((r) => r.num).filter(Boolean));

    const fmt = (d) => d.toISOString().slice(0, 10);
    const now = new Date();
    let imported = 0;
    let scanned = 0;

    for (let back = 0; back < months; back += 3) {
      const end = new Date(now);
      end.setMonth(end.getMonth() - back);
      const start = new Date(now);
      start.setMonth(start.getMonth() - Math.min(back + 3, months));
      const orders = await fetchSsOrderHistory(fmt(start), fmt(end));
      scanned += orders.length;

      for (const o of orders) {
        if (!o.orderNumber || known.has(String(o.orderNumber))) continue;
        known.add(String(o.orderNumber));

        const statusRaw = (o.orderStatus || '').toLowerCase();
        const status = statusRaw.includes('cancel') ? 'cancelled' : 'received';
        const lines = (o.lines || []).map((l) => ({
          sku: l.sku,
          qty: l.qtyOrdered ?? l.qtyShipped ?? 0,
          productName: [l.brandName, l.styleName, l.title].filter(Boolean).join(' '),
          color: l.colorName || '',
          size: l.sizeName || '',
          price: Number(l.price) || null,
        }));
        const summary = [{
          orderNumber: o.orderNumber,
          guid: o.guid,
          warehouseAbbr: o.warehouseAbbr,
          orderStatus: o.orderStatus,
          expectedDeliveryDate: o.expectedDeliveryDate,
          invoiceNumber: o.invoiceNumber || null,
          subtotal: Number(o.subtotal) || 0,
          shipping: Number(o.shipping) || 0,
          tax: Number(o.tax) || 0,
          total: Number(o.total) || 0,
        }];
        const tracking = [{
          orderNumber: o.orderNumber,
          carrier: o.shippingCarrier || null,
          method: o.shippingMethod || null,
          trackingNumbers: (o.boxes || []).map((b) => b.trackingNumber).filter(Boolean)
            .filter((v, i, a) => a.indexOf(v) === i),
          invoiceNumber: o.invoiceNumber || null,
        }];

        await pool.query(
          `INSERT INTO purchase_orders
             (po_number, is_test, status, ship_to, shipping_method, lines,
              ss_orders, tracking, subtotal, shipping, tax, total,
              expected_delivery, notes, placed_by, created_at)
           VALUES ($1,FALSE,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'s&s history import',$14)`,
          [
            o.poNumber?.trim() || `SS-${o.orderNumber}`,
            status,
            JSON.stringify(o.shippingAddress || {}),
            '1',
            JSON.stringify(lines),
            JSON.stringify(summary),
            JSON.stringify(tracking),
            Number(o.subtotal) || 0, Number(o.shipping) || 0,
            Number(o.tax) || 0, Number(o.total) || 0,
            o.expectedDeliveryDate ? String(o.expectedDeliveryDate).slice(0, 10) : null,
            `Imported from S&S history (${o.orderType || 'order'}, invoice ${o.invoiceNumber || 'n/a'})`,
            o.orderDate || new Date(),
          ]
        );
        imported++;
      }
    }

    res.json({ imported, scanned, months });
  } catch (err) {
    next(err);
  }
});

// GET /orders — PO history, newest first.
router.get('/orders', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT po.*, q.customer_name AS quote_customer,
              i.invoice_number AS invoice_number, i.customer_name AS invoice_customer
         FROM purchase_orders po
         LEFT JOIN quotes q ON q.id = po.quote_id
         LEFT JOIN invoices i ON i.id = po.invoice_id
        ORDER BY po.created_at DESC
        LIMIT 200`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST /orders/:id/refresh — pull current status + tracking from S&S.
router.post('/orders/:id/refresh', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM purchase_orders WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'PO not found' });
    const po = rows[0];

    const ssOrders = Array.isArray(po.ss_orders) ? po.ss_orders : [];
    const orderNumbers = ssOrders.map((o) => o.orderNumber).filter(Boolean);
    const live = await fetchSsOrders(
      orderNumbers.length ? { orderNumbers } : { poNumber: po.po_number }
    );

    const updatedOrders = live.map((o) => ({
      orderNumber: o.orderNumber,
      guid: o.guid,
      warehouseAbbr: o.warehouseAbbr,
      orderStatus: o.orderStatus,
      expectedDeliveryDate: o.expectedDeliveryDate,
      subtotal: Number(o.subtotal) || 0,
      shipping: Number(o.shipping) || 0,
      tax: Number(o.tax) || 0,
      total: Number(o.total) || 0,
    }));
    const tracking = live.map((o) => ({
      orderNumber: o.orderNumber,
      carrier: o.shippingCarrier || null,
      method: o.shippingMethod || null,
      trackingNumbers: (o.boxes || [])
        .map((b) => b.trackingNumber)
        .filter(Boolean)
        .filter((v, i, a) => a.indexOf(v) === i),
      invoiceNumber: o.invoiceNumber || null,
    }));

    // Roll the per-warehouse statuses up to one PO status: any shipment
    // still open keeps the PO open; everything shipped/invoiced marks it
    // received-ready.
    const statuses = updatedOrders.map((o) => (o.orderStatus || '').toLowerCase());
    let status = po.status;
    if (po.is_test) status = 'test';
    else if (statuses.length && statuses.every((s) => s.includes('ship') || s.includes('invoice') || s.includes('complete'))) status = 'shipped';
    else if (statuses.some((s) => s.includes('cancel'))) status = statuses.every((s) => s.includes('cancel')) ? 'cancelled' : po.status;
    else if (statuses.length) status = 'in_progress';

    const { rows: updated } = await pool.query(
      `UPDATE purchase_orders
          SET ss_orders = $2, tracking = $3, status = $4, updated_at = NOW()
        WHERE id = $1 RETURNING *`,
      [po.id, JSON.stringify(updatedOrders), JSON.stringify(tracking), status]
    );
    res.json(updated[0]);
  } catch (err) {
    next(err);
  }
});

// PUT /orders/:id — admin bookkeeping (mark received, edit notes).
router.put('/orders/:id', async (req, res, next) => {
  try {
    const { status, notes } = req.body;
    const allowed = ['submitted', 'in_progress', 'shipped', 'received', 'cancelled', 'test'];
    if (status && !allowed.includes(status)) {
      return res.status(400).json({ error: `status must be one of ${allowed.join(', ')}` });
    }
    const { rows } = await pool.query(
      `UPDATE purchase_orders
          SET status = COALESCE($2, status),
              notes = COALESCE($3, notes),
              updated_at = NOW()
        WHERE id = $1 RETURNING *`,
      [req.params.id, status || null, notes ?? null]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'PO not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

export default router;
