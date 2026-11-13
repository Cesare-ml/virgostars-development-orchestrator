# Public sibling PR changed-file overlap audit

Parallel agent sessions may produce multiple **draft pull requests that target the exact same upstream branch and commit**. Even if each individual PR is scoped correctly, two sibling proposals may both change the same file. Use this **public-only, tokenless, GET-only** check before selecting an integration sequence.

## Run on Windows, macOS or Linux

From a checkout containing the proposed script, with Node.js 20+:

```powershell
node scripts/inspect-sibling-pr-overlaps.mjs 41 45 47 48
```

The numbers are illustrative open PRs; verify their current actual base branch and base SHA first. The script accepts 2–24 distinct public Orchestrator PR numbers and deliberately **requires all selected PRs to share the exact same base ref and SHA**. If one branch has moved, it refuses the comparison rather than mistakenly reporting incompatible versions as conflict-free. A stacked PR and its ancestor are *not* siblings; use the separate [stack structure gate](PR_STACK_GATE.md) for parent/child linkage.

The command independently fetches PR metadata, complete bounded changed-file pages (including both old and new paths for renames), then re-fetches every PR's metadata to reject HEAD or base drift. It compares changed-file paths case-insensitively to account for Windows checkouts.

## Report and outcomes

JSON contains `checked_pull_requests`, `pairs_compared`, `pairs_with_path_overlap`, `shared_path_references` and `pairs` showing **public PR numbers** and overlap counts. It deliberately omits branch names, changed filenames and GitHub tokens. No private project or claim data is fetched.

- Exit 0: checked sibling PRs have no overlapping changed paths at the observed stable metadata snapshot.
- Exit 2: one or more pairs change the same path; maintainer must review alternatives independently.
- Exit 1: invalid selection, different bases, API denial, broken pagination, oversized PR, malformed path or changing metadata. The result is **unknown, not clean**.

A matching filename means potential edit conflict, **not proof of a textual Git merge conflict**. Different filenames do not prove that functionality is independent, tests passed or integration is safe. A PR may move just after the final check; GitHub has no cross-PR transactional snapshot. This script cannot select the best PR, close duplicates, approve, merge, deploy or release any coordination lock. Both `merge_authorized` and `pr_selection_authorized` are always false.

The script uses only unauthenticated GET requests to the fixed **public** `Cesare-ml/virgostars-development-orchestrator` repository. If public GitHub rate limiting blocks the requests, treat the audit as inconclusive rather than providing a token in chat or public CI. The test suite uses synthetic PR metadata and a mocked HTTP adapter; no real private ledger access or orchestration dispatch occurs.
