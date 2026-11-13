# Public PR Node CI evidence audit (read-only)

Use this **optional maintainer diagnostic** on the public VirgoStars Development Orchestrator repository when reviewing parallel draft PRs. It answers one deliberately narrow question: did the **current** PR HEAD have *both* GitHub Actions `Node 20 · tests` and `Node 22 · tests` checks completed successfully at the sampled commit?

## Run on Windows / Node.js 20+

From a checkout containing this script:

```powershell
node scripts/audit-public-pr-ci.mjs 35
node scripts/audit-public-pr-ci.mjs 35 40 44
node --test test/audit-public-pr-ci.test.mjs
```

It uses unauthenticated **GET-only** requests to the public GitHub REST API. No token, local config, private repository, private task queue or coordination ledger is read. Maximum eight explicitly numbered PRs per invocation to limit unauthenticated API traffic. No GitHub write, merge, deployment, CI trigger or task claim is performed.

Output reports only public PR numbers, per-version evidence states and blocker codes. It deliberately omits commit SHAs, branch names, file paths, test logs, session IDs and any private project data.

- Exit `0`: both named checks succeeded at every sampled PR HEAD and no HEAD/base drift was observed **within the audit window**. Not an integration recommendation.
- Exit `2`: one or more checks are missing, pending, unsuccessful, untrusted, SHA-mismatched or ambiguous. Independent review required.
- Exit `1`: input, GitHub API, repository scope, pagination, malformed evidence, PR HEAD/base drift **or check-run status/inventory drift** prevented a complete reliable audit. Treat as unknown, not green.

## Trust boundary and limits

This gate validates the named CI check-run *metadata*, not the test suite contents, coverage, required branch protection, workflow identity or other third-party status checks. It does not verify the PR dependency stack, changed-file overlap, target app behavior, independent review or deployment readiness. Use the separate stack and changed-path audits where applicable. The auditor re-fetches **every check-run page twice**, with PR HEAD/base inspections before, between and after the passes. A change to any check-run ID, status, conclusion, app, name or commit SHA fails closed. Pagination ordering alone does not invalidate identical evidence. Results can still become stale immediately after the final PR read; this is not an atomic GitHub transaction. Repeated polling can exhaust unauthenticated GitHub API rate limits. Reruns can yield multiple identically named check runs; ambiguity deliberately blocks until manually reconciled.

**Never interpret exit `0` as `merge_authorized` or permission to bypass the owner-approved private-ledger migration.** This script is safe to execute on the *public* repository; it must not start the historical public coordination claims protocol. No GitHub Actions workflow is added or modified by this feature.
