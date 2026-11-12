# Exclusive resource partitions — private pilot v0.2

## Why two locks?

A GitHub claim for issue #10 does not stop another chat claiming issue #11 when both touch the same code. **Write tasks** now must acquire a shared **resource partition lock first**, followed by their issue claim. Read-only review tasks only require an issue claim.

Each write task currently supports **one exclusive resource partition ID**, with one or more explicitly approved path roots. Multiple independent resource locks per task are deliberately not implemented, because GitHub Contents operations are not transactional across paths.

## Curated task format

Add a task to `config/pilot-tasks.json` only after checking the selected repository's AGENTS.md, open issues, open PRs and actual branch scopes. Examples (illustrative, not eligible assignments):

```json
{
  "repository": "Cesare-ml/astrological-charts",
  "issue": 101,
  "status": "ready",
  "role": "developer",
  "access": "write",
  "resource_scope": {
    "id": "renderer-core",
    "roots": ["src/renderer/", "test/renderer/"]
  }
}
```

Use `"access":"read"` for reviewer/auditor/planner/integrator work, **without** `resource_scope`. The CLI refuses catalog entries with missing access, malformed paths, wildcard/glob paths, multiple partitions per task, or overlapping file roots assigned to **different** resource IDs in the same repository.

Two tasks that share code must declare the **same** resource ID. Tasks sharing the same ID serialize, even when their issue numbers differ. Different IDs are only safe when their authorized path roots are disjoint. This check treats path spelling case-insensitively for Windows safety. A path prefix ending in `/` covers its subtree; an exact filename covers only that file. No `../`, absolute paths or globs.

**Do not** edit the catalog's resource definitions while a task has a live claim. A curator must first inspect existing claims and reconcile scope changes. Existing locks do not get migrated automatically.

## Lock protocol

1. Validate the entire curated task catalog and target issue state. Obtain a unique chat session ID.
2. Check for an existing issue claim. If the same session owns it, verify both issue and resource ownership, then resume. If another session owns it, treat it as busy.
3. For write access, build `resources/OWNER__REPO/PARTITION.json` on the private `coordination/claims` branch and create it with GitHub's **create-only** Contents API. Existing lock held by another issue/session means **busy**, including if the resource is orphaned after an interrupted run.
4. Once the resource is held, create `claims/OWNER__REPO/issue-N.json` with the same session and declared partition. A failed issue claim rolls back a newly acquired resource only when the outcome is known and ownership is verified. **Ambiguous network failures retain the resource** for manual inspection.
5. Before each follow-up cycle, read GitHub state and check issue and resource ownership, plus the current target repository instructions. Working on a stale claim is forbidden.
6. Record a factual handoff and relevant PR/commit/test evidence. On normal release, remove the issue claim first, then remove the resource lock. If the second step fails, the resource stays blocked and the operator must reconcile it manually.

The GitHub CLI implements these operations in `src/claims.mjs` and `src/resources.mjs`. For ChatGPT agents using only the GitHub connector, **never** create only an issue claim for a write task: create and verify the resource lock first. The local CLI automates that sequencing.

## Recovery and limitations

- No automatic TTL or reclaim. A paused chat may still own the task.
- A resource file without a corresponding issue claim means **orphaned/partial acquisition**, not availability. Only the owner/maintainer may inspect the current GitHub branch, task history, PR/branch, and last handoff to authorize recovery.
- A claim file without a matching resource lock is **inconsistent**; handoff, resume and normal release are blocked until manually reconciled.
- No automatic GitHub permissions, protected-branch enforcement, cross-repository source-code write fencing, or verification that an agent edits only its declared roots. These constraints rely on trusted agents and manual PR review in the private pilot.
- The task catalog's nonoverlap check does not automatically account for removed tasks or unmerged PRs. Changing a scope while work is active can cause overlap; freeze definitions and check the ledger before changes.
- The create-only GitHub API protects **one resource key at a time**. This pilot intentionally refuses multi-partition tasks; PostgreSQL-backed atomic multi-resource leasing remains a future milestone.
- In case of a GitHub outage, permission denial, stale file SHA or unknown result, **stop** and inspect rather than deleting another agent's lock.
- The private registry, resource ledger, and private target-repository metadata must remain private. No GitHub Actions, automatic merge, production deployment or release is introduced.

## Verification completed (2026-11-12)

- A local Node.js 22 mirror of the changed modules: **26 tests passed**, including two distinct issue numbers competing for one resource, disjoint resources, known-failure rollback, orphan locks, interrupted release, and scope changes. This is not an execution of a clean remote checkout.
- GitHub real smoke test on `coordination/claims`: two simultaneous creates at `resources/Cesare-ml__astrological-charts/pilot-race-20261112.json` returned one success and one HTTP 422. The winner created a synthetic issue claim, saved a handoff, then deleted issue and resource files in order. The final Git tree confirmed both test paths absent.
- **Not yet proven:** concurrent agents really editing two different production repository modules, GitHub recovery under regional outages, catalog drift during active work, or a 40-agent load test.

Every contribution remains on a feature branch and requires independent review before merging to main.
