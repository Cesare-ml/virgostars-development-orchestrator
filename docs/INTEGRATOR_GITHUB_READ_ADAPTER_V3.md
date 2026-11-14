# Integrator authenticated GitHub read adapter — v3

**Read-only development step for [issue #152](https://github.com/Cesare-ml/virgostars-development-orchestrator/issues/152).** Stacked on draft PR #158, which depends on draft PR #154 and the owner policy proposal #137. This does not enable an automatic merge, create agent claims, modify a repository's main branch or activate the owner-only two-agent pilot.

## What this adds

`src/integrator-github-read-adapter.mjs` exports `makeIntegratorGitHubReadAdapter({token, fetchImpl})` for the **five** query methods expected by the v2 snapshot collector:

1. `getPullRequest(repo, number)`: authenticated REST GET, checks correct repo/PR identity.
2. `getPullRequestFiles(repo, number)`: all PR changed files with bounded, fail-closed REST pagination.
3. `getPullRequestReviews(repo, number)`: all GitHub reviewer decisions, with bounded REST pagination.
4. `getPullRequestCheckRuns(repo, headSha)`: complete exact-commit check-run inventory, verifies GitHub totals, IDs and per-run commit hashes.
5. `getPullRequestReviewThreads(repo, number)`: **GraphQL query** for review-thread resolution state and complete cursor pagination.

The adapter only talks to the fixed HTTPS GitHub API host, rejects redirect following, does not allow the caller to inject arbitrary paths, and preserves a memory-only token. It never serializes credentials to result objects or error messages. It uses HTTP `GET` and a GraphQL `query` POST — **no GraphQL mutation, PUT, PATCH, DELETE, or GitHub merge endpoint**.

The read-only [v2 snapshot collector](../src/integrator-live-pr-evidence.mjs) calls the adapter's five methods and rereads the PR after evidence collection. If a commit changes, data is missing or malformed, the checks are stale, the review is not valid for the current head, or pagination cannot be verified, the collector stops or reports a blocked candidate.

## Limits and security boundary

- **Authentication is not proof of owner task approval.** The adapter does not read or approve a PRIVATE task catalog, establish the integrator's independent chat identity or validate ledger locks. A future executor must perform each separately.
- The collector does **not yet** verify GitHub branch protection/rulesets, all open-PR collisions, stacked dependency graph or the current target/base branch's actual Git history. These remain explicit false/unknown gates.
- The check-run endpoint reads GitHub Checks API runs, **not arbitrary legacy Commit Statuses**. If an owner-required status is not represented as a check run, the result must remain blocked until a separately reviewed status adapter is implemented. Never infer green from a missing check.
- GitHub pagination has an intentional 200-record cap. Large PRs/review histories/check collections block rather than silently returning partial evidence.
- GitHub REST and GraphQL scopes/permissions depend on the authenticated token's access. An HTTP 403, missing reviewThreads permission or inaccessible private repo **must block**. Don't paste tokens into ChatGPT prompts, logs or issues.
- Even with a `candidate` report, `merge_authorized:false`, `merge_executed:false` and `approval_or_session_verified:false` remain unchanged. No authorized merge executor exists yet, and an agent cannot perform work asynchronously between chat turns.

## Validation

Run `node --test test/integrator-github-read-adapter.test.mjs`; mock HTTP responses cover exact-head positive evidence, paginated files, reviews, CI check-runs and GraphQL threads, unsafe/missing credentials, API errors, invalid PR/repository inputs, stale checks, duplicate IDs, misleading GitHub totals, missing cursors and record-limit stops. Existing public CI runs native checks with Node 20 and Node 22; no new GitHub Action or workflow was added.

**Do not treat passing mocked API tests as a live private-credential end-to-end proof.** A read-only owner-authorized live smoke test and future integration gate authorization will be independent tasks.
