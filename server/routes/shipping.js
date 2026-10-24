import { Router } from 'express';
import EasyPostClient from '@easypost/api';
import { authenticate, adminOnly } from '../middleware/auth.js';
import pool from '../db.js';
import { notifyShipped } from '../services/shipNotify.js';

const router = Router();

// Exported so other admin routes (store orders) buy labels through the
// same account and ship-from address instead of standing up a second one.
export function getClient() {
  const key = process.env.EASYPOST_API_KEY;
  if (!key) throw new Error('EasyPost not configured');
  return new EasyPostClient(key);
}

export const FROM_ADDRESS = {
  name: 'TShirt Brothers',
  street1: '6010 Renaissance Parkway',
  city: 'Fairburn',
  state: 'GA',
  zip: '30213',
  country: 'US',
  phone: '4706221392',
  email: 'kevin@tshirtbrothers.com',
};

// POST /rates - Get shipping rates for an order
router.post('/rates', async (req, res, next) => {
  try {
    const { toAddress, weight, length, width, height } = req.body;

    if (!toAddress || !weight) {
      return res.status(400).json({ error: 'toAddress and weight are required' });
    }

    const client = getClient();

    const shipment = await client.Shipment.create({
      from_address: FROM_ADDRESS,
      to_address: {
        name: toAddress.name || 'Customer',
        street1: toAddress.street1,
        street2: toAddress.street2 || '',
        city: toAddress.city,
        state: toAddress.state,
        zip: toAddress.zip,
        country: toAddress.country || 'US',
        phone: toAddress.phone || '',
      },
      parcel: {
        length: length || 12,
        width: width || 10,
        height: height || 4,
        weight: weight, // in ounces
      },
    });

    const rates = shipment.rates.map(r => ({
      id: r.id,
      carrier: r.carrier,
      service: r.service,
      rate: parseFloat(r.rate),
      deliveryDays: r.delivery_days,
      deliveryDate: r.delivery_date,
    })).sort((a, b) => a.rate - b.rate);

    res.json({ shipmentId: shipment.id, rates });
  } catch (err) {
    next(err);
  }
});

// POST /buy - Buy a shipping label (admin only)
router.post('/buy', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { shipmentId, rateId, quoteId, storeOrderId } = req.body;

    if (!shipmentId || !rateId) {
      return res.status(400).json({ error: 'shipmentId and rateId are required' });
    }

    const client = getClient();
    const shipment = await client.Shipment.retrieve(shipmentId);
    const purchased = await client.Shipment.buy(shipment.id, rateId);

    const result = {
      trackingNumber: purchased.tracking_code,
      trackingUrl: purchased.tracker?.public_url || `https://track.easypost.com/djE6dHJrXzEyMzQ1Njc4OTAx/${purchased.tracking_code}`,
      labelUrl: purchased.postage_label?.label_url,
      carrier: purchased.selected_rate?.carrier,
      service: purchased.selected_rate?.service,
      rate: purchased.selected_rate?.rate,
    };

    // Record tracking, then tell the customer. Status is still left to the
    // fulfill / PATCH endpoints — buying postage isn't the same as saying
    // the order is complete — but the notification no longer waits for
    // them: a bought label means the package is going out, and which
    // screen it was bought from shouldn't decide whether the customer
    // hears about it. notifyShipped is idempotent, so the later status
    // change won't send a second copy.
    if (quoteId) {
      await pool.query(
        `UPDATE quotes SET tracking_number = $1, tracking_carrier = $2 WHERE id = $3`,
        [result.trackingNumber, result.carrier || null, quoteId]
      );
      result.customerNotified = (await notifyShipped('quote', quoteId)).sent;
    }
    if (storeOrderId) {
      await pool.query(
        `UPDATE store_orders
            SET tracking_number = $1, tracking_carrier = $2, label_url = $3
          WHERE id = $4`,
        [result.trackingNumber, result.carrier || null, result.labelUrl || null, storeOrderId],
      );
      result.customerNotified = (await notifyShipped('store_order', storeOrderId)).sent;
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /track/:trackingNumber - Track a shipment
router.get('/track/:trackingNumber', async (req, res, next) => {
  try {
    const { trackingNumber } = req.params;
    const client = getClient();

    const trackers = await client.Tracker.create({ tracking_code: trackingNumber });

    res.json({
      trackingNumber: trackers.tracking_code,
      status: trackers.status,
      carrier: trackers.carrier,
      estDeliveryDate: trackers.est_delivery_date,
      publicUrl: trackers.public_url,
      trackingDetails: trackers.tracking_details?.map(d => ({
        message: d.message,
        status: d.status,
        datetime: d.datetime,
        city: d.tracking_location?.city,
        state: d.tracking_location?.state,
      })) || [],
    });
  } catch (err) {
    next(err);
  }
});

export default router;
