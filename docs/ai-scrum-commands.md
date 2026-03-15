# AI Scrum Skills

This workspace now uses a SQLite-backed workflow:

- `package.json`
- `scripts/install.js`
- `delivery/migrations/001_init.sql`
- `delivery/scrum.db`
- `scripts/init-db.js`
- `scripts/scrum.js`

## Skill Set

- `init-product`: initialize the database-backed product state from a plain-English idea.
- `plan-epics`: create or refine epics through the orchestrator CLI.
- `plan-sprint`: create one sprint, stories, and tasks through the orchestrator CLI.
- `review-sprint`: review submitted tasks and turn review failures into fix tasks.
- `add-feedback`: add structured feedback and bugs through the orchestrator CLI.
- `run-sprint`: lease ready tasks, auto-select an execution mode, and move tasks toward review.
- `close-sprint`: close the active sprint, carry unfinished work forward, and write a closeout report.
- `sync-state`: inspect drift, apply safe repairs, and recover the next recommended command or resumable session.

## Claude Code

Claude skills live in `.claude/skills/`.

They should call:

```text
node scripts/init-db.js
node scripts/scrum.js ...
```

## Gemini CLI

Gemini can use the shared skills in `.agents/skills/`.

They should call:

```text
node scripts/init-db.js
node scripts/scrum.js ...
```

## Codex

Codex uses the shared skills in `.agents/skills/`.

They should drive the same shell surface:

```text
node scripts/init-db.js
node scripts/scrum.js ...
```

## Safe Loop

```text
init-product
plan-epics
plan-sprint
run-sprint
review-sprint
close-sprint
add-feedback
sync-state
plan-sprint
run-sprint
...
```
