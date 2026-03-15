---
name: "add-feedback"
description: "Convert UAT notes, sponsor changes, and bugs into DB-backed feedback and bug records."
---

Use this skill when the user provides review notes, UAT bugs, or change requests.

Do the following:
1. Run `npx ai-scrum-init`.
2. Inspect resumable context with `npx ai-scrum resume-session --skill add-feedback --latest`.
3. Start a session with `npx ai-scrum start-session --skill add-feedback`.
4. Inspect the product with `npx ai-scrum show-product`.
5. Inspect the active sprint with `npx ai-scrum show-active-sprint` if one exists.
6. Use `npx ai-scrum query --sql "SELECT ..."` when you need deeper read-only inspection of existing bugs or feedback.
7. Append new entries instead of replacing old ones.
8. Create a bug only when the input describes broken behavior.
9. Route change requests into structured feedback, backlog guidance, or a product decision.
10. Link feedback or bugs to known items when the connection is clear.
11. Use `npx ai-scrum` for all writes.
12. Use these write operations when needed:
   - `npx ai-scrum add-feedback`
   - `npx ai-scrum create-bug`
   - `npx ai-scrum add-decision`
   - `npx ai-scrum update-product --next-command /plan-sprint`
13. Keep updates small and local.
14. Set the next command to `/plan-sprint` if the new feedback creates new work.
15. Finish the session with `npx ai-scrum finish-session --session-id ... --summary ... --next-steps ... --item feedback:<id>`.
16. Do not use this skill for code-review feedback on tasks already in `in_review`; use `/review-sprint` for that.

Examples:

```text
npx ai-scrum add-feedback --source uat --summary "Pricing cards feel cramped on mobile" --impact high --action "Plan responsive spacing fixes"
npx ai-scrum create-bug --title "CTA button overlaps hero image" --summary "Overlap appears below 768px" --severity high --source qa
npx ai-scrum add-decision --decision "Use a static signup form for MVP" --owner sponsor
```
