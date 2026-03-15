# UAT Findings

Date: 2026-03-15
Status: In progress

## High Priority

### 1. Missing Design-Finalization Phase For UI-Heavy Work

Current status:
- Partially fixed in skills. `plan-sprint` now explicitly requires a design-finalization story for UI-heavy work and adds examples for that shape.
- Needs rerun UAT to verify the model actually follows the new planning pattern consistently.

Finding:
- Sprint planning jumps from product idea to implementation too quickly for design-sensitive work such as landing pages.
- The generated sprint/tasks did not include an explicit design-finalization step before coding.

Why it matters:
- Real product work usually needs design discovery, visual direction, layout approval, or wireframe-level confirmation before frontend implementation starts.
- Without this step, the LLM tends to code immediately instead of aligning on UX and visual intent first.

Observed behavior:
- `plan-sprint` created implementation-oriented stories/tasks directly.
- No explicit design story or design approval task was included.

Expected behavior:
- For UI-heavy projects such as landing pages, marketing sites, or product UIs, the system should include design-focused work before implementation.
- Example expected tasks:
  - finalize visual direction
  - define content hierarchy
  - define typography/color/spacing system
  - review and approve design direction

Suggested fix:
- Update planning logic and skill instructions so UI-heavy work requires at least one design-finalization story before frontend build tasks.

### 2. Task Decomposition Still Not Atomic Enough For UI Work

Current status:
- Partially fixed in skills. `plan-sprint` now instructs the model to break UI work into finer-grained content, layout, implementation, responsiveness, and signoff tasks.
- Needs rerun UAT to verify the generated sprint/task breakdown is now human-Jira-quality.

Finding:
- Sprint planning is better than typical one-shot AI coding, but it still does not consistently break UI work into human-Jira-quality atomic tasks.

Why it matters:
- Real Scrum/Jira teams usually decompose frontend work into narrower, independently reviewable units.
- Without enough granularity, tasks become harder to assign, review, validate, and parallelize safely.

Observed behavior:
- The generated sprint did break work into stories and tasks, but many tasks were still too implementation-eager and not granular enough.
- Example pattern observed:
  - `Build hero HTML`
  - `Style hero section`
- Missing finer-grained tasks such as:
  - finalize copy/content
  - finalize layout/wireframe
  - implement structure
  - implement styling
  - verify responsiveness
  - review/signoff

Expected behavior:
- UI-heavy work should be decomposed into smaller, independently reviewable tasks similar to how a disciplined human Scrum/Jira team would structure them.
- Tasks should be easier to parallelize and easier to verify one by one.

Suggested fix:
- Strengthen `plan-sprint` so UI work is decomposed more aggressively.
- Add planning heuristics such as:
  - one task = one clear output
  - one task = one narrow change area
  - one task = independently reviewable
  - include design, implementation, responsiveness, and QA-style tasks where relevant

### 3. Implementation Files Created Inside `delivery/`

Current status:
- Fixed in the CLI/policy layer. Task file targets inside `delivery/`, `planning/`, `.agents/`, `.claude/`, and `node_modules/` are now denied by path policy.

Finding:
- `run-sprint` created product implementation files inside `delivery/`.

Why it matters:
- `delivery/` is intended for infrastructure/state artifacts such as the SQLite database and migrations.
- It should not be used for application source files.

Observed behavior:
- Generated implementation output was placed under `delivery/` instead of a proper app/source location.

Expected behavior:
- Product code should be created in a sensible source location such as project root, `src/`, `app/`, or another app-specific folder.
- Infrastructure folders should be treated as protected:
  - `delivery/`
  - `planning/`
  - `.agents/`
  - `.claude/`
  - `node_modules/`

Suggested fix:
- Add stronger execution guardrails to block implementation writes in infrastructure folders.
- Add clearer source-root guidance to planning and run skills.

### 4. Product And Epic State Drift After Successful Delivery

Current status:
- Fixed in the CLI/state layer. Epic status now rolls up from story state, and product status/next-command now derive from actual delivery state during review, sync, run completion, and sprint closeout.

Finding:
- After both sprints were completed successfully, top-level state in the database still looked unfinished or stale.

Why it matters:
- Humans need the high-level board to stay trustworthy after execution.
- If product and epic state drift away from actual sprint/story/task completion, the system can recommend the wrong next step and give misleading delivery status.

Observed behavior:
- `master_board.status` remained `draft` after the full landing page was delivered.
- `master_board.next_command` remained `/plan-sprint` even though both sprints were completed and no open reviews, sessions, leases, bugs, or feedback remained.
- All epics still showed `candidate`, even though their stories were accepted and the implementation was complete.
- One probe-created epic title (`Test`) also survived all the way to the finished project state.

Expected behavior:
- Product-level state should derive from actual work state:
  - planning while backlog is being shaped
  - in_progress while a sprint is active
  - delivered when all planned delivery work is done and no active sprint/review issues remain
- Epic statuses should roll forward automatically from their story state instead of staying stale.

Suggested fix:
- Derive epic status from linked story state and sync it automatically during planning, review, sync, and sprint closeout.
- Derive product status and recommended next command from real delivery state instead of leaving them as stale prompt-era values.
- Prevent obvious probe/test junk from lingering in the high-level backlog view.

## Medium Priority

### 5. `review-sprint` Still Encourages CLI Probing

Current status:
- Partially fixed. The review skill now prefers `approve-task` and `request-task-changes`, which reduces ambiguity and probing.
- Needs rerun UAT to confirm the model stops trying empty `review-task` calls.

Finding:
- During review, the model still probed the CLI by calling `review-task` without required flags first.

Why it matters:
- The workflow is now more stable than before, but probing still wastes time and creates unnecessary error noise during UAT.
- Review should feel deterministic and boring, not exploratory.

Observed behavior:
- The model first ran `npx ai-scrum review-task` with no arguments.
- It then inferred the correct usage from the error and continued successfully.

Expected behavior:
- The skill examples and CLI help should be enough for the model to call `review-task` correctly on the first try.

Suggested fix:
- Strengthen `review-sprint` examples further so the first review action is a complete working command.
- Consider adding a lightweight `list-review-tasks --compact` or `approve-task` helper if review-task remains too general.

### 6. Review Flow Used Shell Chaining For Bulk Approvals

Current status:
- Partially fixed. The review skill now explicitly forbids shell chaining and provides simpler one-task-at-a-time review commands.
- Needs rerun UAT to confirm the model follows that instruction.

Finding:
- The model approved multiple tasks in one chained shell command using `&&`.

Why it matters:
- Chained shell commands are harder to inspect and recover from cleanly.
- They also make the review flow less transparent and less aligned with the intended “small verified steps” design.

Observed behavior:
- After the first approval, the remaining approvals were batched in one shell chain rather than handled as individual explicit review actions.

Expected behavior:
- Reviews should happen as clearly visible, discrete actions, or through a dedicated bulk-review helper if batching is desirable.

Suggested fix:
- Add a clearer skill instruction discouraging shell chaining during review.
- If bulk approval is a real use case, introduce an explicit orchestrator command for it instead of relying on ad hoc shell chaining.

### 7. `parallel_safe` Does Not Yet Lead To Real Parallel Execution

Current status:
- Partially fixed in instructions only. `run-sprint` now tells the model to either fan work out explicitly where supported or say clearly that it is still executing sequentially.
- Still open at the orchestration layer because the CLI does not yet launch true parallel workers by itself.

Finding:
- Tasks marked `parallel_safe` are still typically executed one at a time by a single LLM session.

Why it matters:
- The system currently signals that some tasks are safe to work in parallel, but the skills do not consistently turn that into actual concurrent execution behavior.
- This weakens one of the main advantages of structured planning: independent work should be able to move faster when it is safe to do so.

Observed behavior:
- Even when the sprint contained tasks explicitly marked `parallel_safe`, the LLM still worked through them sequentially in one session.
- `start-run` and mode selection can lease multiple tasks, but the skill behavior in UAT did not clearly fan that work out into separate workers or parallel agents.

Expected behavior:
- If the selected run mode is `parallel`, the execution skill should make that concrete in a visible way:
  - either spawn parallel workers where the host tool supports it
  - or clearly batch independent tasks with an explicit parallel-work strategy rather than treating them as ordinary sequential steps

Suggested fix:
- Strengthen `run-sprint` instructions so `parallel` mode changes execution behavior, not just task selection.
- Add tool-aware execution guidance for environments that can launch multiple workers.
- If true parallel worker spawning is not available in a given tool, the skill should state that limitation explicitly and avoid implying concurrency that is not actually happening.

### 8. Closure And Acceptance Are Still Too Technically Driven

Current status:
- Partially fixed in the data/CLI layer. Stories can now require human acceptance, stories move to `in_review` when tasks are done but acceptance is still needed, and sprint closeout refuses to proceed until those stories are accepted.

Finding:
- The current review and closeout flow can treat technical review as if it were full human acceptance.

Why it matters:
- In real projects, “code exists and looks correct” is not enough to count as true acceptance.
- UI/business-facing work often needs explicit human validation against expectations, acceptance criteria, and UAT outcomes.

Observed behavior:
- Review approval was primarily based on code inspection, artifacts, and evidence.
- There is only lightweight support for human acceptance notes, and closure does not strongly enforce story-level or sponsor/UAT acceptance before sprint closeout.

Expected behavior:
- The system should distinguish between:
  - technical review complete
  - story accepted
  - sprint ready to close
- Sprint closure should be able to require stronger human acceptance for user-facing work.

Suggested fix:
- Strengthen story-level acceptance handling.
- Add clearer acceptance gates before `close-sprint`, especially for UI/business-facing work.
- Consider explicit sponsor/UAT signoff requirements for relevant stories before sprint closure.

### 9. Closure Model Should Move Toward Explicit Exit Conditions

Current status:
- Partially fixed. Sprint exit criteria can now be added and marked met, and close-sprint enforces unmet exit criteria.
- Still open for broader completion signals like automated test/build gating beyond current evidence/review checks.

Finding:
- The current system still leans too much on ad hoc technical review when deciding whether a task or sprint is done.

Why it matters:
- A stronger completion model is to define explicit exit conditions and require verification/backpressure before allowing closure.
- This is closer to how robust agent loops decide completion:
  - acceptance criteria satisfied
  - checks/tests/build pass where relevant
  - explicit completion signal
  - human acceptance for UI/business-facing work when needed

Observed gap:
- Task closure can still feel like “reviewer saw code and approved it.”
- Sprint closure can still feel like “review is done, so close it.”

Expected behavior:
- `Task done` should require:
  - evidence
  - relevant technical verification
  - acceptance criteria satisfied
  - human acceptance note where appropriate
- `Sprint closed` should require:
  - critical stories accepted
  - no unresolved review items
  - explicit closeout/exit conditions met

Suggested fix:
- Introduce explicit exit-condition checks for tasks and sprints.
- Track acceptance criteria completion more strictly at story/task level.
- Treat human UAT/signoff as part of closure for user-facing work rather than an optional afterthought.

## Notes

- These findings were captured during UAT against the older installed skill set to collect real-world issues before rerunning with the latest fixes.
