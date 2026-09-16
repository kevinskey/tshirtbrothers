-- Fulfillment: how the finished order leaves the shop. Chosen by the
-- customer on the balance-payment page (pickup vs ship), stamped by the
-- admin's Mark Picked Up / Mark Shipped actions. shipping_address (jsonb)
-- already exists from quote intake and holds the ship-to when shipping.
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS fulfillment_method TEXT;   -- 'pickup' | 'ship'
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS picked_up_at     TIMESTAMPTZ;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS shipped_at       TIMESTAMPTZ;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS tracking_number  TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS tracking_carrier TEXT;
