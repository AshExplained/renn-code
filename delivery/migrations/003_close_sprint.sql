CREATE TABLE sprint_closures (
    id                          TEXT PRIMARY KEY,
    sprint_id                   TEXT NOT NULL REFERENCES sprints(id) ON DELETE CASCADE,
    closed_by                   TEXT NOT NULL,
    summary                     TEXT,
    report_path                 TEXT NOT NULL,
    completed_story_count       INTEGER NOT NULL DEFAULT 0,
    completed_task_count        INTEGER NOT NULL DEFAULT 0,
    carry_forward_story_count   INTEGER NOT NULL DEFAULT 0,
    carry_forward_task_count    INTEGER NOT NULL DEFAULT 0,
    created_at                  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE sprint_carry_forward_items (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    closure_id      TEXT NOT NULL REFERENCES sprint_closures(id) ON DELETE CASCADE,
    item_type       TEXT NOT NULL CHECK(item_type IN ('story','task')),
    item_id         TEXT NOT NULL,
    reason          TEXT NOT NULL
);

CREATE INDEX idx_sprint_closures_sprint ON sprint_closures(sprint_id);
CREATE INDEX idx_sprint_carry_forward_closure ON sprint_carry_forward_items(closure_id);
