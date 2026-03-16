-- Phase 0 enabling schema for design review (Phase 2).
--
-- These tables are created here so that:
-- 1. The migration numbering stays sequential and the schema is complete
--    for workspace health checks and extension detection in Phase 1.
-- 2. Phase 2 can add command logic (design, review-design) without needing
--    a new migration just for table creation.
-- 3. The implementation plan (docs/implementation-plan.md, Phase 0 scope)
--    explicitly lists "design review state" as a config table to add here.
--
-- No command handlers for design_artifacts or design_reviews exist yet.
-- Those are Phase 2 deliverables.

CREATE TABLE design_artifacts (
    id                  TEXT PRIMARY KEY,
    product_id          TEXT NOT NULL REFERENCES master_board(id) ON DELETE CASCADE,
    file_path           TEXT NOT NULL,
    artifact_type       TEXT NOT NULL DEFAULT 'design'
                        CHECK(artifact_type IN ('design','design_system','component','asset')),
    state               TEXT NOT NULL DEFAULT 'draft'
                        CHECK(state IN (
                            'draft','pending_review','changes_requested',
                            'approved','frozen','superseded'
                        )),
    revision            INTEGER NOT NULL DEFAULT 1,
    parent_artifact_id  TEXT REFERENCES design_artifacts(id),
    content_hash        TEXT,
    notes               TEXT,
    created_at          TEXT DEFAULT (datetime('now')),
    updated_at          TEXT DEFAULT (datetime('now'))
);

CREATE TABLE design_reviews (
    id              TEXT PRIMARY KEY,
    artifact_id     TEXT NOT NULL REFERENCES design_artifacts(id) ON DELETE CASCADE,
    reviewer        TEXT,
    decision        TEXT NOT NULL
                    CHECK(decision IN ('approved','changes_requested','skip_design')),
    summary         TEXT,
    frozen_at       TEXT,
    frozen_revision INTEGER,
    created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE extension_install_metadata (
    id                  INTEGER PRIMARY KEY CHECK(id = 1),
    initialized_at      TEXT NOT NULL DEFAULT (datetime('now')),
    harness_version     TEXT NOT NULL DEFAULT '0.1.0',
    workspace_root      TEXT NOT NULL DEFAULT '',
    last_health_check   TEXT,
    schema_version      INTEGER NOT NULL DEFAULT 10,
    updated_at          TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_design_artifacts_product ON design_artifacts(product_id);
CREATE INDEX idx_design_artifacts_state ON design_artifacts(state);
CREATE INDEX idx_design_reviews_artifact ON design_reviews(artifact_id);
