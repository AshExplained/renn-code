-- Phase 2: Design Workflow
-- Adds design_review_required flag to workspace config and
-- a reviewer_session_id column to design_reviews to enforce
-- the fresh-lens review rule (reviewer != designer).

ALTER TABLE workspace_config
ADD COLUMN design_review_required INTEGER NOT NULL DEFAULT 0
CHECK(design_review_required IN (0,1));

ALTER TABLE design_reviews
ADD COLUMN reviewer_session_id INTEGER REFERENCES session_log(id);

ALTER TABLE design_artifacts
ADD COLUMN linked_story_id TEXT REFERENCES stories(id);

ALTER TABLE design_artifacts
ADD COLUMN linked_sprint_id TEXT REFERENCES sprints(id);

CREATE INDEX idx_design_artifacts_story ON design_artifacts(linked_story_id);
