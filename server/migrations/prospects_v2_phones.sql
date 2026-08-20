-- Second pass: phone numbers sourced from Google search results, Aug 2026.
--
-- Every number here was corroborated against the business's own website or a
-- listing that also matched the street address on file. Numbers that could not
-- be corroborated were left out rather than guessed - notably Fairburn Roofing
-- and Gutters, where the 888 number that surfaces online belongs to a lead-gen
-- aggregator, and The Gathering Place, where the listed number was malformed.
--
-- The `phone IS NULL` guard means this never overwrites a number the sales team
-- entered by hand, and re-running it is a no-op.

UPDATE prospects SET phone = '(678) 519-4719', phone_confidence = 'verified', updated_at = NOW() WHERE name = 'Crossroads Church South Fulton' AND phone IS NULL;
UPDATE prospects SET phone = '(770) 742-3007', phone_confidence = 'verified', updated_at = NOW() WHERE name = 'Cornerstone Fellowship Church' AND phone IS NULL;
UPDATE prospects SET phone = '(770) 969-0779', phone_confidence = 'verified', updated_at = NOW() WHERE name = 'St John AME Church' AND phone IS NULL;
UPDATE prospects SET phone = '(770) 306-0270', phone_confidence = 'verified', updated_at = NOW() WHERE name = 'New Horizons In Faith Church International, Inc' AND phone IS NULL;
UPDATE prospects SET phone = '(770) 969-0120', phone_confidence = 'verified', updated_at = NOW() WHERE name = 'Word of Love Christian Church' AND phone IS NULL;
UPDATE prospects SET phone = '(770) 969-7252', phone_confidence = 'verify on call', updated_at = NOW() WHERE name = 'Welcome Grove Baptist Church' AND phone IS NULL;
UPDATE prospects SET phone = '(770) 964-6008', phone_confidence = 'verified', updated_at = NOW() WHERE name = 'Miller Grove Baptist Church' AND phone IS NULL;
UPDATE prospects SET phone = '(770) 964-4851', phone_confidence = 'verify on call', updated_at = NOW() WHERE name = 'Mount Vernon Baptist Church' AND phone IS NULL;
UPDATE prospects SET phone = '(770) 306-3778', phone_confidence = 'verify on call', updated_at = NOW() WHERE name = 'Open Word Christian Ministries' AND phone IS NULL;
UPDATE prospects SET phone = '(678) 519-4062', phone_confidence = 'verified', updated_at = NOW() WHERE name = 'A Step At A Time Early Learning Academy' AND phone IS NULL;
UPDATE prospects SET phone = '(770) 774-2929', phone_confidence = 'verified', updated_at = NOW() WHERE name = 'Walk Leap Grow Early Learning Center' AND phone IS NULL;
UPDATE prospects SET phone = '(770) 709-2602', phone_confidence = 'verified', updated_at = NOW() WHERE name = 'Selby''s 24HR Daycare' AND phone IS NULL;
UPDATE prospects SET phone = '(770) 306-1234', phone_confidence = 'verified', updated_at = NOW() WHERE name = 'Alkin Academy Inc.' AND phone IS NULL;
UPDATE prospects SET phone = '(470) 254-3900', phone_confidence = 'verified', updated_at = NOW() WHERE name = 'Global Impact Academy STEM Magnet High School' AND phone IS NULL;
UPDATE prospects SET phone = '(404) 512-0834', phone_confidence = 'verified', updated_at = NOW() WHERE name = 'Flying Change Equine Therapy' AND phone IS NULL;
UPDATE prospects SET phone = '(770) 969-0956', phone_confidence = 'verified', updated_at = NOW() WHERE name = 'Southside Theatre Guild' AND phone IS NULL;
UPDATE prospects SET phone = '(770) 964-8575', phone_confidence = 'verified', updated_at = NOW() WHERE name = 'Georgia Renaissance Festival' AND phone IS NULL;
UPDATE prospects SET phone = '(678) 856-6852', phone_confidence = 'verified', updated_at = NOW() WHERE name = 'Sugahplum Events' AND phone IS NULL;
UPDATE prospects SET phone = '(770) 892-7157', phone_confidence = 'verified', updated_at = NOW() WHERE name = 'South Fulton Studios' AND phone IS NULL;
UPDATE prospects SET phone = '(770) 703-7444', phone_confidence = 'verified', updated_at = NOW() WHERE name = 'IAMCHARDE TUMBLING' AND phone IS NULL;
UPDATE prospects SET phone = '(770) 969-0988', phone_confidence = 'verified', updated_at = NOW() WHERE name = 'The Gym 24/7 Fitness' AND phone IS NULL;
UPDATE prospects SET phone = '(404) 939-5880', phone_confidence = 'verified', updated_at = NOW() WHERE name = 'South Fulton Fit Body Boot Camp' AND phone IS NULL;
UPDATE prospects SET phone = '(813) 810-1892', phone_confidence = 'verify on call', updated_at = NOW() WHERE name = 'Tri-Phase Total Fitness' AND phone IS NULL;
UPDATE prospects SET phone = '(833) 321-4376', phone_confidence = 'verified', updated_at = NOW() WHERE name = 'Hero Roofing' AND phone IS NULL;
UPDATE prospects SET phone = '(770) 969-9459', phone_confidence = 'verified', updated_at = NOW() WHERE name = 'Fairburn Emission & Automotive' AND phone IS NULL;
UPDATE prospects SET phone = '(386) 693-8705', phone_confidence = 'verified', updated_at = NOW() WHERE name = 'TONY THE DETAIL GUY' AND phone IS NULL;
UPDATE prospects SET phone = '(404) 819-1255', phone_confidence = 'verified', updated_at = NOW() WHERE name = 'Mr L Clark Towing Transportation and Recovery' AND phone IS NULL;
UPDATE prospects SET phone = '(404) 940-1802', phone_confidence = 'verified', updated_at = NOW() WHERE name = 'FreeKings Cuts' AND phone IS NULL;
UPDATE prospects SET phone = '(770) 728-8323', phone_confidence = 'verified', updated_at = NOW() WHERE name = 'FADE AWAY BARBER SHOP' AND phone IS NULL;
UPDATE prospects SET phone = '(770) 969-2322', phone_confidence = 'verified', updated_at = NOW() WHERE name = 'El Milagro Hair Salon #1' AND phone IS NULL;
UPDATE prospects SET phone = '(404) 481-0115', phone_confidence = 'verified', updated_at = NOW() WHERE name = 'Your Natural Hair Place' AND phone IS NULL;
UPDATE prospects SET phone = '(770) 629-6707', phone_confidence = 'verified', updated_at = NOW() WHERE name = 'Elegant Expressions Beauty And Styles Salon' AND phone IS NULL;
UPDATE prospects SET phone = '(678) 519-0316', phone_confidence = 'verified', updated_at = NOW() WHERE name = 'The Dining Experience' AND phone IS NULL;
UPDATE prospects SET phone = '(404) 904-8927', phone_confidence = 'verified', updated_at = NOW() WHERE name = 'TrucKINGS bbq' AND phone IS NULL;
UPDATE prospects SET phone = '(470) 855-7225', phone_confidence = 'verified', updated_at = NOW() WHERE name = 'Lady Fannie Mae''s Ultimate Fish Fry' AND phone IS NULL;
UPDATE prospects SET phone = '(470) 218-9490', phone_confidence = 'verified', updated_at = NOW() WHERE name = 'Ms. Savory Restaurant & Catering LLC' AND phone IS NULL;
UPDATE prospects SET phone = '(770) 703-3283', phone_confidence = 'verified', updated_at = NOW() WHERE name = 'Don Nachos Fairburn' AND phone IS NULL;
UPDATE prospects SET phone = '(770) 964-5581', phone_confidence = 'verified', updated_at = NOW() WHERE name = 'Fairburn Insurance' AND phone IS NULL;
UPDATE prospects SET phone = '(770) 964-3427', phone_confidence = 'verified', updated_at = NOW() WHERE name = 'T W Smith Insurance' AND phone IS NULL;
UPDATE prospects SET phone = '(770) 964-1545', phone_confidence = 'verified', updated_at = NOW() WHERE name = 'Dr. Robert L. White Jr, DDS' AND phone IS NULL;
UPDATE prospects SET phone = '(404) 596-4329', phone_confidence = 'verified', updated_at = NOW() WHERE name = 'Piedmont Urgent Care' AND phone IS NULL;
UPDATE prospects SET phone = '(770) 964-1551', phone_confidence = 'verified', updated_at = NOW() WHERE name = 'United Community Bank' AND phone IS NULL;
UPDATE prospects SET phone = '(678) 895-2811', phone_confidence = 'verified', updated_at = NOW() WHERE name = 'VIBE NAIL BAR FAIRBURN' AND phone IS NULL;
UPDATE prospects SET phone = '(770) 892-2099', phone_confidence = 'verified', updated_at = NOW() WHERE name = 'Nicest Nails' AND phone IS NULL;
UPDATE prospects SET phone = '(770) 739-1440', phone_confidence = 'verified', updated_at = NOW() WHERE name = 'Material In Motion' AND phone IS NULL;
UPDATE prospects SET phone = '(770) 357-2277', phone_confidence = 'verified', updated_at = NOW() WHERE name = 'ADESA Atlanta' AND phone IS NULL;
UPDATE prospects SET phone = '(404) 762-9211', phone_confidence = 'verify on call', updated_at = NOW() WHERE name = 'Manheim Atlanta' AND phone IS NULL;
UPDATE prospects SET phone = '(770) 306-7200', phone_confidence = 'verify on call', updated_at = NOW() WHERE name = 'Durham Lakes Country Club' AND phone IS NULL;

-- Data-quality notes found while chasing numbers: duplicates, venues that
-- turned out to sit inside the Renaissance Festival, and rows whose real
-- address is outside Fairburn.
UPDATE prospects SET notes = 'One directory lists this as closed - confirm before visiting.', updated_at = NOW() WHERE name = 'Welcome Grove Baptist Church';
UPDATE prospects SET notes = 'Cultural org events = large group orders | Address is Union City, GA, not Fairburn.', updated_at = NOW() WHERE name = 'Igbo Event Center';
UPDATE prospects SET notes = 'Fairburn in the name - lean into local pride | No direct number found - the 888 number online belongs to a lead-gen aggregator, not the business.', updated_at = NOW() WHERE name = 'Fairburn Roofing and Gutters';
UPDATE prospects SET notes = 'Not a standalone business - a concession inside the Georgia Renaissance Festival grounds. Sell via the Festival.', updated_at = NOW() WHERE name = 'Drunk Monk Pub';
UPDATE prospects SET notes = 'Seasonal venue inside the Georgia Renaissance Festival (6905 Virlyn B Smith Rd). Sell via the Festival.', updated_at = NOW() WHERE name = 'Peacock Tea Room';
UPDATE prospects SET notes = 'Same building as Fairburn Family Dentistry | DUPLICATE - same practice and number as Fairburn Family Dentistry at 168 NW Broad. Treat as one account.', updated_at = NOW() WHERE name = 'Dr. Robert L. White Jr, DDS';
UPDATE prospects SET notes = 'Listed address is Tyrone, GA - outside Fairburn.', updated_at = NOW() WHERE name = 'Nail Chaos Studio';
UPDATE prospects SET notes = 'Golf tournaments = recurring polo orders. HIGH VALUE despite C tier. | Yelp lists the club as closed - confirm before pitching tournament apparel.', updated_at = NOW() WHERE name = 'Durham Lakes Country Club';
