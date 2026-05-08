-- Migration: ai_explanations
-- Shared cache for beginner-friendly AI explanations keyed by content/card id + source hash.
-- User-specific events can be added separately later; explanations are intentionally content-level.
-- Run via Supabase dashboard SQL editor, or apply with the service-role SQL helper if available.

CREATE TABLE IF NOT EXISTS public.ai_explanations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id text NOT NULL,
  content_type text NOT NULL DEFAULT 'narrative',
  source_hash text NOT NULL,
  explanation text NOT NULL,
  model text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_explanations_content_hash_key UNIQUE (content_id, source_hash)
);

CREATE INDEX IF NOT EXISTS ai_explanations_content_id_idx
  ON public.ai_explanations (content_id);

CREATE INDEX IF NOT EXISTS ai_explanations_content_type_idx
  ON public.ai_explanations (content_type);

CREATE OR REPLACE FUNCTION public.touch_ai_explanations_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ai_explanations_touch_updated_at ON public.ai_explanations;
CREATE TRIGGER ai_explanations_touch_updated_at
BEFORE UPDATE ON public.ai_explanations
FOR EACH ROW
EXECUTE FUNCTION public.touch_ai_explanations_updated_at();

ALTER TABLE public.ai_explanations ENABLE ROW LEVEL SECURITY;

-- API uses the service-role key, which bypasses RLS. No anon/authenticated direct access by default.
