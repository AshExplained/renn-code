---
name: "plan-epics"
description: "Break the product into high-level epics in the SQLite-backed system."
---

Use this skill when the user wants high-level feature grouping without detailed sprint tasks.

Do the following:
1. Run `npx ai-scrum-init`.
2. Inspect resumable context with `npx ai-scrum resume-session --skill plan-epics --latest`.
3. Start a session with `npx ai-scrum start-session --skill plan-epics`.
4. Inspect the product with `npx ai-scrum show-product`.
5. Inspect existing epics with `npx ai-scrum list-epics`.
6. Create or update only epics here.
7. Generate only epics, not stories, sprint tasks, or bugs.
8. Keep the list MVP-first and realistic.
9. Use `npx ai-scrum` for all writes.
10. Use these write operations when needed:
   - `npx ai-scrum create-epic`
   - `npx ai-scrum update-epic`
   - `npx ai-scrum add-epic-dependency`
   - `npx ai-scrum update-product --next-command /plan-sprint`
11. Preserve existing epic IDs and statuses where possible.
12. Set the next command to `/plan-sprint`.
13. Finish the session with `npx ai-scrum finish-session --session-id ... --summary ... --next-steps ... --item epic:<id>`.

Examples:

```text
npx ai-scrum create-epic --productId proj-flowpilot --title "Project Foundation & Design System"
npx ai-scrum create-epic --product-id proj-flowpilot --title "Hero Section" --summary "Build headline, CTA, and supporting visual hierarchy"
npx ai-scrum add-epic-dependency --epicId EPIC-2 --dependsOn EPIC-1
```
