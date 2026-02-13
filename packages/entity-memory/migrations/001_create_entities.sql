CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  symbol VARCHAR(50),
  type VARCHAR(50) NOT NULL,
  verified BOOLEAN DEFAULT false,
  verified_by VARCHAR(50),
  metadata JSONB DEFAULT '{}',
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type);
CREATE INDEX IF NOT EXISTS idx_entities_symbol ON entities(symbol);
CREATE INDEX IF NOT EXISTS idx_entities_verified ON entities(verified);
CREATE INDEX IF NOT EXISTS idx_entities_metadata ON entities USING GIN(metadata);
