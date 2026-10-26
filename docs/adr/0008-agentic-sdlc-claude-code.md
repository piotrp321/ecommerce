# ADR-0008: Agentic SDLC with Claude Code (feature-delivery skill and subagents)

- Status: accepted
- Date: 2026-10-25

> **Continued by [ADR-0010](0010-agentic-sdlc-performance.md):** models and effort per role, module checks during implementation with one full `make check` per round, FULL then DELTA review and QA, and the CI production image check on demand only.

## Context

Most of the code in this repository is written by AI agents ([ADR-0001](0001-monorepo-layout.md)). Until now a single agent session planned, implemented, tested and reviewed its own work, so the same context that wrote the code also judged it. The project is a vehicle for learning Agentic Software Development, and we want a first, repeatable delivery process with separated roles. Constraints:

- Native Claude Code mechanisms only (project skills, custom subagents, worktree isolation, permission rules); no orchestration framework, hooks or extra tooling.
- The user approves the scope, every push and every merge. No automatic merge, no automatic deletion of branches, worktrees or Docker data.
- Several sessions and worktrees run in parallel on one machine. `compose.yaml` sets the project name `ecommerce`, so a Compose command without an isolated project can stop or rebuild another session's containers.
- `make check-prod` (`infra/scripts/check-prod-stack.sh`) runs the production topology in the fixed project `ecommerce-prod-check` and tears it down with `down --remove-orphans`. A `COMPOSE_PROJECT_NAME` from the environment or a `.env` file overrides that name.
- CI runs only for pull requests to `main` and pushes to `main`.
- `.claude/` was ignored as a whole, so project skills and agents could not be versioned.

## Decision

1. **Orchestrator skill.** `.claude/skills/feature-delivery/SKILL.md`, invoked manually as `/feature-delivery <task>` (`disable-model-invocation: true`). It runs in the main session, because only the main session can talk to the user (subagents have no `AskUserQuestion`). It analyses the task, writes a plan with acceptance criteria, waits for approval, delegates, triages findings, runs the final local checks and prepares the PR. It does not implement.

2. **Three subagents** in `.claude/agents/`, each with a fixed scope and report format:
   - `developer`: implements in its own git worktree (`isolation: worktree`, branched from `origin/main`), on `feature/<slug>`; writes tests, runs `make check` before every commit, applies review and QA fixes as new commits (no history rewrites); never pushes or merges.
   - `code-reviewer`: read-only (`Read, Grep, Glob, Bash`), reviews the diff `BASE...REVIEW_SHA` from git objects, reports findings P0–P3 with file, line, rationale and reproduction, returns `APPROVE` or `REQUEST CHANGES`.
   - `qa-tester`: own worktree checked out detached at `REVIEW_SHA`, own Compose project; designs scenarios from the acceptance criteria and tests the running application (API, database, concurrency, browser, responsiveness, accessibility when relevant); no `Edit`/`Write`; returns `PASS`, `FAIL` or `BLOCKED`.
   Subagents get no `Agent` tool, so only the orchestrator coordinates. Agent Teams are not used.

3. **The commit SHA is the contract.** Review and QA run in parallel on the same `REVIEW_SHA`. They receive the requirements and acceptance criteria, never the developer's report or claims. Every fix round produces a new SHA that both re-check.

4. **Blocking rules and limits.** P0/P1 findings and unmet acceptance criteria block; P2/P3 never trigger a fix round on their own and are reported. At most 3 fix rounds (including fixes after local checks and CI), then escalation to the user. Passing tests are not taken as proof of business correctness: the report maps every acceptance criterion to the tests that assert it and to the QA scenarios that exercised it.

5. **Docker isolation.** Each subagent writes its Compose profile (`COMPOSE_PROJECT_NAME=fd-<slug>-dev|qa`, `IMAGES_PREFIX`, ports) to a gitignored `.env` at its worktree root, so every Compose command there targets its own project, and verifies the isolation (`docker compose config`, images, `docker compose ls`, free ports) before the first Docker command. Only development targets run automatically. Production targets (`*-build-prod`, `*-check-prod`, `check-prod`) are not run locally by the process; the CI job `production-image` covers them.

6. **User gates.** Plan approval; consent to push the branch and open a draft PR (covering later fix pushes to the same branch); merge only on an explicit user command. The PR is marked ready automatically only when the latest review is `APPROVE`, the latest QA is `PASS`, `make check` passed and CI is green, all on the same SHA.

7. **Versioned configuration and permission rules.** `.gitignore` ignores `.claude/*` except `settings.json`, `skills/` and `agents/`, so local files (`settings.local.json`, `worktrees/`, agent memory) stay private, and ignores the root `.env`. `.claude/settings.json` adds `ask` rules for push, merge, branch and worktree deletion, destructive git commands and Docker volume removal. They prompt even in auto mode, but match only the usual command forms (`git -C . push` is not matched), so the skill keeps its own explicit gates.

## Consequences

- A feature costs several agent contexts and at least two Docker environments (developer and QA), each with `make bootstrap`, plus `make check` before every commit. The process fits features, not one-line fixes.
- Read-only for the reviewer and QA, and "no implementation" for the orchestrator, rely on tool restrictions and instructions, not on a sandbox: Bash can still write files. A PreToolUse hook could enforce it later if needed.
- Claude Code does not document whether a subagent resumed with `SendMessage` keeps its worktree. The agents verify their worktree path and branch on every run, switch with `EnterWorktree` if needed and otherwise report `BLOCKED`.
- Subagent worktrees stay on disk after the process (nothing is deleted automatically by the skill). Claude Code's own retention sweep may remove subagent worktrees older than `cleanupPeriodDays` that hold no uncommitted or unpushed work. The final report lists worktrees, local branches and Compose projects with cleanup commands for the user.
- Subagent worktrees start from `origin/main`. The isolation check requires the root `.env` to be gitignored there, so the agents report `BLOCKED` on commits that predate this change instead of running Docker without isolation.
- Until `check-prod-stack.sh` gets an explicit, isolated project name (a separate small change), production checks run only in CI or manually by the user.
- Desktop sessions read skills and agents from the main checkout. Changes to `.claude/` take effect there after merge, and subagent definitions load at session start.
