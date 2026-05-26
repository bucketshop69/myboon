-- Hyperliquid research desk v0.
-- Stores watched wallets, position/market snapshots, and research findings.
-- Final user-facing content still lands in published_narratives.

CREATE TABLE IF NOT EXISTS public.hyperliquid_watchlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet text NOT NULL UNIQUE,
  label text,
  reason text,
  min_position_usd numeric,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.hyperliquid_position_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet text NOT NULL,
  asset text NOT NULL,
  side text NOT NULL CHECK (side IN ('long', 'short')),
  size numeric NOT NULL,
  notional_usd numeric NOT NULL,
  entry_price numeric,
  mark_price numeric,
  leverage numeric,
  unrealized_pnl_usd numeric,
  margin_used_usd numeric,
  observed_at timestamptz NOT NULL,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hyperliquid_position_wallet_asset_time_idx
  ON public.hyperliquid_position_snapshots (wallet, asset, observed_at DESC);

CREATE TABLE IF NOT EXISTS public.hyperliquid_market_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset text NOT NULL,
  mark_price numeric,
  mid_price numeric,
  oracle_price numeric,
  funding_rate numeric,
  open_interest_usd numeric,
  volume_24h_usd numeric,
  previous_day_price numeric,
  observed_at timestamptz NOT NULL,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hyperliquid_market_asset_time_idx
  ON public.hyperliquid_market_snapshots (asset, observed_at DESC);

CREATE TABLE IF NOT EXISTS public.research_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  finding_type text NOT NULL,
  story_key text NOT NULL,
  dedupe_key text NOT NULL,
  asset text,
  wallet text,
  finding jsonb NOT NULL,
  brief jsonb NOT NULL,
  editor_decision jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('publish', 'update', 'hold', 'ignore')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS research_findings_story_key_idx
  ON public.research_findings (story_key, created_at DESC);

CREATE INDEX IF NOT EXISTS research_findings_source_status_idx
  ON public.research_findings (source, status, created_at DESC);

ALTER TABLE public.hyperliquid_watchlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hyperliquid_position_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hyperliquid_market_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_findings ENABLE ROW LEVEL SECURITY;

-- These tables are written by service-role jobs. Public/feed clients should read
-- the curated result through published_narratives and backend API routes.
