-- V3 feed metadata bridge.
-- Keeps published_narratives as the user-facing feed artifact while preserving
-- references back to the V3 ResearchPacket, story key, and receipt-backed facts.

ALTER TABLE public.published_narratives
  ADD COLUMN IF NOT EXISTS packet_id TEXT,
  ADD COLUMN IF NOT EXISTS story_key TEXT,
  ADD COLUMN IF NOT EXISTS story_candidate_id TEXT,
  ADD COLUMN IF NOT EXISTS evidence_refs JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS published_narratives_story_key_idx
  ON public.published_narratives (story_key);

CREATE INDEX IF NOT EXISTS published_narratives_packet_id_idx
  ON public.published_narratives (packet_id);

-- Service-role jobs write these rows. Do not grant anon/authenticated table
-- access here; existing API routes read through the backend.
ALTER TABLE public.published_narratives ENABLE ROW LEVEL SECURITY;
