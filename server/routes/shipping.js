import { Router } from 'express';
import EasyPostClient from '@easypost/api';
import { authenticate, adminOnly } from '../middleware/auth.js';
import pool from '../db.js';

const router = Router();

function getClient() {
  const key = process.env.EASYPOST_API_KEY;
  if (!key) throw new Error('EasyPost not configured');
  return new EasyPostClient(key);
}

const FROM_ADDRESS = {
  name: 'TShirt Brothers',
  street1: '6010 Renaissance Parkway',
  city: 'Fairburn',
  state: 'GA',
  zip: '30213',
  country: 'US',
  phone: '4706224845',
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
    const { shipmentId, rateId, quoteId } = req.body;

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

    // Save tracking info to quote if quoteId provided
    if (quoteId) {
      await pool.query(
        `UPDATE quotes SET
          notes = COALESCE(notes, '') || $1,
          status = CASE WHEN status != 'completed' THEN 'approved' ELSE status END
        WHERE id = $2`,
        [`\nTracking: ${result.trackingNumber} (${result.carrier} ${result.service})`, quoteId]
      );
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
