CREATE TABLE task_leases (
    task_id         TEXT PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
    session_id      INTEGER NOT NULL REFERENCES session_log(id) ON DELETE CASCADE,
    lease_owner     TEXT NOT NULL,
    mode            TEXT NOT NULL CHECK(mode IN ('solo','parallel','coordinated')),
    leased_at       TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at      TEXT NOT NULL
);

CREATE INDEX idx_task_leases_session ON task_leases(session_id);
CREATE INDEX idx_task_leases_expires ON task_leases(expires_at);
