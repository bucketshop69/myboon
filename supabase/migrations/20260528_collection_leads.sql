-- V3 collection leads.
-- Collectors write deterministic lead candidates here. Researchers consume them later.

CREATE TABLE IF NOT EXISTS public.collection_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  collector text NOT NULL,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  artifact_path text,
  error text
);

CREATE INDEX IF NOT EXISTS collection_runs_source_started_idx
  ON public.collection_runs (source, started_at DESC);

CREATE TABLE IF NOT EXISTS public.collection_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  lane text NOT NULL,
  asset text NOT NULL,
  status text NOT NULL CHECK (status IN ('research', 'watch', 'ignore')),
  priority numeric NOT NULL DEFAULT 1,
  story_key text NOT NULL,
  lead_id text NOT NULL,
  observed_at timestamptz NOT NULL,
  headline text NOT NULL,
  what_changed text NOT NULL,
  why_interesting text NOT NULL,
  suggested_research_questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  checks jsonb NOT NULL DEFAULT '[]'::jsonb,
  receipts jsonb NOT NULL DEFAULT '[]'::jsonb,
  uncertainty jsonb NOT NULL DEFAULT '[]'::jsonb,
  supporting_lead_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  collector text NOT NULL,
  collection_run_id uuid REFERENCES public.collection_runs(id) ON DELETE SET NULL,
  raw_lead jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, lane, story_key)
);

CREATE INDEX IF NOT EXISTS collection_leads_status_priority_idx
  ON public.collection_leads (status, priority DESC, observed_at DESC);

CREATE INDEX IF NOT EXISTS collection_leads_asset_lane_idx
  ON public.collection_leads (asset, lane, observed_at DESC);

CREATE INDEX IF NOT EXISTS collection_leads_run_idx
  ON public.collection_leads (collection_run_id);

ALTER TABLE public.collection_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_leads ENABLE ROW LEVEL SECURITY;

-- Service-role collector/researcher jobs own these rows. Public/feed clients should
-- read only curated published_narratives through backend routes.
