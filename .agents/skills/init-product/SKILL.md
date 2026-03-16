---
name: "init-product"
description: "Create or update high-level product state in the SQLite-backed system from a sponsor's plain-English idea."
---

Use this skill when the user wants to initialize or reset the product at a high level.

Do the following:
1. Run `npx ai-scrum init-workspace` to bootstrap the workspace runtime (DB, config, skill folders). This is idempotent.
2. Run `npx ai-scrum-init` if the database has not been created yet.
3. Inspect resumable context with `npx ai-scrum resume-session --skill init-product --latest`.
4. Start a session with `npx ai-scrum start-session --skill init-product`.
5. Inspect existing state with `npx ai-scrum show-product` if a product may already exist.
6. Create or update only the high-level product state here.
7. Capture product idea, product goal, roadmap themes, MVP buckets, assumptions, open questions, and any important sponsor decision.
8. Do not create detailed epics, stories, sprint tasks, or bugs here.
9. Use `npx ai-scrum` for all writes.
10. If no product exists, call `npx ai-scrum create-product --name ... --idea ... --goal ...`.
11. If a product exists, call `npx ai-scrum update-product` for high-level fields instead of recreating it.
12. Use these write operations when needed:
    - `npx ai-scrum add-roadmap-theme`
    - `npx ai-scrum add-mvp-item`
    - `npx ai-scrum add-assumption`
    - `npx ai-scrum add-open-question`
    - `npx ai-scrum add-decision`
13. Set the next command to `/plan-epics`.
14. Finish the session with `npx ai-scrum finish-session --session-id ... --summary ... --next-steps ... --item product:<id>`.
15. Keep the product state concise and truthful.

Examples:

```text
npx ai-scrum create-product --name "FlowPilot" --idea "Build a responsive SaaS landing page" --goal "Generate signups"
npx ai-scrum add-roadmap-theme --title "Hero & Brand Identity"
npx ai-scrum add-mvp-item --bucket must-have --item "Responsive landing page"
```
