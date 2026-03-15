---
name: "review-sprint"
description: "Review submitted sprint tasks, approve strong work, or generate fix tasks when changes are required."
---

Use this skill when the user wants to review tasks that are currently in `in_review`.

Do the following:
1. Run `npx ai-scrum-init`.
2. Inspect resumable context with `npx ai-scrum resume-session --skill review-sprint --latest`.
3. Start a session with `npx ai-scrum start-session --skill review-sprint`.
4. Inspect the product with `npx ai-scrum show-product`.
5. Inspect review-ready tasks with `npx ai-scrum list-review-tasks`.
6. Inspect story-level acceptance work with `npx ai-scrum list-review-stories`.
7. Use `npx ai-scrum query --sql "SELECT ..."` when you need deeper read-only inspection of artifacts, failures, acceptance criteria, or related story state.
8. Review only tasks already in `in_review`, and accept only stories already in `in_review`.
9. Never approve a task without checking its evidence, artifacts, and the actual code/tests behind the change.
10. Prefer the simpler review commands instead of probing or shell chaining:
   - `npx ai-scrum approve-task ...`
   - `npx ai-scrum request-task-changes ...`
11. Use `npx ai-scrum accept-story --story-id ... --accepted-by ... --acceptance-note ...` when a user-facing story has passed human/UAT review and is ready to count as accepted.
12. For stories with acceptance criteria or human signoff requirements, do not assume task approval alone is enough for sprint closure.
13. When requesting changes, include a concise summary and findings so the CLI can create a linked fix task automatically.
14. Do not batch approvals with `&&`. Review tasks one by one so the audit trail stays clear.
15. Use `npx ai-scrum guardrail-report` or `npx ai-scrum sync-state` if task state looks inconsistent.
16. Let approved reviews move tasks to `done`; let change requests feed the fix-task loop instead of editing task state manually.
17. Finish the session with `npx ai-scrum finish-session --session-id ... --summary ... --next-steps ... --item review:<id>`.

Examples:

```text
npx ai-scrum approve-task --task-id TASK-4 --reviewer qa --acceptance-note "Looks good in browser review"
npx ai-scrum request-task-changes --task-id TASK-5 --reviewer qa --summary "Spacing breaks on mobile" --finding high:"Fix mobile spacing regression"
npx ai-scrum accept-story --story-id STORY-2 --accepted-by sponsor --acceptance-note "Hero and mobile layout approved in UAT"
```
