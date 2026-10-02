-- Move every store off the 'per_campaign_close' payout cadence.
--
-- storePayoutJob's isDueToday() returns false for that value, so the
-- nightly job can never pay those stores — and it was the DEFAULT that
-- adminGroupStores / gleeworldProvisioning stamped on every new group
-- store. Eight agreements (Sensory Seasons, Kedron PTO, and the
-- GleeWorld-provisioned stores) were sitting on a schedule that would
-- never fire. Monthly pays on the 1st; the admin "Pay now" button covers
-- a campaign that wraps mid-month.
--
-- Idempotent: once converted there is nothing left to match.
UPDATE store_agreements
   SET payout_terms_json = jsonb_set(
         COALESCE(payout_terms_json, '{}'::jsonb),
         '{cadence}',
         '"monthly"'
       )
 WHERE kind = 'store'
   AND payout_terms_json->>'cadence' = 'per_campaign_close';
