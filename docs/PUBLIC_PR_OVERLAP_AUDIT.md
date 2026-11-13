# Public PR overlap audit (GET-only, advisory)

Many independent ChatGPT/Codex chats can produce **simultaneous stacked draft PRs** against the same base branch. A passing CI result on each PR does not mean they can be safely combined: two changes to the same file may overwrite, conflict with, or invalidate each other.

The tool in `scripts/audit-public-pr-overlaps.mjs` inventories public PRs on the same **explicit base ref** and reports pairwise shared changed-file paths. It does **not** read the owner-only coordination ledger.

## Quickstart (Windows PowerShell, Node.js 20+)

From a reviewed checkout containing this script:

```powershell
node scripts/audit-public-pr-overlaps.mjs
node scripts/audit-public-pr-overlaps.mjs --base feat/offline-two-agent-rehearsal-20261113
```

No `GITHUB_TOKEN`, `GH_TOKEN`, approved private task queue or private repository access is required. The script contacts only GitHub's public REST endpoints for `Cesare-ml/virgostars-development-orchestrator` using `GET`.

**Exit codes:**

- `0`: complete public inventory for the selected base, no exact filename overlap observed;
- `2`: at least one overlapping PR pair observed; inspect each pair manually;
- `1`: bad inputs, network/API errors, unsafe response, excessive pagination or HEAD/base drift. Treat results as incomplete, **not safe**.

## What it verifies

- The exact GitHub repository identifies as public, not archived.
- Open PR inventory is bounded (80 total; 60 on the selected base), with up to 200 changed files per PR.
- PR HEAD SHA/base SHA/branch identity and the complete list of open PRs are compared **before and after** paginating the files. Any drift fails closed.
- File comparisons are case-insensitive (important for Windows) and account for **both names** of renamed/copied files.
- Pair identifiers and matching file paths are exposed only for **public PRs**; no private task catalog, issue claims, tokens or session IDs are read.
- Output includes `merge_authorized:false`, `git_writes:0` and a bounded display of matching pairs.

## Owner integration procedure

1. Run the public overlap audit against the actual intended stacked base.
2. For any pair, review both PRs and decide which branch/file edits are retained. Never close, merge or rewrite another agent's branch automatically.
3. Independently run the [stack continuity gate](PR_STACK_GATE.md) on the desired PR chain; it answers a **different** question about parent/base SHA continuity.
4. Re-run this overlap audit, inspect changed files and current PR heads, and check both projects' real tests and independent reviewer approval **immediately before** any manual integration decision.
5. For active private developer tasks use the separately guarded `audit-collisions`, `audit-pr`, `alpha-doctor` and actual private claims. A public file-overlap report is **not a resource lock**.

## Limits

- No authentication, write calls, coordination claims, releases, merges, deployments or private repo accesses.
- This checks **exact changed filenames**, not semantic incompatibility, renamed directory effects, dependent build behavior or overlapping authorized path partitions.
- Two PRs that touch different files may still be incompatible, and the shared path list alone cannot choose the correct implementation.
- API read consistency is checked with a second inventory pass, but the GitHub state may change immediately afterward. This is advisory evidence rather than a distributed transaction.
- It does not test 40 real chat sessions or authorize public agent onboarding.
