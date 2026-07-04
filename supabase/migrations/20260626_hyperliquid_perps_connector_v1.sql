-- Hyperliquid Perps Connector V1.
-- Source-native perp snapshots plus candidate queue for later research/entity work.

CREATE TABLE IF NOT EXISTS public.hyperliquid_market_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue text NOT NULL DEFAULT 'hyperliquid',
  symbol text NOT NULL,
  base_asset text NOT NULL,
  entity_hint text NOT NULL,
  market_type text NOT NULL DEFAULT 'perp' CHECK (market_type = 'perp'),
  observed_at timestamptz NOT NULL,
  venue_timestamp timestamptz,
  rank_by_24h_notional_volume integer NOT NULL,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  mark_price numeric,
  mid_price numeric,
  oracle_price numeric,
  prev_day_price numeric,
  premium numeric,
  day_notional_volume numeric,
  day_base_volume numeric,
  volume_1h numeric,
  volume_4h numeric,
  volume_24h numeric,
  volume_change_1h_pct numeric,
  volume_change_4h_pct numeric,
  volume_change_24h_pct numeric,
  price_change_1h_pct numeric,
  price_change_4h_pct numeric,
  price_change_24h_pct numeric,
  funding_rate_current numeric,
  funding_rate_1h_ago numeric,
  funding_rate_4h_ago numeric,
  funding_rate_24h_ago numeric,
  funding_change_1h numeric,
  funding_change_4h numeric,
  funding_change_24h numeric,
  funding_direction text NOT NULL DEFAULT 'neutral' CHECK (
    funding_direction IN ('positive', 'negative', 'neutral')
  ),
  funding_flipped_1h boolean NOT NULL DEFAULT false,
  funding_flipped_4h boolean NOT NULL DEFAULT false,
  funding_flipped_24h boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (venue, symbol, observed_at)
);

CREATE INDEX IF NOT EXISTS hyperliquid_market_snapshots_symbol_time_idx
  ON public.hyperliquid_market_snapshots (symbol, observed_at DESC);

CREATE INDEX IF NOT EXISTS hyperliquid_market_snapshots_rank_time_idx
  ON public.hyperliquid_market_snapshots (observed_at DESC, rank_by_24h_notional_volume);

CREATE INDEX IF NOT EXISTS hyperliquid_market_snapshots_raw_payload_idx
  ON public.hyperliquid_market_snapshots USING GIN (raw_payload);

CREATE TABLE IF NOT EXISTS public.hyperliquid_market_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue text NOT NULL DEFAULT 'hyperliquid',
  symbol text NOT NULL,
  base_asset text NOT NULL,
  entity_hint text NOT NULL,
  market_type text NOT NULL DEFAULT 'perp' CHECK (market_type = 'perp'),
  snapshot_id uuid REFERENCES public.hyperliquid_market_snapshots(id) ON DELETE SET NULL,
  trigger_type text NOT NULL CHECK (
    trigger_type IN (
      'weighted_market_signal',
      'price_change_1h',
      'price_change_4h',
      'funding_flip_1h',
      'funding_flip_4h',
      'funding_flip_24h',
      'funding_extreme',
      'price_and_funding_move',
      'volume_spike'
    )
  ),
  trigger_reason text NOT NULL,
  score numeric NOT NULL DEFAULT 0,
  metrics_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  prior_metrics_snapshot jsonb,
  status text NOT NULL DEFAULT 'pending_research' CHECK (
    status IN (
      'pending_research',
      'researching',
      'researched',
      'research_failed',
      'skipped'
    )
  ),
  observed_at timestamptz NOT NULL,
  dedupe_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dedupe_key)
);

CREATE INDEX IF NOT EXISTS hyperliquid_market_candidates_status_idx
  ON public.hyperliquid_market_candidates (status, observed_at DESC);

CREATE INDEX IF NOT EXISTS hyperliquid_market_candidates_symbol_time_idx
  ON public.hyperliquid_market_candidates (symbol, observed_at DESC);

CREATE INDEX IF NOT EXISTS hyperliquid_market_candidates_trigger_idx
  ON public.hyperliquid_market_candidates (trigger_type, observed_at DESC);

CREATE INDEX IF NOT EXISTS hyperliquid_market_candidates_metrics_idx
  ON public.hyperliquid_market_candidates USING GIN (metrics_snapshot);

ALTER TABLE public.hyperliquid_market_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hyperliquid_market_candidates ENABLE ROW LEVEL SECURITY;
