---
name: "design"
description: "Create or update design artifacts and submit them for review in the SQLite-backed system."
---

Use this skill when the user wants to create, update, or submit design artifacts for review.

Do the following:
1. Run `npx ai-scrum init-workspace` to ensure the workspace is ready.
2. Start a session with `npx ai-scrum start-session --skill design`.
3. Create design artifacts with `npx ai-scrum create-design-artifact --file-path <path>`.
4. When design work is ready for review, submit with `npx ai-scrum submit-design --artifact-id <id>`.
5. Do not review your own designs. Design review should happen in a separate reviewer session.
6. Check existing artifacts with `npx ai-scrum list-design-artifacts`.
7. Finish the session with `npx ai-scrum finish-session --session-id ... --summary ... --next-steps "Run /review-design to approve or request changes"`.

Examples:

```text
npx ai-scrum create-design-artifact --file-path "ui_designs/homepage.png" --artifact-type design --notes "Hero section mockup"
npx ai-scrum submit-design --artifact-id DESIGN-1 --content-hash "abc123"
npx ai-scrum list-design-artifacts
```
