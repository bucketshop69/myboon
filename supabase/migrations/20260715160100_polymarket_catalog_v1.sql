-- Polymarket Catalog V1: versioned, service-role-only collection control.
-- Phase 1 seeds the current featured sports event without changing the
-- existing /polymarket/featured-markets response used by mobile clients.

CREATE TABLE public.polymarket_catalog_collections (
  collection_key text PRIMARY KEY,
  name text NOT NULL,
  description text,
  is_enabled boolean NOT NULL DEFAULT true,
  default_limit integer NOT NULL DEFAULT 20 CHECK (default_limit BETWEEN 1 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT polymarket_catalog_collections_key_check
    CHECK (collection_key ~ '^[a-z][a-z0-9_-]{0,63}$')
);

CREATE TABLE public.polymarket_catalog_releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_key text NOT NULL REFERENCES public.polymarket_catalog_collections(collection_key) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  status text NOT NULL CHECK (status IN ('draft', 'published', 'archived')),
  note text,
  created_by text,
  published_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  UNIQUE (collection_key, version)
);

CREATE UNIQUE INDEX polymarket_catalog_one_draft_per_collection_idx
  ON public.polymarket_catalog_releases (collection_key)
  WHERE status = 'draft';

CREATE UNIQUE INDEX polymarket_catalog_one_published_per_collection_idx
  ON public.polymarket_catalog_releases (collection_key)
  WHERE status = 'published';

CREATE INDEX polymarket_catalog_release_history_idx
  ON public.polymarket_catalog_releases (collection_key, version DESC);

CREATE TABLE public.polymarket_catalog_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id uuid NOT NULL REFERENCES public.polymarket_catalog_releases(id) ON DELETE CASCADE,
  source_kind text NOT NULL CHECK (source_kind IN ('event', 'market')),
  source_slug text NOT NULL,
  source_id text,
  condition_id text,
  title text NOT NULL,
  category text,
  sport text,
  position integer NOT NULL CHECK (position >= 0),
  is_enabled boolean NOT NULL DEFAULT true,
  active_from timestamptz,
  active_until timestamptz,
  display_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT polymarket_catalog_items_slug_check
    CHECK (source_slug ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,255}$'),
  CONSTRAINT polymarket_catalog_items_active_window_check
    CHECK (active_until IS NULL OR active_from IS NULL OR active_until > active_from),
  CONSTRAINT polymarket_catalog_items_overrides_check
    CHECK (jsonb_typeof(display_overrides) = 'object'),
  UNIQUE (release_id, position),
  UNIQUE (release_id, source_kind, source_slug)
);

CREATE INDEX polymarket_catalog_items_active_position_idx
  ON public.polymarket_catalog_items (release_id, position)
  WHERE is_enabled = true;

ALTER TABLE public.polymarket_catalog_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.polymarket_catalog_releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.polymarket_catalog_items ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.polymarket_catalog_collections
  FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.polymarket_catalog_releases
  FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.polymarket_catalog_items
  FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.polymarket_catalog_collections
  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.polymarket_catalog_releases
  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.polymarket_catalog_items
  TO service_role;

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
    display_overrides
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
    coalesce(entry.value -> 'displayOverrides', '{}'::jsonb)
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

CREATE OR REPLACE FUNCTION public.publish_polymarket_catalog_draft(
  p_collection_key text,
  p_expected_revision integer,
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
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('polymarket_catalog:' || p_collection_key, 0));

  SELECT release.id, release.version, release.revision
  INTO draft_id, draft_version, draft_revision
  FROM public.polymarket_catalog_releases AS release
  WHERE release.collection_key = p_collection_key
    AND release.status = 'draft'
  FOR UPDATE;

  IF draft_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision <> draft_revision THEN
    RAISE EXCEPTION 'catalog publish revision conflict' USING ERRCODE = '40001';
  END IF;

  UPDATE public.polymarket_catalog_releases
  SET status = 'archived',
      updated_at = now()
  WHERE collection_key = p_collection_key
    AND status = 'published';

  UPDATE public.polymarket_catalog_releases
  SET status = 'published',
      published_at = now(),
      published_by = nullif(btrim(p_actor), ''),
      updated_at = now()
  WHERE id = draft_id;

  UPDATE public.polymarket_catalog_collections
  SET updated_at = now()
  WHERE collection_key = p_collection_key;

  RETURN draft_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_polymarket_catalog_draft(text, jsonb, integer, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.publish_polymarket_catalog_draft(text, integer, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_polymarket_catalog_draft(text, jsonb, integer, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.publish_polymarket_catalog_draft(text, integer, text)
  TO service_role;

INSERT INTO public.polymarket_catalog_collections (
  collection_key,
  name,
  description,
  default_limit
)
VALUES (
  'featured',
  'Featured markets',
  'The ordered Polymarket events and markets selected for featured surfaces.',
  20
)
ON CONFLICT (collection_key) DO NOTHING;

DO $$
DECLARE
  seeded_release_id uuid;
BEGIN
  SELECT release.id
  INTO seeded_release_id
  FROM public.polymarket_catalog_releases AS release
  WHERE release.collection_key = 'featured'
    AND release.version = 1;

  IF seeded_release_id IS NULL THEN
    INSERT INTO public.polymarket_catalog_releases (
      collection_key,
      version,
      status,
      note,
      created_by,
      published_by,
      published_at
    )
    VALUES (
      'featured',
      1,
      'published',
      'Seeded from the pre-catalog featured market.',
      'migration',
      'migration',
      now()
    )
    RETURNING id INTO seeded_release_id;

    INSERT INTO public.polymarket_catalog_items (
      release_id,
      source_kind,
      source_slug,
      source_id,
      title,
      category,
      sport,
      position
    )
    VALUES (
      seeded_release_id,
      'event',
      'crint-zwe2-bgd2-2026-07-15',
      '697472',
      'T20I Series Zimbabwe vs Bangladesh: Zimbabwe vs Bangladesh',
      'sports',
      'cricket',
      0
    );
  END IF;
END;
$$;
