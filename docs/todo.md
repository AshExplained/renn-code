# TODO

## Goal

Become better than `claude-code-harness` by keeping our stronger state architecture and cross-CLI design, while adding the execution maturity they currently lead on.

In short:

- keep `SQLite + Node + shared skills` as the foundation
- add stronger execution discipline
- add smoother session recovery
- add human-friendly visibility
- stay portable across more CLIs than Harness

## Current Strengths To Preserve

- SQLite as the source of truth instead of `Plans.md`
- cross-platform Node runtime
- shared skills for Codex and Gemini in `.agents/skills/`
- Claude mirrors in `.claude/skills/`
- product-owner style flow:
  - `init-product`
  - `plan-epics`
  - `plan-sprint`
  - `run-sprint`
  - `review-sprint`
  - `add-feedback`
  - `sync-state`

## Completed in Delivery Maturity v1

- `close-sprint` release phase with carry-forward tracking and Markdown closeout reports
- stronger guardrail enforcement with `policy_events`, path/command policies, and review gates
- `session_log` plus resumable session summaries
- real CLI-managed orchestration with `start-run`, `finish-run`, and task leases

## Next Up

### 1. Lightweight Board / UI View

This is the clearest next differentiator versus Markdown-based systems.

Build:

- local read-only board first
- then lightweight editing where safe
- swimlanes by sprint/status/role
- review queue view
- bug / feedback queue view
- fix-task lineage view
- session summary view

Goal:

- humans should be able to inspect project state without running raw queries

### 2. Prompt / Skill Deduplication

The mirrored skill trees still have drift risk.

Build:

- canonical prompt bodies in `docs/prompts/`
- thin wrappers in `.agents/skills/` and `.claude/skills/`
- one shared instruction source for each workflow step

Goal:

- keep skills aligned without manual copy-editing

### 3. Human Role Fields

The current schema is AI-first but still weak on mixed human + AI ownership.

Build:

- `assignee_role`
- `assignee_name`
- role-aware board views and filters

Goal:

- clearer ownership in mixed teams

### 4. Release Notes / Handoff Polish

The close-sprint flow exists, but the handoff output can become more useful.

Build:

- richer release notes export
- optional closure checklist
- clearer sponsor-facing handoff summary

Goal:

- make sprint closeout more useful to non-technical reviewers

## Do Later

### Prompt / Skill Deduplication

The original concern here was right: duplicated instructions drift.

Even after moving to skills, we still have mirrored copies under:

- `.agents/skills/`
- `.claude/skills/`

Better long-term shape:

- canonical prompt bodies in `docs/prompts/`
- skill files become thin wrappers that say:
  - read the canonical prompt doc
  - then use `node scripts/scrum.js ...`

Possible structure:

```text
docs/prompts/
  init-product.md
  plan-epics.md
  plan-sprint.md
  run-sprint.md
  review-sprint.md
  add-feedback.md
  sync-state.md
```

### Human Role Fields

Right now `agent_hint` is about AI routing, not human ownership.

Add to tasks:

```sql
assignee_role TEXT CHECK(assignee_role IN (
    'developer','qa','architect','ui_designer','devops','product_owner'
)),
assignee_name TEXT
```

Why this matters:

- better board swimlanes
- better human + AI collaboration
- clearer ownership in mixed teams

## Nice To Have

### Context Decay / Archiving

As the DB grows, old closed work should stop polluting the default context.

Add:

- `archived` flag
- `archive_summary`
- sprint close cleanup
- default queries that ignore archived items unless asked

Suggested direction:

```sql
ALTER TABLE tasks ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tasks ADD COLUMN archive_summary TEXT;
```

### Broader Ecosystem Support

This project should be more portable than Harness, not less.

Keep `.agents/skills/` as the shared center, then consider adapters for:

- GitHub Copilot: `.github/skills/`
- Cline
- Roo Code
- Cursor
- Windsurf
- Trae
- Amp
- OpenCode
- Goose
- v0

Important rule:

- only add tool-specific mirrors/wrappers when there is a real discovery-path need
- do not reintroduce large prompt duplication

## Maybe Never / Be Careful

- do not switch back to Markdown as source of truth
- do not overbuild a giant generic framework before the next useful feature
- do not add too many execution modes without real orchestration behind them
- do not duplicate prompts across tool folders if a shared source can be used
- do not chase every CLI integration before the core workflow is clearly better
- do not build a polished board UI before release, guardrails, and session recovery are solid
- do not add heavy archive machinery until history size is an actual problem

## Suggested Milestones

### Milestone 1. Delivery Maturity
Priority: `Do now`

- `close-sprint` skill
- sprint summary
- carry-forward logic
- release / handoff notes

### Milestone 2. Policy and Safety
Priority: `Do now`

- stronger guardrail enforcement
- protected command/path policy
- stricter state transition rules

### Milestone 3. Session Survival
Priority: `Do now`

- `session_log`
- resume summaries
- context decay / archive behavior
- stronger `sync-state`

### Milestone 4. Execution Upgrade
Priority: `Do now`

- real solo/parallel/coordinated orchestration
- task leasing / reservation
- cleaner failure recovery loops

### Milestone 5. Human Experience
Priority: `Do later`

- lightweight board UI
- role lanes
- reporting / exports
- support for more CLI ecosystems

## Shortest Path To “Better Than Harness”

If we want the most leverage with the least wasted effort, the next build order should be:

1. `close-sprint`
2. stronger policy enforcement
3. `session_log` + resume summaries
4. real execution orchestration
5. lightweight board UI

That is the path most likely to make this project better in practice, not just better in theory.

## Final Triage

### Do Now

- `close-sprint`
- stronger `guardrail / policy enforcement`
- `session_log` and resume summaries
- real execution orchestration behind the existing mode selection

### Do Later

- lightweight board UI
- prompt / skill deduplication through canonical docs
- human role fields like `assignee_role`

### Nice To Have

- archiving / context decay
- support for many more CLI ecosystems

### Maybe Never

- anything that reintroduces duplicated prompt logic
- broad ecosystem adapters that are not needed by real users
- overengineered abstractions before the core loop is excellent
