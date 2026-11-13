# Public PR check-runs audit (GET-only)

VirgoStars Orchestrator has multiple parallel stacked draft PRs. A consistent PR chain and disjoint changed paths do **not** imply that the current HEAD passed Node checks. This additional operator tool makes a **conservative observation** of public GitHub check runs **and legacy commit statuses** on explicitly selected PR HEADs.

## Windows PowerShell quickstart

From the reviewed feature-branch checkout (Node.js 20+):

```powershell
node scripts/inspect-public-pr-checks.mjs --help
node scripts/inspect-public-pr-checks.mjs 35 51
node --test test/inspect-public-pr-checks.test.mjs
```

The audit contacts **only** `api.github.com/repos/Cesare-ml/virgostars-development-orchestrator` using unauthenticated `GET` requests. Do not put a token in the command or publish private-ledger material.

## Meaning of output and exit codes

- **0**: at the sampled, stable public PR HEADs, every observed check-run completed with `success`, no ambiguous duplicate names, and the latest legacy commit status for every observed context is `success`. This **does not** establish which checks are mandatory or that the PR has been reviewed.
- **2**: at least one PR has zero observed check runs, pending runs, unsuccessful/neutral/skipped conclusions, duplicate check names, or a pending/failing/error legacy commit status. Review manually.
- **1**: invalid input, HTTP failure, incomplete/malformed pagination or a PR/check change during the double scan. Treat the whole result as incomplete, not safe.

The JSON includes only public PR numbers, aggregate counts, blocker codes and `merge_authorized:false`. It does not emit branch names, commit SHAs, raw check/status data, private task metadata or tokens. Duplicate check names may occur after reruns and must be reviewed independently; this intentionally errs on the side of caution. Legacy GitHub commit-status contexts **are** checked via the separate public `/commits/SHA/statuses` endpoint, newest-first per context. Older failed statuses superseded by a newer success for the same context do not block; other external services that use neither GitHub check runs nor commit statuses are **not** verified. Even a successful audit remains a point-in-time observation with a race after the scan.

## Boundaries and independent integration

The CLI inspects 1–12 selected public, same-repository open PRs and at most 200 check runs and 200 commit-status history records per HEAD, with two full snapshots each. Exactly 200 status records require a third empty pagination page to prove the bounded history ends; larger histories fail closed. It makes no GitHub writes, assigns no private task claims, does not inspect the old public coordination ledger and does not activate the public scheduler.

Before integration, separately check the parent/child PR topology, sibling file overlaps, independent Node 20/22 CI evidence, reviews, target-specific tests and owner approval. Do **not** automatically close, rebase or merge another agent's draft. This script is not a branch-protection policy or a deployment gate.

## Complementary Node-specific evidence

The separate [Node 20/22 CI evidence draft](../scripts/audit-public-pr-ci.mjs) checks the expected GitHub Actions job identities and SHA. This general audit intentionally treats *all* observed check runs and latest legacy commit-status contexts as advisory blockers. Use both when evaluating a stack; neither establishes branch protection, review approval, or production readiness.
