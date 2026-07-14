-- The public Feed is served by packages/api with the service-role key.
-- Browser and mobile clients must not access or mutate the backing table directly.

ALTER TABLE public.published_narratives ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.published_narratives
  FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE public.published_narratives
  TO service_role;
