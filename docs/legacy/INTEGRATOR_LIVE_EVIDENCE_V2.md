# Integrator live GitHub evidence collector v2 (read-only)

This increment is **stacked on Integrator draft PR #154**, which is stacked on owner policy draft PR #137; it does **not** modify their code, perform any merge, or activate the blocked private two-agent pilot.

## Implementation

`src/integrator-live-pr-evidence.mjs` exports `collectIntegratorLivePrEvidence({api, repository, prNumber, requiredCheckNames})`. This is a **read-only** collector for an *owner-reviewed, authenticated GitHub adapter* with exactly five query methods:

- `getPullRequest(repo, number)`, called **twice**, before and after the collection.
- `getPullRequestFiles(repo, number)` returns the complete paginated PR file list.
- `getPullRequestReviews(repo, number)` returns complete reviews with GitHub `id`, `user.login`, `state`, `commit_id`, `submitted_at`.
- `getPullRequestCheckRuns(repo, headSha)` returns `{head_sha, total_count, check_runs}` with exact HEAD association, complete pagination and native statuses.
- `getPullRequestReviewThreads(repo, number)` returns `{complete:true,total_count,threads:[{isResolved}]}` with no truncated pages.

**A concrete authenticated adapter remains future work.** The existing GitHub `src/github.mjs` client does not implement all five methods. A connector-only ChatGPT chat cannot run this Node module by merely opening GitHub; it can apply the same checks through its connector, with all the same completeness limitations. The test API is synthetic and must never be treated as authenticated evidence.

## Fail-closed properties

- Missing methods, malformed repository identifiers, missing owner-required check names, truncated inventories or GitHub errors **block**; no permissive fallback.
- A changed PR head/base/branch/status/changed-file count between initial and final GETs **blocks hard**.
- Exact HEAD association required for checks and reviews. Missing, stale, cancelled, failed or multiple named CI check-runs block.
- A requested change after an approval from the same GitHub reviewer blocks; no author self-review counts as an independent approval. Review threads must be fully enumerated and resolved.
- Unexpected duplicate/unsafe changed paths and workflow, license, environment, credentials, migrations or deploy changes block automatic integration pending separate owner review.
- Positive result is **`candidate`**, never permission: all outputs have `merge_authorized:false`, `merge_executed:false`, `approval_or_session_verified:false`, `branch_protection_verified:false`, `cross_pr_collisions_verified:false`, `dependencies_verified:false`.

This collector does not validate a private task manifest, prove independent ChatGPT session identity, authenticate the injected adapter, enforce branch rules, resolve stacked PR dependencies or acquire the exclusive integrator claim. It **cannot** safely call the merge API. A future executor must independently verify all such gates, use a SHA-pinned merge request, and recheck the resulting GitHub state.

## Validation and integration

`node --test test/integrator-live-pr-evidence.test.mjs` covers 23 native cases for a candidate, missing/failed/stale checks, changes requested, author self-review, unresolved discussion, sensitive paths, PR HEAD/base movement, truncated lists, missing credentials/adapter methods and denied GitHub reads.

This document is not a native test receipt or authorization to merge. The parent repo's unchanged `npm test` discovers the new suite automatically; use the PR's existing public Node 20/22 test-only GitHub Actions to confirm the exact committed HEAD.

The first two ChatGPT pilot task records are still `proposed` and `owner_approved:false`. All old private `coordination/claims` records stay untouched.
