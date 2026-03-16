# Renn Code Implementation Plan

This document turns the unified harness spec into an implementation roadmap with concrete phases, deliverables, and test gates.

The goal is to build Renn Code as:

- a VS Code extension installed once globally
- a workspace-local harness runtime initialized per project
- a DB-first control plane for planning, execution, review, feedback, and recovery
- a mission-control UX that works with both buttons and terminal-driven agent workflows

## Build Strategy

Build the system in layers:

1. make the DB-backed workflow solid
2. make the extension shell real
3. make sprint automation safe
4. make design review and mission control trustworthy
5. expand analytics, polish, and ecosystem support

Do not try to build the whole product as one milestone.

## Delivery Workflow

Each implementation phase should be developed on its own branch before anything is merged to `main`.

Recommended branch naming:

- `codex/phase-0-runtime-foundation`
- `codex/phase-1-extension-shell`
- `codex/phase-2-design-workflow`
- `codex/phase-3-sprint-planning`
- `codex/phase-4-runner-sessions`
- `codex/phase-5-concurrency-safety`
- `codex/phase-6-failure-retries`
- `codex/phase-7-review-closeout`
- `codex/phase-8-mission-control`
- `codex/phase-9-analytics-polish`

For every phase:

1. create a dedicated branch
2. implement only that phase's scoped work
3. run the relevant tests for that phase
4. perform an audit/review against this implementation plan and `harness-full.md`
5. fix any findings on the same branch
6. merge only after the phase exit criteria are truly met

Do not implement major multi-phase work directly on `main`. The purpose of the per-phase branch model is to contain mistakes, make audits easier, and keep unfinished work from polluting the stable branch.

## Test Strategy

Every phase should be validated across four test layers:

- unit tests for pure scheduling, policy, parsing, and state-transition logic
- integration tests for CLI commands, DB migrations, and workspace-local file installation
- extension tests for workspace detection, commands, panels, and terminal wiring
- end-to-end tests for real project flows such as init, planning, execution, review, and recovery

Use manual UAT only after the phase already passes the lower layers. Manual testing should confirm the human UX, not replace automated verification.

## Phase 0: Runtime Foundation

### Goal

Stabilize the current DB-first CLI/runtime so it can act as the extension backend.

### Deliverables

- solid `ai-scrum` orchestration commands
- schema support for workflow/config/artifact state
- clean project-local install story
- reliable DB bootstrap and migration flow
- project-scoped skill install/update path

### Scope

- add or refine config tables for:
  - workspace configuration
  - workflow phase
  - design review state
  - extension install metadata where useful
- align command semantics around:
  - `/start`
  - `/review-design`
  - `/quick`
  - `/run-sprint`
  - `/sync-state`
- ensure workspace-local skill folders are installable and repairable
- keep DB state authoritative over file state

### Primary Work Areas

- `scripts/`
- `delivery/migrations/`
- `delivery/`
- install/bootstrap logic
- project-scoped skill installers and repair flows

### Tests

- initialize a fresh workspace and verify DB creation
- rerun initialization and verify it is idempotent
- verify migrations run on an existing DB without data loss
- verify workspace-local skill folders are created correctly
- verify missing or partial installs can be repaired
- verify `next_command` and workflow phase remain coherent after init and planning

### Exit Criteria

- a project can be initialized repeatedly without corruption
- the CLI can serve as a stable backend for the future extension
- project-local runtime files are predictable and repairable

## Phase 1: Extension Shell MVP

### Goal

Ship the extension as the product shell for workspace detection and setup.

### Deliverables

- VS Code extension scaffold
- workspace detection
- empty-state screen for non-initialized projects
- one-click `Initialize Harness In This Project`
- basic status view for initialized projects

### Scope

- detect harness-enabled workspaces using local markers such as:
  - `delivery/scrum.db`
  - harness config
  - project-scoped skill folders
- add a mission-control entry in the extension UI
- wire one-click init to the same runtime and CLI used elsewhere
- support extension-driven install/update/repair of workspace-local skill folders

### Primary Work Areas

- `extension/` or equivalent VS Code extension package
- workspace detection and initialization commands
- shared runtime invocation layer
- extension view/container registration

### Tests

- open a non-initialized workspace and verify the extension offers initialization
- initialize from the extension and verify the workspace runtime is created
- reload VS Code and verify detection persists
- open an already-initialized workspace and verify mission control appears instead of setup
- test repair behavior on a partially initialized workspace

### Exit Criteria

- users can install the extension once and initialize a workspace without manual setup steps
- the extension never becomes the source of truth

## Phase 2: Design Workflow And Review

### Goal

Make UI/design work first-class, reviewable, and gated before implementation.

### Deliverables

- `/design` implementation aligned with DB state
- `/review-design` implementation
- design state model:
  - `draft`
  - `pending_review`
  - `changes_requested`
  - `approved`
  - `frozen`
  - `superseded`
- extension design review UI
- CLI fallback for design approval

### Scope

- store artifact metadata and revision markers
- support design freeze as a real state transition
- support superseding frozen designs through new revisions
- prevent design-dependent execution from starting without required approval
- support lightweight quick-path review for small UI changes

### Primary Work Areas

- design artifact metadata and revision storage
- `/design` and `/review-design` command handlers
- extension design review panel
- design freeze and supersession state transitions

### Tests

- create design artifacts and verify they move to `pending_review`
- approve in extension and verify state transitions to `approved` then `frozen`
- approve in CLI and verify the same DB state changes occur
- request design changes and verify iteration loops correctly
- supersede a frozen design and verify revision history remains visible
- verify `/run-sprint` is blocked when design freeze is required but missing

### Exit Criteria

- design review works in both extension and CLI
- design freeze is enforceable and traceable
- implementation gating honors design state

## Phase 3: Sprint Planning And Quick Path

### Goal

Make planning realistic and fast enough for both normal sprint work and small tracked changes.

### Deliverables

- robust `/plan-epics`
- robust `/plan-sprint`
- robust `/quick`
- one-active-sprint planning discipline
- lightweight quick lane behavior

### Scope

- keep future work at epic/backlog level
- create detailed stories/tasks only for the active sprint
- ensure `/quick` creates minimal tracked work instead of bypassing the system
- attach quick work to active sprint or lightweight quick lane as appropriate
- support story acceptance and sprint exit criteria

### Primary Work Areas

- planning command handlers
- sprint/story/task creation logic
- quick-lane modeling
- acceptance criteria persistence

### Tests

- create epics and verify they remain higher-level until sprint planning
- create one active sprint and verify detailed stories/tasks are created only there
- verify a second active sprint is rejected or prevented
- run `/quick` for a small change and verify it creates minimal tracked work
- verify `/quick` escalates to normal planning when scope is too large
- verify UI-sensitive `/quick` work still requires design/human review when policy says so

### Exit Criteria

- normal planning is disciplined and sprint-scoped
- quick work is lightweight but still traceable

## Phase 4: Runner, Sessions, And Safe Execution

### Goal

Implement the policy-aware sprint execution loop with proper session tracking.

### Deliverables

- `/run-sprint` outer automation loop
- session hierarchy:
  - runner session
  - execution session
  - coding session
- task leasing and execution-mode selection
- visible terminal-backed execution option

### Scope

- make `/run-sprint` the primary automation entrypoint
- allow the extension to open watched VS Code terminals for long-running work
- preserve resume paths and session history
- record evidence, artifacts, and task/session outcomes

### Primary Work Areas

- runner loop orchestration
- session persistence
- terminal launch/watching integration
- resume and recommended-next-step logic

### Tests

- start `/run-sprint` on a valid sprint and verify task leasing occurs
- verify runner sessions create execution sessions and coding sessions
- verify a paused run can be resumed cleanly
- verify visible terminal execution works from the extension
- verify status/dashboard state reflects active sessions and leases

### Exit Criteria

- sprint execution is observable, resumable, and grounded in DB state

## Phase 5: Concurrency And Conflict Safety

### Goal

Allow safe `parallel` and `coordinated` execution without merge chaos.

### Deliverables

- write-scope-aware scheduling
- hard/soft conflict handling
- downgrade rules from `parallel` to `coordinated` or `solo`
- conflict logging and recovery behavior

### Scope

- treat `parallel_safe` as necessary but not sufficient
- require dependency safety and write safety
- default unknown scope away from parallel
- isolate parallel work on separate branches

### Primary Work Areas

- lease selection and scheduler policy
- write-scope metadata
- conflict detection
- coordinated-mode batching

### Tests

- verify same-task double-leasing is prevented
- verify overlapping write scopes prevent parallel execution
- verify soft conflicts route to coordinated mode
- verify unknown scope routes away from parallel
- verify conflict events are logged and surfaced in the dashboard

### Exit Criteria

- parallel mode is conservative and trustworthy

## Phase 6: Failure Handling, Retries, And Follow-Up Work

### Goal

Make failures first-class and recoverable without hidden behavior.

### Deliverables

- failure categorization
- bounded retry logic
- partial-work preservation policy
- fix/follow-up task creation rules

### Scope

- record outcomes such as:
  - `completed`
  - `failed`
  - `blocked`
  - `abandoned`
  - `timed_out`
- distinguish recoverable vs non-recoverable failures
- preserve evidence from failed attempts
- avoid silent destructive cleanup

### Primary Work Areas

- failure records and attempt history
- retry policy enforcement
- follow-up/fix task generation
- failure surfacing in status and dashboard views

### Tests

- verify transient failures retry within configured bounds
- verify review/policy/acceptance failures do not auto-retry blindly
- verify repeated failures create durable failure records
- verify follow-up work is created only when appropriate
- verify failed partial work remains inspectable

### Exit Criteria

- failures are visible, bounded, and explainable

## Phase 7: Review, Acceptance, And Closeout

### Goal

Make human review and sprint closure operationally trustworthy.

### Deliverables

- `/review-sprint`
- story acceptance handling
- closeout enforcement
- carry-forward logic
- release notes / closeout artifacts

### Scope

- separate technical review from human acceptance
- support user-facing acceptance gates
- enforce sprint exit criteria before closeout
- preserve carry-forward context for unfinished work

### Primary Work Areas

- review command handlers
- acceptance gate enforcement
- closeout report generation
- carry-forward and backlog re-entry logic

### Tests

- verify reviewed-but-unaccepted stories cannot close when policy blocks them
- verify unmet exit criteria block closeout
- verify closeout artifacts are generated
- verify unfinished work is carried forward correctly
- verify next-command logic is correct after closeout

### Exit Criteria

- sprint closure is trustworthy for both humans and automation

## Phase 8: Mission Control Dashboard

### Goal

Turn the extension into a real control surface for the workspace.

### Deliverables

- project status dashboard
- active sprint cockpit
- review queue
- blocker/failure views
- design review panel
- quick-change visibility
- session/activity feed

### Scope

- show current phase and recommended next command
- show counts and queues for tasks, reviews, blockers, failures, and feedback
- expose primary action buttons
- keep terminal-driven workflows visible and linkable from the dashboard

### Primary Work Areas

- dashboard webview or tree views
- status aggregation queries
- action-button command bindings
- live refresh and polling behavior

### Tests

- verify dashboard matches DB state after each major command
- verify action buttons trigger the correct backend flow
- verify design review and sprint review states are visible
- verify session, blocker, and failure surfaces update live or on refresh

### Exit Criteria

- humans can operate the workspace without raw DB queries

## Phase 9: Analytics, Polish, And Product Hardening

### Goal

Make the product easier to trust, explain, and adopt.

### Deliverables

- delivery analytics
- install/update/repair polish
- settings and policy controls in the extension
- clearer reporting and handoff views
- better ecosystem wrappers where justified

### Scope

- expose metrics such as:
  - review turnaround
  - failure/retry patterns
  - blocked work aging
  - automation effectiveness
- improve onboarding and repair flows
- keep the extension and CLI aligned around one source of truth

### Primary Work Areas

- analytics queries and summaries
- settings UI and config persistence
- upgrade/repair flows
- reporting and handoff surfaces

### Tests

- verify analytics derive from real DB state instead of ad hoc heuristics
- verify upgrade/migration flows do not break initialized workspaces
- verify extension repair/update flows preserve project state
- verify settings changes affect execution policy predictably

### Exit Criteria

- the product feels operable, inspectable, and trustworthy at real-project scale

## Cross-Phase Test Matrix

These checks should be rerun across multiple phases:

- greenfield project initialization
- brownfield project initialization
- extension-first setup flow
- terminal-first setup flow
- design-required project flow
- non-UI project flow
- quick change flow
- normal sprint flow
- review rejection flow
- acceptance rejection flow
- closeout and carry-forward flow
- interrupted session recovery flow
- parallel conflict detection flow

## Release Gates By Milestone

Use these gates before declaring a milestone ready for broader use:

- Alpha gate
  The runtime initializes cleanly, the extension detects workspaces, and one happy-path sprint can be planned and run in a controlled environment.
- Beta gate
  Design review, quick path, session recovery, and closeout all work end to end, with conservative safety defaults enabled.
- RC gate
  Parallel conflict safety, retry handling, dashboard usability, and upgrade/repair flows all pass repeated regression testing on real sample projects.

## Suggested Order Of Execution

If we want the highest-leverage path, build in this order:

1. Phase 0: Runtime Foundation
2. Phase 1: Extension Shell MVP
3. Phase 2: Design Workflow And Review
4. Phase 3: Sprint Planning And Quick Path
5. Phase 4: Runner, Sessions, And Safe Execution
6. Phase 5: Concurrency And Conflict Safety
7. Phase 6: Failure Handling, Retries, And Follow-Up Work
8. Phase 7: Review, Acceptance, And Closeout
9. Phase 8: Mission Control Dashboard
10. Phase 9: Analytics, Polish, And Product Hardening

## Definition Of Done For V1

Renn Code v1 is ready when:

- the extension can initialize a workspace in one click
- the workspace runtime is DB-first and repairable
- design review works in extension and CLI
- one active sprint can be planned and run safely
- quick changes are lightweight but tracked
- runner sessions are observable and resumable
- parallel execution is conservative and safe
- failures and retries are bounded and visible
- review, acceptance, and closeout are enforceable
- the dashboard is useful enough that humans do not need raw DB queries for normal operation
