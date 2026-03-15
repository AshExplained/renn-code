ALTER TABLE tasks
ADD COLUMN kind TEXT NOT NULL DEFAULT 'implementation'
CHECK(kind IN ('implementation','fix','review_followup'));

ALTER TABLE tasks
ADD COLUMN source_task_id TEXT REFERENCES tasks(id);

CREATE TABLE task_failures (
    id              TEXT PRIMARY KEY,
    task_id         TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    source          TEXT NOT NULL
                    CHECK(source IN ('test','review','sync','uat','qa','runtime')),
    summary         TEXT NOT NULL,
    evidence        TEXT,
    status          TEXT NOT NULL DEFAULT 'open'
                    CHECK(status IN ('open','resolved')),
    fix_task_id     TEXT REFERENCES tasks(id),
    created_at      TEXT DEFAULT (datetime('now')),
    resolved_at     TEXT
);

CREATE TABLE task_reviews (
    id              TEXT PRIMARY KEY,
    task_id         TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    reviewer        TEXT,
    decision        TEXT NOT NULL
                    CHECK(decision IN ('approved','changes_requested')),
    summary         TEXT,
    created_at      TEXT DEFAULT (datetime('now'))
);

ALTER TABLE tasks
ADD COLUMN failure_id TEXT REFERENCES task_failures(id);

CREATE TABLE task_review_findings (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    review_id       TEXT NOT NULL REFERENCES task_reviews(id) ON DELETE CASCADE,
    severity        TEXT NOT NULL DEFAULT 'medium'
                    CHECK(severity IN ('critical','high','medium','low')),
    finding         TEXT NOT NULL
);

CREATE INDEX idx_task_failures_task ON task_failures(task_id);
CREATE INDEX idx_task_failures_status ON task_failures(status);
CREATE INDEX idx_task_reviews_task ON task_reviews(task_id);
CREATE INDEX idx_tasks_kind ON tasks(kind);
