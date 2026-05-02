-- Clear all rows from the mockups table.
-- Per Kevin: existing mockup records are stale and should be removed; the
-- mockup-creation workflow itself stays. Only the legacy data goes.

DELETE FROM mockups;
