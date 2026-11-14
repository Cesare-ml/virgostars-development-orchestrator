# First alpha: public, tokenless smoke check

The public Orchestrator repository has a large **unmerged draft PR stack**. This test runs against a reviewed feature checkout that includes the private-pilot CLI and offline two-agent rehearsal; it is **not available on `main` yet**.

## Windows quickstart

Install Node.js 20 or 22, open PowerShell in the reviewed Orchestrator branch, and run:

```powershell
node scripts/verify-public-alpha-smoke.mjs
```

No GitHub token or private task catalog is needed. You may use the same command on macOS/Linux. The script invokes the existing `public-discover` and `rehearse-two-agents` commands with a minimal environment that strips GitHub tokens and private-ledger variables. Their outputs are checked against a fail-closed policy contract. It prints **counts and boolean flags only**, never actual task, repository, branch, claim or session records. Nonzero exit status means the public alpha smoke gate has not passed.

For focused tests:

```powershell
node --test test/public-alpha-smoke.test.mjs
```

The repository's `npm run check` also runs the new native tests under the existing read-only public Node 20/22 CI workflow. The new test requires **no** GitHub credential and does not create/update PRs, issues, claims, branches, files or ledgers.

## What passing actually establishes

- The public discovery CLI provides an owner-approval-only preview with automatic writes, deployment and merge disabled.
- The existing offline rehearsal runs two synthetic agent sessions to completion, rejects a competing PR for the same scope and recovers an interrupted submission release.
- These two output schemas agree with the smoke gate at the tested source revision.

This does **not** prove live GitHub concurrency, independently running browser sessions, private ledger migration, real PR/code validation, authenticated backend fencing, or readiness to deploy. It cannot authorize public onboarding, live task claims, a merge or a release. A separate owner-provisioned PRIVATE ledger, preserved historical submission markers, an approved local task catalog, `alpha-doctor` and supervised two-chat testing remain necessary.

## Review and operational safety

The smoke gate has a fixed two-command allowlist: no user-supplied GitHub repository, URL, token, target task or executable. It uses a subprocess environment with only platform process essentials; any CLI stderr is suppressed so private paths are not copied into public CI logs. The script cannot prevent a maliciously modified CLI from making network calls; source review and the existing unit tests are essential. Future changes to the two CLI output schemas require updating this gate and its tests in a new reviewable PR, not bypassing the assertions.
