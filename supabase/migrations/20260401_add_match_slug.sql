-- Migration: add generic slug column to x_posts
-- Used by event-driven broadcasters (sports, macro, elections, etc.)
-- to anchor posts to a specific event for dedup and querying.
-- Run via: psql $DATABASE_URL -f this_file.sql
-- Or apply via Supabase dashboard SQL editor

DO $$
BEGIN
  IF to_regclass('public.x_posts') IS NOT NULL THEN
    ALTER TABLE public.x_posts ADD COLUMN IF NOT EXISTS slug text;
  END IF;
END $$;
