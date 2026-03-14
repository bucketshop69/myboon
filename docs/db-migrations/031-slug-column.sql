-- Add top-level slug column to signals table
ALTER TABLE signals ADD COLUMN IF NOT EXISTS slug TEXT;
CREATE INDEX IF NOT EXISTS idx_signals_slug ON signals(slug);
