---
name: "sync-state"
description: "Inspect state drift, apply safe repairs, and recover the next recommended command after interruptions or inconsistent task updates."
---

Use this skill when the user wants recovery, drift detection, or a truth check on the current sprint state.

Do the following:
1. Run `npx ai-scrum-init`.
2. Inspect resumable context with `npx ai-scrum resume-session --latest`.
3. Start a session with `npx ai-scrum start-session --skill sync-state`.
4. Inspect the product with `npx ai-scrum show-product`.
5. Inspect guardrails with `npx ai-scrum guardrail-report`.
6. Inspect sync status with `npx ai-scrum sync-state`.
7. Use `npx ai-scrum sync-state --repair` only for safe repairs such as clearing stale assignments, reopening blockerless tasks, creating missing fix tasks, clearing expired leases, marking abandoned sessions, and refreshing `next_command`.
8. Do not invent work during recovery beyond the CLI's repair path.
9. Finish the session with `npx ai-scrum finish-session --session-id ... --summary ... --next-steps ...`.
10. Summarize the issues found, what was repaired, and the next recommended skill.

Examples:

```text
npx ai-scrum guardrail-report
npx ai-scrum sync-state
npx ai-scrum sync-state --repair
```
