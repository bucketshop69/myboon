-- Polymarket Catalog V2: hybrid manual pins and automatic sports rules.
-- A sports_rule stores a durable Polymarket /sports code (for example crint
-- or epl). The API resolves that code to Polymarket's current series at read
-- time, so fixtures and season rollovers do not require another release.

ALTER TABLE public.polymarket_catalog_items
  DROP CONSTRAINT IF EXISTS polymarket_catalog_items_source_kind_check;

ALTER TABLE public.polymarket_catalog_items
  ADD CONSTRAINT polymarket_catalog_items_source_kind_check
  CHECK (source_kind IN ('event', 'market', 'sports_rule'));

ALTER TABLE public.polymarket_catalog_items
  ADD COLUMN rule_config jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.polymarket_catalog_items
  ADD CONSTRAINT polymarket_catalog_items_rule_config_check
  CHECK (
    CASE
      WHEN source_kind = 'sports_rule' THEN
        CASE
          WHEN jsonb_typeof(rule_config) = 'object'
            AND jsonb_typeof(rule_config -> 'windowDays') = 'number'
            AND jsonb_typeof(rule_config -> 'limit') = 'number'
            AND rule_config ->> 'marketType' = 'moneyline'
          THEN
            (rule_config ->> 'windowDays')::numeric = trunc((rule_config ->> 'windowDays')::numeric)
            AND (rule_config ->> 'windowDays')::numeric BETWEEN 1 AND 30
            AND (rule_config ->> 'limit')::numeric = trunc((rule_config ->> 'limit')::numeric)
            AND (rule_config ->> 'limit')::numeric BETWEEN 1 AND 50
          ELSE false
        END
      ELSE rule_config = '{}'::jsonb
    END
  );

ALTER TABLE public.polymarket_catalog_items
  ADD CONSTRAINT polymarket_catalog_items_sports_rule_metadata_check
  CHECK (
    source_kind <> 'sports_rule'
    OR (
      source_id IS NOT NULL
      AND condition_id IS NULL
      AND category = 'sports'
      AND sport IS NOT NULL
    )
  );

CREATE OR REPLACE FUNCTION public.save_polymarket_catalog_draft(
  p_collection_key text,
  p_items jsonb,
  p_expected_revision integer DEFAULT NULL,
  p_actor text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  draft_id uuid;
  draft_version integer;
  draft_revision integer;
  created_draft boolean NOT NULL DEFAULT false;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'catalog items must be a JSON array' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_items) > 100 THEN
    RAISE EXCEPTION 'catalog collections support at most 100 items' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.polymarket_catalog_collections AS collection
    WHERE collection.collection_key = p_collection_key
  ) THEN
    RAISE EXCEPTION 'unknown Polymarket catalog collection: %', p_collection_key USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('polymarket_catalog:' || p_collection_key, 0));

  SELECT release.id, release.version, release.revision
  INTO draft_id, draft_version, draft_revision
  FROM public.polymarket_catalog_releases AS release
  WHERE release.collection_key = p_collection_key
    AND release.status = 'draft'
  FOR UPDATE;

  IF draft_id IS NULL THEN
    IF p_expected_revision IS NOT NULL THEN
      RAISE EXCEPTION 'catalog draft revision conflict' USING ERRCODE = '40001';
    END IF;

    SELECT coalesce(max(release.version), 0) + 1
    INTO draft_version
    FROM public.polymarket_catalog_releases AS release
    WHERE release.collection_key = p_collection_key;

    INSERT INTO public.polymarket_catalog_releases (
      collection_key,
      version,
      status,
      created_by
    )
    VALUES (
      p_collection_key,
      draft_version,
      'draft',
      nullif(btrim(p_actor), '')
    )
    RETURNING id INTO draft_id;
    draft_revision := 1;
    created_draft := true;
  ELSIF p_expected_revision IS NULL OR p_expected_revision <> draft_revision THEN
    RAISE EXCEPTION 'catalog draft revision conflict' USING ERRCODE = '40001';
  END IF;

  DELETE FROM public.polymarket_catalog_items AS item
  WHERE item.release_id = draft_id;

  INSERT INTO public.polymarket_catalog_items (
    release_id,
    source_kind,
    source_slug,
    source_id,
    condition_id,
    title,
    category,
    sport,
    position,
    is_enabled,
    active_from,
    active_until,
    display_overrides,
    rule_config
  )
  SELECT
    draft_id,
    btrim(entry.value ->> 'sourceKind'),
    btrim(entry.value ->> 'sourceSlug'),
    nullif(btrim(entry.value ->> 'sourceId'), ''),
    nullif(btrim(entry.value ->> 'conditionId'), ''),
    coalesce(nullif(btrim(entry.value ->> 'title'), ''), btrim(entry.value ->> 'sourceSlug')),
    nullif(btrim(entry.value ->> 'category'), ''),
    nullif(btrim(entry.value ->> 'sport'), ''),
    (entry.ordinality - 1)::integer,
    coalesce((entry.value ->> 'isEnabled')::boolean, true),
    nullif(entry.value ->> 'activeFrom', '')::timestamptz,
    nullif(entry.value ->> 'activeUntil', '')::timestamptz,
    coalesce(entry.value -> 'displayOverrides', '{}'::jsonb),
    CASE
      WHEN jsonb_typeof(entry.value -> 'ruleConfig') = 'object'
        THEN entry.value -> 'ruleConfig'
      ELSE '{}'::jsonb
    END
  FROM jsonb_array_elements(p_items) WITH ORDINALITY AS entry(value, ordinality);

  UPDATE public.polymarket_catalog_releases
  SET updated_at = now(),
      revision = CASE WHEN created_draft THEN revision ELSE revision + 1 END,
      created_by = coalesce(nullif(btrim(p_actor), ''), created_by)
  WHERE id = draft_id;

  UPDATE public.polymarket_catalog_collections
  SET updated_at = now()
  WHERE collection_key = p_collection_key;

  RETURN draft_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_polymarket_catalog_draft(text, jsonb, integer, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_polymarket_catalog_draft(text, jsonb, integer, text)
  TO service_role;

UPDATE public.polymarket_catalog_collections
SET description = 'The ordered manual and automatic Polymarket sources shown on featured surfaces.',
    updated_at = now()
WHERE collection_key = 'featured';
