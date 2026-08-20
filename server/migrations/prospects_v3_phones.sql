-- Third pass: remaining numbers pulled from Google listing results, Aug 2026.
-- Coverage 99 -> 111 of 143; Tier A 62 -> 68 of 83.
--
-- Marked 'verify on call' where the number is real but tied to a different
-- address or entity than the row on file: Russell T. Ross's number is his
-- Palmetto office, David's Insurance lists 50 Smith St rather than 13, Maersk
-- shares 7280 Oakley Industrial with an IntegraCore listing, and Calvary
-- Church's number was not corroborated against the Bishop Rd address.
--
-- Guarded on phone IS NULL, so re-running is a no-op and hand-entered numbers
-- are never overwritten.
UPDATE prospects SET phone = '(770) 964-1199', phone_confidence = 'verify on call', updated_at = NOW() WHERE name = 'Calvary Church' AND phone IS NULL;
UPDATE prospects SET phone = '(404) 421-1983', phone_confidence = 'verified', updated_at = NOW() WHERE name = 'Tiny Friends Family ChildCare' AND phone IS NULL;
UPDATE prospects SET phone = '(770) 892-5038', phone_confidence = 'verified', updated_at = NOW() WHERE name = 'Lifetime Youth Learning Center LLC' AND phone IS NULL;
UPDATE prospects SET phone = '(702) 306-3934', phone_confidence = 'verified', updated_at = NOW() WHERE name = 'Diamond Action Design Studio' AND phone IS NULL;
UPDATE prospects SET phone = '(470) 829-3152', phone_confidence = 'verified', updated_at = NOW() WHERE name = 'Triple Rrr Roadside Assistances' AND phone IS NULL;
UPDATE prospects SET phone = '(404) 981-6932', phone_confidence = 'verified', updated_at = NOW() WHERE name = 'Thetransformationbarber' AND phone IS NULL;
UPDATE prospects SET phone = '(770) 774-8913', phone_confidence = 'verify on call', updated_at = NOW() WHERE name = 'David''s Insurance' AND phone IS NULL;
UPDATE prospects SET phone = '(678) 910-1204', phone_confidence = 'verify on call', updated_at = NOW() WHERE name = 'Russell T. Ross, Jr.' AND phone IS NULL;
UPDATE prospects SET phone = '(770) 892-3938', phone_confidence = 'verified', updated_at = NOW() WHERE name = 'DHL Supply Chain' AND phone IS NULL;
UPDATE prospects SET phone = '(678) 272-3900', phone_confidence = 'verified', updated_at = NOW() WHERE name = 'CJ Logistics America' AND phone IS NULL;
UPDATE prospects SET phone = '(770) 293-1502', phone_confidence = 'verify on call', updated_at = NOW() WHERE name = 'Maersk' AND phone IS NULL;
UPDATE prospects SET phone = '(404) 762-2922', phone_confidence = 'verified', updated_at = NOW() WHERE name = 'AIT Worldwide Logistics' AND phone IS NULL;
