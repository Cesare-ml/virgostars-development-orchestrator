# Integrator branch protection and merged dependency preflight

This is a **read-only** next step for [Integrator issue #152](https://github.com/Cesare-ml/virgostars-development-orchestrator/issues/152), stacked on draft PR #166 (itself stacked on #163, #158, #154 and policy #137). It does **not** activate the two-chat private pilot, authorize task claims, run a merge, modify rulesets or add GitHub Actions.

## Security problem and real GitHub observation

GitHub's branch-protection REST endpoint requires applicable permissions. During the read-only test on the public Orchestrator repository's `main` branch, the current GitHub connector returned **HTTP 403 Resource not accessible by integration** from `GET /repos/{owner}/{repo}/branches/main/protection`. This result is **not proof that the branch is unprotected**. It is an unverified prerequisite and must block Integrator merge authorization. The separate REST `GET /repos/{repo}/rulesets` returned an empty listing; that does not establish an independently verified effective ruleset set or replace branch protection evidence.

The PR being tested was still a draft, and the live Integrator stack has open dependencies; the test must not consider a green Node CI job alone to make it mergeable.

## Implementation

`src/integrator-protected-dependency-preflight.mjs` exports the asynchronous `inspectIntegratorProtectedDependencyPreflight({token,fetchImpl,repository,prNumber,expectedHeadSha,targetBranch,dependencies})` function. It reads ONLY these fixed-scope GitHub REST endpoints:

- `GET /repos/{repo}/pulls/{pr}` twice (before and after checks), requiring the same PR identity, head SHA, base SHA, state and branch refs.
- `GET /repos/{repo}` for the effective repository default branch; the initial policy supports default-branch integrations only.
- `GET /repos/{repo}/branches/{branch}` twice, verifying that the target tip does not move during assessment and is reported protected.
- `GET /repos/{repo}/branches/{branch}/protection` to check that the connector can actually read required PR approvals, required status-check names and strictness, conversation-resolution and admin enforcement. Inaccessible or absent evidence blocks.
- For each explicitly declared approved dependency PR: `GET /repos/{repo}/pulls/{dependency}` and `GET /repos/{repo}/compare/{merge_commit_sha}...{target_tip_sha}`; a dependency must be merged **into the chosen target branch**, and its merge commit must be an ancestor of the currently inspected branch tip.

The method uses a fixed HTTPS API host and only GET calls, rejects redirects, validates URL parameters, limits dependencies, sanitizes errors so tokens aren't printed, and conservatively refuses incomplete or contradictory data. A valid result is **only** `verdict:candidate`, always `merge_authorized:false` and `merge_executed:false`.

## Still NOT independently verified

- GitHub repository/organization rulesets and possible bypass actors, even when the legacy branch-protection API succeeds.
- Whether each required CI check actually passed on the approved current PR HEAD; use the earlier Integrator evidence collector and authenticated adapter as additional gates.
- Independent GitHub/ChatGPT reviewer identity, owner-approved PRIVATE catalog, exclusive Integrator resource lock and proof of developer/Integrator role separation.
- All competing PR changed paths and the complete transitive stacked dependency graph, as well as push/rebase races between the read-only check and an eventual merge operation.
- Actual merge executor with `expected_head_sha` and subsequent merge state verification.

Any of the above remains a hard blocker for a real automatic merge until an independent approved implementation verifies it. This module **must not** be used as a green light to call GitHub's merge API.

## Test plan

`node --test test/integrator-protected-dependency-preflight.test.mjs` tests synthetic positive evidence, merged dependency ancestry, draft/head drift, branch protection denied (403), 404, absent required approvals, no required CI, stale branch tips, misrouted dependencies, invalid inputs and token-safe error reporting. The unchanged public repository CI runs native checks with Node 20 and Node 22 on the exact commit HEAD. Synthetic tests are not an authenticated live merge attempt.

The owner-private pilot manifest remains **`owner_approved:false`** and no Integrator task has been assigned. No local PC installation or downloads are required to review this public draft PR.
