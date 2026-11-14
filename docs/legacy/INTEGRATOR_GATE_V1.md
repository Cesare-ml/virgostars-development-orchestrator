# Integrator merge gate v1 — read-only preliminary evaluator

Part of [issue #152](https://github.com/Cesare-ml/virgostars-development-orchestrator/issues/152). The owner permits **conditional** automatic merges by a separately approved Integrator agent, after independent verification and repository protection checks.

`src/chatgpt-integrator-merge-gate-v1.mjs` exports `inspectIntegratorMergeGate(evidence)`, a **pure, synchronous, read-only** function. It accepts normalized, independently fetched GitHub evidence and rejects incomplete or inconsistent snapshots. It never talks to GitHub, creates or releases claims, approves code, executes a merge, or enables GitHub auto-merge.

An `eligible` outcome is called `candidate`, not `approved`. Even when every input is positive, the report contains `merge_authorized:false`, `merge_executed:false`, and `requires_fresh_remote_checks:true`. A future authorized executor must hold the verified private Integrator claim, re-fetch live branch/rule/review/check state at the exact PR HEAD and pass `expected_head_sha` into GitHub's merge API before any write.

## Evaluated conditions

- Exact owner-approved manifest SHA, task role `integrator`, explicit PR and merge method, independent Integrator/author chat session.
- PR is an open, non-draft, non-merged, mergeable request against the approved repository and base branch with the exact expected HEAD SHA.
- Authenticated GitHub branch rules/checks/reviews agree with the exact HEAD, and at least one named required test check is truly successful.
- Complete PR file inventory, without duplicate paths or sensitive paths (workflow, env, secrets, migrations, deploy, license) that require owner escalation.
- Stacked dependencies already merged with verifiable merge SHAs, zero overlapping open-PR conflicts, and no unresolved GitHub review threads.

The `owner_reviewed`, `independent_identity_verified`, `required_rules_satisfied` and `independence_verified` booleans are only normalized *external* evidence. This helper **cannot authenticate those assertions**. A future integrator connector adapter must derive them from owner-approved PRIVATE catalog/ledger and GitHub rather than allowing untrusted task descriptions to set them. No task catalog upgrade, merge executor or CLI integration is included yet.

## Test strategy

`node --test test/chatgpt-integrator-merge-gate-v1.test.mjs` exercises a valid read-only candidate, missing approval, self-integration, HEAD drift, draft status, missing/failed/stale checks, stale reviews, sensitive files, incomplete inventories, stacked dependencies, conflicts and unresolved threads. The existing `npm test` should discover the new test file; use exact-head public **test-only** GitHub Actions if available. No new GitHub workflows or private token are required. Native repository tests and future actual merge verification are separate milestones.

## Current status

- Implementation: a read-only standalone validator awaiting review on a draft stacked PR.
- Actual GitHub merge executor: **not implemented**.
- Public `main` policy: still unchanged until independently reviewed and merged.
- First two-developer ChatGPT pilot: not yet owner-approved; this module does not authorize its claims or change its prompt.
