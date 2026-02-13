CREATE TABLE IF NOT EXISTS entity_research (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  timestamp BIGINT NOT NULL,
  ttl INTEGER NOT NULL,
  expires_at BIGINT NOT NULL,
  findings JSONB NOT NULL,
  sources JSONB NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_research_entity ON entity_research(entity_id);
CREATE INDEX IF NOT EXISTS idx_research_expires ON entity_research(expires_at);
CREATE INDEX IF NOT EXISTS idx_research_timestamp ON entity_research(timestamp DESC);
