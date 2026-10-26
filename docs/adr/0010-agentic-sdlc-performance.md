# ADR-0010: Agentic SDLC v1.1, performance

- Status: accepted
- Date: 2026-10-26

## Context

The `/feature-delivery` process ([ADR-0008](0008-agentic-sdlc-claude-code.md)) works, but it spends more time and tokens than its quality needs:

- All subagents inherit the main session's model and effort, so QA runs on the same expensive setup as review.
- The developer runs the full `make check` before every commit, and the orchestrator runs it again on the final SHA.
- Every fix round repeats a full review and a full QA pass, including a fresh environment.
- The orchestrator reads the whole documentation set for each task.
- CI runs `make check-prod` (production images and topology) on every pull request and push to `main`, also for changes that cannot affect the images.
- Nothing measures how long the phases take.

Independence of review and QA, worktree and Compose isolation, the SHA as the review contract, blocking P0/P1, the 3-round limit and the user gates stay unchanged.

## Decision

1. **Models per role**, in the subagents' frontmatter:
   - `developer`: `opus`, effort `medium`,
   - `code-reviewer`: `opus`, effort `high`,
   - `qa-tester`: `sonnet`, effort `medium`.
   The orchestrator uses the main session's model and passes no `model` or `effort` when it starts an agent, because a per-invocation value overrides the frontmatter. The frontmatter wins over `CLAUDE_CODE_SUBAGENT_MODEL`. Only `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1` (model) and `CLAUDE_CODE_EFFORT_LEVEL` (effort) override it; the project sets neither (checked on 2026-10-26). `/tasks` shows the model and effort of a running subagent.

2. **Checks during implementation.** The developer runs the checks of the modules it changes while working and before each commit (e.g. `backend-arch`, `backend-stan`, `backend-test`; `admin-*`/`store-*` lint, typecheck, test; `contract-lint`). It runs the full `make check` once on the version it hands to review, at the end of the implementation and of each fix round. This is an exception, scoped to `/feature-delivery`, to the "full `make check` before every commit" rule in `AGENTS.md`.

3. **No duplicated `make check`.** The orchestrator accepts the developer's `PASS` when it was run on the final `REVIEW_SHA`, that SHA is the branch tip and the worktree is clean. Otherwise the orchestrator runs it itself. CI Quality gates remain an independent, mandatory check.

4. **FULL, then DELTA.**
   - Review: the first round reviews the whole diff in context. Later rounds review the previous SHA..new SHA delta, the open findings and the code that depends on the changes. A delta that changes the architecture or scope triggers a full review again. New P0/P1 are always reported.
   - QA: the first round is a full run on a fresh environment. Later rounds retest the reported bugs and run a short regression of the changed areas, reusing the environment when its isolation check passes. QA confirms that the containers serve the current SHA by comparing checksums of changed files on the host and in the containers. It also restarts the dev servers of changed frontends and rebuilds when Dockerfiles or Compose files change.

5. **Focused planning.** The orchestrator reads only the documents and code relevant to the task. The plan is short: scope, acceptance criteria, architectural decisions, test strategy, risks.

6. **CI production check on demand.** `.github/workflows/ci.yml` runs Quality gates on pull requests to `main` and pushes to `main`. `production-image` runs only on `workflow_dispatch`, and a manual run executes that job alone. The concurrency group includes the event name, so a manual run and the automatic gates on `main` do not cancel each other. The check is not required by branch protection or rulesets (none exist on `main`, checked on 2026-10-26). Scripts, production Dockerfiles, `compose.prod.yaml` and the topology checks are unchanged. The orchestrator recommends a manual run before merging changes that affect the production images: `infra/`, `compose*.yaml`, the `Makefile`, Dockerfiles, dependency manifests and lockfiles. The PR is marked ready only with that run green, or with the user's explicit decision to skip it.

7. **Execution report.** The orchestrator writes timestamped events to a log outside the repository and ends each task with `AGENTIC SDLC — EXECUTION REPORT`: total time with user waits separated, time per phase, rounds, agent runs, full `make check` runs, CI result, final SHA and PR. Agents report their own start and end times. Tokens and cost are included only when Claude Code exposes them to the session; otherwise the report points to `/usage`. The report templates live in `.claude/skills/feature-delivery/reports.md`, read at the end, so they are available even after the conversation was compacted.

## Consequences

- Fewer tokens and less time per task: QA on Sonnet, typically one full `make check` per round instead of one per commit, and delta rounds instead of repeated full passes.
- Intermediate commits of a `/feature-delivery` branch pass the checks of the modules they touch, not necessarily the full `make check`. The final SHA always passes both `make check` and CI. `git bisect` over intermediate commits is less reliable.
- Sonnet in QA may miss subtle issues. This is mitigated by scenario-based testing from the acceptance criteria, the reviewer on Opus with high effort, and P0/P1 always being reported.
- Production image regressions are caught later. A change that affects the images but is not recognised as such can reach `main` without `make check-prod`. Running the workflow manually, or restoring the automatic trigger, is a one-line decision. The local isolation of `make check-prod` remains a separate task.
- Timestamps of background agents are recorded when the orchestrator processes their completion, which can lag slightly. The agents' own start and end times give their active time.
