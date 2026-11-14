# Integrator role — conditional automatic merge policy (owner proposal)

**Owner policy request (2026-11-14): automatic merges are allowed, with an agent role dedicated to checking them first.** This document and [issue #152](https://github.com/Cesare-ml/virgostars-development-orchestrator/issues/152) propose the implementation; no live merge scheduler is currently deployed. The existing public `main` instructions still prohibit automatic merging until the owner approves and integrates this change, and **the GitHub-only pilot catalog remains blocked** independently.

## One prompt, multiple roles

The universal 16-word initial ChatGPT prompt stays identical for **developer, reviewer, tester, planner and integrator** agents and for 2, 20, 40 or 100 opened chats. A chat obtains its role *only by claiming a task from the approved PRIVATE catalog*. A developer writes a scoped draft PR; an independently assigned integrator performs verifications and, if eligible, invokes the authorized GitHub merge or enables GitHub native auto-merge. A single chat may perform different approved roles on successive `ok avanti` cycles, but **never integrate a change it authored**, even if its earlier developer claim has been released.

### Required owner-approved Integrator assignment

A proposed **future** schema must pin: `role:integrator`, specific `repository`, `pull_request` (or explicitly approved dependency chain), `target_branch`, `allowed_merge_method`, allowed required check evidence, independent reviewer requirements, security class, and exact authorized merge resource partition. The current local CLI validator does **not** support this automatic-merge schema and must be extended and tested before activation. The two initial pilot issues #136 and Event Ephemeris #13 remain **developer** tasks, not integrator authorizations.

Integrator tasks have their own exclusive queue claim and an exclusive merge partition for the target PR/branch. Cross-PR dependencies must be serialized to avoid a race. If the owner-approved manifest or required GitHub permissions are missing, the agent may provide read-only findings but **must not merge**.

## Fail-closed merge gates, in order

1. Check that the Integrator session owns an approved merge task with the exact repository/PR/target and is not the author or substantial contributor to that PR. Verify the task has not been previously completed or integrated.
2. Obtain and re-read the exact PR head/base, open/draft/mergeable state, all changed files and current active claims, outstanding submissions, duplicate open PRs, unresolved review threads and dependency graph. A stacked PR can be integrated to the intended upstream branch only after the appropriate review, or to `main` only after dependency branches have been integrated/rebased and the final diff re-validated. **Do not accidentally bring unaudited upstream work along for the ride.**
3. Confirm every **required** GitHub branch protection/ruleset check and independent review is green and refers to the latest head SHA. Require credible test/build/lint evidence for the touched code on the current head; `not run`, unknown, stale, pending or failed checks are blockers, not a soft pass. Do not mark unsigned/self-reported artifacts as authenticated tests. Explicitly review security, licensing and dependency changes before automatic integration.
4. Stop for human approval when a task involves secrets, repository access/permissions, production deployment, database migrations, license changes, releases or branch-protection/ruleset changes. The owner may define stricter repository-specific policy. Never disable branch protection, grant yourself privileges, or merge despite required reviewers.
5. Recheck latest PR HEAD and base immediately before merge; use the GitHub merge API with an expected `sha` where supported or enable **native** GitHub auto-merge only when required checks and approved reviews are enforced. The Integrator **does not enable auto-merge for arbitrary PRs**.
6. After the GitHub result, verify PR merged state, merge commit SHA and target-branch result (do not assume a successful API request means desired branch state). Record the integrator review and merge evidence in the approved work ledger without publishing PRIVATE coordination details. On API ambiguity, read current state and halt/assess before retrying. Never duplicate merges or overwrite others' work.

A completed developer task is **submitted**, not automatically merge-ready. No general integration permissions arise from the fact that the user removed a blanket ban. To merge, the integrator must have the required specific task claim and full independent evidence.

## Initial rollout

- **First 2 real chats:** keep development/claim protocol separate from integration; no integrator task is currently in the pilot-2 catalog. Both PRs remain subject to integration review.
- **Next supervised integration task:** validate one benign, nonproduction PR's exact HEAD and then perform a protected GitHub merge only with the approved Integrator task and passing gates; record a verified result. Block on unavailable tests, review or policy.
- **20 → 40 → 100 chats:** reserve an adequate fraction of agents for independent code reviews and integrators; track approved merges, review latency, blocked merge causes, HEAD drift, integration conflicts and rate limits; scale only with verified throughput.

This is **role-based conditional automation**, not permission for arbitrary agents to merge unfinished drafts. Nothing in this document claims a background scheduling service exists.
