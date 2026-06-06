-- Feed V3 reset: Polymarket Markets Data Engineer.
-- These tables are collector/researcher infrastructure. Public clients should
-- continue reading curated feed output through backend routes.

CREATE TABLE IF NOT EXISTS public.polymarket_market_watchlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL DEFAULT 'polymarket',
  area text NOT NULL,
  tag_slug text NOT NULL,
  tag_label text,
  market_id text NOT NULL,
  slug text NOT NULL,
  title text NOT NULL,
  event_slug text,
  event_title text,
  end_date timestamptz,
  is_manual_pin boolean NOT NULL DEFAULT false,
  rank_in_area integer,
  watch_score numeric NOT NULL DEFAULT 0,
  score_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  selection_reason text NOT NULL,
  latest_observed_at timestamptz,
  latest_yes_price numeric,
  latest_volume numeric,
  latest_volume_24h numeric,
  latest_liquidity numeric,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (area, slug)
);

CREATE INDEX IF NOT EXISTS polymarket_market_watchlist_slug_idx
  ON public.polymarket_market_watchlist (slug);

CREATE INDEX IF NOT EXISTS polymarket_market_watchlist_score_idx
  ON public.polymarket_market_watchlist (area, watch_score DESC);

CREATE TABLE IF NOT EXISTS public.polymarket_market_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL DEFAULT 'polymarket',
  area text NOT NULL,
  candidate_type text NOT NULL CHECK (
    candidate_type IN ('odds_moved', 'volume_moved', 'activity_spiked', 'closing_soon')
  ),
  market_id text NOT NULL,
  slug text NOT NULL,
  title text NOT NULL,
  tag_slug text NOT NULL,
  tag_label text,
  observed_at timestamptz NOT NULL,
  what_changed text NOT NULL,
  why_flagged text NOT NULL,
  score numeric NOT NULL DEFAULT 0,
  score_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending_research' CHECK (
    status IN ('pending_research', 'researching', 'researched', 'rejected', 'published')
  ),
  dedupe_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dedupe_key)
);

CREATE INDEX IF NOT EXISTS polymarket_market_candidates_status_idx
  ON public.polymarket_market_candidates (status, observed_at DESC);

CREATE INDEX IF NOT EXISTS polymarket_market_candidates_slug_idx
  ON public.polymarket_market_candidates (slug, observed_at DESC);

ALTER TABLE public.polymarket_market_watchlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.polymarket_market_candidates ENABLE ROW LEVEL SECURITY;
