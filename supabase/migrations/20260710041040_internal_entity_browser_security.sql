-- Internal Entity Browser: keep research entities private from Data API roles
-- and provide a service-role-only aggregate used by the internal dashboard.

ALTER TABLE public.entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_published_history ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.entities FROM anon, authenticated;
REVOKE ALL ON TABLE public.entity_memories FROM anon, authenticated;
REVOKE ALL ON TABLE public.entity_published_history FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.entities TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.entity_memories TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.entity_published_history TO service_role;

CREATE OR REPLACE FUNCTION public.internal_entity_memory_stats(entity_ids uuid[])
RETURNS TABLE (
  entity_id uuid,
  memory_count bigint,
  latest_memory_at timestamptz,
  source_count bigint,
  evidence_count bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    memory.entity_id,
    count(*)::bigint AS memory_count,
    max(memory.observed_at) AS latest_memory_at,
    count(DISTINCT NULLIF(memory.source, ''))::bigint AS source_count,
    coalesce(sum(
      CASE jsonb_typeof(memory.evidence)
        WHEN 'array' THEN jsonb_array_length(memory.evidence)
        ELSE 0
      END
    ), 0)::bigint AS evidence_count
  FROM public.entity_memories AS memory
  WHERE memory.entity_id = ANY(entity_ids)
  GROUP BY memory.entity_id;
$$;

REVOKE ALL ON FUNCTION public.internal_entity_memory_stats(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.internal_entity_memory_stats(uuid[]) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.internal_entity_memory_stats(uuid[]) TO service_role;
