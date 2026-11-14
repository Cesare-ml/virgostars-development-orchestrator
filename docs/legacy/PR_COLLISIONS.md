# Audit overlapping open pull requests (private pilot)

**Problem:** an issue claim and one scoped resource lock serialize task work, but a second ChatGPT can still open a separate GitHub PR that edits the exact same path. On 2026-11-12, `Cesare-ml/astrological-charts` had **two open draft PRs (#27 and #28)** for task #25, both adding `tests/pilot-axis-canvas.browser.test.mjs`. Neither proposal had passed a real Chromium/Firefox browser test. These are alternatives, not two changes to merge independently.

## Read-only command

On a private authenticated checkout of branch `feat/distributed-agent-coordination-v0`, run:

```powershell
node bin/vs-agent.mjs audit-collisions Cesare-ml/astrological-charts 25
node bin/vs-agent.mjs audit-collisions Cesare-ml/astrological-functions 5
```

The command fetches the current list of **open** PRs in the target repository, reads the complete changed-file lists and compares both current and previous filenames (for renamed files) against the exact curator-approved resource roots. Checks are case-insensitive for Windows. The approved upstream PR used as a stacked branch base is excluded from conflict candidates; no changes to its branch are made.

Expected structured statuses:

| Status | Meaning | Next action |
| --- | --- | --- |
| `no-open-candidates` | No open PR touches approved resource paths | No submission PR found; investigate missing work |
| `single-candidate` | Exactly one open PR touches the approved paths | Independently run `audit-pr` and native tests |
| `conflict` | Two or more open PRs touch the same approved resource | **Do not submit or merge.** Pick and validate one implementation; close/rework the other only after an explicit maintainer decision |

The command returns exit code 2 on `conflict`, 1 on an API/error condition and 0 for a non-conflicting result. It makes GET requests only and never closes/rebases/deletes PRs.

## Mandatory local-CLI write submission gate

For `access:write` tasks, the private Node `submit --pr PR_NUMBER --confirm` now runs **both**:

1. `audit-pr`: correct stacked draft base/current upstream HEAD, all expected approved added files, no scope violations.
2. `audit-collisions`: the **only** open PR touching this resource scope must be the exact PR being submitted.

If another open PR overlaps, the CLI refuses submission and leaves the existing issue/resource locks in place for owner/maintainer reconciliation. It persists `collision_audit: "single-candidate"` with successful write submissions. The duplicate-file audit is a coordination guard, **not** a security sandbox or code quality verdict. A new PR may appear between checks and marker creation; GitHub Contents PR metadata and lock creation are not one atomic transaction.

**Connector-only ChatGPT agents:** they cannot invoke the local Node CLI unless they have a runtime. They must compare all open PR paths manually, report competing PRs, and never claim that a CLI collision check was run. A manually created submission marker remains unapproved; a maintainer must independently run this command.

## Why the two Charts PRs are not integrated

The candidate PRs #27 and #28 edit the **same** test file, with different assertion strategies. PR #22's upstream HEAD moved after their original base snapshot. Browser tests were not completed against a running Angular demo with installed `playwright-core`/Chrome/Firefox. The next gate is (a) choose one variant, (b) update the chosen stacked branch safely to the current PR #22 head **without writing on PR #22's branch**, (c) perform the actual browser tests, and (d) rerun both read-only audits. No automatic preference, close, merge or publication is performed by the orchestrator.

## Limits and validation

- Open PR inventory and file lists are bounded (200 open PRs / 200 changed files per PR); incomplete metadata and permission failures **fail closed**.
- GitHub PR lists are re-fetched after the scan to detect concurrent PR creation, closure or branch movement. This is a best-effort live snapshot, **not** a transactional fence.
- The scan includes open PRs with different base branches if they touch the same approved files. It does not consider already closed PRs.
- The upstream PR itself is excluded because it is the expected base, but `audit-pr` separately checks its current HEAD.
- The checker passed 8/8 isolated V8-source tests. The submission guard passed 6/6 isolated V8 tests using exact GitHub source functions with test harness shims. **Neither is the full Node `npm run check` suite**, which remains to be executed on an authenticated checkout.
