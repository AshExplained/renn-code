# Renn Code

Renn Code is a DB-first AI product harness for turning a project workspace into an agent-driven delivery system with:

- a SQLite control plane
- a sprint-based execution loop
- project-scoped agent skill files
- a VS Code extension product shell that acts as mission control

The current repo contains the core orchestration ideas, SQLite-backed workflow, CLI/runtime pieces, and the evolving unified architecture spec for the full product direction.

## Product Direction

The direction of the project is now:

- install the VS Code extension once
- open any project workspace
- if the workspace is not initialized, click a button to initialize the harness locally in that project
- if the workspace is initialized, use the extension as a mission-control dashboard for status, design review, sprint execution, blockers, reviews, and analytics
- keep the actual runtime state inside the workspace, not inside the extension
- let users work through buttons, dashboards, and watched VS Code terminals without losing the option to use terminal commands directly

In other words:

- the extension is the product shell
- the workspace is the runtime
- SQLite is the source of truth

## Core Principles

- DB-first, not giant mutable project files
- one active sprint at a time
- automate deeply, but with explicit governance and review gates
- use a fresh-lens reviewer for major review steps instead of letting implementation self-certify completion
- keep project-local skill files for terminal-driven agent tools
- preserve human visibility through dashboards, terminals, review flows, and audit trails

## What Lives In The Workspace

Each harness-enabled workspace should own its own local runtime, including:

- `delivery/scrum.db`
- harness config
- reports and artifacts
- design files
- project-scoped agent skill folders such as `.agents/skills/` and `.claude/skills/`

This keeps the setup portable, explicit, and team-friendly.

## Workflow Shape

The intended high-level loop is:

```text
/start
/plan-epics
/plan-sprint
/run-sprint
/review-sprint
/close-sprint
/add-feedback
/plan-sprint
/run-sprint
...
```

Meaning:

- `/start` bootstraps the project and creates the initial product state
- `/plan-epics` defines the high-level feature groups
- `/plan-sprint` creates exactly one active sprint with detailed work
- `/run-sprint` runs the policy-aware sprint execution loop
- `/review-sprint` is the fresh-lens review step: it should be performed by a separate reviewer session, reviewer agent, or human reviewer, and it either approves work or creates follow-up fixes
- `/close-sprint` closes the sprint and writes closeout output
- `/add-feedback` feeds bugs, UAT, and sponsor feedback back into planning
- `/sync-state` recovers from interruptions, stale state, and drift

## Quick Path

Small changes should not require the full ceremony of a large feature flow.

`/quick` is intended to be the lightweight tracked-change lane for:

- bug fixes
- tiny UI or copy updates
- small brownfield enhancements
- low-risk refactors
- follow-up fixes after review or UAT

It should still create minimal DB-tracked work, evidence, and review state instead of bypassing the system.

## VS Code Extension Vision

The extension is not just a design renderer. It is intended to become mission control for the workspace.

Planned extension responsibilities include:

- detect whether a workspace is harness-enabled
- offer one-click initialization when it is not
- install workspace-local runtime pieces such as DB/config/skill files during initialization
- show a project dashboard when it is
- expose buttons for the common workflow actions
- provide design review and freeze flows
- surface blockers, failures, reviews, and acceptance gates
- show sprint and automation analytics
- open VS Code terminals for watched setup and execution flows when the user wants to observe live work

The extension should remain a UI over the same DB-backed system, not a second workflow engine.

## Terminal And Agent Tooling

Renn Code is designed to work well in both:

- button-driven extension workflows
- terminal-driven agent workflows

The workspace-local skill folders are a feature, not a fallback. They make the project self-contained and let tools like Claude, Codex, and Gemini read project-scoped instructions directly.

The extension and the terminal should both sit on top of the same underlying harness runtime:

- extension buttons call the same DB-backed orchestration layer
- workspace-local skill files support terminal and agent-tool workflows
- users can choose between mission-control UX and terminal-first UX without splitting the system in two

## Current Repository Contents

Today this repo includes:

- `scripts/scrum.js`: orchestrator CLI
- `scripts/init-db.js`: DB bootstrap
- `delivery/migrations/`: SQLite schema migrations through task leases, session logging, and acceptance gates
- `.agents/skills/`: shared project skills
- `.claude/skills/`: Claude-oriented mirrors
- `harness-full.md`: the main unified architecture and product-direction spec

## Setup Today

```text
npm install
node scripts/init-db.js
```

Or run the installer:

```text
node scripts/install.js
```

## Repository Structure

```text
.agents/skills/
.claude/skills/
delivery/
docs/
planning/
scripts/
templates/
harness-full.md
README.md
```

### Key folders

- `.agents/skills/`: shared project-scoped skills
- `.claude/skills/`: Claude-oriented skill wrappers
- `delivery/`: SQLite migrations and runtime DB location, including the current acceptance-gate schema layer
- `planning/`: reports and exported snapshots
- `scripts/`: bootstrap and orchestration scripts
- `docs/`: supporting reference docs
- `harness-full.md`: current full product and architecture direction

## Command Surface

The current and intended command surface is centered around:

- `/start`
- `/resume`
- `/status`
- `/design`
- `/review-design`
- `/quick`
- `/plan-epics`
- `/plan-sprint`
- `/run-sprint`
- `/review-sprint`
- `/close-sprint`
- `/add-feedback`
- `/sync-state`

## Why This Exists

The goal is to build a real product-development harness that feels closer to a disciplined engineering team than a one-shot AI generator:

- plan at the right level
- execute one sprint at a time
- support both autonomy and human oversight
- preserve traceability in the DB
- keep the workspace self-contained
- make the extension the best UX without making it the source of truth

## Main Spec

The most complete statement of the current direction lives in:

- [harness-full.md](/Users/ash/Development/Codex-projects/combine-harness/v1/harness-full.md)

The implementation roadmap for building that direction lives in:

- [docs/implementation-plan.md](/Users/ash/Development/Codex-projects/combine-harness/v1/docs/implementation-plan.md)
