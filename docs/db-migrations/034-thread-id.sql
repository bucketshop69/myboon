ALTER TABLE published_narratives ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE published_narratives ADD COLUMN IF NOT EXISTS thread_id UUID REFERENCES published_narratives(id);
