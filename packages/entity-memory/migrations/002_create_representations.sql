CREATE TABLE IF NOT EXISTS representations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  protocol VARCHAR(100) NOT NULL,
  chain VARCHAR(50),
  context JSONB DEFAULT '{}',
  active BOOLEAN DEFAULT true,
  discovered_at BIGINT NOT NULL,
  last_seen_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_representations_entity ON representations(entity_id);
CREATE INDEX IF NOT EXISTS idx_representations_type ON representations(type);
CREATE INDEX IF NOT EXISTS idx_representations_protocol ON representations(protocol);
CREATE INDEX IF NOT EXISTS idx_representations_active ON representations(active);
CREATE INDEX IF NOT EXISTS idx_representations_context ON representations USING GIN(context);

CREATE UNIQUE INDEX IF NOT EXISTS idx_repr_spot_unique
  ON representations(protocol, chain, (context->>'mint'))
  WHERE type = 'spot-token';

CREATE UNIQUE INDEX IF NOT EXISTS idx_repr_perp_unique
  ON representations(protocol, (context->>'market'))
  WHERE type = 'perp-contract';

CREATE UNIQUE INDEX IF NOT EXISTS idx_repr_lp_unique
  ON representations(protocol, (context->>'poolAddress'))
  WHERE type = 'lp-pair';
