# AGENTS.md — VirgoStars agent coordination

## Current mode: private pilot

Read `README.md`, `docs/PRIVATE_PILOT.md`, `config/fleet.private.json`, `docs/SECURITY.md` and the selected target repository's `AGENTS.md`, roadmap, issue/PR list and relevant source before any work. The pilot currently covers five specific repositories with mixed public/private visibility; the orchestrator itself remains PRIVATE.

Agents may be independent ChatGPT/Codex conversations but share authorized GitHub access. A unique session ID identifies each chat independently; different chats on the same GitHub account MUST NOT share a session ID.

## Dynamic roles
- Planner: split and triage tasks, identify dependencies and file conflicts; no self-approval.
- Developer: acquire an exclusive **issue claim** before coding, use a feature branch, draft PR and tests.
- Tester: independently run/report test evidence and scoped fixes only after claiming if writing code.
- Reviewer: independently inspect existing work; no self-approval or unauthorized merge.
- Auditor: read-only check of architecture, provenance, safety, licenses and backlog consistency.
- Integrator: assess dependencies/conflicts and prepare integration decisions; no automatic merge to main.

## Critical task-claim rules
1. Read `docs/PRIVATE_PILOT.md`. Only work on explicitly triaged, non-overlapping issues.
2. To claim issue N in owner/repo, attempt GitHub `create_file` (not update!) on `coordination/claims` branch of this repository at `claims/owner__repo/issue-N.json`, with a unique session ID and task metadata.
3. Only successful creation grants exclusive ownership of that **one task key**. A failed create, an existing file or an API error means **no claim**. Select another task; do not overwrite.
4. Claim does NOT prove safe ownership of overlapping files across different task IDs. Inspect open PRs, scope and resource conflicts before edits.
5. There is no automatic TTL reclaim; stale claims require owner-mediated review. Do not interpret advisory expiry as an unlocked task.
6. Before each follow-up work cycle, re-read the claim, current issue, target AGENTS.md and PR/branch; stop if ownership has changed. Never assume chat memory is authoritative.
7. Hand off branch, commit, PR, tests actually executed, risks and next action. Do not claim tests passed unless run.
8. Planner roles may propose tasks without claims but cannot bypass code-write rules. No eligible safe tasks -> stop and propose one.

## Repository safeguards
Target-repository rules always apply. No direct push to main, automatic merge, production change, unapproved GitHub Actions, release, access change, publication or license alteration. No shared token in prompts/issues, no private information in public repository issues or PRs. Do not overwrite another agent's branch or uncommitted local work. Cross-repository work requires explicit dependency management and independent scoped PRs.

## Future work
`docs/START_HERE.md`, `docs/PROTOCOL.md`, and `docs/API.md` specify a **future public and 1,000-agent architecture**. They do not authorize public volunteers in the current pilot and no scheduler/API is yet deployed.

## Executable private task queue

Read `config/pilot-tasks.json` and `docs/CLI_PRIVATE_PILOT.md`. Every pilot reviewer must claim their issue before a review, just as developers must claim before code edits. The five initial tasks are reviewer-only and **do not authorize source changes**. `claim` requires a task explicitly marked `ready`; do not work on arbitrary issues. Local Codex may use the Node CLI; a GitHub-connected ChatGPT must use the exact same claim path and ownership rules through connector actions. A task claim is exclusive per issue key only, not across modules or files shared by different issues.


## Next task and continuity

Prefer `claim-next` for local agents with the CLI. Provide the **same session ID** when resuming the same chat; a new chat must generate a fresh session ID. The selector first checks whether that session already owns any curated task; it does not silently reserve a second. Normal `release` is rejected until the owner saves a factual handoff. If a claim is orphaned or you lose your session ID, stop and request explicit maintainer recovery rather than deleting another session's claim.

## Resource-first rule for code changes

For an explicitly approved `access: "write"` task, read [docs/RESOURCE_LOCKS.md](docs/RESOURCE_LOCKS.md). Acquire an exclusive `resources/OWNER__REPO/PARTITION.json` lock on `coordination/claims` **before** attempting `claims/OWNER__REPO/issue-N.json`. Both must have matching task, session, scope ID and frozen root paths. Read-only tasks only require an issue lock. Use the CLI to handle this automatically; connector-only agents must follow the same two-step protocol. If any lock or resource scope is inconsistent, **do not write code**. Single-partition claims do not authorize edits outside their declared paths. Do not change the curated catalog's resource IDs or roots while agents own those tasks.

## Trial launch and terminal submission status

For the first ChatGPT pilot, use `docs/LAUNCH_PRIVATE_MVP.md` (feature branch) and only five read-only reviewer assignments. A finished review is **submitted**, not DONE: publish real issue/PR review findings, save the owner handoff, then create a `submissions/OWNER__REPO/issue-N.json` marker on `coordination/claims` **before** releasing the issue claim. Never delete that marker as part of normal release. The CLI `submit --confirm` performs these steps with ownership validation; connector-only agents follow the documented equivalent. A new chat must not claim an already-submitted task. If the process fails between submission and release, the original owner or maintainer must reconcile it; do not steal the lock.

## Central monitoring and evidence review

Before a new wave of chats, run `fleet-status` or inspect the immutable private `coordination/claims` branch. Use [docs/PILOT_MONITOR.md](docs/PILOT_MONITOR.md) for state definitions. `submitted` means a review was handed off, not that defects are fixed or code approved. Do not reassign submitted work to a new agent without a maintainer decision. Investigate `inconsistent`, `resource-busy` and `submitted-pending-release` states before scheduling new code-writing tasks. Never expose the private monitor output on a public repository.

## Supervised developer pilot, wave 2

Read `docs/LAUNCH_DEVELOPERS_WAVE2.md` before selecting a developer task. Only two curated `pilot_wave:2`, `access:write` issues currently qualify. Each requires a verified **resource-first** lock, then issue claim, exact file-root scope compliance, new feature branch from the latest upstream PR head and a **draft stacked PR** against that PR's branch. No direct writes to active PR branches. Stop rather than expanding file scope. Existing five submitted reviewer findings remain pending independent review.

## Required PR scope gate for write tasks

Before handoff or submission of a write task, inspect `docs/PR_SCOPE_AUDIT.md`. Check every changed file on the new stacked draft PR against the **exact curated resource roots** and verify the PR's base/upstream HEAD. Local agents must run `node bin/vs-agent.mjs audit-pr OWNER/REPO ISSUE PR_NUMBER`; the CLI's `submit` requires `--pr` and rechecks this evidence automatically. GitHub-connector-only chat agents must manually inspect the actual changed-file metadata and report that the machine audit was not run. Never record an unaudited manual check as `scope-clean`. A new PR commit invalidates the previous audit snapshot. No scope audit is PR approval, runtime validation or authorization to merge.
