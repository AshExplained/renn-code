CREATE TABLE policy_events (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    kind            TEXT NOT NULL CHECK(kind IN ('command','path','transition','review_gate')),
    target          TEXT NOT NULL,
    decision        TEXT NOT NULL CHECK(decision IN ('allow','warn','deny')),
    reason          TEXT NOT NULL,
    created_at      TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_policy_events_created ON policy_events(created_at DESC);
CREATE INDEX idx_policy_events_kind ON policy_events(kind);
