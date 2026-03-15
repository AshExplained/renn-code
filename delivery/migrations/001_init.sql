PRAGMA foreign_keys = ON;

CREATE TABLE master_board (
    id                  TEXT PRIMARY KEY,
    name                TEXT NOT NULL,
    status              TEXT NOT NULL CHECK(status IN ('draft','planning','in_progress','delivered')),
    plain_english_idea  TEXT,
    product_goal        TEXT,
    active_sprint_id    TEXT,
    next_command        TEXT,
    notes               TEXT,
    created_at          TEXT DEFAULT (datetime('now')),
    updated_at          TEXT DEFAULT (datetime('now'))
);

CREATE TABLE roadmap_themes (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id      TEXT NOT NULL REFERENCES master_board(id) ON DELETE CASCADE,
    theme           TEXT NOT NULL
);

CREATE TABLE assumptions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id      TEXT NOT NULL REFERENCES master_board(id) ON DELETE CASCADE,
    assumption      TEXT NOT NULL
);

CREATE TABLE open_questions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id      TEXT NOT NULL REFERENCES master_board(id) ON DELETE CASCADE,
    question        TEXT NOT NULL,
    resolved        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE mvp_buckets (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id      TEXT NOT NULL REFERENCES master_board(id) ON DELETE CASCADE,
    bucket          TEXT NOT NULL CHECK(bucket IN ('must_have','should_have_later','future')),
    item            TEXT NOT NULL
);

CREATE TABLE epics (
    id              TEXT PRIMARY KEY,
    product_id      TEXT NOT NULL REFERENCES master_board(id),
    title           TEXT NOT NULL,
    summary         TEXT,
    mvp_bucket      TEXT CHECK(mvp_bucket IN ('must_have','should_have_later','future')),
    status          TEXT NOT NULL DEFAULT 'candidate'
                    CHECK(status IN ('candidate','planned','in_progress','done')),
    priority        TEXT NOT NULL DEFAULT 'medium'
                    CHECK(priority IN ('high','medium','low')),
    notes           TEXT,
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE epic_goals (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    epic_id         TEXT NOT NULL REFERENCES epics(id) ON DELETE CASCADE,
    goal            TEXT NOT NULL
);

CREATE TABLE epic_dependencies (
    epic_id         TEXT NOT NULL REFERENCES epics(id) ON DELETE CASCADE,
    depends_on_id   TEXT NOT NULL REFERENCES epics(id) ON DELETE CASCADE,
    PRIMARY KEY (epic_id, depends_on_id),
    CHECK (epic_id != depends_on_id)
);

CREATE TABLE sprints (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    goal            TEXT,
    status          TEXT NOT NULL DEFAULT 'planned'
                    CHECK(status IN ('planned','active','completed')),
    start_date      TEXT,
    end_date        TEXT,
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE sprint_criteria (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    sprint_id       TEXT NOT NULL REFERENCES sprints(id) ON DELETE CASCADE,
    kind            TEXT NOT NULL CHECK(kind IN ('entry','exit')),
    criterion       TEXT NOT NULL,
    met             INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE sprint_epics (
    sprint_id       TEXT NOT NULL REFERENCES sprints(id) ON DELETE CASCADE,
    epic_id         TEXT NOT NULL REFERENCES epics(id) ON DELETE CASCADE,
    PRIMARY KEY (sprint_id, epic_id)
);

CREATE TABLE stories (
    id                  TEXT PRIMARY KEY,
    title               TEXT NOT NULL,
    summary             TEXT,
    parent_epic_id      TEXT REFERENCES epics(id),
    sprint_id           TEXT REFERENCES sprints(id),
    status              TEXT NOT NULL DEFAULT 'ready'
                        CHECK(status IN ('ready','in_progress','blocked','in_review','accepted','done')),
    notes               TEXT,
    created_at          TEXT DEFAULT (datetime('now')),
    updated_at          TEXT DEFAULT (datetime('now'))
);

CREATE TABLE story_acceptance_criteria (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    story_id        TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
    criterion       TEXT NOT NULL,
    met             INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE story_dependencies (
    story_id        TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
    depends_on_id   TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
    PRIMARY KEY (story_id, depends_on_id),
    CHECK (story_id != depends_on_id)
);

CREATE TABLE tasks (
    id                  TEXT PRIMARY KEY,
    title               TEXT NOT NULL,
    summary             TEXT,
    parent_story_id     TEXT NOT NULL REFERENCES stories(id),
    status              TEXT NOT NULL DEFAULT 'ready'
                        CHECK(status IN ('ready','in_progress','blocked','in_review','done')),
    priority            TEXT NOT NULL DEFAULT 'medium'
                        CHECK(priority IN ('high','medium','low')),
    parallel_safe       INTEGER NOT NULL DEFAULT 0,
    agent_hint          TEXT,
    notes               TEXT,
    assigned_agent      TEXT,
    evidence            TEXT,
    created_at          TEXT DEFAULT (datetime('now')),
    updated_at          TEXT DEFAULT (datetime('now'))
);

CREATE TABLE task_dependencies (
    task_id         TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    depends_on_id   TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, depends_on_id),
    CHECK (task_id != depends_on_id)
);

CREATE TABLE task_blockers (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id         TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    description     TEXT NOT NULL,
    resolved        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE task_files (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id         TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    file_path       TEXT NOT NULL
);

CREATE TABLE task_test_requirements (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id         TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    requirement     TEXT NOT NULL
);

CREATE TABLE task_artifacts (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id         TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    artifact        TEXT NOT NULL
);

CREATE TABLE feedback (
    id                  TEXT PRIMARY KEY,
    date                TEXT NOT NULL DEFAULT (datetime('now')),
    source              TEXT NOT NULL CHECK(source IN ('sponsor','uat','qa','user-feedback')),
    summary             TEXT NOT NULL,
    impact              TEXT,
    recommended_action  TEXT,
    status              TEXT NOT NULL DEFAULT 'open'
                        CHECK(status IN ('open','in_progress','resolved')),
    created_at          TEXT DEFAULT (datetime('now'))
);

CREATE TABLE feedback_links (
    feedback_id     TEXT NOT NULL REFERENCES feedback(id) ON DELETE CASCADE,
    linked_id       TEXT NOT NULL,
    linked_type     TEXT NOT NULL CHECK(linked_type IN ('task','story','sprint','epic','bug')),
    PRIMARY KEY (feedback_id, linked_id)
);

CREATE TABLE bugs (
    id                  TEXT PRIMARY KEY,
    title               TEXT NOT NULL,
    summary             TEXT,
    severity            TEXT NOT NULL DEFAULT 'medium'
                        CHECK(severity IN ('critical','high','medium','low')),
    status              TEXT NOT NULL DEFAULT 'backlog'
                        CHECK(status IN ('backlog','planned','in_progress','in_review','done','wont_fix')),
    source              TEXT CHECK(source IN ('uat','qa','production','user-report')),
    related_sprint_id   TEXT REFERENCES sprints(id),
    acceptance_criteria TEXT,
    notes               TEXT,
    created_at          TEXT DEFAULT (datetime('now')),
    updated_at          TEXT DEFAULT (datetime('now'))
);

CREATE TABLE bug_links (
    bug_id          TEXT NOT NULL REFERENCES bugs(id) ON DELETE CASCADE,
    linked_id       TEXT NOT NULL,
    linked_type     TEXT NOT NULL CHECK(linked_type IN ('task','story','sprint','epic','feedback')),
    PRIMARY KEY (bug_id, linked_id)
);

CREATE TABLE decisions (
    id              TEXT PRIMARY KEY,
    date            TEXT NOT NULL DEFAULT (datetime('now')),
    owner           TEXT,
    decision        TEXT NOT NULL,
    rationale       TEXT,
    impact          TEXT,
    created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE audit_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp       TEXT NOT NULL DEFAULT (datetime('now')),
    table_name      TEXT NOT NULL,
    record_id       TEXT NOT NULL,
    field_changed   TEXT,
    old_value       TEXT,
    new_value       TEXT,
    changed_by      TEXT
);

CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_story ON tasks(parent_story_id);
CREATE INDEX idx_tasks_priority ON tasks(priority);
CREATE INDEX idx_stories_sprint ON stories(sprint_id);
CREATE INDEX idx_stories_epic ON stories(parent_epic_id);
CREATE INDEX idx_bugs_severity ON bugs(severity);
CREATE INDEX idx_bugs_status ON bugs(status);
CREATE INDEX idx_feedback_status ON feedback(status);
CREATE INDEX idx_audit_record ON audit_log(table_name, record_id);
CREATE INDEX idx_task_deps ON task_dependencies(depends_on_id);
CREATE INDEX idx_story_deps ON story_dependencies(depends_on_id);
CREATE INDEX idx_epic_deps ON epic_dependencies(depends_on_id);

CREATE TRIGGER enforce_task_evidence
BEFORE UPDATE ON tasks
WHEN NEW.status = 'done' AND (NEW.evidence IS NULL OR NEW.evidence = '')
BEGIN
    SELECT RAISE(ABORT, 'Cannot mark task done without evidence (commit hash, test output, or acceptance note)');
END;

CREATE TRIGGER audit_task_status
AFTER UPDATE ON tasks
WHEN OLD.status != NEW.status
BEGIN
    INSERT INTO audit_log (table_name, record_id, field_changed, old_value, new_value, changed_by)
    VALUES ('tasks', NEW.id, 'status', OLD.status, NEW.status, NEW.assigned_agent);
END;

