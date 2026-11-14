# Open fleet: read-only GitHub merge evidence (P0 #175)

This is the incremental safety work in draft PR #180. It **does not** activate
automatic merging, change the agent owner policy or execute a GitHub write
outside the draft source branch and test-only claim.

## Runtime flow

The GET-only `src/agent-github.mjs` snapshot builder reads public PR
metadata and discovers `AGENT-REVIEW` markers. A marker is **only a reason
to inspect**, not an approval. For such candidates it calls
`collectFleetMergeEvidence()` from
`src/agent-merge-evidence.mjs` **only when a locally configured GitHub
credential is present**.

The collector reads the complete REST PR file, review and comment pages and
all check runs on the exact head, capped at 200 each. It checks unique
identifiers, changed-file counts and same PR head/base/status/mergeability
before and after the scan. A missing permission, duplicate, truncated page,
inconsistent review/commit identity or moved PR blocks. The fleet dashboard
can still render other tasks; it records a nonauthorizing `evidence.kind`
on failed candidate reads.

The pure `mergeGate()` also checks native GitHub APPROVED reviews at the
current head, authentic comment/review GitHub principal IDs (not just
self-reported text), SHA and base identity, changed file provenance, known
mergeability and required CI state. `nextWork()` and `fleetBoard()` use
that same gate; they cannot promote a partially collected candidate.

## Unresolved authorization gates

A valid token proves an authenticated transport, **not** that a ChatGPT
session belongs to the GitHub account shown in a comment. A same-account
review from two alleged session IDs is not independent. Likewise, all-green
check runs are not evidence of **required**, source-pinned GitHub checks.

Until owner-reviewed infrastructure provides trustworthy evidence of:
- independent session-to-GitHub-principal association;
- applicable protection/ruleset requirements on the actual target branch;
- complete and current owner-required check-run identities and GitHub App IDs;

the collector **always** emits
`session_principal_binding_verified:false`,
`branch_protection_verified:false` and
`required_head_checks_verified:false`. The merger therefore blocks even
when the individual read-only GitHub API calls succeed.

Do **not** flip those flags based on PR description, AGENT-REVIEW comment,
a synthetic fixture, a status label or mere possession of a GitHub token.
There is no operationally approved merge executor in this patch. Maintainers
should review this change independently before integration.

## Test limits

`test/agent-merge-evidence.test.mjs` covers authenticated synthetic reads,
101-record pagination, duplicate review IDs, changed-file truncation,
current-head drift, failed/stale CI and anonymous/denied access. These tests
do not certify GitHub's live REST behavior, ruleset authorization, or
cross-request atomicity. A future adapter must revalidate all evidence at
the exact merge HEAD and abort if any provenance cannot be established.

The private historical `coordination/claims` ledger is untouched. New
coordination remains on the explicitly registered `agent-ledger` branch.
