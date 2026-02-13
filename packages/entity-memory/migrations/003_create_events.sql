CREATE TABLE IF NOT EXISTS entity_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  related_entity_ids JSONB,
  timestamp BIGINT NOT NULL,
  type VARCHAR(50) NOT NULL,
  summary TEXT NOT NULL,
  representation_id UUID REFERENCES representations(id),
  data JSONB DEFAULT '{}',
  source JSONB NOT NULL,
  importance INTEGER DEFAULT 5,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_entity ON entity_events(entity_id);
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON entity_events(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_events_type ON entity_events(type);
CREATE INDEX IF NOT EXISTS idx_events_importance ON entity_events(importance DESC);
CREATE INDEX IF NOT EXISTS idx_events_representation ON entity_events(representation_id);
