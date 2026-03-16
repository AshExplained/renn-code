---
name: "review-design"
description: "Review pending design artifacts — approve, request changes, or skip. Must run in a separate session from the designer."
---

Use this skill when the user wants to review design artifacts that are pending review.

IMPORTANT: Design review must happen in a fresh reviewer context, not the same session that created the design. This preserves the fresh-lens review rule.

Do the following:
1. Run `npx ai-scrum init-workspace` to ensure the workspace is ready.
2. Start a SEPARATE reviewer session with `npx ai-scrum start-session --skill review-design --mode design-review`.
3. List pending designs with `npx ai-scrum list-design-artifacts --state pending_review`.
4. For each artifact, review and decide:
   - Approve: `npx ai-scrum review-design --artifact-id <id> --decision approved --reviewer <name> --reviewer-session-id <session-id>`
   - Request changes: `npx ai-scrum review-design --artifact-id <id> --decision changes_requested --reviewer <name> --summary "..." --reviewer-session-id <session-id>`
   - Skip (no design review needed): `npx ai-scrum review-design --artifact-id <id> --decision skip_design --reviewer <name>`
5. After approval, freeze the design: `npx ai-scrum freeze-design --artifact-id <id>`.
6. To supersede a frozen design with a new version: `npx ai-scrum supersede-design --artifact-id <id>`.
7. Finish the session with `npx ai-scrum finish-session --session-id ... --summary ... --next-steps ...`.

Examples:

```text
npx ai-scrum list-design-artifacts --state pending_review
npx ai-scrum review-design --artifact-id DESIGN-1 --decision approved --reviewer "ash" --reviewer-session-id 5
npx ai-scrum freeze-design --artifact-id DESIGN-1
npx ai-scrum supersede-design --artifact-id DESIGN-1 --file-path "v2.png" --notes "Updated hero layout"
```
