-- Select the small, curated set of durable Entities shown in the mobile carousel.
-- Existing rows and all new Entity Manager creations stay private by default.

ALTER TABLE public.entities
  ADD COLUMN IF NOT EXISTS show_in_carousel boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS entities_carousel_updated_idx
  ON public.entities (updated_at DESC)
  WHERE show_in_carousel = true;
