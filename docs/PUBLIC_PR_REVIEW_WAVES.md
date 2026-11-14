# Manual dependency-first review of stacked public PRs

This **public, tokenless, GET-only** helper converts the verified output of
`inspect-pr-topology.mjs` into deterministic **human source-review waves**.
It is deliberately **not** an integration executor, dependency resolver,
branch-rebase engine, readiness gate or approval to merge.

## Windows PowerShell (Node.js 20+)

From the reviewed stacked feature branch:

```powershell
node --check scripts/plan-public-pr-review.mjs
node --test test/public-pr-review-waves.test.mjs
node scripts/inspect-pr-topology.mjs
node scripts/plan-public-pr-review.mjs
```

No credentials, owner task files, private coordination ledger, checkout writes
or GitHub mutations are involved. The commands operate on **public PR metadata**
only and do not require GitHub Actions. The standalone helper reuses the existing
bounded two-pass live inspector rather than implementing a new API client.

## Reading the output

- `dependency_review_waves`: public PR numbers grouped in parent-before-child
  order. Parent PRs appear in earlier waves, and independent proposals can appear
  in the same wave. The numbers are **review candidates**, not a suggested set
  of merges.
- `sibling_fanout_review_points`: sibling proposals that share a draft parent.
  They require independent changed-file/collision analysis; shared ancestry
  alone does **not** prove a file conflict.
- `draft_prs_requiring_independent_review`: draft count from the sampled public
  snapshot. A green synthetic CI check is not independent acceptance.
- Every result keeps `file_conflicts_evaluated`, `pr_ci_evidence_verified`,
  `private_ledger_verified`, `merge_authorized` and
  `deployment_authorized` set to **false**.

The planner refuses to produce a partial ordering if either sweep reported
stale refs, detached parents, head SHA mismatch, cycles, external refs, moving
inventory, or if the handed-off report contains inconsistent counts, parent
links, roots or branching metadata. It exits nonzero and prints only a generic
error; it does not silently mark a subset ready.

## Important limits

The two public GET sweeps are **not an atomic GitHub snapshot**. A new push, PR,
review, merge or CI rerun can invalidate the plan immediately. Re-check relevant
PR HEADs and bases, run the separate changed-file collision and exact-HEAD CI
audits, read actual reviews, resolve any competing implementations manually,
and obtain explicit owner approval before integrating anything.

This tool neither changes `main` nor activates the owner-operated private
alpha. Historic coordination records in the public repository are not a safe
new private task ledger. Real two-agent execution requires a separately reviewed
PRIVATE ledger with correct access and preserved historical submissions.
