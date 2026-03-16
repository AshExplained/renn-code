-- Phase 2: Track the design-generation session on artifacts
-- so the fresh-lens rule can be enforced (reviewer != designer).

ALTER TABLE design_artifacts
ADD COLUMN creator_session_id INTEGER REFERENCES session_log(id);

CREATE INDEX idx_design_artifacts_creator ON design_artifacts(creator_session_id);
