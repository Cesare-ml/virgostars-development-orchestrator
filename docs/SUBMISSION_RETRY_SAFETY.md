# Safe submission retries after GitHub write conflicts

**Owner-operated private pilot only.** This page describes the Node submission
path on a separately approved PRIVATE coordination ledger. It does not enable
writes to the historical PUBLIC `coordination/claims` branch.

## When an interrupted submission may be retried

The CLI writes an immutable `submissions/…/issue-N.json` marker before it
releases the current owner's issue and resource locks. A network interruption
or GitHub HTTP 409/422 can leave a submission marker alongside live locks.

A retry with the **same session ID** is safe only if the existing marker
agrees with the current owner claim on all immutable evidence:

- task identity, schema, role, access, session and resource partition;
- exact saved handoff (including timestamp, summary and PR HEAD SHA);
- for write work, PR number, audited HEAD/base SHAs, scope verdict and
  collision audit evidence.

The original `submitted_at` timestamp is intentionally excluded from this
comparison: a retry occurs later, and must not rewrite the first marker.
An equivalent concurrent create is idempotent; a **different** marker, even
from the same session, stops before lock release and requires an owner review.

## Recovery checklist

1. Stop automated retries and preserve the current private coordination
   branch and record SHAs. Do not delete any submission marker or lock.
2. On a trusted local machine, inspect the task's live claim, resource lock
   and submission marker without publishing their contents.
3. Recheck the current GitHub issue and exact PR HEAD/base/scope/collision
   evidence. Investigate any handoff mutation or conflicting marker.
4. Only the owner, after reconciling the discrepancy and recording the
   resolution privately, may choose a safe recovery. Do not overwrite the
   marker or force-release another session's lock as an automatic fallback.

This comparison does **not** prove distributed atomicity, independent native
tests, human review or integration readiness. It only prevents the retry
path from treating a same-session but different stored submission as equivalent.

Regression coverage: `test/submissions.test.mjs` exercises both conflicting
and identical HTTP 422 concurrent creates, plus changed handoff after a
partially completed release. Public CI uses synthetic fixtures only.
