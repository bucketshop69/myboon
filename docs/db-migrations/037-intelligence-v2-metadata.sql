-- Intelligence Engine v2 metadata bridge for issue #123.
-- Safe to run repeatedly. Publisher retries legacy inserts if these columns are not applied yet.

ALTER TABLE published_narratives
  ADD COLUMN IF NOT EXISTS schema_version INTEGER,
  ADD COLUMN IF NOT EXISTS scoring_version INTEGER,
  ADD COLUMN IF NOT EXISTS editor_version INTEGER,
  ADD COLUMN IF NOT EXISTS success_criteria JSONB;

CREATE TABLE IF NOT EXISTS narrative_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  narrative_id UUID REFERENCES published_narratives(id) ON DELETE CASCADE,
  schema_version INTEGER NOT NULL DEFAULT 1,
  scoring_version INTEGER NOT NULL DEFAULT 1,
  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  criteria JSONB NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('hit', 'miss', 'inconclusive')),
  measured_values JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS narrative_outcomes_narrative_id_idx ON narrative_outcomes(narrative_id);
CREATE INDEX IF NOT EXISTS narrative_outcomes_result_idx ON narrative_outcomes(result);
