# Integrator: full open-PR changed-file collision preflight

**New read-only Integrator gate for issue #152.** This feature is stacked on draft #167 → #166 → #163 → #158 → #154 → proposed policy #137. It does not enable automatic merges or authorize any private pilot task.

## Why this matters

Passing CI and reviewing a single PR does not rule out **another open PR editing the same file**. A particularly subtle case is a rename: a competing PR may rename `src/old.mjs` to `docs/new.mjs` while an Integrator is about to merge changes to `src/old.mjs`. Checking only current new filenames would miss this collision.

`src/integrator-open-pr-collision-preflight.mjs` exports `auditIntegratorOpenPrCollisions({token,fetchImpl,repository,prNumber,expectedHeadSha})`. It uses the existing authenticated read-only `src/github.mjs::makeGitHubClient`, which already includes bounded GitHub REST pagination for open PR lists and complete changed-file arrays. The new audit:

1. Fetches the **complete open PR inventory** and pins each PR's number, head/base SHAs, branch names and repository identity. The target must be present.
2. Reads each PR's complete live metadata and changed-file list. Any inaccessible, oversized, unsafe, malformed, case-duplicate or missing data **stops** the audit. It compares each detail against the initial listing to detect changed PR heads/bases.
3. Builds case-folded path sets from both `filename` **and** `previous_filename` using the shared Integrator changed-file safety classifier. For every other open PR, detects intersections with the target PR's old/new paths.
4. Re-fetches and compares the **entire open PR inventory** and the target PR metadata. Any new/removed PR, head/base SHA movement or incomplete pagination **stops** the audit.
5. Returns a nonauthorizing `candidate` only if there are zero discovered collisions. Any overlap returns `blocked` with PR numbers and conflicting paths.

The audit intentionally includes draft PRs and parent dependency PRs in the competition check; dependencies with overlapping files must be independently integrated/reconciled rather than assumed safe. It caps the live scan at 200 open PRs and 200 changed files per PR, matching the older owner pilot limits, and checks evidence sequentially to avoid excessive concurrent GitHub calls.

## Security and operational limitations

- This is an **instantaneous best-effort GitHub snapshot**, not a distributed atomic transaction. A new PR could open just after the final read. A real Integrator needs an exclusive approved merge-resource claim, fresh exact-HEAD revalidation, GitHub branch rules and independent approval immediately before any SHA-pinned merge operation.
- The task/owner manifest, identity permissions, independent reviewer, required CI checks and stacked dependency graph are **not validated by this function**. They remain blockers in the overall Integrator pipeline.
- A caller must provide an authorized token in its protected environment; no token is published, logged, returned or required in a ChatGPT prompt. Connector-only chat agents can perform equivalent GitHub read checks with their connection, but this Node module is not executed by the connector itself.
- No writes, GitHub Actions, merge, deployment or `coordination/claims` changes are present. Every result sets `merge_authorized:false` and `merge_executed:false`.

## Validation

Native `node --test test/integrator-open-pr-collision-preflight.test.mjs` covers disjoint paths, identical paths, rename-source and rename-destination overlap, case folding, 101-PR pagination, >200 safety limits, incomplete/malformed PR files, race-drift in PR heads and inventory, 403 errors and invalid task scope. Full repository native checks should run under existing public Node 20/22 CI on the exact PR HEAD.

The initial two ChatGPT developer tasks in the private catalog are still `owner_approved:false`. This new read-only check cannot activate them or assign Integrator tasks.
