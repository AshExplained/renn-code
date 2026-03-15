---
name: "plan-sprint"
description: "Create or extend exactly one sprint in the SQLite-backed system."
---

Use this skill when the user wants the next sprint broken into actionable work.

Do the following:
1. Run `npx ai-scrum-init`.
2. Inspect resumable context with `npx ai-scrum resume-session --skill plan-sprint --latest`.
3. Start a session with `npx ai-scrum start-session --skill plan-sprint`.
4. Inspect the product with `npx ai-scrum show-product`.
5. Inspect epics with `npx ai-scrum list-epics`.
6. Inspect the active sprint with `npx ai-scrum show-active-sprint` if one exists.
7. Use `npx ai-scrum query --sql "SELECT ..."` when you need deeper read-only inspection of bugs, feedback, stories, or task state.
8. Create or extend exactly one sprint here.
9. Plan only one sprint at a time.
10. Create only 3 to 7 stories and 5 to 15 tasks unless the user explicitly asks for more.
11. Pull in critical bugs or feedback only if they belong in the next sprint.
12. Make tasks agent-sized, testable, and specific.
13. Add `parallel_safe` only when tasks are truly independent.
14. Use `agent_hint` to point work to the right kind of agent.
15. Use `npx ai-scrum` for all writes.
16. If there is no suitable sprint yet, call `npx ai-scrum create-sprint --name ... --goal ... --activate`.
17. For UI-heavy work such as landing pages, marketing sites, dashboards, or product surfaces, include an explicit design-finalization story before implementation-heavy stories.
18. For UI-heavy stories, decompose work more atomically than “build section” and “style section”. Prefer this pattern:
   - finalize copy/content
   - finalize layout or wireframe notes
   - implement structure/markup
   - implement styling
   - verify responsiveness
   - review or signoff
19. Mark user-facing stories with `--requires-human-acceptance` when they need visual or sponsor/UAT signoff.
20. Add story acceptance criteria with `--criterion ...` so the story has explicit exit conditions.
21. Add sprint exit criteria with `npx ai-scrum add-sprint-criterion --kind exit ...` for important closure rules such as responsive QA, UAT signoff, or “all critical stories accepted”.
22. Never target infrastructure paths like `delivery/`, `planning/`, `.agents/`, `.claude/`, or `node_modules/` in task file lists.
23. Use these write operations when needed:
   - `npx ai-scrum create-story`
   - `npx ai-scrum create-task`
   - `npx ai-scrum add-sprint-criterion`
   - `npx ai-scrum update-product --next-command /run-sprint`
24. Set the next command to `/run-sprint`.
25. Finish the session with `npx ai-scrum finish-session --session-id ... --summary ... --next-steps ... --item sprint:<id>`.

Examples:

```text
npx ai-scrum create-sprint --name "Sprint 1: Foundation & Hero" --activate --epic EPIC-1 --epic EPIC-2
npx ai-scrum add-sprint-criterion --sprint-id SPRINT-1 --kind exit --criterion "Critical user-facing stories are accepted"
npx ai-scrum create-story --sprintId SPRINT-1 --epicId EPIC-1 --title "Finalize landing-page visual direction" --requires-human-acceptance --criterion "Layout direction approved" --criterion "Typography and color system approved"
npx ai-scrum create-story --sprintId SPRINT-1 --epicId EPIC-2 --title "Hero Section Implementation" --requires-human-acceptance --criterion "Hero matches approved layout" --criterion "Hero passes mobile responsiveness check"
npx ai-scrum create-task --storyId STORY-1 --title "Create base HTML structure" --agentHint frontend --parallel-safe
```
