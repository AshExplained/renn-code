# AI Scrum Workspace Structure

```text
delivery/
  migrations/
    001_init.sql
    002_execution_discipline.sql
    003_close_sprint.sql
    004_guardrail_enforcement.sql
    005_session_log.sql
    006_task_leases.sql
  scrum.db              # runtime artifact, gitignored
scripts/
  init-db.js
  install.js
  scrum.js
.agents/skills/
.claude/skills/
planning/
  reports/              # generated sprint closeout reports
templates/
  workspace-structure.md
```

## Intent

- `delivery/migrations/` is the versioned schema source of truth.
- `delivery/scrum.db` is the live runtime database and should not be committed.
- `scripts/install.js` is the guided setup helper for project or global installation.
- `scripts/init-db.js` bootstraps the database.
- `scripts/scrum.js` is the cross-platform orchestrator CLI for agent-safe reads and writes.
- `.agents/skills/` is the canonical shared skill tree for Codex and Gemini.
- `.claude/skills/` mirrors those skills for Claude Code.
- `planning/` stores generated human-readable exports such as sprint closeout reports.
