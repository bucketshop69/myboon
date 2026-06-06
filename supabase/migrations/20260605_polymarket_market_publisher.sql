-- Feed V3 reset: Polymarket Publisher.
-- Owns the checked-in published_narratives baseline used by the public feed,
-- then adds V3 provenance columns for source/editor/research traceability.
-- Safe to run multiple times.

CREATE TABLE IF NOT EXISTS public.published_narratives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  narrative_id text,
  content_small text NOT NULL,
  content_full text,
  reasoning text,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  priority numeric NOT NULL DEFAULT 0,
  actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  thread_id text,
  content_type text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.published_narratives
  ADD COLUMN IF NOT EXISTS narrative_id text;

ALTER TABLE public.published_narratives
  ADD COLUMN IF NOT EXISTS content_full text;

ALTER TABLE public.published_narratives
  ADD COLUMN IF NOT EXISTS reasoning text;

ALTER TABLE public.published_narratives
  ADD COLUMN IF NOT EXISTS tags jsonb DEFAULT '[]'::jsonb;

ALTER TABLE public.published_narratives
  ADD COLUMN IF NOT EXISTS priority numeric DEFAULT 0;

ALTER TABLE public.published_narratives
  ADD COLUMN IF NOT EXISTS actions jsonb DEFAULT '[]'::jsonb;

ALTER TABLE public.published_narratives
  ADD COLUMN IF NOT EXISTS thread_id text;

ALTER TABLE public.published_narratives
  ADD COLUMN IF NOT EXISTS content_type text;

ALTER TABLE public.published_narratives
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

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

WITH duplicate_editor_publications AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY editor_decision_id
      ORDER BY created_at DESC, id DESC
    ) AS duplicate_rank
  FROM public.published_narratives
  WHERE editor_decision_id IS NOT NULL
)
DELETE FROM public.published_narratives p
USING duplicate_editor_publications d
WHERE p.id = d.id
  AND d.duplicate_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS published_narratives_editor_decision_unique_idx
  ON public.published_narratives (editor_decision_id);

CREATE INDEX IF NOT EXISTS published_narratives_research_ids_idx
  ON public.published_narratives USING GIN (research_ids);

CREATE INDEX IF NOT EXISTS published_narratives_feed_idx
  ON public.published_narratives (created_at DESC, priority DESC);

ALTER TABLE public.published_narratives ENABLE ROW LEVEL SECURITY;
