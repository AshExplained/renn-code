CREATE TABLE workflow_phase (
    product_id      TEXT PRIMARY KEY REFERENCES master_board(id) ON DELETE CASCADE,
    phase           TEXT NOT NULL DEFAULT 'init'
                    CHECK(phase IN (
                        'init','research','spec','design','planning',
                        'building','review','closeout','feedback',
                        'resume','complete'
                    )),
    entered_at      TEXT NOT NULL DEFAULT (datetime('now')),
    previous_phase  TEXT,
    updated_at      TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_workflow_phase_phase ON workflow_phase(phase);
