# Fail-closed submission evidence on GitHub conflicts

This change is scoped to the **owner-operated alpha**, stacked on the offline two-agent rehearsal. It does not enable the historical public coordination branch, create a private destination, dispatch agents or authorize merges.

## Why a matching session ID is not enough

GitHub Contents API can return HTTP 409/422 when a `submissions/...` record was created after the agent's initial GET. A concurrent record bearing the same session ID and `submitted` state might still describe **a different draft PR, audited commit, scope verdict or handoff**. Treating it as a successful retry and immediately releasing the issue/resource locks would destroy the opportunity to reconcile that discrepancy.

The submission function now checks the complete **immutable evidence identity** before releasing a task:

- Task repository/issue, session, role, access and resource partition.
- Exact handoff timestamp, summary and audited HEAD SHA.
- For write tasks, the delivery PR number, audited head/base SHA, scope verdict and collision audit.

This check applies both to a marker that existed at the beginning of the attempt and to a marker discovered **after** a 409/422. The volatile `submitted_at` timestamp is intentionally excluded so an identical replay remains idempotent.

## Operator recovery

If the command raises `Submission conflict: evidence differs` or `Existing submission evidence differs`, **stop**: the original issue/resource locks are deliberately retained. On a trusted machine with an independently approved **PRIVATE** coordination ledger, inspect the actual submitted marker, original handoff, current PR HEAD/base and open competing PRs. Investigate the discrepant evidence under a maintainer-controlled procedure; never overwrite a submission, force-release an agent lock, publish ledger contents or switch to the old public ledger as a workaround.

An exact same-session/same-evidence marker created by an overlapping request may still complete its release normally. This remains a GitHub request race, not a distributed transaction or proof of code/test correctness.

## Synthetic regressions

`test/submission-conflict-evidence.test.mjs` uses an in-memory adapter to cover wrong PR, wrong audited head, wrong read-only handoff, stale pre-existing evidence and an identical-marker retry. It never contacts GitHub or accesses private credentials.

Run from a checkout of this stacked branch:

```sh
npm run check
```

A green test is necessary but **not sufficient** for real alpha activation: owner approval of a private ledger, preserved historical submissions, live issue/PR audits and supervised two-agent operation remain separate prerequisites.
