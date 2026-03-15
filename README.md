# AI Scrum Workflow

This repo contains a lightweight AI-first Scrum workflow for turning a sponsor's plain-English product idea into a SQLite-backed planning and delivery system that can be used by Claude Code, Gemini CLI, and Codex.

The design goal is simple:

- keep the high-level product truth small
- plan one layer at a time
- execute one sprint at a time
- feed UAT and change requests back into the system without rewriting everything

## Core Idea

Instead of asking one LLM to generate and maintain one giant project file, this repo now uses:

- `package.json`: runtime/dependency manifest
- `scripts/install.js`: setup helper for project or global installation
- `delivery/migrations/001_init.sql`: versioned schema
- `delivery/scrum.db`: runtime source of truth
- `scripts/init-db.js`: DB bootstrap
- `scripts/scrum.js`: orchestrator CLI for reads and writes

This reduces drift, gives us queryability and validation, and avoids whole-file JSON rewrites.

When installed as a package, the CLI now uses the current working directory as the workspace root. That means `delivery/scrum.db` and `planning/reports/` are created in the project where you run the command, not inside `node_modules`.

## Workflow

The intended loop is:

```text
init-product
plan-epics
plan-sprint
run-sprint
review-sprint
close-sprint
add-feedback
plan-sprint
run-sprint
...
```

Meaning:

- `init-product` creates the high-level product skeleton
- `plan-epics` creates or refines high-level epics
- `plan-sprint` creates one sprint with stories and agent-sized tasks
- `run-sprint` leases a small set of ready tasks with auto-selected execution mode
- `review-sprint` approves submitted work or creates linked fix tasks when changes are required
- `close-sprint` closes the sprint, carries unfinished work forward, and writes a closeout report
- `add-feedback` converts UAT notes, bugs, and changes into structured updates
- `sync-state` is the recovery lane for drift, stale task state, expired leases, and interrupted sessions

## Repository Structure

```text
.agents/skills/
.claude/skills/
planning/
delivery/
docs/
scripts/
templates/
README.md
package.json
```

### Key folders

- `.agents/skills/`: canonical shared skills for Codex and Gemini
- `.claude/skills/`: Claude-native skill mirrors
- `planning/`: optional exported snapshots
- `delivery/`: SQLite migrations and runtime DB
- `docs/`: workflow and planning reference docs
- `scripts/`: install helper, DB bootstrap, and orchestrator CLI
- `templates/`: small reference docs

## Setup

```text
npm install
node scripts/init-db.js
```

Or run the guided installer:

```text
node scripts/install.js
```

When you run the installer from another project with `project` scope, it now:
- initializes `delivery/scrum.db` in that project
- installs `.agents/skills/` for Codex and Gemini
- installs `.claude/skills/` for Claude Code

## Package CLI

If you install this package into another project, it exposes these binaries:

```text
ai-scrum-install
ai-scrum-init
ai-scrum
```

Example:

```text
npm install /path/to/ai-scrum-workflow
npx ai-scrum-install
npx ai-scrum-init
npx ai-scrum show-product
```

Or after a global install / linked bin:

```text
ai-scrum-install
ai-scrum-init
ai-scrum show-product
```

### Claude Code

Claude reads project skills from `.claude/skills/`.

Use:

```text
/init-product
/plan-epics
/plan-sprint
/run-sprint
/review-sprint
/close-sprint
/add-feedback
/sync-state
```

Each skill should drive:

```text
node scripts/init-db.js
node scripts/scrum.js ...
```

### Gemini CLI

Gemini can read the shared skills directly from `.agents/skills/`.

Use the matching skill names in your prompt and let the skill drive:

```text
node scripts/init-db.js
node scripts/scrum.js ...
```

### Codex

Codex reads the shared skills from `.agents/skills/`.

Use:

```text
Use $init-product to initialize the DB-backed product state.
Use $plan-epics to create epics through node scripts/scrum.js.
Use $plan-sprint to create sprint data through node scripts/scrum.js.
Use $run-sprint to claim and advance task state through node scripts/scrum.js.
Use $review-sprint to review submitted work and create fix tasks when needed.
Use $close-sprint to close the active sprint and generate a closeout report.
Use $add-feedback to add feedback and bugs through node scripts/scrum.js.
Use $sync-state to detect drift, repair safe inconsistencies, and recover the next step.
```

## Suggested Usage Pattern

1. Start with `init-product` using the sponsor's plain-English requirement.
2. Run `plan-epics` to create major feature groups only.
3. Run `plan-sprint` to create just the next sprint.
4. Run `run-sprint` to lease and execute a small set of ready tasks using the recommended mode.
5. Run `review-sprint` to approve good work or generate fix tasks.
6. Run `close-sprint` when implementation and review are complete for the active sprint.
7. After human review or UAT, run `add-feedback`.
8. Run `sync-state` whenever the session is interrupted or the board looks inconsistent.
9. Repeat the loop.

## Reference Files

- [docs/ai-scrum-commands.md](/Users/ash/Development/Codex-projects/scrum-test/docs/ai-scrum-commands.md)
- [docs/ai-scrum-workflow-diagram.md](/Users/ash/Development/Codex-projects/scrum-test/docs/ai-scrum-workflow-diagram.md)
- [docs/product-idea-to-scrum-tree.md](/Users/ash/Development/Codex-projects/scrum-test/docs/product-idea-to-scrum-tree.md)
- [templates/workspace-structure.md](/Users/ash/Development/Codex-projects/scrum-test/templates/workspace-structure.md)

## Why This Exists

AI agents work better when they build one small layer at a time rather than generating and mutating one giant project file. This repo now keeps that state in SQLite while preserving the same small-loop planning and delivery model.
