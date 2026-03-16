# Delivery Files

This directory now stores the SQLite delivery state:

- `migrations/001_init.sql`: versioned schema
- `migrations/002_execution_discipline.sql`: review and failure tracking
- `migrations/003_close_sprint.sql`: sprint closeout and carry-forward state
- `migrations/004_guardrail_enforcement.sql`: policy event log
- `migrations/005_session_log.sql`: session memory and resume support
- `migrations/006_task_leases.sql`: run leases for orchestration
- `migrations/007_acceptance_gates.sql`: story acceptance and human review gates
- `migrations/008_workspace_config.sql`: workspace-level configuration singleton
- `migrations/009_workflow_phase.sql`: product lifecycle phase tracking
- `migrations/010_design_and_extension_metadata.sql`: design artifacts, design reviews, and extension install metadata
- `migrations/011_design_workflow.sql`: design_review_required config flag, reviewer session linkage, artifact-story/sprint linkage
- `scrum.db`: runtime database, intentionally gitignored

Use:

- `node scripts/init-db.js` to create or migrate the database
- `node scripts/scrum.js` to perform orchestrated writes and common reads
- `ai-scrum-init` and `ai-scrum ...` when the package is installed as a dependency or global CLI
