CREATE TABLE workspace_config (
    id                  INTEGER PRIMARY KEY CHECK(id = 1),
    project_type        TEXT NOT NULL DEFAULT 'general',
    planning_horizon    TEXT NOT NULL DEFAULT 'sprint'
                        CHECK(planning_horizon IN ('active_sprint','next_sprint','auto_chain','sprint')),
    governance_mode     TEXT NOT NULL DEFAULT 'standard'
                        CHECK(governance_mode IN ('auto','notify','hitl','standard','strict','relaxed')),
    review_granularity  TEXT NOT NULL DEFAULT 'task'
                        CHECK(review_granularity IN ('task','story','sprint','risk_based')),
    cli_path            TEXT NOT NULL DEFAULT '',
    model_preferences   TEXT NOT NULL DEFAULT '{}',
    execution_defaults  TEXT NOT NULL DEFAULT '{}',
    created_at          TEXT DEFAULT (datetime('now')),
    updated_at          TEXT DEFAULT (datetime('now'))
);
