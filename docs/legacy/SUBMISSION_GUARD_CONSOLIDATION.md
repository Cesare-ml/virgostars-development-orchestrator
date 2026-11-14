# Submission guards — reviewed consolidation candidate

This draft consolidates two overlapping *unmerged* fixes: [#41](https://github.com/Cesare-ml/virgostars-development-orchestrator/pull/41) (PR snapshot drift) and [#48](https://github.com/Cesare-ml/virgostars-development-orchestrator/pull/48) (immutable submission evidence). It is based on the same pinned [#35](https://github.com/Cesare-ml/virgostars-development-orchestrator/pull/35) branch. This candidate does **not** supersede either original PR without an independent human comparison and integration decision.

## What must remain true

1. Before a developer's write submission, the scoped PR audit and resource collision audit must refer to **exactly the same delivery HEAD SHA, base SHA and base branch**. A mismatch means a possible push/rebase between GET requests. Abort **before** creating any submission record or releasing locks.
2. If a submission marker already exists, compare its immutable task ownership, role, access, resource partition, handoff and, for write tasks, audited PR evidence to the record we would write. **The timestamp alone may differ**. Same session alone is not proof of equivalence.
3. If GitHub returns 409/422 on marker creation, re-fetch and compare the same immutable evidence before releasing anything. A mismatched marker requires explicit owner reconciliation.
4. An interrupted release with an equivalent marker remains retryable by the same current owner. A conflict retains active claim/resource locks; it never silently selects another PR.

## Validation

- Run `npm run check` on Node.js 20 or 22 from a reviewed checkout of the exact candidate commit. Existing submission regression tests, the three added read-task evidence cases and seven write-task drift/race cases are included.
- Compare **all** source and test changes against #41 and #48. This proposal intentionally omits their broad `docs/ROADMAP.md` and `AGENTS.md` edits to avoid independent agent collisions.
- Independently review the alternative same-session fixes in #45 and #47, and orphaned resource cleanup in #49/#50. They are **not** included in this draft.

## Safety boundary

This repository is public, while any actual issue/resource claims, migrations and new live multi-agent sessions require an owner-approved **PRIVATE** ledger. Tests use synthetic in-memory GitHub responses. No private token or task record should appear in this PR or CI. Even if checks pass, no merge, deploy, private cutover, submitted-task release, public agent enrollment or implicit completion is authorized.

Because GitHub's separate GETs cannot supply a durable distributed transaction, a subsequent push after both audits remains possible; release approval is still a manual review step. This mitigation narrows a known race but does not prove atomicity.
