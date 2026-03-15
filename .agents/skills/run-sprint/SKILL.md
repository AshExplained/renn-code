---
name: "run-sprint"
description: "Execute a small set of ready sprint tasks through the orchestrator CLI."
---

Use this skill when the user wants execution on the current sprint.

Do the following:
1. Run `npx ai-scrum-init`.
2. Inspect resumable context with `npx ai-scrum resume-session --skill run-sprint --latest`.
3. Inspect the product with `npx ai-scrum show-product`.
4. Inspect the active sprint with `npx ai-scrum show-active-sprint`.
5. Inspect ready tasks with `npx ai-scrum list-ready-tasks`.
6. Inspect the recommended execution mode with `npx ai-scrum select-run-mode`.
7. Start an orchestrated run with `npx ai-scrum start-run --agent ... --mode auto`.
8. Use `npx ai-scrum query --sql "SELECT ..."` when you need deeper read-only inspection.
9. Work only on leased, unblocked tasks from the run session.
10. Follow the CLI's auto-selection guidance:
   - `solo` for one clear task
   - `parallel` for a few `parallel_safe` tasks
   - `coordinated` when the work needs tighter sequencing and review
11. If the selected mode is `parallel`, make that concrete:
   - if the host tool supports multiple workers and the user has allowed delegation, fan work out explicitly
   - otherwise say clearly that you are processing leased tasks sequentially inside one session so you do not imply concurrency that is not really happening
12. Prefer tasks with no blockers and clear scope.
13. Never mark a task `done` without evidence such as code changes, tests, or explicit human acceptance.
14. Use `npx ai-scrum` for all writes.
15. Use these write operations when needed:
   - `npx ai-scrum claim-task`
   - `npx ai-scrum block-task`
   - `npx ai-scrum add-task-artifact`
   - `npx ai-scrum submit-task`
   - `npx ai-scrum sync-state`
16. Never write product code into infrastructure folders such as `delivery/`, `planning/`, `.agents/`, `.claude/`, or `node_modules/`.
17. If no obvious source root exists, choose a sensible implementation root for the project type, such as project root for a simple static site or `src/` for an app.
18. Let submitted work flow into `/review-sprint` instead of marking it done directly unless explicit human acceptance requires a direct completion.
19. If you discover a broken implementation path, use `npx ai-scrum record-task-failure` so the fix-task loop stays structured.
20. If you discover bugs or scope changes outside the current implementation lane, route them through `/add-feedback` instead of inventing direct DB writes.
21. Finish the run with `npx ai-scrum finish-run --session-id ... --summary ...`.

Examples:

```text
npx ai-scrum start-run --agent codex-worker-1 --mode auto
npx ai-scrum claim-task --task-id TASK-1 --agent codex-worker-1
npx ai-scrum submit-task --task-id TASK-1 --evidence "Implemented section and verified locally"
npx ai-scrum finish-run --session-id 12 --summary "Completed leased hero-section work"
```
