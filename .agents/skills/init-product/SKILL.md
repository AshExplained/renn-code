---
name: "init-product"
description: "Create or update high-level product state in the SQLite-backed system from a sponsor's plain-English idea."
---

Use this skill when the user wants to initialize or reset the product at a high level.

Do the following:
1. Run `npx ai-scrum-init`.
2. Inspect resumable context with `npx ai-scrum resume-session --skill init-product --latest`.
3. Start a session with `npx ai-scrum start-session --skill init-product`.
4. Inspect existing state with `npx ai-scrum show-product` if a product may already exist.
5. Create or update only the high-level product state here.
6. Capture product idea, product goal, roadmap themes, MVP buckets, assumptions, open questions, and any important sponsor decision.
7. Do not create detailed epics, stories, sprint tasks, or bugs here.
8. Use `npx ai-scrum` for all writes.
9. If no product exists, call `npx ai-scrum create-product --name ... --idea ... --goal ...`.
10. If a product exists, call `npx ai-scrum update-product` for high-level fields instead of recreating it.
11. Use these write operations when needed:
   - `npx ai-scrum add-roadmap-theme`
   - `npx ai-scrum add-mvp-item`
   - `npx ai-scrum add-assumption`
   - `npx ai-scrum add-open-question`
   - `npx ai-scrum add-decision`
12. Set the next command to `/plan-epics`.
13. Finish the session with `npx ai-scrum finish-session --session-id ... --summary ... --next-steps ... --item product:<id>`.
14. Keep the product state concise and truthful.

Examples:

```text
npx ai-scrum create-product --name "FlowPilot" --idea "Build a responsive SaaS landing page" --goal "Generate signups"
npx ai-scrum add-roadmap-theme --title "Hero & Brand Identity"
npx ai-scrum add-mvp-item --bucket must-have --item "Responsive landing page"
```
