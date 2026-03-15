CREATE TABLE session_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    skill_used      TEXT NOT NULL,
    mode            TEXT,
    started_at      TEXT NOT NULL DEFAULT (datetime('now')),
    ended_at        TEXT,
    status          TEXT NOT NULL DEFAULT 'open'
                    CHECK(status IN ('open','completed','abandoned')),
    summary         TEXT,
    next_steps      TEXT
);

CREATE TABLE session_log_items (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id      INTEGER NOT NULL REFERENCES session_log(id) ON DELETE CASCADE,
    item_type       TEXT NOT NULL CHECK(item_type IN ('product','epic','sprint','story','task','bug','feedback','decision','failure','review')),
    item_id         TEXT NOT NULL
);

CREATE INDEX idx_session_log_status ON session_log(status, started_at DESC);
CREATE INDEX idx_session_log_skill ON session_log(skill_used, started_at DESC);
CREATE INDEX idx_session_items_session ON session_log_items(session_id);
