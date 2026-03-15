ALTER TABLE stories
ADD COLUMN requires_human_acceptance INTEGER NOT NULL DEFAULT 0
CHECK(requires_human_acceptance IN (0,1));

ALTER TABLE stories
ADD COLUMN acceptance_note TEXT;

ALTER TABLE stories
ADD COLUMN accepted_by TEXT;

ALTER TABLE stories
ADD COLUMN accepted_at TEXT;

CREATE INDEX idx_stories_status_acceptance
ON stories(status, requires_human_acceptance);
