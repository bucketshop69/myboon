ALTER TABLE polymarket_tracked ADD COLUMN IF NOT EXISTS volume_previous NUMERIC DEFAULT 0;
ALTER TABLE polymarket_tracked ADD COLUMN IF NOT EXISTS last_signalled_at TIMESTAMPTZ;
