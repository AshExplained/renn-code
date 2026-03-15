---
name: "close-sprint"
description: "Close the active sprint, carry unfinished work back to backlog, and write a sprint closeout report."
---

Use this skill when the sprint is ready to close after implementation and review.

Do the following:
1. Run `npx ai-scrum-init`.
2. Inspect resumable context with `npx ai-scrum resume-session --skill close-sprint --latest`.
3. Start a session with `npx ai-scrum start-session --skill close-sprint`.
4. Inspect the product with `npx ai-scrum show-product`.
5. Inspect the active sprint with `npx ai-scrum show-active-sprint`.
6. Inspect guardrails with `npx ai-scrum guardrail-report`.
7. Inspect review-ready tasks with `npx ai-scrum list-review-tasks` and do not close the sprint while any task remains in `in_review`.
8. Inspect story-level acceptance work with `npx ai-scrum list-review-stories` and do not close the sprint while any user-facing story still needs human acceptance.
9. Inspect sprint exit criteria with `npx ai-scrum query --sql "SELECT * FROM sprint_criteria WHERE sprint_id = '...'"`.
10. Use `npx ai-scrum set-sprint-criterion --criterion-id ... --met true` when you have actually verified an exit condition.
11. Use `npx ai-scrum close-sprint --sprint-id ... --closed-by ... --summary ...` only after review tasks are resolved, acceptance-required stories are accepted, and exit criteria are met.
12. Let the CLI write the carry-forward records and the Markdown closeout report.
13. Finish the session with `npx ai-scrum finish-session --session-id ... --summary ... --next-steps ... --item sprint:<id>`.

Examples:

```text
npx ai-scrum set-sprint-criterion --criterion-id 3 --met true
npx ai-scrum accept-story --story-id STORY-2 --accepted-by sponsor --acceptance-note "Approved after UAT"
npx ai-scrum close-sprint --sprint-id SPRINT-1 --closed-by sponsor --summary "Foundation, hero, and feature work are complete"
```
