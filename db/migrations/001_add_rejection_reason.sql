-- Phase 6: moderators reject a submission with a reason.
-- Safe on databases created from the current schema.sql (the runner skips an
-- ADD COLUMN that already exists).
ALTER TABLE recipes ADD COLUMN rejection_reason TEXT;
