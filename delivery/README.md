# Delivery Files

This directory now stores the SQLite delivery state:

- `migrations/001_init.sql`: versioned schema
- `migrations/002_execution_discipline.sql`: review and failure tracking
- `migrations/003_close_sprint.sql`: sprint closeout and carry-forward state
- `migrations/004_guardrail_enforcement.sql`: policy event log
- `migrations/005_session_log.sql`: session memory and resume support
- `migrations/006_task_leases.sql`: run leases for orchestration
- `scrum.db`: runtime database, intentionally gitignored

Use:

- `node scripts/init-db.js` to create or migrate the database
- `node scripts/scrum.js` to perform orchestrated writes and common reads
- `ai-scrum-init` and `ai-scrum ...` when the package is installed as a dependency or global CLI
