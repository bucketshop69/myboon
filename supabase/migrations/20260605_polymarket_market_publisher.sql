-- Feed V3 reset: Polymarket Publisher.
-- Adds optional provenance columns to published_narratives so V3 feed items
-- can be traced back to editor decisions / research without breaking existing rows.
-- Safe to run multiple times.

ALTER TABLE public.published_narratives
  ADD COLUMN IF NOT EXISTS source text;

ALTER TABLE public.published_narratives
  ADD COLUMN IF NOT EXISTS area text;

ALTER TABLE public.published_narratives
  ADD COLUMN IF NOT EXISTS editor_decision_id uuid;

ALTER TABLE public.published_narratives
  ADD COLUMN IF NOT EXISTS research_ids jsonb DEFAULT '[]'::jsonb;

ALTER TABLE public.published_narratives
  ADD COLUMN IF NOT EXISTS primary_topic text;

CREATE INDEX IF NOT EXISTS published_narratives_source_area_idx
  ON public.published_narratives (source, area, created_at DESC);

CREATE INDEX IF NOT EXISTS published_narratives_editor_decision_idx
  ON public.published_narratives (editor_decision_id);

CREATE INDEX IF NOT EXISTS published_narratives_research_ids_idx
  ON public.published_narratives USING GIN (research_ids);
