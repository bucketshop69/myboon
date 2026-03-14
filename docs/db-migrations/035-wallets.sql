CREATE TABLE IF NOT EXISTS polymarket_wallets (
  address         TEXT PRIMARY KEY,
  label           TEXT DEFAULT 'unknown',
  total_bets      INT DEFAULT 0,
  resolved_bets   INT DEFAULT 0,
  correct_bets    INT DEFAULT 0,
  win_rate        NUMERIC(4,2),
  total_volume    NUMERIC(14,2) DEFAULT 0,
  last_active     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);
