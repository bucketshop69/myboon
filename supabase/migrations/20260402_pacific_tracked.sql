-- Migration: pacific_tracked
-- Stores last-seen OI/price/funding per Pacific symbol for delta detection.
-- Used by the Pacific discovery collector to detect liquidation cascades,
-- OI surges, and funding spikes by comparing current vs previous snapshots.
-- Run via: psql $DATABASE_URL -f this_file.sql
-- Or apply via Supabase dashboard SQL editor

CREATE TABLE IF NOT EXISTS pacific_tracked (
  symbol            text PRIMARY KEY,
  open_interest     numeric,
  volume_24h        numeric,
  mark_price        numeric,
  funding_rate      numeric,
  oi_previous       numeric,       -- OI at time of last signal emission
  last_signalled_at timestamptz,
  updated_at        timestamptz DEFAULT now()
);
